// Asistente: ayuda por palabras, intención de la pregunta y arreglos de integridad (datos ficticios).
import { describe, it, expect } from 'vitest';
import { buscarAyuda, intencion, revisarIntegridad, aplicarArreglo, type Datos } from './asistente';
import { configInicial } from './contabilidad';
import type { Documento } from './rcv';
import type { Movimiento } from './cartola';

const doc = (clave: string, x: Partial<Documento> = {}) => ({ clave, libro: 'COMPRA', estado: 'POR PAGAR', ...x } as Documento);
const mov = (clave: string, x: Partial<Movimiento> = {}) => ({ clave, cuenta: '1', fecha: '2026-07-01', descripcion: 'X', cargo: 10, abono: 0, saldo: 100, estado: 'pendiente', ...x } as Movimiento);
const base = (x: Partial<Datos> = {}): Datos => ({ empresa: { rut: '77.777.777-7', razonSocial: 'E' }, docs: [], f29s: [], movs: [], reglas: [], libros: [], honorarios: [], cfg: configInicial(), ...x });

describe('asistente', () => {
  it('encuentra la ayuda por palabras, aunque estén en plural o con otras palabras', () => {
    expect(buscarAyuda('¿Cómo cargo una cartola del banco?')?.texto).toMatch(/cartola/);
    expect(buscarAyuda('quiero crear reglas automáticas')?.acciones.some(a => a.tipo === 'ir')).toBe(true);
    expect(buscarAyuda('anular una factura que no existe')?.texto).toMatch(/Anular/);
    expect(buscarAyuda('xyz')).toBeNull();
  });
  it('distingue revisar, qué falta y ayuda', () => {
    expect(intencion('Revisa mi empresa')).toBe('revisar');
    expect(intencion('hay algún error?')).toBe('revisar');
    expect(intencion('¿Qué falta este mes?')).toBe('falta');
    expect(intencion('¿Cómo cargo el F29?')).toBe('ayuda');
  });
  it('detecta y corrige errores de los datos guardados', () => {
    const d = base({
      docs: [doc('a'), doc('a'), doc('b', { estado: 'PAGADA' })],
      movs: [mov('m1', { estado: 'conciliado', docs: ['no-existe'] }), mov('m2'), mov('m2'), mov('m3', { estado: 'clasificado', categoria: 'Otro ingreso', regla: 'R099' })],
    });
    const h = revisarIntegridad(d).map(x => x.titulo).join(' | ');
    expect(h).toMatch(/1 documentos repetidos/);
    expect(h).toMatch(/1 movimientos del banco repetidos/);
    expect(h).toMatch(/facturas que ya no están/);
    expect(h).toMatch(/reglas que ya no existen/);
    expect(h).toMatch(/sin respaldo del banco/);
    expect(h).toMatch(/Falta el asiento de apertura/);
    expect(aplicarArreglo('duplicados-docs', d).docs).toHaveLength(2);
    expect(aplicarArreglo('duplicados-movs', d).movs).toHaveLength(3);
    expect(aplicarArreglo('cruces-rotos', d).movs!.find(m => m.clave === 'm1')?.estado).toBe('pendiente');
    expect(aplicarArreglo('reglas-huerfanas', d).movs!.find(m => m.clave === 'm3')?.estado).toBe('pendiente');
    expect(aplicarArreglo('pagos-sin-fecha', d).docs!.find(x => x.clave === 'b')?.estado).toBe('POR PAGAR');
    expect(aplicarArreglo('apertura-banco', d).cfg?.apertura?.lineas.length).toBeGreaterThan(0);
    expect(revisarIntegridad(base())).toEqual([]);
  });
});
