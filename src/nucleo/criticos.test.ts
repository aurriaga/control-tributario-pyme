// Errores críticos encontrados con datos reales de otra empresa (diagnóstico del 23-11-2026). Datos ficticios con la
// misma forma: dos bancos, nota de crédito de exportación, liquidaciones-factura con su comisión, carpeta tributaria y
// Libro Diario de otro sistema.
import { describe, it, expect } from 'vitest';
import type { Documento } from './rcv';
import type { Movimiento } from './cartola';
import type { Contenido } from './extraer';
import { totalesRCV, cuadratura, leerF29Carpeta, type F29 } from './f29';
import { resumenAnual } from './resumen';
import { panelMes } from './panel';
import { clasificar } from './clasificar';
import { leerLibroDiario, codigoNumerico } from './libroDiario';
import { contabilidad, configInicial, usarLibro, f29Contables, C } from './contabilidad';
import { opcionesPPM, tasa84a } from './ppm';
import { calcularDV } from './rut';

const EMP = '77.777.777-7';
const rut = (n: number) => `${n.toLocaleString('de-DE')}-${calcularDV(n)}`;
const FERIA = rut(76555444), CLI = rut(80123456), EXT = '55.555.555-5';
function doc(p: Partial<Documento> & Pick<Documento, 'libro' | 'tipoDoc' | 'folio' | 'neto' | 'iva'>): Documento {
  const total = p.total ?? p.neto + p.iva + (p.exento ?? 0) + (p.otrosImpuestos ?? 0);
  const contra = p.rutContraparte ?? CLI;
  return { clave: `${p.libro === 'VENTA' ? EMP : contra}|${p.tipoDoc}|${p.folio}`, empresa: EMP, fechaEmision: '2026-03-10', fechaRecepcion: null,
    rutContraparte: contra, razonSocial: 'CONTRAPARTE DE PRUEBA', exento: 0, ivaNoRecuperable: 0, otrosImpuestos: 0, plazoDias: 30,
    estado: p.libro === 'VENTA' ? 'POR COBRAR' : 'POR PAGAR', origen: 'prueba', observacion: '', periodoRCV: '2026-03', ...p, total };
}
// Venta afecta, exportación con su nota de crédito (112), y una liquidación-factura: la venta del ganado en ventas y la
// comisión de la feria (mismo folio) en compras
const docs: Documento[] = [
  doc({ libro: 'VENTA', tipoDoc: 33, folio: 1, neto: 1000000, iva: 190000 }),
  doc({ libro: 'VENTA', tipoDoc: 110, folio: 2, neto: 0, exento: 5000000, iva: 0, rutContraparte: EXT }),
  doc({ libro: 'VENTA', tipoDoc: 112, folio: 3, neto: 0, exento: 1000000, iva: 0, rutContraparte: EXT }),
  doc({ libro: 'VENTA', tipoDoc: 43, folio: 900, neto: 2000000, iva: 380000, otrosImpuestos: -119000, rutContraparte: FERIA }),
  doc({ libro: 'COMPRA', tipoDoc: 43, folio: 900, neto: 100000, iva: 19000, rutContraparte: FERIA }),
  doc({ libro: 'COMPRA', tipoDoc: 33, folio: 77, neto: 400000, iva: 76000, rutContraparte: rut(76111222) }),
];

describe('una sola regla de signo y de comisión', () => {
  it('la nota de crédito de exportación (112) resta en el F29, el resumen y el panel', () => {
    const t = totalesRCV(docs, '2026-03');
    expect(t.base).toBe(1000000 + 5000000 - 1000000 + 2000000);
    expect(resumenAnual(docs, 2026).ventas).toBe(t.base);
    expect(panelMes('2026-03', docs, [], [], []).ventas).toBe(t.base);
  });
  it('la comisión de la liquidación-factura: crédito fiscal por omisión, débito y base del PPM si se elige la propuesta del SII', () => {
    expect(totalesRCV(docs, '2026-03')).toMatchObject({ debito: 190000 + 380000, credito: 76000 + 19000 });
    expect(totalesRCV(docs, '2026-03', { comisionLF: 'debito' })).toMatchObject({ debito: 190000 + 380000 + 19000, credito: 76000, base: 7000000 + 100000 });
    expect(resumenAnual(docs, 2026, { comisionLF: 'debito' }).ivaDebito).toBe(589000);
  });
  it('contabilidad: la comisión es gasto y el descuento de la feria salda su documento (no va a impuestos)', () => {
    const r = contabilidad({ empresa: EMP, docs, f29s: [], movs: [], libros: [], honorarios: [] }, configInicial());
    const v = r.asientos.find(a => a.clave === `V|${EMP}|43|900`)!;
    expect(v.lineas).toContainEqual({ codigo: C.PROVEEDORES, monto: 119000 });
    expect(v.lineas.some(l => l.codigo === C.IMPUESTOS)).toBe(false);
    const saldo = (c: number) => r.diario.filter(f => f.codigo === c).reduce((s, f) => s + f.debe - f.haber, 0);
    expect(saldo(C.VENTAS)).toBe(-(1000000 + 5000000 - 1000000 + 2000000));
    expect(saldo(C.COMISIONES)).toBe(100000);
    expect(saldo(C.PROVEEDORES)).toBe(-476000);                  // solo la factura 77: la comisión quedó saldada
  });
});

describe('saldo del mes con dos cuentas', () => {
  it('suma el último saldo de cada cuenta', () => {
    const m = (cuenta: string, fecha: string, saldo: number): Movimiento => ({ clave: `${cuenta}${fecha}`, cuenta, banco: '', fecha, descripcion: 'X', documento: '', cargo: 0, abono: 1, saldo, archivo: '', estado: 'pendiente' });
    expect(panelMes('2026-06', [], [], [m('111', '2026-06-29', 100), m('222', '2026-06-30', 2000)], []).banco.saldo).toBe(2100);
  });
});

describe('reconocimiento', () => {
  const planilla = (filas: string[][]): Contenido => ({ formato: 'planilla', texto: filas.map(f => f.join(';')).join('\n'), hojas: [{ nombre: 'Portada', filas }], ocr: false });
  it('un Libro Diario cuya portada nombra la cartola no se toma por cartola', () => {
    const c = planilla([['LIBRO DIARIO 2026'], ['Cartola Banco de Chile', 'cartolas 1 a 7'], ['N. Asiento', 'Fecha', 'Cuenta', 'Glosa', 'Debe', 'Haber'], ['1', '01-01-2026', '1-01-001', 'Apertura', '100', '']]);
    expect(clasificar('libro.xlsx', c).tipo).toBe('LIBRO_DIARIO');
  });
  it('los estados financieros no se toman por boletas de honorarios', () => {
    const c = planilla([['EMPRESA DE PRUEBA SPA'], ['ESTADO DE SITUACIÓN FINANCIERA'], ['Honorarios', 'retención', '100']]);
    expect(clasificar('eeff.xlsx', c).tipo).toBe('DESCONOCIDO');
  });
});

describe('carpeta tributaria', () => {
  const f29 = (per: string, folio: string, d538: number, r077: number) => `DECLARACIÓN MENSUAL Y PAGO\nSIMULTÁNEO DE IMPUESTOS\nFORMULARIO 29 \nFOLIO   [07]   ${folio} \nRUT   [03]   77.777.777-7 \nPERIODO   [15]   ${per} \nCódigo   Glosa   Valor \n538   TOTAL DÉBITOS   ${d538.toLocaleString('de-DE')} \n537   TOTAL CRÉDITOS   0 \n077   REMANENTE DE CRÉDITO FISC.   ${r077.toLocaleString('de-DE')} \n115   TASA PPM 1ra. CATEGORÍA   1 \nTOTAL A PAGAR DENTRO DEL PLAZO LEGAL   91   0   + \nPrimitiva 20/04/2026\n`;
  const texto = `Carpeta Tributaria Electrónica\nDeclaraciones de IVA - Formulario 29 (F29)\n${f29('202603', '111', 500000, 0)}Pág. 2\n${f29('202602', '222', 400000, 10)}`;
  it('lee cada F29 por separado', () => {
    const fs = leerF29Carpeta(texto, 'carpeta.pdf');
    expect(fs.map(f => [f.periodo, f.folio, f.codigos['538']])).toEqual([['2026-03', '111', 500000], ['2026-02', '222', 400000]]);
  });
  it('la contabilidad no centraliza F29 de antes de su primer mes', () => {
    const fs: F29[] = leerF29Carpeta(texto, 'c');
    expect(f29Contables(fs, '2026-03').map(f => f.periodo)).toEqual(['2026-03']);
    const r = contabilidad({ empresa: EMP, docs, f29s: fs, movs: [], libros: [], honorarios: [] }, configInicial());
    expect(r.asientos.filter(a => a.origen === 'F29').map(a => a.clave)).toEqual(['F|2026-03']);
    expect(r.avisos.join(' ')).toMatch(/1 F29 de antes de 2026-03/);
    expect(cuadratura(docs, fs).map(f => f.periodo)).toContain('2026-02');      // en IVA y F29 siguen todos
  });
});

describe('Libro Diario de otro sistema', () => {
  const c: Contenido = { formato: 'planilla', texto: 'LIBRO DIARIO', ocr: false, hojas: [
    { nombre: 'Plan de Cuentas', filas: [['Codigo', 'Nombre de la cuenta', 'Clase', 'Rubro'],
      ['1-01-001', 'Banco Prueba Cta. Cte. 0-000-1234567-8', 'ACTIVO', 'Activo corriente'], ['1-02-001', 'Deudores comerciales nacionales', 'ACTIVO', 'Activo corriente'],
      ['2-02-001', 'IVA Debito Fiscal', 'PASIVO', 'Pasivo corriente'], ['3-01-001', 'Capital pagado', 'PATRIMONIO', 'Patrimonio'],
      ['4-01-001', 'Ventas del giro', 'RESULTADO', 'Ingresos'], ['5-02-005', 'Comisiones de consignación', 'RESULTADO', 'Costos']] },
    { nombre: 'Libro Diario', filas: [['N. Asiento', 'Fecha', 'Origen', 'Glosa', 'Cuenta', 'Nombre de la cuenta', 'Debe', 'Haber'],
      ['00001', '01-01-2026', 'APERTURA', 'Apertura', '1-01-001', 'Banco', '1000', ''], ['00001', '01-01-2026', 'APERTURA', 'Apertura', '3-01-001', 'Capital', '', '1000'],
      ['00002', '15-01-2026', 'VENTA', 'Factura 1', '1-02-001', 'Deudores', '1190', ''], ['00002', '15-01-2026', 'VENTA', 'Factura 1', '4-01-001', 'Ventas', '', '1000'],
      ['00002', '15-01-2026', 'VENTA', 'Factura 1', '2-02-001', 'IVA', '', '190'], ['00003', '31-01-2026', 'GASTO', 'Comisión', '5-02-005', 'Comisión', '50', ''],
      ['00003', '31-01-2026', 'GASTO', 'Comisión', '1-01-001', 'Banco', '', '50']] },
    { nombre: 'Libro Mayor', filas: [['Fecha', 'Cuenta', 'Debe', 'Haber', 'Saldo'], ['01-01-2026', '1-01-001', '1000', '', '1000']] },
  ] };
  const l = leerLibroDiario(c).dato!;
  it('lee el plan con sus funciones y los asientos del diario (no del mayor)', () => {
    expect(codigoNumerico('1-01-001')).toBe(101001);
    expect([l.asientos, l.lineas.length, l.debe, l.haber, l.desde, l.hasta]).toEqual([3, 7, 2240, 2240, '2026-01-01', '2026-01-31']);
    const cta = (n: number) => l.plan.find(x => x.codigo === n)!;
    expect(cta(101001)).toMatchObject({ tipo: 'Activo', rol: 'banco', cuentaBancaria: '0-000-1234567-8' });
    expect(cta(102001).rol).toBe('clientes');
    expect(cta(401001)).toMatchObject({ tipo: 'Ingreso', grupo: 'Ingresos' });
    expect(cta(502005)).toMatchObject({ tipo: 'Gasto', grupo: 'Costo de ventas' });
  });
  it('usado en la contabilidad, sus asientos reemplazan a los automáticos hasta su última fecha', () => {
    const cfg = usarLibro(configInicial(), 'libro.xlsx', l.plan, l.lineas);
    const enero = doc({ libro: 'VENTA', tipoDoc: 33, folio: 1, neto: 1000, iva: 190, fechaEmision: '2026-01-15', periodoRCV: '2026-01' });
    const febrero = doc({ libro: 'VENTA', tipoDoc: 33, folio: 2, neto: 3000, iva: 570, fechaEmision: '2026-02-10', periodoRCV: '2026-02' });
    const r = contabilidad({ empresa: EMP, docs: [enero, febrero], f29s: [], movs: [], libros: [], honorarios: [] }, cfg);
    expect(r.asientos.filter(a => a.origen === 'Libro')).toHaveLength(3);
    expect(r.asientos.filter(a => a.origen === 'Ventas').map(a => a.documento)).toEqual(['2']);
    expect(r.asientos.find(a => a.origen === 'Ventas')!.lineas[0].codigo).toBe(102001);     // sigue en la cuenta de clientes del libro
    expect(r.balance.resultado).toBe(1000 - 50 + 3000);
    expect(r.balance.cuadra).toBe(true);
  });
});

describe('tasa del PPM', () => {
  it('ofrece las tasas del SII por régimen, la del F29 y una voluntaria', () => {
    const o = opcionesPPM(2026);
    expect(o.find(x => x.id === 'propyme-025')!.tasa).toBe(0.0025);
    expect(o.find(x => x.id === 'transp-02')!.tasa).toBe(0.002);
    expect(o.find(x => x.id === 'general-1')!.tasa).toBe(0.01);
    expect(o.some(x => x.id === 'voluntaria') && o.some(x => x.id === 'f29')).toBe(true);
  });
  it('art. 84 a): impuesto del año anterior ÷ ingresos brutos, con dos decimales del porcentaje', () => {
    expect(tasa84a(1234567, 98765432)).toBe(0.0125);
    expect(tasa84a(0, 1000)).toBeNull();
  });
});
