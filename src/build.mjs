// Generador estatico de "Antes de comprar".
// Lee data/config.json + data/productos.json y escribe todo el sitio en dist/.
// Sin dependencias: solo Node. Se ejecuta con `npm run build`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/config.json'), 'utf8'));
const productos = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/productos.json'), 'utf8'));

const avisos = [];
const errores = [];

/* ---------- utilidades ---------- */

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugify = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const clp = (n) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
    : null;

const write = (rel, contenido) => {
  const destino = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido);
};

const canalesConocidos = ['tiktok', 'instagram', 'youtube', 'whatsapp', 'facebook', 'x', 'bio', 'newsletter'];

/* ---------- validacion ---------- */

const vistos = new Set();
for (const p of productos) {
  if (!p.slug) { errores.push(`Un producto no tiene "slug": ${p.titulo || '(sin titulo)'}`); continue; }
  if (vistos.has(p.slug)) errores.push(`Slug duplicado: "${p.slug}". Cada producto necesita un slug unico.`);
  vistos.add(p.slug);

  if (!p.linkAfiliado) avisos.push(`"${p.slug}" no tiene linkAfiliado: /ir/${p.slug} no va a redirigir a ninguna parte.`);
  else if (!/mercadolibre|mercadolivre/i.test(p.linkAfiliado))
    avisos.push(`"${p.slug}" tiene un linkAfiliado que no parece de Mercado Libre.`);

  if (p._ejemplo) avisos.push(`"${p.slug}" sigue marcado como _ejemplo. Reemplazalo por un producto real antes de publicar.`);
  for (const canal of Object.keys(p.linksPorCanal || {})) {
    if (!canalesConocidos.includes(canal)) avisos.push(`"${p.slug}" usa el canal "${canal}", que no es uno de los habituales (${canalesConocidos.join(', ')}).`);
  }
}
if (errores.length) {
  console.error('\nErrores que impiden construir el sitio:');
  for (const e of errores) console.error('  x ' + e);
  process.exit(1);
}

const publicados = productos.filter((p) => p.publicado !== false);

/* ---------- plantillas ---------- */

const ga = cfg.analytics?.ga4
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(cfg.analytics.ga4)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(cfg.analytics.ga4)}');</script>`
  : '';

function layout({ titulo, descripcion, ruta, imagen, jsonLd, cuerpo }) {
  const url = cfg.url.replace(/\/$/, '') + ruta;
  const og = imagen || `${cfg.url.replace(/\/$/, '')}/og.png`;
  return `<!doctype html>
<html lang="${esc(cfg.idioma)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.nombre)}">
<meta property="og:locale" content="es_CL">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${esc(og)}">
<meta name="theme-color" content="#0E7C66">
<link rel="stylesheet" href="/estilos.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
${ga}
</head>
<body>
<a class="skip" href="#main">Saltar al contenido</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/"><span class="logo-mark">AC</span><span class="logo-text">${esc(cfg.nombre)}</span></a>
    <nav aria-label="Principal"><a href="/">Inicio</a><a href="/#guias">Guias</a><a href="/como-trabajamos/">Como trabajamos</a></nav>
  </div>
</header>
<main id="main">${cuerpo}</main>
<footer class="site-footer">
  <div class="wrap">
    <p class="disclosure">${esc(cfg.disclosure)}</p>
    <p class="fine">&copy; ${new Date().getFullYear()} ${esc(cfg.nombre)} &middot; <a href="/como-trabajamos/">Como trabajamos</a></p>
  </div>
</footer>
</body>
</html>`;
}

function tarjeta(p) {
  const precio = clp(p.precio);
  const antes = clp(p.precioAntes);
  return `<article class="card">
  ${p.imagen ? `<a class="card-img" href="/producto/${esc(p.slug)}/"><img src="${esc(p.imagen)}" alt="${esc(p.titulo)}" loading="lazy" decoding="async"></a>` : ''}
  <div class="card-body">
    ${p.categoria ? `<span class="chip">${esc(p.categoria)}</span>` : ''}
    <h3><a href="/producto/${esc(p.slug)}/">${esc(p.titulo)}</a></h3>
    ${p.resumen ? `<p class="card-sum">${esc(p.resumen)}</p>` : ''}
    <div class="card-foot">
      ${precio ? `<span class="precio">${precio}${antes ? ` <s>${antes}</s>` : ''}</span>` : '<span></span>'}
      ${typeof p.puntaje === 'number' ? `<span class="puntaje" title="Nuestro puntaje">${p.puntaje.toFixed(1)}</span>` : ''}
    </div>
  </div>
</article>`;
}

function paginaProducto(p) {
  const precio = clp(p.precio);
  const antes = clp(p.precioAntes);
  const specs = Object.entries(p.specs || {});
  const desc = p.resumen || `${p.titulo}: precio, caracteristicas y opinion honesta antes de comprar en Chile.`;

  // Solo emitimos datos estructurados de review cuando hay una opinion real detras.
  const jsonLd =
    p.publicado !== false && typeof p.puntaje === 'number' && p.veredicto
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.titulo,
          ...(p.imagen ? { image: [p.imagen] } : {}),
          ...(p.specs?.Marca && p.specs.Marca !== '-' ? { brand: { '@type': 'Brand', name: p.specs.Marca } } : {}),
          description: p.resumen || undefined,
          review: {
            '@type': 'Review',
            reviewRating: { '@type': 'Rating', ratingValue: p.puntaje, bestRating: 10, worstRating: 1 },
            author: { '@type': 'Organization', name: cfg.nombre },
            datePublished: p.actualizado,
            reviewBody: p.veredicto,
          },
          ...(typeof p.precio === 'number'
            ? { offers: { '@type': 'Offer', price: p.precio, priceCurrency: cfg.moneda, availability: 'https://schema.org/InStock', url: `${cfg.url.replace(/\/$/, '')}/ir/${p.slug}` } }
            : {}),
        }
      : null;

  const cuerpo = `<div class="wrap prod">
  <nav class="breadcrumb" aria-label="Miga de pan"><a href="/">Inicio</a> / ${p.categoria ? `<a href="/categoria/${esc(slugify(p.categoria))}/">${esc(p.categoria)}</a> / ` : ''}<span>${esc(p.titulo)}</span></nav>
  <div class="prod-grid">
    <div class="prod-media">${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.titulo)}" width="600" height="600">` : '<div class="ph">Sin imagen</div>'}</div>
    <div class="prod-info">
      ${p.categoria ? `<span class="chip">${esc(p.categoria)}</span>` : ''}
      <h1>${esc(p.titulo)}</h1>
      ${typeof p.puntaje === 'number' ? `<div class="score"><span class="score-num">${p.puntaje.toFixed(1)}</span><span class="score-lbl">nuestro puntaje sobre 10</span></div>` : ''}
      ${p.resumen ? `<p class="lead">${esc(p.resumen)}</p>` : ''}
      ${precio ? `<p class="precio-grande">${precio}${antes ? ` <s>${antes}</s>` : ''}<span class="precio-nota">Precio referencial. Mercado Libre lo cambia seguido: confirmalo en el link.</span></p>` : ''}
      <a class="cta" href="/ir/${esc(p.slug)}" rel="sponsored nofollow noopener" target="_blank">Ver precio actual en Mercado Libre</a>
      <p class="cta-nota">Enlace de afiliado. Te lleva directo a la publicacion.</p>
    </div>
  </div>

  ${p.veredicto ? `<section class="bloque"><h2>Veredicto</h2><p>${esc(p.veredicto)}</p></section>` : ''}
  ${p.paraQuien ? `<section class="bloque"><h2>Para quien es</h2><p>${esc(p.paraQuien)}</p></section>` : ''}

  ${(p.pros?.length || p.contras?.length) ? `<section class="bloque"><h2>Lo bueno y lo malo</h2><div class="pc">
    ${p.pros?.length ? `<div class="pc-col good"><h3>A favor</h3><ul>${p.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${p.contras?.length ? `<div class="pc-col bad"><h3>En contra</h3><ul>${p.contras.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
  </div></section>` : ''}

  ${specs.length ? `<section class="bloque"><h2>Ficha tecnica</h2><table class="specs"><tbody>${specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>` : ''}

  <section class="bloque cierre">
    <h2>Resumen rapido</h2>
    <a class="cta" href="/ir/${esc(p.slug)}" rel="sponsored nofollow noopener" target="_blank">Ver ${esc(p.titulo)} en Mercado Libre</a>
    ${p.actualizado ? `<p class="fine">Ultima revision: ${esc(p.actualizado)}</p>` : ''}
  </section>
</div>`;

  return layout({ titulo: `${p.titulo} - opinion y precio en Chile | ${cfg.nombre}`, descripcion: desc, ruta: `/producto/${p.slug}/`, imagen: p.imagen, jsonLd, cuerpo });
}

function paginaInicio() {
  const categorias = [...new Set(publicados.map((p) => p.categoria).filter(Boolean))];
  const cuerpo = `<section class="hero"><div class="wrap">
  <h1>${esc(cfg.tagline)}</h1>
  <p class="hero-sub">${esc(cfg.descripcion)}</p>
</div></section>
<div class="wrap">
  ${categorias.length ? `<nav class="cats" aria-label="Categorias">${categorias.map((c) => `<a href="/categoria/${esc(slugify(c))}/">${esc(c)}</a>`).join('')}</nav>` : ''}
  <section id="guias" class="bloque">
    <h2>Ultimas revisiones</h2>
    ${publicados.length ? `<div class="grid">${publicados.map(tarjeta).join('')}</div>` : '<p class="vacio">Todavia no hay fichas publicadas. Agrega productos en <code>data/productos.json</code> y vuelve a construir el sitio.</p>'}
  </section>
</div>`;
  return layout({ titulo: `${cfg.nombre} - ${cfg.tagline}`, descripcion: cfg.descripcion, ruta: '/', cuerpo });
}

function paginaCategoria(cat, items) {
  const cuerpo = `<div class="wrap">
  <nav class="breadcrumb"><a href="/">Inicio</a> / <span>${esc(cat)}</span></nav>
  <h1>${esc(cat)}</h1>
  <div class="grid">${items.map(tarjeta).join('')}</div>
</div>`;
  return layout({ titulo: `${cat} - guias y comparativas | ${cfg.nombre}`, descripcion: `Revisiones y comparativas de ${cat} en Chile. Precios, pros y contras antes de comprar.`, ruta: `/categoria/${slugify(cat)}/`, cuerpo });
}

function paginaComoTrabajamos() {
  const cuerpo = `<div class="wrap prosa">
  <h1>Como trabajamos</h1>
  <p>${esc(cfg.nombre)} existe para responder una sola pregunta: <strong>&iquest;vale la pena o no?</strong></p>
  <h2>Nuestro criterio</h2>
  <ul>
    <li>Solo escribimos sobre productos que revisamos o investigamos a fondo.</li>
    <li>Publicamos lo malo. Una ficha sin contras no le sirve a nadie.</li>
    <li>Los precios son referenciales: Mercado Libre los cambia seguido y siempre te mandamos a verificar.</li>
    <li>Si un producto no nos convence, lo decimos, aunque pague mejor comision.</li>
  </ul>
  <h2>Como nos financiamos</h2>
  <p>${esc(cfg.disclosure)}</p>
  <h2>Contacto</h2>
  <p>Escribenos a <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>.</p>
</div>`;
  return layout({ titulo: `Como trabajamos | ${cfg.nombre}`, descripcion: 'Nuestro criterio editorial y como nos financiamos.', ruta: '/como-trabajamos/', cuerpo });
}

/* ---------- redirecciones de afiliado ---------- */

function generarRedirects() {
  const pref = cfg.redireccion?.prefijo || '/ir';
  const code = cfg.redireccion?.codigo || 302;
  const lineas = [
    '# Generado por src/build.mjs. No lo edites a mano: edita data/productos.json.',
    '# Cada link corto vive en tu dominio, asi que podes compartirlo donde sea',
    '# y cambiar el destino despues sin volver a editar el contenido publicado.',
    '',
  ];
  for (const p of productos) {
    if (!p.linkAfiliado) continue;
    lineas.push(`${pref}/${p.slug}    ${p.linkAfiliado}    ${code}!`);
    for (const [canal, link] of Object.entries(p.linksPorCanal || {})) {
      if (link) lineas.push(`${pref}/${p.slug}/${canal}    ${link}    ${code}!`);
    }
    // Cualquier canal sin link propio cae al link principal.
    lineas.push(`${pref}/${p.slug}/*    ${p.linkAfiliado}    ${code}!`);
  }
  lineas.push('', '/404    /404.html    404');
  return lineas.join('\n') + '\n';
}

/* ---------- salida ---------- */

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

write('index.html', paginaInicio());
write('como-trabajamos/index.html', paginaComoTrabajamos());
for (const p of productos) write(`producto/${p.slug}/index.html`, paginaProducto(p));

const porCategoria = new Map();
for (const p of publicados) {
  if (!p.categoria) continue;
  const k = slugify(p.categoria);
  if (!porCategoria.has(k)) porCategoria.set(k, { nombre: p.categoria, items: [] });
  porCategoria.get(k).items.push(p);
}
for (const [k, { nombre, items }] of porCategoria) write(`categoria/${k}/index.html`, paginaCategoria(nombre, items));

write('404.html', layout({
  titulo: `Pagina no encontrada | ${cfg.nombre}`,
  descripcion: 'Esta pagina no existe.',
  ruta: '/404',
  cuerpo: '<div class="wrap prosa"><h1>No encontramos esta pagina</h1><p>Puede que el link haya cambiado. <a href="/">Volver al inicio</a>.</p></div>',
}));

const base = cfg.url.replace(/\/$/, '');
const urls = [
  { loc: `${base}/`, pri: '1.0' },
  { loc: `${base}/como-trabajamos/`, pri: '0.3' },
  ...[...porCategoria.keys()].map((k) => ({ loc: `${base}/categoria/${k}/`, pri: '0.6' })),
  ...publicados.map((p) => ({ loc: `${base}/producto/${p.slug}/`, pri: '0.8', lastmod: p.actualizado })),
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);

// Las paginas /ir/ son links de afiliado: no queremos que Google las rastree.
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: ${cfg.redireccion?.prefijo || '/ir'}/\n\nSitemap: ${base}/sitemap.xml\n`);
write('_redirects', generarRedirects());

for (const f of fs.existsSync(path.join(ROOT, 'public')) ? fs.readdirSync(path.join(ROOT, 'public')) : []) {
  fs.copyFileSync(path.join(ROOT, 'public', f), path.join(DIST, f));
}

const conLink = productos.filter((p) => p.linkAfiliado).length;
console.log(`\nSitio construido en dist/`);
console.log(`  ${publicados.length} ficha(s) publicada(s) de ${productos.length} total`);
console.log(`  ${porCategoria.size} categoria(s)`);
console.log(`  ${conLink} link(s) corto(s) ${cfg.redireccion?.prefijo || '/ir'}/<slug> listos para compartir`);
if (avisos.length) {
  console.log('\nAvisos:');
  for (const a of avisos) console.log('  ! ' + a);
}
console.log('');
