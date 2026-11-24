// Preguntas de Riffo Junior sobre los datos de la propia empresa ("¿cuánto IVA pagué en junio?", "¿cuánto vendí este año?",
// "¿cuánto le debo a la feria?"). Responde con lo que está cargado en la app y dice de dónde sale cada cifra. No envía nada.
import { signoDoc, esComisionLF, type Documento, type Empresa, type OpcionesIVA } from './rcv';
import type { Movimiento } from './cartola';
import { f29PorPeriodo, totalesRCV, type F29 } from './f29';
import { periodoDe } from './resumen';
import { contabilidad, type ConfigContable } from './contabilidad';
import type { LibroRemuneraciones, MesHonorarios } from './remuneraciones';
import { montoDe } from './asientosAyuda';
import { jerga } from './vocabulario';
import type { Respuesta } from './asistente';

export interface DatosEmpresa { empresa: Empresa; docs: Documento[]; f29s: F29[]; movs: Movimiento[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[]; cfg: ConfigContable }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const $ = (n: number) => (Math.round(n) < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('de-DE');
const mesTexto = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const fecha = (iso: string) => iso.split('-').reverse().join('-');
const de = (x: string) => (x.startsWith('el ') ? `del ${x.slice(3)}` : `de ${x}`);   // "de el primer semestre" → "del primer semestre"

const PERSONAL = /(?<= )(?:pague|pagamos|pagado|pago|debo|debemos|le debo|me deben|nos deben|me debe|vendi|vendimos|compre|compramos|gaste|gastamos|gane|ganamos|perdi|perdimos|tengo|tenemos|llevo|llevamos|mi|mis|nuestr\w*|declare|declaramos|quedo|queda|hay)(?= )/;
const TEMA = /(?<= )(?:iva|ppm|f29|ventas?|vendi\w*|compras?|compr\w*|gast\w*|resultado|utilidad\w*|ganancia\w*|perdida\w*|gane|ganamos|perdi\w*|debo|deben|debe|deuda\w*|proveedor\w*|cliente\w*|saldo|banco|plata|remanente|impuestos?|retenciones?|honorarios|impuesto unico)(?= )/;

/** ¿Pregunta por los números de la propia empresa (sin un monto para calcular)? */
export function pideDatos(pregunta: string): boolean {
  const t = jerga(pregunta);
  const sinAnios = pregunta.replace(/\b20\d\d\b/g, '');
  if (montoDe(sinAnios) !== null || / si (?:vendo|vendi|gano|gane|tengo|compro|compre) /.test(t)) return false;   // "si vendí 10 palos…" es un cálculo
  if (/ (?:que es|que son|como (?:cargo|hago|se)|donde) /.test(t)) return false;
  return PERSONAL.test(t) && TEMA.test(t);
}

/** Meses que pide la pregunta: un mes, un trimestre, un semestre o el año; si no dice, el último mes o año con datos. */
export function periodoPedido(t: string, meses: string[], hoy = new Date()): { desde: string; hasta: string; texto: string; anual: boolean; dijo: boolean } {
  const ultimo = meses[meses.length - 1] ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const anio = t.match(/ (20\d\d) /)?.[1] ?? ultimo.slice(0, 4);
  const m = MESES.findIndex(x => t.includes(` ${x} `));
  if (m >= 0) { const p = `${anio}-${String(m + 1).padStart(2, '0')}`; return { desde: p, hasta: p, texto: mesTexto(p), anual: false, dijo: true }; }
  if (/ (?:este mes|el mes) /.test(t)) return { desde: ultimo, hasta: ultimo, texto: mesTexto(ultimo), anual: false, dijo: true };
  if (/ mes pasado /.test(t)) { const [y, mm] = ultimo.split('-').map(Number); const p = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; return { desde: p, hasta: p, texto: mesTexto(p), anual: false, dijo: true }; }
  const sem = / (primer|segundo)? ?semestre /.exec(t);
  if (sem) { const s = sem[1] ? (sem[1] === 'primer' ? 1 : 2) : Number(ultimo.slice(5)) > 6 ? 2 : 1; return { desde: `${anio}-${s === 1 ? '01' : '07'}`, hasta: `${anio}-${s === 1 ? '06' : '12'}`, texto: `el ${s === 1 ? 'primer' : 'segundo'} semestre de ${anio}`, anual: false, dijo: true }; }
  const tri = / (primer|segundo|tercer|cuarto)? ?trimestre /.exec(t);
  if (tri) { const q = tri[1] ? ['primer', 'segundo', 'tercer', 'cuarto'].indexOf(tri[1]) + 1 : Math.ceil(Number(ultimo.slice(5)) / 3); const d = String(q * 3 - 2).padStart(2, '0'), h = String(q * 3).padStart(2, '0'); return { desde: `${anio}-${d}`, hasta: `${anio}-${h}`, texto: `el ${['primer', 'segundo', 'tercer', 'cuarto'][q - 1]} trimestre de ${anio}`, anual: false, dijo: true }; }
  const dijoAnio = / (?:este ano|el ano|del ano|en el ano|ano) /.test(t) || / 20\d\d /.test(t);
  return { desde: `${anio}-01`, hasta: `${anio}-12`, texto: `${anio}`, anual: true, dijo: dijoAnio };
}

const ir = (etiqueta: string, vista: 'iva' | 'documentos' | 'contabilidad' | 'banco' | 'clasificar' | 'cargar') => ({ tipo: 'ir' as const, etiqueta, vista });
const PIE = 'Sale de lo que cargaste en la app; si falta un documento, la cifra cambia.';

export function responderDatos(pregunta: string, d: DatosEmpresa, hoy = new Date()): Respuesta | null {
  const t = jerga(pregunta);
  const op: OpcionesIVA = { comisionLF: d.cfg.ivaComisionLF };
  const docs = d.docs.filter(x => x.empresa === d.empresa.rut && x.estado !== 'ANULADA');
  const mesesDocs = [...new Set(docs.map(periodoDe))].sort();
  const f29 = f29PorPeriodo(d.f29s);
  const enRango = (p: string, r: { desde: string; hasta: string }) => p >= r.desde && p <= r.hasta;

  // Remanente de crédito fiscal
  if (/ remanente /.test(t)) {
    const ult = [...f29.values()].filter(f => '077' in f.codigos).sort((a, b) => a.periodo.localeCompare(b.periodo));
    if (!ult.length) return { texto: 'No tengo F29 cargados para ver tu remanente. Carga los F29 o la carpeta tributaria del SII.', acciones: [ir('Cargar documentos', 'cargar')] };
    const u = ult[ult.length - 1], tres = ult.slice(-3);
    const exporta = docs.some(x => x.libro === 'VENTA' && (x.tipoDoc === 110 || x.tipoDoc === 111));
    return { texto: [`Tu remanente de crédito fiscal al F29 de ${mesTexto(u.periodo)} es ${$(u.codigos['077'])} (código 77).`,
      `Últimos meses: ${tres.map(f => `${mesTexto(f.periodo)} ${$(f.codigos['077'] ?? 0)}`).join('; ')}.`,
      'Se acumula cuando el IVA de tus compras (crédito) supera al de tus ventas (débito): no se pierde, pasa al mes siguiente reajustado por la UTM.',
      ...(exporta ? ['Como tienes exportaciones, que no llevan IVA, es normal que el crédito sea mayor: el exportador puede recuperar el IVA de sus compras usándolo en el F29 o pidiendo su devolución (DL 825, art. 36; DS 348 de 1975).'] : []),
      PIE].join('\n'), acciones: [ir('Ver IVA y F29', 'iva')] };
  }

  // Lo que se debe a proveedores o lo que deben los clientes
  const debo = / (?:debo|debemos|deuda\w*|proveedor\w*|por pagar) /.test(t) && !/ me deben | nos deben | cliente/.test(t);
  const meDeben = / (?:me deben|nos deben|me debe|cliente\w*|por cobrar) /.test(t);
  if (debo || meDeben) {
    const libro = debo ? 'COMPRA' : 'VENTA';
    const STOP = new Set('cuanto cuanta le les a al la el los las de del que me nos debo debemos deben debe tengo tenemos por pagar cobrar proveedor proveedores cliente clientes deuda deudas hoy plata total mi mis'.split(' '));
    const nombres = t.trim().split(' ').filter(w => w.length >= 4 && !STOP.has(w));
    let lista = docs.filter(x => x.libro === libro && (x.estado === 'POR PAGAR' || x.estado === 'POR COBRAR') && !esComisionLF(x));
    const filtro = nombres.length ? lista.filter(x => nombres.some(n => jerga(x.razonSocial).includes(` ${n}`))) : [];
    const conNombre = filtro.length > 0;
    if (conNombre) lista = filtro;
    const total = lista.reduce((a, x) => a + signoDoc(x.tipoDoc) * x.total, 0);
    const porContra = new Map<string, number>();
    for (const x of lista) porContra.set(x.razonSocial, (porContra.get(x.razonSocial) ?? 0) + signoDoc(x.tipoDoc) * x.total);
    const top = [...porContra].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const antigua = lista.map(x => x.fechaEmision).sort()[0];
    const quien = debo ? 'proveedores' : 'clientes';
    if (!lista.length) return { texto: nombres.length && !conNombre ? `No encontré documentos pendientes de ${nombres.join(' ')}. Revisa el nombre como aparece en el RCV.` : `No hay documentos de ${quien} pendientes en la app.`, acciones: [ir('Ver compras y ventas', 'documentos')] };
    return { texto: [`${debo ? (conNombre ? 'Le debes' : 'Debes a tus proveedores') : (conNombre ? 'Te debe' : 'Tus clientes te deben')} ${$(total)} en ${lista.length} documento${lista.length === 1 ? '' : 's'} pendiente${lista.length === 1 ? '' : 's'}${antigua ? `; el más antiguo es del ${fecha(antigua)}` : ''}.`,
      ...(top.length > 1 || !conNombre ? [`Los mayores: ${top.map(([n, m]) => `${n} ${$(m)}`).join('; ')}.`] : [`(${top[0][0]})`]),
      `Ojo: cuenta como pendiente toda factura que no esté asociada a un ${debo ? 'pago' : 'cobro'} del banco. Si ya ${debo ? 'pagaste' : 'te pagaron'} y no lo asociaste, la cifra real es menor: revísalo en Banco > Buscar cobros y pagos.`,
      ...(d.cfg.libro?.lineas.length ? [`Con el Libro Diario importado, el saldo contable de ${quien} está en Contabilidad > Balance.`] : []), PIE].join('\n'),
      acciones: [ir('Buscar cobros y pagos', 'banco')] };
  }

  // Saldo del banco
  if (/ (?:saldo|banco|plata) /.test(t) && !/ (?:iva|ventas?|compras?|resultado) /.test(t)) {
    const ult = new Map<string, Movimiento>();
    for (const m of d.movs) if (m.saldo !== null) { const u = ult.get(m.cuenta); if (!u || m.fecha >= u.fecha) ult.set(m.cuenta, m); }
    if (!ult.size) return { texto: 'No hay cartolas cargadas: no sé el saldo del banco.', acciones: [ir('Cargar documentos', 'cargar')] };
    const l = [...ult.values()], total = l.reduce((a, m) => a + (m.saldo ?? 0), 0);
    return { texto: [`Según la última cartola cargada de cada cuenta tienes ${$(total)}${l.length > 1 ? ` en ${l.length} cuentas` : ''}:`,
      ...l.map(m => `• ${m.banco || 'Cuenta'} ${m.cuenta}: ${$(m.saldo ?? 0)} al ${fecha(m.fecha)}`), 'Si pasaron días desde esa cartola, el saldo de hoy puede ser otro.'].join('\n'), acciones: [ir('Ver el banco', 'banco')] };
  }

  const r = periodoPedido(t, mesesDocs.length ? mesesDocs : [...f29.keys()].sort(), hoy);

  // IVA, PPM, retenciones e impuestos pagados en el F29
  if (/ (?:iva|ppm|f29|impuestos?|retenciones?|impuesto unico) /.test(t)) {
    const todos = [...f29.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
    // Sin período en la pregunta ("¿cuánto IVA pagué?"): el último F29 cargado
    const declarados = r.dijo ? todos.filter(f => enRango(f.periodo, r)) : todos.slice(-1);
    const k = (c: string) => declarados.reduce((a, f) => a + (f.codigos[c] ?? 0), 0);
    if (!declarados.length) {
      if (!r.anual) {
        const x = totalesRCV(docs, r.desde, op);
        if (x.docsVenta + x.docsCompra) return { texto: `Aún no cargas el F29 de ${r.texto}. Según el RCV: IVA débito ${$(x.debito)}, crédito ${$(x.credito)}; ${x.debito >= x.credito ? `el IVA del mes sería ${$(x.debito - x.credito)}, antes de descontar el remanente del mes anterior` : `quedaría remanente de ${$(x.credito - x.debito)} más el del mes anterior`}. El borrador completo está en IVA y F29.`, acciones: [ir('Ver el borrador del F29', 'iva')] };
      }
      return { texto: `No tengo F29 cargados de ${r.texto}. Carga los PDF o la carpeta tributaria del SII.`, acciones: [ir('Cargar documentos', 'cargar')] };
    }
    if (declarados.length === 1) {
      const f = declarados[0], c = (x: string) => f.codigos[x] ?? 0;
      return { texto: [`En el F29 de ${mesTexto(f.periodo)} (folio ${f.folio}${f.fechaPresentacion ? `, presentado el ${f.fechaPresentacion}` : ''}) declaraste:`,
        `• IVA: débito ${$(c('538'))}, crédito ${$(c('537'))} (incluye el remanente anterior ${$(c('504'))}): IVA a pagar ${$(c('089'))}${c('077') ? ` y quedó remanente de ${$(c('077'))}` : ''}.`,
        `• PPM ${$(c('062'))}${c('115') ? ` (tasa ${(c('115') * 100).toLocaleString('es-CL')}%)` : ''}; retención de honorarios ${$(c('151'))}; impuesto único ${$(c('048'))}.`,
        `• Total pagado: ${$(c('91'))}.`].join('\n'), acciones: [ir('Ver IVA y F29', 'iva')] };
    }
    const faltan = r.anual ? [] : (() => { const l: string[] = []; for (let p = r.desde; p <= r.hasta; p = `${p.slice(0, 4)}-${String(Number(p.slice(5)) + 1).padStart(2, '0')}`) if (!f29.has(p)) l.push(mesTexto(p)); return l; })();
    return { texto: [`En ${r.texto} tienes ${declarados.length} F29 cargados (${mesTexto(declarados[0].periodo)} a ${mesTexto(declarados[declarados.length - 1].periodo)}):`,
      `• IVA pagado ${$(k('089'))}; PPM ${$(k('062'))}; retención de honorarios ${$(k('151'))}; impuesto único ${$(k('048'))}.`,
      `• Total pagado en los F29: ${$(k('91'))}.`, `• Remanente al último F29: ${$(declarados[declarados.length - 1].codigos['077'] ?? 0)}.`,
      ...(k('089') === 0 && (declarados[declarados.length - 1].codigos['077'] ?? 0) > 0 ? ['No pagaste IVA en esos meses: el crédito fiscal superó al débito y quedó remanente. Lo que pagaste fue PPM y retenciones.'] : []),
      ...(faltan.length ? [`Faltan los F29 de ${faltan.join(', ')}.`] : [])].join('\n'), acciones: [ir('Ver IVA y F29', 'iva')] };
  }

  // Resultado del período (contabilidad)
  if (/ (?:resultado|utilidad\w*|ganancia\w*|perdida\w*|gane|ganamos|perdi\w*) /.test(t)) {
    const c = contabilidad({ empresa: d.empresa.rut, docs: d.docs, f29s: d.f29s, movs: d.movs, libros: d.libros, honorarios: d.honorarios }, d.cfg, r.desde, r.hasta);
    if (!c.balance.filas.length) return { texto: `No hay movimientos contables en ${r.texto}.`, acciones: [ir('Ver la contabilidad', 'contabilidad')] };
    const l = (n: string) => c.eerr.find(x => x.concepto === n)?.monto ?? 0;
    const res = c.eerr[c.eerr.length - 1].monto, rev = l('Compras por revisar (sin categoría)');
    return { texto: [`Resultado contable ${de(r.texto)}: ${res >= 0 ? 'utilidad' : 'pérdida'} de ${$(Math.abs(res))}.`,
      `• Ingresos ${$(l('Ingresos de actividades ordinarias'))}; costo de ventas ${$(l('Costo de ventas'))}; margen bruto ${$(l('Margen bruto'))}.`,
      `• Gastos de administración ${$(l('Gastos de administración y ventas'))}; personal ${$(l('Remuneraciones, leyes sociales y honorarios'))}; depreciación ${$(l('Depreciación'))}; otros ingresos ${$(l('Otros ingresos'))}; gastos financieros ${$(l('Gastos financieros'))}.`,
      ...(rev ? [`Ojo: hay ${$(Math.abs(rev))} en compras sin categoría; cuando las clasifiques, el resultado se reparte en sus líneas (el total no cambia).`] : []),
      'Es el resultado contable, no la renta líquida imponible del F22 (esa se ajusta por gastos rechazados y otras partidas).'].join('\n'), acciones: [ir('Ver el estado de resultados', 'contabilidad')] };
  }

  // Ventas o compras netas
  const ventas = / (?:ventas?|vendi\w*) /.test(t), compras = / (?:compras?|compr\w*|gast\w*) /.test(t);
  if (ventas || compras) {
    const delR = docs.filter(x => enRango(periodoDe(x), r));
    if (!delR.length) return { texto: `No hay documentos del RCV ${de(r.texto)}.`, acciones: [ir('Cargar documentos', 'cargar')] };
    const suma = (libro: 'VENTA' | 'COMPRA') => delR.filter(x => x.libro === libro).reduce((a, x) => a + signoDoc(x.tipoDoc) * (x.neto + x.exento), 0);
    const v = suma('VENTA'), cpr = suma('COMPRA');
    const top = (libro: 'VENTA' | 'COMPRA') => { const m = new Map<string, number>(); for (const x of delR.filter(y => y.libro === libro)) m.set(x.razonSocial, (m.get(x.razonSocial) ?? 0) + signoDoc(x.tipoDoc) * (x.neto + x.exento)); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3); };
    const meses = [...new Set(delR.map(periodoDe))].sort();
    const lineas = [
      ...(ventas ? [`Ventas netas ${de(r.texto)}: ${$(v)} (${delR.filter(x => x.libro === 'VENTA').length} documentos; las notas de crédito restan).`, `Principales clientes: ${top('VENTA').map(([n, m]) => `${n} ${$(m)}`).join('; ')}.`] : []),
      ...(compras ? [`Compras netas ${de(r.texto)}: ${$(cpr)} (${delR.filter(x => x.libro === 'COMPRA').length} documentos).`, `Principales proveedores: ${top('COMPRA').map(([n, m]) => `${n} ${$(m)}`).join('; ')}.`] : []),
      ...(r.anual && meses.length < 12 ? [`Hay documentos de ${meses.length} meses (${mesTexto(meses[0])} a ${mesTexto(meses[meses.length - 1])}).`] : []),
      'Son montos netos (sin IVA) del RCV, por el mes de registro del SII.',
    ];
    return { texto: lineas.join('\n'), acciones: [ir('Ver compras y ventas', 'documentos')] };
  }
  return null;
}
