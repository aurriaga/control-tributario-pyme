// Pruebas del lector de documentos con los archivos ficticios de pruebas/datos (empresa 77.777.777-7).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { leerArchivo, type Contexto } from './lector';
import { textoDePdf, type PdfJs } from './pdfTexto';
import type { Servicios } from './extraer';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));

async function servicios(): Promise<Servicios> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).href;
  return { textoPDF: b => textoDePdf(pdfjs as unknown as PdfJs, b) };
}
const ctx = async (): Promise<Contexto> => ({ empresas: [{ rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' }], clavesExistentes: new Set(), servicios: await servicios() });

describe('lector de documentos', () => {
  it('reconoce cada archivo de prueba por su contenido', async () => {
    const c = await ctx();
    const esperado: Record<string, string> = {
      PRUEBA_RCV_COMPRA: 'RCV_COMPRA', PRUEBA_RCV_VENTA: 'RCV_VENTA', PRUEBA_cartola: 'CARTOLA',
      PRUEBA_LibroRemuneraciones: 'REMUNERACIONES', PRUEBA_LibroDiario: 'LIBRO_DIARIO', PRUEBA_informeAnualREC: 'HONORARIOS', PRUEBA_F29: 'F29',
    };
    for (const f of readdirSync(DATOS)) {
      const r = await leerArchivo(f, leer(f), c);
      const clave = Object.keys(esperado).find(k => f.startsWith(k))!;
      expect(r.clasificacion.tipo, f).toBe(esperado[clave]);
    }
  }, 60000);

  it('lee el RCV guardado como Excel (.xlsx)', async () => {
    const r = await leerArchivo('PRUEBA_RCV_COMPRA_77777777-7_202612.xlsx', leer('PRUEBA_RCV_COMPRA_77777777-7_202612.xlsx'), await ctx());
    expect(r.formato).toBe('planilla');
    expect(r.estado).toBe('leido');
    expect(r.documentos).toHaveLength(1);
  });

  it('reconoce el banco y el período de las cartolas', async () => {
    const c = await ctx();
    const casos: [string, string][] = [['PRUEBA_cartola_santander_202607.csv', 'Santander'], ['PRUEBA_cartola_bci_202609.csv', 'BCI'],
      ['PRUEBA_cartola_bancoestado_202608.xlsx', 'BancoEstado'], ['PRUEBA_cartola_bancochile_202610.xlsx', 'Banco de Chile'],
      ['PRUEBA_cartola_bancoestado_202608.pdf', 'BancoEstado']];
    for (const [f, banco] of casos) {
      const r = await leerArchivo(f, leer(f), c);
      expect(r.clasificacion.banco, f).toBe(banco);
      expect(r.clasificacion.periodo, f).toMatch(/^2026-\d\d$/);
    }
  });

  it('no carga documentos de otra empresa', async () => {
    const r = await leerArchivo('PRUEBA_LibroRemuneraciones_otra_empresa_202609.xlsx', leer('PRUEBA_LibroRemuneraciones_otra_empresa_202609.xlsx'), await ctx());
    expect(r.estado).toBe('otra_empresa');
  });

  it('reconoce el formato por el contenido aunque la extensión esté mal', async () => {
    const r = await leerArchivo('ventas.txt', leer('PRUEBA_RCV_VENTA_77777777-7_202609.csv'), await ctx());
    expect(r.clasificacion.tipo).toBe('RCV_VENTA');
    const x = await leerArchivo('planilla.dat', leer('PRUEBA_LibroDiario_apertura_77777777-7.xlsx'), await ctx());
    expect(x.formato).toBe('planilla');
  });

  it('una planilla de trabajo con movimientos sin saldo ni cuenta no se carga como cartola', async () => {
    const csv = 'Fecha;Descripción;Cargo;Abono;Saldo\n02-01-2026;Transf a Juan Perez;;1100600;\n05-01-2026;Pago Previred;;250000;\n';
    const r = await leerArchivo('Revision_trabajo.csv', new TextEncoder().encode(csv), await ctx());
    expect(r.clasificacion.tipo).toBe('CARTOLA');
    expect(r.estado).toBe('reconocido');
    expect(r.movimientos).toBeUndefined();
    expect(r.mensaje).toMatch(/no trae saldos ni número de cuenta/);
  });
  it('un archivo sin relación se informa como no reconocido', async () => {
    const r = await leerArchivo('notas.txt', new TextEncoder().encode('Lista del supermercado\nleche\npan'), await ctx());
    expect(r.estado).toBe('no_reconocido');
    expect(r.mensaje).toMatch(/Se esperaba/);
  });
});
