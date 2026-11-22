// Formulario 29: lectura del PDF del SII, cuadratura del IVA contra el RCV y borrador del mes.
// Equivale a leer_f29/cuadratura (sii.py) y a la hoja "Borrador F29" (modContabilidad.bas).
import type { Documento } from './rcv';
import { parseMonto } from './texto';
import { formatearRUT } from './rut';
import { periodoDe } from './resumen';

export interface F29 {
  periodo: string;                // AAAA-MM
  folio: string;
  rut: string;
  fechaPresentacion: string;      // dd/mm/aaaa
  tipo: 'Primitiva' | 'Rectificatoria' | '';
  codigos: Record<string, number>;
  archivo: string;
}

/** Lee un F29 desde el texto de su PDF ("Formulario compacto" del SII): casilleros [07] folio, [03] RUT, [15] período
 *  y líneas "código   glosa   valor". La tasa del PPM (115) viene como "1" = 1%. */
export function leerF29(texto: string, archivo: string): F29 | null {
  const f: F29 = { periodo: '', folio: '', rut: '', fechaPresentacion: '', tipo: '', codigos: {}, archivo };
  const per = texto.match(/\[15\]\s*(20\d\d)(0[1-9]|1[0-2])/);
  if (!per) return null;
  f.periodo = `${per[1]}-${per[2]}`;
  f.folio = texto.match(/\[07\]\s*(\d+)/)?.[1] ?? '';
  const rut = texto.match(/\[03\]\s*([\d.]+-[\dkK])/)?.[1];
  f.rut = rut ? formatearRUT(rut) : '';
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*(\d{2,4})\s{2,}(.*?[A-Za-zÁÉÍÓÚÑáéíóúñ].*?)\s{2,}(-?[\d.]+(?:,\d+)?)\s*$/);
    if (m && !(m[1] in f.codigos)) f.codigos[m[1]] = parseMonto(m[3]);
    const total = linea.match(/TOTAL A PAGAR DENTRO DEL PLAZO LEGAL\s+91\s+(-?[\d.]+)/i);
    if (total) f.codigos['91'] = parseMonto(total[1]);
  }
  if ('115' in f.codigos) f.codigos['115'] = f.codigos['115'] / 100;
  const fechas = texto.match(/\b\d{2}\/\d{2}\/20\d\d\b/g);
  f.fechaPresentacion = fechas ? fechas[fechas.length - 1] : '';
  f.tipo = /rectificatoria/i.test(texto) ? 'Rectificatoria' : /primitiva/i.test(texto) ? 'Primitiva' : '';
  return f;
}

/** Revisa la aritmética del propio F29 declarado (como control_f29 de sii.py). */
export function controlF29(f: F29): string[] {
  const c = (k: string) => f.codigos[k] ?? 0, tiene = (k: string) => k in f.codigos;
  const obs: string[] = [];
  if (tiene('537')) {
    if (Math.abs(Math.max(0, c('538') - c('537')) - c('089')) > 1) obs.push('El IVA determinado (089) no es débitos (538) menos créditos (537).');
    if (Math.abs(Math.max(0, c('537') - c('538')) - c('077')) > 1) obs.push('El remanente (077) no es créditos (537) menos débitos (538).');
  }
  if (tiene('547') && tiene('91') && Math.abs(c('547') - c('91')) > 1) obs.push('El total a pagar (91) no coincide con el total determinado (547).');
  if (tiene('563') && tiene('062') && Math.abs(Math.round(c('563') * c('115')) - c('062')) > 1) obs.push('El PPM (062) no es la base (563) por la tasa (115).');
  return obs;
}

/** F29 vigente de cada período: si hay rectificatorias, la de fecha de presentación más reciente. */
export function f29PorPeriodo(f29s: F29[]): Map<string, F29> {
  const clave = (f: F29) => f.fechaPresentacion.split('/').reverse().join('');
  const m = new Map<string, F29>();
  for (const f of f29s) { const p = m.get(f.periodo); if (!p || clave(f) >= clave(p)) m.set(f.periodo, f); }
  return m;
}

const signo = (d: Documento) => (d.tipoDoc === 61 || d.tipoDoc === 60 ? -1 : 1);
const esLiquidacion = (d: Documento) => d.libro === 'COMPRA' && (d.tipoDoc === 40 || d.tipoDoc === 43);

export interface TotalesRCV { debito: number; credito: number; base: number; docsVenta: number; docsCompra: number }

/** Débito, crédito y base del PPM del RCV de un período. Las liquidaciones-factura recibidas (40 y 43) son ventas
 *  hechas por un mandatario: su IVA va al débito y su neto a la base del PPM, no al crédito. */
export function totalesRCV(docs: Documento[], periodo: string): TotalesRCV {
  const t: TotalesRCV = { debito: 0, credito: 0, base: 0, docsVenta: 0, docsCompra: 0 };
  for (const d of docs) {
    if (periodoDe(d) !== periodo) continue;
    const s = signo(d);
    if (d.libro === 'VENTA') { t.debito += s * d.iva; t.base += s * (d.neto + d.exento); t.docsVenta++; }
    else if (esLiquidacion(d)) { t.debito += d.iva; t.base += d.neto + d.exento; t.docsCompra++; }
    else { t.credito += s * d.iva; t.docsCompra++; }
  }
  return t;
}

export type EstadoCuadratura = 'Cuadra' | 'Diferencias' | 'Falta F29' | 'Falta RCV';
export interface FilaCuadratura {
  periodo: string; estado: EstadoCuadratura; detalle: string;
  debitoRCV: number; debitoF29: number | null; creditoRCV: number; creditoF29: number | null; baseRCV: number; baseF29: number | null;
}

/** Compara mes a mes lo declarado en el F29 con el detalle del RCV: IVA al peso (tolerancia $1) y la base del PPM con
 *  hasta $10 por redondeo (el SII la calcula desde el débito; el RCV suma documento por documento). */
export function cuadratura(docs: Documento[], f29s: F29[]): FilaCuadratura[] {
  const porPer = f29PorPeriodo(f29s);
  const periodos = [...new Set([...docs.map(periodoDe), ...porPer.keys()])].sort();
  const $ = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('de-DE');
  return periodos.map(p => {
    const t = totalesRCV(docs, p), f = porPer.get(p);
    const c = (k: string) => f?.codigos[k] ?? 0;
    const fila: FilaCuadratura = { periodo: p, estado: 'Cuadra', detalle: '', debitoRCV: t.debito, creditoRCV: t.credito, baseRCV: t.base,
      debitoF29: f ? c('538') : null, creditoF29: f ? c('520') - c('528') : null, baseF29: f ? c('563') : null };
    if (!f) { fila.estado = 'Falta F29'; fila.detalle = 'Hay documentos del mes, pero no se ha cargado su F29.'; return fila; }
    if (t.docsVenta + t.docsCompra === 0) { fila.estado = 'Falta RCV'; fila.detalle = 'Hay F29, pero no se han cargado los RCV del mes.'; return fila; }
    const dd = fila.debitoF29! - t.debito, dc = fila.creditoF29! - t.credito, db = fila.baseF29! - t.base;
    const partes = [Math.abs(dd) > 1 && `débito ${$(dd)}`, Math.abs(dc) > 1 && `crédito ${$(dc)}`, Math.abs(db) > 10 && `base del PPM ${$(db)}`].filter(Boolean);
    if (partes.length) { fila.estado = 'Diferencias'; fila.detalle = `El F29 difiere del RCV en: ${partes.join(', ')}.`; }
    else fila.detalle = 'El débito, el crédito y la base del PPM declarados coinciden con el RCV.';
    return fila;
  });
}

// UTM por mes (fuente: SII, valores UTM). Se puede completar o corregir desde la pantalla.
export const UTM_SII: Record<string, number> = {
  '2025-12': 69542, '2026-01': 69751, '2026-02': 69611, '2026-03': 69889, '2026-04': 69889, '2026-05': 70588,
  '2026-06': 71506, '2026-07': 71649, '2026-08': 71649, '2026-09': 71721, '2026-10': 72151,
};

export const mesVecino = (p: string, d: number) => {
  const [y, m] = p.split('-').map(Number); const f = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}`;
};

export interface LineaBorrador { codigo: string; concepto: string; borrador: number | null; declarado: number | null; nota?: string; total?: boolean }
export interface Borrador { periodo: string; lineas: LineaBorrador[]; vence: string; avisos: string[]; tasaPPM: number | null }

/** Borrador del F29 de un período con lo cargado: IVA del RCV, remanente del mes anterior reajustado por UTM y PPM. */
export function borradorF29(docs: Documento[], f29s: F29[], periodo: string, utm: Record<string, number>, tasaManual?: number): Borrador {
  const porPer = f29PorPeriodo(f29s);
  const decl = porPer.get(periodo), ant = porPer.get(mesVecino(periodo, -1));
  const t = totalesRCV(docs, periodo);
  const avisos: string[] = [];
  const remAnt = ant?.codigos['077'] ?? null;
  if (remAnt === null) avisos.push(`Falta el F29 de ${mesVecino(periodo, -1)}: sin él no se conoce el remanente del mes anterior y se usa cero.`);
  const uPer = utm[periodo], uSig = utm[mesVecino(periodo, 1)];
  // El SII lleva el remanente a UTM con 2 decimales y lo multiplica por la UTM del mes en que se declara
  const rem504 = remAnt === null ? 0 : uPer && uSig ? Math.round(Math.round((remAnt / uPer) * 100) / 100 * uSig) : remAnt;
  if (remAnt !== null && !(uPer && uSig)) avisos.push('Falta la UTM del mes o del siguiente: el remanente va sin reajustar.');
  const tasa = tasaManual ?? decl?.codigos['115'] ?? [...porPer.values()].filter(f => '115' in f.codigos).sort((a, b) => b.periodo.localeCompare(a.periodo))[0]?.codigos['115'] ?? null;
  if (tasa === null) avisos.push('Falta la tasa del PPM: indícala o carga un F29 anterior.');
  const iva089 = Math.max(0, t.debito - t.credito - rem504), rem077 = Math.max(0, t.credito + rem504 - t.debito);
  const ppm = tasa === null ? 0 : Math.round(t.base * tasa);
  const d = (k: string) => (decl ? decl.codigos[k] ?? null : null);
  const lineas: LineaBorrador[] = [
    { codigo: '538', concepto: 'Débito fiscal', borrador: t.debito, declarado: d('538') },
    { codigo: '520-528', concepto: 'Crédito fiscal del mes', borrador: t.credito, declarado: decl ? (d('520') ?? 0) - (d('528') ?? 0) : null },
    { codigo: '504', concepto: 'Remanente del mes anterior reajustado', borrador: rem504, declarado: d('504') },
    { codigo: '089', concepto: 'IVA determinado a pagar', borrador: iva089, declarado: d('089'), total: true },
    { codigo: '077', concepto: 'Remanente para el mes siguiente', borrador: rem077, declarado: d('077') },
    { codigo: '563', concepto: 'Base del PPM (ventas netas del mes)', borrador: t.base, declarado: d('563') },
    { codigo: '062', concepto: `PPM${tasa !== null ? ` (tasa ${(tasa * 100).toLocaleString('es-CL', { maximumFractionDigits: 3 })}%)` : ''}`, borrador: ppm, declarado: d('062'), total: true },
    { codigo: '151', concepto: 'Retención de honorarios', borrador: null, declarado: d('151'), nota: 'Se calculará con las boletas de honorarios (etapa de remuneraciones).' },
    { codigo: '048', concepto: 'Impuesto único de trabajadores', borrador: null, declarado: d('048'), nota: 'Se calculará con el libro de remuneraciones (etapa de remuneraciones).' },
    { codigo: '91', concepto: 'Total a pagar (estimado)', borrador: iva089 + ppm, declarado: d('91'), total: true },
  ];
  const [y, m] = mesVecino(periodo, 1).split('-');
  return { periodo, lineas, vence: `20/${m}/${y}`, avisos, tasaPPM: tasa };
}

export interface ResumenF29 { cargados: number; ivaPagado: number; ppm: number; totalPagado: number; cuadran: number; conDiferencias: string[]; sinF29: string[] }

/** Lo declarado en el año según los F29 cargados y cómo cuadran con el RCV. */
export function resumenF29(docs: Documento[], f29s: F29[], anio: number): ResumenF29 {
  const delAnio = [...f29PorPeriodo(f29s).values()].filter(f => f.periodo.startsWith(String(anio)));
  const suma = (k: string) => delAnio.reduce((a, f) => a + (f.codigos[k] ?? 0), 0);
  const filas = cuadratura(docs, f29s).filter(f => f.periodo.startsWith(String(anio)));
  return { cargados: delAnio.length, ivaPagado: suma('089'), ppm: suma('062'), totalPagado: suma('91'),
    cuadran: filas.filter(f => f.estado === 'Cuadra').length,
    conDiferencias: filas.filter(f => f.estado === 'Diferencias').map(f => f.periodo),
    sinF29: filas.filter(f => f.estado === 'Falta F29').map(f => f.periodo) };
}
