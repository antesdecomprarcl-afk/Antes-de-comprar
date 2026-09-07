// Generador estatico de "Antes de comprar".
//
// Lee los datos, decide que ofertas se publican y escribe el sitio entero en
// dist/. Sin dependencias: solo Node.
//
//   data/catalogo.json    productos con link de afiliado (el universo)
//   data/productos.json   fichas con opinion propia (las que llevan pagina)
//   data/estado.json      lo que el verificador confirmo por ultima vez
//   data/historial.jsonl  precios observados dia a dia
//
//   npm run build

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, esc, slugify, clp, hoy, leerJson } from './lib/util.mjs';
import { leerHistorial } from './lib/historial.mjs';
import { componer, etiqueta } from './lib/componer.mjs';

const DIST = path.join(ROOT, 'dist');
const FECHA = hoy();

const cfg = leerJson('data/config.json');
const catalogo = leerJson('data/catalogo.json', []);
const productos = leerJson('data/productos.json', []);
const estado = leerJson('data/estado.json', {});
const categorias = leerJson('data/categorias.json', {});
const historial = leerHistorial();

const avisos = [];
const errores = [];
const base = cfg.url.replace(/\/$/, '');
const PREF = cfg.redireccion?.prefijo || '/ir';
const CANALES = ['tiktok', 'instagram', 'youtube', 'whatsapp', 'facebook', 'x', 'bio', 'newsletter'];

/* ---------- validacion ---------- */

const slugsVistos = new Set();
for (const p of productos) {
  if (!p.slug) { errores.push(`Una ficha no tiene "slug": ${p.titulo || '(sin titulo)'}`); continue; }
  if (slugsVistos.has(p.slug)) errores.push(`Slug duplicado en las fichas: "${p.slug}".`);
  slugsVistos.add(p.slug);
  if (!p.linkAfiliado) avisos.push(`La ficha "${p.slug}" no tiene linkAfiliado: ${PREF}/${p.slug} no redirige a ninguna parte.`);
  if (!p.mlId) avisos.push(`La ficha "${p.slug}" no tiene mlId: no se puede verificar su precio. Corre "npm run verificar" para resolverlo.`);
  for (const canal of Object.keys(p.linksPorCanal || {})) {
    if (!CANALES.includes(canal)) avisos.push(`La ficha "${p.slug}" usa el canal "${canal}", que no es uno de los habituales (${CANALES.join(', ')}).`);
  }
}
const idsCatalogo = new Set(catalogo.map((c) => c.id));
for (const p of productos) if (p.mlId && !idsCatalogo.has(p.mlId)) avisos.push(`La ficha "${p.slug}" apunta a ${p.mlId}, que no esta en data/catalogo.json.`);
for (const c of catalogo) if (!c.link) avisos.push(`El producto ${c.id} no tiene link de afiliado.`);

if (errores.length) {
  console.error('\nErrores que impiden construir el sitio:');
  for (const e of errores) console.error('  x ' + e);
  process.exit(1);
}

/* ---------- que se publica ---------- */

const { ofertas, descartes } = componer({ catalogo, productos, estado, historial, categorias, cfg, fecha: FECHA });
const fichas = ofertas.filter((o) => o.ficha);
const verificadas = ofertas.filter((o) => o.verificado);
const rebajadas = ofertas.filter((o) => o.oferta.tipo === 'verificado' || o.oferta.tipo === 'minimo-historico');

const porCategoria = new Map();
for (const o of ofertas) {
  const k = slugify(o.categoria || 'varios');
  if (!porCategoria.has(k)) porCategoria.set(k, { nombre: o.categoria || 'Varios', items: [] });
  porCategoria.get(k).items.push(o);
}

/* ---------- plantillas ---------- */

const ga = cfg.analytics?.ga4
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(cfg.analytics.ga4)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(cfg.analytics.ga4)}')</script>`
  : '';

function layout({ titulo, descripcion, ruta, imagen, jsonLd, cuerpo, clase = '', scripts = '', noindex = false }) {
  const url = base + ruta;
  return `<!doctype html>
<html lang="${esc(cfg.idioma)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.nombre)}">
<meta property="og:locale" content="es_CL">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${esc(url)}">
${imagen ? `<meta property="og:image" content="${esc(imagen)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0f6b4f">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/estilos.css">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
${ga}
</head>
<body class="${clase}">
<a class="skip" href="#main">Saltar al contenido</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/"><span class="logo-mark">AC</span><span class="logo-text">Antes de <em>comprar</em></span></a>
    <nav aria-label="Principal">
      <a href="/ofertas/" class="nav-feed">Ver ofertas</a>
      <a href="/como-trabajamos/">Cómo trabajamos</a>
    </nav>
  </div>
</header>
<main id="main">${cuerpo}</main>
<footer class="site-footer">
  <div class="wrap">
    <p class="disclosure">${esc(cfg.disclosure)}</p>
    <p class="fine">&copy; ${new Date().getFullYear()} ${esc(cfg.nombre)} &middot; <a href="/como-trabajamos/">Cómo trabajamos</a> &middot; Precios revisados el ${esc(FECHA)}</p>
  </div>
</footer>
${scripts}
</body>
</html>`;
}

/** Imagen del producto, o un marcador que no finge ser una foto. */
function media(o, clase = '') {
  if (o.imagen) return `<img class="${clase}" src="${esc(o.imagen)}" alt="${esc(o.titulo)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  return `<span class="${clase} sin-foto" aria-hidden="true">${esc(o.categoria || 'Producto')}</span>`;
}

const destino = (o) => `${PREF}/${o.slug}`;

function tarjeta(o) {
  const et = etiqueta(o);
  const precio = clp(o.precio);
  const ref = o.oferta.referencia && o.oferta.tipo !== 'sin-descuento' ? clp(o.oferta.referencia) : null;
  return `<article class="card">
  <a class="card-img" href="${o.ficha ? `/producto/${esc(o.slug)}/` : esc(destino(o))}"${o.ficha ? '' : ' rel="sponsored nofollow noopener" target="_blank"'}>${media(o)}</a>
  <div class="card-body">
    <div class="card-tags"><span class="chip">${esc(o.categoria)}</span><span class="et ${et.clase}" title="${esc(et.detalle)}">${esc(et.texto)}</span></div>
    <h3>${o.ficha ? `<a href="/producto/${esc(o.slug)}/">${esc(o.titulo)}</a>` : esc(o.titulo)}</h3>
    ${o.nota ? `<p class="card-sum">${esc(o.nota)}</p>` : ''}
    <div class="card-foot">
      <span class="precio">${precio}${ref ? ` <s>${ref}</s>` : ''}</span>
      <a class="card-cta" href="${esc(destino(o))}" rel="sponsored nofollow noopener" target="_blank">Ver</a>
    </div>
  </div>
</article>`;
}

/* ---------- inicio ---------- */

function paginaInicio() {
  const cats = [...porCategoria.entries()]
    .map(([k, { nombre, items }]) => ({ k, nombre, n: items.length, mejor: Math.max(0, ...items.map((i) => i.oferta.porcentaje)) }))
    .sort((a, b) => b.n - a.n);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${base}/#sitio`, url: `${base}/`, name: cfg.nombre, inLanguage: cfg.idioma, description: cfg.descripcion },
      { '@type': 'ItemList', name: 'Ofertas verificadas', numberOfItems: fichas.length,
        itemListElement: fichas.map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.titulo, url: `${base}/producto/${o.slug}/` })) },
    ],
  };

  const cuerpo = `<section class="hero"><div class="wrap hero-in">
  <div>
    <h1>Nosotros buscamos. Tú <span class="hl">solo compras</span>.</h1>
    <p class="hero-sub">${esc(cfg.descripcion)}</p>
    <div class="hero-acciones">
      <a class="btn-grande" href="/ofertas/">Ver las ofertas de hoy</a>
      <a class="btn-plano" href="/como-trabajamos/">Cómo las verificamos</a>
    </div>
  </div>
  <div class="stats">
    <div><b>${ofertas.length}</b><span>Productos vigentes</span></div>
    <div class="s-acc"><b>${rebajadas.length}</b><span>Con rebaja comprobada</span></div>
    <div><b>${porCategoria.size}</b><span>Categorias</span></div>
  </div>
</div></section>

<div class="wrap">
  ${fichas.length ? `<section class="bloque">
    <div class="sec-head"><h2>Las que revisamos una por una</h2><p>Con opinión escrita por nosotros, incluido lo malo.</p></div>
    <div class="grid">${fichas.map(tarjeta).join('')}</div>
  </section>` : ''}

  ${rebajadas.length ? `<section class="bloque">
    <div class="sec-head"><h2>Rebajas comprobadas hoy</h2><p>El precio bajó respecto de lo que costaba habitualmente. No es el descuento que dice la tienda: es el que medimos.</p></div>
    <div class="grid">${rebajadas.slice(0, 12).map(tarjeta).join('')}</div>
    <p class="mas"><a class="btn-grande" href="/ofertas/">Ver las ${ofertas.length} ofertas en el feed</a></p>
  </section>` : `<section class="bloque"><p class="vacio">Todavía no hay rebajas comprobadas. Corré <code>npm run verificar</code> unos días para que el historial de precios tenga con qué comparar.</p></section>`}

  <section class="bloque">
    <div class="sec-head"><h2>Por categoría</h2></div>
    <nav class="cats">${cats.map((c) => `<a href="/categoria/${esc(c.k)}/"><b>${esc(c.nombre)}</b><span>${c.n} ${c.n === 1 ? 'oferta' : 'ofertas'}${c.mejor ? ` · hasta -${c.mejor}%` : ''}</span></a>`).join('')}</nav>
  </section>
</div>`;

  return layout({ titulo: `${cfg.nombre} - ${cfg.tagline}`, descripcion: cfg.descripcion, ruta: '/', jsonLd, cuerpo });
}

/* ---------- feed vertical ---------- */

function tarjetaFeed(o, i) {
  const et = etiqueta(o);
  const ref = o.oferta.referencia && o.oferta.tipo !== 'sin-descuento' ? clp(o.oferta.referencia) : null;
  return `<article class="fd" id="fd-${i}" data-i="${i}">
  <div class="fd-in">
    <div class="fd-media">${media(o, 'fd-img')}</div>
    <div class="fd-txt">
      <div class="fd-tags"><span class="chip">${esc(o.categoria)}</span><span class="et ${et.clase}">${esc(et.texto)}</span></div>
      <h2 class="fd-name">${esc(o.titulo)}</h2>
      ${o.nota ? `<p class="fd-note">${esc(o.nota)}</p>` : ''}
      <p class="fd-check">${esc(et.detalle)}</p>
      <div class="fd-precio"><span class="fd-now">${clp(o.precio)}</span>${ref ? `<s>${ref}</s>` : ''}</div>
      <a class="fd-go" href="${esc(destino(o))}/tiktok" rel="sponsored nofollow noopener" target="_blank">Ver en Mercado Libre</a>
      ${o.ficha ? `<a class="fd-mas" href="/producto/${esc(o.slug)}/">Leer nuestra opinión</a>` : ''}
    </div>
  </div>
</article>`;
}

function paginaFeed() {
  const enHtml = cfg.feed?.enHtml ?? 40;
  const primeras = ofertas.slice(0, enHtml);
  const cuerpo = `<div class="feed" id="feed">
  <div class="feed-barra"><i id="feed-avance"></i></div>
  ${primeras.map(tarjetaFeed).join('')}
  <article class="fd fd-fin" id="fd-fin"><div class="fd-in fd-fin-in">
    <h2>Eso es todo por hoy</h2>
    <p>Revisamos los precios todos los días. Mañana hay lista nueva.</p>
    <a class="btn-grande" href="/">Volver al inicio</a>
  </div></article>
</div>`;
  return layout({
    titulo: `Ofertas de hoy | ${cfg.nombre}`,
    descripcion: `${ofertas.length} ofertas revisadas hoy en Mercado Libre Chile. Deslizá y mirá una por una.`,
    ruta: '/ofertas/', cuerpo, clase: 'body-feed',
    scripts: `<script src="/feed.js" defer></script>`,
  });
}

/* ---------- ficha de producto ---------- */

function paginaProducto(o) {
  const f = o.ficha;
  const et = etiqueta(o);
  const specs = Object.entries(f.specs || {});
  const desc = f.resumen || `${o.titulo}: precio verificado, características y opinión antes de comprar en Chile.`;
  const serie = historial.get(o.id) || [];

  // Solo emitimos datos estructurados de review cuando hay una opinion real
  // detras. Inventarlos es exactamente lo que Google penaliza.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: o.titulo,
    ...(o.imagen ? { image: [o.imagen] } : {}),
    ...(f.specs?.Marca && f.specs.Marca !== '-' ? { brand: { '@type': 'Brand', name: f.specs.Marca } } : {}),
    description: f.resumen || undefined,
    ...(typeof f.puntaje === 'number' && f.veredicto
      ? { review: { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: f.puntaje, bestRating: 10, worstRating: 1 },
          author: { '@type': 'Organization', name: cfg.nombre }, datePublished: o.verificadoEl || FECHA, reviewBody: f.veredicto } }
      : {}),
    offers: { '@type': 'Offer', price: o.precio, priceCurrency: cfg.moneda,
      availability: 'https://schema.org/InStock', url: `${base}${destino(o)}` },
  };

  const cuerpo = `<div class="wrap prod">
  <nav class="breadcrumb" aria-label="Miga de pan"><a href="/">Inicio</a> / <a href="/categoria/${esc(slugify(o.categoria))}/">${esc(o.categoria)}</a> / <span>${esc(o.titulo)}</span></nav>
  <div class="prod-grid">
    <div class="prod-media">${media(o, 'prod-img')}</div>
    <div class="prod-info">
      <div class="card-tags"><span class="chip">${esc(o.categoria)}</span><span class="et ${et.clase}">${esc(et.texto)}</span></div>
      <h1>${esc(o.titulo)}</h1>
      ${f.resumen ? `<p class="lead">${esc(f.resumen)}</p>` : ''}
      <p class="precio-grande">${clp(o.precio)}${o.oferta.referencia && o.oferta.tipo !== 'sin-descuento' ? ` <s>${clp(o.oferta.referencia)}</s>` : ''}</p>
      <p class="precio-nota">${esc(et.detalle)}${o.verificadoEl ? ` Confirmado el ${o.verificadoEl}.` : ''}</p>
      <a class="cta" href="${esc(destino(o))}" rel="sponsored nofollow noopener" target="_blank">Ver precio actual en Mercado Libre</a>
      <p class="cta-nota">Enlace de afiliado. Te lleva directo a la publicación.</p>
    </div>
  </div>

  ${f.veredicto ? `<section class="bloque"><h2>Veredicto</h2><p>${esc(f.veredicto)}</p></section>` : ''}
  ${f.paraQuien ? `<section class="bloque"><h2>Para quién es</h2><p>${esc(f.paraQuien)}</p></section>` : ''}
  ${(f.pros?.length || f.contras?.length) ? `<section class="bloque"><h2>Lo bueno y lo malo</h2><div class="pc">
    ${f.pros?.length ? `<div class="pc-col good"><h3>A favor</h3><ul>${f.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${f.contras?.length ? `<div class="pc-col bad"><h3>En contra</h3><ul>${f.contras.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
  </div></section>` : ''}
  ${specs.length ? `<section class="bloque"><h2>Ficha técnica</h2><table class="specs"><tbody>${specs.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join('')}</tbody></table></section>` : ''}

  ${serie.length >= 2 ? `<section class="bloque"><h2>Cómo se movió el precio</h2>
    ${grafico(serie)}
    <p class="fine">${serie.length} ${serie.length === 1 ? 'día observado' : 'días observados'} por nosotros. Mínimo ${clp(Math.min(...serie.map((s) => s[1])))} &middot; máximo ${clp(Math.max(...serie.map((s) => s[1])))}.</p>
  </section>` : ''}

  <section class="bloque cierre">
    <a class="cta" href="${esc(destino(o))}" rel="sponsored nofollow noopener" target="_blank">Ver ${esc(o.titulo)} en Mercado Libre</a>
  </section>
</div>`;

  return layout({ titulo: `${o.titulo} - precio y opinión | ${cfg.nombre}`, descripcion: desc, ruta: `/producto/${o.slug}/`, imagen: o.imagen, jsonLd, cuerpo });
}

/** Grafico de precio en SVG puro: sin librerias, se ve igual sin JavaScript. */
function grafico(serie) {
  const datos = serie.slice(-90);
  if (datos.length < 2) return '';
  const precios = datos.map((d) => d[1]);
  const min = Math.min(...precios), max = Math.max(...precios);
  const rango = max - min || 1;
  const W = 640, H = 140, P = 8;
  const punto = (p, i) => [
    P + (i / (datos.length - 1)) * (W - P * 2),
    H - P - ((p - min) / rango) * (H - P * 2),
  ];
  const linea = precios.map((p, i) => punto(p, i).map((n) => n.toFixed(1)).join(',')).join(' ');
  const area = `${P},${H - P} ${linea} ${W - P},${H - P}`;
  return `<figure class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Historial de precio de los ultimos ${datos.length} dias" preserveAspectRatio="none">
    <polygon points="${area}" class="g-area"></polygon>
    <polyline points="${linea}" class="g-line"></polyline>
  </svg>
  <figcaption><span>${esc(datos[0][0])}</span><span>${esc(datos.at(-1)[0])}</span></figcaption></figure>`;
}

/* ---------- categoria ---------- */

function paginaCategoria(k, nombre, items) {
  const cuerpo = `<div class="wrap">
  <nav class="breadcrumb"><a href="/">Inicio</a> / <span>${esc(nombre)}</span></nav>
  <h1>${esc(nombre)}</h1>
  <p class="lead">${items.length} ${items.length === 1 ? 'producto revisado' : 'productos revisados'} en esta categoría. Precios confirmados el ${esc(FECHA)}.</p>
  <div class="grid">${items.slice(0, 120).map(tarjeta).join('')}</div>
</div>`;
  return layout({
    titulo: `${nombre} en oferta - precios verificados | ${cfg.nombre}`,
    descripcion: `Ofertas de ${nombre} en Chile con precio verificado por nosotros. Revisado el ${FECHA}.`,
    ruta: `/categoria/${k}/`, cuerpo,
    // Las categorias listan productos que no son nuestros: sirven para navegar,
    // no para posicionar. Se dejan fuera del indice a proposito.
    noindex: true,
  });
}

/* ---------- como trabajamos ---------- */

function paginaComoTrabajamos() {
  const cuerpo = `<div class="wrap prosa">
  <h1>Cómo trabajamos</h1>
  <p>${esc(cfg.nombre)} existe para responder una sola pregunta: <strong>&iquest;esta rebaja es de verdad?</strong></p>

  <h2>Qué hacemos todos los días</h2>
  <p>Un proceso automático revisa cada producto del catálogo en Mercado Libre y anota su precio. Esa observación diaria se guarda y se acumula. Con el tiempo tenemos algo que la tienda no muestra: <strong>cuánto costaba ese producto realmente antes de la oferta</strong>.</p>

  <h2>Qué significa cada etiqueta</h2>
  <dl class="etiquetas">
    <dt><span class="et et-fuerte">-30%</span></dt>
    <dd><strong>Rebaja comprobada.</strong> El precio de hoy está un 30% bajo la mediana de lo que costó en los últimos 30 días, medido por nosotros. Es el único caso en que afirmamos un descuento.</dd>
    <dt><span class="et et-fuerte">mínimo histórico</span></dt>
    <dd>Es el precio más bajo que le hemos visto en 90 días, y el producto tuvo variación real de precio en ese período.</dd>
    <dt><span class="et et-suave">-40% de lista</span></dt>
    <dd><strong>Descuento declarado por la tienda</strong>, no verificado por nosotros. Aparece cuando el producto es nuevo en el catálogo y todavía no tenemos suficiente historial. Lo mostramos marcado como lo que es.</dd>
    <dt><span class="et et-ok">precio verificado</span></dt>
    <dd>No hay rebaja, pero confirmamos hoy que el precio es ese y que hay stock.</dd>
    <dt><span class="et et-gris">sin verificar</span></dt>
    <dd>Producto recién agregado que todavía no pasa por nuestra revisión.</dd>
  </dl>

  <h2>Qué dejamos fuera</h2>
  <ul>
    <li>Si el precio tachado por el vendedor es más alto que cualquier precio que le hayamos visto, <strong>no publicamos ese porcentaje</strong>. Es el truco más común: subir el precio dos semanas antes para poder bajarlo.</li>
    <li>Si la publicación se pausa o se queda sin stock, sale del sitio ese mismo día.</li>
    <li>Si un producto lleva mas de ${cfg.verificacion?.diasParaCaducar ?? 5} días sin que podamos confirmarlo, deja de mostrarse. Preferimos publicar menos ofertas que publicar una que ya no existe.</li>
    <li>Solo escribimos opinión sobre productos que conocemos. Las fichas con veredicto son ${fichas.length}; el resto del catálogo se muestra con su precio verificado y nada más.</li>
  </ul>

  <h2>Cómo nos financiamos</h2>
  <p>${esc(cfg.disclosure)}</p>
  <p>Para que quede claro: la comision <strong>no decide que se publica</strong>. Un producto entra al sitio si su precio está verificado, y solo entre ofertas de calidad parecida se prioriza la que deja más margen. Un producto que paga bien pero cuya rebaja no podemos comprobar no sube por pagar bien.</p>

  <h2>Contacto</h2>
  <p>Escribinos a <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>.</p>
</div>`;
  return layout({ titulo: `Cómo trabajamos | ${cfg.nombre}`, descripcion: 'Como verificamos que una rebaja sea real y por que dejamos productos fuera.', ruta: '/como-trabajamos/', cuerpo });
}

/* ---------- redirecciones de afiliado ---------- */

function generarRedirects() {
  const code = cfg.redireccion?.codigo || 302;
  const l = [
    '# Generado por src/build.mjs. No lo edites a mano.',
    '# Cada link corto vive en tu dominio: podes compartirlo donde sea y cambiar',
    '# el destino despues sin volver a tocar el contenido ya publicado.',
    '',
  ];
  const puestos = new Set();
  for (const o of ofertas) {
    if (!o.link || puestos.has(o.slug)) continue;
    puestos.add(o.slug);
    l.push(`${PREF}/${o.slug}    ${o.link}    ${code}!`);
    for (const [canal, link] of Object.entries(o.linksPorCanal || {})) {
      if (link) l.push(`${PREF}/${o.slug}/${canal}    ${link}    ${code}!`);
    }
    // Cualquier canal sin link propio cae al link principal.
    l.push(`${PREF}/${o.slug}/*    ${o.link}    ${code}!`);
  }
  l.push('', '/404    /404.html    404');
  // Netlify recomienda optimizar recien pasadas las ~10.000 reglas. Avisamos
  // antes de llegar, porque para entonces conviene pasar /ir/* a una edge
  // function con un mapa de slugs en vez de una regla por producto.
  const reglas = l.filter((x) => x.startsWith(PREF)).length;
  if (reglas > 8000) avisos.push(`${reglas} reglas de redireccion: acercandose al limite comodo de Netlify. Conviene mover ${PREF}/* a una edge function.`);
  return l.join('\n') + '\n';
}

/* ---------- salida ---------- */

const write = (rel, contenido) => {
  const d = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.writeFileSync(d, contenido);
};

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

write('index.html', paginaInicio());
write('ofertas/index.html', paginaFeed());
write('como-trabajamos/index.html', paginaComoTrabajamos());
for (const o of fichas) write(`producto/${o.slug}/index.html`, paginaProducto(o));
for (const [k, { nombre, items }] of porCategoria) write(`categoria/${k}/index.html`, paginaCategoria(k, nombre, items));

write('404.html', layout({
  titulo: `Página no encontrada | ${cfg.nombre}`, descripcion: 'Esta página no existe.', ruta: '/404', noindex: true,
  cuerpo: '<div class="wrap prosa"><h1>No encontramos esta página</h1><p>Puede que la oferta haya vencido. <a href="/ofertas/">Ver las de hoy</a>.</p></div>',
}));

// El feed carga el resto por aca en vez de escribir 900 tarjetas en el HTML.
write('api/ofertas.json', JSON.stringify({
  fecha: FECHA,
  total: ofertas.length,
  ofertas: ofertas.slice(0, cfg.feed?.maximo ?? 300).map((o) => ({
    slug: o.slug, titulo: o.titulo, categoria: o.categoria, precio: o.precio,
    referencia: o.oferta.tipo !== 'sin-descuento' ? o.oferta.referencia : null,
    etiqueta: etiqueta(o), imagen: o.imagen, nota: o.nota,
    ficha: o.ficha ? `/producto/${o.slug}/` : null, ir: destino(o),
  })),
}));

// Solo las fichas con opinion propia entran al sitemap. Llenar Google de
// paginas de afiliado sin contenido propio es la forma mas rapida de que el
// sitio entero deje de posicionar.
const urls = [
  { loc: `${base}/`, pri: '1.0', lastmod: FECHA },
  { loc: `${base}/ofertas/`, pri: '0.9', lastmod: FECHA },
  { loc: `${base}/como-trabajamos/`, pri: '0.4' },
  ...fichas.map((o) => ({ loc: `${base}/producto/${o.slug}/`, pri: '0.8', lastmod: o.verificadoEl || FECHA })),
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);

write('robots.txt', `User-agent: *\nAllow: /\nDisallow: ${PREF}/\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`);
write('_redirects', generarRedirects());

for (const f of fs.existsSync(path.join(ROOT, 'public')) ? fs.readdirSync(path.join(ROOT, 'public')) : []) {
  fs.copyFileSync(path.join(ROOT, 'public', f), path.join(DIST, f));
}

/* ---------- informe ---------- */

const tipos = {};
for (const o of ofertas) tipos[o.oferta.tipo] = (tipos[o.oferta.tipo] || 0) + 1;

console.log(`
Sitio construido en dist/  ·  ${FECHA}
  ${ofertas.length} producto(s) publicado(s) de ${catalogo.length} en catalogo
  ${fichas.length} ficha(s) con opinion propia y pagina indexable
  ${verificadas.length} con precio confirmado por el verificador
  ${rebajadas.length} con rebaja que podemos demostrar
  ${porCategoria.size} categoria(s)

  Etiquetas:  ${Object.entries(tipos).map(([k, v]) => `${k}=${v}`).join('  ') || '-'}
  Descartes:  caducados=${descartes.caducado}  sin stock=${descartes.sinStock}  sin verificar=${descartes.sinVerificar}  sin precio=${descartes.sinPrecio}`);

if (avisos.length) {
  console.log('\nAvisos:');
  for (const a of avisos.slice(0, 15)) console.log('  ! ' + a);
  if (avisos.length > 15) console.log(`  ... y ${avisos.length - 15} aviso(s) mas`);
}
console.log('');
