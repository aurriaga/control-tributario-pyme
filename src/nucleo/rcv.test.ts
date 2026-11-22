// Mismas pruebas que modPruebas.bas para el RCV, con los archivos ficticios de pruebas/datos (RUT 77.777.777-7).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importarRCV, type Empresa } from './rcv';
import { rutValido, formatearRUT, rutEnNombre } from './rut';
import { parseMonto, parseFecha, periodoEnTexto } from './texto';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));
const EMPRESA: Empresa[] = [{ rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' }];

describe('RUT', () => {
  it('valida el dígito verificador', () => {
    expect(rutValido('77777777-7')).toBe(true);
    expect(rutValido('79000003-K')).toBe(true);
    expect(rutValido('77777777-8')).toBe(false);
  });
  it('formatea y lo encuentra en el nombre del archivo', () => {
    expect(formatearRUT('777777777')).toBe('77.777.777-7');
    expect(rutEnNombre('RCV_COMPRA_REGISTRO_77777777-7_202607.csv')).toBe('77.777.777-7');
  });
});

describe('montos, fechas y períodos', () => {
  it('lee montos chilenos', () => {
    expect(parseMonto('$1.234.567')).toBe(1234567);
    expect(parseMonto('1.234')).toBe(1234);
    expect(parseMonto('(500)')).toBe(-500);
    expect(parseMonto('1,5')).toBe(1.5);
  });
  it('lee fechas', () => {
    expect(parseFecha('05/07/2026')).toBe('2026-07-05');
    expect(parseFecha('2026-07-05T10:00:00')).toBe('2026-07-05');
    expect(parseFecha('02 ene 2026 10:30')).toBe('2026-01-02');
    expect(parseFecha('31/02/2026')).toBeNull();
  });
  it('período en el nombre de archivo del SII', () => {
    expect(periodoEnTexto('RCV_COMPRA_REGISTRO_77777777-7_202601.CSV')).toBe('2026-01');
  });
});

describe('importar RCV', () => {
  it('ventas julio: 5 líneas con 1 repetida -> 4 documentos; reimportar no duplica', () => {
    const claves = new Set<string>();
    const r = importarRCV('PRUEBA_RCV_VENTA_77777777-7_202607.csv', leer('PRUEBA_RCV_VENTA_77777777-7_202607.csv'), { empresas: EMPRESA, clavesExistentes: claves });
    expect(r.error).toBeNull();
    expect(r.libro).toBe('VENTA');
    expect(r.documentos).toHaveLength(4);
    const otra = importarRCV('PRUEBA_RCV_VENTA_77777777-7_202607.csv', leer('PRUEBA_RCV_VENTA_77777777-7_202607.csv'), { empresas: EMPRESA, clavesExistentes: claves });
    expect(otra.documentos).toHaveLength(0);
    expect(otra.duplicados).toBe(5);
  });
  it('compras: separa neto, IVA y total, y toma el período del nombre', () => {
    const r = importarRCV('PRUEBA_RCV_COMPRA_77777777-7_202607.csv', leer('PRUEBA_RCV_COMPRA_77777777-7_202607.csv'), { empresas: EMPRESA });
    expect(r.libro).toBe('COMPRA');
    const d = r.documentos[0];
    expect(d).toMatchObject({ rutContraparte: '79.000.001-3', folio: 9001, neto: 2000000, iva: 380000, total: 2380000, periodoRCV: '2026-07', estado: 'POR PAGAR', otrosImpuestos: 0 });
  });
  it('RCV de una empresa no registrada no se carga a nombre de la empresa activa', () => {
    const r = importarRCV('PRUEBA_RCV_VENTA_11111111-1_202609.csv', leer('PRUEBA_RCV_VENTA_11111111-1_202609.csv'), { empresas: EMPRESA });
    expect(r.error).toMatch(/no está registrada/);
    expect(r.documentos).toHaveLength(0);
  });
  it('RCV guardado como texto Unicode (UTF-16) se importa', () => {
    const r = importarRCV('PRUEBA_RCV_COMPRA_77777777-7_202611_utf16.csv', leer('PRUEBA_RCV_COMPRA_77777777-7_202611_utf16.csv'), { empresas: EMPRESA });
    expect(r.error).toBeNull();
    expect(r.documentos).toHaveLength(1);
  });
  it('RCV con una línea de título antes de los encabezados se importa', () => {
    const r = importarRCV('PRUEBA_RCV_VENTA_77777777-7_202611_titulo.csv', leer('PRUEBA_RCV_VENTA_77777777-7_202611_titulo.csv'), { empresas: EMPRESA });
    expect(r.documentos).toHaveLength(1);
  });
  it('sin período en el nombre: el mensaje lo advierte', () => {
    const r = importarRCV('compras sin periodo 77777777-7.csv', leer('PRUEBA_RCV_COMPRA_77777777-7_202611_utf16.csv'), { empresas: EMPRESA });
    expect(r.mensaje).toMatch(/sin período del registro/);
  });
});
