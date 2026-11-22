// Extrae el contenido de cualquier archivo: texto (CSV/TXT en cualquier codificación), planillas (xlsx, xls, xlsm, ods,
// tablas HTML), PDF (texto digital) e imágenes o PDF escaneados (OCR). El formato se detecta por los primeros bytes,
// no por la extensión, así un archivo mal nombrado igual se lee.
import * as XLSX from 'xlsx';
import { decodificar, detectarSeparador, separarCSV } from './texto';

export type Formato = 'texto' | 'planilla' | 'pdf' | 'imagen' | 'vacio';

export interface Hoja { nombre: string; filas: string[][] }

export interface Contenido {
  formato: Formato;
  texto: string;          // todo el texto del archivo (en planillas: filas con ";")
  hojas: Hoja[];          // grillas de celdas como texto (CSV y planillas)
  paginas?: number;       // PDF
  ocr: boolean;           // true si el texto salió de reconocimiento óptico
  aviso?: string;
}

/** Servicios que dependen del entorno (navegador o pruebas): lectura de PDF y OCR. */
export interface Servicios {
  textoPDF?: (bytes: Uint8Array) => Promise<{ texto: string; paginas: number; escaneado: boolean }>;
  ocrImagen?: (bytes: Uint8Array, nombre: string) => Promise<string>;
  ocrPDF?: (bytes: Uint8Array) => Promise<string>;
}

export function detectarFormato(b: Uint8Array): Formato | 'zip' | 'ole' | 'html' {
  if (b.length === 0) return 'vacio';
  const ini = (s: string) => s.split('').every((c, i) => b[i] === c.charCodeAt(0));
  if (ini('%PDF')) return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';                 // xlsx, xlsm, ods
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';                 // xls antiguo
  if ((b[0] === 0xff && b[1] === 0xd8) || ini('\x89PNG') || ini('GIF8') || ini('BM') ||
      (ini('RIFF') && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') ||
      (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'imagen';
  const cabeza = decodificar(b.subarray(0, 2048)).trimStart().toLowerCase();
  if (cabeza.startsWith('<') && /<(table|html|tr|!doctype)/.test(cabeza)) return 'html';            // "xls" del SII que en realidad es HTML
  return 'texto';
}

const celda = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
  return String(v).trim();
};

function leerPlanilla(bytes: Uint8Array): Hoja[] {
  const libro = XLSX.read(bytes, { type: 'array', cellDates: true, dense: true });
  return libro.SheetNames.map(nombre => {
    const filas = (XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: '' }) as unknown[][])
      .map(f => f.map(celda));
    return { nombre, filas: filas.filter(f => f.some(c => c !== '')) };
  });
}

const hojasATexto = (hojas: Hoja[]) => hojas.map(h => h.filas.map(f => f.map(c => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\n')).join('\n');

export async function extraer(nombre: string, bytes: Uint8Array, s: Servicios = {}): Promise<Contenido> {
  const f = detectarFormato(bytes);
  if (f === 'vacio') return { formato: 'vacio', texto: '', hojas: [], ocr: false, aviso: 'El archivo está vacío.' };
  if (f === 'zip' || f === 'ole' || f === 'html') {
    try {
      const hojas = leerPlanilla(bytes);
      return { formato: 'planilla', texto: hojasATexto(hojas), hojas, ocr: false };
    } catch {
      if (f === 'html') { const t = decodificar(bytes).replace(/<[^>]+>/g, ' '); return { formato: 'texto', texto: t, hojas: [], ocr: false }; }
      return { formato: 'planilla', texto: '', hojas: [], ocr: false, aviso: 'No se pudo abrir la planilla (¿está protegida con contraseña o dañada?).' };
    }
  }
  if (f === 'pdf') {
    if (!s.textoPDF) return { formato: 'pdf', texto: '', hojas: [], ocr: false, aviso: 'Lectura de PDF no disponible en este entorno.' };
    const r = await s.textoPDF(bytes);
    if (r.escaneado && s.ocrPDF) {
      const t = await s.ocrPDF(bytes);
      return { formato: 'pdf', texto: t, hojas: [], paginas: r.paginas, ocr: true, aviso: 'PDF escaneado: el texto se leyó con reconocimiento óptico; revisa las cifras.' };
    }
    return { formato: 'pdf', texto: r.texto, hojas: [], paginas: r.paginas, ocr: false,
      aviso: r.escaneado ? 'El PDF parece escaneado y no tiene texto digital.' : undefined };
  }
  if (f === 'imagen') {
    if (!s.ocrImagen) return { formato: 'imagen', texto: '', hojas: [], ocr: false, aviso: 'Reconocimiento de texto en imágenes no disponible en este entorno.' };
    const t = await s.ocrImagen(bytes, nombre);
    return { formato: 'imagen', texto: t, hojas: [], ocr: true, aviso: 'Imagen: el texto se leyó con reconocimiento óptico; revisa las cifras.' };
  }
  // Texto: CSV/TXT con cualquier separador y codificación
  const texto = decodificar(bytes).replace(/\r\n?/g, '\n');
  const lineas = texto.split('\n').filter(l => l.trim());
  const sep = detectarSeparador(lineas.find(l => /fecha|rut|folio|monto/i.test(l)) ?? lineas[0] ?? '');
  return { formato: 'texto', texto, hojas: [{ nombre: nombre, filas: lineas.map(l => separarCSV(l, sep).map(c => c.trim())) }], ocr: false };
}
