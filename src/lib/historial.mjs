// Historial de precios, guardado como JSONL: una linea por producto.
//
// El formato importa. Este archivo se reescribe todos los dias y vive en git:
// si fuera un unico JSON gigante, cada commit guardaria el archivo entero de
// nuevo y el repositorio crecería sin control. Con una linea por producto, git
// solo guarda las pocas letras que cambiaron.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.mjs';

const RUTA = 'data/historial.jsonl';

export function leerHistorial(rel = RUTA) {
  const p = path.join(ROOT, rel);
  const mapa = new Map();
  if (!fs.existsSync(p)) return mapa;
  for (const linea of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = linea.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t);
      if (r && r.id) mapa.set(r.id, r.serie || []);
    } catch {
      // Una linea corrupta no puede tumbar la verificacion del dia: se ignora.
    }
  }
  return mapa;
}

export function escribirHistorial(mapa, rel = RUTA) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lineas = [...mapa.entries()]
    .filter(([, serie]) => serie && serie.length)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([id, serie]) => JSON.stringify({ id, serie }));
  fs.writeFileSync(p, lineas.join('\n') + (lineas.length ? '\n' : ''));
  return lineas.length;
}
