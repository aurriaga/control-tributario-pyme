import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importarRCV, type Documento } from './rcv';
import { resumenAnual, aniosDisponibles } from './resumen';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const empresas = [{ rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' }];

describe('resumen del año', () => {
  it('suma ventas, compras e IVA por mes con los RCV de prueba', () => {
    const claves = new Set<string>(); const docs: Documento[] = [];
    for (const f of ['PRUEBA_RCV_VENTA_77777777-7_202607.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202607.csv', 'PRUEBA_RCV_VENTA_77777777-7_202608.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202608.csv'])
      docs.push(...importarRCV(f, new Uint8Array(readFileSync(join(DATOS, f))), { empresas, clavesExistentes: claves }).documentos);
    expect(aniosDisponibles(docs)).toEqual([2026]);
    const r = resumenAnual(docs, 2026);
    const julio = r.meses[6];
    expect(julio.docsVenta).toBe(4);
    expect(r.ventas).toBe(r.meses.reduce((a, m) => a + m.ventas, 0));
    expect(r.ivaNeto).toBe(r.ivaDebito - r.ivaCredito);
    // faltan las compras de enero a junio: se avisa
    expect(r.alertas.some(a => a.nivel === 'falta')).toBe(true);
  });
});
