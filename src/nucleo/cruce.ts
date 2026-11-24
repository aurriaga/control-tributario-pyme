// Cruce de la cartola con las facturas abiertas (cobros y pagos). Equivale a modCruce.bas:
//  - Abono (entra dinero) -> facturas de venta POR COBRAR; cargo (sale dinero) -> facturas de compra POR PAGAR.
//  - Contraparte: RUT en la glosa (con o sin puntos y guion; si trae dígito verificador debe ser válido) o palabras del
//    nombre (4 letras o más, sin palabras genéricas; una palabra que comparten más de 3 contrapartes no sirve).
//  - Monto exacto: una factura, 2 a 4 documentos de la misma contraparte (puede incluir notas de crédito) o todo lo que
//    se le debe. El pago es el mismo día o después de la emisión (máximo 400 días).
//  - Nada se marca solo: el usuario acepta o rechaza cada sugerencia.
import { signoDoc, type Documento } from './rcv';
import type { Movimiento } from './cartola';
import { rutValido } from './rut';
import { normalizar } from './texto';
import { f29PorPeriodo, type F29 } from './f29';

const MAX_DIAS_PAGO = 400, MAX_COMBINAR = 4, MAX_DOCS_COMBINAR = 18, MAX_CONTRAPARTES_PALABRA = 3;

export type Confianza = 'Alta' | 'Media' | 'Baja' | 'Sin calce';
export interface Sugerencia { movimiento: string; confianza: Confianza; motivo: string; docs: string[]; contraparte: string }
export interface ResultadoCruce { sugerencias: Sugerencia[]; pagosF29: string[]; revisados: number; ajenos: number }

const GENERICAS = new Set(('ltda limitada eirl sociedad compania comercial comercializadora comercio inversiones servicios empresa empresas ' +
  'importadora importaciones exportadora constructora construccion construcciones inmobiliaria industrial industrias chile chilena ' +
  'transportes transporte distribuidora ingenieria administradora admin asesorias consultora consultores grupo group holding hermanos ' +
  'agricola forestal minera general nacional internacional proyectos obras sucursal banco transf transferencia deposito pago pagos ' +
  'abono cargo otros para desde cuenta cliente proveedor').split(' '));

const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
export const esNotaCredito = (t: number) => signoDoc(t) < 0;
const palabras = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
const cuerpoDe = (rut: string) => { const s = rut.replace(/[.\s]/g, '').split('-')[0]; return /^\d{1,9}$/.test(s) ? String(Number(s)) : ''; };

function tokensRut(s: string): string[] {
  return (s.toUpperCase().match(/[0-9K.-]+/g) ?? []).filter(t => t.length >= 7);
}
/** Cuerpos de RUT con dígito verificador válido ("78.000.002-3", "0780000023", "TEF 9876543-3"). */
export function rutsConDV(s: string): string[] {
  const res: string[] = [];
  for (const t of tokensRut(s)) {
    let x = t.replace(/[.-]/g, '');
    while (x.length > 8 && x.startsWith('0')) x = x.slice(1);
    if (x.length >= 8 && x.length <= 9 && /^\d+$/.test(x.slice(0, -1)) && rutValido(`${x.slice(0, -1)}-${x.slice(-1)}`)) res.push(String(Number(x.slice(0, -1))));
  }
  return res;
}
/** Cuerpos de RUT en un texto: con dígito verificador válido o sin él (7 u 8 dígitos). El Banco de Chile antepone ceros. */
export function rutsEnTexto(s: string): string[] {
  const res = new Set<string>();
  for (const t of tokensRut(s)) {
    let x = t.replace(/[.-]/g, '');
    while (x.length > 8 && x.startsWith('0')) x = x.slice(1);
    if (x.length >= 8 && x.length <= 9 && /^\d+$/.test(x.slice(0, -1)) && rutValido(`${x.slice(0, -1)}-${x.slice(-1)}`)) res.add(String(Number(x.slice(0, -1))));
    if (x.length >= 7 && x.length <= 8 && /^\d+$/.test(x)) res.add(String(Number(x)));
  }
  return [...res];
}
/** Números de la glosa que pueden ser folios ("FACT 440 441", "F0001868"); se omiten los que llevan punto, guion o barra. */
export function foliosEnTexto(s: string): Set<string> {
  const d = new Set<string>();
  for (let w of s.toUpperCase().replace(/[^0-9A-Z./-]/g, ' ').split(' ')) {
    if (!w || /[./-]/.test(w)) continue;
    w = w.replace(/^[A-Z]+/, '');
    if (w.length >= 1 && w.length <= 10 && /^\d+$/.test(w)) d.add(String(Number(w)));
  }
  return d;
}

interface DocAbierto { i: number; lado: 'V' | 'C'; doc: Documento; cuerpo: string; fec: number; ven: number; saldo: number; usado: boolean }

export function sugerirCruces(movs: Movimiento[], docs: Documento[], f29s: F29[], rutEmpresa: string): ResultadoCruce {
  const propio = cuerpoDe(rutEmpresa);
  const abiertos: DocAbierto[] = [];
  docs.forEach((d, i) => {
    if (d.estado !== 'POR COBRAR' && d.estado !== 'POR PAGAR') return;
    if (d.libro === 'COMPRA' && (d.tipoDoc === 40 || d.tipoDoc === 43)) return;      // liquidación-factura: no es deuda
    const fec = dia(d.fechaEmision);
    abiertos.push({ i, lado: d.libro === 'VENTA' ? 'V' : 'C', doc: d, cuerpo: cuerpoDe(d.rutContraparte), fec, ven: fec + (d.plazoDias || 0), saldo: signoDoc(d.tipoDoc) * d.total, usado: false });
  });
  const porCuerpo = new Map<string, DocAbierto[]>(), nombre = new Map<string, string>(), porPalabra = new Map<string, Set<string>>();
  for (const a of abiertos) {
    const k = `${a.lado}|${a.cuerpo}`;
    porCuerpo.set(k, [...(porCuerpo.get(k) ?? []), a]); nombre.set(k, `${a.doc.razonSocial} (${a.doc.rutContraparte})`);
    for (const p of palabras(a.doc.razonSocial)) if (p.length >= 4 && !GENERICAS.has(p) && !/^\d+$/.test(p)) {
      const kp = `${a.lado}|${p}`; if (!porPalabra.has(kp)) porPalabra.set(kp, new Set()); porPalabra.get(kp)!.add(a.cuerpo);
    }
  }
  for (const [k, s] of porPalabra) if (s.size > MAX_CONTRAPARTES_PALABRA) porPalabra.delete(k);

  const disponible = (a: DocAbierto, f: number) => !a.usado && a.fec <= f && f - a.fec <= MAX_DIAS_PAGO;
  const masCercano = (l: DocAbierto[], f: number) => l.reduce((m, a) => (Math.abs(a.ven - f) < Math.abs(m.ven - f) ? a : m));
  const dias = (d: number) => (d < 1 ? 'el mismo día de la emisión' : `${Math.round(d)} días después de la emisión`);
  const abrev = (t: number) => ([30, 33].includes(t) ? 'FAC' : [32, 34].includes(t) ? 'FEX' : [55, 56].includes(t) ? 'ND' : esNotaCredito(t) ? 'NC' : `DOC ${t}`);
  const etiqueta = (a: DocAbierto) => `${abrev(a.doc.tipoDoc)} ${a.doc.folio}`;

  // Pagos de F29 declarados (no se cruzan con facturas): monto del código 91 y fecha de presentación ±31 días
  const pagos = [...f29PorPeriodo(f29s).values()].filter(f => (f.codigos['91'] ?? 0) > 0 && f.fechaPresentacion)
    .map(f => ({ fecha: dia(f.fechaPresentacion.split('/').reverse().join('-')), monto: f.codigos['91'] }));

  const res: ResultadoCruce = { sugerencias: [], pagosF29: [], revisados: 0, ajenos: 0 };
  const orden = movs.map((m, i) => ({ m, i })).filter(x => x.m.estado === 'pendiente' && Math.abs(x.m.abono - x.m.cargo) >= 0.5)
    .sort((a, b) => a.m.fecha.localeCompare(b.m.fecha) || a.i - b.i);
  const ident = new Map<string, Map<string, string>>();
  const elegibles: Movimiento[] = [];
  for (const { m } of orden) {
    const monto = m.abono - m.cargo, f = dia(m.fecha);
    if (monto < 0 && pagos.some(p => Math.abs(p.monto + monto) < 0.5 && Math.abs(p.fecha - f) <= 31)) { res.pagosF29.push(m.clave); continue; }
    res.revisados++;
    const lado = monto > 0 ? 'V' : 'C';
    const d = new Map<string, string>();
    for (const cu of rutsEnTexto(m.descripcion)) if (cu !== propio && porCuerpo.has(`${lado}|${cu}`)) d.set(cu, 'RUT en la glosa');
    if (d.size === 0 && rutsConDV(m.descripcion).length) { res.ajenos++; continue; }   // trabajador, socio o cuenta propia
    if (d.size === 0) for (const p of palabras(m.descripcion)) for (const cu of porPalabra.get(`${lado}|${p}`) ?? []) if (cu !== propio)
      d.set(cu, d.has(cu) ? `${d.get(cu)}, ${p.toUpperCase()}` : `nombre en la glosa: ${p.toUpperCase()}`);
    ident.set(m.clave, d); elegibles.push(m);
  }

  const agregar = (m: Movimiento, confianza: Confianza, motivo: string, sel: DocAbierto[], contraparte = '') => {
    sel.forEach(a => (a.usado = true));
    const pref = sel.length ? `${sel.map(etiqueta).join(' + ')}: ` : '';
    res.sugerencias.push({ movimiento: m.clave, confianza, motivo: pref + motivo, docs: sel.map(a => a.doc.clave), contraparte });
  };

  for (const fase of [1, 2]) for (const m of elegibles) {
    const id = ident.get(m.clave)!, monto = Math.abs(m.abono - m.cargo), f = dia(m.fecha), lado = m.abono > m.cargo ? 'V' : 'C';
    if (fase === 1 && id.size > 0) {
      const folios = foliosEnTexto(m.descripcion);
      const nombres = [...id.keys()].map(cu => nombre.get(`${lado}|${cu}`)).join(' / ');
      // 1) una factura con ese saldo
      const sing = [...id.keys()].flatMap(cu => (porCuerpo.get(`${lado}|${cu}`) ?? []).filter(a => disponible(a, f) && a.saldo > 0 && Math.abs(a.saldo - monto) < 0.5));
      if (sing.length) {
        const conFolio = sing.filter(a => folios.has(String(a.doc.folio)));
        const mejor = conFolio.length === 1 ? conFolio[0] : masCercano(sing, f);
        const motivo = `${id.get(mejor.cuerpo)}${conFolio.length === 1 ? `; folio ${mejor.doc.folio} en la glosa` : ''}; monto exacto; ${dias(f - mejor.fec)}`;
        if ((sing.length === 1 || conFolio.length === 1) && id.size === 1) agregar(m, 'Alta', motivo, [mejor]);
        else agregar(m, 'Media', `${motivo}. Hay ${sing.length} documentos por el mismo monto: se propone el de vencimiento más cercano. Confirma cuál es.`, [mejor]);
        continue;
      }
      // 2) varios documentos de la misma contraparte
      const sols: { sel: DocAbierto[]; motivo: string }[] = [];
      for (const cu of id.keys()) {
        const lista = (porCuerpo.get(`${lado}|${cu}`) ?? []).filter(a => disponible(a, f));
        const tot = lista.reduce((s, a) => s + a.saldo, 0);
        const conFolio = lista.filter(a => folios.has(String(a.doc.folio)));
        if (conFolio.length >= 2 && Math.abs(conFolio.reduce((s, a) => s + a.saldo, 0) - monto) < 0.5) {
          sols.length = 0; sols.push({ sel: conFolio, motivo: `${id.get(cu)}; folios ${conFolio.map(a => a.doc.folio).join(', ')} en la glosa; la suma de ${conFolio.length} documentos calza con el monto` });
          break;
        }
        if (lista.length > MAX_COMBINAR && Math.abs(tot - monto) < 0.5) sols.push({ sel: lista, motivo: `${id.get(cu)}; el monto es todo lo pendiente con ${nombre.get(`${lado}|${cu}`)} (${lista.length} documentos)` });
        else if (lista.length >= 2) combinar(candidatos(lista, f, folios), monto, sols, id.get(cu)!);
        if (sols.length >= 2) break;
      }
      if (sols.length) {
        const unica = sols.length === 1 && id.size === 1;
        agregar(m, unica ? 'Alta' : 'Media', unica ? sols[0].motivo : `${sols[0].motivo}. Hay más de una combinación posible: confirma cuál es.`, sols[0].sel);
      } else {
        agregar(m, 'Sin calce', `Se reconoce a ${nombres} (${[...id.values()][0]}), pero el monto no calza con sus documentos abiertos emitidos hasta esa fecha: puede ser un abono parcial, un anticipo o una factura que no está en el registro.`, [], nombres);
      }
    } else if (fase === 2 && id.size === 0) {
      const sing = abiertos.filter(a => a.lado === lado && a.saldo > 0 && Math.abs(a.saldo - monto) < 0.5 && disponible(a, f));
      if (!sing.length) continue;
      const mejor = masCercano(sing, f);
      if (sing.length === 1 && monto <= 100000 && Math.abs(monto - 5000 * Math.round(monto / 5000)) < 0.5)
        agregar(m, 'Baja', 'La glosa no trae RUT ni nombre y el monto es chico y redondo (puede ser otro pago por la misma cifra); es el único documento abierto por ese monto. Confirma cuál es.', [mejor]);
      else if (sing.length === 1) agregar(m, 'Media', `La glosa no trae RUT ni nombre; es el único documento abierto por ese monto; ${dias(f - mejor.fec)}`, [mejor]);
      else agregar(m, 'Baja', `La glosa no trae RUT ni nombre y hay ${sing.length} documentos abiertos por ese monto: se propone el de vencimiento más cercano. Confirma cuál es.`, [mejor]);
    }
  }
  return res;

  // Hasta 18 candidatos: primero los que tienen su folio en la glosa; luego, alternando, los más antiguos y los de
  // vencimiento más cercano a la fecha del pago
  function candidatos(lista: DocAbierto[], f: number, folios: Set<string>): DocAbierto[] {
    const out: DocAbierto[] = [], ya = new Set<DocAbierto>();
    const poner = (a: DocAbierto) => { if (out.length < MAX_DOCS_COMBINAR && !ya.has(a)) { out.push(a); ya.add(a); } };
    lista.filter(a => folios.has(String(a.doc.folio))).forEach(poner);
    const ant = [...lista].sort((a, b) => a.fec - b.fec), cer = [...lista].sort((a, b) => Math.abs(a.ven - f) - Math.abs(b.ven - f));
    for (let p = 0; p < lista.length; p++) { poner(ant[p]); poner(cer[p]); }
    return out;
  }
  function combinar(cand: DocAbierto[], objetivo: number, sols: { sel: DocAbierto[]; motivo: string }[], como: string, desde = 0, act: DocAbierto[] = [], suma = 0) {
    if (sols.length >= 2) return;
    if (act.length >= 2 && Math.abs(suma - objetivo) < 0.5) { sols.push({ sel: [...act], motivo: `${como}; la suma de ${act.length} documentos calza con el monto` }); return; }
    if (act.length >= MAX_COMBINAR) return;
    for (let k = desde; k < cand.length && sols.length < 2; k++) combinar(cand, objetivo, sols, como, k + 1, [...act, cand[k]], suma + cand[k].saldo);
  }
}

/** Aplica las sugerencias aceptadas: las facturas quedan COBRADA o PAGADA con la fecha del movimiento y el movimiento
 *  queda conciliado. Devuelve copias nuevas de documentos y movimientos. */
export function aplicarCruces(aceptadas: Sugerencia[], docs: Documento[], movs: Movimiento[]): { docs: Documento[]; movs: Movimiento[] } {
  const porMov = new Map(aceptadas.filter(s => s.docs.length).map(s => [s.movimiento, s]));
  const fechaDe = new Map<string, string>();
  const nuevosMovs = movs.map(m => {
    const s = porMov.get(m.clave); if (!s) return m;
    s.docs.forEach(d => fechaDe.set(d, m.fecha));
    return { ...m, estado: 'conciliado' as const, docs: s.docs };
  });
  const nuevosDocs = docs.map(d => (fechaDe.has(d.clave) ? { ...d, estado: d.libro === 'VENTA' ? 'COBRADA' as const : 'PAGADA' as const, fechaPago: fechaDe.get(d.clave) } : d));
  return { docs: nuevosDocs, movs: nuevosMovs };
}

// ------------------------------------------------------------------ clasificación de movimientos sin factura
export const CATEGORIAS = ['Pago a proveedor', 'Cobro a cliente', 'Pago de impuestos (F29)', 'Remuneraciones y cotizaciones', 'Honorarios',
  'Comisiones y gastos bancarios', 'Crédito bancario (cuotas)', 'Retiro de socios', 'Aporte de socios', 'Aporte de capital',
  'Traspaso entre cuentas propias', 'Anticipo de cliente', 'Cobro consolidado de facturas', 'Otro gasto sin factura', 'Otro ingreso'] as const;

/** Regla aprendida para clasificar movimientos del banco.
 *  - igual: la glosa (sin números ni símbolos) es idéntica;
 *  - contiene: la glosa contiene el texto (sin números ni espacios), por ejemplo "comisionmantencion";
 *  - rut: el RUT aparece en la glosa (patron = cuerpo del RUT sin dígito verificador).
 *  Las reglas guardadas antes de existir el tipo son "igual". */
export type TipoRegla = 'igual' | 'contiene' | 'rut';
export interface Regla {
  id: string; patron: string; categoria: string; lado: 'cargo' | 'abono' | 'ambos';
  tipo?: TipoRegla; activa?: boolean; creada?: string; texto?: string;   // texto: lo que escribió el usuario, para mostrarlo
}

/** Glosa sin números ni símbolos: "COMISION MANTENCION 0912" y "COMISION MANTENCION 1012" dan lo mismo. */
export const patronDe = (desc: string) => normalizar(desc).replace(/\d/g, '');

export function coincideRegla(m: Movimiento, r: Regla): boolean {
  if (r.activa === false || !r.patron) return false;
  if (r.lado !== 'ambos' && r.lado !== (m.abono > m.cargo ? 'abono' : 'cargo')) return false;
  const tipo = r.tipo ?? 'igual';
  if (tipo === 'rut') return rutsEnTexto(m.descripcion).includes(r.patron);
  const p = patronDe(m.descripcion);
  return tipo === 'contiene' ? p.includes(r.patron) : p === r.patron;
}

export function crearRegla(m: Movimiento, categoria: string, reglas: Regla[], op: { tipo?: TipoRegla; texto?: string; hoy?: string } = {}): Regla {
  const n = reglas.reduce((x, r) => Math.max(x, Number(r.id.slice(1)) || 0), 0) + 1;
  const tipo = op.tipo ?? 'igual';
  const texto = (op.texto ?? m.descripcion).trim();
  const patron = tipo === 'rut' ? String(Number(texto.replace(/[.\s]/g, '').split('-')[0]) || '') : patronDe(texto);
  return { id: `R${String(n).padStart(3, '0')}`, patron, categoria, lado: m.abono > m.cargo ? 'abono' : 'cargo', tipo, activa: true,
    creada: op.hoy ?? new Date().toISOString().slice(0, 10), texto: tipo === 'igual' ? m.descripcion.trim() : texto };
}

/** Cuántos movimientos pendientes clasificaría una regla (para mostrarlo antes de guardarla). */
export const alcanceRegla = (r: Regla, movs: Movimiento[]) => movs.filter(m => m.estado === 'pendiente' && coincideRegla(m, r)).length;

/** Después de editar, desactivar o borrar reglas: lo que clasificó una regla que ya no existe o está desactivada vuelve a
 *  pendiente; si cambió su clasificación, se actualiza; y los pendientes se vuelven a revisar con las reglas activas. */
export function reaplicarReglas(movs: Movimiento[], reglas: Regla[]): Movimiento[] {
  const porId = new Map(reglas.map(r => [r.id, r]));
  const actualizados = movs.map(m => {
    if (m.estado !== 'clasificado' || !m.regla || !/^R\d+$/.test(m.regla)) return m;
    const r = porId.get(m.regla);
    if (!r || r.activa === false) { const { categoria: _c, regla: _r, ...resto } = m; void _c; void _r; return { ...resto, estado: 'pendiente' as const }; }
    return r.categoria !== m.categoria ? { ...m, categoria: r.categoria } : m;
  });
  return clasificar(actualizados, reglas);
}

/** Clasifica los movimientos pendientes: pagos de F29 detectados por el cruce, pagos al personal (cargos con el RUT de un
 *  trabajador de los libros de remuneraciones o a PREVIRED) y los que calzan con una regla aprendida. */
export function clasificar(movs: Movimiento[], reglas: Regla[], pagosF29: string[] = [], trabajadores: Set<string> = new Set()): Movimiento[] {
  const f29 = new Set(pagosF29);
  return movs.map(m => {
    if (m.estado !== 'pendiente') return m;
    if (f29.has(m.clave)) return { ...m, estado: 'clasificado' as const, categoria: 'Pago de impuestos (F29)', regla: 'F29' };
    if (m.cargo > 0 && (/previred/i.test(m.descripcion) || rutsConDV(m.descripcion).some(c => trabajadores.has(c))))
      return { ...m, estado: 'clasificado' as const, categoria: 'Remuneraciones y cotizaciones', regla: 'Personal' };
    const r = reglas.find(x => coincideRegla(m, x));
    return r ? { ...m, estado: 'clasificado' as const, categoria: r.categoria, regla: r.id } : m;
  });
}
