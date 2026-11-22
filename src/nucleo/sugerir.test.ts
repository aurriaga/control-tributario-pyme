// Sugerencias de clasificación y reglas (contiene, RUT, editar, desactivar, borrar) con datos ficticios.
import { describe, it, expect } from 'vitest';
import type { Movimiento } from './cartola';
import { sugerirCategoria, sugerirMovimiento } from './sugerir';
import { clasificar, crearRegla, coincideRegla, reaplicarReglas, alcanceRegla, type Regla } from './cruce';
import { CATEGORIAS_GASTO } from './contabilidad';

const CATS = CATEGORIAS_GASTO.map(c => c.categoria);
let n = 0;
const mov = (descripcion: string, monto: number, extra: Partial<Movimiento> = {}): Movimiento => ({ clave: `k${++n}`, cuenta: '1', banco: '', fecha: '2026-07-01',
  descripcion, documento: '', cargo: Math.max(0, -monto), abono: Math.max(0, monto), saldo: null, archivo: '', estado: 'pendiente', ...extra });

describe('sugerir la categoría de un proveedor', () => {
  it('por palabras clave del nombre, en orden (un seguro de un banco es seguro)', () => {
    expect(sugerirCategoria('ESTACION DE SERVICIO COPEC LTDA', CATS)?.categoria).toBe('Combustibles y lubricantes');
    expect(sugerirCategoria('Sociedad Concesionaria Autopista del Sol S.A.', CATS)?.categoria).toBe('Peajes y autopistas');
    expect(sugerirCategoria('BANCO EJEMPLO SEGUROS GENERALES S.A.', CATS)?.categoria).toBe('Seguros');
    expect(sugerirCategoria('FERRETERÍA EL MARTILLO SPA', CATS)?.categoria).toBe('Insumos y herramientas');
  });
  it('por parecido con un proveedor ya clasificado, sin contar las palabras del nombre propio de la empresa', () => {
    const aprendidas = [{ nombre: 'MARMOLES DEL NORTE LTDA', categoria: 'Materiales e insumos del giro' }, { nombre: 'PRUEBA INVERSIONES SPA', categoria: 'Arriendos' }];
    expect(sugerirCategoria('COMERCIAL MARMOLES ANDINOS SPA', CATS, aprendidas)?.categoria).toBe('Materiales e insumos del giro');
    expect(sugerirCategoria('PRUEBA IMPORTADORA SPA', CATS, aprendidas, 0, 'EMPRESA DE PRUEBA SPA')).toBeNull();
  });
  it('no inventa: un nombre genérico queda sin sugerencia; una compra grande avisa del activo fijo', () => {
    expect(sugerirCategoria('COMERCIAL Y SERVICIOS JP LIMITADA', CATS)).toBeNull();
    expect(sugerirCategoria('AUTOMOTRIZ EJEMPLO LTDA', CATS, [], 15_000_000)?.motivo).toMatch(/activo fijo/);
  });
});

describe('sugerir qué es un movimiento del banco', () => {
  it('por el RUT ya clasificado antes; con RUT no se usa la glosa de otras personas', () => {
    const antes = [mov('TRANSF A 12345678-5 JUAN', -1000, { estado: 'clasificado', categoria: 'Retiro de socios' })];
    expect(sugerirMovimiento(mov('TRANSF A 12.345.678-5 JUAN P', -2000), { clasificados: antes })?.categoria).toBe('Retiro de socios');
    expect(sugerirMovimiento(mov('TRANSF A 98765433 OTRA', -2000), { clasificados: antes })).toBeNull();
  });
  it('por palabras de la glosa, respetando si es cargo o abono', () => {
    expect(sugerirMovimiento(mov('COMISION MANTENCION PLAN', -5000), { clasificados: [] })?.categoria).toBe('Comisiones y gastos bancarios');
    expect(sugerirMovimiento(mov('PAGO CUOTA CREDITO NO 12', -50000), { clasificados: [] })?.categoria).toBe('Crédito bancario (cuotas)');
    expect(sugerirMovimiento(mov('COMISION MANTENCION PLAN', 5000), { clasificados: [] })).toBeNull();
  });
});

describe('reglas', () => {
  it('contiene, RUT e igual; una regla vieja sin tipo sigue funcionando como "igual"', () => {
    const base = mov('PAGO EN LINEA SERVIPAG 123', -100);
    const contiene = crearRegla(base, 'Pago a proveedor', [], { tipo: 'contiene', texto: 'en linea servipag' });
    expect(coincideRegla(mov('XX PAGO EN LINEA SERVIPAG 999', -5), contiene)).toBe(true);
    const rut = crearRegla(mov('TRANSF A 12.345.678-5', -1), 'Retiro de socios', [contiene], { tipo: 'rut', texto: '12.345.678-5' });
    expect(rut).toMatchObject({ id: 'R002', patron: '12345678' });
    expect(coincideRegla(mov('Transf a 0123456785 Juan', -9), rut)).toBe(true);
    const vieja = { id: 'R009', patron: 'comisionmantencion', categoria: 'Comisiones y gastos bancarios', lado: 'cargo' } as Regla;
    expect(coincideRegla(mov('COMISION MANTENCION 0912', -1), vieja)).toBe(true);
    expect(coincideRegla(mov('COMISION MANTENCION PLAN', -1), vieja)).toBe(false);
  });
  it('alcance, editar, desactivar y borrar: lo que clasificó vuelve a pendiente o cambia', () => {
    const movs = [mov('PAC SEGURO AUTO 1', -10), mov('PAC SEGURO AUTO 2', -20), mov('OTRA COSA', -30)];
    const r = crearRegla(movs[0], 'Otro gasto sin factura', [], { tipo: 'contiene', texto: 'PAC SEGURO' });
    expect(alcanceRegla(r, movs)).toBe(2);
    const clasif = clasificar(movs, [r]);
    expect(clasif.filter(m => m.regla === r.id)).toHaveLength(2);
    expect(reaplicarReglas(clasif, [{ ...r, categoria: 'Comisiones y gastos bancarios' }]).filter(m => m.categoria === 'Comisiones y gastos bancarios')).toHaveLength(2);
    expect(reaplicarReglas(clasif, [{ ...r, activa: false }]).filter(m => m.estado === 'pendiente')).toHaveLength(3);
    const borrada = reaplicarReglas(clasif, []);
    expect(borrada.every(m => m.estado === 'pendiente' && !m.categoria && !m.regla)).toBe(true);
  });
});
