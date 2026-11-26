// Fallas importantes del diagnóstico del 23-11-2026: varios bancos, traspasos entre cuentas propias, más sugerencias
// del banco, categorías de rubros agrícolas y referencia del 048 y 151. Datos ficticios (RUT 77.777.777-7).
import { describe, it, expect } from 'vitest';
import type { Movimiento } from './cartola';
import type { Documento } from './rcv';
import type { F29 } from './f29';
import { traspasosPropios, nombraEmpresa, clasificar } from './cruce';
import { cuentasBancarias, configInicial, completarPlan, contabilidad, aperturaSugerida, CATEGORIAS_GASTO, C } from './contabilidad';
import { sugerirMovimiento, sugerirCategoria } from './sugerir';
import { borradorF29, UTM_SII } from './f29';

const EMP = '77.777.777-7', NOMBRE = 'AGROPECUARIA DEL VALLE SPA';
let n = 0;
const mov = (cuenta: string, fecha: string, monto: number, descripcion: string, saldo: number | null = null): Movimiento => ({ clave: `m${++n}`, cuenta, banco: cuenta === '111111111' ? 'Banco Uno' : 'Banco Dos', fecha, descripcion,
  documento: '', cargo: Math.max(0, -monto), abono: Math.max(0, monto), saldo, archivo: '', estado: 'pendiente' });

describe('traspasos entre cuentas propias', () => {
  const movs = [
    mov('111111111', '2026-03-02', -500000, 'TEF 0777777777 Agropecuaria del Valle', 1000),
    mov('222222222', '2026-03-02', 500000, 'Transf. AGROPECUARIA DEL VALLE SP', 2000),
    mov('111111111', '2026-03-05', -800000, 'Transf a Juan Perez 15.111.222-3', 200),           // a un tercero: no
    mov('222222222', '2026-03-05', 800000, 'Deposito cliente', 2800),
    mov('111111111', '2026-03-09', -300000, 'Pago proveedor', -100),                             // sin glosa propia: no
    mov('222222222', '2026-03-09', 300000, 'Abono', 3100),
  ];
  it('empareja cargo y abono del mismo monto entre dos cuentas cuando la glosa nombra a la empresa', () => {
    expect(nombraEmpresa('Transf. AGROPECUARIA DEL VALLE SP', EMP, NOMBRE)).toBe(true);
    expect(traspasosPropios(movs, EMP, NOMBRE)).toEqual([movs[0].clave, movs[1].clave]);
  });
  it('se clasifican como traspaso al buscar cobros y pagos', () => {
    const r = clasificar(movs, [], [], new Set(), traspasosPropios(movs, EMP, NOMBRE));
    expect(r.filter(m => m.categoria === 'Traspaso entre cuentas propias')).toHaveLength(2);
  });
  it('sin pareja, la glosa con el nombre de la empresa se sugiere como traspaso', () => {
    const solo = mov('111111111', '2026-04-01', -900000, 'Transf a AGROPECUARIA DEL VALLE SPA');
    expect(sugerirMovimiento(solo, { clasificados: [], rutEmpresa: EMP, razonSocial: NOMBRE })?.categoria).toBe('Traspaso entre cuentas propias');
  });
  it('una cuenta contable por banco, y la apertura y el control "Banco = cartola" por cuenta', () => {
    const cfg = cuentasBancarias(movs, configInicial());
    expect(cfg.plan.filter(c => c.cuentaBancaria).map(c => [c.codigo, c.cuentaBancaria])).toEqual([[C.BANCO, '111111111'], [1111, '222222222']]);
    expect(cuentasBancarias(movs, cfg)).toBe(cfg);                         // no se repite
    const base = configInicial();
    expect(cuentasBancarias(movs.filter(m => m.cuenta === '111111111'), base)).toBe(base);   // con un solo banco no cambia nada
    const conAp = { ...cfg, apertura: aperturaSugerida(movs, cfg) };
    const r = contabilidad({ empresa: EMP, docs: [], f29s: [], movs, libros: [], honorarios: [] }, conAp);
    expect(r.controles.find(c => c.nombre === 'Banco = cartola')!.estado).toBe('OK');
  });
});

describe('sugerencias del banco', () => {
  it('venta de divisas: cobro de una exportación', () => {
    expect(sugerirMovimiento(mov('1', '2026-05-02', 3000000, 'Ingreso por Venta de Divisas'), { clasificados: [] })?.categoria).toBe('Cobro a cliente');
  });
  it('compra con tarjeta: gasto sin factura, salvo que haya una factura pendiente por el mismo monto', () => {
    const m = mov('1', '2026-05-10', -45000, 'REDCOMPRA ESTACION DE SERVICIO');
    expect(sugerirMovimiento(m, { clasificados: [] })?.categoria).toBe('Otro gasto sin factura');
    const factura = { libro: 'COMPRA', estado: 'POR PAGAR', total: 45000, fechaEmision: '2026-05-08' } as Documento;
    expect(sugerirMovimiento(m, { clasificados: [], docs: [factura] })).toBeNull();
  });
});

describe('categorías de otros rubros', () => {
  const cats = CATEGORIAS_GASTO.map(c => c.categoria);
  it('ganado e insumos agrícolas', () => {
    expect(sugerirCategoria('FERIA GANADERA DEL SUR S.A.', cats)?.categoria).toBe('Ganado y animales');
    expect(sugerirCategoria('AGROINSUMOS Y FERTILIZANTES LIMITADA', cats)?.categoria).toBe('Insumos agrícolas y veterinarios');
    expect(sugerirCategoria('CLINICA VETERINARIA EL CAMPO', cats)?.categoria).toBe('Insumos agrícolas y veterinarios');
  });
  it('los planes guardados reciben las cuentas nuevas', () => {
    const viejo = { ...configInicial(), plan: configInicial().plan.filter(c => ![5105, 5106, 5107].includes(c.codigo)) };
    expect(completarPlan(viejo).plan.filter(c => [5105, 5106, 5107].includes(c.codigo))).toHaveLength(3);
  });
});

describe('borrador del F29 sin libro de remuneraciones ni honorarios', () => {
  it('muestra lo declarado en el último F29 como referencia', () => {
    const f: F29 = { periodo: '2026-05', folio: '1', rut: EMP, fechaPresentacion: '20/06/2026', tipo: 'Primitiva', codigos: { '538': 0, '048': 84000, '151': 15250, '077': 0 }, archivo: '' };
    const b = borradorF29([], [f], '2026-06', UTM_SII, 0.01);
    expect(b.lineas.find(l => l.codigo === '048')!.nota).toMatch(/2026-05 declaraste \$84\.000/);
    expect(b.lineas.find(l => l.codigo === '151')!.nota).toMatch(/\$15\.250/);
  });
});

describe('pagos con tarjeta y nombre del banco', () => {
  const factura = (folio: number, razonSocial: string, rut: string, total: number, fechaEmision: string): Documento => ({ libro: 'COMPRA', clave: `${rut}|33|${folio}`, empresa: EMP, tipoDoc: 33, folio,
    fechaEmision, fechaRecepcion: null, rutContraparte: rut, razonSocial, exento: 0, neto: Math.round(total / 1.19), iva: total - Math.round(total / 1.19), ivaNoRecuperable: 0,
    otrosImpuestos: 0, total, plazoDias: 30, estado: 'POR PAGAR', origen: 'prueba', observacion: '', periodoRCV: fechaEmision.slice(0, 7) });
  it('la marca de la estación (SHELL) se reconoce en la factura de quien la opera (ENEX)', async () => {
    const { sugerirCruces } = await import('./cruce');
    const docs = [factura(10, 'COMBUSTIBLES ENEX DE PRUEBA S.A.', '96.111.222-0', 30000, '2026-01-20'), factura(11, 'OTRA EMPRESA', '96.333.444-0', 30000, '2026-01-02')];
    const s = sugerirCruces([mov('1', '2026-01-21', -30000, 'REDCOMPRA SHELL.SUCURSAL')], docs, [], EMP).sugerencias[0];
    expect([s.confianza, s.docs]).toEqual(['Alta', [docs[0].clave]]);
    expect(s.motivo).toMatch(/lo factura ENEX/);
  });
  it('si el comercio de la glosa no calza, se busca la factura por monto', async () => {
    const { sugerirCruces } = await import('./cruce');
    const docs = [factura(20, 'COMBUSTIBLES ENEX DE PRUEBA S.A.', '96.111.222-0', 99999, '2026-02-01'), factura(21, 'DISTRIBUIDOR LOCAL', '96.555.666-0', 41230, '2026-02-09')];
    const s = sugerirCruces([mov('1', '2026-02-10', -41230, 'REDCOMPRA SHELL.SUCURSAL')], docs, [], EMP).sugerencias[0];
    expect([s.confianza, s.docs]).toEqual(['Media', [docs[1].clave]]);
    expect(s.motivo).toMatch(/Pago con tarjeta/);
  });
  it('la cartola histórica de Santander se reconoce aunque no diga el nombre del banco', async () => {
    const { clasificar: clasificarDoc } = await import('./clasificar');
    const filas = [['Cartolas históricas de Cuentas'], ['Empresa:', 'EMPRESA DE PRUEBA SPA'], ['Cuenta Corriente N°: 0-000-1234567-8', '', 'Moneda: PESOS DE CHILE'],
      ['Fecha', 'Descripción', 'Cargos (CLP)', 'Abonos (CLP)', 'Saldo (CLP)'], ['02/01/2026', 'TRASPASO', '1000', '', '5000']];
    const c = { formato: 'planilla' as const, texto: filas.map(f => f.join(';')).join('\n'), hojas: [{ nombre: 'Cartola Historica CtaCte', filas }], ocr: false };
    expect(clasificarDoc('CartolaHistCtaCte-1.xlsx', c)).toMatchObject({ tipo: 'CARTOLA', banco: 'Santander' });
  });
});
