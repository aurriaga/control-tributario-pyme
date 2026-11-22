// Los 17 controles automáticos del Excel (hoja Controles): los 12 contables de contabilidad.ts más los de documentos,
// banco, UTM, remuneraciones y honorarios.
import type { Documento } from './rcv';
import type { Movimiento } from './cartola';
import { f29PorPeriodo, mesVecino, UTM_SII } from './f29';
import { periodoDe } from './resumen';
import { librosFaltantes } from './remuneraciones';
import { rutValido } from './rut';
import { contabilidad, type ConfigContable, type Control, type Entradas } from './contabilidad';

const $ = (n: number) => (Math.round(n) < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('de-DE');
const TOL = 1;

/** Observaciones de un documento (como la columna "Observaciones Control" del Excel). Vacío = OK. */
export function observacionesDocumento(d: Documento): string[] {
  const o: string[] = [];
  if (!rutValido(d.rutContraparte)) o.push(`RUT ${d.libro === 'VENTA' ? 'cliente' : 'proveedor'} inválido.`);
  const iva = d.iva + (d.libro === 'COMPRA' ? d.ivaNoRecuperable : 0);
  if (Math.abs(iva - Math.round(d.neto * 0.19)) > TOL) o.push('IVA distinto del 19% del neto.');
  if (Math.abs(d.neto + d.exento + iva + d.otrosImpuestos - d.total) > TOL) o.push('Neto + exento + IVA no suma el total.');
  return o;
}

/** Movimientos con la misma cuenta, fecha, monto y glosa que el saldo de la cartola no distingue. Si cada uno trae su
 *  propio saldo (distinto), el banco confirma que fueron operaciones separadas y no se marcan. */
export function posiblesDuplicados(movs: Movimiento[]): Movimiento[][] {
  const g = new Map<string, Movimiento[]>();
  for (const m of movs) { const k = `${m.cuenta}|${m.fecha}|${m.abono - m.cargo}|${m.descripcion.trim().toUpperCase()}`; g.set(k, [...(g.get(k) ?? []), m]); }
  return [...g.values()].filter(x => x.length > 1 && (x.some(m => m.saldo === null) || new Set(x.map(m => m.saldo)).size < x.length));
}

export interface Contexto extends Entradas { utm: Record<string, number> }

export function controlesGenerales(c: Contexto, cfg: ConfigContable): Control[] {
  const out = [...contabilidad(c, cfg).controles];
  const add = (nombre: string, estado: Control['estado'], resultado: string, accion = '') => out.push({ nombre, estado, resultado, accion: estado === 'OK' ? '' : accion });
  const docs = c.docs.filter(d => d.empresa === c.empresa && d.estado !== 'ANULADA');

  const conObs = docs.filter(d => observacionesDocumento(d).length);
  add('Documentos con observaciones', conObs.length ? 'Revisar' : 'OK',
    conObs.length ? `${conObs.length} documentos: ${conObs.slice(0, 3).map(d => `folio ${d.folio} ${d.razonSocial} (${observacionesDocumento(d).join(' ')})`).join('; ')}${conObs.length > 3 ? '…' : ''}`
      : 'Todos los documentos tienen RUT válido, IVA del 19% y total que cuadra.',
    'Revisa el documento en el SII; si no existe, anúlalo en la lista de documentos.');

  const dup = posiblesDuplicados(c.movs);
  add('Posibles duplicados en el banco', dup.length ? 'Pendiente' : 'OK',
    `${dup.reduce((s, g) => s + g.length, 0)} movimientos con la misma fecha, monto y glosa.`, 'Confirma con el banco si fueron operaciones distintas.');

  // UTM: la del mes de cada F29 con documentos y la del mes siguiente (reajuste del remanente)
  const utm = { ...UTM_SII, ...c.utm };
  const meses = [...new Set(docs.map(periodoDe))].filter(p => /^\d{4}-\d{2}$/.test(p));
  const faltan = [...new Set(meses.flatMap(p => [p, mesVecino(p, 1)]).filter(p => !(utm[p] > 0)))].sort();
  add('UTM al día (reajuste del remanente)', faltan.length ? 'Pendiente' : 'OK',
    faltan.length ? `Faltan las UTM de: ${faltan.join(', ')}. Sin ellas el borrador del F29 no reajusta el remanente.` : 'Están las UTM de todos los meses con documentos y de su mes siguiente.',
    'Ingrésalas en IVA y F29 > borrador (sii.cl > Valores y fechas > UTM).');

  // Remuneraciones: impuesto único del libro = 048 del F29; PREVIRED pagado el mes siguiente; meses sin libro
  const f29 = f29PorPeriodo(c.f29s);
  const libros = c.libros.filter(l => !l.rutEmpresa || l.rutEmpresa === c.empresa);
  if (libros.length) {
    const ultMov = c.movs.map(m => m.fecha).sort().pop() ?? '';
    const obs: string[] = [];
    for (const l of libros) {
      const iu = l.trabajadores.reduce((s, t) => s + t.impuestoUnico, 0), f = f29.get(l.periodo), sig = mesVecino(l.periodo, 1);
      if (f && Math.abs((f.codigos['048'] ?? 0) - iu) >= 1) obs.push(`${l.periodo}: impuesto único del libro ${$(iu)} distinto del F29 (048) ${$(f.codigos['048'] ?? 0)}`);
      if (ultMov >= `${mesVecino(sig, 1)}-01` && !c.movs.some(m => m.cargo > 0 && m.fecha.startsWith(sig) && /previred/i.test(m.descripcion)))
        obs.push(`${l.periodo}: no hay pago PREVIRED en ${sig}`);
    }
    const sinLibro = librosFaltantes(libros);
    add('Remuneraciones: libro, PREVIRED y F29 (048)', obs.length || sinLibro.length ? 'Revisar' : 'OK',
      `${libros.length} meses con libro.${sinLibro.length ? ` Falta el libro de ${sinLibro.join(', ')}.` : ''}${obs.length ? ` ${obs.join('; ')}.` : ' Impuesto único y PREVIRED calzan.'}`,
      'Carga el libro que falta y revisa el F29 o el pago a PREVIRED del mes indicado.');
  } else add('Remuneraciones: libro, PREVIRED y F29 (048)', 'Pendiente', 'No hay libros de remuneraciones cargados.', 'Si la empresa tiene trabajadores, carga sus libros mensuales.');

  if (c.honorarios.length) {
    const malos = c.honorarios.filter(h => f29.has(h.periodo) && Math.abs((f29.get(h.periodo)!.codigos['151'] ?? 0) - h.retencionTerceros) >= 1);
    const revisados = c.honorarios.filter(h => f29.has(h.periodo)).length;
    add('Honorarios: informe SII = F29 (151)', malos.length ? 'Revisar' : 'OK',
      malos.length ? `Retención distinta del F29 en ${malos.map(h => `${h.periodo} (informe ${$(h.retencionTerceros)}, F29 ${$(f29.get(h.periodo)!.codigos['151'] ?? 0)})`).join('; ')}.`
        : `${revisados} meses revisados: la retención de terceros calza con el código 151 de cada F29.`,
      'Revisa las boletas del mes o rectifica el F29.');
  } else add('Honorarios: informe SII = F29 (151)', 'Pendiente', 'No hay informe de boletas de honorarios cargado.', 'Descárgalo del SII (Boletas de honorarios > Informe anual de boletas recibidas).');
  return out;
}
