// Tests del importador. Lo que mas importa probar aca no es que sepa leer
// muchos formatos, sino que NUNCA le cambie el slug a un producto que ya existe:
// ese slug es una URL que puede estar pegada en videos ya publicados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Cada prueba usa su propio catalogo en un directorio temporal: el catalogo
// real no se toca, y los archivos de test pueden correr en paralelo.
let CATALOGO = null;

function conCatalogoDePrueba(entradas, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-'));
  CATALOGO = path.join(dir, 'catalogo.json');
  fs.writeFileSync(CATALOGO, JSON.stringify(entradas, null, 2) + '\n');
  try { return fn(); } finally { fs.rmSync(dir, { recursive: true, force: true }); CATALOGO = null; }
}

function importar(contenido, extension = 'json', args = []) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'imp-')), 'entrada.' + extension);
  fs.writeFileSync(tmp, typeof contenido === 'string' ? contenido : JSON.stringify(contenido));
  const salida = execFileSync(process.execPath,
    ['src/importar.mjs', tmp, '--catalogo', CATALOGO, ...args], { cwd: RAIZ, encoding: 'utf8' });
  return { salida, catalogo: JSON.parse(fs.readFileSync(CATALOGO, 'utf8')) };
}

const existente = {
  id: 'MLC111111', slug: 'slug-ya-compartido', titulo: 'Titulo viejo', categoria: 'Cocina',
  comision: 7, link: 'https://meli.la/AAA', codigo: 'X-1',
  hub: { precio: 1000, precioLista: null, capturado: '2026-01-01' },
};

test('un producto que ya existe conserva su slug aunque cambie el titulo', () => {
  conCatalogoDePrueba([existente], () => {
    const { catalogo } = importar([{ id: 'MLC111111', title: 'Titulo nuevo y distinto', link: 'https://meli.la/AAA', price: 2000, commission: 11 }]);
    assert.equal(catalogo.length, 1, 'no debe duplicar');
    assert.equal(catalogo[0].slug, 'slug-ya-compartido', 'el slug publicado no se toca');
    assert.equal(catalogo[0].titulo, 'Titulo nuevo y distinto', 'el titulo si se actualiza');
    assert.equal(catalogo[0].comision, 11);
    assert.equal(catalogo[0].hub.precio, 2000);
  });
});

test('reconoce el mismo producto por link aunque venga sin ID', () => {
  conCatalogoDePrueba([existente], () => {
    const { catalogo } = importar([{ title: 'Otro nombre', link: 'https://meli.la/AAA', price: 3000 }]);
    assert.equal(catalogo.length, 1);
    assert.equal(catalogo[0].id, 'MLC111111', 'no pierde el ID que ya tenia');
  });
});

test('lee la forma compacta del artefacto Bodega de Links', () => {
  conCatalogoDePrueba([], () => {
    const { catalogo } = importar([{ n: 1, t: 'Tetera Infusor Acero 1 Litro', c: 11, p: 7990, o: 13990, l: 'https://meli.la/2xPskdQ', k: '5NLLZK-RS06', id: 'MLC48927241', g: 879 }]);
    assert.equal(catalogo.length, 1);
    assert.equal(catalogo[0].id, 'MLC48927241');
    assert.equal(catalogo[0].comision, 11);
    assert.equal(catalogo[0].hub.precioLista, 13990);
    assert.equal(catalogo[0].categoria, 'Cocina', 'categoriza solo');
  });
});

test('lee CSV con encabezado y precios con formato chileno', () => {
  conCatalogoDePrueba([], () => {
    const csv = 'title,link,price,original_price,commission\n' +
      '"Taladro Percutor 21v, con 2 baterias",https://meli.la/BBB,"$ 32.990","$ 74.990",11\n';
    const { catalogo } = importar(csv, 'csv');
    assert.equal(catalogo.length, 1);
    assert.equal(catalogo[0].hub.precio, 32990);
    assert.equal(catalogo[0].hub.precioLista, 74990);
    assert.equal(catalogo[0].categoria, 'Herramientas');
  });
});

test('acepta el JSON crudo envuelto que devuelve una API', () => {
  conCatalogoDePrueba([], () => {
    const { catalogo } = importar({ results: [{ item_id: 'MLC222222', name: 'Cafetera Express', permalink: 'https://articulo.mercadolibre.cl/MLC-222222-cafetera', price: 89990 }] });
    assert.equal(catalogo.length, 1);
    assert.equal(catalogo[0].id, 'MLC222222');
  });
});

test('descarta lo que no es un producto de Mercado Libre', () => {
  conCatalogoDePrueba([], () => {
    const { catalogo, salida } = importar([
      { title: 'Algo de otra tienda', link: 'https://falabella.com/x', price: 100 },
      { title: 'Sin link ninguno', price: 100 },
    ]);
    assert.equal(catalogo.length, 0);
    assert.match(salida, /descartados\s+2/);
  });
});

test('los slugs nuevos nunca chocan con los que ya existen', () => {
  conCatalogoDePrueba([{ ...existente, slug: 'tetera-infusor-acero-litro', titulo: 'Tetera Infusor Acero 1 Litro' }], () => {
    const { catalogo } = importar([{ id: 'MLC999999', title: 'Tetera Infusor Acero 1 Litro', link: 'https://meli.la/ZZZ', price: 5000 }]);
    assert.equal(catalogo.length, 2);
    assert.notEqual(catalogo[1].slug, catalogo[0].slug);
    assert.equal(new Set(catalogo.map((c) => c.slug)).size, 2);
  });
});

test('--dry-run no escribe nada', () => {
  conCatalogoDePrueba([], () => {
    const { catalogo, salida } = importar([{ id: 'MLC333333', title: 'Producto nuevo', link: 'https://meli.la/CCC', price: 100 }], 'json', ['--dry-run']);
    assert.equal(catalogo.length, 0);
    assert.match(salida, /dry-run/);
    assert.match(salida, /nuevos\s+1/);
  });
});

test('un producto sin ID entra igual, para que el verificador lo resuelva', () => {
  conCatalogoDePrueba([], () => {
    const { catalogo, salida } = importar([{ title: 'Producto con link corto', link: 'https://meli.la/DDD', price: 100 }]);
    assert.equal(catalogo.length, 1);
    assert.equal(catalogo[0].id, null);
    assert.match(salida, /sin ID de ML\s+1/);
  });
});

test('funciona sin --catalogo, que es como se usa de verdad', () => {
  // Regresion: el parseo de argumentos descartaba el archivo de entrada cuando
  // no venia la bandera --catalogo, o sea en el uso normal.
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'imp-')), 'entrada.json');
  fs.writeFileSync(tmp, JSON.stringify([{ id: 'MLC444444', title: 'Producto suelto', link: 'https://meli.la/EEE', price: 100 }]));
  const salida = execFileSync(process.execPath, ['src/importar.mjs', tmp, '--dry-run'], { cwd: RAIZ, encoding: 'utf8' });
  assert.match(salida, /leidos\s+1/);
  assert.match(salida, /nuevos\s+1/);
  assert.doesNotMatch(salida, /Uso: node/);
});

test('sin argumentos explica como se usa', () => {
  assert.throws(() => execFileSync(process.execPath, ['src/importar.mjs'], { cwd: RAIZ, encoding: 'utf8', stdio: 'pipe' }));
});
