// Buscador de Riffo Junior y reforma Ley 21.850 (sin datos de empresas).
import { describe, it, expect } from 'vitest';
import { buscar, pideBusqueda } from './buscador';
import { intencion, temasAyuda } from './asistente';
import { responderTributaria } from './tributario';
import { tasaIDPC, factorCredito, restitucion } from './normativa';

const hoy = new Date('2026-11-23');

describe('reforma Ley 21.850 en la normativa', () => {
  it('régimen general baja a 23% y la restitución desaparece de a poco', () => {
    expect([2026, 2027, 2028, 2029, 2031].map(a => tasaIDPC('general', a))).toEqual([0.27, 0.255, 0.24, 0.23, 0.23]);
    expect([2026, 2027, 2028, 2029].map(restitucion)).toEqual([0.35, 0.3, 0.2, 0]);
    expect(factorCredito('general', 2029)).toBeCloseTo(0.23 / 0.77, 6);
  });
  it('el cálculo 14 A usa la tasa y la restitución del año', () => {
    const r = responderTributaria('primera categoría 14 A renta 50.000.000 año comercial 2028, retiros de los socios', hoy)!.texto;
    expect(r).toMatch(/24% = \$12\.000\.000/);
    expect(r).toMatch(/restituir el 20%/);
    expect(responderTributaria('primera categoría 14 A retiros 10.000.000 año comercial 2029', hoy)!.texto).toMatch(/no se restituye nada/);
  });
});

describe('buscador', () => {
  const q = 'Que cambios trae la nueva reforma tributaria para las empresas en la categoria 14 A?';
  it('la pregunta del usuario va al buscador', () => {
    expect(pideBusqueda(q)).toBe(true);
    expect(intencion(q)).toBe('buscar');
    expect(intencion('¿cómo afecta la ley de reconstrucción a las pymes?')).toBe('buscar');
  });
  it('sintetiza la reforma para el régimen general con fuentes del SII', () => {
    const r = buscar(q)!.texto;
    expect(r).toMatch(/^Ley 21\.850 \(Ley para la Reconstrucción Nacional/);
    expect(r).toMatch(/Lo que cambia para las empresas del régimen general \(14 A\):/);
    expect(r).toMatch(/25,5% en el AT 2028, 24% en el AT 2029 y 23% desde el AT 2030/);
    expect(r).toMatch(/restituir baja de 35% a 30%/);
    expect(r).toMatch(/PPM[\s\S]*por confirmar/);
    expect(r).toMatch(/Crédito por pago de remuneraciones/);
    expect(r).toMatch(/consulta pública/);
    expect(r).toMatch(/sii\.cl\/noticias\/2026\/191026noti01pcr\.htm/);
    expect(r).not.toMatch(/12,5%/);                    // lo de Pro Pyme no se mezcla
  });
  it('para Pro Pyme muestra lo suyo', () => {
    const r = buscar('¿qué cambia la reforma para las pro pyme?')!.texto;
    expect(r).toMatch(/Pro Pyme General \(14 D N° 3\)/);
    expect(r).not.toMatch(/25,5%/);
  });
  it('sin respaldo no inventa', () => {
    expect(buscar('qué cambia la ley de pesca artesanal')).toBeNull();
  });
  it('también busca en la ayuda de la app', () => {
    expect(buscar('restaurar una copia de seguridad', temasAyuda())?.texto).toMatch(/respaldo/i);
  });
});
