// Preguntas tributarias con cálculo (Primera Categoría, crédito para los dueños, IVA, retención de honorarios y PPM).
// Usa las tasas de normativa.ts, cita la fuente y dice qué supuso. Si la pregunta se puede leer de dos formas (por ejemplo,
// "30 millones de crédito"), muestra ambas. Es una estimación: no reemplaza la revisión del contador.
import { montoDe } from './asientosAyuda';
import { texto as normal } from './sugerir';
import { normativa, tasaIDPC, factorCredito, retencionHonorarios, ppmMinimo } from './normativa';
import type { Respuesta } from './asistente';

type Regimen = 'propyme' | 'general' | 'transparente';
const $ = (n: number) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('de-DE');
const pct = (x: number) => `${(x * 100).toLocaleString('es-CL', { maximumFractionDigits: 4 })}%`;
const NOMBRE: Record<Regimen, string> = { propyme: 'Pro Pyme General (14 D N° 3)', general: 'Régimen General (14 A)', transparente: 'Pro Pyme Transparente (14 D N° 8)' };

export function regimenDe(t: string): Regimen | null {
  if (/\b(14 ?d ?(n|no|nro|numero)? ?8|transparente|una de 8|d8)\b/.test(t)) return 'transparente';
  if (/\b(14 ?d ?(n|no|nro|numero)? ?3|pro ?pyme|propyme|una de 3|d3|14 ?d)\b/.test(t)) return 'propyme';
  if (/\b(14 ?a|semi ?integrado|regimen general|general)\b/.test(t)) return 'general';
  return null;
}

/** Año comercial de la pregunta: "año comercial 2027", "AT 2027" (= año comercial 2026) o, si no, el año en curso. */
export function anioComercial(t: string, hoy: Date): { anio: number; supuesto?: string } {
  const at = t.match(/\b(ano tributario|at) ?(\d{4})\b/); if (at) return { anio: Number(at[2]) - 1 };
  const ac = t.match(/\b(ano comercial|ac|ejercicio|del ano|en el ano|para el) ?(\d{4})\b/); if (ac) return { anio: Number(ac[2]) };
  return { anio: hoy.getFullYear(), supuesto: `Usé el año comercial ${hoy.getFullYear()} (se declara en abril de ${hoy.getFullYear() + 1}).` };
}

export function esTributaria(pregunta: string): boolean {
  const t = normal(pregunta);
  return /\b(primera categoria|idpc|impuesto (a la renta|de primera)|global complementario|credito (por|de) (idpc|primera)|cuanto (pago|pagaria|pagare|tengo que pagar)|impuesto que (pago|pagaria)|retencion de (la )?(boleta|honorarios)|cuanto (es el|de) iva|iva de|ppm de|tasa de (primera|ppm|iva|retencion))\b/.test(t);
}

export function responderTributaria(pregunta: string, hoy = new Date()): Respuesta | null {
  const t = normal(pregunta), monto = montoDe(pregunta);
  const { anio, supuesto } = anioComercial(t, hoy);
  const supuestos = supuesto ? [supuesto] : [];
  const fuente = (f: string) => `Fuente: ${f}. Es una estimación con la normativa cargada en la app (actualizada al ${normativa().actualizado.split('-').reverse().join('-')}); confírmala antes de declarar.`;

  // IVA
  if (/\b(iva de|cuanto (es el|de) iva|calcula(r)? (el )?iva)\b/.test(t) && monto) {
    const tasa = normativa().iva, bruto = /\b(con iva|bruto|total|iva incluido)\b/.test(t);
    const neto = bruto ? Math.round(monto / (1 + tasa)) : monto, iva = bruto ? monto - neto : Math.round(monto * tasa);
    return { texto: `${bruto ? `De ${$(monto)} con IVA incluido` : `Sobre un neto de ${$(monto)}`}: neto ${$(neto)}, IVA ${pct(tasa)} = ${$(iva)}, total ${$(neto + iva)}.\n${bruto ? '' : 'Si el monto ya incluía el IVA, dime "con IVA". '}${fuente('DL 825, art. 14')}`, acciones: [] };
  }
  // Retención de honorarios
  if (/\b(retencion|retener|honorario)\w*/.test(t) && monto && !/primera categoria|idpc/.test(t)) {
    const tasa = retencionHonorarios(anio), ret = Math.round(monto * tasa);
    return { texto: `Boleta de honorarios de ${$(monto)} bruto en ${anio}: retención ${pct(tasa)} = ${$(ret)}; líquido ${$(monto - ret)}. La retención la paga quien recibe la boleta en el F29 (código 151).\n${fuente('Ley 21.133 (art. 74 N°2 LIR)')}`, acciones: [] };
  }
  // PPM
  if (/\bppm\b/.test(t) && monto) {
    const tasaUsuario = Number(pregunta.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(',', '.'));
    const tasa = tasaUsuario > 0 ? tasaUsuario / 100 : ppmMinimo(anio);
    return { texto: `PPM sobre ingresos de ${$(monto)} con tasa ${pct(tasa)}: ${$(monto * tasa)}.${tasaUsuario > 0 ? '' : ` Usé la tasa mínima del régimen Pro Pyme para ${anio}; si tu empresa usa otra (por ejemplo, una voluntaria), dímela: "PPM de 10.000.000 al 1%".`}\n${fuente('Art. 84 LIR; Ley 21.850')}`, acciones: [] };
  }
  // Primera Categoría y crédito para los dueños
  if (/\b(primera categoria|idpc|impuesto (a la renta|de primera)|global complementario|credito)\b/.test(t)) {
    if (!monto) return { texto: 'Para calcularlo necesito el monto. Por ejemplo: "si tengo una renta líquida de 30.000.000, ¿cuánto pago de primera categoría siendo 14 D N° 3?".', acciones: [] };
    const reg = regimenDe(t) ?? 'propyme';
    if (!regimenDe(t)) supuestos.push('No dijiste el régimen: usé Pro Pyme General (14 D N° 3).');
    if (reg === 'transparente') return { texto: `En el ${NOMBRE.transparente} la empresa no paga Primera Categoría: las rentas se atribuyen a los dueños y tributan en sus impuestos finales (Global Complementario). Para ${$(monto)} el IDPC de la empresa es $0.\n${fuente(normativa().idpc.fuente)}`, acciones: [] };
    const tasa = tasaIDPC(reg, anio), factor = factorCredito(reg, anio);
    const lineas = [`${NOMBRE[reg]}, año comercial ${anio}: tasa de Primera Categoría ${pct(tasa)}.`];
    const dosLecturas = /\bcredito\b/.test(t);
    lineas.push(`${dosLecturas ? 'a) Si los ' + $(monto) + ' son la renta líquida imponible (la utilidad tributaria): ' : `Con una renta líquida imponible de ${$(monto)}: `}impuesto de Primera Categoría = ${$(monto)} × ${pct(tasa)} = ${$(monto * tasa)}.`);
    if (dosLecturas || /\b(retiro|dividendo|distribu|dueno|socio|global)\w*/.test(t)) {
      const credito = Math.round(monto * factor);
      lineas.push(`${dosLecturas ? 'b) Si los ' + $(monto) + ' son retiros o dividendos que reciben los dueños: ' : ''}el crédito por Primera Categoría para el dueño es ${$(monto)} × factor ${factor.toLocaleString('es-CL', { maximumFractionDigits: 6 })} = ${$(credito)}; se suma a la base del Global Complementario (incremento) y se descuenta del impuesto.${reg === 'general' ? ' En el régimen general el dueño debe restituir el 35% de ese crédito.' : ''}`);
    }
    if (/\bppm\b/.test(t)) lineas.push('Los PPM pagados en el año se descuentan del impuesto en el F22: si son mayores, la diferencia se devuelve.');
    if (reg === 'propyme' && anio >= 2025 && anio <= 2028) supuestos.push('La tasa rebajada requiere que, al cierre del año, la cotización del empleador de la Ley 21.735 sea la que indica la ley (la Circular 53/2025 la da por cumplida hasta 2028).');
    return { texto: [...lineas, ...(supuestos.length ? [`Supuse: ${supuestos.join(' ')}`] : []), fuente(`${normativa().idpc.fuente}; ${normativa().factorCredito.fuente}`)].join('\n'), acciones: [] };
  }
  return null;
}
