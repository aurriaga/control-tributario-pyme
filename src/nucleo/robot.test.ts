// Robot contable con datos ficticios: aplica la memoria, pregunta lo dudoso y aprende las respuestas.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importarRCV } from './rcv';
import { extraer } from './extraer';
import { leerCartola, type Movimiento } from './cartola';
import { memoriaNueva, coincide, aprender, aplicarMemoria, revisar, patronGlosa, validarMemoria, type ReglaRobot, type Datos } from './robot';

const DATOS = join(__dirname, '..', '..', 'pruebas', 'datos');
const leer = (f: string) => new Uint8Array(readFileSync(join(DATOS, f)));
const empresa = { rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' };
const mov = (descripcion: string, monto: number): Movimiento => ({ clave: descripcion, cuenta: '1', banco: '', fecha: '2026-07-01', descripcion, documento: '',
  cargo: Math.max(0, -monto), abono: Math.max(0, monto), saldo: null, archivo: '', estado: 'pendiente' });
const regla = (x: Partial<ReglaRobot>): ReglaRobot => ({ id: 'R001', tipo: 'glosa', patron: '', lado: 'cargo', categoria: 'Comisiones y gastos bancarios', nota: '', fuente: 'usuario', fecha: '2026-11-22', activa: true, ...x });

async function datos(): Promise<Datos> {
  const docs = ['PRUEBA_RCV_VENTA_77777777-7_202607.csv', 'PRUEBA_RCV_COMPRA_77777777-7_202607.csv'].flatMap(f => importarRCV(f, leer(f), { empresas: [empresa] }).documentos);
  const f = 'PRUEBA_cartola_santander_202607.csv';
  return { docs, f29s: [], movs: leerCartola(f, await extraer(f, leer(f)), '').movimientos, libros: [], honorarios: [] };
}

describe('reglas del robot', () => {
  it('glosa: el patrón sin números ni espacios va contenido en la glosa; respeta el lado', () => {
    expect(patronGlosa('PAGO CUOTA CREDITO Nº 12')).toBe('pagocuotacreditono');
    const r = regla({ patron: 'commantencionplan' });
    expect(coincide(mov('COM.MANTENCION PLAN 0926', -12500), r)).toBe(true);
    expect(coincide(mov('COM.MANTENCION PLAN 0926', 12500), r)).toBe(false);
    expect(coincide(mov('COM.MANTENCION PLAN', -1), { ...r, activa: false })).toBe(false);
  });
  it('rut: el RUT aparece en la glosa con o sin puntos', () => {
    const r = regla({ tipo: 'rut', patron: '78.000.001-5', lado: 'ambos', categoria: 'Retiro de socios' });
    expect(coincide(mov('TRANSF A 78000001-5 SOCIO', -5000), r)).toBe(true);
    expect(coincide(mov('ABONO DE 78.000.001-5', 5000), r)).toBe(true);
    expect(coincide(mov('TRANSF A 79000001-3', -5000), r)).toBe(false);
  });
});

describe('aprender', () => {
  it('valida la categoría, no repite reglas y deja historial', () => {
    let m = aprender(memoriaNueva(empresa), { tipo: 'regla', regla: { tipo: 'glosa', patron: 'Comision mantencion', lado: 'cargo', categoria: 'Comisiones y gastos bancarios', nota: 'gasto bancario' } }, 'usuario', '2026-11-22');
    expect(m.reglas[0]).toMatchObject({ id: 'R001', patron: 'comisionmantencion', fuente: 'usuario' });
    expect(() => aprender(m, { tipo: 'regla', regla: { tipo: 'glosa', patron: 'COMISION MANTENCION', lado: 'cargo', categoria: 'Comisiones y gastos bancarios', nota: '' } })).toThrow(/igual/);
    expect(() => aprender(m, { tipo: 'proveedor', rut: '79.000.001-3', categoria: 'Inventada' })).toThrow(/categoría de gasto/);
    expect(() => aprender(m, { tipo: 'regla', regla: { tipo: 'rut', patron: '11.111.111-2', lado: 'cargo', categoria: 'Retiro de socios', nota: '' } })).toThrow(/no es válido/);
    m = aprender(m, { tipo: 'proveedor', rut: '79000001-3', categoria: 'Arriendos' });
    expect(m.provCategoria['79.000.001-3']).toBe('Arriendos');
    expect(m.historial).toHaveLength(2);
    expect(validarMemoria(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
});

describe('una corrida', () => {
  it('la memoria se aplica: anulados, decisiones, reglas y cruces dejan la factura pagada', async () => {
    const d = await datos();
    const compra = d.docs.find(x => x.libro === 'COMPRA')!, m0 = d.movs.find(x => x.cargo > 0)!;
    let mem = aprender(memoriaNueva(empresa), { tipo: 'cruce', movimiento: m0.clave, docs: [compra.clave] });
    mem = aprender(mem, { tipo: 'anular', clave: d.docs.find(x => x.libro === 'VENTA')!.clave, motivo: 'no existe en el SII' });
    const a = aplicarMemoria(d, mem);
    expect(a.docs.find(x => x.clave === compra.clave)).toMatchObject({ estado: 'PAGADA', fechaPago: m0.fecha });
    expect(a.movs.find(x => x.clave === m0.clave)?.estado).toBe('conciliado');
    expect(a.cuenta.anulados).toBe(1);
  });
  it('acepta solos los cruces de confianza alta y cada respuesta baja las dudas', async () => {
    const d = await datos();
    const r1 = revisar(d, memoriaNueva(empresa), '2026-11-22');
    expect(r1.conta.balance.cuadra).toBe(true);
    expect(Object.keys(r1.mem.conciliados)).toHaveLength(r1.altasAceptadas);
    const p = r1.dudas.find(x => x.tipo === 'categoria')!;
    const r2 = revisar(d, aprender(r1.mem, { tipo: 'proveedor', rut: p.rut!, categoria: 'Arriendos' }), '2026-11-22');
    expect(r2.dudas.length).toBe(r1.dudas.length - 1);
    const sinPolitica = revisar(d, { ...memoriaNueva(empresa), politica: { aceptarCrucesAlta: false } });
    expect(sinPolitica.altasAceptadas).toBe(0);
  });
});
