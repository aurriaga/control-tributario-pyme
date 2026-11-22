// Multiempresa: cada empresa guarda sus datos aparte en el navegador ("ctp.<RUT>.documentos", etc.), con una lista de
// empresas registradas y la empresa activa. Los datos de la versión de una sola empresa se migran solos, sin pérdida.
import type { Empresa } from './nucleo/rcv';
import type { Respaldo } from './nucleo/panel';

export type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
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
export const claveActiva = (dato: string, ls: Almacen = localStorage) => claveDe(empresaActiva(ls)?.rut ?? '', dato);

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
