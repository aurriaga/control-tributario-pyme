// Dónde se guardan los datos: IndexedDB (cientos de MB, alcanza para muchas empresas) con una copia en memoria para leer al
// instante. Los datos que estaban en localStorage se pasan solos a IndexedDB. Si el navegador no tiene IndexedDB (o la
// bloquea), se sigue usando localStorage como antes.
import type { Almacen } from './almacen';

export interface Backend { cargar(): Promise<[string, string][]>; guardar(k: string, v: string): Promise<void>; borrar(k: string): Promise<void> }

/** Almacén en memoria que escribe en el backend en segundo plano; avisa con alFallar si una escritura no se pudo guardar. */
export async function crearAlmacen(backend: Backend, legado: Almacen & { length: number; key(i: number): string | null } | null, alFallar: () => void): Promise<Almacen> {
  const cache = new Map<string, string>(await backend.cargar());
  // Pasar lo que había en localStorage (solo las claves de la app) y borrarlo de ahí cuando quedó guardado
  if (legado) {
    const claves: string[] = [];
    for (let i = 0; i < legado.length; i++) { const k = legado.key(i); if (k?.startsWith('ctp.')) claves.push(k); }
    for (const k of claves) {
      const v = legado.getItem(k);
      if (v === null) continue;
      if (!cache.has(k)) { cache.set(k, v); await backend.guardar(k, v); }
      legado.removeItem(k);
    }
  }
  return {
    getItem: k => cache.get(k) ?? null,
    setItem: (k, v) => { cache.set(k, v); backend.guardar(k, v).catch(alFallar); },
    removeItem: k => { cache.delete(k); backend.borrar(k).catch(alFallar); },
  };
}

const pedido = <T,>(r: IDBRequest<T>) => new Promise<T>((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });

export async function backendIndexedDB(nombre = 'control-tributario', tienda = 'datos'): Promise<Backend> {
  const abrir = indexedDB.open(nombre, 1);
  abrir.onupgradeneeded = () => abrir.result.createObjectStore(tienda);
  const db = await pedido(abrir);
  const tx = (modo: IDBTransactionMode) => db.transaction(tienda, modo).objectStore(tienda);
  return {
    async cargar() {
      const s = tx('readonly');
      const [claves, valores] = await Promise.all([pedido(s.getAllKeys()), pedido(s.getAll())]);
      return claves.map((k, i) => [String(k), String(valores[i])]);
    },
    guardar: async (k, v) => { await pedido(tx('readwrite').put(v, k)); },
    borrar: async k => { await pedido(tx('readwrite').delete(k)); },
  };
}
