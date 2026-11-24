// Asistente de la app: responde "¿cómo hago…?" con la ayuda propia de la app, revisa la empresa (controles e integridad
// de los datos) y propone arreglos seguros. Todo ocurre en el navegador: no usa servicios externos ni envía datos.
import type { Documento, Empresa } from './rcv';
import type { Movimiento } from './cartola';
import type { F29 } from './f29';
import type { LibroRemuneraciones, MesHonorarios } from './remuneraciones';
import { aperturaSugerida, type ConfigContable, type Control } from './contabilidad';
import { reaplicarReglas, type Regla } from './cruce';
import { montoDe } from './asientosAyuda';
import { esTributaria } from './tributario';
import { normativa, retencionHonorarios, ppmMinimo } from './normativa';
import { jerga, pideDefinicion, esTerminoSuelto } from './vocabulario';
import { pideBusqueda, type Doc } from './buscador';
import { pideDatos } from './consultas';

export type Vista = 'inicio' | 'cargar' | 'clasificar' | 'documentos' | 'iva' | 'personal' | 'banco' | 'contabilidad' | 'noticias';
export type Accion =
  | { tipo: 'ir'; etiqueta: string; vista: Vista; pestana?: string }
  | { tipo: 'arreglar'; etiqueta: string; arreglo: Arreglo; explica: string }
  | { tipo: 'recorrido'; etiqueta: string }
  | { tipo: 'ia'; etiqueta: string; pregunta: string; contexto?: string };
export interface Respuesta { texto: string; acciones: Accion[] }

// ------------------------------------------------------------------ ayuda ("¿cómo hago…?")
interface Tema { claves: string; texto: string; acciones?: Accion[] }
const ir = (etiqueta: string, vista: Vista, pestana?: string): Accion => ({ tipo: 'ir', etiqueta, vista, pestana });

const TEMAS: Tema[] = [
  { claves: 'cargar subir archivo documento rcv registro compras ventas sii csv excel', texto: 'Para cargar el RCV: en el SII entra a Registro de Compras y Ventas, descarga el detalle de compras y de ventas del mes (CSV o Excel) y arrástralo al buzón de "Cargar documentos". La app reconoce el archivo por su contenido y te muestra un timbre verde si lo cargó.', acciones: [ir('Ir a Cargar documentos', 'cargar')] },
  { claves: 'carpeta tributaria libro diario importar importo traer otro sistema contador anterior', texto: 'La carpeta tributaria del SII (PDF) se carga en "Cargar documentos": la app saca todos sus F29 de una vez. Un Libro Diario de otro sistema o de Excel también se arrastra ahí; en su ficha aprieta "Usar este libro": hasta su última fecha sus asientos reemplazan a los automáticos y su plan de cuentas se suma al tuyo. Se deja de usar en Contabilidad.', acciones: [ir('Ir a Cargar documentos', 'cargar')] },
  { claves: 'dos cuentas bancarias bancos varias corrientes conciliar concilio traspaso traspasos', texto: 'Con varios bancos: carga la cartola de cada cuenta; la app las separa por su número. Para que cada una tenga su cuenta contable, en "Contabilidad" > "Plan de cuentas" crea una cuenta de activo por banco y escribe su número en "Cuenta bancaria". Los traspasos entre tus cuentas clasifícalos como "Traspaso entre cuentas propias" en las dos cartolas.', acciones: [ir('Ir al plan de cuentas', 'contabilidad', 'Plan de cuentas')] },
  { claves: 'tasa ppm cambiar elegir voluntaria regimen propyme transparente', texto: 'La tasa del PPM se elige en "IVA y F29", bajo el borrador, con "Cambiar tasa del PPM": están las del SII para cada régimen (Pro Pyme, Transparente, régimen general con el cálculo del art. 84 a), la del último F29 y una voluntaria.', acciones: [ir('Ir a IVA y F29', 'iva')] },
  { claves: 'cartola banco movimientos cargar extracto santander bancoestado chile bci', texto: 'Para cargar el banco: descarga la cartola de cada mes desde tu banco (Excel, CSV o PDF) y arrástrala a "Cargar documentos". La app revisa que los saldos cuadren y no repite movimientos si cargas la misma cartola dos veces.', acciones: [ir('Ir a Cargar documentos', 'cargar')] },
  { claves: 'f29 formulario 29 declarar pdf iva mensual cuadra cuadratura', texto: 'El F29 se carga como PDF (formulario compacto descargado del SII) en "Cargar documentos". En "IVA y F29" la app lo compara mes a mes con tu RCV: "Cuadra" significa que coinciden al peso. Más abajo hay un borrador del próximo F29.', acciones: [ir('Ir a IVA y F29', 'iva')] },
  { claves: 'borrador proximo f29 calcular ppm tasa remanente utm', texto: 'El borrador del F29 está en "IVA y F29": elige el mes, revisa la tasa del PPM y la UTM. El remanente del mes anterior se reajusta con la UTM; si falta la UTM de un mes, ingrésala ahí (sii.cl > Valores y fechas > UTM).', acciones: [ir('Ir a IVA y F29', 'iva')] },
  { claves: 'sueldo sueldos remuneraciones libro trabajadores previred honorarios boletas', texto: 'Los libros de remuneraciones (uno por mes) y el informe anual de boletas de honorarios del SII se cargan en "Cargar documentos". En "Personal" la app revisa cada sueldo y calcula el aporte del empleador con el pago a PREVIRED del mes siguiente.', acciones: [ir('Ir a Personal', 'personal')] },
  { claves: 'anular documento factura nota credito no existe reactivar', texto: 'Para anular un documento que no existe en el SII: "Compras y ventas" > "Ver los documentos", busca la factura y aprieta "Anular" (escribe el motivo). Deja de contar en el IVA, el F29 y la contabilidad, pero no se borra: puedes reactivarla.', acciones: [ir('Ir a Compras y ventas', 'documentos')] },
  { claves: 'clasificar movimiento banco identificar que es cargo abono pendiente', texto: 'Los movimientos sin identificar están en "Por clasificar" > "Movimientos del banco". A cada uno le dices qué es: una clasificación (comisión, retiro de socios…), una cuenta del plan, una cuenta nueva, o lo asocias a una o varias facturas. Si hay sugerencia, basta con "Aceptar".', acciones: [ir('Ir a Por clasificar', 'clasificar')] },
  { claves: 'regla reglas recordar automatica contiene rut glosa aprender', texto: 'Al clasificar un movimiento deja marcado "Recordar como regla" y elige el tipo: glosa igual, glosa que contiene unas palabras, o el RUT de la persona. Antes de guardar te dice a cuántos movimientos les sirve. Las reglas se ven, editan, apagan o borran en "Banco" > "Reglas aprendidas".', acciones: [ir('Ir a Por clasificar', 'clasificar'), ir('Ver las reglas', 'banco')] },
  { claves: 'cuenta nueva plan cuentas crear agregar codigo', texto: 'Para crear una cuenta: al clasificar un movimiento elige "＋ Crear una cuenta nueva…" (la app propone el código), o en "Contabilidad" > "Plan de cuentas" agrégala abajo con código, nombre y tipo.', acciones: [ir('Ir al plan de cuentas', 'contabilidad', 'Plan de cuentas')] },
  { claves: 'asociar factura pago cobro conciliar cruce buscar cobros pagos', texto: 'Para unir un movimiento del banco con su factura: en "Banco" aprieta "Buscar cobros y pagos" (la app busca por RUT, nombre y monto) y acepta las sugerencias, o en "Por clasificar" usa "Asociar a facturas" y marca la o las facturas.', acciones: [ir('Ir a Banco', 'banco')] },
  { claves: 'categoria proveedor gasto compra por revisar 5990', texto: 'Cada compra va a la cuenta de la categoría de su proveedor. Elígela una vez en "Por clasificar" > "Proveedores sin categoría" (muchas vienen sugeridas) y vale para todas sus compras. Sin categoría quedan en 5990 Compras por revisar.', acciones: [ir('Ir a Por clasificar', 'clasificar')] },
  { claves: 'apertura saldo inicial balance anterior cierre 3190', texto: 'La apertura son los saldos al cierre del año anterior. Está en "Contabilidad" > "Apertura y ajustes": escribe una línea por cuenta o usa "Usar el saldo inicial de la cartola" para partir con el banco. Si no cuadra, la diferencia queda visible en 3190.', acciones: [ir('Ir a Apertura y ajustes', 'contabilidad', 'Apertura y ajustes')] },
  { claves: 'asiento manual ajuste depreciacion activo fijo reclasificacion', texto: 'Los ajustes (como la depreciación) se escriben en "Contabilidad" > "Apertura y ajustes" > "Asientos manuales". Las líneas con el mismo N° forman un asiento y solo entra si el debe es igual al haber. Vida útil SII: computadores 6 años, vehículos 7, maquinaria 15.', acciones: [ir('Ir a Apertura y ajustes', 'contabilidad', 'Apertura y ajustes')] },
  { claves: 'balance 8 columnas estado resultados ganancia perdida diario mayor contabilidad', texto: 'En "Contabilidad" están el Estado de resultados (¿ganamos o perdimos?), el Balance de 8 columnas, el Libro Diario y el Mayor. Arriba eliges los meses; todo se arma solo con lo que cargaste.', acciones: [ir('Ir a Contabilidad', 'contabilidad')] },
  { claves: 'excel descargar exportar pdf imprimir resumen año informe', texto: 'Para descargar: en Inicio "Descargar todo en Excel"; en Contabilidad "Descargar en Excel"; y en "Resumen del año" (menú) hay PDF y Excel.', acciones: [ir('Ir a Inicio', 'inicio')] },
  { claves: 'respaldo guardar abrir otro computador copia seguridad backup', texto: '"Guardar respaldo" (abajo en el menú) descarga un archivo con todo lo de la empresa. "Abrir respaldo" lo vuelve a cargar: si es de otra empresa, la agrega sin tocar las demás.', acciones: [] },
  { claves: 'empresa empresas varias otra agregar cambiar quitar multiempresa rut', texto: 'Arriba del menú está el selector "Empresa": ahí cambias de empresa o eliges "＋ Agregar empresa…". Cada empresa guarda sus datos por separado. "Quitar esta empresa" (abajo) borra solo esa del navegador.', acciones: [] },
  { claves: 'controles semaforo revisar ok pendiente rojo amarillo 17', texto: 'Los 17 controles son revisiones automáticas: verde OK, amarillo Pendiente (falta algo) y rojo Revisar (algo no calza). Están en Inicio y en Contabilidad > Revisión, cada uno con qué hacer.', acciones: [ir('Ir a Inicio', 'inicio')] },
  { claves: 'transitoria transitorias 1199 2190 por identificar aclarar', texto: 'Las cuentas transitorias (1199 cargos y 2190 abonos por identificar, 3190 apertura por completar, 5990 compras por revisar) guardan lo que todavía no se sabe qué es. Se vacían clasificando en "Por clasificar" y completando la apertura.', acciones: [ir('Ir a Por clasificar', 'clasificar')] },
  { claves: 'datos privacidad seguro internet servidor donde guarda', texto: 'Todo queda en este navegador (IndexedDB). La app no envía tus datos a ningún servidor; este asistente tampoco: responde con la ayuda de la propia app.', acciones: [] },
  { claves: 'como funciona ayuda recorrido tutorial aprender explicar', texto: 'El recorrido "¿Cómo funciona?" marca cada parte de la pantalla y la explica paso a paso.', acciones: [{ tipo: 'recorrido', etiqueta: 'Empezar el recorrido' }] },
];

/** La ayuda de la app como documentos para el buscador. */
export const temasAyuda = (): Doc[] => TEMAS.map(t => ({ tipo: 'ayuda', titulo: 'Ayuda de la app', texto: t.texto, claves: t.claves }));

const STOP = new Set('como hago puedo para que donde esta los las el la un una de del en y o a se me mi mis por con hay es son lo al cuando quiero necesito ver'.split(' '));
// Palabras que aparecen en casi todo: solas no bastan para elegir un tema (si no, "¿qué es una liquidación factura?"
// terminaba en "cómo anular una factura")
const DEBILES = new Set('factura facturas cuenta cuentas documento documentos banco iva sii mes empresa pago pagos activo activos impuesto impuestos libro cargo'.split(' '));
const tokens = (s: string) => jerga(s).trim().split(' ').filter(w => w.length > 2 && !STOP.has(w));

/** Busca el tema de ayuda que mejor calza con la pregunta (palabras en común, con prefijos para plurales). */
export function buscarAyuda(pregunta: string): Respuesta | null {
  const q = tokens(pregunta);
  if (!q.length) return null;
  let mejor: Tema | null = null, puntos = 0;
  for (const t of TEMAS) {
    const ks = t.claves.split(' ');
    const p = q.reduce((s, w) => s + (ks.some(k => k === w) ? (DEBILES.has(w) ? 1 : 2) : !DEBILES.has(w) && ks.some(k => k.length >= 4 && w.length >= 4 && (k.startsWith(w.slice(0, 5)) || w.startsWith(k.slice(0, 5)))) ? 1 : 0), 0);
    if (p > puntos) { puntos = p; mejor = t; }
  }
  return mejor && puntos >= 2 ? { texto: mejor.texto, acciones: mejor.acciones ?? [] } : null;
}

// ------------------------------------------------------------------ revisión de la empresa
export interface Datos { empresa: Empresa; docs: Documento[]; f29s: F29[]; movs: Movimiento[]; reglas: Regla[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[]; cfg: ConfigContable }
export type Arreglo = 'duplicados-docs' | 'duplicados-movs' | 'cruces-rotos' | 'reglas-huerfanas' | 'pagos-sin-fecha' | 'libros-repetidos' | 'apertura-banco';
export interface Hallazgo { nivel: 'error' | 'aviso' | 'ok'; titulo: string; detalle: string; acciones: Accion[] }

const VISTA_CONTROL: [RegExp, Vista, string?][] = [
  [/banco = cartola|transitorias/i, 'contabilidad', 'Apertura y ajustes'], [/iva del libro|utm/i, 'iva'], [/compras sin categor|documentos con observ|duplicados/i, 'clasificar'],
  [/proveedores|clientes|pagados/i, 'banco'], [/remuneraciones|honorarios/i, 'personal'], [/depreciaci|asientos manuales|signo/i, 'contabilidad', 'Apertura y ajustes'],
  [/categor|cuentas que no/i, 'contabilidad', 'Plan de cuentas'],
];

/** Errores de los datos guardados que la app puede corregir sola (con confirmación). */
export function revisarIntegridad(d: Datos): Hallazgo[] {
  const out: Hallazgo[] = [];
  const arreglar = (arreglo: Arreglo, etiqueta: string, explica: string): Accion => ({ tipo: 'arreglar', arreglo, etiqueta, explica });
  const dupDocs = d.docs.length - new Set(d.docs.map(x => x.clave)).size;
  if (dupDocs) out.push({ nivel: 'error', titulo: `${dupDocs} documentos repetidos`, detalle: 'El mismo documento (tipo, folio y contraparte) está guardado más de una vez y se suma dos veces.', acciones: [arreglar('duplicados-docs', 'Quitar los repetidos', 'Deja una sola copia de cada documento (la primera).')] });
  const dupMovs = d.movs.length - new Set(d.movs.map(m => m.clave)).size;
  if (dupMovs) out.push({ nivel: 'error', titulo: `${dupMovs} movimientos del banco repetidos`, detalle: 'El mismo movimiento está guardado más de una vez.', acciones: [arreglar('duplicados-movs', 'Quitar los repetidos', 'Deja una sola copia de cada movimiento (la primera).')] });
  const claves = new Set(d.docs.map(x => x.clave));
  const rotos = d.movs.filter(m => m.estado === 'conciliado' && (!m.docs?.length || m.docs.some(k => !claves.has(k)))).length;
  if (rotos) out.push({ nivel: 'error', titulo: `${rotos} movimientos unidos a facturas que ya no están`, detalle: 'Se borraron o reemplazaron documentos que estos movimientos pagaban o cobraban.', acciones: [arreglar('cruces-rotos', 'Volverlos a "Por clasificar"', 'Los movimientos quedan pendientes para asociarlos de nuevo.')] });
  const ids = new Set(d.reglas.map(r => r.id));
  const huerfanos = d.movs.filter(m => m.estado === 'clasificado' && m.regla && /^R\d+$/.test(m.regla) && !ids.has(m.regla)).length;
  if (huerfanos) out.push({ nivel: 'aviso', titulo: `${huerfanos} movimientos clasificados por reglas que ya no existen`, detalle: 'Quedaron clasificados por una regla borrada.', acciones: [arreglar('reglas-huerfanas', 'Revisarlos con las reglas actuales', 'Vuelven a pendientes y se aplican las reglas que existen hoy.')] })
  const sinFecha = d.docs.filter(x => (x.estado === 'PAGADA' || x.estado === 'COBRADA') && !x.fechaPago).length;
  if (sinFecha) out.push({ nivel: 'aviso', titulo: `${sinFecha} documentos pagados o cobrados sin respaldo del banco`, detalle: 'Un documento solo queda pagado con la fecha de un movimiento del banco.', acciones: [arreglar('pagos-sin-fecha', 'Dejarlos pendientes', 'Vuelven a "por pagar" o "por cobrar" hasta asociarlos con su movimiento.')] });
  const librosRep = d.libros.length - new Set(d.libros.map(l => l.periodo)).size;
  if (librosRep) out.push({ nivel: 'error', titulo: `${librosRep} libros de remuneraciones repetidos`, detalle: 'Hay más de un libro para el mismo mes.', acciones: [arreglar('libros-repetidos', 'Dejar el último de cada mes', 'Se conserva el libro cargado al final para cada mes.')] });
  if (d.movs.length && !(d.cfg.apertura?.lineas.length))
    out.push({ nivel: 'aviso', titulo: 'Falta el asiento de apertura', detalle: 'Sin apertura, el mayor del banco no parte del saldo inicial de la cartola y el control "Banco = cartola" no cuadra.', acciones: [arreglar('apertura-banco', 'Usar el saldo inicial de la cartola', 'Crea la apertura con el saldo del banco antes del primer movimiento; la contrapartida queda en 3190 para completarla con el balance anterior.'), ir('Ver la apertura', 'contabilidad', 'Apertura y ajustes')] });
  return out;
}

export function diagnosticar(d: Datos, controles: Control[]): Hallazgo[] {
  const integridad = revisarIntegridad(d);
  const deControles: Hallazgo[] = controles.filter(c => c.estado !== 'OK').map(c => {
    const v = VISTA_CONTROL.find(([re]) => re.test(c.nombre));
    return { nivel: c.estado === 'Revisar' ? 'error' : 'aviso', titulo: c.nombre, detalle: `${c.resultado}${c.accion ? ` ${c.accion}` : ''}`, acciones: v ? [ir('Llévame ahí', v[1], v[2])] : [] };
  });
  return [...integridad, ...deControles];
}

/** Aplica un arreglo y devuelve los datos corregidos (solo lo que cambia). */
export function aplicarArreglo(a: Arreglo, d: Datos): Partial<Pick<Datos, 'docs' | 'movs' | 'libros' | 'cfg'>> {
  const unico = <T,>(l: T[], k: (x: T) => string) => { const v = new Set<string>(); return l.filter(x => (v.has(k(x)) ? false : (v.add(k(x)), true))); };
  switch (a) {
    case 'duplicados-docs': return { docs: unico(d.docs, x => x.clave) };
    case 'duplicados-movs': return { movs: unico(d.movs, m => m.clave) };
    case 'cruces-rotos': {
      const claves = new Set(d.docs.map(x => x.clave));
      return { movs: d.movs.map(m => (m.estado === 'conciliado' && (!m.docs?.length || m.docs.some(k => !claves.has(k))) ? { ...m, estado: 'pendiente' as const, docs: undefined } : m)) };
    }
    case 'reglas-huerfanas': return { movs: reaplicarReglas(d.movs, d.reglas) };
    case 'pagos-sin-fecha': return { docs: d.docs.map(x => ((x.estado === 'PAGADA' || x.estado === 'COBRADA') && !x.fechaPago ? { ...x, estado: x.libro === 'VENTA' ? 'POR COBRAR' as const : 'POR PAGAR' as const } : x)) };
    case 'libros-repetidos': return { libros: [...new Map(d.libros.map(l => [l.periodo, l])).values()].sort((x, y) => x.periodo.localeCompare(y.periodo)) };
    case 'apertura-banco': { const ap = aperturaSugerida(d.movs, d.cfg); return ap ? { cfg: { ...d.cfg, apertura: ap } } : {}; }
  }
}

// ------------------------------------------------------------------ conversación
export const SALUDO: Respuesta = {
  texto: 'Hola, soy Riffo Junior, tu asistente contable. Te explico cómo hacer las cosas en la app, te digo qué falta este mes, reviso tu empresa, te ayudo a armar asientos, calculo impuestos (Primera Categoría, crédito para los dueños, IVA, PPM, retención de honorarios) y te resumo las noticias del SII. Uso la normativa que la app actualiza desde sii.cl y te digo de dónde sale cada tasa. Tus datos no salen del navegador.',
  acciones: [],
};

/** Responde una pregunta. Las órdenes "revisar" y "qué falta" se resuelven en la pantalla (necesitan los datos). */
export type Intencion = 'charla' | 'datos' | 'tributaria' | 'glosario' | 'noticias' | 'buscar' | 'asiento' | 'normativa' | 'revisar' | 'falta' | 'ayuda';
export function intencion(pregunta: string): Intencion {
  const t = jerga(pregunta);
  const monto = montoDe(pregunta);
  if (/^ *(?:hola|holi|buenas|buenos dias|buenas tardes|buenas noches|gracias|muchas gracias|ok|vale|chao|adios|hasta luego)(?: \w+){0,2} *$/.test(t)) return 'charla';
  if (pideDatos(pregunta)) return 'datos';                 // "¿cuánto IVA pagué en junio?": los números de la empresa
  // "¿qué es el CF?", "¿cuándo vence la 29?", "las DJ": definición antes que cálculo (salvo que traiga un monto para calcular)
  if ((pideDefinicion(pregunta) || esTerminoSuelto(pregunta)) && !(monto !== null && esTributaria(pregunta))) return 'glosario';
  if (esTributaria(pregunta)) return 'tributaria';
  if (/\b(noticias?|circular(es)?|resolucion(es)?|que (publico|publicó|saco) el sii|novedades del sii)\b/.test(t)) return 'noticias';
  if (pideBusqueda(pregunta)) return 'buscar';             // "¿qué cambia la reforma para las 14 A?"
  if (/\b(asiento|contabiliz\w*|registr\w*|deprecia\w*|vend\w*|venta|compr\w*|pague|gaste|aporte|retir\w*|prestamo|honorarios?|arriendo|export\w*|traspas\w*|nota de credito|comision\w*)\b/.test(t) && (montoDe(pregunta) !== null || /\bdeprecia/.test(t)) && !/\bcomo (cargo|hago|se)\b/.test(t)) return 'asiento';
  if (/\b(normativa|ley(es)?|tasa|tasas|utm|novedad\w*|cambio\w* tributari\w*|sii)\b/.test(t) && !/\bcomo (cargo|hago)\b/.test(t) && !/\b(multas?|giros?|notificaci\w*|citaci\w*|devolucion\w*|ppm)\b/.test(t)) return 'normativa';
  if (/\b(revis\w*|error(es)?|problema\w*|mal|arregl\w*|corregi\w*|falla\w*|diagnost\w*)\b/.test(t)) return 'revisar';
  if (/\b(falta\w*|pendiente\w*|mes)\b/.test(t) && !/\bcomo\b/.test(t)) return 'falta';
  return 'ayuda';
}
/** Lo que dice la normativa vigente que usa la app (y de cuándo es). */
export function respuestaNormativa(hoy = new Date(), pregunta = ''): Respuesta {
  const n = normativa(), anio = hoy.getFullYear();
  const utms = Object.entries(n.utm).sort(), [mesU, valU] = utms[utms.length - 1] ?? ['', 0];
  // "¿Cuánto es la UTM de noviembre?": el valor de ese mes, si está
  const t = jerga(pregunta), MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const im = MESES.findIndex(m => t.includes(` ${m} `));
  if (/ utm /.test(t) && im >= 0) {
    const a = t.match(/ (20\d\d) /)?.[1] ?? String(anio), k = `${a}-${String(im + 1).padStart(2, '0')}`, v = n.utm[k];
    return { texto: v ? `La UTM de ${MESES[im]} ${a} es $${v.toLocaleString('de-DE')}. Fuente: sii.cl, valores UTM (la app los actualiza cada mes).`
      : `No tengo la UTM de ${MESES[im]} ${a} (la última cargada es la de ${mesU}). Revísala en sii.cl > Valores y fechas > UTM; puedes ingresarla en IVA y F29.`, acciones: [{ tipo: 'ir', etiqueta: 'Ir a IVA y F29', vista: 'iva' }] };
  }
  const pct = (x: number) => `${(x * 100).toLocaleString('es-CL', { maximumFractionDigits: 3 })}%`;
  const lineas = [
    `Normativa actualizada al ${n.actualizado.split('-').reverse().join('-')} (${n.fuente}).`,
    mesU ? `• Última UTM publicada: ${mesU} = $${valU.toLocaleString('de-DE')}.` : '',
    `• IVA: ${pct(n.iva)}. Retención de honorarios ${anio}: ${pct(retencionHonorarios(anio))} (${anio + 1}: ${pct(retencionHonorarios(anio + 1))}).`,
    `• PPM mínimo Pro Pyme ${anio}: ${pct(ppmMinimo(anio))}.`,
    ...n.novedades.slice(0, 5).map(x => `• ${x.fecha.split('-').reverse().join('-')} · ${x.titulo}: ${x.detalle} (${x.fuente})`),
    'La UTM se actualiza sola cada mes desde sii.cl. Para un cambio de ley, revisa siempre la fuente oficial.',
  ].filter(Boolean);
  return { texto: lineas.join('\n'), acciones: [] };
}

export const NO_ENTENDI: Respuesta = {
  texto: 'No encontré respuesta para eso. Puedes preguntarme qué es un término ("¿qué es el crédito fiscal?", "¿cuándo vence la 29?", "¿qué DJ me tocan?"), pedirme un cálculo ("sácale el IVA a 119 lucas", "PPM de 10 palos al 1%"), cómo hacer algo en la app ("cartola", "regla", "anular", "respaldo"), que revise tu empresa, o contarme una operación con su monto para armar el asiento.',
  acciones: [{ tipo: 'recorrido', etiqueta: 'Ver el recorrido de la app' }],
};
