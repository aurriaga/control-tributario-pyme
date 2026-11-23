// Vocabulario de Riffo Junior: traduce la forma en que se habla de impuestos y contabilidad ("la 29", "las DJ", "el CF",
// "las imposiciones", "30 palos") a los términos que usa la app, y responde "¿qué es…?" con un glosario tributario y
// contable chileno. Cada definición cita la ley o la página del SII de donde sale; las fechas que cambian cada año
// (vencimientos de las DJ) dicen a qué año tributario corresponden.
import { texto } from './sugerir';
import { normativa, retencionHonorarios, tasaIDPC } from './normativa';
import type { Respuesta, Vista } from './asistente';

// ------------------------------------------------------------------ jerga → términos de la app
/** Palabra o frase completa (rodeada de espacios en el texto normalizado). */
const w = (src: string) => new RegExp(`(?<= )(?:${src})(?= )`, 'g');

// El orden importa: primero lo más específico ("boleta electrónica de honorarios" antes que "boleta").
const JERGA: [RegExp, string][] = [
  [w('(?:formulario|form|f|dj|ddjj|djs|declaracion(?:es)? juradas?) (1[89]\\d\\d)'), 'dj $1'],
  [w('ddjj|djs|declaracion(?:es)? juradas?'), 'dj'],
  [w('(?:formulario|form|f|la|el) 29|f 29'), 'f29'],
  [w('(?:formulario|form|f) 22|operacion renta|declaracion (?:anual )?de (?:la )?renta|declarar (?:la )?renta'), 'f22'],
  [w('(?:1ra|1era|1a|primer) categoria'), 'primera categoria'],
  [w('impuesto (?:de|a) (?:las|la) (?:empresas?|utilidades)|impuesto (?:corporativo|empresarial|de la empresa)'), 'impuesto de primera categoria'],
  [w('(?:2da|2a) categoria'), 'segunda categoria'],
  [w('impuesto al valor agregado'), 'iva'],
  [w('cf'), 'credito fiscal'],
  [w('df'), 'debito fiscal'],
  [w('bhe|bh|boletas? (?:electronicas? )?(?:de|a|por) honorarios?|boletas? de servicios?'), 'boleta de honorarios'],
  [w('imposiciones|leyes sociales|previsiones'), 'cotizaciones'],
  [w('liquidacion(?:es)? de sueldos?|sueldos?|salarios?'), 'remuneraciones'],
  [w('nc'), 'nota de credito'],
  [w('nd'), 'nota de debito'],
  [w('eerr|pyg|estado de resultados?|perdidas y ganancias|ganancias y perdidas'), 'estado de resultados'],
  [w('depre|depreciar|depreciaciones'), 'depreciacion'],
  [w('estado de cuenta|movimientos? (?:del banco|bancarios?|de la cuenta)'), 'cartola'],
  [w('(?:cuadrar|conciliar|conciliacion) (?:el |del )?banco|conciliacion bancaria'), 'conciliacion bancaria'],
  [w('rli'), 'renta liquida imponible'],
  [w('cpt'), 'capital propio tributario'],
  [w('ppms|pagos? provisional(?:es)?(?: mensual(?:es)?)?'), 'ppm'],
  [w('tesoreria(?: general)?(?: de la republica)?|tgr'), 'tgr'],
  [w('servicio de impuestos internos|impuestos internos'), 'sii'],
  [w('iut|impuesto unico(?: de segunda categoria)?(?: a los trabajadores)?'), 'impuesto unico'],
  [w('igc|gc'), 'global complementario'],
  [w('gastos? rechazados?'), 'gasto rechazado'],
  [w('gastos? aceptados?|gastos? necesarios?'), 'gasto aceptado'],
  [w('activos? fijos?|propiedad(?:es)? planta y equipos?'), 'activo fijo'],
  [w('term(?:ino)? de giro|cerrar (?:la )?empresa|cierre de (?:la )?empresa'), 'termino de giro'],
  [w('iniciar actividades|inicio de actividad(?:es)?|abrir (?:una |la )?empresa'), 'inicio de actividades'],
  [w('rectificar|rectificatoria|corregir (?:el |la )?(?:f29|f22|declaracion)'), 'rectificatoria'],
  [w('me atrase|atrasad[oa]s?|fuera de plazo|intereses? (?:por|de) atraso|multas?'), 'multa atraso'],
  [w('convenio(?: de pago)?|repactar|cuotas con (?:la )?tgr'), 'convenio de pago'],
  [w('me (?:pillo|pillaron|cacho|cacharon|cito|notifico)(?: el sii)?|fiscalizacion|citacion|auditoria del sii'), 'fiscalizacion'],
  [w('sacar plata(?: de la empresa)?|cuenta particular|retiros? de (?:los )?socios'), 'retiros'],
  [w('debe y (?:el )?haber|cargo y abono|cargar y abonar'), 'debe haber'],
];

/** Texto normalizado (minúsculas, sin tildes) con la jerga tributaria y contable traducida a los términos de la app. */
export function jerga(s: string): string {
  let t = texto(s);
  for (const [re, por] of JERGA) t = t.replace(re, por);
  return t;
}

// ------------------------------------------------------------------ declaraciones juradas (AT 2026, sii.cl)
const FUENTE_DJ = 'sii.cl, "Formularios, plazos e instrucciones de declaraciones juradas" AT 2026 (https://www.sii.cl/ayudas/ayudas_por_servicios/2120-formularios_y_plazos_2026-2171.html)';
interface DJ { n: number; nombre: string; quien: string; vence: string; claves: string }
const DJS: DJ[] = [
  { n: 1887, nombre: 'Rentas del art. 42 N° 1 (sueldos), otros componentes de la remuneración y retenciones del Impuesto Único de Segunda Categoría', quien: 'Empleadores: informa lo pagado a cada trabajador en el año y el impuesto único retenido.', vence: '27 de marzo', claves: 'remuneraciones|trabajador|empleado|impuesto unico' },
  { n: 1879, nombre: 'Retenciones efectuadas conforme a los arts. 42 N° 2 y 48 de la LIR', quien: 'Quien recibió boletas de honorarios y retuvo el impuesto: informa cada boleta y su retención.', vence: '27 de marzo', claves: 'boleta de honorarios|honorarios|retencion' },
  { n: 1948, nombre: 'Retiros, remesas y/o dividendos distribuidos y créditos correspondientes', quien: 'Empresas del régimen general (14 A) y Pro Pyme General (14 D N° 3): informa los retiros o dividendos de cada dueño y su crédito por Primera Categoría.', vence: '27 de marzo si los socios son personas naturales; 24 de marzo si son personas jurídicas; 16 de marzo para S.A. abiertas; empresarios individuales, junto con el F22', claves: 'retiros|dividendo|socio|dueno' },
  { n: 1947, nombre: 'Base imponible a tributar con impuestos finales, créditos y PPM', quien: 'Empresas Pro Pyme Transparente (14 D N° 8): informa lo que se atribuye a cada dueño.', vence: '27 de marzo (socios personas naturales); empresarios individuales, junto con el F22', claves: 'transparente|atribu' },
  { n: 1835, nombre: 'Bienes raíces arrendados', quien: 'Quien arrienda bienes raíces (como arrendador o administrador).', vence: '24 de marzo', claves: 'arriendo|arrend|bien(?:es)? raic' },
  { n: 1909, nombre: 'Desembolsos y otras partidas del inciso tercero del art. 21 de la LIR', quien: 'Empresas con gastos rechazados o partidas del art. 21 (por ejemplo, beneficios a dueños).', vence: '23 de marzo', claves: 'gasto rechazado|art(?:iculo)? 21' },
  { n: 1847, nombre: 'Balance de 8 columnas y otros antecedentes', quien: 'Según el SII, contribuyentes de Primera Categoría con deducción parcial del crédito (régimen general, 14 A).', vence: '30 de junio', claves: 'balance|8 columnas|ocho columnas' },
  { n: 1926, nombre: 'Base imponible de Primera Categoría y datos contables del balance', quien: 'Según el SII, contribuyentes con deducción parcial del crédito (régimen general, 14 A).', vence: '30 de junio', claves: 'base imponible|datos contables' },
  { n: 1832, nombre: 'Donaciones (art. 46 del D.L. N° 3.063 y otras leyes)', quien: 'Instituciones que reciben donaciones con beneficio tributario.', vence: '23 de marzo', claves: 'donacion' },
];
const djTexto = (d: DJ) => `DJ ${d.n} — ${d.nombre}.\n${d.quien}\nVence (AT 2026): ${d.vence}.`;

function respuestaDJ(t: string): Respuesta {
  const num = t.match(/ dj (\d{4}) /)?.[1];
  const una = num ? DJS.find(d => String(d.n) === num) : DJS.find(d => new RegExp(` (?:${d.claves})`).test(t));
  const pie = `Las fechas cambian cada año: confírmalas en el calendario del SII. Fuente: ${FUENTE_DJ}.`;
  if (num && !una) return { texto: `No tengo la DJ ${num} en mi lista (tengo ${DJS.map(d => d.n).join(', ')}). Búscala en el listado oficial: ${FUENTE_DJ}.`, acciones: [] };
  if (una) return { texto: `${djTexto(una)}\n${pie}`, acciones: [] };
  return {
    texto: ['Las declaraciones juradas (DJ) son informes anuales al SII. Con ellas arma la propuesta de renta (F22) y cruza lo que declaran tú, tus trabajadores y tus socios. La mayoría vence en marzo.',
      'Las que más le tocan a una pyme:',
      ...DJS.filter(d => [1887, 1879, 1948, 1835, 1909].includes(d.n)).map(d => `• DJ ${d.n} (${d.vence.split(';')[0]}): ${d.quien}`),
      '• Régimen general (14 A): además DJ 1847 (balance de 8 columnas) y DJ 1926 (base imponible), al 30 de junio. Pro Pyme Transparente (14 D N° 8): DJ 1947.',
      'Pregúntame por una en particular, por ejemplo "¿qué es la DJ 1887?".', pie].join('\n'),
    acciones: [],
  };
}

// ------------------------------------------------------------------ glosario
interface Termino { re: RegExp; texto: () => string; fuente?: string; vista?: [string, Vista, string?] }
const pct = (x: number) => `${(x * 100).toLocaleString('es-CL', { maximumFractionDigits: 3 })}%`;
const anio = () => new Date().getFullYear();
const LEY_IVA = 'DL 825, Ley sobre Impuesto a las Ventas y Servicios';
const LIR = 'DL 824, Ley sobre Impuesto a la Renta (LIR)';
const CT = 'DL 830, Código Tributario';

// El primero que calza gana: los términos compuestos van antes que los simples ("crédito fiscal" antes que "IVA").
const GLOSARIO: Termino[] = [
  // --- IVA y documentos
  { re: / remanente /, texto: () => 'Remanente de crédito fiscal: cuando en un mes el crédito fiscal (IVA de compras) es mayor que el débito fiscal (IVA de ventas), la diferencia no se paga ni se pierde: pasa al mes siguiente convertida a UTM, así se reajusta. En el F29 va en el código 77 y entra al mes siguiente en el código 504.', fuente: `${LEY_IVA}, art. 27`, vista: ['Ir a IVA y F29', 'iva'] },
  { re: / credito fiscal /, texto: () => 'Crédito fiscal: el IVA que pagas en tus compras con factura. Se descuenta del IVA de tus ventas en el F29. Solo da derecho a crédito el IVA de facturas (no de boletas) por compras relacionadas con el giro, registradas en el RCV.', fuente: `${LEY_IVA}, art. 23`, vista: ['Ir a IVA y F29', 'iva'] },
  { re: / debito fiscal /, texto: () => `Débito fiscal: el IVA (${pct(normativa().iva)}) que cobras en tus ventas afectas, con factura o boleta. Es plata del Fisco que tú recaudas: se paga en el F29, descontando el crédito fiscal.`, fuente: `${LEY_IVA}, art. 20`, vista: ['Ir a IVA y F29', 'iva'] },
  { re: / nota de credito /, texto: () => 'Nota de crédito: documento que anula o rebaja una factura ya emitida (devolución, descuento, error). Rebaja el débito fiscal de quien la emite y el crédito fiscal de quien la recibe.', fuente: `${LEY_IVA}, art. 21 y 57` },
  { re: / nota de debito /, texto: () => 'Nota de débito: documento que aumenta el monto de una factura ya emitida (por ejemplo, intereses o un cobro que faltó). Aumenta el débito fiscal de quien la emite.', fuente: `${LEY_IVA}, art. 57` },
  { re: / factura de compra /, texto: () => 'Factura de compra: la emite el comprador (no el vendedor) cuando le compra a alguien que no puede o no está obligado a facturar. El comprador retiene el IVA y lo paga él al Fisco (cambio de sujeto).', fuente: `${LEY_IVA}, art. 3` },
  { re: / guia de despacho /, texto: () => 'Guía de despacho: documento que respalda el traslado de mercadería. No cobra IVA por sí misma: la venta se factura con la factura que la acompaña o que se emite después.', fuente: `${LEY_IVA}, art. 55` },
  { re: / factura exenta | exent[oa]s? /, texto: () => 'Venta exenta: no lleva IVA porque la ley la libera (por ejemplo, algunas prestaciones de salud o educación). Se emite factura o boleta exenta y no genera débito fiscal; las compras usadas para ventas exentas no dan crédito fiscal completo.', fuente: `${LEY_IVA}, arts. 12, 13 y 23` },
  { re: / rcv | registro de compras y ventas /, texto: () => 'RCV (Registro de Compras y Ventas): el libro electrónico que arma el SII con todas tus facturas emitidas y recibidas. Es la base del F29 y de esta app: se descarga cada mes y se carga en "Cargar documentos".', fuente: 'sii.cl, Registro de Compras y Ventas', vista: ['Ir a Cargar documentos', 'cargar'] },
  { re: / boleta de honorarios /, texto: () => `Boleta de honorarios: la emiten las personas que prestan servicios en forma independiente. Si te la emiten a ti (empresa), debes retener el ${pct(retencionHonorarios(anio()))} en ${anio()} (${pct(retencionHonorarios(anio() + 1))} en ${anio() + 1}) y pagarlo en el F29. No lleva IVA.`, fuente: 'Ley 21.133; LIR art. 42 N° 2 y 74 N° 2', vista: ['Ir a Personal', 'personal'] },
  { re: / boletas? (?:de venta|electronicas?|fiscal(?:es)?) | boleta /, texto: () => 'Boleta: el documento de venta a consumidor final. Lleva el IVA incluido en el precio, así que da débito fiscal al que vende pero no da crédito fiscal al que compra.', fuente: `${LEY_IVA}, art. 53` },
  { re: / iva /, texto: () => `IVA (Impuesto al Valor Agregado): ${pct(normativa().iva)} sobre el precio neto de las ventas y servicios afectos. El IVA de tus ventas es débito fiscal; el de tus compras con factura es crédito fiscal. Cada mes pagas la diferencia en el F29; si el crédito es mayor, queda remanente.\nPara calcularlo dime el monto: "IVA de 1.000.000" (neto) o "sácale el IVA a 1.190.000" (con IVA).`, fuente: `${LEY_IVA}, art. 14`, vista: ['Ir a IVA y F29', 'iva'] },
  // --- formularios y trámites
  { re: / f29 /, texto: () => 'F29: la declaración mensual. Lleva el IVA (débito − crédito), el PPM, la retención de boletas de honorarios y el impuesto único de los trabajadores.\nPlazo: hasta el día 12 del mes siguiente; hasta el día 20 si declaras y pagas por internet y eres facturador electrónico (lo ves en tu cartola tributaria). Si cae en fin de semana o feriado, pasa al día hábil siguiente.', fuente: 'sii.cl, "¿Cuáles son los plazos para presentar el Formulario 29?" (https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1060.htm)', vista: ['Ir a IVA y F29', 'iva'] },
  { re: / f22 /, texto: () => 'F22: la declaración anual de renta (Operación Renta). Se presenta en abril por el año comercial anterior: ahí se calcula el impuesto de Primera Categoría de la empresa y se descuentan los PPM pagados; si pagaste PPM de más, la diferencia se devuelve. El SII arma una propuesta con las DJ.', fuente: `${LIR}, art. 65 y 69` },
  { re: / rectificatoria /, texto: () => 'Rectificatoria: corregir una declaración ya presentada (F29 o F22). Se hace en sii.cl con el mismo formulario del período; si resulta más impuesto, se paga la diferencia con reajuste, intereses y multa si corresponde. Si el F29 ya está declarado, el asiento contable por sí solo no lo corrige.', fuente: `${CT}, art. 36 y 126` },
  { re: / multa atraso /, texto: () => 'Declarar o pagar fuera de plazo: el impuesto se paga reajustado, con intereses por cada mes o fracción de atraso y, además, una multa. El cálculo exacto lo hace sii.cl al momento de declarar; si no puedes pagarlo todo, se puede pedir un convenio de pago con la TGR.', fuente: `${CT}, arts. 53 y 97` },
  { re: / convenio de pago /, texto: () => 'Convenio de pago: acuerdo con la Tesorería General de la República (TGR) para pagar en cuotas los impuestos atrasados. Se pide en tgr.cl.', fuente: 'Tesorería General de la República (tgr.cl)' },
  { re: / tgr /, texto: () => 'TGR (Tesorería General de la República): el organismo que recauda y cobra los impuestos. El SII determina cuánto debes; la TGR cobra, recibe pagos atrasados, da convenios y hace las devoluciones de la Operación Renta.', fuente: 'tgr.cl' },
  { re: / fiscalizacion /, texto: () => 'Fiscalización: el SII puede revisar tus declaraciones y pedirte antecedentes. Lo habitual es una notificación o una citación para que aclares, rectifiques o confirmes datos dentro de un plazo. Responde a tiempo y con respaldo (facturas, cartolas, contratos).', fuente: `${CT}, arts. 59 a 63` },
  { re: / inicio de actividades /, texto: () => 'Inicio de actividades: el aviso al SII de que empiezas un negocio. Se hace en sii.cl dentro de los dos meses siguientes a comenzar.', fuente: `${CT}, art. 68` },
  { re: / termino de giro /, texto: () => 'Término de giro: el aviso al SII de que el negocio deja de funcionar. Se da dentro de los dos meses siguientes al cierre, con un balance de término y el pago de los impuestos pendientes.', fuente: `${CT}, art. 69` },
  { re: / cartola tributaria | carpeta tributaria /, texto: () => 'Cartola y carpeta tributaria: resúmenes que entrega el SII con tu situación (declaraciones, deudas, beneficios como el plazo del F29 al día 20). La carpeta tributaria se usa para pedir créditos. Ambas se sacan en sii.cl.', fuente: 'sii.cl' },
  // --- renta
  { re: / ppm /, texto: () => 'PPM (pago provisional mensual): un anticipo del impuesto anual que se paga cada mes en el F29 como un porcentaje de las ventas. En abril, en el F22, se descuenta del impuesto de Primera Categoría; si pagaste de más, te lo devuelven.\nPara calcularlo: "PPM de 10.000.000 al 1%".', fuente: `${LIR}, art. 84`, vista: ['Ir a IVA y F29', 'iva'] },
  { re: / impuesto unico | segunda categoria /, texto: () => 'Impuesto único de Segunda Categoría: el impuesto mensual a los sueldos. Lo retiene el empleador según la tabla mensual del SII (en UTM) y lo paga en el F29; se informa en la DJ 1887.', fuente: `${LIR}, arts. 42 N° 1 y 43` },
  { re: / global complementario /, texto: () => 'Global Complementario: el impuesto personal anual de los dueños que son personas naturales. Se paga sobre retiros, dividendos, sueldos y otras rentas, con tasas progresivas, y se descuenta el crédito por el impuesto de Primera Categoría que pagó la empresa.', fuente: `${LIR}, arts. 52 y 56` },
  { re: / primera categoria | idpc /, texto: () => `Impuesto de Primera Categoría (IDPC): el impuesto anual a las utilidades de la empresa. Tasa ${anio()}: ${pct(tasaIDPC('propyme', anio()))} en Pro Pyme General (14 D N° 3) y ${pct(tasaIDPC('general', anio()))} en el régimen general (14 A); en Pro Pyme Transparente (14 D N° 8) la empresa no lo paga. Lo pagado sirve de crédito a los dueños.\nPara calcularlo: "renta de 30.000.000, ¿cuánto pago de primera categoría siendo 14 D N°3?".`, fuente: normativa().idpc.fuente },
  { re: / renta liquida imponible /, texto: () => 'Renta líquida imponible (RLI): la utilidad tributaria sobre la que se paga Primera Categoría. Parte del resultado (ingresos menos gastos aceptados) y se ajusta: se suman los gastos rechazados y se restan o agregan las diferencias que manda la ley.', fuente: `${LIR}, arts. 29 a 33` },
  { re: / capital propio tributario /, texto: () => 'Capital propio tributario (CPT): el patrimonio de la empresa medido con normas tributarias (activos tributarios menos pasivos exigibles). Se informa en el F22.', fuente: `${LIR}, art. 41` },
  { re: / rai | rex | sac | ddan | fut | registros? tributarios? /, texto: () => 'Registros tributarios: controles de las utilidades de la empresa y de los créditos para los dueños. RAI: rentas afectas a impuestos finales; REX: rentas exentas y otras; DDAN: diferencia entre depreciación acelerada y normal; SAC: saldo acumulado de créditos. El FUT es el registro antiguo que estos reemplazaron.', fuente: `${LIR}, art. 14 (Ley 21.210)` },
  { re: / gasto rechazado /, texto: () => 'Gasto rechazado: un gasto que no cumple los requisitos para rebajarse de la renta (no es necesario para el negocio, no está respaldado o es de otro año) o que la ley rechaza expresamente. No rebaja la base de Primera Categoría y, según el caso, paga un impuesto adicional del art. 21. Se informa en la DJ 1909.', fuente: `${LIR}, arts. 21 y 31` },
  { re: / gasto aceptado /, texto: () => 'Gasto aceptado: el que rebaja la renta porque es necesario para producirla, es del año, está pagado o adeudado y se respalda con documentos (factura, boleta, contrato).', fuente: `${LIR}, art. 31` },
  { re: / retiros /, texto: () => 'Retiros: la plata que el dueño o los socios sacan de la empresa para ellos. No es gasto de la empresa: en la contabilidad va a una cuenta de patrimonio (retiros o cuenta particular). Tributa en el Global Complementario del dueño, con crédito por la Primera Categoría, y se informa en la DJ 1948.', fuente: `${LIR}, arts. 14 y 54` },
  { re: / pro pyme | propyme | regimen(?:es)? tributarios? | 14 ?a | 14 ?d /, texto: () => `Regímenes de las empresas:\n• Pro Pyme General (14 D N° 3): paga Primera Categoría (${pct(tasaIDPC('propyme', anio()))} en ${anio()}) y puede llevar contabilidad simplificada; los dueños tributan al retirar.\n• Pro Pyme Transparente (14 D N° 8): la empresa no paga Primera Categoría; las utilidades se atribuyen a los dueños.\n• Régimen general (14 A): Primera Categoría ${pct(tasaIDPC('general', anio()))}; el dueño restituye el 35% del crédito.\nPara ser Pro Pyme, el promedio de ingresos de los últimos 3 años no debe pasar de 75.000 UF.`, fuente: `${LIR}, art. 14 letras A y D` },
  { re: / cotizaciones | previred /, texto: () => 'Cotizaciones previsionales: lo que se descuenta del sueldo para AFP, salud y seguro de cesantía, más los aportes que paga el empleador (seguro de invalidez, cesantía, mutual). Se pagan en PREVIRED hasta el día 10 del mes siguiente (día 13 si se pagan por internet).', fuente: 'DL 3.500, art. 19', vista: ['Ir a Personal', 'personal'] },
  { re: / remuneraciones /, texto: () => 'Remuneraciones: el sueldo y los demás pagos al trabajador. Del sueldo bruto se descuentan las cotizaciones y el impuesto único; el líquido es lo que recibe. En la app cada libro de remuneraciones se revisa en "Personal" y se contabiliza solo.', fuente: 'Código del Trabajo, art. 41', vista: ['Ir a Personal', 'personal'] },
  // --- contabilidad
  { re: / depreciacion /, texto: () => 'Depreciación: repartir el costo de un activo fijo en los años que dura. Se registra cargando el gasto de depreciación y abonando la depreciación acumulada. Vida útil normal SII: computadores 6 años, vehículos 7, maquinaria 15. Las Pro Pyme pueden usar depreciación instantánea (todo en un año) en lo tributario.\nPara el asiento: "depreciación de una camioneta de 15.000.000".', fuente: `${LIR}, art. 31 N° 5 y 5 bis; vida útil según tabla del SII`, vista: ['Ir a Apertura y ajustes', 'contabilidad', 'Apertura y ajustes'] },
  { re: / activo fijo /, texto: () => 'Activo fijo (propiedades, planta y equipo): bienes que la empresa usa más de un año, como vehículos, computadores o maquinaria. No se llevan a gasto de una vez: se activan y se deprecian. Una mantención es gasto; una mejora que alarga la vida útil se activa.', fuente: 'NIIF para las PYMES, sección 17' },
  { re: / conciliacion bancaria /, texto: () => 'Conciliación bancaria: comparar el saldo del banco en la contabilidad con el de la cartola y explicar las diferencias. En la app, el control "Banco = cartola" y "Por clasificar" hacen ese trabajo.', fuente: 'Práctica contable', vista: ['Ir a Banco', 'banco'] },
  { re: / estado de resultados /, texto: () => 'Estado de resultados: ingresos menos costos y gastos de un período. Dice si la empresa ganó o perdió. Está en "Contabilidad".', fuente: 'NIIF para las PYMES, sección 5', vista: ['Ir a Contabilidad', 'contabilidad'] },
  { re: / balance (?:de )?(?:8|ocho) columnas /, texto: () => 'Balance de 8 columnas (o tributario): por cada cuenta muestra sumas (debe y haber), saldos (deudor y acreedor), inventario (activo y pasivo) y resultados (pérdida y ganancia). La utilidad del inventario debe ser igual a la de resultados.', fuente: 'Práctica contable; DJ 1847', vista: ['Ir a Contabilidad', 'contabilidad'] },
  { re: / libro diario | el diario /, texto: () => 'Libro diario: todos los asientos en orden de fecha, cada uno con su debe y su haber iguales. Está en "Contabilidad".', fuente: `${CT}, art. 17`, vista: ['Ir a Contabilidad', 'contabilidad'] },
  { re: / libro mayor | el mayor /, texto: () => 'Libro mayor: los movimientos y el saldo de cada cuenta por separado. Está en "Contabilidad".', fuente: 'Práctica contable', vista: ['Ir a Contabilidad', 'contabilidad'] },
  { re: / debe haber | el debe | el haber | cargos? | abonos? /, texto: () => 'Debe y haber: las dos columnas de un asiento. Al debe (cargo) suben los activos y los gastos; al haber (abono) suben los pasivos, el patrimonio y los ingresos. En cada asiento el total del debe es igual al del haber.', fuente: 'Partida doble' },
  { re: / asiento /, texto: () => 'Asiento contable: el registro de una operación, con una o más cuentas al debe y al haber por el mismo total, fecha y glosa. Cuéntame la operación con su monto y te propongo el asiento: "vendí 1.190.000 con boleta".', fuente: 'Partida doble' },
  { re: / activos? /, texto: () => 'Activo: lo que la empresa tiene o le deben (banco, clientes, mercadería, IVA crédito fiscal, activo fijo).', fuente: 'NIIF para las PYMES, sección 2' },
  { re: / pasivos? /, texto: () => 'Pasivo: lo que la empresa debe a terceros (proveedores, IVA débito fiscal, sueldos e impuestos por pagar, préstamos).', fuente: 'NIIF para las PYMES, sección 2' },
  { re: / patrimonio /, texto: () => 'Patrimonio: lo que es de los dueños (activo − pasivo). Incluye el capital, las utilidades acumuladas y el resultado del año, rebajados por los retiros.', fuente: 'NIIF para las PYMES, sección 2' },
  { re: / devengad[oa]s? | percibid[oa]s? | devengo /, texto: () => 'Devengado y percibido: devengado es cuando nace el derecho o la obligación (se emite la factura); percibido es cuando entra o sale la plata. La contabilidad registra lo devengado: la luz de octubre es gasto de octubre aunque se pague en noviembre.', fuente: 'NIIF para las PYMES, sección 2; LIR art. 29' },
  { re: / provision(?:es)? /, texto: () => 'Provisión: un gasto que se reconoce antes de pagarlo porque ya se debe aunque no se sepa el monto exacto (por ejemplo, vacaciones del personal).', fuente: 'NIIF para las PYMES, secciones 21 y 28' },
  { re: / transitoria /, texto: () => 'Cuenta transitoria: guarda lo que todavía no se sabe qué es. En la app: 1199 cargos y 2190 abonos por identificar, 3190 apertura por completar y 5990 compras por revisar. Se vacían clasificando en "Por clasificar".', fuente: 'Plan de cuentas de la app', vista: ['Ir a Por clasificar', 'clasificar'] },
];

const DEFINICION = /(?<= )(?:que (?:es|son|significa|significan|quiere decir|seria)|para que (?:sirve|es|son)|explica\w*|defin\w*|cuando vence|vencimiento|plazo|hasta cuando|quien(?:es)? (?:debe|deben|presenta|paga)|diferencia entre|que onda|cacha\w*)(?= )/;

/** ¿La pregunta pide una definición, un plazo o habla de las DJ? (para que Riffo no la confunda con otra intención). */
export function pideDefinicion(pregunta: string): boolean {
  const t = jerga(pregunta);
  return / dj /.test(t) || (DEFINICION.test(t) && buscarTermino(t) !== null);
}
/** ¿La pregunta es casi solo un término del glosario ("¿iva?", "la depre")? */
export function esTerminoSuelto(pregunta: string): boolean {
  if (/ (?:como|donde) /.test(jerga(pregunta))) return false;          // "¿cómo cargo el F29?" es ayuda de la app
  const t = jerga(pregunta).trim().split(' ').filter(x => x.length > 1 && !/^(el|la|los|las|un|una|de|del|y|que|me|mi)$/.test(x));
  return t.length <= 3 && buscarTermino(jerga(pregunta)) !== null;
}

function buscarTermino(t: string): Termino | null {
  return GLOSARIO.find(g => g.re.test(t)) ?? null;
}

/** Responde "¿qué es…?" con el glosario tributario y contable, o las DJ. */
export function responderGlosario(pregunta: string): Respuesta | null {
  const t = jerga(pregunta);
  if (/ dj /.test(t)) return respuestaDJ(t);
  const g = buscarTermino(t);
  if (!g) return null;
  return { texto: `${g.texto()}${g.fuente ? `\nFuente: ${g.fuente}.` : ''}`, acciones: g.vista ? [{ tipo: 'ir', etiqueta: g.vista[0], vista: g.vista[1], pestana: g.vista[2] }] : [] };
}
