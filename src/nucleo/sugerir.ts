// Sugerencias de clasificación: la categoría de gasto de un proveedor (por su nombre o por proveedores parecidos que el
// usuario ya clasificó) y qué es un movimiento del banco (por la glosa, por el RUT o por movimientos iguales ya
// clasificados). Son propuestas: el usuario siempre confirma.
import type { Documento } from './rcv';
import type { Movimiento } from './cartola';
import { rutsConDV, patronDe, nombraEmpresa } from './cruce';

export interface Propuesta { categoria: string; motivo: string; fuerza: 'alta' | 'media' }

/** Texto en minúsculas sin tildes, con espacios entre palabras (para buscar palabras clave). */
export const texto = (s: string) => ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

// Palabras clave del nombre del proveedor → categoría de gasto. El orden importa: gana la primera que calza
// (por ejemplo, "Zurich Santander Seguros" es un seguro antes que un banco).
const PROVEEDOR: [string, RegExp][] = [
  ['Ganado y animales', /\b(ferias? ganader\w*|ganader\w*|ganado|remates? (de )?ganado|feria de animales|agropecuaria de remates)\b/],
  ['Insumos agrícolas y veterinarios', /\b(fertiliz\w*|agricolas?|agroservicios?|agroinsumos?|agropecuari\w*|silvoagropecuari\w*|semillas?|veterinari\w*|forrajes?|nutricion animal|vivero\w*|cooperativa agricola|agroquimic\w*|riego)\b/],
  ['Seguros', /\b(seguros?|aseguradora|hdi|zurich|mapfre|sura|suramericana|zenit|liberty|consorcio nacional|chilena consolidada|reale)\b/],
  ['Peajes y autopistas', /\b(autopista|concesionaria|soc conc|costanera|vespucio|peajes?|tag|operadora de sistemas electronicos|ruta del)\b|\bruta \d/],
  ['Combustibles y lubricantes', /\b(combustibles?|petroleos?|copec|esmax|shell|enex|aramco|terpel|petrobras|lubricantes?|est serv|estacion de servicio|servicentro)\b/],
  ['Servicios básicos', /\b(cge|enel|chilquinta|saesa|frontel|aguas|esval|essbio|nuevosur|metrogas|lipigas|gasco|abastible|entel|movistar|telefonica|claro|wom|vtr|gtd|mundo pacifico|sanitaria)\b/],
  ['Computación y software', /\b(software|computacion|computer|computadores|informatica|bsale|certificacion electronica|ecert|acepta|nubox|microsoft|google|adobe|hosting)\b/],
  ['Fletes y despacho', /\b(transportes?|fletes?|chilexpress|starken|bluexpress|blue express|correos de chile|cargo|courier|logistica|gruas|despachos?|mudanzas?)\b/],
  ['Vehículos y mantención', /\b(automotriz|repuestos?|frenos|italfrenos|neumaticos|lubricentro|taller|mecanica|revisiones tecnicas|revision tecnica|tuv rheinland|derco|kaufmann|salfa)\b/],
  ['Viajes y movilización', /\b(latam|airline|airlines|sky|jetsmart|turbus|pullman|hotel|hostal|uber|cabify|taxi|buses)\b/],
  ['Publicidad', /\b(publicidad|publicitarios?|marketing|imprenta|grafica|editorial|letreros?)\b/],
  ['Servicios profesionales', /\b(asesorias?|consultorias?|consultores?|contadores?|contable|contabilidad|abogados?|juridica|auditores|auditoria|capacitacion|prevencion|prev|equifax|notaria|notario|conservador)\b/],
  ['Insumos y herramientas', /\b(ferreteria|ferreterias|ferremark|herrajes?|sodimac|easy|imperial|construmart|chilemat|herramientas?|construction supplies|materiales de construccion|electricidad)\b/],
  ['Subcontratos e instalación', /\b(instalaciones?|montajes?|gasfiteria|electricista|carpinteria|soldaduras?)\b/],
  ['Arriendos', /\b(arriendos?|arrendamientos?|rent a car)\b/],
  ['Gastos generales', /\b(supermercados?|hiper|retail|falabella|ripley|paris|cencosud|walmart|lider|unimarc|jumbo|tottus|santa isabel|mercadolibre|libreria|farmacias?|cruz verde|salcobrand|ahumada|dimerc|prisa|verisure|aseo|limpieza)\b/],
  ['Gastos bancarios y financieros', /\b(banco|bice|santander|bancoestado|scotiabank|bci|itau|leasing|getnet|transbank|factoring|financiera|corredores de bolsa|tarjetas de pago)\b/],
];

// Palabras que no dicen nada del rubro (no sirven para "se parece a otro proveedor")
const COMUNES = new Set(('comercial comercializadora sociedad soc limitada ltda spa eirl empresa empresas servicios servicio distribuidora distribucion ' +
  'importadora importaciones exportadora inversiones industrial chile chilena group grupo compania cia general generales nacional ' +
  'internacional administradora retail del los las san santa norte sur oriente poniente centro hijo hijos hermanos sa').split(' '));
const palabras = (s: string) => texto(s).trim().split(' ').filter(w => w.length >= 5 && !COMUNES.has(w) && !/^\d+$/.test(w));

/** Categoría sugerida para un proveedor: por palabras clave del nombre o porque se parece a otro que el usuario ya clasificó. */
export function sugerirCategoria(nombre: string, categoriasPlan: string[], aprendidas: { nombre: string; categoria: string }[] = [], montoMayor = 0, nombrePropio = ''): Propuesta | null {
  const existe = (c: string) => categoriasPlan.includes(c);
  const t = texto(nombre);
  const ojo = montoMayor >= 1_000_000 ? ' Ojo: tiene compras grandes; si es un bien que dura más de un año, va como activo fijo.' : '';
  for (const [cat, re] of PROVEEDOR) {
    const m = t.match(re);
    if (m && existe(cat)) return { categoria: cat, motivo: `El nombre dice "${m[0].trim().toUpperCase()}".${ojo}`, fuerza: 'alta' };
  }
  // Se parece a un proveedor ya clasificado (comparte una palabra propia del rubro, como MARMOL o FERRE)
  // Las palabras del nombre de la propia empresa no cuentan: las empresas relacionadas comparten nombre y no rubro
  const propias = new Set(palabras(nombrePropio));
  const mias = palabras(nombre).filter(w => !propias.has(w));
  const votos = new Map<string, { n: number; ejemplo: string; palabra: string }>();
  for (const a of aprendidas) {
    if (!existe(a.categoria) || a.categoria === 'Por revisar') continue;
    const comun = palabras(a.nombre).filter(w => !propias.has(w)).find(w => mias.some(x => x === w || (w.length >= 6 && x.length >= 6 && (x.startsWith(w.slice(0, 6)) || w.startsWith(x.slice(0, 6))))));
    if (comun) { const v = votos.get(a.categoria) ?? { n: 0, ejemplo: a.nombre, palabra: comun }; v.n++; votos.set(a.categoria, v); }
  }
  const [mejor] = [...votos].sort((a, b) => b[1].n - a[1].n);
  if (mejor && votos.size === 1) return { categoria: mejor[0], motivo: `Se parece a ${mejor[1].ejemplo} (palabra "${mejor[1].palabra.toUpperCase()}"), que clasificaste así.${ojo}`, fuerza: 'media' };
  return null;
}

// Glosas del banco → clasificación
const GLOSA: [string, 'cargo' | 'abono' | 'ambos', RegExp][] = [
  ['Remuneraciones y cotizaciones', 'cargo', /\b(previred|afp|isapre|fonasa|caja de compensacion|mutual de seguridad|achs)\b/],
  ['Pago de impuestos (F29)', 'cargo', /\b(tesoreria|tgr|sii|formulario 29|f29|impuestos? fiscal)\b/],
  ['Crédito bancario (cuotas)', 'cargo', /\b(cuota credito|pago cuota|cuota prestamo|credito no|prestamo|dividendo)\b/],
  ['Comisiones y gastos bancarios', 'cargo', /\b(comision|comisiones|com mantencion|mantencion plan|mantencion cta|cobro servicio|impuesto timbre|itf|sobregiro|intereses linea|interes linea|cargo por servicio)\b/],
  ['Traspaso entre cuentas propias', 'ambos', /\b(traspaso|entre cuentas|cuenta propia|cta propia|fondos mutuos|deposito a plazo|rescate fondo)\b/],
  ['Otro gasto sin factura', 'cargo', /\b(seguro|seguros|pac seguro)\b/],
  ['Otro ingreso', 'abono', /\b(intereses ganados|interes ganado|reembolso|devolucion)\b/],
  // La venta de divisas suele ser el cobro de una exportación (el cliente paga en dólares y el banco los cambia)
  ['Cobro a cliente', 'abono', /\b(venta de divisas|liquidacion de divisas|cambio de divisas|compra venta de divisas)\b/],
  // Compras con tarjeta en comercios: casi siempre con boleta (sin crédito fiscal)
  ['Otro gasto sin factura', 'cargo', /\b(redcompra|compra nacional|compra internacional|compra web|pago tarjeta debito)\b/],
];

export interface ContextoMov { clasificados: Movimiento[]; rutEmpresa?: string; razonSocial?: string; docs?: Documento[] }

const diaDe = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
/** Factura de compra pendiente por el mismo total, emitida hasta 30 días antes del cargo (el pago con tarjeta de una factura). */
const facturaDelMonto = (m: Movimiento, docs: Documento[] = []) => docs.find(d => d.libro === 'COMPRA' && d.estado === 'POR PAGAR' && Math.abs(d.total - m.cargo) < 1
  && diaDe(m.fecha) - diaDe(d.fechaEmision) >= 0 && diaDe(m.fecha) - diaDe(d.fechaEmision) <= 30);

/** Qué es un movimiento del banco: primero lo que el usuario ya decidió para el mismo RUT o la misma glosa; después,
 *  palabras clave de la glosa. */
export function sugerirMovimiento(m: Movimiento, ctx: ContextoMov): Propuesta | null {
  const lado = m.abono > m.cargo ? 'abono' : 'cargo';
  const mismos = ctx.clasificados.filter(x => x.estado === 'clasificado' && x.categoria && (x.abono > x.cargo ? 'abono' : 'cargo') === lado && x.clave !== m.clave);
  const ruts = rutsConDV(m.descripcion);
  if (ruts.length) {
    const igual = mismos.filter(x => rutsConDV(x.descripcion).some(r => ruts.includes(r)));
    const cats = new Set(igual.map(x => x.categoria));
    if (igual.length && cats.size === 1) return { categoria: igual[0].categoria!, motivo: `Ya clasificaste ${igual.length} movimiento${igual.length > 1 ? 's' : ''} con este RUT así.`, fuerza: 'alta' };
  }
  // Misma glosa: solo si no trae RUT ("Transf a 12.345.678-5" y "Transf a 9.876.543-3" son personas distintas)
  const p = patronDe(m.descripcion);
  const igualGlosa = ruts.length ? [] : mismos.filter(x => !rutsConDV(x.descripcion).length && patronDe(x.descripcion) === p);
  if (igualGlosa.length && new Set(igualGlosa.map(x => x.categoria)).size === 1)
    return { categoria: igualGlosa[0].categoria!, motivo: `Ya clasificaste ${igualGlosa.length} movimiento${igualGlosa.length > 1 ? 's' : ''} con la misma glosa así.`, fuerza: 'alta' };
  // La glosa nombra a la propia empresa (sin el RUT de un tercero): plata que va o viene de otra cuenta propia
  if (ctx.rutEmpresa && nombraEmpresa(m.descripcion, ctx.rutEmpresa, ctx.razonSocial) && !ruts.some(r => r !== String(Number(ctx.rutEmpresa!.replace(/\./g, '').split('-')[0]))))
    return { categoria: 'Traspaso entre cuentas propias', motivo: 'La glosa nombra a tu propia empresa: parece plata que va o viene de otra cuenta tuya.', fuerza: 'media' };
  const t = texto(m.descripcion);
  for (const [cat, l, re] of GLOSA) {
    if (l !== 'ambos' && l !== lado) continue;
    const r = t.match(re);
    if (r && cat === 'Otro gasto sin factura' && lado === 'cargo') {
      const f = facturaDelMonto(m, ctx.docs);
      if (f) return null;     // hay una factura por el mismo monto: es un pago a proveedor, que se asocia en "Asociar a facturas"
    }
    if (r) return { categoria: cat, motivo: `La glosa dice "${r[0].trim().toUpperCase()}".${cat === 'Cobro a cliente' ? ' Suele ser el cobro de una exportación: asócialo a la factura si la reconoces.' : cat === 'Otro gasto sin factura' ? ' Si la compra tiene factura, asóciala en vez de esto.' : ''}`, fuerza: 'media' };
  }
  return null;
}

/** Sugerencias para todos los proveedores sin categoría (rut → propuesta). */
export function sugerenciasProveedores(sin: { rut: string; nombre: string }[], docs: Documento[], provCategoria: Record<string, string>, categoriasPlan: string[], nombrePropio = '') {
  const nombre = new Map(docs.map(d => [d.rutContraparte, d.razonSocial]));
  const aprendidas = Object.entries(provCategoria).map(([rut, categoria]) => ({ nombre: nombre.get(rut) ?? '', categoria })).filter(a => a.nombre);
  const mayor = new Map<string, number>();
  for (const d of docs) if (d.libro === 'COMPRA') mayor.set(d.rutContraparte, Math.max(mayor.get(d.rutContraparte) ?? 0, d.neto));
  return new Map(sin.map(p => [p.rut, sugerirCategoria(p.nombre, categoriasPlan, aprendidas, mayor.get(p.rut) ?? 0, nombrePropio)] as const).filter((x): x is [string, Propuesta] => !!x[1]));
}
