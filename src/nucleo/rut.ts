// RUT chileno: dígito verificador módulo 11 (algoritmo del SII). Equivale a modRUT.bas.

export function calcularDV(cuerpo: number): string {
  let suma = 0, mult = 2;
  while (cuerpo > 0) {
    suma += (cuerpo % 10) * mult;
    cuerpo = Math.floor(cuerpo / 10);
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

/** Quita puntos, espacios y comas, pasa a mayúsculas y asegura el guion antes del DV. */
export function limpiarRUT(rut: string): string {
  let s = rut.trim().toUpperCase().replace(/[.\s,]/g, '');
  if (!s.includes('-') && s.length > 1) s = s.slice(0, -1) + '-' + s.slice(-1);
  return s;
}

export function rutValido(rut: unknown): boolean {
  if (rut === null || rut === undefined) return false;
  const s = limpiarRUT(String(rut));
  const i = s.indexOf('-');
  if (i < 0) return false;
  const cuerpo = s.slice(0, i), dv = s.slice(i + 1);
  if (cuerpo.length < 6 || cuerpo.length > 8 || dv.length !== 1 || !/^\d+$/.test(cuerpo)) return false;
  return calcularDV(Number(cuerpo)) === dv;
}

/** 12345678-5 / 123456785 / 12.345.678-5 -> 12.345.678-5 (si no se puede, devuelve el texto tal cual). */
export function formatearRUT(rut: unknown): string {
  if (rut === null || rut === undefined) return '';
  const original = String(rut);
  const s = limpiarRUT(original);
  const i = s.indexOf('-');
  if (i < 0) return original;
  const cuerpo = s.slice(0, i), dv = s.slice(i + 1);
  if (!cuerpo || !/^\d+$/.test(cuerpo)) return original;
  return Number(cuerpo).toLocaleString('de-DE') + '-' + dv;   // de-DE usa "." como separador de miles
}

/** Primer RUT válido del tipo 12345678-5 dentro de un nombre de archivo del SII ('' si no hay). Algunos archivos del RCV
 *  (el resumen: "RCV_RESUMEN_VENTA_12345678_202602.csv") traen el RUT sin dígito verificador: se calcula. */
export function rutEnNombre(nombre: string): string {
  for (const m of nombre.matchAll(/(\d{7,8}-[\dkK])/g)) {
    const rut = formatearRUT(m[1]);
    if (rutValido(rut)) return rut;
  }
  const sinDV = nombre.match(/^RCV_[A-Z_]*?_(\d{7,8})_20\d\d(?:0[1-9]|1[0-2])\b/i);
  if (sinDV) return formatearRUT(`${sinDV[1]}-${calcularDV(Number(sinDV[1]))}`);
  return '';
}
