// Panel del mes (lo que pasó y lo que falta) y archivo de respaldo del proyecto.
import type { Documento } from './rcv';
import type { Movimiento } from './cartola';
import { cuadratura, f29PorPeriodo, mesVecino, totalesRCV, type EstadoCuadratura, type F29 } from './f29';
import { periodoDe } from './resumen';
import type { LibroRemuneraciones } from './remuneraciones';

// ------------------------------------------------------------------ panel del mes
export interface Pendiente { que: string; hecho: boolean; detalle: string }
export interface PanelMes {
  periodo: string;
  ventas: number; compras: number; docsVenta: number; docsCompra: number; ivaDebito: number; ivaCredito: number;
  f29: { cargado: boolean; estado: EstadoCuadratura | null; totalPagado: number | null; vence: string };
  banco: { movimientos: number; entra: number; sale: number; saldo: number | null; identificados: number };
  haberes: number | null;
  pendientes: Pendiente[];
}

/** Meses con algún dato (documentos, F29, banco o libros), del más reciente al más antiguo. */
export function mesesConDatos(docs: Documento[], f29s: F29[], movs: Movimiento[], libros: LibroRemuneraciones[]): string[] {
  return [...new Set([...docs.map(periodoDe), ...f29s.map(f => f.periodo), ...movs.map(m => m.fecha.slice(0, 7)), ...libros.map(l => l.periodo)])]
    .filter(p => /^\d{4}-\d{2}$/.test(p)).sort().reverse();
}

export function panelMes(periodo: string, docs: Documento[], f29s: F29[], movs: Movimiento[], libros: LibroRemuneraciones[]): PanelMes {
  const vig = docs.filter(d => d.estado !== 'ANULADA');
  const t = totalesRCV(vig, periodo);
  const delMes = vig.filter(d => periodoDe(d) === periodo);
  const signo = (d: Documento) => (d.tipoDoc === 60 || d.tipoDoc === 61 || d.tipoDoc === 112 ? -1 : 1);
  const neto = (libro: string) => delMes.filter(d => d.libro === libro && !(d.tipoDoc === 40 || d.tipoDoc === 43)).reduce((s, d) => s + signo(d) * (d.neto + d.exento), 0);
  const f = f29PorPeriodo(f29s).get(periodo);
  const fila = cuadratura(vig, f29s).find(x => x.periodo === periodo);
  const mm = movs.filter(m => m.fecha.startsWith(periodo)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const libro = libros.find(l => l.periodo === periodo);
  const hayCartolas = movs.length > 0, hayLibros = libros.length > 0;
  const ultMov = movs.map(m => m.fecha).sort().pop() ?? '';
  const pendientes: Pendiente[] = [
    { que: 'RCV de ventas', hecho: t.docsVenta > 0, detalle: t.docsVenta ? `${t.docsVenta} documentos` : 'Sin ventas del mes: descarga el RCV de ventas del SII (si no hubo ventas, ignóralo).' },
    { que: 'RCV de compras', hecho: t.docsCompra > 0, detalle: t.docsCompra ? `${t.docsCompra} documentos` : 'Sin compras del mes: descarga el RCV de compras del SII.' },
    { que: 'F29 declarado', hecho: !!f, detalle: f ? `folio ${f.folio}${fila ? `, ${fila.estado.toLowerCase()} con el RCV` : ''}` : `Vence el 20 de ${nombreMes(mesVecino(periodo, 1))}. Carga el PDF cuando lo declares.` },
    { que: 'Cartola del banco', hecho: mm.length > 0, detalle: mm.length ? `${mm.length} movimientos` : hayCartolas && ultMov < `${periodo}-01` ? 'Falta la cartola de este mes.' : 'Sin movimientos del banco en el mes.' },
    ...(hayLibros ? [{ que: 'Libro de remuneraciones', hecho: !!libro, detalle: libro ? `${libro.trabajadores.length} trabajadores` : 'Falta el libro de remuneraciones del mes.' }] : []),
  ];
  return {
    periodo, ventas: neto('VENTA'), compras: neto('COMPRA'), docsVenta: t.docsVenta, docsCompra: t.docsCompra, ivaDebito: t.debito, ivaCredito: t.credito,
    f29: { cargado: !!f, estado: fila?.estado ?? null, totalPagado: f ? f.codigos['91'] ?? null : null, vence: `${mesVecino(periodo, 1)}-20` },
    banco: { movimientos: mm.length, entra: mm.reduce((s, m) => s + m.abono, 0), sale: mm.reduce((s, m) => s + m.cargo, 0),
      saldo: [...mm].reverse().find(m => m.saldo !== null)?.saldo ?? null, identificados: mm.filter(m => m.estado !== 'pendiente').length },
    haberes: libro ? libro.trabajadores.reduce((s, x) => s + x.totalHaberes, 0) : null,
    pendientes,
  };
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

// ------------------------------------------------------------------ respaldo
export const CLAVES_RESPALDO = ['ctp.empresa', 'ctp.documentos', 'ctp.f29', 'ctp.movimientos', 'ctp.reglas', 'ctp.libros', 'ctp.honorarios',
  'ctp.utm', 'ctp.tasaPPM', 'ctp.contabilidad'] as const;
const FIRMA = 'control-tributario-pyme';

export interface Respaldo { app: typeof FIRMA; version: 1; creado: string; empresa: { rut: string; razonSocial: string }; datos: Record<string, unknown> }

export function crearRespaldo(datos: Record<string, unknown>, ahora = new Date()): Respaldo {
  const empresa = datos['ctp.empresa'] as Respaldo['empresa'];
  return { app: FIRMA, version: 1, creado: ahora.toISOString(), empresa, datos: Object.fromEntries(CLAVES_RESPALDO.filter(k => datos[k] !== undefined).map(k => [k, datos[k]])) };
}

export type LecturaRespaldo = { ok: true; respaldo: Respaldo; resumen: string } | { ok: false; error: string };

/** Valida un archivo de respaldo antes de reemplazar los datos del navegador. */
export function leerRespaldo(texto: string): LecturaRespaldo {
  let r: Partial<Respaldo>;
  try { r = JSON.parse(texto.replace(/^\uFEFF/, '')); } catch { return { ok: false, error: 'El archivo no es un respaldo de la app (no se pudo leer).' }; }
  if (r?.app !== FIRMA || !r.datos || typeof r.datos !== 'object') return { ok: false, error: 'El archivo no es un respaldo de Control Tributario.' };
  if (r.version !== 1) return { ok: false, error: `Respaldo de una versión que esta app no conoce (${String(r.version)}).` };
  if (!r.empresa?.rut) return { ok: false, error: 'El respaldo no dice de qué empresa es.' };
  const n = (k: string) => (Array.isArray(r.datos![k]) ? (r.datos![k] as unknown[]).length : 0);
  const resumen = `${r.empresa.razonSocial} (RUT ${r.empresa.rut}), guardado el ${r.creado?.slice(0, 10).split('-').reverse().join('-') ?? '?'}: `
    + `${n('ctp.documentos')} documentos, ${n('ctp.f29')} F29, ${n('ctp.movimientos')} movimientos del banco, ${n('ctp.libros')} libros de remuneraciones.`;
  return { ok: true, respaldo: r as Respaldo, resumen };
}
