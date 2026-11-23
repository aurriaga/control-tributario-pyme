// Riffo Junior: asientos a partir de una frase, intención y normativa (datos ficticios).
import { describe, it, expect } from 'vitest';
import { proponerAsiento, montoDe, fechaDe, comoManual } from './asientosAyuda';
import { intencion, respuestaNormativa } from './asistente';
import { PLAN_BASE } from './contabilidad';
import { aplicarNormativa, retencionHonorarios, leerTablaUTM } from './normativa';

const codigos = (a: ReturnType<typeof proponerAsiento>) => a!.lineas.map(l => `${l.codigo}:${l.debe || -l.haber}`).join(' ');
const cuadra = (a: ReturnType<typeof proponerAsiento>) => a!.lineas.reduce((s, l) => s + l.debe - l.haber, 0);

describe('montos y fechas', () => {
  it('lee montos con puntos, millones y mil; fechas con barra o en palabras', () => {
    expect(montoDe('vendí $1.190.000 al contado')).toBe(1190000);
    expect(montoDe('depreciación de 1,5 millones')).toBe(1500000);
    expect(montoDe('pagué 500 mil de arriendo en 2026')).toBe(500000);
    expect(fechaDe('el 15/10', '2026-11-23').fecha).toBe('2026-10-15');
    expect(fechaDe('el 3 de octubre de 2026', '2026-11-23').fecha).toBe('2026-10-03');
  });
});

describe('asientos', () => {
  it('venta con cifra redonda con IVA: neto por división y el IVA por diferencia', () => {
    const a = proponerAsiento('vendí 1.190.000 con factura por transferencia', PLAN_BASE, '2026-11-23');
    expect(codigos(a)).toBe('1102:1190000 4101:-1000000 2103:-190000');
    expect(cuadra(a)).toBe(0);
  });
  it('compra de activo fijo neta a crédito: activo, IVA crédito y proveedores', () => {
    const a = proponerAsiento('compré un notebook en 800.000 neto a crédito', PLAN_BASE, '2026-11-23');
    expect(codigos(a)).toBe('1201:800000 1106:152000 2101:-952000');
  });
  it('gasto con boleta: sin crédito fiscal, el IVA va en el gasto', () => {
    const a = proponerAsiento('pagué la luz 59.500 con boleta en efectivo', PLAN_BASE, '2026-11-23');
    expect(codigos(a)).toBe('5202:59500 1101:-59500');
  });
  it('depreciación con la vida útil del SII', () => {
    const a = proponerAsiento('depreciación de una camioneta de 12.600.000', PLAN_BASE, '2026-11-23');
    expect(codigos(a)).toBe('5302:150000 1209:-150000');      // 12.600.000 / 7 / 12
    expect(a!.supuestos.join(' ')).toMatch(/7 años/);
  });
  it('honorarios con la retención del año', () => {
    const a = proponerAsiento('boleta de honorarios de 100.000 pagada por transferencia', PLAN_BASE, '2026-11-23');
    expect(codigos(a)).toBe('5214:100000 2105:-15250 1102:-84750');
    expect(comoManual(a!, 'RJ-1')).toHaveLength(3);
  });
  it('aporte, retiro y préstamo no llevan IVA; sin monto no inventa', () => {
    expect(codigos(proponerAsiento('aporte de capital de 5.000.000', PLAN_BASE))).toBe('1102:5000000 3101:-5000000');
    expect(codigos(proponerAsiento('retiro del socio 300.000', PLAN_BASE))).toBe('3103:300000 1102:-300000');
    expect(proponerAsiento('vendí algo', PLAN_BASE)).toBeNull();
  });
});

describe('intención y normativa', () => {
  it('reconoce asientos, normativa y ayuda', () => {
    expect(intencion('compré un notebook en 800.000 neto')).toBe('asiento');
    expect(intencion('¿Qué cambió en la normativa?')).toBe('normativa');
    expect(intencion('¿Cómo cargo una cartola?')).toBe('ayuda');
  });
  it('la normativa del archivo completa la UTM y las tasas por año', () => {
    aplicarNormativa({ utm: { '2026-11': 72440 }, actualizado: '2026-11-23' });
    expect(respuestaNormativa(new Date('2026-11-23')).texto).toMatch(/2026-11 = \$72\.440/);
    expect(retencionHonorarios(2027)).toBe(0.16);
    expect(retencionHonorarios(2030)).toBe(0.17);
  });
  it('lee la tabla de UTM de la página del SII', () => {
    const html = '<tr><th>Enero</th><td>69.751</td><td>837.012</td></tr><tr><th>Noviembre</th><td>72.440</td><td>869.280</td></tr>';
    expect(leerTablaUTM(html, 2026)).toEqual({ '2026-01': 69751, '2026-11': 72440 });
  });
});
