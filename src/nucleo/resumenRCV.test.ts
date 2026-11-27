// Resumen del RCV del SII ("Descargar resumen"): totales por tipo de documento, sin RUT ni folio, y con el RUT de la
// empresa sin dígito verificador en el nombre del archivo. Datos ficticios (RUT 77.777.777-7).
import { describe, it, expect } from 'vitest';
import { leerArchivo } from './lector';
import { importarResumenRCV, RUT_CONSUMIDOR_FINAL } from './rcv';
import { rutEnNombre } from './rut';
import { totalesRCV } from './f29';
import { contabilidad, configInicial } from './contabilidad';
import { observacionesDocumento } from './controles';

const EMP = { rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' };
const VENTAS = ['Tipo Documento;Total Documentos;Monto Exento;Monto Neto;Monto IVA;Monto Total',
  'Total mes Factura Electrónica(33);3;0;1000000;190000;1190000',
  'Total mes Boleta Electrónica(39);25;0;420168;79832;500000',
  'Total mes Comprobantes Pago Electrónico(48);2;0;21008;3992;25000',
  'Total mes Nota de Crédito Electrónica(61);1;0;100000;19000;119000', ''].join('\n');
const archivo = 'RCV_RESUMEN_VENTA_77777777_202607.csv';
const bytes = (s: string) => new TextEncoder().encode(s);

describe('resumen del RCV', () => {
  it('el RUT sin dígito verificador del nombre del archivo se completa', () => {
    expect(rutEnNombre(archivo)).toBe('77.777.777-7');
    expect(rutEnNombre('cartola_77777777_202607.csv')).toBe('');      // solo en archivos del RCV
  });
  it('se reconoce y carga las boletas y los comprobantes de pago; las facturas quedan para el detalle', async () => {
    const r = await leerArchivo(archivo, bytes(VENTAS), { empresas: [EMP], clavesExistentes: new Set() });
    expect([r.estado, r.clasificacion.tipo, r.titulo]).toEqual(['leido', 'RCV_RESUMEN', 'Resumen del RCV de ventas, julio 2026']);
    expect(r.documentos.map(d => [d.tipoDoc, d.neto, d.iva, d.total, d.rutContraparte, d.periodoRCV])).toEqual([
      [39, 420168, 79832, 500000, RUT_CONSUMIDOR_FINAL, '2026-07'], [48, 21008, 3992, 25000, RUT_CONSUMIDOR_FINAL, '2026-07']]);
    expect(r.avisos.join(' ')).toMatch(/Factura Electrónica \(33\): 3 documentos por \$1\.190\.000/);
    expect(r.avisos.join(' ')).toMatch(/Nota de Crédito Electrónica \(61\)/);
  });
  it('de otra empresa no se carga', async () => {
    const r = await leerArchivo('RCV_RESUMEN_VENTA_78111222_202607.csv', bytes(VENTAS), { empresas: [EMP], clavesExistentes: new Set() });
    expect(r.estado).toBe('otra_empresa');
  });
  it('no se duplica si se carga dos veces, y el resumen de compras no carga nada', () => {
    const claves = new Set<string>();
    expect(importarResumenRCV(archivo, VENTAS, { empresas: [EMP], clavesExistentes: claves }).documentos).toHaveLength(2);
    expect(importarResumenRCV(archivo, VENTAS, { empresas: [EMP], clavesExistentes: claves }).duplicados).toBe(2);
    const c = importarResumenRCV('RCV_RESUMEN_COMPRA_77777777_202607.csv', VENTAS.replace(/Boleta|Comprobantes Pago/g, 'Factura'), { empresas: [EMP] });
    expect([c.documentos.length, c.libro]).toEqual([0, 'COMPRA']);
    expect(c.mensaje).toMatch(/usa el detalle/);
  });
  it('entra al IVA del mes, a la contabilidad y no se marca como observado', () => {
    const docs = importarResumenRCV(archivo, VENTAS, { empresas: [EMP] }).documentos;
    expect(totalesRCV(docs, '2026-07')).toMatchObject({ debito: 79832 + 3992, base: 420168 + 21008 });
    const r = contabilidad({ empresa: EMP.rut, docs, f29s: [], movs: [], libros: [], honorarios: [] }, configInicial());
    const a = r.asientos.filter(x => x.origen === 'Ventas');
    expect(a).toHaveLength(2);
    expect(a[0].glosa).toMatch(/Boleta Electrónica del mes \(25 documentos\), julio 2026 \(resumen del RCV\)/);
    expect(docs.every(d => observacionesDocumento(d).length === 0)).toBe(true);
  });
});
