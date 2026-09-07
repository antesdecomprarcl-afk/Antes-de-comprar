#!/usr/bin/env node
// Verificador diario.
//
// Recorre el catalogo, le pregunta a Mercado Libre precio, stock y estado de
// cada publicacion, y deja tres cosas escritas:
//
//   data/estado.json      lo que sabemos hoy de cada producto
//   data/historial.jsonl  una observacion de precio por producto por dia
//   data/categorias.json  cache de nombres de categoria de Mercado Libre
//
// Sobre esos tres archivos el generador decide que se publica. Un producto que
// no se pudo verificar NO se borra: se le anota el fallo y, si acumula varios
// dias sin confirmar, deja de aparecer en el sitio. Preferimos publicar menos
// ofertas que publicar una que ya no existe.
//
//   node src/verificar.mjs                    verifica lo mas desactualizado
//   node src/verificar.mjs --limite 200       corta despues de 200 productos
//   node src/verificar.mjs --solo-fichas      solo las fichas destacadas
//   node src/verificar.mjs --todo             fuerza el catalogo completo
//   node src/verificar.mjs --diagnostico      prueba que caminos funcionan hoy
//   node src/verificar.mjs --dry-run          no escribe nada

import { leerJson, escribirJson, hoy, diasEntre, enParalelo, dormir } from './lib/util.mjs';
import { crearCliente, extraerId, urlItem } from './lib/meli.mjs';
import { leerHistorial, escribirHistorial } from './lib/historial.mjs';
import { registrarPrecio, CFG } from './lib/ofertas.mjs';

const args = process.argv.slice(2);
const bandera = (n) => args.includes(n);
const valor = (n, def) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};

const DRY = bandera('--dry-run');
const FECHA = hoy();
const cfg = leerJson('data/config.json');
const vcfg = { limiteDiario: 400, concurrencia: 4, pausaMs: 250, maxFallos: 3, diasParaCaducar: 5, ...(cfg.verificacion || {}) };
const LIMITE = valor('--limite', bandera('--todo') ? Infinity : vcfg.limiteDiario);
const CONCURRENCIA = valor('--concurrencia', vcfg.concurrencia);

const cliente = crearCliente({
  token: process.env.MELI_ACCESS_TOKEN || null,
  clientId: process.env.MELI_CLIENT_ID || null,
  clientSecret: process.env.MELI_CLIENT_SECRET || null,
  refreshToken: process.env.MELI_REFRESH_TOKEN || null,
  sitio: (cfg.pais || 'CL').toLowerCase(),
  log: (m) => console.log(`  · ${m}`),
});

/* ---------- diagnostico ---------- */

if (bandera('--diagnostico')) {
  const catalogo = leerJson('data/catalogo.json', []);
  const muestra = catalogo[0];
  if (!muestra) { console.log('El catalogo esta vacio.'); process.exit(0); }
  console.log(`\nProbando los tres caminos con: ${muestra.titulo.slice(0, 60)}\n`);

  const pruebas = [
    ['API (multiget)', () => cliente.porApi([muestra.id]).then((m) => (m ? m.get(muestra.id) : null))],
    ['Pagina publica', () => cliente.porPagina(muestra.id)],
    ['Link corto -> ID', () => cliente.resolverCorto(muestra.link)],
  ];
  for (const [nombre, fn] of pruebas) {
    const t0 = Date.now();
    try {
      const r = await fn();
      const ms = Date.now() - t0;
      if (!r || r.error) console.log(`  ✗ ${nombre.padEnd(18)} ${(r && r.error) || 'sin respuesta'} (${ms} ms)`);
      else console.log(`  ✓ ${nombre.padEnd(18)} ${JSON.stringify(r).slice(0, 130)} (${ms} ms)`);
    } catch (err) {
      console.log(`  ✗ ${nombre.padEnd(18)} ${err.message}`);
    }
  }
  console.log(`\nURL de ficha que se usaria: ${urlItem(muestra.id, (cfg.pais || 'CL').toLowerCase())}\n`);
  process.exit(0);
}

/* ---------- que verificamos hoy ---------- */

const catalogo = leerJson('data/catalogo.json', []);
const productos = leerJson('data/productos.json', []);
const estado = leerJson('data/estado.json', {});
const categorias = leerJson('data/categorias.json', {});
const historial = leerHistorial();

// Las fichas destacadas se verifican siempre: son las que llevan opinion
// nuestra y las que mas se comparten.
const idsFicha = new Set(productos.map((p) => p.mlId).filter(Boolean));

// El resto entra por rotacion, empezando por lo mas desactualizado. Asi, aunque
// un dia se corte a la mitad, al siguiente sigue por donde iba.
const porAntiguedad = (a, b) => {
  const fa = estado[a.id]?.verificado || '';
  const fb = estado[b.id]?.verificado || '';
  return fa < fb ? -1 : fa > fb ? 1 : 0;
};

let cola;
if (bandera('--solo-fichas')) {
  cola = catalogo.filter((c) => c.id && idsFicha.has(c.id));
} else {
  const conId = catalogo.filter((c) => c.id);
  const fichas = conId.filter((c) => idsFicha.has(c.id));
  const resto = conId.filter((c) => !idsFicha.has(c.id)).sort(porAntiguedad);
  cola = [...fichas, ...resto].slice(0, LIMITE);
}

console.log(`\nVerificando ${cola.length} de ${catalogo.length} productos · ${FECHA}`);
console.log(`  autenticacion: ${process.env.MELI_ACCESS_TOKEN ? 'token' : process.env.MELI_REFRESH_TOKEN ? 'refresh token' : 'sin token (API publica y pagina)'}`);

/* ---------- IDs faltantes ---------- */

// Un producto puede llegar sin ID de Mercado Libre: importado del hub, o
// agregado a mano con solo el link corto. Sin ID no se puede verificar, asi que
// seguimos el link una vez y lo dejamos guardado para no repetirlo nunca mas.
const fichasSinId = productos.filter((p) => !p.mlId && p.linkAfiliado);
const catalogoSinId = catalogo.filter((c) => !c.id && c.link);

if (fichasSinId.length || catalogoSinId.length) {
  const total = fichasSinId.length + catalogoSinId.length;
  console.log(`\nResolviendo ${total} link(s) sin ID de Mercado Libre...`);
  let resueltos = 0;

  for (const p of fichasSinId) {
    const r = await cliente.resolverCorto(p.linkAfiliado);
    if (r.id) { p.mlId = r.id; resueltos++; console.log(`  ✓ ficha ${p.slug} -> ${r.id}`); }
    else console.log(`  ✗ ficha ${p.slug}: ${r.error || 'no pude extraer el ID'}`);
    await dormir(vcfg.pausaMs);
  }

  // El catalogo puede traer cientos sin ID despues de una importacion grande:
  // se resuelven de a tandas para no pasarse del tiempo del workflow. Los que
  // queden siguen en la proxima corrida.
  for (const c of catalogoSinId.slice(0, vcfg.maxResolucionesPorCorrida ?? 150)) {
    const r = await cliente.resolverCorto(c.link);
    if (r.id) { c.id = r.id; resueltos++; }
    await dormir(vcfg.pausaMs);
  }

  const pendientes = catalogoSinId.length - Math.min(catalogoSinId.length, vcfg.maxResolucionesPorCorrida ?? 150);
  console.log(`  ${resueltos} de ${total} resuelto(s)${pendientes ? `; quedan ${pendientes} para la proxima corrida` : ''}`);

  if (!DRY) {
    if (fichasSinId.length) escribirJson('data/productos.json', productos);
    if (catalogoSinId.length) escribirJson('data/catalogo.json', catalogo);
  }
}

/* ---------- consulta ---------- */

const permalinks = {};
for (const [id, e] of Object.entries(estado)) if (e.permalink) permalinks[id] = e.permalink;

const LOTE = 20 * CONCURRENCIA;
const resultados = new Map();
for (let i = 0; i < cola.length; i += LOTE) {
  const tanda = cola.slice(i, i + LOTE);
  const grupos = [];
  for (let j = 0; j < tanda.length; j += 20) grupos.push(tanda.slice(j, j + 20).map((c) => c.id));
  const mapas = await enParalelo(grupos, CONCURRENCIA, (ids) => cliente.consultar(ids, { permalinks }));
  for (const m of mapas) for (const [k, v] of m) resultados.set(k, v);
  process.stdout.write(`\r  ${Math.min(i + LOTE, cola.length)}/${cola.length}`);
  await dormir(vcfg.pausaMs);
}
process.stdout.write('\n');

/* ---------- actualizacion del estado ---------- */

let ok = 0, fallos = 0, caidos = 0, cambios = 0, nuevasCat = 0;
const porFuente = {};

for (const item of cola) {
  const r = resultados.get(item.id);
  const previo = estado[item.id] || {};

  if (!r || r.error || !r.precio) {
    fallos++;
    estado[item.id] = {
      ...previo,
      id: item.id,
      fallos: (previo.fallos || 0) + 1,
      ultimoError: (r && r.error) || 'sin precio',
      intentado: FECHA,
    };
    continue;
  }

  ok++;
  porFuente[r.fuente] = (porFuente[r.fuente] || 0) + 1;

  const vivo = r.estado === 'active' && (r.stock === null || r.stock > 0) && !r.subEstado.includes('deleted');
  if (!vivo) caidos++;
  if (previo.precio && previo.precio !== r.precio) cambios++;

  historial.set(item.id, registrarPrecio(historial.get(item.id) || [], FECHA, r.precio, CFG));

  estado[item.id] = {
    id: item.id,
    verificado: FECHA,
    precio: r.precio,
    precioLista: r.precioLista,
    disponible: vivo,
    estadoMl: r.estado,
    stock: r.stock,
    vendidos: r.vendidos,
    titulo: r.titulo || previo.titulo || item.titulo,
    imagen: r.imagen || previo.imagen || null,
    permalink: r.permalink || previo.permalink || null,
    categoriaId: r.categoriaId || previo.categoriaId || null,
    fuente: r.fuente,
    fallos: 0,
  };
}

// Nombres de categoria: una consulta por categoria nueva, cacheada para siempre.
const catsNuevas = [...new Set(Object.values(estado).map((e) => e.categoriaId).filter((c) => c && !categorias[c]))];
if (catsNuevas.length) {
  console.log(`\nResolviendo ${catsNuevas.length} categoria(s) nueva(s) de Mercado Libre...`);
  await enParalelo(catsNuevas.slice(0, 60), CONCURRENCIA, async (c) => {
    const n = await cliente.nombreCategoria(c);
    if (n) { categorias[c] = n; nuevasCat++; }
  });
}

/* ---------- salida ---------- */

const caducados = Object.values(estado).filter(
  (e) => (e.fallos || 0) >= vcfg.maxFallos || (e.verificado && diasEntre(e.verificado, FECHA) > vcfg.diasParaCaducar)
).length;

if (!DRY) {
  escribirJson('data/estado.json', estado);
  escribirJson('data/categorias.json', categorias);
  escribirHistorial(historial);
}

console.log(`
Resultado del ${FECHA}${DRY ? ' (dry-run: no se escribio nada)' : ''}
  verificados      ${ok}
  no verificados   ${fallos}
  sin stock/pausa  ${caidos}
  cambio de precio ${cambios}
  fuera del sitio  ${caducados}   (sin confirmar hace mas de ${vcfg.diasParaCaducar} dias o ${vcfg.maxFallos} fallos)
  categorias ML    +${nuevasCat}
  fuentes          ${Object.entries(porFuente).map(([k, v]) => `${k}=${v}`).join(' ') || '-'}
`);

if (ok === 0 && cola.length > 0) {
  console.error('Ningun producto pudo verificarse. Reviso el diagnostico antes de dar por bueno el dia:');
  console.error('  node src/verificar.mjs --diagnostico');
  process.exit(1);
}
