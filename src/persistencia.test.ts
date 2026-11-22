// Almacén en IndexedDB (con un backend falso) y carga de un archivo en otra empresa registrada.
import { describe, it, expect } from 'vitest';
import { crearAlmacen, type Backend } from './persistencia';
import { agregarLectura, clavesDocs, claveDe } from './almacen';
import type { ResultadoLectura } from './nucleo/lector';
import type { Documento } from './nucleo/rcv';

function backend(inicial: [string, string][] = [], falla = false): Backend & { m: Map<string, string> } {
  const m = new Map(inicial);
  return { m, cargar: async () => [...m], guardar: async (k, v) => { if (falla) throw new Error('lleno'); m.set(k, v); }, borrar: async k => { m.delete(k); } };
}
function legado(datos: Record<string, string>) {
  const m = new Map(Object.entries(datos));
  return { m, get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}
const espera = () => new Promise(r => setTimeout(r, 0));

describe('almacén en IndexedDB', () => {
  it('pasa los datos de localStorage (solo los de la app) y los borra de ahí', async () => {
    const b = backend(), l = legado({ 'ctp.empresas': '[1]', 'ctp.77.777.777-7.documentos': '[2]', 'otra.app': 'x' });
    const a = await crearAlmacen(b, l, () => {});
    expect(a.getItem('ctp.empresas')).toBe('[1]');
    expect(b.m.get('ctp.77.777.777-7.documentos')).toBe('[2]');
    expect(l.m.has('ctp.empresas')).toBe(false);
    expect(l.m.get('otra.app')).toBe('x');
  });
  it('lo que ya está en IndexedDB manda sobre una copia vieja de localStorage', async () => {
    const a = await crearAlmacen(backend([['ctp.empresas', '[nuevo]']]), legado({ 'ctp.empresas': '[viejo]' }), () => {});
    expect(a.getItem('ctp.empresas')).toBe('[nuevo]');
  });
  it('escribe y borra en segundo plano; si no puede guardar, avisa', async () => {
    const b = backend(); const a = await crearAlmacen(b, null, () => {});
    a.setItem('ctp.x', '1'); await espera(); expect(b.m.get('ctp.x')).toBe('1');
    a.removeItem('ctp.x'); await espera(); expect(b.m.has('ctp.x')).toBe(false);
    let aviso = false; const c = await crearAlmacen(backend([], true), null, () => { aviso = true; });
    c.setItem('ctp.y', '2'); await espera();
    expect(c.getItem('ctp.y')).toBe('2');
    expect(aviso).toBe(true);
  });
});

describe('cargar en otra empresa registrada', () => {
  it('agrega documentos sin repetir y reemplaza el libro del mismo mes', async () => {
    const a = await crearAlmacen(backend(), null, () => {});
    const rut = '78.000.002-3', d = (clave: string) => ({ clave } as Documento);
    a.setItem(claveDe(rut, 'documentos'), JSON.stringify([d('x')]));
    const r = { estado: 'leido', documentos: [d('x'), d('y')], libro: { periodo: '2026-07', trabajadores: [] }, avisos: [] } as unknown as ResultadoLectura;
    expect(agregarLectura(a, rut, r)).toBe(2);                     // 1 documento nuevo + 1 libro
    expect([...clavesDocs(a, rut)]).toEqual(['x', 'y']);
    agregarLectura(a, rut, { ...r, documentos: [] });
    expect(JSON.parse(a.getItem(claveDe(rut, 'libros'))!)).toHaveLength(1);
  });
});
