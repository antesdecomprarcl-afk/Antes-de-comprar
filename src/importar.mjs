#!/usr/bin/env node
// Importa productos del hub de afiliados al catalogo.
//
//   node src/importar.mjs <archivo> [--dry-run]
//
// Acepta lo que le tires: el JSON que baja el capturador del hub, un JSON ya
// normalizado, JSONL, o un CSV con encabezado. Detecta la forma sola.
//
// Regla que no se negocia: **el slug de un producto que ya existe nunca cambia**.
// El slug es la URL publica (/ir/<slug>) que ya esta pegada en videos, historias
// y comentarios. Si el titulo del producto cambia en Mercado Libre, actualizamos
// el titulo pero mantenemos el slug: romper un link ya compartido es perder
// ventas que ya estaban pagadas con trabajo hecho.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, leerJson, escribirJson, hoy } from './lib/util.mjs';
import { categoriaDe, hacerSlug } from './lib/categoria.mjs';
import { extraerId } from './lib/meli.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const iCat = args.indexOf('--catalogo');
const RUTA_CATALOGO = iCat >= 0 && args[iCat + 1] ? args[iCat + 1] : 'data/catalogo.json';
// El valor que sigue a --catalogo es una ruta de destino, no el archivo de
// entrada. Sin esa bandera no hay indice que saltear (iCat vale -1).
const iValorCatalogo = iCat >= 0 ? iCat + 1 : -1;
const archivo = args.filter((a, i) => !a.startsWith('--') && i !== iValorCatalogo)[0];

if (!archivo) {
  console.error(`
Uso: node src/importar.mjs <archivo> [--dry-run]

  <archivo>   JSON, JSONL o CSV con los productos del hub de afiliados.
              Para sacarlo del hub: mira herramientas/capturar-hub.js

  --dry-run   Muestra que haria sin escribir nada.
  --catalogo  Otro catalogo de destino (por defecto data/catalogo.json).
`);
  process.exit(1);
}

/* ---------- lectura: acepta JSON, JSONL o CSV ---------- */

function separarCsv(linea) {
  // CSV con comillas: "a,b",c  ->  ['a,b', 'c']
  const campos = [];
  let actual = '', enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else enComillas = !enComillas;
    } else if (c === ',' && !enComillas) { campos.push(actual); actual = ''; }
    else actual += c;
  }
  campos.push(actual);
  return campos.map((s) => s.trim());
}

function leerRegistros(ruta) {
  const texto = fs.readFileSync(ruta, 'utf8').trim();
  if (!texto) return [];

  if (texto.startsWith('[') || texto.startsWith('{')) {
    const json = JSON.parse(texto);
    // Algunos volcados vienen envueltos: { productos: [...] } o { results: [...] }
    if (Array.isArray(json)) return json;
    for (const clave of ['productos', 'items', 'results', 'data', 'ofertas']) {
      if (Array.isArray(json[clave])) return json[clave];
    }
    return [json];
  }

  // JSONL: una linea, un producto.
  if (texto.startsWith('{')) {
    return texto.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  // CSV con encabezado.
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const cols = separarCsv(lineas[0]);
  return lineas.slice(1).map((l) => Object.fromEntries(separarCsv(l).map((v, i) => [cols[i], v])));
}

/* ---------- normalizacion: mapea cualquier nombre de campo al nuestro ---------- */

const primero = (obj, nombres) => {
  for (const n of nombres) {
    if (obj[n] !== undefined && obj[n] !== null && obj[n] !== '') return obj[n];
  }
  return null;
};

const aNumero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  // "$ 12.990" y "12990.00" tienen que dar lo mismo.
  const limpio = String(v).replace(/[^\d,.-]/g, '');
  const n = Number(limpio.includes(',') && !limpio.includes('.') ? limpio.replace(',', '.') : limpio.replace(/\.(?=\d{3}\b)/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

function normalizar(r) {
  // La forma compacta del artefacto Bodega de Links.
  if (r.t && r.l && r.c !== undefined) {
    return { id: r.id || extraerId(r.l), titulo: String(r.t).trim(), comision: Number(r.c) || 0,
      link: r.l, codigo: r.k || null, precio: aNumero(r.p), precioLista: aNumero(r.o) };
  }

  const link = primero(r, ['link', 'linkAfiliado', 'url', 'permalink', 'short_link', 'shortLink', 'affiliate_link', 'enlace']);
  const titulo = primero(r, ['titulo', 'title', 'name', 'nombre', 'producto', 'product_name']);
  const idCrudo = primero(r, ['id', 'mlId', 'item_id', 'itemId', 'product_id', 'MLC', 'codigo_ml']);
  const id = (idCrudo && extraerId(String(idCrudo))) || (link ? extraerId(String(link)) : null);
  const hub = r.hub || {};

  return {
    id,
    titulo: titulo ? String(titulo).trim() : null,
    comision: Number(primero(r, ['comision', 'commission', 'commission_percentage', 'comision_porcentaje', 'percentage'])) || 0,
    link: link || null,
    codigo: primero(r, ['codigo', 'code', 'coupon', 'tag', 'k']),
    precio: aNumero(primero(r, ['precio', 'price', 'precio_actual', 'current_price'])) ?? aNumero(hub.precio),
    precioLista: aNumero(primero(r, ['precioLista', 'original_price', 'precio_lista', 'list_price', 'was'])) ?? aNumero(hub.precioLista),
  };
}

/* ---------- merge ---------- */

const catalogo = leerJson(RUTA_CATALOGO, []);
const crudos = leerRegistros(path.resolve(archivo));
const FECHA = hoy();

const porId = new Map(catalogo.filter((c) => c.id).map((c) => [c.id, c]));
const porLink = new Map(catalogo.filter((c) => c.link).map((c) => [c.link, c]));
const slugsUsados = new Set(catalogo.map((c) => c.slug));

const informe = { nuevos: 0, actualizados: 0, iguales: 0, sinId: 0 };
const descartes = [];
const nuevos = [];

for (const crudo of crudos) {
  const r = normalizar(crudo);

  if (!r.titulo || !r.link) {
    descartes.push(`sin titulo o sin link: ${JSON.stringify(crudo).slice(0, 90)}`);
    continue;
  }
  if (!/mercadolibre|meli\.la|mercadolivre/i.test(r.link)) {
    descartes.push(`link que no es de Mercado Libre: ${r.link}`);
    continue;
  }

  const existente = (r.id && porId.get(r.id)) || porLink.get(r.link) || null;

  if (existente) {
    // El slug se queda como esta: es una URL ya publicada.
    const antes = JSON.stringify(existente);
    if (r.id && !existente.id) existente.id = r.id;
    existente.titulo = r.titulo;
    if (r.comision) existente.comision = r.comision;
    if (r.codigo) existente.codigo = r.codigo;
    existente.link = r.link;
    if (r.precio) existente.hub = { precio: r.precio, precioLista: r.precioLista ?? null, capturado: FECHA };
    if (JSON.stringify(existente) === antes) informe.iguales++;
    else informe.actualizados++;
    continue;
  }

  if (!r.id) informe.sinId++;   // el verificador lo resuelve siguiendo el link

  const entrada = {
    id: r.id,
    slug: hacerSlug(r.titulo, r.id, slugsUsados),
    titulo: r.titulo,
    categoria: categoriaDe(r.titulo),
    comision: r.comision,
    link: r.link,
    codigo: r.codigo,
    hub: { precio: r.precio, precioLista: r.precioLista ?? null, capturado: FECHA },
  };
  nuevos.push(entrada);
  if (r.id) porId.set(r.id, entrada);
  porLink.set(r.link, entrada);
  informe.nuevos++;
}

const salida = [...catalogo, ...nuevos];
if (!DRY) escribirJson(RUTA_CATALOGO, salida);

console.log(`
Importado desde ${path.relative(ROOT, path.resolve(archivo))}${DRY ? '  (dry-run: no se escribio nada)' : ''}
  leidos          ${crudos.length}
  nuevos          ${informe.nuevos}
  actualizados    ${informe.actualizados}
  sin cambios     ${informe.iguales}
  descartados     ${descartes.length}
  sin ID de ML    ${informe.sinId}   (el verificador los resuelve siguiendo el link)

  catalogo: ${catalogo.length} -> ${salida.length} productos`);

if (descartes.length) {
  console.log('\nDescartados:');
  for (const d of descartes.slice(0, 10)) console.log('  - ' + d);
  if (descartes.length > 10) console.log(`  ... y ${descartes.length - 10} mas`);
}
if (informe.nuevos && !DRY) console.log('\nSiguiente paso:  npm run verificar   (para confirmar precio y stock de los nuevos)');
console.log('');
