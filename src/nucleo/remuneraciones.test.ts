// Mismos casos que modPruebas.bas (remuneraciones y honorarios) con los archivos ficticios.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraer } from './extraer';
import { leerLibroRemuneraciones, leerHonorarios, resumenPersonal, librosFaltantes, cuerposTrabajadores, esPagoAlPersonal } from './remuneraciones';
import type { Movimiento } from './cartola';
import { leerArchivo } from './lector';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));
const libro = async (f: string) => leerLibroRemuneraciones(f, await extraer(f, leer(f)));

describe('libro de remuneraciones', () => {
  it('lee el período del encabezado, columnas distintas y cuadra con TOTALES', async () => {
    const r = await libro('PRUEBA_LibroRemuneraciones_77777777-7_202609.xlsx');
    const l = r.dato!;
    expect(l.periodo).toBe('2026-09');
    expect(l.rutEmpresa).toBe('77.777.777-7');
    expect(l.trabajadores).toHaveLength(3);
    expect(r.mensaje).toMatch(/Cuadra con la fila TOTALES/);
    const suma = (k: 'salud' | 'impuestoUnico' | 'anticipos' | 'otrosDescuentos') => l.trabajadores.reduce((a, t) => a + t[k], 0);
    expect(suma('salud')).toBe(167000);              // incluye el adicional de salud
    expect(suma('impuestoUnico')).toBe(12000);
    expect(`${suma('anticipos')}/${suma('otrosDescuentos')}`).toBe('100000/25150');
    expect(l.trabajadores.every(t => t.control === 'OK')).toBe(true);
  });
  it('libro con fila en blanco antes del encabezado y totales sin la palabra TOTALES', async () => {
    const r = await libro('PRUEBA_LibroRemuneraciones_77777777-7_202610_sin_etiqueta.xlsx');
    expect(r.dato?.cuadraTotales).not.toBeNull();
  });
  it('libro de otro software: columnas por nombre y cada fila cuadra', async () => {
    const r = await libro('PRUEBA_LibroRemuneraciones_77777777-7_202611_otro_formato.xlsx');
    expect(r.dato?.periodo).toBe('2026-11');
    expect(r.dato?.trabajadores.filter(t => t.control === 'OK')).toHaveLength(2);
  });
  it('un libro de otra empresa se rechaza en el lector de documentos', async () => {
    const r = await leerArchivo('PRUEBA_LibroRemuneraciones_otra_empresa_202609.xlsx', leer('PRUEBA_LibroRemuneraciones_otra_empresa_202609.xlsx'),
      { empresas: [{ rut: '77.777.777-7', razonSocial: 'E' }], clavesExistentes: new Set() });
    expect(r.estado).toBe('otra_empresa');
  });
  it('pagos al personal: RUT de un trabajador o PREVIRED en la glosa', async () => {
    const l = (await libro('PRUEBA_LibroRemuneraciones_77777777-7_202609.xlsx')).dato!;
    const t = cuerposTrabajadores([l]);
    expect(esPagoAlPersonal('TRANSF A 0111111111 JUAN PEREZ', t)).toBe(true);
    expect(esPagoAlPersonal('TRANSF A 0203040504 SOCIO', t)).toBe(false);
    expect(esPagoAlPersonal('PAGO PREVIRED', t)).toBe(true);
  });
});

describe('honorarios', () => {
  it('informe anual del SII (.xls que en realidad es HTML)', async () => {
    const r = leerHonorarios('PRUEBA_informeAnualREC_77777777-7.xls', await extraer('x.xls', leer('PRUEBA_informeAnualREC_77777777-7.xls')));
    const h = r.dato!;
    expect(h.anio).toBe('2026');
    expect(h.meses.reduce((a, m) => a + m.bruto, 0)).toBe(105000);
    expect(`${h.meses.reduce((a, m) => a + m.retencionTerceros, 0)}/${h.meses.reduce((a, m) => a + m.retencionEmisor, 0)}`).toBe('15250/763');
    expect(r.mensaje).toMatch(/Cuadra con la fila Totales/);
  });
});

describe('resumen del personal', () => {
  it('aporte del empleador = PREVIRED del mes siguiente − cotizaciones del libro', async () => {
    const l = (await libro('PRUEBA_LibroRemuneraciones_77777777-7_202609.xlsx')).dato!;
    const cot = l.trabajadores.reduce((a, t) => a + t.afp + t.salud + t.cesantia, 0);
    const mov = { clave: 'p', cuenta: '', banco: '', fecha: '2026-10-10', descripcion: 'PAGO PREVIRED', documento: '', cargo: cot + 50000, abono: 0, saldo: null, archivo: '', estado: 'pendiente' } as Movimiento;
    const [m] = resumenPersonal([l], [], [mov]);
    expect(m.aporteEmpleador).toBe(50000);
    expect(m.impuestoUnico).toBe(12000);
    expect(resumenPersonal([l], [], [])[0].aporteEmpleador).toBeNull();
    expect(librosFaltantes([{ ...l, periodo: '2026-07' }, l])).toEqual(['2026-08']);
  });
});
