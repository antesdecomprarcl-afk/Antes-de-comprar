// Cliente de Mercado Libre para verificar precio, stock y links.
//
// No damos por sentado que un solo camino funcione: Mercado Libre cambia las
// condiciones de su API cada cierto tiempo, y el sitio no se puede caer por eso.
// Se intenta en orden, y el primero que responde gana:
//
//   1. API con token   (rapida, 20 productos por llamada, dato oficial)
//   2. API sin token   (mismo endpoint; sirve mientras siga siendo publico)
//   3. Pagina publica  (leemos los datos estructurados del HTML)
//
// Cada resultado dice de donde salio (`fuente`) para poder auditarlo despues.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ATRIBUTOS = 'id,title,price,original_price,base_price,currency_id,status,sub_status,available_quantity,sold_quantity,permalink,thumbnail,pictures,category_id,condition,shipping';

export const API = 'https://api.mercadolibre.com';

/** Normaliza cualquier respuesta a la misma forma. */
function normalizar(x, fuente) {
  const precio = num(x.price);
  const lista = num(x.original_price) ?? num(x.base_price);
  return {
    id: x.id || null,
    titulo: x.title || null,
    precio,
    // El precio de lista solo tiene sentido si es mayor al actual.
    precioLista: lista && precio && lista > precio ? lista : null,
    moneda: x.currency_id || 'CLP',
    estado: x.status || null,
    subEstado: Array.isArray(x.sub_status) ? x.sub_status : [],
    stock: num(x.available_quantity),
    vendidos: num(x.sold_quantity),
    permalink: x.permalink || null,
    imagen: x.thumbnail ? x.thumbnail.replace(/^http:/, 'https:').replace(/-[IVOSNW]\.(jpg|webp|png)$/i, '-O.$1') : null,
    categoriaId: x.category_id || null,
    fuente,
  };
}

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** `MLC48927241` -> `MLC-48927241`, que es la forma que aceptan las URLs. */
export const idConGuion = (id) => String(id).replace(/^([A-Z]+?)(\d)/, '$1-$2');

/** URL de la ficha publica a partir del ID. */
export const urlItem = (id, sitio = 'cl') => `https://articulo.mercadolibre.${sitio}/${idConGuion(id)}-_JM`;

/** Saca el ID de Mercado Libre de cualquier URL. */
export function extraerId(url = '') {
  const m = String(url).match(/\b(ML[A-Z]{1,2}?-?\d{6,})\b/i);
  return m ? m[1].toUpperCase().replace('-', '') : null;
}

/** Lee los datos del producto desde el HTML de su ficha publica. */
export function parsearPagina(html, id = null) {
  if (!html) return null;
  const salida = { id };

  // 1. Datos estructurados: es lo que Mercado Libre le entrega a Google, asi
  //    que es lo mas estable que publica la pagina.
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let json;
    try { json = JSON.parse(m[1].trim()); } catch { continue; }
    for (const nodo of [].concat(json['@graph'] || json)) {
      if (!nodo || nodo['@type'] !== 'Product') continue;
      const of = [].concat(nodo.offers || [])[0] || {};
      salida.titulo = nodo.name || salida.titulo;
      salida.price = of.price ?? of.lowPrice ?? salida.price;
      salida.currency_id = of.priceCurrency || salida.currency_id;
      const img = [].concat(nodo.image || [])[0];
      if (img) salida.thumbnail = typeof img === 'string' ? img : img.url;
      if (of.availability) {
        salida.status = /InStock|LimitedAvailability|PreOrder/i.test(of.availability) ? 'active' : 'paused';
        salida.available_quantity = /InStock|LimitedAvailability/i.test(of.availability) ? 1 : 0;
      }
    }
  }

  // 2. Microdatos y meta: respaldo cuando no hay ld+json.
  if (salida.price == null) {
    const meta = html.match(/<meta[^>]+itemprop="price"[^>]+content="([\d.,]+)"/i)
      || html.match(/property="product:price:amount"[^>]+content="([\d.,]+)"/i)
      || html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
    if (meta) salida.price = Number(String(meta[1]).replace(/\./g, '').replace(',', '.'));
  }
  if (!salida.titulo) {
    const t = html.match(/<h1[^>]*class="[^"]*ui-pdp-title[^"]*"[^>]*>([^<]+)</i) || html.match(/<title>([^<]+)</i);
    if (t) salida.titulo = t[1].trim().replace(/\s*\|\s*Mercado ?Libre.*$/i, '');
  }
  // El precio tachado aparece como "original_price" en el estado precargado.
  const orig = html.match(/"original_price"\s*:\s*(\d+(?:\.\d+)?)/);
  if (orig) salida.original_price = Number(orig[1]);

  // 3. Senales de que la publicacion ya no esta viva.
  if (/Publicaci[oó]n (pausada|finalizada)|ui-pdp-status|no est[aá] disponible/i.test(html) && !salida.price) {
    salida.status = 'closed';
    salida.available_quantity = 0;
  }
  if (!salida.price) return null;

  salida.title = salida.titulo;
  salida.status = salida.status || 'active';
  return normalizar(salida, 'pagina');
}

export function crearCliente({
  token = null,
  clientId = null,
  clientSecret = null,
  refreshToken = null,
  fetchImpl = globalThis.fetch,
  sitio = 'cl',
  timeout = 20000,
  log = () => {},
} = {}) {
  let accessToken = token;
  const estrategiasCaidas = new Set();

  async function pedir(url, opciones = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      return await fetchImpl(url, {
        redirect: 'follow',
        ...opciones,
        signal: ctl.signal,
        headers: { 'user-agent': UA, 'accept-language': 'es-CL,es;q=0.9', ...(opciones.headers || {}) },
      });
    } finally {
      clearTimeout(t);
    }
  }

  /** Renueva el access token. Los de Mercado Libre duran 6 horas. */
  async function renovarToken() {
    if (!clientId || !clientSecret || !refreshToken) return null;
    const cuerpo = new URLSearchParams({
      grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken,
    });
    const r = await pedir(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: cuerpo,
    });
    if (!r.ok) { log(`no se pudo renovar el token (HTTP ${r.status})`); return null; }
    const j = await r.json();
    accessToken = j.access_token || null;
    // El refresh token de Mercado Libre es de un solo uso: hay que guardar el nuevo.
    return { accessToken, refreshToken: j.refresh_token || refreshToken };
  }

  const auth = () => (accessToken ? { authorization: `Bearer ${accessToken}` } : {});

  /** Estrategia 1 y 2: multiget de la API (hasta 20 IDs por llamada). */
  async function porApi(ids) {
    if (estrategiasCaidas.has('api')) return null;
    const url = `${API}/items?ids=${ids.join(',')}&attributes=${ATRIBUTOS}`;
    const r = await pedir(url, { headers: { accept: 'application/json', ...auth() } });
    if (r.status === 401 || r.status === 403) {
      if (accessToken || !refreshToken) { estrategiasCaidas.add('api'); log(`API rechazada (HTTP ${r.status}); paso a leer la pagina publica`); return null; }
      const nuevo = await renovarToken();
      if (!nuevo) { estrategiasCaidas.add('api'); return null; }
      return porApi(ids);
    }
    if (!r.ok) { log(`API respondio HTTP ${r.status}`); return null; }
    const cuerpo = await r.json();
    const filas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    const out = new Map();
    for (const f of filas) {
      if (f && f.code === 200 && f.body) out.set(f.body.id, normalizar(f.body, accessToken ? 'api' : 'api-publica'));
      else if (f && f.body && f.body.id) out.set(f.body.id, { id: f.body.id, error: `HTTP ${f.code}` });
    }
    return out;
  }

  /** Estrategia 3: leer la ficha publica. */
  async function porPagina(id, permalink = null) {
    const url = permalink || urlItem(id, sitio);
    const r = await pedir(url, { headers: { accept: 'text/html' } });
    if (!r.ok) return { id, error: `pagina HTTP ${r.status}` };
    const html = await r.text();
    const dato = parsearPagina(html, id);
    return dato || { id, error: 'no encontre el precio en la pagina' };
  }

  /** Sigue un link corto (meli.la) hasta la publicacion y devuelve el ID. */
  async function resolverCorto(url) {
    try {
      const r = await pedir(url, { headers: { accept: 'text/html' } });
      const destino = r.url || url;
      const id = extraerId(destino);
      if (id) return { id, destino };
      const html = await r.text();
      return { id: extraerId(html), destino };
    } catch (err) {
      return { id: null, error: err.message };
    }
  }

  /**
   * Consulta un lote de productos. Devuelve un Map id -> dato normalizado
   * (o `{ id, error }` para los que no se pudieron verificar).
   */
  async function consultar(ids, { permalinks = {} } = {}) {
    const salida = new Map();
    const pendientes = [];

    for (let i = 0; i < ids.length; i += 20) {
      const lote = ids.slice(i, i + 20);
      let res = null;
      try { res = await porApi(lote); } catch (err) { log(`API fallo: ${err.message}`); }
      if (res) {
        for (const id of lote) {
          const d = res.get(id);
          if (d && !d.error) salida.set(id, d);
          else pendientes.push(id);
        }
      } else {
        pendientes.push(...lote);
      }
    }

    for (const id of pendientes) {
      try { salida.set(id, await porPagina(id, permalinks[id])); }
      catch (err) { salida.set(id, { id, error: err.message }); }
    }
    return salida;
  }

  /** Nombre legible de una categoria de Mercado Libre. */
  async function nombreCategoria(catId) {
    try {
      const r = await pedir(`${API}/categories/${catId}`, { headers: { accept: 'application/json', ...auth() } });
      if (!r.ok) return null;
      const j = await r.json();
      const ruta = j.path_from_root || [];
      // El segundo nivel es el util: "Herramientas" en vez de "Taladros percutores".
      return (ruta[1] || ruta[0] || j).name || null;
    } catch { return null; }
  }

  return { consultar, porApi, porPagina, resolverCorto, nombreCategoria, renovarToken, get token() { return accessToken; } };
}
