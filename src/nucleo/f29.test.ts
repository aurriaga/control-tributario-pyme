// F29 ficticios (pruebas/datos/PRUEBA_F29_*): julio cuadra con el RCV de prueba; agosto declara $50.000 de crédito de más.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { textoDePdf, type PdfJs } from './pdfTexto';
import { leerF29, controlF29, cuadratura, borradorF29, f29PorPeriodo, type F29 } from './f29';
import { importarRCV, type Documento } from './rcv';
import { leerArchivo } from './lector';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));
const empresas = [{ rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' }];

async function pdfjs() {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc = pathToFileURL(join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).href;
  return lib as unknown as PdfJs;
}
async function f29(f: string): Promise<F29> { return leerF29((await textoDePdf(await pdfjs(), leer(f))).texto, f)!; }
function rcv(): Documento[] {
  const claves = new Set<string>(); const docs: Documento[] = [];
  for (const f of ['PRUEBA_RCV_VENTA_77777777-7_202607.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202607.csv', 'PRUEBA_RCV_VENTA_77777777-7_202608.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202608.csv'])
    docs.push(...importarRCV(f, leer(f), { empresas, clavesExistentes: claves }).documentos);
  return docs;
}

describe('F29', () => {
  it('lee los casilleros del formulario compacto', async () => {
    const f = await f29('PRUEBA_F29_77777777-7_202607.pdf');
    expect(f).toMatchObject({ periodo: '2026-07', folio: '9990001', rut: '77.777.777-7', fechaPresentacion: '20/08/2026', tipo: 'Primitiva' });
    expect(f.codigos).toMatchObject({ '538': 1985000, '520': 646000, '089': 1339000, '563': 10500000, '115': 0.01, '062': 105000, '91': 1444000 });
    expect(controlF29(f)).toEqual([]);
  });

  it('cuadra el IVA contra el RCV y detecta diferencias', async () => {
    const filas = cuadratura(rcv(), [await f29('PRUEBA_F29_77777777-7_202607.pdf'), await f29('PRUEBA_F29_77777777-7_202608.pdf')]);
    expect(filas.find(f => f.periodo === '2026-07')?.estado).toBe('Cuadra');
    const ago = filas.find(f => f.periodo === '2026-08')!;
    expect(ago.estado).toBe('Diferencias');
    expect(ago.detalle).toMatch(/crédito \$50\.000/);
  });

  it('arma el borrador del mes con el remanente anterior reajustado y el PPM', async () => {
    const f29s = [await f29('PRUEBA_F29_77777777-7_202607.pdf'), await f29('PRUEBA_F29_77777777-7_202608.pdf')];
    const b = borradorF29(rcv(), f29s, '2026-07', {});
    const l = (c: string) => b.lineas.find(x => x.codigo === c)!;
    expect(l('089').borrador).toBe(l('089').declarado);
    expect(l('062').borrador).toBe(105000);
    expect(l('91').borrador).toBe(1444000);
    expect(b.vence).toBe('20/08/2026');
    // septiembre: usa el remanente de agosto (620.000) reajustado con la UTM
    const s = borradorF29(rcv(), f29s, '2026-09', { '2026-09': 70000, '2026-10': 71000 });
    expect(s.lineas.find(x => x.codigo === '504')!.borrador).toBe(Math.round(Math.round(620000 / 70000 * 100) / 100 * 71000));
  });

  it('se queda con la rectificatoria más reciente', () => {
    const base = { periodo: '2026-07', folio: '1', rut: '', tipo: '' as const, codigos: {}, archivo: '' };
    const m = f29PorPeriodo([{ ...base, fechaPresentacion: '20/08/2026' }, { ...base, folio: '2', fechaPresentacion: '05/09/2026' }]);
    expect(m.get('2026-07')?.folio).toBe('2');
  });

  it('el lector de documentos carga el F29', async () => {
    const r = await leerArchivo('PRUEBA_F29_77777777-7_202607.pdf', leer('PRUEBA_F29_77777777-7_202607.pdf'),
      { empresas, clavesExistentes: new Set(), servicios: { textoPDF: async b => textoDePdf(await pdfjs(), b) } });
    expect(r.estado).toBe('leido');
    expect(r.f29?.periodo).toBe('2026-07');
  });
});
