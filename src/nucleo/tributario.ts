// Preguntas tributarias con cálculo (Primera Categoría, crédito para los dueños, IVA, retención de honorarios y PPM).
// Usa las tasas de normativa.ts, cita la fuente y dice qué supuso. Si la pregunta se puede leer de dos formas (por ejemplo,
// "30 millones de crédito"), muestra ambas. Es una estimación: no reemplaza la revisión del contador.
import { montoDe } from './asientosAyuda';
import { jerga } from './vocabulario';
import { normativa, tasaIDPC, factorCredito, retencionHonorarios, ppmMinimo, restitucion } from './normativa';
import type { Respuesta } from './asistente';
import { opcionesPPM, NOMBRE_REGIMEN } from './ppm';

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

// Cálculo de IVA dicho de varias formas: "IVA de", "sácale el IVA a", "agrégale el IVA", "neto de", "más IVA"
const PIDE_IVA = /\b(iva (de|a|para|sobre)|cuanto (es el |de |seria el |sale el )?iva|calcul\w* (el )?iva|(saca|sacale|sacar|quita|quitale|quitar|descuenta|descontar|agrega|agregale|agregar|suma|sumale|sumar)( le)? (el )?iva|neto de|bruto de|mas iva)\b/;

// "19% de 1.190.000", "el 1,5% sobre 3 palos"
const PORCENTAJE = /(\d+(?:[.,]\d+)?)\s*%\s*(?:de|sobre|a)\s/i;
// Renta, utilidad o ganancia con un monto y la pregunta por el impuesto, aunque no diga "primera categoría"
const PIDE_RENTA = /\b(renta liquida|rli|utilidad(es)?|gane|ganamos|ganancia|base imponible)\b/;
const PIDE_IMPUESTO = /\b(cuanto (pago|pagaria|pagare|tengo que pagar|me toca|sale|impuesto)|impuesto|pagar)\b/;

export interface ContextoEmpresa { tasaPPM?: number | null; origenTasaPPM?: string }

export function esTributaria(pregunta: string): boolean {
  const t = jerga(pregunta);
  if (PORCENTAJE.test(pregunta) && montoDe(pregunta) !== null) return true;
  if (PIDE_RENTA.test(t) && PIDE_IMPUESTO.test(t)) return true;
  return PIDE_IVA.test(t) || /\b(primera categoria|idpc|impuesto (a la renta|de primera)|global complementario|credito (por|de) (idpc|primera)|cuanto (pago|pagaria|pagare|tengo que pagar|me toca pagar|me sale|sale)|impuesto que (pago|pagaria)|retencion de (la )?(boleta|honorarios)|retencion (de|a) (una )?boleta de honorarios|ppm de|tasa de (primera|ppm|iva|retencion))\b/.test(t);
}

export function responderTributaria(pregunta: string, hoy = new Date(), ctx: ContextoEmpresa = {}): Respuesta | null {
  const t = jerga(pregunta), monto = montoDe(pregunta);
  const { anio, supuesto } = anioComercial(t, hoy);
  const supuestos = supuesto ? [supuesto] : [];
  const fuente = (f: string) => `Fuente: ${f}. Es una estimación con la normativa cargada en la app (actualizada al ${normativa().actualizado.split('-').reverse().join('-')}); confírmala antes de declarar.`;

  // Porcentaje suelto: "¿cuánto es el 19% de 1.190.000?"
  const pc = pregunta.match(PORCENTAJE);
  if (pc && monto && !/\bppm\b/.test(t)) {
    const p = Number(pc[1].replace(',', '.'));
    const base = montoDe(pregunta.slice(pregunta.indexOf(pc[0]) + pc[0].length)) ?? monto;
    const r = Math.round(base * p / 100);
    const nota = p === normativa().iva * 100 ? ` Si ${$(base)} es un neto, el IVA es ${$(r)} y el total ${$(base + r)}; si ya trae IVA, pídeme "sácale el IVA a ${$(base)}".` : '';
    return { texto: `El ${p.toLocaleString('es-CL')}% de ${$(base)} es ${$(r)}.${nota}`, acciones: [] };
  }
  // IVA
  if (PIDE_IVA.test(t) && monto) {
    const tasa = normativa().iva, bruto = /\b(con iva|bruto|total|iva incluido|neto de|(saca|sacale|sacar|quita|quitale|quitar|descuenta|descontar)( le)? (el )?iva)\b/.test(t) && !/\b(mas iva|(agrega|agregale|agregar|suma|sumale|sumar)( le)? (el )?iva)\b/.test(t);
    const neto = bruto ? Math.round(monto / (1 + tasa)) : monto, iva = bruto ? monto - neto : Math.round(monto * tasa);
    return { texto: `${bruto ? `De ${$(monto)} con IVA incluido` : `Sobre un neto de ${$(monto)}`}: neto ${$(neto)}, IVA ${pct(tasa)} = ${$(iva)}, total ${$(neto + iva)}.\n${bruto ? '' : 'Si el monto ya incluía el IVA, dime "con IVA". '}${fuente('DL 825, art. 14')}`, acciones: [] };
  }
  // Retención de honorarios
  if (/\b(retencion|retener|honorario)\w*/.test(t) && monto && !/primera categoria|idpc/.test(t)) {
    const tasa = retencionHonorarios(anio), ret = Math.round(monto * tasa);
    return { texto: `Boleta de honorarios de ${$(monto)} bruto en ${anio}: retención ${pct(tasa)} = ${$(ret)}; líquido ${$(monto - ret)}. La retención la paga quien recibe la boleta en el F29 (código 151).\n${fuente('Ley 21.133 (art. 74 N°2 LIR)')}`, acciones: [] };
  }
  // Tasas del PPM según el régimen ("¿cuál es la tasa de PPM para una pro pyme?")
  if (/\bppm\b/.test(t) && !monto && /\b(tasa|tasas|porcentaje|cuanto es|cual es)\b/.test(t)) {
    const reg = regimenDe(t);
    const opciones = opcionesPPM(anio).filter(o => o.tasa !== null || o.id === 'general-84a').filter(o => (reg ? o.regimen === reg : o.regimen !== 'otra'));
    return { texto: [`Tasas del PPM en ${anio}${reg ? ` para ${NOMBRE[reg]}` : ' según el régimen'}:`,
      ...opciones.map(o => `• ${reg ? '' : `${NOMBRE_REGIMEN[o.regimen]}: `}${o.etiqueta}${o.detalle ? ` (${o.detalle.replace(/\.$/, '')})` : ''}.`),
      ...(ctx.tasaPPM ? [`Tu empresa usa ${ctx.origenTasaPPM ?? pct(ctx.tasaPPM)}.`] : []),
      'También se puede pagar una tasa voluntaria mayor. La tasa se elige en IVA y F29 > "Cambiar tasa del PPM".',
      fuente([...new Set(opciones.map(o => o.fuente))].join('; '))].join('\n'), acciones: [{ tipo: 'ir', etiqueta: 'Cambiar la tasa del PPM', vista: 'iva' }] };
  }
  // PPM
  if (/\bppm\b/.test(t) && monto) {
    const tasaUsuario = Number(pregunta.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(',', '.'));
    const deEmpresa = !(tasaUsuario > 0) && ctx.tasaPPM ? ctx.tasaPPM : null;
    const tasa = tasaUsuario > 0 ? tasaUsuario / 100 : deEmpresa ?? ppmMinimo(anio);
    const nota = tasaUsuario > 0 ? '' : deEmpresa ? ` Usé la tasa de tu empresa (${ctx.origenTasaPPM ?? 'la elegida en IVA y F29'}); si quieres otra, dímela: "PPM de 10.000.000 al 0,25%".`
      : ` Usé la tasa mínima del régimen Pro Pyme para ${anio}; si tu empresa usa otra (por ejemplo, una voluntaria), dímela: "PPM de 10.000.000 al 1%".`;
    return { texto: `PPM sobre ingresos de ${$(monto)} con tasa ${pct(tasa)}: ${$(monto * tasa)}.${nota}\n${fuente('Art. 84 LIR; Ley 21.850')}`, acciones: [] };
  }
  // Primera Categoría y crédito para los dueños
  if (/\b(primera categoria|idpc|impuesto (a la renta|de primera)|global complementario|credito)\b/.test(t) || (monto && PIDE_RENTA.test(t) && PIDE_IMPUESTO.test(t))) {
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
      lineas.push(`${dosLecturas ? 'b) Si los ' + $(monto) + ' son retiros o dividendos que reciben los dueños: ' : ''}el crédito por Primera Categoría para el dueño es ${$(monto)} × factor ${factor.toLocaleString('es-CL', { maximumFractionDigits: 6 })} = ${$(credito)}; se suma a la base del Global Complementario (incremento) y se descuenta del impuesto.${reg === 'general' ? (restitucion(anio) > 0 ? ` En el régimen general el dueño debe restituir el ${pct(restitucion(anio))} de ese crédito (año comercial ${anio}).` : ` Desde el año comercial 2029 el crédito es íntegro: no se restituye nada (Ley 21.850).`) : ''}`);
    }
    if (/\bppm\b/.test(t)) lineas.push('Los PPM pagados en el año se descuentan del impuesto en el F22: si son mayores, la diferencia se devuelve.');
    if (reg === 'propyme' && anio >= 2029) supuestos.push('Para 2029 en adelante usé la tasa Pro Pyme que dejó la Ley 21.755; la Ley 21.850 baja la tasa general a 23% desde 2029 y el SII todavía no publica la circular definitiva: confírmala antes de planificar.');
    if (reg === 'general' && anio >= 2027) supuestos.push('Tasa del régimen general según la Ley 21.850 (rebaja gradual a 23%); el SII tiene en consulta pública la circular que la instruye.');
    if (reg === 'propyme' && anio >= 2025 && anio <= 2028) supuestos.push('La tasa rebajada requiere que, al cierre del año, la cotización del empleador de la Ley 21.735 sea la que indica la ley (la Circular 53/2025 la da por cumplida hasta 2028).');
    return { texto: [...lineas, ...(supuestos.length ? [`Supuse: ${supuestos.join(' ')}`] : []), fuente(`${normativa().idpc.fuente}; ${normativa().factorCredito.fuente}`)].join('\n'), acciones: [] };
  }
  return null;
}
