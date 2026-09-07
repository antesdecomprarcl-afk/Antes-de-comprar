// Une catalogo + estado verificado + historial en una sola lista de ofertas,
// que es lo unico que el generador necesita saber.
//
// Aca se decide que se publica y que no. La regla de fondo: si no podemos
// confirmar que el producto existe y a que precio, no va al sitio.
import { diasEntre, hoy } from './util.mjs';
import { evaluar, puntuar, ganancia, CFG } from './ofertas.mjs';

export function componer({ catalogo, productos, estado, historial, categorias, cfg, fecha = hoy() }) {
  const v = { maxFallos: 3, diasParaCaducar: 5, mostrarSinVerificar: true, ...(cfg.verificacion || {}) };
  const fichaPorId = new Map(productos.filter((p) => p.mlId).map((p) => [p.mlId, p]));
  const descartes = { caducado: 0, sinStock: 0, sinVerificar: 0, sinPrecio: 0 };

  const ofertas = [];
  for (const item of catalogo) {
    const e = estado[item.id] || null;
    const ficha = fichaPorId.get(item.id) || null;

    // Sin verificacion previa: solo se publica en modo arranque, y siempre
    // marcado como no verificado. Nunca se le atribuye una rebaja.
    if (!e || !e.verificado) {
      if (!v.mostrarSinVerificar || !item.hub?.precio) { descartes.sinVerificar++; continue; }
      // Mostramos el precio tachado que traia el catalogo para que se vea de
      // donde viene el numero, pero la etiqueta dira "sin verificar": todavia
      // no es una rebaja que podamos sostener.
      const lista = item.hub.precioLista;
      ofertas.push(armar({ item, ficha, precio: item.hub.precio, precioLista: lista, verificado: false,
        oferta: evaluar({ precio: item.hub.precio, precioLista: lista, serie: [], fecha }), categorias, e: null, fecha }));
      continue;
    }

    if (diasEntre(e.verificado, fecha) > v.diasParaCaducar || (e.fallos || 0) >= v.maxFallos) { descartes.caducado++; continue; }
    if (!e.disponible) { descartes.sinStock++; continue; }
    if (!e.precio) { descartes.sinPrecio++; continue; }

    const oferta = evaluar({ precio: e.precio, precioLista: e.precioLista, serie: historial.get(item.id) || [], fecha, cfg: CFG });
    ofertas.push(armar({ item, ficha, precio: e.precio, precioLista: e.precioLista, verificado: true, oferta, categorias, e, fecha }));
  }

  ofertas.sort((a, b) => b.puntaje - a.puntaje || a.precio - b.precio);
  return { ofertas, descartes };
}

function armar({ item, ficha, precio, precioLista, verificado, oferta, categorias, e, fecha }) {
  // La categoria que declara Mercado Libre le gana a la que adivinamos por el
  // titulo: es la del propio vendedor y se corrige sola con cada verificacion.
  const categoria = (e && e.categoriaId && categorias[e.categoriaId]) || item.categoria;
  return {
    id: item.id,
    slug: ficha ? ficha.slug : item.slug,
    titulo: (ficha && ficha.titulo) || (e && e.titulo) || item.titulo,
    categoria,
    link: item.link,
    linksPorCanal: ficha?.linksPorCanal || null,
    comision: item.comision,
    precio,
    precioLista,
    imagen: (e && e.imagen) || ficha?.imagen || null,
    permalink: e?.permalink || null,
    verificado,
    verificadoEl: e?.verificado || null,
    vendidos: e?.vendidos ?? null,
    fuente: e?.fuente || null,
    oferta,
    ganancia: ganancia(precio, item.comision),
    // Las fichas llevan opinion escrita por nosotros y pagina propia.
    ficha: ficha ? { slug: ficha.slug, resumen: ficha.resumen, veredicto: ficha.veredicto, pros: ficha.pros, contras: ficha.contras, specs: ficha.specs, paraQuien: ficha.paraQuien, puntaje: ficha.puntaje } : null,
    nota: ficha?.resumen || null,
    puntaje: puntuar({ oferta, comision: item.comision, precio }) + (ficha ? 40 : 0),
  };
}

/** Etiqueta honesta para la tarjeta, segun lo que realmente podemos afirmar. */
export function etiqueta(o) {
  if (!o.verificado) return { texto: 'sin verificar', clase: 'et-gris', detalle: 'Precio de catálogo, todavía sin confirmar por nosotros.' };
  switch (o.oferta.tipo) {
    case 'verificado':
      return { texto: `-${o.oferta.porcentaje}%`, clase: 'et-fuerte',
        detalle: `Bajó ${o.oferta.porcentaje}% respecto de lo que costaba habitualmente en los últimos 30 días.` };
    case 'minimo-historico':
      return { texto: 'mínimo histórico', clase: 'et-fuerte', detalle: 'Es el precio más bajo que le hemos visto en 90 días.' };
    case 'lista':
      return { texto: `-${o.oferta.porcentaje}% de lista`, clase: 'et-suave',
        detalle: 'Descuento declarado por la tienda. Todavía no tenemos historial propio para confirmarlo.' };
    default:
      return { texto: 'precio verificado', clase: 'et-ok', detalle: 'Confirmamos hoy que este es el precio y que hay stock.' };
  }
}
