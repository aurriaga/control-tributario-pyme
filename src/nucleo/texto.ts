// Utilidades de lectura de texto, CSV, fechas y montos. Equivalen a las funciones de modUtil.bas.

/** Minúsculas, sin tildes ni símbolos: solo letras a-z y dígitos ("RUT Proveedor" -> "rutproveedor"). */
export function normalizar(s: string): string {
  return s.toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u').replace(/ñ/g, 'n').replace(/[°º]/g, 'o')
    .replace(/[^a-z0-9]/g, '');
}

/** Decodifica un archivo de texto: UTF-8 (con o sin BOM), UTF-16 (con BOM) o Windows-1252. */
export function decodificar(bytes: Uint8Array): string {
  let texto: string;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) texto = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) texto = new TextDecoder('utf-16be').decode(bytes.subarray(2));
  else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) texto = new TextDecoder('utf-8').decode(bytes.subarray(3));
  else {
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { texto = new TextDecoder('windows-1252').decode(bytes); }
  }
  return texto.replace(/\u0000/g, '');
}

export function detectarSeparador(linea: string): string {
  const cuenta = (c: string) => linea.split(c).length - 1;
  const nPC = cuenta(';'), nC = cuenta(','), nT = cuenta('\t');
  if (nT > nPC && nT > nC) return '\t';
  return nPC >= nC ? ';' : ',';
}

/** Separa una línea CSV respetando comillas ("" dentro de comillas = una comilla). */
export function separarCSV(linea: string, sep: string): string[] {
  const res: string[] = [];
  let actual = '', enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else enComillas = !enComillas;
    } else if (ch === sep && !enComillas) { res.push(actual); actual = ''; }
    else actual += ch;
  }
  res.push(actual);
  return res;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "03", "3", "mar", "marzo", "sept" -> 3 (0 si no se reconoce). */
export function mesDesdeTexto(s: string): number {
  const t = s.trim().toLowerCase();
  if (/^\d{1,2}$/.test(t)) return Number(t);
  const i = MESES.indexOf(t.slice(0, 3));
  return i >= 0 ? i + 1 : 0;
}

/** Fecha ISO "AAAA-MM-DD" desde textos como 05/07/2026, 2026-07-05, 5-7-26, "02 ene 2026 10:30" (null si no es válida). */
export function parseFecha(v: unknown, anioDefecto = 0): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoDe(v.getFullYear(), v.getMonth() + 1, v.getDate());
  let s = String(v).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/ de /g, ' ');
  const p0 = s.split(/\s+/);
  if (p0.length >= 3 && /^\d/.test(p0[0]) && /^[a-z]/.test(p0[1]) && mesDesdeTexto(p0[1]) > 0 && /^\d+$/.test(p0[2])) s = `${p0[0]}/${p0[1]}/${p0[2]}`;
  if (s.includes(' ')) s = s.slice(0, s.indexOf(' '));                    // quita la hora
  const t = s.indexOf('t'); if (t > 7) s = s.slice(0, t);                  // 2026-01-02t10:00:00
  const p = s.replace(/[-.\\]/g, '/').split('/');
  if (p.length < 2) return null;
  let d: number, m: number, y: number;
  if (p.length === 2) { d = Number(p[0]); m = mesDesdeTexto(p[1]); y = anioDefecto; }
  else if (p[0].length === 4) { y = Number(p[0]); m = mesDesdeTexto(p[1]); d = Number(p[2]); }
  else { d = Number(p[0]); m = mesDesdeTexto(p[1]); y = Number(p[2]); if (y > 0 && y < 100) y += 2000; }
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null;                              // ej. 31-02
  return isoDe(y, m, d);
}
function isoDe(y: number, m: number, d: number) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

/** Monto desde texto chileno o internacional: "$1.234.567", "1,234.50", "(500)", "500-" (0 si no es número). */
export function parseMonto(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[$\s ]/g, '').toUpperCase().replace('CLP', '');
  if (!s || s === '-') return 0;
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  const nComas = s.split(',').length - 1;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (nComas > 1) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');                       // formato chileno: coma = decimales
  else {
    const nPuntos = s.split('.').length - 1;
    if (nPuntos > 1) s = s.replace(/\./g, '');
    else if (nPuntos === 1 && s.length - s.indexOf('.') - 1 === 3) s = s.replace('.', '');   // "1.234" son miles
  }
  if (!/^\d*\.?\d+$|^\d+\.?$/.test(s)) return 0;
  const n = Number(s);
  return neg ? -n : n;
}

/** Período "AAAA-MM" escrito en un texto, como el nombre de archivo del SII (el último que aparezca; '' si no hay). */
export function periodoEnTexto(s: string): string {
  let res = '';
  for (const m of s.matchAll(/(20[2-3]\d)[-_ ]?(0[1-9]|1[0-2])(?!\d)/g)) res = `${m[1]}-${m[2]}`;
  return res;
}
