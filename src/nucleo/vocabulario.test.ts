// Vocabulario de Riffo Junior: jerga, glosario, DJ y montos dichos de forma informal (sin datos reales).
import { describe, it, expect } from 'vitest';
import { jerga, responderGlosario } from './vocabulario';
import { intencion, buscarAyuda } from './asistente';
import { responderTributaria } from './tributario';
import { montoDe } from './asientosAyuda';

const hoy = new Date('2026-11-23');
const g = (q: string) => responderGlosario(q)?.texto ?? '';

describe('jerga', () => {
  it('traduce formas informales a los términos de la app', () => {
    expect(jerga('¿Cuándo vence la 29?')).toContain(' f29 ');
    expect(jerga('las DDJJ de este año')).toContain(' dj ');
    expect(jerga('el formulario 1887')).toContain(' dj 1887 ');
    expect(jerga('el CF y el DF')).toBe(' el credito fiscal y el debito fiscal ');
    expect(jerga('me llegó una BHE')).toContain(' boleta de honorarios ');
    expect(jerga('pagar las imposiciones')).toContain(' cotizaciones ');
    expect(jerga('impuesto de 1ra categoría')).toContain(' primera categoria ');
    expect(jerga('la operación renta')).toContain(' f22 ');
    expect(jerga('la depre del auto')).toContain(' depreciacion ');
    expect(jerga('el EERR')).toContain(' estado de resultados ');
  });
});

describe('montos informales', () => {
  it('lucas, palos, k, gambas', () => {
    expect(montoDe('sácale el IVA a 119 lucas')).toBe(119000);
    expect(montoDe('PPM de 10 palos al 1%')).toBe(10_000_000);
    expect(montoDe('1,5 palos')).toBe(1_500_000);
    expect(montoDe('1.500 lucas')).toBe(1_500_000);
    expect(montoDe('20k')).toBe(20000);
    expect(montoDe('un palo')).toBe(1_000_000);
    expect(montoDe('1.500 millones')).toBe(1_500_000_000);
  });
});

describe('intención y glosario', () => {
  it('definiciones y plazos van al glosario', () => {
    for (const q of ['¿Qué es el CF?', '¿cuándo vence la 29?', '¿Qué DJ me tocan?', 'qué es la DJ 1887', 'iva?', 'la depre', '¿qué significa RLI?', '¿qué es el remanente?', 'gastos rechazados', '¿qué es un PPM?', '¿qué es la tasa de primera categoría?'])
      expect(intencion(q), q).toBe('glosario');
  });
  it('si trae un monto para calcular, calcula', () => {
    expect(intencion('sácale el IVA a 119 lucas')).toBe('tributaria');
    expect(intencion('PPM de 10 palos al 1%')).toBe('tributaria');
    expect(intencion('¿cuánto me toca pagar de primera categoría con una RLI de 30 palos?')).toBe('tributaria');
  });
  it('lo demás sigue igual', () => {
    expect(intencion('revisa mi empresa')).toBe('revisar');
    expect(intencion('vendí 1.190.000 con boleta')).toBe('asiento');
    expect(intencion('noticias del SII')).toBe('noticias');
  });
  it('responde con definición y fuente', () => {
    expect(g('¿qué es el CF?')).toMatch(/Crédito fiscal[\s\S]*Fuente: DL 825/);
    expect(g('¿cuándo vence la 29?')).toMatch(/día 12[\s\S]*día 20[\s\S]*001_130_1060/);
    expect(g('¿qué es la RLI?')).toMatch(/Renta líquida imponible/);
    expect(g('¿qué es el remanente de CF?')).toMatch(/^Remanente/);
    expect(g('que onda la operación renta')).toMatch(/^F22/);
    expect(g('¿qué es una BH?')).toMatch(/^Boleta de honorarios[\s\S]*15,25%/);
    expect(g('el debe y el haber')).toMatch(/^Debe y haber/);
    expect(g('qué es la cuenta particular')).toMatch(/^Retiros/);
    expect(g('me pilló el SII')).toMatch(/^Fiscalización/);
  });
  it('declaraciones juradas: lista, por número y por tema', () => {
    expect(g('¿qué DJ me tocan?')).toMatch(/DJ 1887[\s\S]*DJ 1879[\s\S]*DJ 1948[\s\S]*formularios_y_plazos_2026/);
    expect(g('¿cuándo vence la DJ 1887?')).toMatch(/^DJ 1887 — Rentas del art\. 42 N° 1[\s\S]*27 de marzo/);
    expect(g('declaración jurada de honorarios')).toMatch(/^DJ 1879/);
    expect(g('la dj de retiros de los socios')).toMatch(/^DJ 1948/);
    expect(g('formulario 1847')).toMatch(/30 de junio/);
    expect(g('dj 1999')).toMatch(/No tengo la DJ 1999/);
  });
  it('la ayuda de la app entiende la jerga', () => {
    expect(buscarAyuda('cómo cargo el estado de cuenta del banco')?.texto).toMatch(/cartola/);
  });
});

describe('cálculos dichos de forma informal', () => {
  it('IVA: sacar y agregar', () => {
    expect(responderTributaria('sácale el IVA a 119 lucas', hoy)!.texto).toMatch(/neto \$100\.000, IVA 19% = \$19\.000/);
    expect(responderTributaria('agrégale el IVA a 100 lucas', hoy)!.texto).toMatch(/neto \$100\.000, IVA 19% = \$19\.000, total \$119\.000/);
    expect(responderTributaria('neto de 1.190.000', hoy)!.texto).toMatch(/neto \$1\.000\.000/);
    expect(responderTributaria('500 lucas más IVA', hoy)!.texto).toMatch(/total \$595\.000/);
  });
  it('PPM y retención con jerga', () => {
    expect(responderTributaria('PPM de 10 palos al 1%', hoy)!.texto).toMatch(/\$100\.000/);
    expect(responderTributaria('retención a una BH de 200 lucas', hoy)!.texto).toMatch(/15,25% = \$30\.500/);
  });
});
