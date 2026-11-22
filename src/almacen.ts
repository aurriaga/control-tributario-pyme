// Multiempresa: cada empresa guarda sus datos aparte en el navegador ("ctp.<RUT>.documentos", etc.), con una lista de
// empresas registradas y la empresa activa. Los datos de la versión de una sola empresa se migran solos, sin pérdida.
import type { Empresa } from './nucleo/rcv';
import type { Respaldo } from './nucleo/panel';
import type { ResultadoLectura } from './nucleo/lector';
import type { Documento } from './nucleo/rcv';
import type { Movimiento } from './nucleo/cartola';
import type { F29 } from './nucleo/f29';
import type { LibroRemuneraciones, MesHonorarios } from './nucleo/remuneraciones';
import { crearAlmacen, backendIndexedDB } from './persistencia';

export type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Almacén de la app: IndexedDB con copia en memoria (o localStorage si el navegador no tiene IndexedDB)
let actual: Almacen | null = null;
export const ls = (): Almacen => actual ?? localStorage;
export const usaIndexedDB = () => actual !== null;
export async function iniciarAlmacen() {
  try { actual = await crearAlmacen(await backendIndexedDB(), localStorage, () => dispatchEvent(new Event('ctp:sin-guardar'))); }
  catch { actual = null; }
}
export const DATOS = ['documentos', 'f29', 'movimientos', 'reglas', 'libros', 'honorarios', 'utm', 'tasaPPM', 'contabilidad'] as const;
const LISTA = 'ctp.empresas', ACTIVA = 'ctp.activa';

export const claveDe = (rut: string, dato: string) => `ctp.${rut}.${dato}`;
const leer = <T,>(ls: Almacen, k: string, def: T): T => { try { const v = ls.getItem(k); return v ? JSON.parse(v) as T : def; } catch { return def; } };

export const empresas = (ls: Almacen): Empresa[] => leer<Empresa[]>(ls, LISTA, []);
export function empresaActiva(ls: Almacen): Empresa | null {
  const lista = empresas(ls), rut = ls.getItem(ACTIVA);
  return lista.find(e => e.rut === rut) ?? lista[0] ?? null;
}
/** Clave de un dato de la empresa activa (para los paneles que guardan algo propio, como la tasa del PPM). */
export const claveActiva = (dato: string, al: Almacen = ls()) => claveDe(empresaActiva(al)?.rut ?? '', dato);

/** Pasa los datos de la versión de una sola empresa ("ctp.documentos", "ctp.empresa") a la empresa por RUT. */
export function migrar(ls: Almacen) {
  if (ls.getItem(LISTA)) return false;
  const e = leer<Empresa | null>(ls, 'ctp.empresa', null);
  if (!e?.rut) return false;
  for (const d of DATOS) { const v = ls.getItem(`ctp.${d}`); if (v !== null) { ls.setItem(claveDe(e.rut, d), v); ls.removeItem(`ctp.${d}`); } }
  ls.setItem(LISTA, JSON.stringify([e])); ls.setItem(ACTIVA, e.rut); ls.removeItem('ctp.empresa');
  return true;
}

export function agregarEmpresa(ls: Almacen, e: Empresa) {
  const lista = empresas(ls).filter(x => x.rut !== e.rut);
  ls.setItem(LISTA, JSON.stringify([...lista, e])); ls.setItem(ACTIVA, e.rut);
}
export function activar(ls: Almacen, rut: string) { if (empresas(ls).some(e => e.rut === rut)) ls.setItem(ACTIVA, rut); }

/** Quita una empresa y todos sus datos de este navegador; la activa pasa a la siguiente (o a ninguna). */
export function quitarEmpresa(ls: Almacen, rut: string) {
  for (const d of DATOS) ls.removeItem(claveDe(rut, d));
  const lista = empresas(ls).filter(e => e.rut !== rut);
  ls.setItem(LISTA, JSON.stringify(lista));
  if (lista.length) ls.setItem(ACTIVA, lista[0].rut); else ls.removeItem(ACTIVA);
}

/** Datos de una empresa con los nombres del archivo de respaldo ("ctp.empresa", "ctp.documentos", …). */
export function datosDeEmpresa(ls: Almacen, e: Empresa): Record<string, unknown> {
  const r: Record<string, unknown> = { 'ctp.empresa': e };
  for (const d of DATOS) { const v = leer<unknown>(ls, claveDe(e.rut, d), undefined); if (v !== undefined) r[`ctp.${d}`] = v; }
  return r;
}

/** Abre un respaldo: si la empresa no está, la agrega; si está, reemplaza solo los datos de esa empresa. Queda activa. */
export function importarRespaldo(ls: Almacen, r: Respaldo) {
  const rut = r.empresa.rut;
  for (const d of DATOS) ls.removeItem(claveDe(rut, d));
  for (const d of DATOS) { const v = r.datos[`ctp.${d}`]; if (v !== undefined) ls.setItem(claveDe(rut, d), JSON.stringify(v)); }
  agregarEmpresa(ls, { rut, razonSocial: r.empresa.razonSocial });
}

// ------------------------------------------------------------------ cargar un archivo en otra empresa registrada

/** Claves de los documentos ya guardados de una empresa (para no duplicar al leer un RCV). */
export const clavesDocs = (ls: Almacen, rut: string) => new Set(leer<Documento[]>(ls, claveDe(rut, 'documentos'), []).map(d => d.clave));

/** Agrega lo leído de un archivo a una empresa que no es la activa, con las mismas reglas que la carga normal:
 *  documentos y movimientos sin repetir, el libro del mismo mes y el informe del mismo año se reemplazan, y el mismo F29
 *  (período y folio) no se duplica. Devuelve cuántas cosas se agregaron. */
export function agregarLectura(ls: Almacen, rut: string, r: ResultadoLectura): number {
  const k = (d: string) => claveDe(rut, d);
  let n = 0;
  if (r.documentos.length) {
    const docs = leer<Documento[]>(ls, k('documentos'), []), ya = new Set(docs.map(d => d.clave));
    const nuevos = r.documentos.filter(d => !ya.has(d.clave)); n += nuevos.length;
    ls.setItem(k('documentos'), JSON.stringify([...docs, ...nuevos]));
  }
  if (r.movimientos?.length) {
    const movs = leer<Movimiento[]>(ls, k('movimientos'), []), ya = new Set(movs.map(m => m.clave));
    const nuevos = r.movimientos.filter(m => !ya.has(m.clave)); n += nuevos.length;
    ls.setItem(k('movimientos'), JSON.stringify([...movs, ...nuevos]));
  }
  if (r.f29) {
    const f = r.f29, l = leer<F29[]>(ls, k('f29'), []);
    ls.setItem(k('f29'), JSON.stringify([...l.filter(x => !(x.periodo === f.periodo && x.folio === f.folio)), f])); n++;
  }
  if (r.libro) {
    const lb = r.libro, l = leer<LibroRemuneraciones[]>(ls, k('libros'), []);
    ls.setItem(k('libros'), JSON.stringify([...l.filter(x => x.periodo !== lb.periodo), lb].sort((a, b) => a.periodo.localeCompare(b.periodo)))); n++;
  }
  if (r.honorarios) {
    const h = r.honorarios, l = leer<MesHonorarios[]>(ls, k('honorarios'), []);
    ls.setItem(k('honorarios'), JSON.stringify([...l.filter(x => !x.periodo.startsWith(h.anio)), ...h.meses])); n++;
  }
  return n;
}
