// Riffo Junior arma asientos a partir de una frase ("compré un notebook en 800.000 neto con transferencia").
// Separa el IVA (19%: el neto se calcula y el IVA va por diferencia), elige las cuentas del plan, propone la glosa,
// explica el criterio y deja escritos los supuestos. El usuario confirma antes de agregarlo como asiento manual.
import type { Cuenta, LineaManual } from './contabilidad';
import { sugerirCategoria, texto as normal } from './sugerir';
import { normativa, retencionHonorarios } from './normativa';

export interface LineaPropuesta { codigo: number; cuenta: string; debe: number; haber: number }
export interface AsientoPropuesto {
  titulo: string; fecha: string; glosa: string; lineas: LineaPropuesta[];
  calculo?: string; porque: string; supuestos: string[]; aviso?: string;
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('de-DE');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Monto de la frase: "$1.190.000", "1190000", "1,5 millones", "500 mil". Toma el mayor (los otros suelen ser años o folios). */
export function montoDe(t: string): number | null {
  const s = t.toLowerCase();
  const cand: number[] = [];
  // Con palabra: "1,5 millones", "500 mil", "30 palos" (millones), "119 lucas" (miles), "20k", "5 gambas" (cientos)
  const FACTOR: Record<string, number> = { millones: 1e6, millon: 1e6, mm: 1e6, m: 1e6, palos: 1e6, palo: 1e6, mil: 1e3, lucas: 1e3, luca: 1e3, k: 1e3, gambas: 100, gamba: 100 };
  for (const m of s.matchAll(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d{1,2})?)\s*(millones|millon|mm|mil|palos?|lucas?|gambas?|m\b|k\b)/g)) {
    const n = Number(/\.\d{3}/.test(m[1]) ? m[1].replace(/\./g, '').replace(',', '.') : m[1].replace(',', '.'));
    cand.push(n * FACTOR[m[2]]);
  }
  for (const m of s.matchAll(/\b(?:un|una) (palo|luca|millon)\b/g)) cand.push(FACTOR[m[1]]);
  for (const m of s.matchAll(/\$?\s*(\d{1,3}(?:\.\d{3})+|\d{4,})(?![\d.,]*\s*(?:millones|millon|mil|palos?|lucas?|gambas?|k\b)\b)/g)) cand.push(Number(m[1].replace(/\./g, '')));
  const validos = cand.filter(n => n >= 100 && !(n >= 1990 && n <= 2100 && Number.isInteger(n) && cand.length > 1));
  return validos.length ? Math.round(Math.max(...validos)) : null;
}

/** Fecha de la frase ("el 15/10", "15-10-2026", "15 de octubre"); si no hay, hoy. */
export function fechaDe(t: string, hoy: string): { fecha: string; supuesta: boolean } {
  const y = hoy.slice(0, 4);
  const a = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (a) { const an = a[3] ? (a[3].length === 2 ? `20${a[3]}` : a[3]) : y; return { fecha: `${an}-${a[2].padStart(2, '0')}-${a[1].padStart(2, '0')}`, supuesta: false }; }
  const b = normal(t).match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?/);
  if (b) return { fecha: `${b[3] ?? y}-${String(MESES.indexOf(b[2]) + 1).padStart(2, '0')}-${b[1].padStart(2, '0')}`, supuesta: false };
  return { fecha: hoy, supuesta: true };
}

/** Separa neto e IVA. Si la frase no lo dice: boleta = bruto; cifra "redonda con IVA" (1.190.000) = bruto; si no, neto. */
function conIVA(monto: number, t: string, boleta: boolean) {
  const tasa = normativa().iva;
  const dice = /\b(mas iva|\+ ?iva|neto|sin iva)\b/.test(t) ? 'neto' : /\b(con iva|iva incluido|bruto|total)\b/.test(t) ? 'bruto' : '';
  const redondoBruto = monto % 1190 === 0 && (monto / 1.19) % 1000 === 0;
  const bruto = dice ? dice === 'bruto' : boleta || redondoBruto;
  const neto = bruto ? Math.round(monto / (1 + tasa)) : monto, iva = bruto ? monto - neto : Math.round(monto * tasa);
  return { neto, iva, total: neto + iva, supuesto: dice ? '' : bruto ? `Tomé ${pesos(monto)} como total con IVA${boleta ? ' (boleta)' : ' (cifra redonda con IVA)'}.` : `Tomé ${pesos(monto)} como neto (sin IVA).`,
    calculo: bruto ? `Bruto ${pesos(monto)} ÷ 1,19 → neto ${pesos(neto)} + IVA ${pesos(iva)}` : `Neto ${pesos(neto)} × 19% → IVA ${pesos(iva)}; total ${pesos(neto + iva)}` };
}

const ACTIVO_FIJO = /\b(notebook|computador\w*|computacional\w*|vehiculo|camioneta|auto|automovil|camion|maquina\w*|grua|horquilla|mueble\w*|escritorio)\b/;

export function proponerAsiento(frase: string, plan: Cuenta[], hoy = new Date().toISOString().slice(0, 10)): AsientoPropuesto | null {
  const t = normal(frase), monto = montoDe(frase);
  const cuenta = (c: number) => plan.find(x => x.codigo === c)?.nombre ?? `Cuenta ${c}`;
  const { fecha, supuesta } = fechaDe(frase, hoy);
  const supuestos: string[] = supuesta ? [`Usé la fecha de hoy (${fecha.split('-').reverse().join('-')}); si el documento tiene otra, cámbiala.`] : [];
  const L = (codigo: number, debe: number, haber: number): LineaPropuesta => ({ codigo, cuenta: cuenta(codigo), debe: Math.round(debe), haber: Math.round(haber) });
  const medio = (): { codigo: number; texto: string } => {
    if (/\b(efectivo|caja|contado en efectivo)\b/.test(t)) return { codigo: 1101, texto: 'en efectivo (Caja)' };
    if (/\b(credito|a plazo|por pagar|por cobrar|30 dias|60 dias|90 dias|fiado)\b/.test(t)) return { codigo: 0, texto: 'a crédito' };
    if (!/\b(transferencia|banco|cheque|tarjeta|debito|deposito|pague|pago|pagamos|cobre|cobramos|contado)\b/.test(t)) supuestos.push('No dijiste cómo se pagó: lo dejé por el banco.');
    return { codigo: 1102, texto: 'por el banco' };
  };
  const listo = (a: Omit<AsientoPropuesto, 'fecha' | 'supuestos'>): AsientoPropuesto => ({ ...a, fecha, supuestos });

  // Depreciación: valor del bien y vida útil (años); por defecto, un mes
  if (/\bdeprecia/.test(t)) {
    if (!monto) return null;
    const anios = Number(t.match(/\b(\d{1,2}) anos?\b/)?.[1]) || (/\b(computador\w*|notebook)\b/.test(t) ? normativa().vidaUtil.computadores
      : /\b(vehiculo|camioneta|auto|camion)\w*/.test(t) ? normativa().vidaUtil.vehiculos : /\bmueble/.test(t) ? normativa().vidaUtil.muebles : normativa().vidaUtil.maquinaria);
    const anual = /\b(anual|del ano|un ano)\b/.test(t);
    const cuota = Math.round(monto / anios / (anual ? 1 : 12));
    if (!t.match(/\b\d{1,2} anos?\b/)) supuestos.push(`Usé la vida útil normal del SII: ${anios} años (Res. Ex. 43/2002).`);
    return listo({ titulo: `Depreciación ${anual ? 'anual' : 'mensual'}`, glosa: `Depreciación ${anual ? 'del año' : 'del mes'}: bien de ${pesos(monto)}, vida útil ${anios} años, lineal`,
      lineas: [L(5302, cuota, 0), L(1209, 0, cuota)], calculo: `${pesos(monto)} ÷ ${anios} años${anual ? '' : ' ÷ 12 meses'} = ${pesos(cuota)}`,
      porque: 'La depreciación reparte el costo del activo fijo en su vida útil: es gasto del período (5302) contra la depreciación acumulada (1209), que rebaja el valor del activo sin tocar el banco (NIIF para PYMES, Sección 17).' });
  }
  if (!monto) return null;
  // Aporte de capital, retiro de socios y préstamo recibido (sin IVA)
  if (/\baporte\b.*\bcapital\b|\baporte de los socios\b/.test(t)) return listo({ titulo: 'Aporte de capital', glosa: 'Aporte de capital de los socios', lineas: [L(1102, monto, 0), L(3101, 0, monto)], porque: 'Entra plata al banco y aumenta el patrimonio (Capital). No lleva IVA.' });
  if (/\bretir\w* (de )?(socio|dueno)|\bretiro\b/.test(t)) return listo({ titulo: 'Retiro de socios', glosa: 'Retiro del socio', lineas: [L(3103, monto, 0), L(1102, 0, monto)], porque: 'El retiro no es gasto: disminuye el patrimonio (Retiros de socios) y sale del banco. No lleva IVA.' });
  if (/\bprestamo\b/.test(t) && /\b(recib|nos dieron|otorg|obtuv|pidi)\w*/.test(t)) return listo({ titulo: 'Préstamo bancario recibido', glosa: 'Préstamo bancario recibido', lineas: [L(1102, monto, 0), L(2201, 0, monto)], porque: 'Entra plata al banco y nace una deuda (Préstamos bancarios). No es ingreso ni lleva IVA.' });
  // Honorarios: bruto, retención según el año
  if (/\bhonorario/.test(t)) {
    const tasa = retencionHonorarios(Number(fecha.slice(0, 4))), ret = Math.round(monto * tasa), m = medio();
    return listo({ titulo: 'Boleta de honorarios recibida', glosa: 'Boleta de honorarios', calculo: `Bruto ${pesos(monto)} × ${(tasa * 100).toLocaleString('es-CL')}% = retención ${pesos(ret)}; líquido ${pesos(monto - ret)}`,
      lineas: [L(5214, monto, 0), L(2105, 0, ret), L(m.codigo || 2107, 0, monto - ret)],
      porque: `El gasto es el bruto; la empresa retiene el ${(tasa * 100).toLocaleString('es-CL')}% y lo paga en el F29 (código 151), y al prestador le paga el líquido. Las boletas de honorarios no llevan IVA.`,
      aviso: 'Si cargaste el informe de honorarios del SII, la app ya registra los honorarios del mes: no lo agregues otra vez.' });
  }
  // Traspaso entre cuentas propias: sale de un banco y entra al otro; no es ingreso ni gasto
  if (/\btraspas\w*|\bentre (mis|nuestras|las) cuentas\b|\bde una cuenta a otra\b/.test(t)) {
    const bancos = plan.filter(c => c.tipo === 'Activo' && (c.rol === 'banco' || (c.cuentaBancaria ?? '').replace(/\D/g, '').length >= 6));
    if (bancos.length >= 2) return listo({ titulo: 'Traspaso entre cuentas propias', glosa: `Traspaso de ${bancos[0].nombre} a ${bancos[1].nombre}`,
      lineas: [L(bancos[1].codigo, monto, 0), L(bancos[0].codigo, 0, monto)], porque: 'La plata cambia de cuenta: entra a una y sale de la otra por el mismo monto. No es ingreso ni gasto. Revisa que el origen y el destino sean los correctos.',
      aviso: 'Si las dos cartolas están cargadas, basta con clasificar ambos movimientos como "Traspaso entre cuentas propias": no lo agregues otra vez.' });
    return listo({ titulo: 'Traspaso entre cuentas propias', glosa: 'Traspaso entre cuentas propias (sale)', lineas: [L(1198, monto, 0), L(1102, 0, monto)],
      porque: 'Mientras la plata va de una cuenta a otra queda en 1198 Traspasos entre cuentas propias; cuando entra al otro banco se hace el asiento inverso (1102 al debe, 1198 al haber) y la transitoria queda en cero.',
      aviso: 'Si cada banco tiene su propia cuenta en el plan (con su número en "Cuenta bancaria"), el traspaso va directo de una a otra. Si las dos cartolas están cargadas, clasifica ambos movimientos como "Traspaso entre cuentas propias".' });
  }
  // Exportaciones (exentas de IVA) y su nota de crédito
  if (/\bexport\w*/.test(t)) {
    const deb = /\b(cobr\w*|transferencia|banco|deposit\w*|me pagaron)\b/.test(t) ? 1102 : 1103;    // por omisión, queda por cobrar al cliente del exterior
    if (deb === 1103) supuestos.push('No dijiste si ya te pagaron: lo dejé por cobrar al cliente del exterior.');
    if (/\bnota de credito\b|\bnc\b/.test(t)) return listo({ titulo: 'Nota de crédito de exportación', glosa: 'Nota de crédito de exportación (documento 112)', lineas: [L(4101, monto, 0), L(1103, 0, monto)],
      porque: 'La nota de crédito rebaja la venta de exportación y lo que te debe el cliente del exterior. No lleva IVA, y en el F29 rebaja las exportaciones del mes (código 20), que también son base del PPM.',
      aviso: 'Si la nota de crédito ya está en el RCV que cargaste, la app la contabiliza sola.' });
    return listo({ titulo: 'Venta de exportación', glosa: 'Venta de exportación (factura de exportación, documento 110)', lineas: [L(deb, monto, 0), L(4101, 0, monto)],
      porque: 'La exportación es una venta exenta de IVA (DL 825, art. 12 letra D): no hay débito fiscal. El IVA de las compras para exportar se puede recuperar (art. 36). Se registra por el valor en pesos del documento; las diferencias de cambio al cobrar van a resultado.',
      aviso: 'Si la factura de exportación ya está en el RCV que cargaste, la app la contabiliza sola.' });
  }
  // Ventas
  const boleta = /\bboleta\b/.test(t);
  if (/\b(vend\w*|venta|factur\w* a)\b/.test(t)) {
    const v = conIVA(monto, t, boleta); if (v.supuesto) supuestos.push(v.supuesto);
    const m = medio(), deb = m.codigo || 1103;
    return listo({ titulo: `Venta ${m.codigo ? m.texto : 'a crédito'}`, glosa: `Venta ${boleta ? 'con boleta' : 'con factura'} ${m.texto}`, calculo: v.calculo,
      lineas: [L(deb, v.total, 0), L(4101, 0, v.neto), L(2103, 0, v.iva)],
      porque: `Aumenta ${deb === 1103 ? 'lo que te deben los clientes' : 'la plata'} por el total; la venta se reconoce por el neto (NIIF para PYMES, Sección 23) y el IVA cobrado es deuda con el Fisco (IVA Débito Fiscal).`,
      aviso: /\b(feria|consignat\w*|remate\w*|liquidacion)\b/.test(t)
        ? 'Si vendiste por una feria o un consignatario, el documento es una liquidación-factura: además de la venta, la feria descuenta su comisión, que es un gasto (5105 Comisiones de ventas). Si ya está en el RCV, la app registra las dos partes sola.'
        : 'Si la factura o boleta ya está en el RCV que cargaste, la app la contabiliza sola: agrégalo solo si no está.' });
  }
  // Compras y gastos
  if (/\b(compr\w*|pague|pago|gasto|factura|arriendo|luz|agua|internet|combustible|bencina|flete|comision\w*)\b/.test(t)) {
    const af = ACTIVO_FIJO.test(t) && plan.some(c => c.codigo === 1201);
    const cats = [...new Set(plan.map(c => c.categoria).filter((c): c is string => !!c))];
    const extra: [RegExp, string][] = [[/\b(luz|agua|internet|telefono|celular|gas)\b/, 'Servicios básicos'], [/\b(bencina|combustible|petroleo|diesel)\b/, 'Combustibles y lubricantes'], [/\barriendo\b/, 'Arriendos'], [/\bflete\b/, 'Fletes y despacho'],
      [/\bcomision\w*/, 'Comisiones de ventas'], [/\b(fertilizante\w*|semillas?|forraje|alimento para|insumos? agricola\w*|abono\w*|ganado|vaquillas?|novillos?|terneros?)\b/, 'Materiales e insumos del giro']];
    const cat = af ? 'Activo fijo' : (extra.find(([re]) => re.test(t))?.[1] ?? sugerirCategoria(frase, cats)?.categoria ?? '');
    const cGasto = plan.find(c => c.categoria === cat)?.codigo ?? (af ? 1201 : 5211);
    if (!cat) supuestos.push('No supe el tipo de gasto: lo dejé en 5211 Gastos generales; cámbialo si corresponde.');
    const sinIVA = /\b(exento|sin iva|honorario)\b/.test(t);
    const v = sinIVA ? { neto: monto, iva: 0, total: monto, supuesto: '', calculo: '' } : conIVA(monto, t, boleta);
    if (v.supuesto) supuestos.push(v.supuesto);
    const m = medio(), hab = m.codigo || 2101;
    const lineas = boleta || sinIVA ? [L(cGasto, v.total, 0), L(hab, 0, v.total)] : [L(cGasto, v.neto, 0), L(1106, v.iva, 0), L(hab, 0, v.total)];
    if (boleta) supuestos.push('Con boleta no hay crédito fiscal: el IVA queda dentro del gasto.');
    return listo({ titulo: af ? 'Compra de activo fijo' : 'Compra o gasto', glosa: `${af ? 'Compra de activo fijo' : `Compra ${cat ? cat.toLowerCase() : ''}`.trim()} con ${boleta ? 'boleta' : 'factura'} ${m.texto}`, calculo: v.calculo || undefined, lineas,
      porque: af ? 'Un bien que dura más de un año no es gasto: se activa (NIIF para PYMES, Sección 17) y después se deprecia. El IVA de la factura es crédito fiscal.'
        : `El gasto se reconoce cuando ocurre (devengo, Sección 2) por el neto${boleta ? ' (con boleta, por el total)' : ''}; el IVA de la factura es crédito fiscal (DL 825, art. 23) y ${hab === 2101 ? 'queda la deuda con el proveedor' : 'sale la plata'}.`,
      aviso: 'Si la factura ya está en el RCV que cargaste, la app la contabiliza sola: agrégalo solo si no está (por ejemplo, una boleta o un gasto sin documento en el RCV).' });
  }
  return null;
}

/** Líneas para "Asientos manuales" (todas con el mismo N°). */
export const comoManual = (a: AsientoPropuesto, numero: string): LineaManual[] =>
  a.lineas.map(l => ({ asiento: numero, fecha: a.fecha, codigo: l.codigo, glosa: a.glosa, documento: '', debe: l.debe, haber: l.haber }));
