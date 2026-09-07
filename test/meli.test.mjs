// Tests del cliente de Mercado Libre. La red esta simulada: lo que se prueba es
// que sepamos leer cada formato y que la cadena de respaldo se active sola
// cuando un camino deja de funcionar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearCliente, parsearPagina, extraerId, urlItem, idConGuion } from '../src/lib/meli.mjs';

const leerFixture = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const respuesta = (cuerpo, { status = 200, url = 'https://x' } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  json: async () => (typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo),
  text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
});

test('extraerId encuentra el ID en cualquier forma de URL', () => {
  assert.equal(extraerId('https://articulo.mercadolibre.cl/MLC-48927241-tetera-_JM'), 'MLC48927241');
  assert.equal(extraerId('https://www.mercadolibre.cl/p/MLCU385981743'), 'MLCU385981743');
  assert.equal(extraerId('https://meli.la/2xPskdQ'), null, 'un link corto todavia no dice nada');
});

test('idConGuion y urlItem arman la URL publica', () => {
  assert.equal(idConGuion('MLC48927241'), 'MLC-48927241');
  assert.equal(idConGuion('MLCU385981743'), 'MLCU-385981743');
  assert.equal(urlItem('MLC48927241'), 'https://articulo.mercadolibre.cl/MLC-48927241-_JM');
});

test('parsearPagina lee los datos estructurados de la ficha', () => {
  const r = parsearPagina(leerFixture('ficha-ml.html'), 'MLC48927241');
  assert.equal(r.precio, 7990);
  assert.equal(r.precioLista, 13990);
  assert.equal(r.estado, 'active');
  assert.equal(r.fuente, 'pagina');
  assert.match(r.titulo, /Tetera Infusor/);
});

test('parsearPagina cae al microdato cuando no hay datos estructurados', () => {
  const r = parsearPagina(leerFixture('ficha-sin-jsonld.html'), 'MLC43844542');
  assert.equal(r.precio, 6954);
  assert.equal(r.precioLista, null);
});

test('parsearPagina no inventa precio en una publicacion caida', () => {
  assert.equal(parsearPagina(leerFixture('ficha-caida.html'), 'MLC1'), null);
});

test('la API devuelve los productos del lote', async () => {
  const cliente = crearCliente({
    fetchImpl: async () => respuesta([
      { code: 200, body: { id: 'MLC1', title: 'Uno', price: 1000, original_price: 2000, status: 'active', available_quantity: 5, category_id: 'MLC1234' } },
      { code: 200, body: { id: 'MLC2', title: 'Dos', price: 500, status: 'active', available_quantity: 1 } },
    ]),
  });
  const m = await cliente.consultar(['MLC1', 'MLC2']);
  assert.equal(m.get('MLC1').precio, 1000);
  assert.equal(m.get('MLC1').precioLista, 2000);
  assert.equal(m.get('MLC1').fuente, 'api-publica');
  assert.equal(m.get('MLC2').precioLista, null, 'sin precio tachado no se inventa uno');
});

test('precio de lista menor al actual se descarta', async () => {
  const cliente = crearCliente({
    fetchImpl: async () => respuesta([{ code: 200, body: { id: 'MLC1', title: 'X', price: 1000, original_price: 800, status: 'active', available_quantity: 1 } }]),
  });
  const m = await cliente.consultar(['MLC1']);
  assert.equal(m.get('MLC1').precioLista, null);
});

test('si la API se cierra, el cliente pasa solo a leer la pagina publica', async () => {
  const llamadas = [];
  const cliente = crearCliente({
    fetchImpl: async (url) => {
      llamadas.push(url);
      if (url.includes('/items?ids=')) return respuesta({ message: 'unauthorized' }, { status: 401 });
      return respuesta(leerFixture('ficha-ml.html'));
    },
  });
  const m = await cliente.consultar(['MLC48927241']);
  assert.equal(m.get('MLC48927241').precio, 7990);
  assert.equal(m.get('MLC48927241').fuente, 'pagina');
  assert.ok(llamadas.some((u) => u.includes('articulo.mercadolibre')));

  // Y no vuelve a golpear la API en el resto de la corrida.
  llamadas.length = 0;
  await cliente.consultar(['MLC43844542']);
  assert.ok(!llamadas.some((u) => u.includes('/items?ids=')), 'no reintenta un camino ya descartado');
});

test('un producto que no se puede leer devuelve error, no un precio falso', async () => {
  const cliente = crearCliente({
    fetchImpl: async (url) => (url.includes('/items?ids=') ? respuesta({}, { status: 500 }) : respuesta('<html>nada</html>')),
  });
  const m = await cliente.consultar(['MLC9']);
  assert.ok(m.get('MLC9').error);
  assert.equal(m.get('MLC9').precio, undefined);
});

test('el token se renueva una vez y se reintenta la llamada', async () => {
  let renovaciones = 0, intentosApi = 0;
  const cliente = crearCliente({
    clientId: 'id', clientSecret: 'secreto', refreshToken: 'refresh',
    fetchImpl: async (url) => {
      if (url.includes('/oauth/token')) { renovaciones++; return respuesta({ access_token: 'nuevo', refresh_token: 'refresh2' }); }
      if (url.includes('/items?ids=')) {
        intentosApi++;
        if (intentosApi === 1) return respuesta({}, { status: 401 });
        return respuesta([{ code: 200, body: { id: 'MLC1', title: 'Uno', price: 100, status: 'active', available_quantity: 2 } }]);
      }
      return respuesta('<html></html>');
    },
  });
  const m = await cliente.consultar(['MLC1']);
  assert.equal(renovaciones, 1);
  assert.equal(m.get('MLC1').precio, 100);
  assert.equal(m.get('MLC1').fuente, 'api');
});

test('resolverCorto saca el ID siguiendo el link de afiliado', async () => {
  const cliente = crearCliente({
    fetchImpl: async () => respuesta('<html></html>', { url: 'https://articulo.mercadolibre.cl/MLC-48927241-tetera-_JM' }),
  });
  assert.equal((await cliente.resolverCorto('https://meli.la/2xPskdQ')).id, 'MLC48927241');
});
