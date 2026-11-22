// Robot contable: aplica la "memoria contable" de una empresa (reglas y decisiones que el usuario ya tomó), detecta lo
// dudoso para preguntarlo y aprende cada respuesta. La memoria vive en un archivo JSON local del usuario (nunca en el
// repositorio): así el robot no vuelve a preguntar lo mismo y cada corrida parte donde quedó la anterior.
import type { Documento, Empresa } from './rcv';
import type { Movimiento } from './cartola';
import type { F29 } from './f29';
import type { LibroRemuneraciones, MesHonorarios } from './remuneraciones';
import { normalizar } from './texto';
import { calcularDV, formatearRUT, rutValido } from './rut';
import { CATEGORIAS, rutsConDV, rutsEnTexto, sugerirCruces, type Sugerencia } from './cruce';
import { configInicial, contabilidad, proveedoresSinCategoria, CLASIFICACION_CUENTA, PLAN_BASE, type Apertura, type ConfigContable, type Cuenta, type LineaManual } from './contabilidad';
import { observacionesDocumento } from './controles';

// ------------------------------------------------------------------ memoria
export type Lado = 'cargo' | 'abono' | 'ambos';
export interface ReglaRobot {
  id: string;
  tipo: 'glosa' | 'rut';     // glosa: la glosa (sin números ni espacios) contiene el patrón · rut: el RUT aparece en la glosa
  patron: string; lado: Lado; categoria: string;
  nota: string;              // por qué (criterio o norma), en palabras del usuario
  fuente: string; fecha: string; activa: boolean;
}
export interface MemoriaContable {
  app: 'control-tributario-pyme/robot'; version: 1;
  empresa: Empresa;
  politica: { aceptarCrucesAlta: boolean };
  reglas: ReglaRobot[];
  movimientos: Record<string, { categoria: string; nota?: string; fecha: string }>;       // clave del movimiento → clasificación
  conciliados: Record<string, { docs: string[]; fecha: string; fuente: string }>;          // clave del movimiento → documentos que paga o cobra
  pagos: Record<string, { fecha: string; consolidado?: boolean }>;                         // clave del documento → pagado o cobrado
  provCategoria: Record<string, string>;                                                   // RUT del proveedor → categoría de gasto
  docCategoria: Record<string, string>;                                                    // clave del documento → categoría propia
  anulados: Record<string, string>;                                                        // clave del documento → motivo
  apertura: Apertura | null;
  manuales: LineaManual[];
  plan?: Cuenta[];
  utm?: Record<string, number>;                                                            // UTM ingresadas a mano (las del SII ya vienen en la app)
  historial: { fecha: string; que: string }[];
}

export const memoriaNueva = (empresa: Empresa): MemoriaContable => ({
  app: 'control-tributario-pyme/robot', version: 1, empresa, politica: { aceptarCrucesAlta: true }, reglas: [], movimientos: {},
  conciliados: {}, pagos: {}, provCategoria: {}, docCategoria: {}, anulados: {}, apertura: null, manuales: [], historial: [],
});

export function validarMemoria(x: unknown): MemoriaContable {
  const m = x as MemoriaContable;
  if (!m || m.app !== 'control-tributario-pyme/robot' || m.version !== 1) throw new Error('El archivo no es una memoria contable del robot.');
  if (!m.empresa?.rut) throw new Error('La memoria no dice de qué empresa es.');
  return { ...memoriaNueva(m.empresa), ...m };
}

/** Glosa sin números, espacios ni símbolos (como el patrón de las reglas del Excel): "PAGO CUOTA CREDITO NO 12" → "pagocuotacreditono". */
export const patronGlosa = (s: string) => normalizar(s).replace(/\d/g, '');
const cuerpo = (rut: string) => String(Number(rut.replace(/[.\s]/g, '').split('-')[0]) || '');
const ladoDe = (m: Movimiento): 'cargo' | 'abono' => (m.abono > m.cargo ? 'abono' : 'cargo');

export function coincide(m: Movimiento, r: ReglaRobot): boolean {
  if (!r.activa || (r.lado !== 'ambos' && r.lado !== ladoDe(m))) return false;
  if (r.tipo === 'rut') return rutsEnTexto(m.descripcion).includes(cuerpo(r.patron));
  return !!r.patron && patronGlosa(m.descripcion).includes(r.patron);
}

// ------------------------------------------------------------------ aplicar la memoria
export interface Datos { docs: Documento[]; f29s: F29[]; movs: Movimiento[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[] }
export interface Aplicada { docs: Documento[]; movs: Movimiento[]; cfg: ConfigContable; cuenta: Record<string, number> }

export function aplicarMemoria(d: Datos, mem: MemoriaContable): Aplicada {
  const cuenta: Record<string, number> = { anulados: 0, pagos: 0, categorias: 0, conciliados: 0, decisiones: 0, reglas: 0 };
  // Un cruce confirmado deja cada documento pagado o cobrado con la fecha del movimiento del banco
  const fechaMov = new Map(d.movs.map(m => [m.clave, m.fecha]));
  const pagoPorCruce = new Map<string, string>();
  for (const [mov, c] of Object.entries(mem.conciliados)) if (fechaMov.has(mov)) c.docs.forEach(k => pagoPorCruce.set(k, fechaMov.get(mov)!));
  const docs = d.docs.map(x => {
    let y = x;
    if (mem.anulados[x.clave] !== undefined) { cuenta.anulados++; return { ...y, estado: 'ANULADA' as const, observacion: `Anulado: ${mem.anulados[x.clave]}` }; }
    const p = mem.pagos[x.clave] ?? (pagoPorCruce.has(x.clave) ? { fecha: pagoPorCruce.get(x.clave)! } : undefined);
    if (p) { cuenta.pagos++; y = { ...y, estado: y.libro === 'VENTA' ? 'COBRADA' : 'PAGADA', fechaPago: p.fecha, observacion: p.consolidado ? 'COBRO CONSOLIDADO' : y.observacion }; }
    if (mem.docCategoria[x.clave]) { cuenta.categorias++; y = { ...y, categoria: mem.docCategoria[x.clave] }; }
    return y;
  });
  const movs = d.movs.map(m => {
    const c = mem.conciliados[m.clave];
    if (c) { cuenta.conciliados++; return { ...m, estado: 'conciliado' as const, docs: c.docs }; }
    const k = mem.movimientos[m.clave];
    if (k) { cuenta.decisiones++; return { ...m, estado: 'clasificado' as const, categoria: k.categoria, regla: 'memoria' }; }
    if (m.estado !== 'pendiente') return m;
    const r = mem.reglas.find(x => coincide(m, x));
    if (r) { cuenta.reglas++; return { ...m, estado: 'clasificado' as const, categoria: r.categoria, regla: r.id }; }
    return m;
  });
  const cfg: ConfigContable = { ...configInicial(), plan: mem.plan ?? PLAN_BASE, clasificacion: { ...CLASIFICACION_CUENTA },
    provCategoria: mem.provCategoria, apertura: mem.apertura, manuales: mem.manuales };
  return { docs, movs, cfg, cuenta };
}

// ------------------------------------------------------------------ dudas
export type TipoDuda = 'movimiento' | 'cruce' | 'categoria' | 'documento';
export interface Duda {
  id: string; tipo: TipoDuda; pregunta: string; detalle: string; monto: number; fecha?: string;
  opciones: string[];                 // respuestas válidas (categorías del banco o de gasto)
  claves: string[];                   // movimientos o documentos a los que aplica la respuesta
  patron?: string; rut?: string;      // para aprender una regla general si el usuario lo pide
  sugerencia?: Sugerencia;
}

const $ = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString('de-DE');
const fechaTxt = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Lo que el robot no puede resolver solo, agrupado para preguntar lo mínimo: movimientos que irían a cuentas
 *  transitorias (agrupados por glosa parecida), cruces de confianza media o baja, proveedores sin categoría y
 *  documentos con observaciones. */
export function buscarDudas(a: Aplicada, d: Datos, mem: MemoriaContable, sugerencias: Sugerencia[]): Duda[] {
  const r = contabilidad({ empresa: mem.empresa.rut, docs: a.docs, f29s: d.f29s, movs: a.movs, libros: d.libros, honorarios: d.honorarios }, a.cfg);
  const transitorios = new Set(r.diario.filter(f => f.origen === 'Banco' && (f.codigo === 1199 || f.codigo === 2190)).map(f => f.clave.slice(2)));
  const conSug = new Map(sugerencias.map(s => [s.movimiento, s]));
  const dudas: Duda[] = [];
  const grupos = new Map<string, Movimiento[]>();
  for (const m of a.movs) {
    // solo lo que nadie decidió (un "cobro consolidado" va a 2190 a propósito); con factura sugerida se pregunta como cruce
    if (m.estado !== 'pendiente' || !transitorios.has(m.clave) || conSug.get(m.clave)?.docs.length) continue;
    const k = `${ladoDe(m)}|${patronGlosa(m.descripcion)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  for (const [k, ms] of [...grupos].sort((x, y) => sumAbs(y[1]) - sumAbs(x[1]))) {
    const m = ms[0], lado = k.split('|')[0];
    const c = rutsConDV(m.descripcion)[0], rut = c ? formatearRUT(`${c}-${calcularDV(Number(c))}`) : undefined;
    dudas.push({ id: `M-${dudas.length + 1}`, tipo: 'movimiento',
      pregunta: ms.length > 1 ? `¿Qué son los ${ms.length} ${lado}s con glosa "${m.descripcion.trim()}" (total ${$(sumAbs(ms))})?` : `¿Qué es el ${lado} del ${fechaTxt(m.fecha)} "${m.descripcion.trim()}" por ${$(m.abono - m.cargo)}?`,
      detalle: ms.slice(0, 6).map(x => `${fechaTxt(x.fecha)} ${$(x.abono - x.cargo)}`).join(', ') + (ms.length > 6 ? '…' : ''),
      monto: ms.reduce((s, x) => s + x.abono - x.cargo, 0), fecha: m.fecha, opciones: [...CATEGORIAS], claves: ms.map(x => x.clave),
      patron: k.split('|')[1], rut });
  }
  const porMov = new Map(a.movs.map(m => [m.clave, m]));
  for (const s of sugerencias.filter(x => x.docs.length && porMov.get(x.movimiento)?.estado === 'pendiente')) {
    const m = porMov.get(s.movimiento)!;
    dudas.push({ id: `C-${dudas.length + 1}`, tipo: 'cruce', pregunta: `¿El ${ladoDe(m)} del ${fechaTxt(m.fecha)} "${m.descripcion.trim()}" por ${$(m.abono - m.cargo)} ${ladoDe(m) === 'abono' ? 'cobra' : 'paga'} ${s.motivo.split(':')[0]}?`,
      detalle: `Confianza ${s.confianza.toLowerCase()}: ${s.motivo}`, monto: m.abono - m.cargo, fecha: m.fecha, opciones: ['Sí', 'No'], claves: [m.clave], sugerencia: s });
  }
  const catGasto = [...new Set((mem.plan ?? PLAN_BASE).map(c => c.categoria).filter((c): c is string => !!c))];
  for (const p of proveedoresSinCategoria(a.docs, mem.provCategoria, mem.empresa.rut))
    dudas.push({ id: `P-${dudas.length + 1}`, tipo: 'categoria', pregunta: `¿Qué compra la empresa a ${p.nombre} (RUT ${p.rut})?`,
      detalle: `${p.compras} compra${p.compras > 1 ? 's' : ''} por ${$(p.monto)} sin IVA quedan en 5990 Compras por revisar.`, monto: p.monto, opciones: catGasto, claves: [], rut: p.rut });
  for (const x of a.docs.filter(y => y.empresa === mem.empresa.rut && y.estado !== 'ANULADA' && observacionesDocumento(y).length))
    dudas.push({ id: `D-${dudas.length + 1}`, tipo: 'documento', pregunta: `${x.libro === 'VENTA' ? 'Venta' : 'Compra'} folio ${x.folio} de ${x.razonSocial}: ${observacionesDocumento(x).join(' ')} ¿Es correcto o hay que anularlo?`,
      detalle: `Neto ${$(x.neto)}, IVA ${$(x.iva)}, total ${$(x.total)}.`, monto: x.total, fecha: x.fechaEmision, opciones: ['Está correcto', 'Anular'], claves: [x.clave] });
  return dudas;
}
const sumAbs = (ms: Movimiento[]) => ms.reduce((s, m) => s + Math.abs(m.abono - m.cargo), 0);

// ------------------------------------------------------------------ aprender
export type Decision =
  | { tipo: 'regla'; regla: Pick<ReglaRobot, 'tipo' | 'patron' | 'lado' | 'categoria' | 'nota'> }
  | { tipo: 'movimiento'; claves: string[]; categoria: string; nota?: string }
  | { tipo: 'proveedor'; rut: string; categoria: string }
  | { tipo: 'documento'; clave: string; categoria: string }
  | { tipo: 'cruce'; movimiento: string; docs: string[] }
  | { tipo: 'anular'; clave: string; motivo: string }
  | { tipo: 'politica'; aceptarCrucesAlta: boolean };

/** Agrega una decisión a la memoria. Valida que la categoría exista; devuelve una memoria nueva (no modifica la recibida). */
export function aprender(mem: MemoriaContable, d: Decision, fuente = 'usuario', hoy = new Date().toISOString().slice(0, 10)): MemoriaContable {
  const m: MemoriaContable = structuredClone(mem);
  const catBanco = new Set<string>(CATEGORIAS), catGasto = new Set((m.plan ?? PLAN_BASE).map(c => c.categoria).filter(Boolean));
  const exigir = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
  let que = '';
  switch (d.tipo) {
    case 'regla': {
      const r = d.regla;
      exigir(catBanco.has(r.categoria), `"${r.categoria}" no es una clasificación del banco. Usa una de: ${[...catBanco].join(', ')}.`);
      exigir(r.tipo === 'glosa' || r.tipo === 'rut', 'El tipo de regla es "glosa" o "rut".');
      const patron = r.tipo === 'rut' ? formatearRUT(r.patron) : patronGlosa(r.patron);
      exigir(r.tipo === 'rut' ? rutValido(patron) : patron.length >= 6, r.tipo === 'rut' ? `El RUT ${r.patron} no es válido.` : 'El patrón de glosa es muy corto (mínimo 6 letras).');
      exigir(!m.reglas.some(x => x.activa && x.tipo === r.tipo && x.patron === patron && x.lado === r.lado), 'Ya existe una regla igual.');
      const n = m.reglas.reduce((x, y) => Math.max(x, Number(y.id.slice(1)) || 0), 0) + 1;
      m.reglas.push({ id: `R${String(n).padStart(3, '0')}`, tipo: r.tipo, patron, lado: r.lado, categoria: r.categoria, nota: r.nota ?? '', fuente, fecha: hoy, activa: true });
      que = `Regla R${String(n).padStart(3, '0')}: ${r.tipo} "${patron}" (${r.lado}) → ${r.categoria}`; break;
    }
    case 'movimiento':
      exigir(catBanco.has(d.categoria), `"${d.categoria}" no es una clasificación del banco.`);
      exigir(d.claves.length > 0, 'Faltan los movimientos.');
      for (const k of d.claves) m.movimientos[k] = { categoria: d.categoria, nota: d.nota, fecha: hoy };
      que = `${d.claves.length} movimiento(s) → ${d.categoria}`; break;
    case 'proveedor':
      exigir(catGasto.has(d.categoria), `"${d.categoria}" no es una categoría de gasto del plan.`);
      exigir(d.categoria !== 'Por revisar', '"Por revisar" no se aprende.');
      m.provCategoria[formatearRUT(d.rut)] = d.categoria; que = `Proveedor ${formatearRUT(d.rut)} → ${d.categoria}`; break;
    case 'documento':
      exigir(catGasto.has(d.categoria), `"${d.categoria}" no es una categoría de gasto del plan.`);
      m.docCategoria[d.clave] = d.categoria; que = `Documento ${d.clave} → ${d.categoria}`; break;
    case 'cruce':
      exigir(d.docs.length > 0, 'Faltan los documentos del cruce.');
      m.conciliados[d.movimiento] = { docs: d.docs, fecha: hoy, fuente }; delete m.movimientos[d.movimiento];
      que = `Cruce ${d.movimiento} ↔ ${d.docs.join(' + ')}`; break;
    case 'anular':
      exigir(d.motivo.trim().length > 3, 'Indica el motivo de la anulación.');
      m.anulados[d.clave] = d.motivo.trim(); que = `Anulado ${d.clave}: ${d.motivo.trim()}`; break;
    case 'politica':
      m.politica.aceptarCrucesAlta = d.aceptarCrucesAlta; que = `Aceptar cruces de confianza alta: ${d.aceptarCrucesAlta ? 'sí' : 'no'}`; break;
  }
  m.historial.push({ fecha: hoy, que: `${que} (${fuente})` });
  return m;
}

/** Los cruces de confianza alta se aceptan solos (si la política lo permite) y quedan en la memoria con su fecha de pago. */
export function aceptarAltas(mem: MemoriaContable, sugerencias: Sugerencia[], movs: Movimiento[], hoy?: string): { mem: MemoriaContable; n: number } {
  if (!mem.politica.aceptarCrucesAlta) return { mem, n: 0 };
  const porClave = new Map(movs.map(m => [m.clave, m]));
  let m = mem, n = 0;
  for (const s of sugerencias.filter(x => x.confianza === 'Alta' && x.docs.length && !mem.conciliados[x.movimiento])) {
    m = aprender(m, { tipo: 'cruce', movimiento: s.movimiento, docs: s.docs }, 'cruce de confianza alta', hoy);
    for (const d of s.docs) m.pagos[d] = { fecha: porClave.get(s.movimiento)?.fecha ?? '' };
    n++;
  }
  return { mem: m, n };
}

// ------------------------------------------------------------------ una corrida completa
export function revisar(d: Datos, mem0: MemoriaContable, hoy?: string) {
  let a = aplicarMemoria(d, mem0);
  const sug = sugerirCruces(a.movs, a.docs, d.f29s, mem0.empresa.rut).sugerencias;
  const { mem, n } = aceptarAltas(mem0, sug, a.movs, hoy);
  if (n) a = aplicarMemoria(d, mem);
  const pendientes = sugerirCruces(a.movs, a.docs, d.f29s, mem.empresa.rut).sugerencias.filter(s => s.confianza !== 'Alta' || !mem.politica.aceptarCrucesAlta);
  const dudas = buscarDudas(a, d, mem, pendientes);
  const conta = contabilidad({ empresa: mem.empresa.rut, docs: a.docs, f29s: d.f29s, movs: a.movs, libros: d.libros, honorarios: d.honorarios }, a.cfg);
  return { mem, aplicada: a, altasAceptadas: n, dudas, conta };
}
