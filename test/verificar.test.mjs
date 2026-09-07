// Prueba del verificador completo, corriendolo como lo corre GitHub Actions
// pero con la red simulada y en modo --dry-run, para que no escriba nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const correr = (args) =>
  execFileSync(process.execPath, ['--import', './test/red-simulada.mjs', 'src/verificar.mjs', ...args],
    { cwd: RAIZ, encoding: 'utf8' });

test('el verificador consulta, resume y no escribe en dry-run', () => {
  const antes = fs.existsSync(path.join(RAIZ, 'data/estado.json'));
  const salida = correr(['--limite', '40', '--dry-run']);

  assert.match(salida, /Verificando 40 de \d+ productos/);
  assert.match(salida, /verificados\s+40/);
  assert.match(salida, /sin stock\/pausa\s+4/, 'debe detectar las publicaciones pausadas');
  assert.match(salida, /dry-run: no se escribio nada/);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data/estado.json')), antes, 'dry-run no puede tocar los datos');
});

test('--solo-fichas se limita a los productos con opinion propia', () => {
  const fichas = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/productos.json'), 'utf8'))
    .filter((p) => p.mlId).length;
  const salida = correr(['--solo-fichas', '--dry-run']);
  assert.match(salida, new RegExp(`Verificando ${fichas} de \\d+ productos`));
});

test('el diagnostico prueba los tres caminos', () => {
  const salida = correr(['--diagnostico']);
  assert.match(salida, /API \(multiget\)/);
  assert.match(salida, /Pagina publica/);
  assert.match(salida, /Link corto -> ID/);
});
