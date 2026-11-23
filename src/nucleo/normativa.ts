// Normativa vigente que usa la app (UTM, tasas y vidas útiles). Viene en public/normativa.json, que se actualiza solo cada
// mes desde el sitio del SII (robot/actualizar-normativa.ts y .github/workflows/normativa.yml). Estos son los valores de
// respaldo si el archivo no se puede leer.
import { UTM_SII } from './f29';

export interface Novedad { fecha: string; titulo: string; detalle: string; fuente: string }
export interface Normativa {
  actualizado: string;                          // AAAA-MM-DD de la última actualización
  fuente: string;
  utm: Record<string, number>;                  // AAAA-MM → UTM del mes
  iva: number;
  retencionHonorarios: Record<string, number>;  // año → tasa (Ley 21.133)
  ppmMinimo: Record<string, number>;            // año → tasa mínima (Pro Pyme; Ley 21.850)
  vidaUtil: Record<string, number>;             // años, vida útil normal SII (Res. Ex. 43/2002)
  idpc: { general: Record<string, number>; propyme: Record<string, number>; transparente: Record<string, number>; fuente: string };   // año comercial → tasa
  factorCredito: { propyme: Record<string, number>; general: Record<string, number>; fuente: string };              // crédito por IDPC para los dueños
  novedades: Novedad[];
}

let actual: Normativa = {
  actualizado: '2026-11-23', fuente: 'Valores incluidos en la app',
  utm: { ...UTM_SII }, iva: 0.19,
  retencionHonorarios: { '2025': 0.145, '2026': 0.1525, '2027': 0.16, '2028': 0.17 },
  ppmMinimo: { '2025': 0.00125, '2026': 0.00125, '2027': 0.00125, '2028': 0.0025, '2029': 0.0023 },
  vidaUtil: { computadores: 6, vehiculos: 7, muebles: 7, maquinaria: 15 },
  idpc: { general: { '2020': 0.27 }, propyme: { '2025': 0.125, '2026': 0.125, '2027': 0.125, '2028': 0.15, '2029': 0.25 }, transparente: { '2020': 0 },
    fuente: 'Art. 20 LIR (régimen general 27%); Ley 21.755 y Circular SII N° 53/2025 (Pro Pyme 14 D: 12,5% años comerciales 2025-2027, 15% en 2028, 25% después)' },
  factorCredito: { propyme: { '2025': 0.142857, '2026': 0.142857, '2027': 0.142857, '2028': 0.17647, '2029': 0.333333 }, general: { '2020': 0.369863 },
    fuente: 'Circular SII N° 53/2025 (factor 0,142857 en 2025-2027 y 0,176470 en 2028); régimen general: crédito con obligación de restituir el 35% (art. 56 y 63 LIR)' },
  novedades: [],
};

export const normativa = () => actual;

/** Aplica la normativa leída del archivo: completa la tabla de UTM que usan el F29 y los controles. */
export function aplicarNormativa(n: Partial<Normativa>) {
  actual = { ...actual, ...n, utm: { ...actual.utm, ...(n.utm ?? {}) } };
  Object.assign(UTM_SII, actual.utm);
}

const porAnio = (t: Record<string, number>, anio: number) => {
  const anios = Object.keys(t).map(Number).filter(a => a <= anio).sort((a, b) => b - a);
  return anios.length ? t[String(anios[0])] : t[Object.keys(t).sort()[0]];
};
export const retencionHonorarios = (anio: number) => porAnio(actual.retencionHonorarios, anio);
export const ppmMinimo = (anio: number) => porAnio(actual.ppmMinimo, anio);
export const tasaIDPC = (regimen: 'general' | 'propyme' | 'transparente', anio: number) => porAnio(actual.idpc[regimen], anio);
export const factorCredito = (regimen: 'general' | 'propyme', anio: number) => porAnio(actual.factorCredito[regimen], anio);

const MESES_UTM = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Lee la tabla "Mes | UTM | UTA | …" de la página anual de la UTM del SII. */
export function leerTablaUTM(html: string, anio: number): Record<string, number> {
  const r: Record<string, number> = {};
  for (const m of html.matchAll(/<th[^>]*>\s*([A-Za-zé]+)\s*<\/th>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>/g)) {
    const i = MESES_UTM.indexOf(m[1].toLowerCase()), v = Number(m[2].replace(/\./g, ''));
    if (i >= 0 && v > 10000) r[`${anio}-${String(i + 1).padStart(2, '0')}`] = v;
  }
  return r;
}

