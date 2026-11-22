// Etapa 6 con datos ficticios: anular documentos, los 17 controles, panel del mes y respaldo del proyecto.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importarRCV, anularDocumento, reactivarDocumento, type Documento } from './rcv';
import { extraer } from './extraer';
import { leerCartola, type Movimiento } from './cartola';
import { totalesRCV } from './f29';
import { contabilidad, configInicial } from './contabilidad';
import { controlesGenerales, observacionesDocumento, posiblesDuplicados } from './controles';
import { panelMes, mesesConDatos, crearRespaldo, leerRespaldo } from './panel';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));
const EMP = '77.777.777-7';
const empresas = [{ rut: EMP, razonSocial: 'EMPRESA DE PRUEBA SPA' }];
const docs: Documento[] = ['PRUEBA_RCV_VENTA_77777777-7_202607.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202607.csv']
  .flatMap(f => importarRCV(f, leer(f), { empresas }).documentos);
const compra = docs.find(d => d.libro === 'COMPRA')!;

describe('anular documentos', () => {
  it('un documento anulado sale del IVA y de la contabilidad, y al reactivarlo vuelve', () => {
    const antes = totalesRCV(docs, '2026-07').credito;
    const anulado = anularDocumento(compra, 'no existe en el SII', '22-11-2026');
    expect(anulado.estado).toBe('ANULADA');
    expect(anulado.observacion).toMatch(/^Anulado el 22-11-2026: no existe en el SII\./);
    const con = docs.map(d => (d.clave === compra.clave ? anulado : d));
    expect(totalesRCV(con, '2026-07').credito).toBe(antes - compra.iva);
    const r = contabilidad({ empresa: EMP, docs: con, f29s: [], movs: [], libros: [], honorarios: [] }, configInicial());
    expect(r.asientos.some(a => a.clave === `C|${compra.clave}`)).toBe(false);
    const de = reactivarDocumento(anulado);
    expect(de.estado).toBe('POR PAGAR');
    expect(de.observacion).toBe(compra.observacion);
  });
});

describe('controles', () => {
  it('observaciones de un documento: RUT inválido e IVA distinto del 19%', () => {
    expect(observacionesDocumento(compra)).toEqual([]);
    expect(observacionesDocumento({ ...compra, rutContraparte: '11.111.111-2', iva: compra.iva + 50, total: compra.total + 50 }))
      .toEqual(['RUT proveedor inválido.', 'IVA distinto del 19% del neto.']);
  });
  it('posibles duplicados del banco: misma cuenta, fecha, monto y glosa sin un saldo que los distinga', () => {
    const m = { clave: 'a', cuenta: '1', banco: '', fecha: '2026-07-01', descripcion: 'COMISION', documento: '', cargo: 500, abono: 0, saldo: null, archivo: '', estado: 'pendiente' } as Movimiento;
    expect(posiblesDuplicados([m, { ...m, clave: 'b', documento: 'x' }, { ...m, clave: 'c', fecha: '2026-07-02' }])).toHaveLength(1);
    // con saldos distintos el banco confirma que son dos operaciones
    expect(posiblesDuplicados([{ ...m, saldo: 1000 }, { ...m, clave: 'b', saldo: 500 }])).toHaveLength(0);
  });
  it('son 17 controles, como la hoja Controles del Excel', async () => {
    const f = 'PRUEBA_cartola_santander_202607.csv';
    const movs = leerCartola(f, await extraer(f, leer(f)), '').movimientos;
    const c = controlesGenerales({ empresa: EMP, docs, f29s: [], movs, libros: [], honorarios: [], utm: {} }, configInicial());
    expect(c).toHaveLength(17);
    expect(new Set(c.map(x => x.nombre)).size).toBe(17);
    // el RCV ficticio trae a propósito la venta folio 103 con IVA del 18%
    expect(c.find(x => x.nombre === 'Documentos con observaciones')).toMatchObject({ estado: 'Revisar', resultado: expect.stringMatching(/folio 103/) });
  });
});

describe('panel del mes', () => {
  it('cuenta lo cargado y dice qué falta', () => {
    expect(mesesConDatos(docs, [], [], [])[0]).toBe('2026-07');
    const p = panelMes('2026-07', docs, [], [], []);
    expect(p.docsVenta + p.docsCompra).toBe(docs.length);
    expect(p.pendientes.find(x => x.que === 'F29 declarado')).toMatchObject({ hecho: false });
    expect(p.f29.vence).toBe('2026-08-20');
  });
});

describe('respaldo del proyecto', () => {
  it('se guarda y se vuelve a abrir con el mismo contenido', () => {
    const datos = { 'ctp.empresa': empresas[0], 'ctp.documentos': docs, 'ctp.utm': { '2026-07': 69000 }, 'otra.clave': 1 };
    const texto = JSON.stringify(crearRespaldo(datos, new Date('2026-11-22T12:00:00Z')));
    const r = leerRespaldo(texto);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.respaldo.datos['ctp.documentos']).toEqual(docs);
    expect(r.respaldo.datos).not.toHaveProperty('otra.clave');
    expect(r.resumen).toMatch(new RegExp(`${docs.length} documentos`));
  });
  it('rechaza archivos que no son respaldos', () => {
    expect(leerRespaldo('hola').ok).toBe(false);
    expect(leerRespaldo('{"app":"otra"}').ok).toBe(false);
  });
});
