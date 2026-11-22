// Lector de documentos: recibe cualquier archivo, lo extrae, reconoce qué es y lo envía al lector que corresponde.
import { extraer, type Servicios, type Formato } from './extraer';
import { clasificar, NOMBRE_TIPO, type Clasificacion, type TipoDoc } from './clasificar';
import { importarRCV, type Documento, type Empresa } from './rcv';
import { leerF29, controlF29, type F29 } from './f29';
import { leerCartola, type Movimiento } from './cartola';
import { leerLibroRemuneraciones, leerHonorarios, type LibroRemuneraciones, type InformeHonorarios } from './remuneraciones';

export type Estado = 'leido' | 'reconocido' | 'otra_empresa' | 'no_reconocido' | 'error';

export interface ResultadoLectura {
  archivo: string;
  formato: Formato;
  clasificacion: Clasificacion;
  estado: Estado;
  titulo: string;           // "RCV de ventas, julio 2026"
  mensaje: string;          // qué se hizo, en lenguaje simple
  avisos: string[];
  documentos: Documento[];  // documentos del RCV leídos
  f29?: F29;                // formulario 29 leído
  movimientos?: Movimiento[];   // movimientos de una cartola
  libro?: LibroRemuneraciones;  // libro de remuneraciones del mes
  honorarios?: InformeHonorarios;
}

// En qué etapa del plan se agrega la lectura completa de cada tipo (mientras tanto se reconoce y se informa)
const ETAPA: Partial<Record<TipoDoc, string>> = {
  F22: 'la etapa de contabilidad', CARPETA_TRIBUTARIA: 'la etapa de contabilidad',
  LIBRO_DIARIO: 'la etapa de contabilidad',
  FACTURA: 'una próxima etapa', BOLETA: 'una próxima etapa',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function periodoLegible(p: string): string {
  const m = p.match(/^(\d{4})-(\d{2})$/);
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : p;
}

export interface Contexto { empresas: Empresa[]; clavesExistentes: Set<string>; servicios?: Servicios }

export async function leerArchivo(nombre: string, bytes: Uint8Array, ctx: Contexto): Promise<ResultadoLectura> {
  let contenido;
  try { contenido = await extraer(nombre, bytes, ctx.servicios); }
  catch (e) {
    const cl = clasificar(nombre, { formato: 'vacio', texto: '', hojas: [], ocr: false });
    return { archivo: nombre, formato: 'vacio', clasificacion: cl, estado: 'error', titulo: 'No se pudo leer',
      mensaje: `No se pudo abrir el archivo (${(e as Error).message}).`, avisos: [], documentos: [] };
  }
  const cl = clasificar(nombre, contenido);
  const avisos = contenido.aviso ? [contenido.aviso] : [];
  const extra = [cl.banco, cl.periodo && periodoLegible(cl.periodo)].filter(Boolean).join(', ');
  const titulo = NOMBRE_TIPO[cl.tipo] + (extra ? `, ${extra}` : '');
  const res: ResultadoLectura = { archivo: nombre, formato: contenido.formato, clasificacion: cl, estado: 'reconocido', titulo, mensaje: '', avisos, documentos: [] };

  if (cl.tipo === 'DESCONOCIDO') {
    res.estado = 'no_reconocido';
    res.mensaje = `${cl.motivo} Se esperaba un RCV, cartola, F29, F22, libro de remuneraciones, boletas de honorarios o Libro Diario.`;
    return res;
  }
  const registrada = ctx.empresas.some(e => e.rut === cl.rutEmpresa);
  if (cl.rutEmpresa && !registrada) {
    res.estado = 'otra_empresa';
    res.mensaje = `Es de la empresa RUT ${cl.rutEmpresa}, que no está registrada. No se carga, para no mezclarla con ${ctx.empresas[0]?.rut ?? 'la empresa activa'}.`;
    return res;
  }
  if (cl.tipo === 'RCV_COMPRA' || cl.tipo === 'RCV_VENTA') {
    const r = importarRCV(nombre, contenido.texto, { empresas: ctx.empresas, clavesExistentes: ctx.clavesExistentes });
    res.avisos.push(...r.avisos.filter(a => !a.startsWith('Duplicado')));
    if (r.error) { res.estado = 'error'; res.mensaje = r.error; return res; }
    res.estado = 'leido';
    res.documentos = r.documentos;
    const n = r.documentos.length;
    res.mensaje = (n === 0 ? 'Ningún documento nuevo' : n === 1 ? '1 documento cargado' : `${n} documentos cargados`)
      + (r.duplicados ? `, ${r.duplicados === 1 ? '1 repetido omitido' : r.duplicados + ' repetidos omitidos'}` : '')
      + (r.lineasInvalidas ? `, ${r.lineasInvalidas} líneas sin tipo, folio o fecha` : '') + '.';
    return res;
  }
  if (cl.tipo === 'REMUNERACIONES') {
    const r = leerLibroRemuneraciones(nombre, contenido);
    if (!r.dato) { res.estado = 'error'; res.mensaje = r.mensaje; return res; }
    res.estado = 'leido'; res.libro = r.dato; res.mensaje = r.mensaje;
    res.titulo = `Libro de remuneraciones, ${periodoLegible(r.dato.periodo)}`;
    const malas = r.dato.trabajadores.filter(t => t.control !== 'OK');
    if (malas.length) res.avisos.push(...malas.slice(0, 3).map(t => `${t.nombre || t.rut}: ${t.control.replace('Revisar: ', '')}.`));
    return res;
  }
  if (cl.tipo === 'HONORARIOS') {
    const r = leerHonorarios(nombre, contenido);
    if (!r.dato) { res.estado = 'error'; res.mensaje = r.mensaje; return res; }
    res.estado = 'leido'; res.honorarios = r.dato; res.mensaje = r.mensaje;
    res.titulo = `Boletas de honorarios recibidas, ${r.dato.anio}`;
    return res;
  }
  if (cl.tipo === 'CARTOLA') {
    const c = leerCartola(nombre, contenido, cl.banco);
    res.avisos.push(...c.avisos);
    if (!c.movimientos.length) { res.mensaje = c.mensaje; return res; }
    res.estado = 'leido';
    res.movimientos = c.movimientos;
    res.titulo = `Cartola${cl.banco ? ' ' + cl.banco : ''}${c.cuenta ? ', cuenta ' + c.cuenta : ''}${cl.periodo ? ', ' + periodoLegible(cl.periodo) : ''}`;
    res.mensaje = c.mensaje + (c.cuadra === false ? ' Los saldos no cuadran: revisa los avisos.' : '');
    return res;
  }
  if (cl.tipo === 'F29') {
    const f = leerF29(contenido.texto, nombre);
    if (!f) { res.mensaje = 'Es un F29, pero no se encontró el período (casillero 15). Descárgalo de nuevo desde el SII como formulario compacto.'; return res; }
    const $ = (n?: number) => '$' + Math.round(n ?? 0).toLocaleString('de-DE');
    res.estado = 'leido';
    res.f29 = f;
    res.mensaje = `F29 ${f.tipo ? f.tipo.toLowerCase() + ' ' : ''}presentado el ${f.fechaPresentacion || '(sin fecha)'}: IVA a pagar ${$(f.codigos['089'])}, PPM ${$(f.codigos['062'])} y total pagado ${$(f.codigos['91'])}.`;
    res.avisos.push(...controlF29(f));
    return res;
  }
  res.mensaje = `${cl.motivo} Ya está reconocido; su lectura completa se agrega en ${ETAPA[cl.tipo] ?? 'una próxima etapa'}.`;
  return res;
}
