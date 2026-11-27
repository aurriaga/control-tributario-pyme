// Importación del Registro de Compras y Ventas (RCV) del SII. Equivale a modImportRCV.bas.
// Archivo esperado: el CSV de "Descargar detalle" del RCV (separador ";"). El libro (compras o ventas) se detecta por
// los encabezados: "RUT Proveedor" -> compras, "Rut cliente" -> ventas. Las columnas se ubican por nombre, así un
// cambio de orden del SII no rompe la importación. Los documentos repetidos (misma clave) se omiten.
import { formatearRUT, rutEnNombre } from './rut';
import { normalizar, detectarSeparador, separarCSV, parseFecha, parseMonto, periodoEnTexto, decodificar } from './texto';

export type Libro = 'COMPRA' | 'VENTA';

export interface Documento {
  libro: Libro;
  clave: string;            // ventas: empresa|tipo|folio · compras: rutProveedor|tipo|folio
  empresa: string;          // RUT de la empresa dueña del registro
  tipoDoc: number;          // 33 factura, 34 exenta, 61 nota de crédito, etc.
  folio: number;
  fechaEmision: string;     // AAAA-MM-DD
  fechaRecepcion: string | null;
  rutContraparte: string;   // proveedor (compras) o cliente (ventas)
  razonSocial: string;
  exento: number;
  neto: number;
  iva: number;              // ventas: IVA débito · compras: IVA recuperable + IVA de uso común
  ivaNoRecuperable: number; // solo compras
  otrosImpuestos: number;   // total − exento − neto − IVA (− IVA no recuperable)
  total: number;
  plazoDias: number;
  estado: 'POR COBRAR' | 'POR PAGAR' | 'COBRADA' | 'PAGADA' | 'ANULADA';   // ANULADA: no existe en el SII o el usuario la anuló
  fechaPago?: string;       // AAAA-MM-DD del movimiento del banco que la cobró o pagó
  origen: string;           // "RCV <nombre del archivo>"
  observacion: string;
  periodoRCV: string;       // AAAA-MM del archivo del SII ('' si no viene en el nombre)
  categoria?: string;       // compras: categoría de gasto puesta a mano (si no, la aprendida para el proveedor)
}

/** Un documento anulado no cuenta en el IVA, el F29, el resumen ni la contabilidad, pero se conserva para la trazabilidad. */
export const vigente = (d: Documento) => d.estado !== 'ANULADA';

/** Signo de un documento en los totales: las notas de crédito (61, 60) y la nota de crédito de exportación (112) restan.
 *  Es la única regla de signo de la app: el F29, el resumen, el panel, el cruce y la contabilidad la usan. */
export const signoDoc = (tipo: number) => (tipo === 60 || tipo === 61 || tipo === 112 ? -1 : 1);

/** Liquidación-factura en el registro de compras (40 y 43): es la comisión que cobra el mandatario (feria, consignatario)
 *  por la venta que hizo a nombre de la empresa. La venta misma viene, con el mismo folio, en el registro de ventas. */
export const esComisionLF = (d: Pick<Documento, 'libro' | 'tipoDoc'>) => d.libro === 'COMPRA' && (d.tipoDoc === 40 || d.tipoDoc === 43);

/** Cómo declara la empresa el IVA de la comisión de las liquidaciones-factura: como crédito fiscal (es el IVA de un
 *  servicio que le cobran) o como débito, como lo propone el SII en el F29 (código 501). Lo decide el usuario. */
export type IvaComisionLF = 'credito' | 'debito';
export interface OpcionesIVA { comisionLF?: IvaComisionLF }
const hoyTexto = () => { const f = new Date(); return `${String(f.getDate()).padStart(2, '0')}-${String(f.getMonth() + 1).padStart(2, '0')}-${f.getFullYear()}`; };
export function anularDocumento(d: Documento, motivo: string, fecha = hoyTexto()): Documento {
  return { ...d, estado: 'ANULADA', observacion: `Anulado el ${fecha}${motivo.trim() ? `: ${motivo.trim()}` : ''}.${d.observacion ? ' ' + d.observacion : ''}` };
}
/** Vuelve a dejar vigente un documento anulado: pagado o cobrado si tiene fecha de pago, si no pendiente. */
export function reactivarDocumento(d: Documento): Documento {
  const estado = d.fechaPago ? (d.libro === 'VENTA' ? 'COBRADA' : 'PAGADA') : (d.libro === 'VENTA' ? 'POR COBRAR' : 'POR PAGAR');
  return { ...d, estado, observacion: d.observacion.replace(/^Anulado el [^.]*.s*/, '') };
}

export interface Empresa { rut: string; razonSocial: string }

export interface OpcionesImportacion {
  empresas: Empresa[];          // empresas registradas (la primera es la activa)
  clavesExistentes?: Set<string>;
  plazoPorDefecto?: number;
  periodoManual?: string;       // AAAA-MM, si el nombre del archivo no trae el período
}

export interface ResultadoImportacion {
  archivo: string;
  libro: Libro | null;
  documentos: Documento[];
  duplicados: number;
  lineasInvalidas: number;
  avisos: string[];
  error: string | null;
  mensaje: string;
}

const OBLIGATORIAS = ['tipodoc', 'folio', 'fechadocto', 'razonsocial', 'montototal'];

export function importarRCV(nombreArchivo: string, contenido: Uint8Array | string, op: OpcionesImportacion): ResultadoImportacion {
  const res: ResultadoImportacion = { archivo: nombreArchivo, libro: null, documentos: [], duplicados: 0, lineasInvalidas: 0, avisos: [], error: null, mensaje: '' };
  const falla = (msg: string) => { res.error = msg; res.mensaje = `${nombreArchivo}: ${msg}`; return res; };

  if (/PENDIENTE|RECLAMAD/i.test(nombreArchivo)) return falla('parece ser de documentos PENDIENTES o RECLAMADOS, no del registro. No se importa.');
  const texto = typeof contenido === 'string' ? contenido : decodificar(contenido);
  let lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  if (lineas.length < 2) return falla('archivo vacío.');
  // Encabezados: la primera de las 10 primeras líneas que trae "RUT Proveedor" o "Rut cliente" (puede haber un título antes)
  const lc = lineas.slice(0, 10).findIndex(l => { const n = normalizar(l); return n.includes('rutproveedor') || n.includes('rutcliente'); });
  if (lc > 0) lineas = lineas.slice(lc);
  if (lineas.length < 2) return falla('archivo vacío.');
  const sep = detectarSeparador(lineas[0]);
  const mapa = new Map<string, number>();
  separarCSV(lineas[0], sep).forEach((c, i) => { const k = normalizar(c); if (!mapa.has(k)) mapa.set(k, i); });

  const libro: Libro | null = mapa.has('rutproveedor') ? 'COMPRA' : mapa.has('rutcliente') ? 'VENTA' : null;
  if (!libro) return falla("no se reconoce como RCV (falta la columna 'RUT Proveedor' o 'Rut cliente').");
  res.libro = libro;
  for (const c of OBLIGATORIAS) if (!mapa.has(c)) return falla(`falta la columna '${c}' en el archivo.`);

  // El nombre del archivo del SII trae el RUT de la empresa: si no está registrada no se importa,
  // para no cargar sus documentos a nombre de otra empresa (y descuadrar su F29)
  const activa = op.empresas[0]?.rut ?? '';
  const rutArch = rutEnNombre(nombreArchivo);
  if (rutArch && !op.empresas.some(e => e.rut === rutArch)) {
    return falla(activa
      ? `es de la empresa RUT ${rutArch}, que no está registrada. No se importa, para no mezclarla con ${activa}. Si corresponde, agrégala primero en Empresas.`
      : `no se importa porque aún no hay empresa registrada. Primero registra el RUT ${rutArch} y su razón social y vuelve a importar.`);
  }
  const empresa = rutArch || activa;
  if (!empresa) return falla('no hay empresa registrada.');

  // Período del registro (el F29 usa este mes en compras): viene en el nombre del archivo del SII
  const periodo = periodoEnTexto(nombreArchivo) || op.periodoManual || '';
  if (!periodo) res.avisos.push('Sin período del registro: se usó el mes de emisión de cada factura (revisa el crédito del F29).');

  const campo = (fila: string[], nombre: string) => { const i = mapa.get(nombre); return i === undefined || i >= fila.length ? '' : fila[i].trim(); };
  const claves = op.clavesExistentes ?? new Set<string>();
  const enLote = new Map<string, Documento>();

  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i].trim()) continue;
    const fila = separarCSV(lineas[i], sep);
    const tipo = parseInt(campo(fila, 'tipodoc'), 10) || 0;
    const folioTxt = campo(fila, 'folio');
    const fEmi = parseFecha(campo(fila, 'fechadocto'));
    const rut = formatearRUT(campo(fila, libro === 'VENTA' ? 'rutcliente' : 'rutproveedor'));
    if (!tipo || !/^\d+(\.\d+)?$/.test(folioTxt) || !fEmi) {
      res.lineasInvalidas++;
      res.avisos.push(`Línea ${i + 1 + Math.max(lc, 0)}: sin tipo, folio o fecha válidos. Se omite.`);
      continue;
    }
    const folio = Number(folioTxt);
    const clave = libro === 'VENTA' ? `${empresa}|${tipo}|${folio}` : `${rut}|${tipo}|${folio}`;
    const previo = enLote.get(clave);
    if (previo && parseMonto(campo(fila, 'montototal')) === 0) {
      // Línea adicional del mismo documento: el SII pone cada impuesto adicional en otra línea
      previo.observacion = [previo.observacion, textoOtrosImpuestos(fila, campo)].filter(Boolean).join(' ');
      continue;
    }
    if (claves.has(clave)) { res.duplicados++; res.avisos.push(`Duplicado omitido ${clave}`); continue; }
    claves.add(clave);
    const doc = armarDocumento(libro, fila, campo, { empresa, tipo, folio, fEmi, rut, clave, archivo: nombreArchivo, periodo, plazo: op.plazoPorDefecto ?? 30 });
    enLote.set(clave, doc);
    res.documentos.push(doc);
  }
  res.mensaje = `${nombreArchivo} (${libro}): ${res.documentos.length} importados, ${res.duplicados} duplicados omitidos`
    + (res.lineasInvalidas ? `, ${res.lineasInvalidas} líneas inválidas` : '') + '.'
    + (periodo ? '' : ' ATENCIÓN: sin período del registro, se usó el mes de emisión de cada factura (revisa el crédito del F29).');
  return res;
}

type Campo = (fila: string[], nombre: string) => string;

function armarDocumento(libro: Libro, fila: string[], campo: Campo,
  d: { empresa: string; tipo: number; folio: number; fEmi: string; rut: string; clave: string; archivo: string; periodo: string; plazo: number }): Documento {
  const exento = parseMonto(campo(fila, 'montoexento'));
  const neto = parseMonto(campo(fila, 'montoneto'));
  const total = parseMonto(campo(fila, 'montototal'));
  const obs: string[] = [];
  const oi = textoOtrosImpuestos(fila, campo); if (oi) obs.push(oi);
  let iva: number, ivaNoRec = 0;
  if (libro === 'VENTA') {
    iva = parseMonto(campo(fila, 'montoiva'));
    if (parseMonto(campo(fila, 'ivaretenidototal')) + parseMonto(campo(fila, 'ivaretenidoparcial')) !== 0) obs.push('IVA retenido por el comprador (cambio de sujeto).');
  } else {
    const ivaUC = parseMonto(campo(fila, 'ivausocomun'));
    iva = parseMonto(campo(fila, 'montoivarecuperable')) + ivaUC;
    ivaNoRec = parseMonto(campo(fila, 'montoivanorecuperable'));
    if (ivaUC !== 0) obs.push('Incluye IVA de uso común: revisar proporcionalidad.');
    if (d.tipo === 43 || d.tipo === 40) obs.push('Liquidación-factura recibida: es la comisión que cobra el mandatario (feria, consignatario) por una venta hecha a nombre de la empresa; la venta viene con el mismo folio en el registro de ventas.');
  }
  return {
    libro, clave: d.clave, empresa: d.empresa, tipoDoc: d.tipo, folio: d.folio, fechaEmision: d.fEmi,
    fechaRecepcion: parseFecha(campo(fila, 'fecharecepcion')), rutContraparte: d.rut, razonSocial: campo(fila, 'razonsocial'),
    exento, neto, iva, ivaNoRecuperable: ivaNoRec, otrosImpuestos: total - exento - neto - iva - ivaNoRec, total,
    plazoDias: d.plazo, estado: libro === 'VENTA' ? 'POR COBRAR' : 'POR PAGAR', origen: `RCV ${d.archivo}`,
    observacion: obs.join(' '), periodoRCV: d.periodo,
  };
}

/** "Otros imp. SII cód 35: $16.041." a partir de las columnas de otro impuesto de la línea. */
function textoOtrosImpuestos(fila: string[], campo: Campo): string {
  const cod = campo(fila, 'codigootroimpuesto') || campo(fila, 'codigootroimp');
  const valor = parseMonto(campo(fila, 'valorotroimpuesto')) + parseMonto(campo(fila, 'valorotroimp'));
  return cod ? `Otros imp. SII cód ${cod}: $${valor.toLocaleString('de-DE')}.` : '';
}

// ------------------------------------------------------------------ resumen del RCV
/** Tipos de documento que el SII entrega solo como total mensual en el resumen del registro de ventas (no en el detalle):
 *  boletas (35, 38, 39, 41) y comprobantes de pago electrónico o vouchers de tarjeta (48). */
export const SOLO_EN_RESUMEN = new Set([35, 38, 39, 41, 48]);
/** RUT genérico del consumidor final que usa el SII para las ventas con boleta. */
export const RUT_CONSUMIDOR_FINAL = '66.666.666-6';
const finDeMes = (p: string) => { const [y, m] = p.split('-').map(Number); return `${p}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
export const esResumen = (d: Pick<Documento, 'origen'>) => d.origen.startsWith('RCV resumen');

/** Lee el resumen del RCV ("Descargar resumen": una fila por tipo de documento con su cantidad y montos). De ventas se
 *  cargan las boletas y los comprobantes de pago (no vienen en el detalle) como un documento por tipo y mes; las facturas
 *  y notas se informan, porque vienen en el detalle del RCV y se cargan desde ahí. De compras no se carga nada. */
export function importarResumenRCV(nombreArchivo: string, contenido: Uint8Array | string, op: OpcionesImportacion): ResultadoImportacion {
  const res: ResultadoImportacion = { archivo: nombreArchivo, libro: null, documentos: [], duplicados: 0, lineasInvalidas: 0, avisos: [], error: null, mensaje: '' };
  const falla = (msg: string) => { res.error = msg; res.mensaje = `${nombreArchivo}: ${msg}`; return res; };
  const texto = typeof contenido === 'string' ? contenido : decodificar(contenido);
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  const ie = lineas.findIndex(l => { const n = normalizar(l); return n.includes('tipodocumento') && n.includes('totaldocumentos'); });
  if (ie < 0) return falla('no tiene el encabezado del resumen del RCV (Tipo Documento, Total Documentos, montos).');
  const sep = detectarSeparador(lineas[ie]);
  const mapa = new Map<string, number>();
  separarCSV(lineas[ie], sep).forEach((c, i) => mapa.set(normalizar(c), i));
  const nom = normalizar(nombreArchivo), cuerpo = normalizar(texto.slice(0, 500));
  const libro: Libro | null = /venta/.test(nom) || /venta/.test(cuerpo) ? 'VENTA' : /compra/.test(nom) || /compra/.test(cuerpo) ? 'COMPRA' : null;
  if (!libro) return falla('no se sabe si es el resumen de ventas o de compras: el nombre del archivo del SII lo dice (RESUMEN_VENTA o RESUMEN_COMPRA).');
  res.libro = libro;
  const activa = op.empresas[0]?.rut ?? '';
  const rutArch = rutEnNombre(nombreArchivo);
  if (rutArch && !op.empresas.some(e => e.rut === rutArch))
    return falla(`es de la empresa RUT ${rutArch}, que no está registrada. No se importa, para no mezclarla con ${activa || 'otra empresa'}. Si corresponde, agrégala primero en Empresas.`);
  const empresa = rutArch || activa;
  if (!empresa) return falla('no hay empresa registrada.');
  const periodo = periodoEnTexto(nombreArchivo) || op.periodoManual || '';
  if (!periodo) return falla('no se sabe de qué mes es: el nombre del archivo del SII trae el período (AAAAMM).');

  const col = (fila: string[], k: string) => { const i = mapa.get(k); return i === undefined ? '' : (fila[i] ?? '').trim(); };
  const claves = op.clavesExistentes ?? new Set<string>();
  const enDetalle: string[] = [];
  for (const l of lineas.slice(ie + 1)) {
    const fila = separarCSV(l, sep);
    const nombreTipo = col(fila, 'tipodocumento');
    const tipo = Number(nombreTipo.match(/\((\d{2,3})\)\s*$/)?.[1] ?? 0);
    if (!tipo) { if (nombreTipo) res.lineasInvalidas++; continue; }
    const cant = parseMonto(col(fila, 'totaldocumentos')), exento = parseMonto(col(fila, 'montoexento')), neto = parseMonto(col(fila, 'montoneto'));
    const iva = parseMonto(col(fila, 'montoiva')), total = parseMonto(col(fila, 'montototal'));
    const legible = nombreTipo.replace(/^total mes\s*/i, '').replace(/\s*\(\d+\)\s*$/, '');
    const $ = (n: number) => '$' + Math.round(n).toLocaleString('de-DE');
    if (libro === 'COMPRA' || !SOLO_EN_RESUMEN.has(tipo)) { enDetalle.push(`${legible} (${tipo}): ${cant} documentos por ${$(total)}`); continue; }
    const clave = `${empresa}|R${tipo}|${periodo}`;
    if (claves.has(clave)) { res.duplicados++; res.avisos.push(`Duplicado omitido ${clave}`); continue; }
    claves.add(clave);
    res.documentos.push({
      libro, clave, empresa, tipoDoc: tipo, folio: Number(periodo.replace('-', '')), fechaEmision: finDeMes(periodo), fechaRecepcion: null,
      rutContraparte: RUT_CONSUMIDOR_FINAL, razonSocial: `${legible} del mes (${cant} ${cant === 1 ? 'documento' : 'documentos'})`,
      exento, neto, iva, ivaNoRecuperable: 0, otrosImpuestos: total - exento - neto - iva, total, plazoDias: 0, estado: 'POR COBRAR',
      origen: `RCV resumen ${nombreArchivo}`, periodoRCV: periodo,
      observacion: `Total del mes según el resumen del RCV (${cant} ${cant === 1 ? 'documento' : 'documentos'}). El cobro llega al banco en efectivo o por la red de tarjetas: asócialo en Banco.`,
    });
  }
  if (enDetalle.length) res.avisos.push(`${libro === 'COMPRA' ? 'De compras' : 'Facturas y notas'}: vienen en el detalle del RCV, que es el que se carga (Descargar detalle en el SII). ${enDetalle.join('; ')}.`);
  const n = res.documentos.length;
  res.mensaje = n ? `${n === 1 ? '1 total mensual cargado' : `${n} totales mensuales cargados`} (boletas o comprobantes de pago, que solo vienen en el resumen).`
    : libro === 'COMPRA' ? 'Es el resumen del registro de compras: no se carga, porque la app usa el detalle (cada factura con su proveedor).'
    : res.duplicados ? 'Ese resumen ya estaba cargado.' : 'El resumen no trae boletas ni comprobantes de pago: las facturas se cargan desde el detalle del RCV.';
  return res;
}
