#!/usr/bin/env node
// Sonda 3: comprobar que el parser arreglado lee bien Mercado Libre de verdad.
//
// Ya no explora: usa el mismo cliente que usa el verificador, contra productos
// reales, y compara con lo que decia el catalogo. Si esto pasa, el verificador
// funciona.
import { crearCliente } from '../src/lib/meli.mjs';
import { leerJson } from '../src/lib/util.mjs';

const catalogo = leerJson('data/catalogo.json', []);
const muestras = ['MLC27895045', 'MLCU385981743', 'MLC49860073', 'MLC24830746', 'MLC21029447']
  .map((id) => catalogo.find((c) => c.id === id))
  .filter(Boolean);

const cliente = crearCliente({
  token: process.env.MELI_ACCESS_TOKEN || null,
  clientId: process.env.MELI_CLIENT_ID || null,
  clientSecret: process.env.MELI_CLIENT_SECRET || null,
  refreshToken: process.env.MELI_REFRESH_TOKEN || null,
  log: (m) => console.log(`  · ${m}`),
});

console.log('='.repeat(78));
console.log('SONDA 3 — ¿el verificador arreglado lee bien Mercado Libre?');
console.log(`  credenciales: ${process.env.MELI_CLIENT_ID ? 'si' : 'no (se usa el link de afiliado)'}`);
console.log('='.repeat(78) + '\n');

const urls = {};
for (const m of muestras) urls[m.id] = m.link;
const res = await cliente.consultar(muestras.map((m) => m.id), { urls });

let bien = 0;
for (const m of muestras) {
  const r = res.get(m.id);
  console.log(`${m.titulo.slice(0, 58)}`);
  if (!r || r.error) {
    console.log(`   FALLO: ${(r && r.error) || 'sin respuesta'}\n`);
    continue;
  }
  const razonable = r.precio > 100 && r.precio < 5000000;
  const cambio = m.hub.precio ? Math.round(((r.precio - m.hub.precio) / m.hub.precio) * 100) : null;
  console.log(`   precio hoy:  $${r.precio.toLocaleString('es-CL')}   (catalogo del 30/08: $${(m.hub.precio || 0).toLocaleString('es-CL')}${cambio !== null ? `, ${cambio >= 0 ? '+' : ''}${cambio}%` : ''})`);
  console.log(`   lista:       ${r.precioLista ? '$' + r.precioLista.toLocaleString('es-CL') : '—'}`);
  console.log(`   fuente:      ${r.fuente}   estado: ${r.estado}   razonable: ${razonable ? 'SI' : 'NO'}`);
  console.log(`   imagen:      ${(r.imagen || '—').slice(0, 70)}`);
  console.log(`   titulo leido: ${(r.titulo || '—').slice(0, 60)}\n`);
  if (razonable) bien++;
}

console.log('='.repeat(78));
console.log(`RESULTADO: ${bien} de ${muestras.length} con precio razonable.`);
console.log(bien === muestras.length ? 'El verificador esta listo.' : 'Todavia falta.');
console.log('='.repeat(78));
process.exit(bien === muestras.length ? 0 : 1);
