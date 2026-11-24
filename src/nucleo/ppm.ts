// Tasas del PPM (pago provisional mensual, art. 84 LIR) que puede usar una empresa: las que fija la ley según el régimen,
// la del último F29 declarado y una voluntaria. La empresa elige una en "IVA y F29" y el borrador del F29 la usa.
import { ppmMinimo } from './normativa';

export type RegimenPPM = 'propyme' | 'transparente' | 'general' | 'otra';
export interface OpcionPPM { id: string; regimen: RegimenPPM; etiqueta: string; tasa: number | null; detalle: string; fuente: string }

export const NOMBRE_REGIMEN: Record<RegimenPPM, string> = {
  propyme: 'Pro Pyme General (14 D N° 3)', transparente: 'Pro Pyme Transparente (14 D N° 8)', general: 'Régimen general (14 A)', otra: 'Otras',
};

/** Opciones de tasa para un año comercial. "f29" y "voluntaria" no traen tasa: la pone el F29 o el usuario. */
export function opcionesPPM(anio: number): OpcionPPM[] {
  const reb = ppmMinimo(anio);
  return [
    { id: 'propyme-rebajada', regimen: 'propyme', etiqueta: `Tasa rebajada transitoria: ${pct(reb)}`, tasa: reb,
      detalle: `Pro Pyme General en ${anio}, mientras rija la rebaja transitoria.`, fuente: 'Ley 21.755 y Circular SII N° 53/2025' },
    { id: 'propyme-025', regimen: 'propyme', etiqueta: 'Ingresos del año anterior hasta 50.000 UF: 0,25%', tasa: 0.0025,
      detalle: 'También es la tasa del primer año de actividades.', fuente: 'Art. 14 letra D N° 3 LIR' },
    { id: 'propyme-05', regimen: 'propyme', etiqueta: 'Ingresos del año anterior sobre 50.000 UF: 0,5%', tasa: 0.005, detalle: '', fuente: 'Art. 14 letra D N° 3 LIR' },
    { id: 'transp-02', regimen: 'transparente', etiqueta: 'Ingresos del año anterior hasta 50.000 UF: 0,2%', tasa: 0.002,
      detalle: 'También es la tasa del primer año de actividades.', fuente: 'Art. 14 letra D N° 8 LIR' },
    { id: 'transp-05', regimen: 'transparente', etiqueta: 'Ingresos del año anterior sobre 50.000 UF: 0,5%', tasa: 0.005, detalle: '', fuente: 'Art. 14 letra D N° 8 LIR' },
    { id: 'general-84a', regimen: 'general', etiqueta: 'Tasa del art. 84 a): impuesto de Primera Categoría del año anterior ÷ ingresos brutos', tasa: null,
      detalle: 'Se calcula con el F22 del año anterior: ingresa el impuesto y los ingresos brutos.', fuente: 'Art. 84 letra a) LIR' },
    { id: 'general-1', regimen: 'general', etiqueta: 'Sin año anterior o sin impuesto: 1%', tasa: 0.01, detalle: 'Primer año, o año anterior con pérdida.', fuente: 'Art. 84 letra a) LIR' },
    { id: 'f29', regimen: 'otra', etiqueta: 'La del último F29 declarado', tasa: null, detalle: 'Toma el código 115 del F29 más reciente que cargaste.', fuente: 'F29 cargados' },
    { id: 'voluntaria', regimen: 'otra', etiqueta: 'Tasa voluntaria (mayor que la legal)', tasa: null,
      detalle: 'La empresa puede pagar PPM por sobre la tasa legal para no pagar tanto en abril; el exceso se descuenta o devuelve en el F22.', fuente: 'Art. 84 y 88 LIR' },
  ];
}

/** Tasa del art. 84 a) con dos decimales del porcentaje, como la calcula el SII. */
export function tasa84a(impuestoAnterior: number, ingresosBrutos: number): number | null {
  if (!(ingresosBrutos > 0) || !(impuestoAnterior > 0)) return null;
  return Math.round((impuestoAnterior / ingresosBrutos) * 10000) / 10000;
}

const pct = (t: number) => `${(t * 100).toLocaleString('es-CL', { maximumFractionDigits: 3 })}%`;
export const textoTasa = pct;
