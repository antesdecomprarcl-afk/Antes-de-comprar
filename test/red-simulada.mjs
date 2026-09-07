// Reemplaza fetch por una red falsa. Se carga con --import antes de correr el
// verificador, para poder probar el CLI completo sin salir a internet.
const item = (id, i) => ({
  id, title: 'Producto ' + id, price: 10000 + ((i * 137) % 5000),
  original_price: i % 3 === 0 ? 25000 : null, currency_id: 'CLP',
  status: i % 10 === 3 ? 'paused' : 'active',
  available_quantity: i % 10 === 3 ? 0 : 7, sold_quantity: 12,
  permalink: 'https://articulo.mercadolibre.cl/' + id,
  thumbnail: 'http://http2.mlstatic.com/D_' + id + '-I.jpg', category_id: 'MLC1000',
});

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/items?ids=')) {
    const ids = new URL(u).searchParams.get('ids').split(',');
    return { ok: true, status: 200, url: u, text: async () => '',
      json: async () => ids.map((id, i) => ({ code: 200, body: item(id, i) })) };
  }
  if (u.includes('/categories/')) {
    return { ok: true, status: 200, url: u, text: async () => '',
      json: async () => ({ name: 'Hoja', path_from_root: [{ name: 'Raiz' }, { name: 'Herramientas' }] }) };
  }
  return { ok: true, status: 200, url: u, text: async () => '<html></html>', json: async () => ({}) };
};
