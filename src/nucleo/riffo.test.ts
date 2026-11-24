// Riffo Junior después del diagnóstico del 23-11-2026: preguntas sobre los datos de la empresa, ayuda que no contesta
// otro tema, cálculos, glosario y asientos de una empresa agrícola exportadora. Datos ficticios (RUT 77.777.777-7).
import { describe, it, expect } from 'vitest';
import type { Documento } from './rcv';
import type { Movimiento } from './cartola';
import type { F29 } from './f29';
import { intencion, buscarAyuda, respuestaNormativa } from './asistente';
import { pideDatos, responderDatos, periodoPedido, type DatosEmpresa } from './consultas';
import { responderTributaria } from './tributario';
import { responderGlosario, vencimientoF29, jerga } from './vocabulario';
import { proponerAsiento } from './asientosAyuda';
import { configInicial, PLAN_BASE } from './contabilidad';

const EMP = { rut: '77.777.777-7', razonSocial: 'AGRICOLA DE PRUEBA SPA' };
const hoy = new Date('2026-11-24');
function doc(p: Partial<Documento> & Pick<Documento, 'libro' | 'tipoDoc' | 'folio' | 'neto' | 'iva'>): Documento {
  const total = p.total ?? p.neto + p.iva + (p.exento ?? 0);
  return { clave: `${p.libro}|${p.tipoDoc}|${p.folio}`, empresa: EMP.rut, fechaEmision: '2026-06-10', fechaRecepcion: null, rutContraparte: '76.111.222-3',
    razonSocial: 'FERIA DE PRUEBA S.A.', exento: 0, ivaNoRecuperable: 0, otrosImpuestos: 0, plazoDias: 30, estado: p.libro === 'VENTA' ? 'POR COBRAR' : 'POR PAGAR',
    origen: 'prueba', observacion: '', periodoRCV: '2026-06', ...p, total };
}
const f29 = (periodo: string, c: Record<string, number>): F29 => ({ periodo, folio: `F${periodo}`, rut: EMP.rut, fechaPresentacion: '20/07/2026', tipo: 'Primitiva', codigos: c, archivo: 'x' });
const mov = (cuenta: string, banco: string, fecha: string, saldo: number): Movimiento => ({ clave: cuenta + fecha, cuenta, banco, fecha, descripcion: 'X', documento: '', cargo: 0, abono: 1, saldo, archivo: '', estado: 'pendiente' });
const datos: DatosEmpresa = {
  empresa: EMP, libros: [], honorarios: [], cfg: configInicial(),
  docs: [
    doc({ libro: 'VENTA', tipoDoc: 33, folio: 1, neto: 1000000, iva: 190000, razonSocial: 'CLIENTE UNO S.A.' }),
    doc({ libro: 'VENTA', tipoDoc: 110, folio: 2, neto: 0, exento: 4000000, iva: 0, razonSocial: 'IMPORTADOR EXTRANJERO LTD' }),
    doc({ libro: 'VENTA', tipoDoc: 112, folio: 3, neto: 0, exento: 500000, iva: 0, razonSocial: 'IMPORTADOR EXTRANJERO LTD' }),
    doc({ libro: 'COMPRA', tipoDoc: 33, folio: 10, neto: 2000000, iva: 380000 }),
    doc({ libro: 'COMPRA', tipoDoc: 33, folio: 11, neto: 300000, iva: 57000, razonSocial: 'FERRETERIA DE PRUEBA', rutContraparte: '76.333.444-5' }),
  ],
  f29s: [f29('2026-05', { '538': 100, '537': 900, '077': 800000 }), f29('2026-06', { '538': 190000, '537': 1237000, '504': 800000, '089': 0, '077': 1047000, '062': 45000, '115': 0.01, '151': 0, '048': 0, '91': 45000 })],
  movs: [mov('111', 'Banco Uno', '2026-06-29', 1500), mov('222', 'Banco Dos', '2026-06-30', 2500)],
};

describe('preguntas sobre los datos de la empresa', () => {
  it('se reconocen y no se confunden con cálculos ni definiciones', () => {
    for (const q of ['¿Cuánto IVA pagué en junio?', '¿Cuánto vendí este año?', '¿Cuánto le debo a la feria?', '¿Por qué tengo tanto remanente?', '¿cuánta plata tengo en el banco?'])
      expect(intencion(q), q).toBe('datos');
    expect(pideDatos('¿cuánto pago de PPM si vendí 74.882.762?')).toBe(false);
    expect(pideDatos('¿Qué es el remanente?')).toBe(false);
    expect(intencion('Revisa mi empresa')).toBe('revisar');
  });
  it('IVA de un mes: lo declarado en el F29', () => {
    const r = responderDatos('¿Cuánto IVA pagué en junio?', datos, hoy)!.texto;
    expect(r).toMatch(/F29 de junio 2026/);
    expect(r).toMatch(/IVA a pagar \$0 y quedó remanente de \$1\.047\.000/);
    expect(r).toMatch(/Total pagado: \$45\.000/);
  });
  it('ventas del año con la nota de crédito de exportación restando', () => {
    expect(responderDatos('¿Cuánto vendí este año?', datos, hoy)!.texto).toMatch(/Ventas netas de 2026: \$4\.500\.000/);
  });
  it('lo que se debe a un proveedor por su nombre', () => {
    const r = responderDatos('¿Cuánto le debo a la feria?', datos, hoy)!.texto;
    expect(r).toMatch(/Le debes \$2\.380\.000 en 1 documento/);
    expect(responderDatos('¿cuánto debo a mis proveedores?', datos, hoy)!.texto).toMatch(/\$2\.737\.000/);
  });
  it('remanente con la explicación del exportador', () => {
    const r = responderDatos('¿Por qué tengo tanto remanente?', datos, hoy)!.texto;
    expect(r).toMatch(/\$1\.047\.000/);
    expect(r).toMatch(/art\. 36/);
  });
  it('saldo del banco sumando las cuentas', () => {
    expect(responderDatos('¿cuánta plata tengo en el banco?', datos, hoy)!.texto).toMatch(/\$4\.000 en 2 cuentas/);
  });
  it('períodos: mes, trimestre, semestre y año', () => {
    expect(periodoPedido(jerga('en el primer trimestre'), ['2026-06'])).toMatchObject({ desde: '2026-01', hasta: '2026-03' });
    expect(periodoPedido(jerga('del segundo semestre de 2025'), ['2026-06'])).toMatchObject({ desde: '2025-07', hasta: '2025-12' });
    expect(periodoPedido(jerga('en marzo'), ['2026-06'])).toMatchObject({ desde: '2026-03', hasta: '2026-03' });
  });
});

describe('ayuda y glosario', () => {
  it('la ayuda ya no responde otro tema por una palabra común', () => {
    expect(buscarAyuda('¿Qué es una liquidación factura?')).toBeNull();
    expect(buscarAyuda('¿El ganado es activo biológico?')).toBeNull();
    expect(buscarAyuda('¿Cómo importo mi libro diario?')?.texto).toMatch(/Usar este libro/);
    expect(buscarAyuda('¿Cómo concilio dos cuentas bancarias?')?.texto).toMatch(/Cuenta bancaria/);
  });
  it('términos de una empresa agrícola exportadora', () => {
    expect(responderGlosario('¿Qué es una liquidación factura?')!.texto).toMatch(/comisión/);
    expect(responderGlosario('¿Las exportaciones pagan IVA?')!.texto).toMatch(/exentas/);
    expect(responderGlosario('¿Puedo recuperar el impuesto específico del diésel?')!.texto).toMatch(/Ley 18\.502/);
    expect(responderGlosario('¿El ganado es activo biológico?')!.texto).toMatch(/sección 34/);
    expect(responderGlosario('me llegó una multa del SII qué hago')!.texto).toMatch(/condonación/);
    expect(responderGlosario('¿qué pasa si pago con multa por atraso?')!.texto).toMatch(/reajustado/);
  });
  it('vencimiento concreto del F29, corrido si cae en fin de semana', () => {
    expect(vencimientoF29(jerga('¿Cuándo vence el F29 de noviembre?'), hoy)!.texto).toMatch(/lunes 21 de diciembre de 2026/);
    expect(vencimientoF29(jerga('¿cuándo vence el F29?'), hoy)).toBeNull();
  });
  it('varias DJ a la vez', () => {
    const r = responderGlosario('¿Qué DJ me tocan si tengo trabajadores y honorarios?')!.texto;
    expect(r).toMatch(/DJ 1887/); expect(r).toMatch(/DJ 1879/);
  });
  it('saludos y UTM de un mes', () => {
    expect(intencion('hola')).toBe('charla'); expect(intencion('muchas gracias')).toBe('charla');
    expect(respuestaNormativa(hoy, '¿Cuánto es la UTM de octubre de 2026?').texto).toMatch(/\$72\.151/);
  });
});

describe('cálculos', () => {
  it('Primera Categoría aunque no diga "primera categoría"', () => {
    expect(responderTributaria('renta líquida de 30.000.000 pro pyme, ¿cuánto pago?', hoy)!.texto).toMatch(/\$3\.750\.000/);
    expect(intencion('utilidad de 30.000.000, ¿cuánto impuesto pago?')).toBe('tributaria');
    expect(responderTributaria('cuánto pago de impuesto si gané 30 palos siendo pro pyme', hoy)!.texto).toMatch(/\$3\.750\.000/);
  });
  it('PPM con la tasa de la empresa y tasas por régimen', () => {
    expect(responderTributaria('¿cuánto pago de PPM si vendí 10.000.000?', hoy, { tasaPPM: 0.01, origenTasaPPM: '1%, la del último F29' })!.texto).toMatch(/\$100\.000\. Usé la tasa de tu empresa/);
    const r = responderTributaria('¿Cuál es la tasa de PPM para una pro pyme?', hoy)!.texto;
    expect(r).toMatch(/0,25%/); expect(r).toMatch(/0,5%/); expect(r).not.toMatch(/0,2%:/);
  });
  it('porcentaje suelto', () => {
    expect(responderTributaria('cuánto es el 19% de 1.190.000', hoy)!.texto).toMatch(/es \$226\.100/);
  });
});

describe('asientos de una empresa agrícola exportadora', () => {
  const plan = PLAN_BASE;
  const cods = (f: string) => proponerAsiento(f, plan, '2026-11-24')!.lineas.map(l => [l.codigo, l.debe, l.haber]);
  it('exportación sin IVA, por cobrar', () => expect(cods('exporté 5.000.000 a China')).toEqual([[1103, 5000000, 0], [4101, 0, 5000000]]));
  it('nota de crédito de exportación', () => expect(cods('nota de crédito de exportación por 500.000')).toEqual([[4101, 500000, 0], [1103, 0, 500000]]));
  it('traspaso entre cuentas propias', () => expect(cods('traspaso de 1.000.000 entre mis cuentas')).toEqual([[1198, 1000000, 0], [1102, 0, 1000000]]));
  it('comisión de la feria a su cuenta y fertilizante a insumos del giro', () => {
    expect(cods('pagué 100.000 de comisión a la feria')[0][0]).toBe(5105);
    expect(cods('compré fertilizante por 2.380.000 con factura')[0][0]).toBe(5101);
  });
});
