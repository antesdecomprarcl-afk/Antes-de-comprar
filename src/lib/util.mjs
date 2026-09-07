// Utilidades compartidas por el generador y el verificador.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const slugify = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const clp = (n) =>
  typeof n === 'number' && Number.isFinite(n)
    ? '$' + Math.round(n).toLocaleString('es-CL')
    : null;

/** Fecha en formato YYYY-MM-DD, siempre en hora de Chile. */
export const hoy = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function leerJson(rel, porDefecto = null) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    if (porDefecto === null) throw new Error(`Falta el archivo ${rel}`);
    return porDefecto;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`${rel} no es JSON valido: ${err.message}`);
  }
}

export function escribirJson(rel, datos, { compacto = false } = {}) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(datos, null, compacto ? 0 : 2) + '\n');
}

/** Corre `tarea` sobre cada item con como maximo `n` en paralelo. */
export async function enParalelo(items, n, tarea) {
  const resultados = new Array(items.length);
  let i = 0;
  const obreros = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      resultados[idx] = await tarea(items[idx], idx);
    }
  });
  await Promise.all(obreros);
  return resultados;
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
