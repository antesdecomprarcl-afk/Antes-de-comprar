// Tests de las reglas de publicacion: que producto entra al sitio y cual no.
// Es la otra mitad de la promesa del sitio — de nada sirve medir bien el
// descuento si despues publicamos algo que ya no existe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componer, etiqueta } from '../src/lib/componer.mjs';

const HOY = '2026-09-07';
const cfg = { verificacion: { maxFallos: 3, diasParaCaducar: 5, mostrarSinVerificar: true } };

const producto = (id, extra = {}) => ({
  id, slug: 'p-' + id.toLowerCase(), titulo: 'Producto ' + id, categoria: 'Cocina',
  comision: 11, link: 'https://meli.la/' + id, codigo: 'X', hub: { precio: 10000, precioLista: 15000 }, ...extra,
});
const correr = (catalogo, estado = {}, productos = [], historial = new Map()) =>
  componer({ catalogo, productos, estado, historial, categorias: {}, cfg, fecha: HOY });

test('un producto sin stock no se publica', () => {
  const { ofertas, descartes } = correr([producto('MLC1')], {
    MLC1: { id: 'MLC1', verificado: HOY, precio: 9000, disponible: false },
  });
  assert.equal(ofertas.length, 0);
  assert.equal(descartes.sinStock, 1);
});

test('un producto sin confirmar hace mas de 5 dias sale del sitio', () => {
  const { ofertas, descartes } = correr([producto('MLC1')], {
    MLC1: { id: 'MLC1', verificado: '2026-08-30', precio: 9000, disponible: true },
  });
  assert.equal(ofertas.length, 0);
  assert.equal(descartes.caducado, 1);
});

test('un producto con fallos repetidos sale del sitio', () => {
  const { ofertas, descartes } = correr([producto('MLC1')], {
    MLC1: { id: 'MLC1', verificado: HOY, precio: 9000, disponible: true, fallos: 3 },
  });
  assert.equal(ofertas.length, 0);
  assert.equal(descartes.caducado, 1);
});

test('sin verificar todavia, se publica pero marcado como tal', () => {
  const { ofertas } = correr([producto('MLC1')]);
  assert.equal(ofertas.length, 1);
  assert.equal(ofertas[0].verificado, false);
  assert.equal(etiqueta(ofertas[0]).texto, 'sin verificar');
});

test('con mostrarSinVerificar apagado, el sitio solo muestra lo confirmado', () => {
  const salida = componer({
    catalogo: [producto('MLC1')], productos: [], estado: {}, historial: new Map(), categorias: {},
    cfg: { verificacion: { ...cfg.verificacion, mostrarSinVerificar: false } }, fecha: HOY,
  });
  assert.equal(salida.ofertas.length, 0);
  assert.equal(salida.descartes.sinVerificar, 1);
});

test('el precio verificado le gana al del catalogo', () => {
  const { ofertas } = correr([producto('MLC1')], {
    MLC1: { id: 'MLC1', verificado: HOY, precio: 7777, disponible: true },
  });
  assert.equal(ofertas[0].precio, 7777);
  assert.equal(ofertas[0].verificado, true);
});

test('la categoria real de Mercado Libre pisa a la que adivinamos', () => {
  const salida = componer({
    catalogo: [producto('MLC1', { categoria: 'Varios' })], productos: [],
    estado: { MLC1: { id: 'MLC1', verificado: HOY, precio: 9000, disponible: true, categoriaId: 'MLC5678' } },
    historial: new Map(), categorias: { MLC5678: 'Herramientas' }, cfg, fecha: HOY,
  });
  assert.equal(salida.ofertas[0].categoria, 'Herramientas');
});

test('entre dos ofertas equivalentes, la que tiene opinion propia va primero', () => {
  const catalogo = [producto('MLC1'), producto('MLC2')];
  const estado = {
    MLC1: { id: 'MLC1', verificado: HOY, precio: 9900, disponible: true },
    MLC2: { id: 'MLC2', verificado: HOY, precio: 9900, disponible: true },
  };
  const fichas = [{ slug: 'la-ficha', titulo: 'La ficha', mlId: 'MLC2', resumen: 'Por que si.', pros: [], contras: [], specs: {} }];
  const { ofertas } = correr(catalogo, estado, fichas);
  assert.equal(ofertas[0].id, 'MLC2');
  assert.equal(ofertas[0].slug, 'la-ficha', 'la ficha usa su propio slug, no el del catalogo');
});

test('cada oferta lleva su ganancia estimada', () => {
  const { ofertas } = correr([producto('MLC1')], {
    MLC1: { id: 'MLC1', verificado: HOY, precio: 10000, disponible: true },
  });
  assert.equal(ofertas[0].ganancia, 1100, '11% de 10.000');
});
