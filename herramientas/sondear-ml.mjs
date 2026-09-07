#!/usr/bin/env node
// Sonda de diagnostico. No es parte del sitio: existe para mirar, una vez, que
// nos devuelve Mercado Libre de verdad, porque el entorno de desarrollo lo
// tiene bloqueado y no se puede adivinar el formato de una pagina a ciegas.
//
// Corre sola en GitHub Actions al tocar este archivo (.github/workflows/sondeo.yml).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CABECERAS = { 'user-agent': UA, 'accept-language': 'es-CL,es;q=0.9',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

const MUESTRAS = [
  { nombre: 'MLC normal',  id: 'MLC27895045',    corto: 'https://meli.la/2EgXZxy' },
  { nombre: 'MLCU (404)',  id: 'MLCU385981743',  corto: 'https://meli.la/1P7bsDj' },
  { nombre: 'MLC ficha',   id: 'MLC49860073',    corto: 'https://meli.la/32EKUH5' },
];

const guion = (id) => String(id).replace(/^([A-Z]+?)(\d)/, '$1-$2');

const FORMAS = [
  ['articulo + _JM',   (id) => `https://articulo.mercadolibre.cl/${guion(id)}-_JM`],
  ['articulo sin _JM', (id) => `https://articulo.mercadolibre.cl/${guion(id)}`],
  ['/p/ catalogo',     (id) => `https://www.mercadolibre.cl/p/${id}`],
  ['/noindex/ ficha',  (id) => `https://www.mercadolibre.cl/${guion(id)}`],
];

async function pedir(url, cabeceras = CABECERAS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, { headers: cabeceras, redirect: 'follow', signal: ctl.signal });
    const cuerpo = await r.text();
    return { status: r.status, url: r.url, cuerpo };
  } catch (err) {
    return { status: 0, url, error: err.message, cuerpo: '' };
  } finally { clearTimeout(t); }
}

/** Que senales de precio trae este HTML. */
function radiografia(html) {
  if (!html) return { vacio: true };
  const jsonld = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const tipos = [];
  for (const m of jsonld) {
    try {
      const j = JSON.parse(m[1].trim());
      for (const n of [].concat(j['@graph'] || j)) if (n && n['@type']) tipos.push(n['@type']);
    } catch { tipos.push('(no parsea)'); }
  }
  const patrones = {
    'itemprop=price':      /<meta[^>]+itemprop="price"[^>]+content="([\d.,]+)"/i,
    'product:price':       /property="product:price:amount"[^>]+content="([\d.,]+)"/i,
    '"price":N':           /"price"\s*:\s*(\d+(?:\.\d+)?)/,
    '"original_price":N':  /"original_price"\s*:\s*(\d+(?:\.\d+)?)/,
    'andes-money-amount':  /andes-money-amount__fraction[^>]*>([\d.]+)</i,
    'price-tag-fraction':  /price-tag-fraction[^>]*>([\d.]+)</i,
    '__PRELOADED_STATE__': /__PRELOADED_STATE__/,
    'ui-pdp-title':        /<h1[^>]*ui-pdp-title[^>]*>([^<]{3,80})</i,
  };
  const encontrados = {};
  for (const [k, re] of Object.entries(patrones)) {
    const m = html.match(re);
    if (m) encontrados[k] = (m[1] || 'presente').slice(0, 40);
  }
  return { bytes: html.length, jsonld: jsonld.length, tiposLd: [...new Set(tipos)], encontrados };
}

const recorte = (html, aguja, largo = 260) => {
  const i = html.indexOf(aguja);
  if (i < 0) return null;
  return html.slice(Math.max(0, i - 60), i + largo).replace(/\s+/g, ' ');
};

console.log('='.repeat(72));
console.log('SONDA — que responde Mercado Libre de verdad');
console.log('='.repeat(72));

/* ---------- 1. la API, con y sin token ---------- */
console.log('\n## 1. API\n');
for (const [etiqueta, url] of [
  ['items multiget', 'https://api.mercadolibre.com/items?ids=MLC27895045&attributes=id,title,price'],
  ['item suelto',    'https://api.mercadolibre.com/items/MLC27895045'],
  ['busqueda sitio', 'https://api.mercadolibre.com/sites/MLC/search?q=tetera&limit=1'],
]) {
  const r = await pedir(url, { ...CABECERAS, accept: 'application/json' });
  console.log(`  ${etiqueta.padEnd(16)} HTTP ${r.status}  ${r.cuerpo.slice(0, 110).replace(/\s+/g, ' ')}`);
}

/* ---------- 2. el link corto de afiliado ---------- */
console.log('\n## 2. Link corto de afiliado (a donde lleva)\n');
for (const m of MUESTRAS) {
  const r = await pedir(m.corto);
  const rx = radiografia(r.cuerpo);
  console.log(`  ${m.nombre.padEnd(12)} HTTP ${r.status}`);
  console.log(`    destino: ${r.url.slice(0, 110)}`);
  console.log(`    ${JSON.stringify(rx).slice(0, 300)}`);
}

/* ---------- 3. formas de URL a partir del ID ---------- */
console.log('\n## 3. Formas de URL construidas desde el ID\n');
for (const m of MUESTRAS) {
  console.log(`  --- ${m.nombre} (${m.id}) ---`);
  for (const [etiqueta, arma] of FORMAS) {
    const r = await pedir(arma(m.id));
    const rx = radiografia(r.cuerpo);
    const señales = rx.encontrados ? Object.keys(rx.encontrados).join(',') : '-';
    console.log(`    ${etiqueta.padEnd(18)} HTTP ${String(r.status).padEnd(4)} ${String(rx.bytes || 0).padStart(7)}b  ld+json:${rx.jsonld || 0} [${rx.tiposLd || ''}]  ${señales}`);
  }
}

/* ---------- 4. el HTML crudo alrededor del precio ---------- */
console.log('\n## 4. Como se ve el precio en el HTML (muestra 1)\n');
const r1 = await pedir(MUESTRAS[0].corto);
if (r1.cuerpo) {
  for (const aguja of ['ld+json', '"price"', 'itemprop="price"', 'andes-money-amount', '__PRELOADED_STATE__']) {
    const c = recorte(r1.cuerpo, aguja);
    console.log(`  [${aguja}] ${c ? c.slice(0, 300) : '(no aparece)'}`);
    console.log('');
  }
  const ld = r1.cuerpo.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (ld) console.log('  ld+json completo (primeros 700):\n  ' + ld[1].trim().slice(0, 700));
} else {
  console.log('  sin cuerpo: ' + (r1.error || 'HTTP ' + r1.status));
}
console.log('\n' + '='.repeat(72));
