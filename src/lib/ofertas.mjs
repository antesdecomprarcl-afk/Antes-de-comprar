// Motor de ofertas.
//
// El sitio promete una sola cosa: que la rebaja sea real. Este archivo es donde
// esa promesa se cumple o se rompe, asi que la regla es explicita:
//
//   Un descuento solo se publica como "verificado" cuando lo demuestra NUESTRO
//   propio historial de precios, no el precio tachado que declara la tienda.
//
// El precio tachado de Mercado Libre es dato del vendedor. El truco clasico es
// subirlo dos semanas antes para poder "rebajarlo" despues. Contra eso solo
// sirve haber estado mirando: por eso guardamos una observacion por dia y
// comparamos contra la mediana de los ultimos 30 dias y el minimo de los 90.

export const CFG = {
  minObservaciones: 5,   // dias distintos observados para hablar de descuento propio
  diasMediana: 30,
  diasMinimo: 90,
  umbralDescuento: 0.07, // 7%: menos que eso no es noticia
  margenMinimo: 1.01,    // "esta en su minimo" tolera 1% de ruido
  variacionMinima: 1.10, // sin al menos 10% de recorrido, no hay "minimo" que anunciar
  caidaMinima: 0.05,     // y hoy tiene que estar 5% bajo su precio habitual
  margenInflado: 1.15,   // precio de lista 15% sobre el maximo real = inflado
  maxHistorial: 180,     // dias de historial que guardamos por producto
};

/** Agrega una observacion de precio. Una por producto por dia: la ultima gana. */
export function registrarPrecio(serie = [], fecha, precio, cfg = CFG) {
  if (!Number.isFinite(precio) || precio <= 0) return serie;
  const sinHoy = serie.filter(([f]) => f !== fecha);
  const nueva = [...sinHoy, [fecha, Math.round(precio)]].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return nueva.slice(-cfg.maxHistorial);
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};

/** Estadisticas de la serie en la ventana de los ultimos `dias`. */
export function estadisticas(serie = [], dias, referencia) {
  // La ventana incluye el dia de referencia: "ultimos 30 dias" son 30 dias
  // contando hoy, no 31.
  const corte = new Date(Date.parse(referencia + 'T00:00:00Z') - (dias - 1) * 86400000)
    .toISOString().slice(0, 10);
  const precios = serie.filter(([f]) => f >= corte).map(([, p]) => p);
  if (!precios.length) return { n: 0, min: null, max: null, mediana: null };
  return { n: precios.length, min: Math.min(...precios), max: Math.max(...precios), mediana: mediana(precios) };
}

/**
 * Evalua si el precio actual es una oferta y de que tipo.
 *
 * tipo:
 *   'verificado'        rebaja demostrada contra nuestro propio historial
 *   'minimo-historico'  el precio mas bajo que le hemos visto en 90 dias
 *   'lista'             solo tenemos el precio tachado de la tienda (sin historial propio)
 *   'sin-descuento'     precio normal; se publica igual, sin inventar un porcentaje
 */
export function evaluar({ precio, precioLista = null, serie = [], fecha, cfg = CFG }) {
  const m30 = estadisticas(serie, cfg.diasMediana, fecha);
  const m90 = estadisticas(serie, cfg.diasMinimo, fecha);
  const propio = m30.n >= cfg.minObservaciones;

  // El precio de lista de la tienda solo se cree si el producto realmente
  // estuvo cerca de ese valor alguna vez en los ultimos 90 dias.
  const inflado = Boolean(precioLista && m90.max && precioLista > m90.max * cfg.margenInflado);

  const descuentoPropio = propio && m30.mediana > 0 ? (m30.mediana - precio) / m30.mediana : 0;
  const descuentoLista = precioLista && precioLista > precio ? (precioLista - precio) / precioLista : 0;
  // Un precio que nunca se movio esta, trivialmente, en su minimo. Y un
  // producto que oscila un 2% tambien toca su minimo cada dos por tres:
  // anunciar eso como "minimo historico" seria ruido disfrazado de noticia.
  // Exigimos dos cosas: que el precio haya tenido recorrido real en 90 dias, y
  // que hoy este claramente por debajo de lo que cuesta habitualmente.
  const tuvoRecorrido = Boolean(m90.max && m90.min && m90.max >= m90.min * cfg.variacionMinima);
  const bajoLoHabitual = descuentoPropio >= cfg.caidaMinima;
  const enMinimo = Boolean(
    m90.min && m90.n >= cfg.minObservaciones && tuvoRecorrido && bajoLoHabitual &&
    precio <= m90.min * cfg.margenMinimo
  );

  let tipo = 'sin-descuento';
  let descuento = 0;
  let ahorro = 0;
  let referencia = null;

  if (propio && descuentoPropio >= cfg.umbralDescuento) {
    tipo = 'verificado';
    descuento = descuentoPropio;
    ahorro = m30.mediana - precio;
    referencia = m30.mediana;
  } else if (enMinimo) {
    tipo = 'minimo-historico';
    descuento = descuentoPropio > 0 ? descuentoPropio : 0;
    ahorro = Math.max(0, (m30.mediana || precio) - precio);
    referencia = m30.mediana;
  } else if (!propio && !inflado && descuentoLista >= cfg.umbralDescuento) {
    tipo = 'lista';
    descuento = descuentoLista;
    ahorro = precioLista - precio;
    referencia = precioLista;
  }

  return {
    tipo,
    descuento: Math.round(descuento * 100) / 100,
    porcentaje: Math.round(descuento * 100),
    ahorro: Math.round(ahorro),
    referencia,
    inflado,
    enMinimo,
    observaciones: m30.n,
    min90: m90.min,
    max90: m90.max,
    mediana30: m30.mediana,
    confianza: m30.n >= 14 ? 'alta' : m30.n >= cfg.minObservaciones ? 'media' : 'baja',
  };
}

/**
 * Puntaje para ordenar el feed. Manda la calidad de la oferta; la comision
 * solo desempata entre ofertas parecidas. Nunca al reves: un producto no sube
 * en el feed por pagar mejor si la rebaja no esta comprobada.
 */
export function puntuar({ oferta, comision = 0, precio = 0 }) {
  const porCalidad = { verificado: 100, 'minimo-historico': 70, lista: 35, 'sin-descuento': 0 }[oferta.tipo] ?? 0;
  const porConfianza = { alta: 25, media: 12, baja: 0 }[oferta.confianza] ?? 0;
  // El porcentaje pesa segun cuanto podamos sostenerlo. Un "-70%" declarado por
  // el vendedor no puede empujar un producto tan arriba como un -70% que
  // medimos nosotros: si pesaran igual, el feed terminaria liderado justamente
  // por los descuentos que el sitio existe para desconfiar.
  const credibilidad = { verificado: 1, 'minimo-historico': 1, lista: 0.35, 'sin-descuento': 0 }[oferta.tipo] ?? 0;
  const porRebaja = Math.min(oferta.porcentaje, 70) * credibilidad;
  // Ahorro en pesos, comprimido: mil pesos de rebaja en algo barato no puede
  // pesar lo mismo que cincuenta mil, pero tampoco cien veces mas.
  const porAhorro = oferta.ahorro > 0 ? Math.min(25, Math.log10(oferta.ahorro) * 6) : 0;
  // Desempate economico: lo que deja la venta, tambien comprimido.
  const ganancia = (precio * comision) / 100;
  const porGanancia = ganancia > 0 ? Math.min(15, Math.log10(ganancia) * 4) : 0;
  return Math.round((porCalidad + porConfianza + porRebaja + porAhorro + porGanancia) * 10) / 10;
}

/** Ganancia estimada por venta, en pesos. */
export const ganancia = (precio, comision) =>
  Number.isFinite(precio) && Number.isFinite(comision) ? Math.round((precio * comision) / 100) : 0;
