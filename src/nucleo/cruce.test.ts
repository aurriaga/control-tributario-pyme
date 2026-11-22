// Mismos casos que modPruebas.bas (lector de cartolas y cruce banco-facturas) con los archivos ficticios.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extraer } from './extraer';
import { textoDePdf, type PdfJs } from './pdfTexto';
import { leerCartola, type Movimiento } from './cartola';
import { sugerirCruces, aplicarCruces, rutsEnTexto, rutsConDV, foliosEnTexto, clasificar, crearRegla } from './cruce';
import { importarRCV, type Documento } from './rcv';
import { leerF29 } from './f29';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));
const empresas = [{ rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' }];
async function pdfjs() {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc = pathToFileURL(join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).href;
  return lib as unknown as PdfJs;
}
const servicios = { textoPDF: async (b: Uint8Array) => textoDePdf(await pdfjs(), b) };
async function cartola(f: string, banco = '') { return leerCartola(f, await extraer(f, leer(f), servicios), banco); }

describe('lector de cartolas', () => {
  it('CSV Santander: 6 movimientos (se omite el saldo anterior) y la cuenta', async () => {
    const r = await cartola('PRUEBA_cartola_santander_202607.csv');
    expect(r.movimientos).toHaveLength(6);
    expect(r.cuenta).toBe('0-000-00000-0');
    expect(r.saldoInicial).toBe(10000000);
  });
  it('la misma cartola con otro nombre da las mismas claves (no se duplica)', async () => {
    const a = await cartola('PRUEBA_cartola_santander_202607.csv'), b = await cartola('PRUEBA_cartola_santander_202607_copia.csv');
    expect(b.movimientos.map(m => m.clave)).toEqual(a.movimientos.map(m => m.clave));
    expect(new Set(a.movimientos.map(m => m.clave)).size).toBe(6);       // dos cargos idénticos siguen siendo dos
  });
  it('Excel BancoEstado: 3 movimientos', async () => {
    expect((await cartola('PRUEBA_cartola_bancoestado_202608.xlsx')).movimientos).toHaveLength(3);
  });
  it('PDF BancoEstado: el signo sale de la variación del saldo', async () => {
    const r = await cartola('PRUEBA_cartola_bancoestado_202608.pdf');
    expect(r.movimientos).toHaveLength(3);
    expect(r.movimientos.every(m => m.cargo > 0)).toBe(true);
  });
  it('Banco de Chile: 3 movimientos, sin repetir el resumen de comisiones, y cuadra con el saldo final', async () => {
    const r = await cartola('PRUEBA_cartola_bancochile_202610.xlsx');
    expect(r.movimientos).toHaveLength(3);
    expect(r.cuenta).toBe('0-000-1234567-8');
    expect(r.saldoFinal).toBe(1287500);
    expect(r.cuadra).toBe(true);
    expect(r.movimientos[1].abono).toBe(500000);
  });
  it('columnas D/C, Monto + Tipo, Debe/Haber y fechas en texto', async () => {
    const dc = await cartola('PRUEBA_cartola_dc_202611.csv');
    expect(dc.movimientos.map(m => [m.cargo, m.abono])).toEqual([[30000, 0], [0, 80000]]);
    const mt = await cartola('PRUEBA_cartola_monto_tipo_202611.csv');
    expect(mt.movimientos.map(m => [m.cargo, m.abono])).toEqual([[0, 100000], [50000, 0]]);
    const dh = await cartola('PRUEBA_cartola_debe_haber_202611.csv');
    expect(dh.movimientos.map(m => [m.cargo, m.abono])).toEqual([[1234567, 0], [0, 2000000]]);
    const ft = await cartola('PRUEBA_cartola_fechas_texto_202601.csv');
    expect(ft.movimientos.map(m => m.fecha)).toEqual(['2026-01-02', '2026-01-03']);
  });
});

describe('cruce banco-facturas', () => {
  it('RUT, folios y RUT ajenos en la glosa', () => {
    expect([...foliosEnTexto('FACT 440 441 RUT 78.000.002-3')]).toEqual(['440', '441']);
    expect([...foliosEnTexto('PAGO F0001868 Y N.3 12/03')]).toEqual(['1868']);
    expect(rutsEnTexto('0203040504 Transf a Persona')).toContain('20304050');
    expect(rutsConDV('TEF 9876543-3 Persona Prueba')).toContain('9876543');
    expect(rutsConDV('Compra TIENDA WEB 444444441')).toHaveLength(0);
  });

  async function escenario() {
    const claves = new Set<string>(); const docs: Documento[] = [];
    for (const f of ['PRUEBA_RCV_VENTA_77777777-7_202607.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202607.csv', 'PRUEBA_RCV_VENTA_77777777-7_202608.csv',
      'PRUEBA_RCV_COMPRA_77777777-7_202608.csv', 'PRUEBA_RCV_VENTA_77777777-7_202609.csv'])
      docs.push(...importarRCV(f, leer(f), { empresas, clavesExistentes: claves }).documentos);
    // Venta registrada a mano en la prueba del Excel (formulario): folio 200 por $119.000 al mismo cliente de la 105
    const v105 = docs.find(d => d.libro === 'VENTA' && d.folio === 105)!;
    docs.push({ ...v105, clave: `${v105.empresa}|33|200`, folio: 200, fechaEmision: '2026-09-10', neto: 100000, iva: 19000, total: 119000, periodoRCV: '2026-09', origen: 'Registro manual' });
    const movs: Movimiento[] = [];
    for (const f of ['PRUEBA_cartola_santander_202607.csv', 'PRUEBA_cartola_bancoestado_202608.xlsx', 'PRUEBA_cartola_bci_202609.csv'])
      movs.push(...(await cartola(f)).movimientos);
    const f29 = leerF29((await textoDePdf(await pdfjs(), leer('PRUEBA_F29_77777777-7_202607.pdf'))).texto, 'f29')!;
    return { docs, movs, f29s: [f29] };
  }
  const de = (r: ReturnType<typeof sugerirCruces>, movs: Movimiento[], texto: string) =>
    r.sugerencias.find(s => movs.find(m => m.clave === s.movimiento)?.descripcion.includes(texto));

  it('propone los cruces como el Excel', async () => {
    const { docs, movs, f29s } = await escenario();
    const r = sugerirCruces(movs, docs, f29s, '77.777.777-7');
    expect(de(r, movs, 'TRANSF A PROVEEDOR 79000001-3')?.confianza).toBe('Alta');
    expect(de(r, movs, 'TRANSF A PROVEEDOR 79000001-3')?.motivo).toMatch(/^FAC 9004:/);
    expect(de(r, movs, 'NANDU')?.motivo).toMatch(/^FAC 104:/);
    expect(de(r, movs, 'NANDU')?.confianza).toBe('Alta');
    expect(de(r, movs, '780000015')?.motivo).toMatch(/^FAC 105 \+ FAC 200|^FAC 200 \+ FAC 105/);
    expect(de(r, movs, 'DEPOSITO CHEQUE')).toMatchObject({ confianza: 'Media' });
    expect(de(r, movs, 'DEPOSITO CHEQUE')?.motivo).toMatch(/^FAC 102:/);
    expect(de(r, movs, 'PAGO PROVEEDOR 79.000.001-3')?.confianza).toBe('Sin calce');   // pago anterior a la emisión
    expect(de(r, movs, 'EFECTIVO')).toBeUndefined();
    expect(r.pagosF29).toHaveLength(1);                                                 // el pago del F29 de julio no se cruza
    // nada se marca solo
    expect(docs.find(d => d.folio === 102)?.estado).toBe('POR COBRAR');
    // al aplicar las aceptadas quedan cobradas o pagadas con la fecha del movimiento
    const aceptadas = r.sugerencias.filter(s => s.confianza === 'Alta' || movs.find(m => m.clave === s.movimiento)?.descripcion.includes('DEPOSITO CHEQUE'));
    const ap = aplicarCruces(aceptadas, docs, movs);
    expect(ap.docs.find(d => d.folio === 102)).toMatchObject({ estado: 'COBRADA', fechaPago: '2026-09-18' });
    expect(ap.docs.find(d => d.folio === 9004)).toMatchObject({ estado: 'PAGADA', fechaPago: '2026-09-10' });
    // buscar de nuevo no repite lo aplicado
    const otra = sugerirCruces(ap.movs, ap.docs, f29s, '77.777.777-7');
    expect(otra.sugerencias.some(s => aceptadas.some(a => a.movimiento === s.movimiento))).toBe(false);
  });

  it('una regla aprendida clasifica sola los movimientos parecidos', async () => {
    const movs = (await cartola('PRUEBA_cartola_bci_202609.csv')).movimientos;
    const com = movs.find(m => m.descripcion.startsWith('COMISION'))!;
    const regla = crearRegla(com, 'Comisiones y gastos bancarios', []);
    expect(regla.id).toBe('R001');
    const otraCom = { ...com, clave: 'otra', descripcion: 'COMISION MANTENCION CTA CTE', fecha: '2026-10-31' };
    const res = clasificar([otraCom], [regla]);
    expect(res[0]).toMatchObject({ estado: 'clasificado', categoria: 'Comisiones y gastos bancarios', regla: 'R001' });
  });
});
