// Lectura de cartolas bancarias desde cualquier formato: grillas (CSV, Excel, tablas) con columnas reconocidas por su
// nombre, o texto (PDF digital u OCR) con líneas "fecha descripción [documento] monto saldo".
// Equivale a lector.py (App_Conciliacion) y al lector de cartolas de modConciliacion.bas.
import type { Contenido } from './extraer';
import { normalizar, parseFecha, parseMonto } from './texto';

export interface Movimiento {
  clave: string;              // identifica el movimiento aunque la cartola se cargue dos veces con otro nombre
  cuenta: string;
  banco: string;
  fecha: string;              // AAAA-MM-DD
  descripcion: string;
  documento: string;
  cargo: number;              // sale dinero
  abono: number;              // entra dinero
  saldo: number | null;
  archivo: string;
  // estado de la conciliación
  estado: 'pendiente' | 'conciliado' | 'clasificado';
  categoria?: string;         // si se clasificó sin factura (comisión, F29, sueldos, etc.)
  regla?: string;             // regla que lo clasificó
  docs?: string[];            // claves de los documentos que paga o cobra
}

export interface ResultadoCartola {
  movimientos: Movimiento[];
  cuenta: string;
  saldoInicial: number | null;
  saldoFinal: number | null;
  cuadra: boolean | null;     // los saldos de la cartola calzan con los movimientos
  mensaje: string;
  avisos: string[];
}

type Col = 'fecha' | 'saldo' | 'abono' | 'cargo' | 'monto' | 'signo' | 'desc' | 'doc';

function tipoColumna(h: string): Col | '' {
  if (!h) return '';
  if (h === 'dc' || h === 'cargoabono' || h === 'abonocargo' || h === 'tipo' || h === 'tipomovimiento' || h === 'debcred') return 'signo';
  if (h.startsWith('fecha') || h === 'fec' || h === 'dia') return 'fecha';
  if (h === 'debe') return 'cargo';                  // cartolas con columnas Debe / Haber
  if (h === 'haber') return 'abono';
  if (h.includes('saldo')) return 'saldo';
  if (['abono', 'deposito', 'ingreso'].some(k => h.includes(k)) || (h.includes('credito') && !h.includes('tarjeta'))) return 'abono';
  if (['cargo', 'debito', 'giro', 'cheque', 'retiro', 'egreso'].some(k => h.includes(k))) return 'cargo';
  if (h.includes('monto') || h.includes('importe') || h === 'valor') return 'monto';
  if (['descrip', 'glosa', 'detalle', 'concepto', 'movimiento', 'transac', 'referencia'].some(k => h.includes(k))) return 'desc';
  if (['document', 'docto', 'operacion', 'serie', 'numero'].some(k => h.includes(k)) || h === 'ndoc' || h === 'nro') return 'doc';
  return '';
}

export function detectarCuenta(texto: string): string {
  const m = texto.match(/(?:cuenta|cta)[^\n]{0,80}?(\d[\d.-]{5,}\d)/i);
  return m ? m[1] : '';
}

const esSaldoTexto = (s: string) => /saldo\s+(anterior|inicial|final)/i.test(s);

type MovBase = Omit<Movimiento, 'clave' | 'cuenta' | 'banco' | 'archivo' | 'estado'>;

function movimientosDeGrilla(filas: string[][]): { movs: MovBase[]; saldoIni: number | null; saldoFin: number | null; nota: string } | null {
  let mapa: Partial<Record<Col, number>> = {}, fh = -1, dcEsDebitoCredito = false;
  for (let r = 0; r < Math.min(filas.length, 80); r++) {
    const m: Partial<Record<Col, number>> = {};
    filas[r].forEach((v, c) => { const n = normalizar(v); const t = tipoColumna(n); if (t && m[t] === undefined) { m[t] = c; if (t === 'signo') dcEsDebitoCredito = n === 'dc' || n === 'debcred'; } });
    if (m.fecha !== undefined && (m.cargo !== undefined || m.abono !== undefined || m.monto !== undefined)) { mapa = m; fh = r; break; }
  }
  if (fh < 0) return null;
  // Resumen de saldos arriba del detalle (formato Banco de Chile): fila "SALDO INICIAL ... SALDO FINAL" y bajo ella las cifras
  let saldoIni: number | null = null, saldoFin: number | null = null;
  for (let r = 0; r < fh; r++) {
    const n = filas[r].map(normalizar);
    const i = n.indexOf('saldoinicial'), f = n.indexOf('saldofinal');
    if (i >= 0 && f >= 0 && filas[r + 1]) { saldoIni = parseMonto(filas[r + 1][i]); saldoFin = parseMonto(filas[r + 1][f]); }
  }
  const c = (fila: string[], k: Col) => { const i = mapa[k]; return i === undefined ? '' : (fila[i] ?? '').trim(); };
  const anio = Number(filas.slice(fh + 1, fh + 50).map(f => parseFecha(c(f, 'fecha'))).find(Boolean)?.slice(0, 4) ?? new Date().getFullYear());
  const movs: MovBase[] = [];
  let vacias = 0, iniciado = false;
  for (const fila of filas.slice(fh + 1)) {
    const fecha = parseFecha(c(fila, 'fecha'), anio);
    if (!fecha) {
      if (!iniciado) continue;
      if (fila.some(x => x.trim())) break;                 // un título nuevo ("Resumen comisiones", "Saldos diarios") cierra el detalle
      if (++vacias >= 8) break;
      continue;
    }
    iniciado = true; vacias = 0;
    const desc = c(fila, 'desc');
    const saldoTxt = c(fila, 'saldo');
    const saldo = saldoTxt ? parseMonto(saldoTxt) : null;
    if (esSaldoTexto(desc)) { if (saldo !== null && saldoIni === null && movs.length === 0) saldoIni = saldo; continue; }
    let cargo = Math.abs(parseMonto(c(fila, 'cargo'))), abono = Math.abs(parseMonto(c(fila, 'abono')));
    if (!cargo && !abono && mapa.monto !== undefined) {
      const v = parseMonto(c(fila, 'monto')), s = normalizar(c(fila, 'signo'));
      let esCargo = v < 0;
      if (s) esCargo = dcEsDebitoCredito ? s.startsWith('d') : (s.startsWith('c') || s.startsWith('d') || s === 'cargo');
      if (s.startsWith('a') || s === 'abono') esCargo = false;
      if (esCargo) cargo = Math.abs(v); else abono = Math.abs(v);
    }
    if (cargo || abono) movs.push({ fecha, descripcion: desc, documento: c(fila, 'doc').replace(/^0+$/, ''), cargo, abono, saldo });
  }
  return { movs, saldoIni, saldoFin, nota: `Columnas reconocidas: ${Object.keys(mapa).join(', ')}.` };
}

const PAL_ABONO = ['abono', 'deposito', 'transfde', 'transferenciade', 'recibid', 'devolucion', 'interesesganados'];

/** Líneas "dd/mm/aaaa DESCRIPCIÓN [DOC] MONTO SALDO" (PDF u OCR). El signo sale de la variación del saldo; si no hay saldo,
 *  de palabras clave (abono, depósito...). */
function movimientosDeTexto(texto: string) {
  const movs: MovBase[] = [];
  let anio = new Date().getFullYear(), saldoAnt: number | null = null, saldoIni: number | null = null;
  const NUM = /-?\$?\s?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\$?\s?\d+(?:,\d+)?/g;
  for (const linea0 of texto.replace(/\t/g, '  ').split('\n')) {
    const linea = linea0.trim();
    if (/saldo\s+(anterior|inicial)/i.test(linea)) {
      const nums = linea.match(NUM); if (nums) { saldoAnt = parseMonto(nums[nums.length - 1]); saldoIni ??= saldoAnt; } continue;
    }
    const m = linea.match(/^(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s+(.*)$/);
    if (!m) continue;
    const fecha = parseFecha(m[1], anio);
    if (!fecha) continue;
    anio = Number(fecha.slice(0, 4));
    const resto = m[2];
    const nums = [...resto.matchAll(NUM)];
    const montos: number[] = []; let fin = resto.length, inicio = resto.length;
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i];
      if (resto.slice(n.index! + n[0].length, fin).replace('$', '').trim()) break;
      montos.push(parseMonto(n[0])); inicio = fin = n.index!;
      if (montos.length === 3) break;
    }
    if (!montos.length) continue;
    const desc = resto.slice(0, inicio).trim();
    const saldo = montos.length >= 2 ? montos[0] : null;
    const monto = Math.abs(montos.length >= 2 ? montos[1] : montos[0]);
    const doc = montos.length === 3 ? String(Math.trunc(montos[2])) : '';
    let cargo = 0, abono = 0;
    if (saldo !== null && saldoAnt !== null) {
      if (Math.abs(saldoAnt - monto - saldo) < 1) cargo = monto; else if (Math.abs(saldoAnt + monto - saldo) < 1) abono = monto;
    }
    if (!cargo && !abono) { if (PAL_ABONO.some(k => normalizar(desc).includes(k))) abono = monto; else cargo = monto; }
    if (monto) movs.push({ fecha, descripcion: desc, documento: doc, cargo, abono, saldo });
    if (saldo !== null) saldoAnt = saldo;
  }
  return { movs, saldoIni, saldoFin: null as number | null, nota: `${movs.length} líneas con fecha y monto reconocidas.` };
}

export function leerCartola(archivo: string, c: Contenido, banco: string): ResultadoCartola {
  const avisos: string[] = [];
  let r = null;
  for (const h of c.hojas) { r = movimientosDeGrilla(h.filas); if (r && r.movs.length) break; }
  if ((!r || !r.movs.length) && c.texto) r = movimientosDeTexto(c.texto);
  const cuenta = detectarCuenta(c.texto);
  if (!r || !r.movs.length) return { movimientos: [], cuenta, saldoInicial: null, saldoFinal: null, cuadra: null, avisos,
    mensaje: 'No se encontraron movimientos: falta la fila de encabezados (Fecha y Cargo/Abono o Monto) o líneas con fecha y monto.' };

  // Saldos: si la cartola no trae columna de saldo, se calcula desde el saldo inicial
  let saldoIni = r.saldoIni;
  const primero = r.movs[0];
  if (saldoIni === null && primero.saldo !== null) saldoIni = primero.saldo - primero.abono + primero.cargo;
  let corrido = saldoIni, descuadres = 0;
  for (const m of r.movs) {
    if (corrido !== null) corrido = corrido + m.abono - m.cargo;
    if (m.saldo === null) m.saldo = corrido;
    else if (corrido !== null && Math.abs(m.saldo - corrido) > 1) { descuadres++; corrido = m.saldo; }
  }
  const saldoFinal = r.movs[r.movs.length - 1].saldo;
  let cuadra: boolean | null = descuadres === 0 ? true : false;
  if (r.saldoFin !== null) {
    cuadra = cuadra && saldoFinal !== null && Math.abs(saldoFinal - r.saldoFin) <= 1;
    if (cuadra) avisos.push('El saldo calculado cuadra con el saldo final del encabezado de la cartola.');
  }
  if (descuadres) avisos.push(`${descuadres} movimientos no calzan con el saldo de la línea anterior: revisa si faltan líneas o hay montos mal leídos.`);

  // Clave: cuenta, fecha, monto, documento, glosa y saldo. Con saldo se distinguen dos cargos idénticos del mismo día.
  const vistos = new Map<string, number>();
  const movimientos: Movimiento[] = r.movs.map(m => {
    const base = [cuenta, m.fecha, m.abono - m.cargo, m.documento, normalizar(m.descripcion), m.saldo ?? ''].join('|');
    const n = (vistos.get(base) ?? 0) + 1; vistos.set(base, n);
    return { ...m, clave: n > 1 ? `${base}|${n}` : base, cuenta, banco, archivo, estado: 'pendiente' as const };
  });
  const abonos = movimientos.reduce((a, m) => a + m.abono, 0), cargos = movimientos.reduce((a, m) => a + m.cargo, 0);
  const $ = (n: number) => '$' + Math.round(n).toLocaleString('de-DE');
  return { movimientos, cuenta, saldoInicial: saldoIni, saldoFinal, cuadra, avisos,
    mensaje: `${movimientos.length} movimientos: entran ${$(abonos)} y salen ${$(cargos)}` + (saldoFinal !== null ? `; saldo final ${$(saldoFinal)}` : '') + '.' };
}
