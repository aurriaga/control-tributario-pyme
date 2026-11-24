// Contabilidad automática con datos ficticios (RUT 77.777.777-7): mismos criterios que modContabilidad.bas.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Documento } from './rcv';
import type { Movimiento } from './cartola';
import type { F29 } from './f29';
import type { LibroRemuneraciones, Trabajador } from './remuneraciones';
import { calcularDV } from './rut';
import { extraer } from './extraer';
import { leerCartola } from './cartola';
import { importarRCV } from './rcv';
import {
  contabilidad, configInicial, aperturaSugerida, mayor, asignarCategoria, proveedoresSinCategoria, categoriaDe, C,
  type ConfigContable, type Entradas,
} from './contabilidad';

const EMP = '77.777.777-7';
const rut = (n: number) => `${n.toLocaleString('de-DE')}-${calcularDV(n)}`;
const PROV = rut(76543210), PROV2 = rut(76111222), CLI = rut(80123456), TRAB = rut(15111222);

function doc(p: Partial<Documento> & Pick<Documento, 'libro' | 'tipoDoc' | 'folio' | 'neto' | 'iva'>): Documento {
  const total = p.total ?? p.neto + p.iva + (p.exento ?? 0);
  const contra = p.rutContraparte ?? (p.libro === 'VENTA' ? CLI : PROV);
  return { clave: `${p.libro === 'VENTA' ? EMP : contra}|${p.tipoDoc}|${p.folio}`, empresa: EMP, fechaEmision: '2026-07-05', fechaRecepcion: null,
    rutContraparte: contra, razonSocial: p.libro === 'VENTA' ? 'CLIENTE DE PRUEBA' : 'PROVEEDOR DE PRUEBA', exento: 0, ivaNoRecuperable: 0,
    otrosImpuestos: 0, plazoDias: 30, estado: p.libro === 'VENTA' ? 'POR COBRAR' : 'POR PAGAR', origen: 'prueba', observacion: '', periodoRCV: '2026-07', ...p, total };
}
function mov(fecha: string, descripcion: string, monto: number, saldo: number, extra: Partial<Movimiento> = {}): Movimiento {
  return { clave: `${fecha}|${descripcion}|${monto}`, cuenta: '0-000-00000-0', banco: 'Prueba', fecha, descripcion, documento: '', cargo: Math.max(0, -monto),
    abono: Math.max(0, monto), saldo, archivo: 'prueba', estado: 'pendiente', ...extra };
}
const trabajador = (t: Partial<Trabajador>): Trabajador => ({ rut: TRAB, nombre: 'TRABAJADOR', cargo: '', contrato: '', diasTrabajados: 30, diasLicencia: 0,
  baseImponible: 0, totalTributable: 0, noImponible: 0, totalHaberes: 0, afp: 0, salud: 0, cesantia: 0, impuestoUnico: 0, anticipos: 0, otrosDescuentos: 0,
  totalDescuentos: 0, liquido: 0, control: 'OK', ...t });

const venta = doc({ libro: 'VENTA', tipoDoc: 33, folio: 1, neto: 1000000, iva: 190000, estado: 'COBRADA', fechaPago: '2026-07-20' });
const compra = doc({ libro: 'COMPRA', tipoDoc: 33, folio: 10, neto: 500000, iva: 95000, fechaEmision: '2026-07-10' });
const nc = doc({ libro: 'COMPRA', tipoDoc: 61, folio: 11, neto: 100000, iva: 19000, fechaEmision: '2026-07-12' });
const atrasada = doc({ libro: 'COMPRA', tipoDoc: 33, folio: 50, neto: 200000, iva: 38000, fechaEmision: '2026-06-28', rutContraparte: PROV2 });
const liquidacion = doc({ libro: 'COMPRA', tipoDoc: 43, folio: 7, neto: 300000, iva: 57000, rutContraparte: rut(96000111) });
const docs = [venta, compra, nc, atrasada, liquidacion];

const movs: Movimiento[] = [
  mov('2026-07-20', 'TRANSF DE CLIENTE DE PRUEBA', 1190000, 2190000, { estado: 'conciliado', docs: [venta.clave] }),
  mov('2026-07-25', `TRANSF A ${PROV.replace(/\./g, '')} PROVEEDOR`, -476000, 1714000),
  mov('2026-07-31', 'COMISION MANTENCION', -5000, 1709000, { estado: 'clasificado', categoria: 'Comisiones y gastos bancarios' }),
  mov('2026-07-31', 'DEPOSITO EN EFECTIVO', 300000, 2009000),
  mov('2026-07-31', 'CARGO AUTOMATICO', -20000, 1989000),
  mov('2026-08-12', 'PAGO PREVIRED', -200000, 1789000),
];
const f29: F29 = { periodo: '2026-07', folio: '123', rut: EMP, fechaPresentacion: '12/08/2026', tipo: 'Primitiva', archivo: 'f29.pdf',
  codigos: { '538': 190000, '520': 95000 + 38000 + 57000, '528': 19000, '537': 171000, '089': 19000, '062': 10000, '151': 15250, '048': 12000, '077': 0, '91': 56250 } };
const libro: LibroRemuneraciones = { periodo: '2026-07', rutEmpresa: EMP, archivo: 'libro', totalHaberes: 800000, totalLiquido: 0, cuadraTotales: true,
  trabajadores: [trabajador({ totalHaberes: 800000, afp: 80000, salud: 56000, cesantia: 4800, impuestoUnico: 12000 })] };
const honorarios = [{ periodo: '2026-07', vigentes: 1, anuladas: 0, bruto: 100000, retencionTerceros: 15250, retencionEmisor: 0, liquido: 84750, control: 'OK' }];

const entradas: Entradas = { empresa: EMP, docs, f29s: [f29], movs, libros: [libro], honorarios };
function config(): ConfigContable {
  const c = configInicial();
  c.provCategoria = asignarCategoria({}, PROV, 'Arriendos');
  c.apertura = aperturaSugerida(movs, c);
  c.manuales = [
    { asiento: 'DEP-07', fecha: '2026-07-31', codigo: C.DEPRECIACION, glosa: 'Depreciación julio', documento: '', debe: 50000, haber: 0 },
    { asiento: 'DEP-07', fecha: '2026-07-31', codigo: C.DEP_ACUM, glosa: '', documento: '', debe: 0, haber: 50000 },
    { asiento: 'MALO', fecha: '2026-07-31', codigo: C.CAJA, glosa: 'Descuadrado', documento: '', debe: 1000, haber: 0 },
  ];
  return c;
}
const saldoDe = (r: ReturnType<typeof contabilidad>, c: number) => mayor(r.diario, c).saldo;

describe('asientos automáticos', () => {
  const r = contabilidad(entradas, config());
  it('partida doble: cada asiento cuadra y el balance de 8 columnas también', () => {
    const d = r.diario.reduce((s, f) => s + f.debe, 0), h = r.diario.reduce((s, f) => s + f.haber, 0);
    expect(d).toBe(h);
    expect(r.balance.cuadra).toBe(true);
    expect(r.controles.find(c => c.nombre === 'Partida doble')?.estado).toBe('OK');
  });
  it('venta: clientes contra ventas e IVA débito', () => {
    const a = r.asientos.find(x => x.clave === `V|${venta.clave}`)!;
    expect(a.lineas).toEqual([{ codigo: C.CLIENTES, monto: 1190000 }, { codigo: C.VENTAS, monto: -1000000 }, { codigo: C.IVA_DF, monto: -190000 }]);
  });
  it('compra: la categoría aprendida del proveedor elige la cuenta; la nota de crédito la rebaja; sin categoría va a 5990', () => {
    expect(r.asientos.find(x => x.clave === `C|${compra.clave}`)!.lineas[0]).toEqual({ codigo: 5201, monto: 500000 });
    expect(r.asientos.find(x => x.clave === `C|${nc.clave}`)!.lineas).toEqual([{ codigo: 5201, monto: -100000 }, { codigo: C.IVA_CF, monto: -19000 }, { codigo: C.PROVEEDORES, monto: 119000 }]);
    expect(r.asientos.find(x => x.clave === `C|${atrasada.clave}`)!.lineas[0].codigo).toBe(C.POR_REVISAR);
  });
  it('compra registrada en un mes posterior: el asiento va al mes del RCV', () => {
    const a = r.asientos.find(x => x.clave === `C|${atrasada.clave}`)!;
    expect(a.fecha).toBe('2026-07-01');
    expect(a.glosa).toMatch(/emitida el 28-06-2026/);
  });
  it('liquidación-factura recibida: es la comisión del mandatario (gasto) y su IVA es crédito fiscal', () => {
    expect(r.asientos.find(x => x.clave === `C|${liquidacion.clave}`)!.lineas).toEqual([{ codigo: C.COMISIONES, monto: 300000 }, { codigo: C.IVA_CF, monto: 57000 }, { codigo: C.PROVEEDORES, monto: -357000 }]);
  });
  it('si la empresa declara el IVA de la comisión como débito (propuesta del SII), ese IVA es costo y va al débito', () => {
    const a = contabilidad(entradas, { ...config(), ivaComisionLF: 'debito' }).asientos.find(x => x.clave === `C|${liquidacion.clave}`)!;
    expect(a.lineas).toEqual([{ codigo: C.COMISIONES, monto: 414000 }, { codigo: C.IVA_DF, monto: -57000 }, { codigo: C.PROVEEDORES, monto: -357000 }]);
  });
  it('remuneraciones: centralización del libro y aporte del empleador con el PREVIRED del mes siguiente', () => {
    expect(r.asientos.find(x => x.clave === 'R|2026-07')!.lineas).toEqual([{ codigo: C.GASTO_REMUN, monto: 800000 }, { codigo: C.REMUN, monto: -800000 }]);
    expect(r.asientos.find(x => x.clave === 'R|AP|2026-07')!.lineas[0]).toEqual({ codigo: C.APORTE_EMP, monto: 200000 - 140800 });
  });
  it('honorarios y F29: gasto bruto; el F29 traspasa IVA, PPM y retenciones a impuestos por pagar', () => {
    expect(r.asientos.find(x => x.clave === 'H|2026-07')!.lineas[0]).toEqual({ codigo: C.GASTO_HONOR, monto: 100000 });
    const f = r.asientos.find(x => x.clave === 'F|2026-07')!;
    expect(f.lineas.filter(l => l.codigo === C.IMPUESTOS).reduce((s, l) => s + l.monto, 0)).toBe(-(19000 + 10000 + 15250 + 12000));
    expect(f.lineas.find(l => l.codigo === C.IVA_CF)!.monto).toBe(-(190000 - 19000));
  });
  it('banco: conciliado a clientes, cargo con RUT de proveedor a proveedores, clasificado a su cuenta y el resto a transitorias', () => {
    const contra = (desc: string) => r.asientos.find(a => a.origen === 'Banco' && a.glosa.includes(desc))!.lineas.find(l => l.codigo !== C.BANCO)!.codigo;
    expect(contra('CLIENTE DE PRUEBA')).toBe(C.CLIENTES);
    expect(contra('PROVEEDOR')).toBe(C.PROVEEDORES);
    expect(contra('COMISION')).toBe(5301);
    expect(contra('DEPOSITO')).toBe(C.ABONOS_ID);
    expect(contra('CARGO AUTOMATICO')).toBe(C.CARGOS_ID);
    expect(contra('PREVIRED')).toBe(C.REMUN);
  });
  it('con la apertura sugerida el mayor del banco es igual al último saldo de la cartola', () => {
    expect(saldoDe(r, C.BANCO)).toBe(1789000);
    expect(r.controles.find(c => c.nombre === 'Banco = cartola')?.estado).toBe('OK');
  });
  it('asiento manual descuadrado no entra al Diario y se avisa', () => {
    expect(r.manualesRechazados).toEqual(['MALO']);
    expect(r.asientos.some(a => a.clave === 'M|DEP-07')).toBe(true);
    expect(r.controles.find(c => c.nombre === 'Asientos manuales')?.estado).toBe('Revisar');
  });
  it('el Estado de Resultados termina en el mismo resultado del balance', () => {
    expect(r.eerr[r.eerr.length - 1].monto).toBe(r.balance.resultado);
    expect(r.eerr[0].monto).toBe(1000000);           // la comisión de la liquidación-factura no es venta
  });
  it('IVA del libro = F29: débito, crédito y remanente calzan', () => {
    expect(r.controles.find(c => c.nombre === 'IVA del libro = F29 declarados')?.estado).toBe('OK');
  });
  it('el Diario va por fecha y el saldo corrido de cada cuenta termina en el saldo del mayor', () => {
    const fechas = r.diario.map(f => f.fecha);
    expect([...fechas].sort()).toEqual(fechas);
    const ultBanco = r.diario.filter(f => f.codigo === C.BANCO).pop()!;
    expect(ultBanco.saldo).toBe(1789000);
  });
  it('balance por rango de meses: solo julio (la apertura es del 1 de enero y queda fuera)', () => {
    const b = contabilidad(entradas, config(), '2026-07', '2026-07').balance;
    expect(b.filas.find(f => f.codigo === C.BANCO)!.debitos).toBe(1190000 + 300000);
  });
});

describe('categorías de compras', () => {
  it('lista los proveedores sin categoría y aprende la que se asigna', () => {
    const sin = proveedoresSinCategoria(docs, {}, EMP);
    expect(sin.map(p => p.rut)).toEqual([PROV, PROV2]);         // la liquidación-factura no es gasto
    const m = asignarCategoria({}, PROV2, 'Fletes y despacho');
    expect(categoriaDe(atrasada, m)).toBe('Fletes y despacho');
    expect(categoriaDe({ ...atrasada, categoria: 'Seguros' }, m)).toBe('Seguros');   // la del documento manda
  });
});

describe('con los archivos de prueba', () => {
  it('RCV y cartola ficticios: el Diario cuadra y el banco iguala la cartola', async () => {
    const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
    const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));
    const empresas = [{ rut: EMP, razonSocial: 'EMPRESA DE PRUEBA SPA' }];
    const ds = ['PRUEBA_RCV_VENTA_77777777-7_202607.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202607.csv'].flatMap(f => importarRCV(f, leer(f), { empresas }).documentos);
    const f = 'PRUEBA_cartola_santander_202607.csv';
    const ms = leerCartola(f, await extraer(f, leer(f)), '').movimientos;
    const cfg = configInicial(); cfg.apertura = aperturaSugerida(ms, cfg);
    const r = contabilidad({ empresa: EMP, docs: ds, f29s: [], movs: ms, libros: [], honorarios: [] }, cfg);
    expect(r.balance.cuadra).toBe(true);
    expect(r.controles.find(c => c.nombre === 'Banco = cartola')?.estado).toBe('OK');
    expect(r.controles.find(c => c.nombre === 'Compras sin categoría o por revisar')?.estado).toBe('Pendiente');
  });
});

describe('clasificar directo a una cuenta del plan', () => {
  it('"Cuenta 1104: …" lleva el movimiento a esa cuenta y una cuenta nueva sugiere el siguiente código libre', async () => {
    const { etiquetaCuenta, codigoDeEtiqueta, codigoSugerido, PLAN_BASE } = await import('./contabilidad');
    const fondos = PLAN_BASE.find(c => c.codigo === 1104)!;
    expect(codigoDeEtiqueta(etiquetaCuenta(fondos))).toBe(1104);
    const m = mov('2026-07-31', 'RESCATE FONDO MUTUO', 300000, 2009000, { estado: 'clasificado', categoria: etiquetaCuenta(fondos) });
    const r = contabilidad({ ...entradas, movs: [m] }, config());
    expect(r.asientos.find(a => a.origen === 'Banco')!.lineas.find(l => l.codigo !== C.BANCO)!.codigo).toBe(1104);
    expect(codigoSugerido(PLAN_BASE, 'Gasto')).toBe(5303);
    expect(codigoSugerido([...PLAN_BASE, { codigo: 5303, nombre: 'Nueva', tipo: 'Gasto' }], 'Gasto')).toBe(5304);
  });
});
