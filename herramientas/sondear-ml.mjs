#!/usr/bin/env node
// Sonda 2. Lo que aprendimos en la sonda 1:
//   - La API esta cerrada (401 / 403 PolicyAgent). Sin token no hay API.
//   - El link de afiliado lleva a una URL /social/... que SI trae el precio,
//     en JSON: "current_price":{"value":N} y "previous_price":{"value":N}.
//   - Las URLs armadas desde el ID dan 200 pero 23 KB de cascara, sin precio.
//
// Lo que falta decidir, y es lo que esta sonda responde:
//   ¿Podemos verificar sin golpear el link de afiliado todos los dias?
//   Pegarle 892 veces por dia a nuestros propios links de afiliado inflaria
//   los clics del panel y podria oler a fraude. Queremos seguir el link UNA
//   vez, guardar la URL canonica del producto, y despues verificar contra esa.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const H = { 'user-agent': UA, 'accept-language': 'es-CL,es;q=0.9',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

const MUESTRAS = [
  { n: 'Sartenes Tefal', id: 'MLC27895045',   corto: 'https://meli.la/2EgXZxy', hub: 29590 },
  { n: 'Bateria cocina', id: 'MLCU385981743', corto: 'https://meli.la/1P7bsDj', hub: 46990 },
  { n: 'Colchon Zinus',  id: 'MLC49860073',   corto: 'https://meli.la/32EKUH5', hub: 89990 },
];

async function pedir(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, { headers: H, redirect: 'follow', signal: ctl.signal });
    return { status: r.status, url: r.url, html: await r.text() };
  } catch (e) { return { status: 0, url, error: e.message, html: '' }; }
  finally { clearTimeout(t); }
}

/** Precio segun el JSON incrustado que encontramos en la sonda 1. */
function precios(html) {
  const cur = html.match(/"current_price"\s*:\s*\{\s*"value"\s*:\s*(\d+)/);
  const pre = html.match(/"previous_price"\s*:\s*\{\s*"value"\s*:\s*(\d+)/);
  const off = html.match(/"discount_label"\s*:\s*\{\s*"text"\s*:\s*"(\d+)%/);
  return { actual: cur ? +cur[1] : null, anterior: pre ? +pre[1] : null, off: off ? +off[1] : null };
}

const canonica = (html) => (html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) || [])[1] || null;
const titulo = (html) =>
  (html.match(/<h1[^>]*>([^<]{3,120})</i) || html.match(/<title>([^<]+)</i) || [])[1]?.trim().slice(0, 70) || null;
const imagen = (html) => (html.match(/https:\/\/http2\.mlstatic\.com\/D_[^"' ]+\.(?:jpg|webp|png)/) || [])[0] || null;
const idEn = (s = '') => (String(s).match(/\b(ML[A-Z]{1,2}-?\d{6,})\b/i) || [])[1]?.replace('-', '') || null;

console.log('='.repeat(74));
console.log('SONDA 2 — ¿podemos verificar sin pegarle al link de afiliado a diario?');
console.log('='.repeat(74));

for (const m of MUESTRAS) {
  console.log(`\n### ${m.n}  (${m.id}, hub decia $${m.hub})`);

  // 1. Seguir el link de afiliado, una sola vez.
  const a = await pedir(m.corto);
  console.log(`\n  [1] link de afiliado -> HTTP ${a.status}, ${a.html.length}b`);
  console.log(`      URL final COMPLETA:\n      ${a.url}`);
  console.log(`      precios: ${JSON.stringify(precios(a.html))}`);
  console.log(`      titulo:  ${titulo(a.html)}`);
  console.log(`      canonica: ${canonica(a.html)}`);
  console.log(`      imagen:  ${(imagen(a.html) || '').slice(0, 80)}`);
  console.log(`      ID en la URL final: ${idEn(a.url)}   ID en la canonica: ${idEn(canonica(a.html))}`);

  // 2. La canonica, sin pasar por el link de afiliado.
  const can = canonica(a.html);
  if (can) {
    const b = await pedir(can);
    console.log(`\n  [2] canonica sin afiliado -> HTTP ${b.status}, ${b.html.length}b`);
    console.log(`      precios: ${JSON.stringify(precios(b.html))}`);
    console.log(`      titulo:  ${titulo(b.html)}`);
    console.log(`      ¿sirve para verificar a diario? ${precios(b.html).actual ? 'SI' : 'NO'}`);
  } else {
    console.log('\n  [2] no hay canonica en la pagina');
  }

  // 3. La URL final tal cual, reusada.
  const c = await pedir(a.url);
  console.log(`\n  [3] reusar la URL final -> HTTP ${c.status}, ${c.html.length}b, precios: ${JSON.stringify(precios(c.html))}`);
}

// 4. Que es esa cascara de 23 KB que devuelven las URLs armadas desde el ID.
console.log('\n\n### Que hay en la "cascara" de 23 KB de articulo.mercadolibre.cl\n');
const shell = await pedir('https://articulo.mercadolibre.cl/MLC-27895045-_JM');
console.log(`  HTTP ${shell.status}, ${shell.html.length}b`);
console.log('  primeros 700 caracteres:');
console.log('  ' + shell.html.slice(0, 700).replace(/\s+/g, ' '));
console.log(`\n  precios en la cascara: ${JSON.stringify(precios(shell.html))}`);
console.log(`  canonica: ${canonica(shell.html)}`);
console.log('\n' + '='.repeat(74));
