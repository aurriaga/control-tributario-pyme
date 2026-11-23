// Preguntas tributarias con cálculo y noticias del SII (datos ficticios y tasas con su fuente).
import { describe, it, expect } from 'vitest';
import { responderTributaria, regimenDe, esTributaria } from './tributario';
import { leerIndiceSII, resumenNoticias } from './noticias';
import { intencion } from './asistente';
import { texto } from './sugerir';

const hoy = new Date('2026-11-23');
describe('preguntas tributarias', () => {
  it('Primera Categoría Pro Pyme con "crédito": muestra las dos lecturas con la tasa y el factor de la Circular 53/2025', () => {
    const q = 'si tengo 30 millones de crédito, ¿cuánto es lo que puedo obtener en mi impuesto de primera categoría siendo una de 3?';
    expect(esTributaria(q)).toBe(true);
    expect(intencion(q)).toBe('tributaria');
    const r = responderTributaria(q, hoy)!.texto;
    expect(r).toMatch(/Pro Pyme General \(14 D N° 3\), año comercial 2026: tasa de Primera Categoría 12,5%/);
    expect(r).toMatch(/\$30\.000\.000 × 12,5% = \$3\.750\.000/);
    expect(r).toMatch(/factor 0,142857 = \$4\.285\.710/);
    expect(r).toMatch(/Circular SII N° 53\/2025/);
  });
  it('régimen general y años: 27% y la rebaja Pro Pyme termina', () => {
    expect(responderTributaria('impuesto de primera categoría régimen 14 A renta 10.000.000', hoy)!.texto).toMatch(/27% = \$2\.700\.000/);
    expect(responderTributaria('primera categoría 14 D N°3 renta 10.000.000 año comercial 2028', hoy)!.texto).toMatch(/15% = \$1\.500\.000/);
    expect(responderTributaria('primera categoría pro pyme 10.000.000 AT 2030', hoy)!.texto).toMatch(/25% = \$2\.500\.000/);
    expect(responderTributaria('primera categoria transparente 14 D N° 8 por 5.000.000', hoy)!.texto).toMatch(/no paga Primera Categoría/);
  });
  it('IVA, retención de honorarios y PPM', () => {
    expect(responderTributaria('cuánto es el IVA de 1.190.000 con IVA', hoy)!.texto).toMatch(/neto \$1\.000\.000, IVA 19% = \$190\.000/);
    expect(responderTributaria('retención de la boleta de honorarios de 200.000', hoy)!.texto).toMatch(/15,25% = \$30\.500/);
    expect(responderTributaria('PPM de 10.000.000 al 1%', hoy)!.texto).toMatch(/\$100\.000/);
  });
  it('reconoce el régimen escrito de varias formas', () => {
    expect(regimenDe(texto('soy una 14D3'))).toBe('propyme');
    expect(regimenDe(texto('14 D N° 8'))).toBe('transparente');
    expect(regimenDe(texto('semi integrado'))).toBe('general');
  });
});

describe('noticias del SII', () => {
  const html = `<h5 style='x'><a href='circu44.pdf' target='_blank'>Circular N&deg; 44 del 16 de Noviembre del 2026</a></h5>
<p style='x'>Informa tabla de c&aacute;lculos de reajustes y multas para el mes de diciembre 2026.</p>
<span style='x'><i>Fuente: Subdirecci&oacute;n Fiscalizacion</i></span>
<h5 style='x'><a href='reso161.pdf' target='_blank'>Resoluci&oacute;n Exenta SII N&deg; 161 del 19 de Noviembre del 2026</a></h5>
<p style='x'>Autoriza a emitir mensualmente una &uacute;nica boleta electr&oacute;nica de ventas.</p>
<span style='x'><i>Fuente: Subdirecci&oacute;n de Asistencia al Contribuyente</i></span>`;
  it('lee el índice oficial con fecha, materia, fuente y enlace, y separa lo de rutina', () => {
    const l = leerIndiceSII(html, 'https://www.sii.cl/normativa_legislacion/circulares/2026/indcir2026.htm');
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ tipo: 'Circular', numero: '44', fecha: '2026-11-16', rutina: true, fuente: 'Subdirección Fiscalizacion', enlace: 'https://www.sii.cl/normativa_legislacion/circulares/2026/circu44.pdf' });
    expect(l[1]).toMatchObject({ tipo: 'Resolución', numero: '161', rutina: false });
    const r = resumenNoticias({ actualizado: '2026-11-23', items: l }, 45, new Date('2026-11-23'));
    expect(r).toMatch(/Resolución N° 161 \(19-11-2026\): Autoriza a emitir mensualmente una única boleta/);
    expect(r).toMatch(/1 publicaciones de rutina/);
    expect(intencion('¿Qué noticias hay del SII?')).toBe('noticias');
  });
});
