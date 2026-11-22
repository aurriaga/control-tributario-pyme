// Libro de remuneraciones mensual, informe anual de boletas de honorarios recibidas (SII) y aporte del empleador.
// Equivale a ImportarLibroRemuneraciones e ImportarInformeHonorarios de modRemuneraciones.bas.
import type { Contenido } from './extraer';
import { normalizar, parseMonto, periodoEnTexto } from './texto';
import { formatearRUT, rutValido } from './rut';
import { rutsConDV } from './cruce';
import type { Movimiento } from './cartola';

export interface Trabajador {
  rut: string; nombre: string; cargo: string; contrato: string; diasTrabajados: number; diasLicencia: number;
  baseImponible: number; totalTributable: number; noImponible: number; totalHaberes: number;
  afp: number; salud: number; cesantia: number; impuestoUnico: number; anticipos: number; otrosDescuentos: number;
  totalDescuentos: number; liquido: number; control: string;          // "OK" o "Revisar: ..."
}
export interface LibroRemuneraciones {
  periodo: string; rutEmpresa: string; archivo: string; trabajadores: Trabajador[];
  totalHaberes: number; totalLiquido: number; cuadraTotales: boolean | null;
}
export interface MesHonorarios { periodo: string; vigentes: number; anuladas: number; bruto: number; retencionTerceros: number; retencionEmisor: number; liquido: number; control: string }
export interface InformeHonorarios { anio: string; rutEmpresa: string; archivo: string; meses: MesHonorarios[]; cuadraTotales: boolean | null }

type Resultado<T> = { dato: T | null; mensaje: string; error: string | null };
const $ = (n: number) => '$' + Math.round(n).toLocaleString('de-DE');

function rutDelEncabezado(texto: string): string {
  const m = texto.match(/R\.?U\.?T\.?\s*(?:empresa|empleador)?\s*[:.]?\s*(\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK])/i);
  return m ? formatearRUT(m[1].replace(/\s/g, '')) : '';
}

const COL: Record<string, string[]> = {
  rut: ['rut', 'ruttrabajador', 'rutdeltrabajador', 'rutempleado'],
  th: ['totalhaberes', 'haberestotales', 'totalhaber', 'totalremuneracion'],
  liq: ['liquidoapago', 'liquido', 'liquidoapagar', 'alcanceliquido', 'totalliquido', 'sueldoliquido', 'liquidopagado'],
  afp: ['afp', 'cotizacionafp', 'previsionafp', 'cotizacionobligatoriaafp'],
  bi: ['baseimponible', 'totalimponible', 'imponible', 'rentaimponible', 'remuneracionimponible'],
  td: ['totaldescuentos', 'descuentostotales', 'totaldescuento'], trib: ['totaltributable'],
  noimp: ['totalhaberesnoimp', 'totalhaberesnoimponibles', 'haberesnoimponibles', 'noimponible'],
  dias: ['diastrabajados'], lic: ['diaslicencia'], cargo: ['cargo'], cont: ['tipodecontrato', 'contrato'],
  ap: ['apellidopaterno'], am: ['apellidomaterno'], nom: ['nombres', 'nombre'],
};

export function leerLibroRemuneraciones(archivo: string, c: Contenido): Resultado<LibroRemuneraciones> {
  const falla = (e: string) => ({ dato: null, mensaje: e, error: e });
  const g = c.hojas.find(h => normalizar(h.filas.slice(0, 8).flat().join(' ')).includes('libroderemuneraciones'))?.filas ?? c.hojas[0]?.filas;
  if (!g) return falla('No tiene hojas con datos.');
  const cab = g.slice(0, 6).map(f => f.join(' ')).join('\n');
  let periodo = '';
  let m = cab.match(/PER[IÍ]ODO[^0-9|\n]*([0-9]{1,2})\s*[/-]\s*(20[0-9]{2})/i);
  if (m) periodo = `${m[2]}-${m[1].padStart(2, '0')}`;
  else { m = cab.match(/PER[IÍ]ODO[^0-9|\n]*(20[0-9]{2})\s*[/-]?\s*([0-9]{1,2})/i); if (m) periodo = `${m[1]}-${m[2].padStart(2, '0')}`; }
  periodo ||= periodoEnTexto(archivo.toUpperCase());
  if (!periodo) return falla('No se encontró el período (PERIODO TRIBUTARIO: MM/AAAA).');
  const rutEmpresa = rutDelEncabezado(cab);

  const fh = g.slice(0, 30).findIndex(f => f.some(x => COL.rut.includes(normalizar(x))));
  if (fh < 0) return falla('No se encontró la fila de encabezados (columna R.U.T.).');
  const h = g[fh].map(normalizar);
  const idx = (k: string) => h.findIndex(x => COL[k].includes(x));
  const i = Object.fromEntries(Object.keys(COL).map(k => [k, idx(k)])) as Record<string, number>;
  if (i.rut < 0 || i.th < 0 || i.liq < 0) return falla(`Faltan columnas obligatorias (RUT, TOTAL HABERES y LIQUIDO A PAGO). Columnas encontradas: ${h.filter(Boolean).join(', ')}.`);
  // Descuentos: desde AFP hasta antes de BASE IMPONIBLE (orden habitual) o, en otro orden, los que por su nombre lo son
  const esDesc = h.map((x, j) => {
    let d = false;
    if (i.afp >= 0 && i.bi >= 0 && i.afp < i.bi) d = j >= i.afp && j < i.bi;
    else if (![i.td, i.th, i.liq, i.bi].includes(j)) d = x === 'afp' || x.startsWith('apv') || ['cotizacion', 'salud', 'cesantia', 'anticipo', 'prestamo'].some(k => x.includes(k)) || x.startsWith('descuento');
    return d || (x.includes('impuesto') && j !== i.td);
  });
  const v = (f: string[], j: number) => (j < 0 ? 0 : parseMonto(f[j] ?? ''));
  const t = (f: string[], j: number) => (j < 0 ? '' : (f[j] ?? '').trim());
  const trabajadores: Trabajador[] = [];
  let filaTot = -1;
  for (let r = fh + 1; r < g.length; r++) {
    const f = g[r];
    if (f.some(x => normalizar(x).startsWith('totales'))) { filaTot = r; break; }
    const rut = t(f, i.rut);
    if (!rut || !rutValido(rut)) continue;
    let afp = 0, salud = 0, ces = 0, iusc = 0, antic = 0, otros = 0, sumD = 0;
    h.forEach((x, j) => {
      if (!esDesc[j]) return;
      const val = v(f, j); sumD += val;
      if (x === 'afp' || x.startsWith('apv')) afp += val;
      else if (x.includes('salud')) salud += val;
      else if (x.includes('cesantia')) ces += val;
      else if (x.includes('impuesto')) iusc += val;
      else if (x.includes('anticipo')) antic += val;
      else otros += val;
    });
    const tH = v(f, i.th), tL = v(f, i.liq), errores: string[] = [];
    if (i.td >= 0 && Math.abs(sumD - v(f, i.td)) >= 1) errores.push('descuentos no suman el total');
    if (Math.abs(tH - sumD - tL) >= 1) errores.push('haberes − descuentos ≠ líquido');
    if (i.noimp >= 0 && i.bi >= 0 && Math.abs(v(f, i.bi) + v(f, i.noimp) - tH) >= 1) errores.push('imponible + no imponible ≠ total haberes');
    trabajadores.push({ rut: formatearRUT(rut), nombre: [t(f, i.nom), t(f, i.ap), t(f, i.am)].filter(Boolean).join(' '), cargo: t(f, i.cargo), contrato: t(f, i.cont),
      diasTrabajados: v(f, i.dias), diasLicencia: v(f, i.lic), baseImponible: v(f, i.bi), totalTributable: v(f, i.trib), noImponible: v(f, i.noimp),
      totalHaberes: tH, afp, salud, cesantia: ces, impuestoUnico: iusc, anticipos: antic, otrosDescuentos: otros, totalDescuentos: sumD, liquido: tL,
      control: errores.length ? `Revisar: ${errores.join('; ')}` : 'OK' });
  }
  if (!trabajadores.length) return falla('No tiene trabajadores con RUT válido.');
  // Fila de totales: con la palabra TOTALES o la primera fila sin RUT y con total de haberes después de los trabajadores
  if (filaTot < 0) {
    let vistos = 0;
    for (let r = fh + 1; r < g.length; r++) {
      const rut = t(g[r], i.rut);
      if (rut) { if (rutValido(rut)) vistos++; } else if (vistos > 0 && v(g[r], i.th) > 0) { filaTot = r; break; }
    }
  }
  const totalHaberes = trabajadores.reduce((a, x) => a + x.totalHaberes, 0), totalLiquido = trabajadores.reduce((a, x) => a + x.liquido, 0);
  const cuadraTotales = filaTot < 0 ? null : Math.abs(v(g[filaTot], i.th) - totalHaberes) < 1 && Math.abs(v(g[filaTot], i.liq) - totalLiquido) < 1;
  const malas = trabajadores.filter(x => x.control !== 'OK').length;
  return { error: null, dato: { periodo, rutEmpresa, archivo, trabajadores, totalHaberes, totalLiquido, cuadraTotales },
    mensaje: `${trabajadores.length} trabajadores, haberes ${$(totalHaberes)}, líquido ${$(totalLiquido)}.`
      + (cuadraTotales === true ? ' Cuadra con la fila TOTALES del libro.' : cuadraTotales === false ? ' ATENCIÓN: no cuadra con la fila TOTALES del libro.' : '')
      + (malas ? ` ${malas} filas para revisar.` : '') };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Informe anual de boletas de honorarios recibidas del SII: mes, vigentes, anuladas, bruto, retención de terceros,
 *  retención del contribuyente y líquido. */
export function leerHonorarios(archivo: string, c: Contenido): Resultado<InformeHonorarios> {
  const falla = (e: string) => ({ dato: null, mensaje: e, error: e });
  const g = c.hojas[0]?.filas ?? [];
  const todo = g.map(f => f.join(' ')).join('\n') + '\n' + c.texto;
  if (!normalizar(todo).includes('honorariobruto') && !normalizar(todo).includes('honorarios') || !normalizar(todo).includes('retencion'))
    return falla('No parece el informe de boletas de honorarios recibidas (faltan HONORARIO BRUTO y RETENCIÓN).');
  const anio = todo.match(/A.{1,2}O\s+(20\d\d)/i)?.[1] ?? todo.match(/(20\d\d)/)?.[1] ?? '';
  if (!anio) return falla('No se encontró el año del informe.');
  const meses: MesHonorarios[] = [];
  let cuadraTotales: boolean | null = null;
  for (const f of g) {
    const primera = normalizar(f[0] ?? '');
    const mes = MESES.indexOf(primera) + 1;
    if (mes > 0 && f.length >= 7) {
      const [vig, anu, bru, rt, re, liq] = f.slice(1, 7).map(parseMonto);
      meses.push({ periodo: `${anio}-${String(mes).padStart(2, '0')}`, vigentes: vig, anuladas: anu, bruto: bru, retencionTerceros: rt, retencionEmisor: re, liquido: liq,
        control: Math.abs(bru - rt - re - liq) >= 1 ? 'Revisar: bruto − retenciones ≠ líquido' : 'OK' });
    } else if (primera.startsWith('totales') && meses.length) {
      const s = (k: keyof MesHonorarios) => meses.reduce((a, x) => a + (x[k] as number), 0);
      cuadraTotales = Math.abs(parseMonto(f[3]) - s('bruto')) < 1 && Math.abs(parseMonto(f[4]) - s('retencionTerceros')) < 1 && Math.abs(parseMonto(f[6]) - s('liquido')) < 1;
    }
  }
  if (!meses.length) return falla('No se encontraron los meses (ENERO a DICIEMBRE).');
  const sb = meses.reduce((a, x) => a + x.bruto, 0), st = meses.reduce((a, x) => a + x.retencionTerceros, 0), se = meses.reduce((a, x) => a + x.retencionEmisor, 0);
  return { error: null, dato: { anio, rutEmpresa: rutDelEncabezado(todo), archivo, meses, cuadraTotales },
    mensaje: `Honorarios ${anio}: bruto ${$(sb)}, retención de terceros ${$(st)}, retención del emisor ${$(se)}.`
      + (cuadraTotales === true ? ' Cuadra con la fila Totales del informe.' : cuadraTotales === false ? ' ATENCIÓN: los meses no suman la fila Totales del informe.' : '') };
}

// ------------------------------------------------------------------ resumen mensual del personal
export interface MesPersonal {
  periodo: string; trabajadores: number; haberes: number; cotizaciones: number; impuestoUnico: number; liquido: number;
  pagoPrevired: number | null;     // pagos a PREVIRED del mes siguiente en el banco
  aporteEmpleador: number | null;  // PREVIRED − cotizaciones del libro (SIS, cesantía del empleador, mutual)
  honorariosBruto: number; retencionHonorarios: number; filasRevisar: number; cuadraTotales: boolean | null;
}

const mesSiguiente = (p: string) => { const [y, m] = p.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

/** El aporte del empleador se estima con el pago a PREVIRED del mes siguiente (que incluye las cotizaciones del trabajador)
 *  menos las cotizaciones descontadas en el libro. */
export function resumenPersonal(libros: LibroRemuneraciones[], honorarios: MesHonorarios[], movs: Movimiento[]): MesPersonal[] {
  const periodos = [...new Set([...libros.map(l => l.periodo), ...honorarios.filter(h => h.bruto || h.retencionTerceros).map(h => h.periodo)])].sort();
  return periodos.map(p => {
    const l = libros.find(x => x.periodo === p), h = honorarios.find(x => x.periodo === p);
    const tr = l?.trabajadores ?? [];
    const cotizaciones = tr.reduce((a, x) => a + x.afp + x.salud + x.cesantia, 0);
    const pagos = movs.filter(m => m.cargo > 0 && m.fecha.startsWith(mesSiguiente(p)) && /previred/i.test(m.descripcion));
    const previred = pagos.length ? pagos.reduce((a, m) => a + m.cargo, 0) : null;
    return { periodo: p, trabajadores: tr.length, haberes: tr.reduce((a, x) => a + x.totalHaberes, 0), cotizaciones,
      impuestoUnico: tr.reduce((a, x) => a + x.impuestoUnico, 0), liquido: tr.reduce((a, x) => a + x.liquido, 0),
      pagoPrevired: previred, aporteEmpleador: l && previred !== null ? Math.max(0, previred - cotizaciones) : null,
      honorariosBruto: h?.bruto ?? 0, retencionHonorarios: h?.retencionTerceros ?? 0,
      filasRevisar: tr.filter(x => x.control !== 'OK').length, cuadraTotales: l?.cuadraTotales ?? null };
  });
}

/** Meses sin libro entre el primero y el último cargados. */
export function librosFaltantes(libros: LibroRemuneraciones[]): string[] {
  const ps = libros.map(l => l.periodo).sort();
  if (!ps.length) return [];
  const faltan: string[] = [];
  for (let p = ps[0]; p < ps[ps.length - 1]; p = mesSiguiente(p)) if (!ps.includes(p)) faltan.push(p);
  return faltan;
}

/** Cuerpos de RUT de los trabajadores: los cargos del banco con ese RUT en la glosa son pagos al personal. */
export function cuerposTrabajadores(libros: LibroRemuneraciones[]): Set<string> {
  return new Set(libros.flatMap(l => l.trabajadores.map(t => String(Number(t.rut.replace(/\./g, '').split('-')[0])))));
}
export const esPagoAlPersonal = (glosa: string, trabajadores: Set<string>) =>
  /previred/i.test(glosa) || rutsConDV(glosa).some(c => trabajadores.has(c));
