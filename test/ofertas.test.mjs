// Tests del motor de ofertas: es la parte del sistema que decide si le decimos
// al usuario "esto esta rebajado". Si esto se rompe, el sitio miente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarPrecio, estadisticas, evaluar, puntuar, CFG } from '../src/lib/ofertas.mjs';

/** Serie de precios diaria terminando en `fin`. */
function serie(precios, fin = '2026-09-07') {
  const base = Date.parse(fin + 'T00:00:00Z');
  return precios.map((p, i) => [
    new Date(base - (precios.length - 1 - i) * 86400000).toISOString().slice(0, 10),
    p,
  ]);
}

test('registrarPrecio guarda una sola observacion por dia', () => {
  let s = registrarPrecio([], '2026-09-07', 1000);
  s = registrarPrecio(s, '2026-09-07', 1200);
  assert.equal(s.length, 1);
  assert.equal(s[0][1], 1200, 'la ultima lectura del dia manda');
});

test('registrarPrecio ignora precios invalidos y recorta el historial', () => {
  assert.deepEqual(registrarPrecio([], '2026-09-07', 0), []);
  assert.deepEqual(registrarPrecio([], '2026-09-07', NaN), []);
  const larga = serie(Array.from({ length: 200 }, (_, i) => 1000 + i));
  const s = registrarPrecio(larga, '2026-09-08', 999);
  assert.equal(s.length, CFG.maxHistorial);
  assert.equal(s.at(-1)[1], 999);
});

test('estadisticas respeta la ventana de dias', () => {
  const s = serie([100, 100, 100, 500, 500]); // los 500 son los 2 dias mas recientes
  const e = estadisticas(s, 2, '2026-09-07');
  assert.equal(e.n, 2);
  assert.equal(e.min, 500);
});

test('descuento verificado: el precio baja bajo su propia mediana', () => {
  const s = serie([20000, 20000, 20000, 20000, 20000, 20000, 14000]);
  const r = evaluar({ precio: 14000, precioLista: 20000, serie: s, fecha: '2026-09-07' });
  assert.equal(r.tipo, 'verificado');
  assert.equal(r.porcentaje, 30);
  assert.equal(r.ahorro, 6000);
  assert.equal(r.inflado, false);
});

test('precio de lista inflado: no se publica ese descuento', () => {
  // Nunca costo mas de 21.000, pero el vendedor tacha 60.000.
  const s = serie([20000, 21000, 20000, 20500, 20000, 20000, 19900]);
  const r = evaluar({ precio: 19900, precioLista: 60000, serie: s, fecha: '2026-09-07' });
  assert.equal(r.inflado, true, 'debe detectar el precio tachado falso');
  assert.notEqual(r.tipo, 'lista', 'no puede publicar el 67% inventado');
  assert.ok(r.porcentaje < 10);
});

test('sin historial propio, el precio de lista se usa pero se marca como tal', () => {
  const r = evaluar({ precio: 7990, precioLista: 13990, serie: [], fecha: '2026-09-07' });
  assert.equal(r.tipo, 'lista');
  assert.equal(r.confianza, 'baja');
  assert.equal(r.porcentaje, 43);
});

test('una caida de 3% sobre un precio plano no alcanza para anunciar nada', () => {
  // Es el minimo que le hemos visto, si. Pero el producto nunca se movio y la
  // caida es del 3%: llamar a eso "minimo historico" infla una noticia que no
  // existe, y el sitio vive de no hacer eso.
  const s = serie([10000, 10000, 10000, 10000, 10000, 9700]);
  const r = evaluar({ precio: 9700, precioLista: null, serie: s, fecha: '2026-09-07' });
  assert.equal(r.tipo, 'sin-descuento');
});

test('precio estable no se disfraza de oferta', () => {
  const s = serie([10000, 10000, 10000, 10000, 10000, 10000]);
  const r = evaluar({ precio: 10000, precioLista: null, serie: s, fecha: '2026-09-07' });
  assert.equal(r.tipo, 'sin-descuento');
  assert.equal(r.porcentaje, 0);
});

test('la confianza sube con la cantidad de dias observados', () => {
  const pocos = evaluar({ precio: 100, serie: serie([100, 100, 100, 100, 100]), fecha: '2026-09-07' });
  const muchos = evaluar({ precio: 100, serie: serie(Array(20).fill(100)), fecha: '2026-09-07' });
  assert.equal(pocos.confianza, 'media');
  assert.equal(muchos.confianza, 'alta');
});

test('la comision no puede levantar una oferta peor por sobre una verificada', () => {
  const verificada = evaluar({ precio: 14000, serie: serie([20000, 20000, 20000, 20000, 20000, 14000]), fecha: '2026-09-07' });
  const soloLista = evaluar({ precio: 90000, precioLista: 130000, serie: [], fecha: '2026-09-07' });
  const buena = puntuar({ oferta: verificada, comision: 7, precio: 14000 });
  const jugosa = puntuar({ oferta: soloLista, comision: 16, precio: 90000 });
  assert.ok(buena > jugosa, `la verificada (${buena}) debe ganarle a la comisionable (${jugosa})`);
});

test('entre dos ofertas iguales, gana la que deja mas comision', () => {
  const o = evaluar({ precio: 20000, serie: serie([30000, 30000, 30000, 30000, 30000, 20000]), fecha: '2026-09-07' });
  assert.ok(puntuar({ oferta: o, comision: 16, precio: 20000 }) > puntuar({ oferta: o, comision: 7, precio: 20000 }));
});

test('un vaiven de 2% no se anuncia como minimo historico', () => {
  // Precio que oscila apenas: hoy toca el piso, pero ese piso es su precio normal.
  const s = serie([10000, 10200, 10000, 10150, 10050, 10000, 9990]);
  const r = evaluar({ precio: 9990, precioLista: null, serie: s, fecha: '2026-09-07' });
  assert.equal(r.tipo, 'sin-descuento', 'el ruido de precio no es una oferta');
});

test('minimo historico exige recorrido real y caida clara', () => {
  // Vario entre 8.000 y 12.000, y hoy esta en 7.900: eso si es noticia.
  const s = serie([12000, 11000, 12000, 10000, 11500, 12000, 7900]);
  const r = evaluar({ precio: 7900, precioLista: null, serie: s, fecha: '2026-09-07' });
  assert.ok(['minimo-historico', 'verificado'].includes(r.tipo));
  assert.equal(r.enMinimo, true);
});

test('un descuento declarado por la tienda pesa menos que uno medido por nosotros', () => {
  // Mismo -50%: uno lo dice el vendedor, el otro lo medimos con historial.
  const declarado = evaluar({ precio: 5000, precioLista: 10000, serie: [], fecha: '2026-09-07' });
  const medido = evaluar({ precio: 5000, serie: serie([10000, 10000, 10000, 10000, 10000, 5000]), fecha: '2026-09-07' });
  assert.equal(declarado.porcentaje, 50);
  assert.equal(medido.porcentaje, 50);
  assert.ok(
    puntuar({ oferta: medido, comision: 11, precio: 5000 }) > puntuar({ oferta: declarado, comision: 11, precio: 5000 }),
    'el feed no puede quedar liderado por los descuentos que no podemos sostener'
  );
});
