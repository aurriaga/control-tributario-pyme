// Reconoce qué documento es un archivo por su CONTENIDO (encabezados y frases típicas), no solo por su nombre.
// Equivale a ClasificarArchivo de modDocumentos.bas, pero sin depender de la carpeta donde quedó el archivo.
import type { Contenido } from './extraer';
import { normalizar, periodoEnTexto } from './texto';
import { formatearRUT, rutValido, rutEnNombre } from './rut';

export type TipoDoc = 'RCV_COMPRA' | 'RCV_VENTA' | 'CARTOLA' | 'F29' | 'F22' | 'CARPETA_TRIBUTARIA' | 'REMUNERACIONES'
  | 'HONORARIOS' | 'LIBRO_DIARIO' | 'FACTURA' | 'BOLETA' | 'DESCONOCIDO';

export const NOMBRE_TIPO: Record<TipoDoc, string> = {
  RCV_COMPRA: 'RCV de compras', RCV_VENTA: 'RCV de ventas', CARTOLA: 'Cartola bancaria', F29: 'Formulario 29',
  F22: 'Formulario 22', CARPETA_TRIBUTARIA: 'Carpeta tributaria', REMUNERACIONES: 'Libro de remuneraciones',
  HONORARIOS: 'Boletas de honorarios', LIBRO_DIARIO: 'Libro Diario', FACTURA: 'Factura', BOLETA: 'Boleta o voucher',
  DESCONOCIDO: 'No reconocido',
};

export interface Clasificacion {
  tipo: TipoDoc;
  confianza: 'alta' | 'media' | 'baja';
  periodo: string;        // AAAA-MM (o AAAA para documentos anuales); '' si no se sabe
  rutEmpresa: string;     // RUT de la empresa dueña del documento, si aparece
  banco: string;          // solo cartolas
  motivo: string;         // por qué se reconoció así, en lenguaje simple
}

const BANCOS: [RegExp, string][] = [
  [/santander/, 'Santander'], [/bancoestado|bancodelestado/, 'BancoEstado'], [/bancodechile|bancochile|edwards/, 'Banco de Chile'],
  [/\bbci\b|creditoeinversiones|bancodecredito/, 'BCI'], [/itau/, 'Itaú'], [/scotiabank|scotia/, 'Scotiabank'], [/bice/, 'BICE'],
  [/security/, 'Security'], [/falabella/, 'Banco Falabella'], [/ripley/, 'Banco Ripley'], [/consorcio/, 'Consorcio'], [/bancointernacional/, 'Internacional'],
];

/** Fila de encabezados: la primera de las 15 primeras con 3 o más celdas y una que diga fecha, rut o folio. */
function encabezados(c: Contenido): string[] {
  for (const h of c.hojas) for (const f of h.filas.slice(0, 15)) {
    const llenas = f.filter(x => x.trim());
    if (llenas.length >= 3 && llenas.some(x => /fecha|rut|folio/i.test(x))) return llenas.map(normalizar);
  }
  return [];
}

function rutDeEmpresa(nombre: string, texto: string): string {
  const enNombre = rutEnNombre(nombre);
  if (enNombre) return enNombre;
  const m = texto.slice(0, 4000).match(/r\.?u\.?t\.?\s*(?:empresa|contribuyente|empleador)?\s*(?:\[\d+\])?\s*[:.]?\s*(\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK])/i);
  const rut = m ? formatearRUT(m[1].replace(/\s/g, '')) : '';
  return rutValido(rut) ? rut : '';
}

function periodoDeContenido(texto: string): string {
  const t = texto.slice(0, 6000);
  let m = t.match(/per[ií]odo(?:\s+tributario)?\s*(?:\[\d+\])?\s*[:.]?\s*(0?[1-9]|1[0-2])\s*[/-]\s*(20\d\d)/i);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = t.match(/per[ií]odo(?:\s+tributario)?\s*(?:\[\d+\])?\s*[:.]?\s*(20\d\d)\s*[/-]?\s*(0[1-9]|1[0-2])(?!\d)/i);
  if (m) return `${m[1]}-${m[2]}`;
  m = t.match(/fecha\s*hasta\s*[:.]?\s*\d{1,2}[/-](\d{1,2})[/-](20\d\d)/i);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  // el SII escribe "correpondiente" y a veces la ñ llega mal codificada
  m = t.match(/(?:a.{1,2}o tributario|informe corr?espondiente al a.{1,2}o)\s*[:.]?\s*(20\d\d)/i);
  if (m) return m[1];
  return mesMasFrecuente(texto);
}

/** Mes (AAAA-MM) que más se repite en las fechas dd/mm/aaaa del texto: sirve para cartolas y libros sin período escrito. */
function mesMasFrecuente(texto: string): string {
  const cuenta = new Map<string, number>();
  for (const m of texto.matchAll(/\b\d{1,2}[/-](0?[1-9]|1[0-2])[/-](20\d\d)\b/g)) {
    const k = `${m[2]}-${m[1].padStart(2, '0')}`; cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  let mejor = '', n = 2;                      // al menos 3 fechas del mismo mes
  for (const [k, v] of cuenta) if (v > n) { mejor = k; n = v; }
  return mejor;
}

export function clasificar(nombre: string, c: Contenido): Clasificacion {
  const n = normalizar(c.texto.slice(0, 30000));
  const cab = encabezados(c);
  const tiene = (...k: string[]) => k.some(x => n.includes(x));
  const cabTiene = (...k: string[]) => k.some(x => cab.some(h => h.includes(x)));
  const base = { periodo: periodoEnTexto(nombre) || periodoDeContenido(c.texto), rutEmpresa: rutDeEmpresa(nombre, c.texto), banco: '' };
  const r = (tipo: TipoDoc, confianza: Clasificacion['confianza'], motivo: string): Clasificacion => ({ ...base, tipo, confianza, motivo });

  if (cabTiene('rutproveedor') || (tiene('rutproveedor') && tiene('montoivarecuperable')))
    return r('RCV_COMPRA', 'alta', 'Tiene las columnas del Registro de Compras del SII (RUT Proveedor, IVA recuperable).');
  if (cabTiene('rutcliente') || (tiene('rutcliente') && tiene('montoiva')))
    return r('RCV_VENTA', 'alta', 'Tiene las columnas del Registro de Ventas del SII (Rut cliente, monto IVA).');
  // Un texto suelto sin tabla (notas, instrucciones) no es un libro ni una cartola aunque los nombre
  if (c.formato === 'texto' && cab.length < 3)
    return r('DESCONOCIDO', 'baja', 'Es un texto sin tabla de datos (parece una nota o instrucciones).');
  // Títulos y frases que identifican el documento: se buscan al comienzo, para que una glosa como
  // "PAGO SII F29 FORMULARIO 29" dentro de una cartola no la haga pasar por un F29
  const cabeza = normalizar(c.texto.slice(0, 1500));
  const enCabeza = (...k: string[]) => k.some(x => cabeza.includes(x));
  // Un Libro Diario se reconoce antes que una cartola: su portada o sus notas pueden nombrar la cartola del banco
  if (enCabeza('librodiario') || (cabTiene('asiento', 'comprobante') && cabTiene('cuenta', 'codigo') && cabTiene('debe', 'debito') && cabTiene('haber', 'credito') && !cabTiene('saldo')))
    return r('LIBRO_DIARIO', enCabeza('librodiario') ? 'alta' : 'media', 'Tiene asientos con número, cuenta, debe y haber.');
  if (!enCabeza('carpetatributaria') && enCabeza('estadodesituacionfinanciera', 'estadosfinancieros', 'balancegeneral', 'estadoderesultados'))
    return r('DESCONOCIDO', 'media', 'Son estados financieros (balance y estado de resultados). La app no los carga como datos; sus saldos de cierre sirven para la apertura en Contabilidad.');
  const columnasBanco = cabTiene('saldo') && cabTiene('cargo', 'abono', 'debe', 'haber', 'monto', 'deposito', 'giro') && !enCabeza('librodiario');
  const movimientos = (c.texto.match(/^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b.*\d[\d.,]{2,}/gm) ?? []).length;
  if (columnasBanco || (enCabeza('cartola') && (movimientos >= 2 || c.formato === 'planilla'))) {
    const banco = BANCOS.find(([re]) => re.test(cabeza) || re.test(normalizar(nombre)))?.[1] ?? '';
    return { ...r('CARTOLA', enCabeza('cartola') && columnasBanco ? 'alta' : 'media', 'Tiene movimientos con fecha, cargos o abonos y saldo, como una cartola.'), banco };
  }
  if (enCabeza('carpetatributaria')) return r('CARPETA_TRIBUTARIA', 'alta', 'Dice "Carpeta Tributaria".');
  if (enCabeza('formulario29', 'formulariono29', 'formularion29') || (enCabeza('declaracionmensual') && enCabeza('pagosimultaneo')))
    return r('F29', 'alta', 'Es la declaración mensual y pago simultáneo de impuestos (Formulario 29).');
  if (enCabeza('formulario22', 'formulariono22', 'form22') || enCabeza('impuestosanualesalarenta') || (enCabeza('declaracionanual') && enCabeza('renta'))) {
    const at = nombre.match(/_(20\d\d)_/)?.[1] ?? c.texto.match(/a[ñn]o\s+tributario\s*[:.]?\s*(20\d\d)/i)?.[1] ?? '';
    return { ...r('F22', 'alta', 'Es la declaración anual de impuesto a la renta (Formulario 22).'), periodo: at ? `AT ${at}` : base.periodo };
  }
  if (enCabeza('libroderemuneraciones') || (cabTiene('sueldobase', 'imponible', 'liquido', 'totalhaberes') && cabTiene('afp', 'salud', 'imponible', 'cesantia')))
    return r('REMUNERACIONES', enCabeza('libroderemuneraciones') ? 'alta' : 'media', 'Tiene columnas de remuneraciones (sueldo base, imponible, AFP, salud).');
  if ((tiene('honorario') && tiene('retencion', 'boleta')) || enCabeza('boletasdehonorarios', 'informeanualrec'))
    return r('HONORARIOS', 'alta', 'Es un informe de boletas de honorarios con retenciones.');
  if (enCabeza('librodiario') || (cabTiene('cuenta') && cabTiene('debe') && cabTiene('haber') && !cabTiene('saldo')))
    return r('LIBRO_DIARIO', enCabeza('librodiario') ? 'alta' : 'media', 'Tiene asientos con cuenta, debe y haber.');
  if (tiene('facturaelectronica', 'facturaexenta', 'notadecreditoelectronica') && tiene('folio', 'rut'))
    return r('FACTURA', 'media', 'Parece una factura o nota de crédito electrónica.');
  if (tiene('boletaelectronica', 'voucher', 'comprobantedeventa'))
    return r('BOLETA', 'media', 'Parece una boleta o voucher de venta.');
  return r('DESCONOCIDO', 'baja', c.texto.trim()
    ? 'No tiene los encabezados ni las frases de ningún documento conocido.'
    : 'No se encontró texto en el archivo.');
}
