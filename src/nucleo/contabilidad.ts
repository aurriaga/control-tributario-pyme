// Contabilidad automática: plan de cuentas, categorías de gasto, asientos (apertura, manuales, ventas, compras,
// remuneraciones, honorarios, F29 y banco), Libro Diario, Mayor, Balance de 8 columnas, Estado de Resultados y controles.
// Equivale a modContabilidad.bas. Todo el banco entra al Diario según el estado de cada movimiento, así el mayor del
// banco siempre es igual a la cartola: lo que no se sabe qué es queda en cuentas transitorias (1199 y 2190).
import { signoDoc, esComisionLF, esResumen, type Documento, type IvaComisionLF } from './rcv';
import type { Movimiento } from './cartola';
import { f29PorPeriodo, type F29 } from './f29';
import { resumenPersonal, cuerposTrabajadores, type LibroRemuneraciones, type MesHonorarios } from './remuneraciones';
import { rutsConDV } from './cruce';

// ------------------------------------------------------------------ plan de cuentas
export type TipoCuenta = 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto';
export type GrupoEERR = 'Ingresos' | 'Costo de ventas' | 'Gastos de administración y ventas' | 'Personal' | 'Depreciación'
  | 'Otros ingresos' | 'Gastos financieros' | 'Por revisar';
export interface Cuenta {
  codigo: number; nombre: string; tipo: TipoCuenta;
  categoria?: string;        // categoría de gasto que se carga a esta cuenta
  cuentaBancaria?: string;   // número de la cuenta en la cartola (para empresas con varios bancos)
  transitoria?: boolean;     // partidas por aclarar
  grupo?: GrupoEERR;         // línea del Estado de Resultados (cuentas de ingreso y gasto)
  rol?: RolCuenta;           // función de la cuenta en un plan propio (importado): banco, clientes, IVA…
}

/** Función de una cuenta. Con el plan de la app se sabe por el código (C); con un plan importado, por este rol. */
export type RolCuenta = 'banco' | 'clientes' | 'proveedores' | 'iva_cf' | 'iva_df' | 'ppm' | 'impuestos' | 'activo_fijo' | 'dep_acum' | 'depreciacion';
const ROL_BASE: Record<RolCuenta, number> = { banco: 1102, clientes: 1103, proveedores: 2101, iva_cf: 1106, iva_df: 2103, ppm: 1108, impuestos: 2105,
  activo_fijo: 1201, dep_acum: 1209, depreciacion: 5302 };
/** Códigos que cumplen una función: el de la app más las cuentas del plan con ese rol. */
export const codigosRol = (plan: Cuenta[], rol: RolCuenta) => new Set([ROL_BASE[rol], ...plan.filter(c => c.rol === rol).map(c => c.codigo)]);
/** Cuenta que recibe los asientos automáticos de una función: la primera del plan importado con ese rol, o la de la app. */
export const cuentaRol = (plan: Cuenta[], rol: RolCuenta) => [...plan].sort((a, b) => a.codigo - b.codigo).find(c => c.rol === rol)?.codigo ?? ROL_BASE[rol];

export const C = {
  CAJA: 1101, BANCO: 1102, CLIENTES: 1103, IVA_CF: 1106, PPM: 1108, TRASPASOS: 1198, CARGOS_ID: 1199, ACTIVO_FIJO: 1201, DEP_ACUM: 1209,
  PROVEEDORES: 2101, IVA_DF: 2103, IMPUESTOS: 2105, REMUN: 2106, HONOR: 2107, SOCIOS: 2120, ABONOS_ID: 2190, PRESTAMOS: 2201,
  CAPITAL: 3101, RESULTADOS_ACUM: 3102, RETIROS: 3103, APERTURA: 3190,
  VENTAS: 4101, OTROS_ING: 4103, SIN_FACTURA: 5212, GASTO_REMUN: 5213, GASTO_HONOR: 5214, APORTE_EMP: 5215,
  COMISIONES: 5105, FINANCIEROS: 5301, DEPRECIACION: 5302, POR_REVISAR: 5990,
} as const;

/** Categorías de gasto de las compras. El grupo dice en qué línea del Estado de Resultados cae. */
export const CATEGORIAS_GASTO: { categoria: string; descripcion: string; grupo: GrupoEERR | 'Activo fijo' }[] = [
  { categoria: 'Materiales e insumos del giro', descripcion: 'Mercadería y materiales que se venden o instalan', grupo: 'Costo de ventas' },
  { categoria: 'Insumos y herramientas', descripcion: 'Adhesivos, discos, ferretería, herramientas menores', grupo: 'Costo de ventas' },
  { categoria: 'Subcontratos e instalación', descripcion: 'Trabajos de terceros en las obras', grupo: 'Costo de ventas' },
  { categoria: 'Fletes y despacho', descripcion: 'Transporte de materiales y despachos', grupo: 'Costo de ventas' },
  { categoria: 'Comisiones de ventas', descripcion: 'Comisión de ferias y consignatarios (liquidaciones-factura)', grupo: 'Costo de ventas' },
  { categoria: 'Ganado y animales', descripcion: 'Animales comprados para crianza, engorda o venta', grupo: 'Costo de ventas' },
  { categoria: 'Insumos agrícolas y veterinarios', descripcion: 'Fertilizantes, semillas, forraje, medicamentos y servicios veterinarios', grupo: 'Costo de ventas' },
  { categoria: 'Arriendos', descripcion: 'Local, bodega, oficina o equipos', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Servicios básicos', descripcion: 'Luz, agua, gas, telefonía, internet', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Servicios profesionales', descripcion: 'Contabilidad, asesorías, prevención, capacitación', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Computación y software', descripcion: 'Sistemas, licencias, firma electrónica, equipos menores', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Vehículos y mantención', descripcion: 'Repuestos, mantención y revisión técnica', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Combustibles y lubricantes', descripcion: 'Combustible de vehículos y equipos', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Peajes y autopistas', descripcion: 'TAG y peajes', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Seguros', descripcion: 'Seguros de vehículos y generales', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Viajes y movilización', descripcion: 'Pasajes, alojamiento y traslados', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Publicidad', descripcion: 'Imprenta, publicidad y marketing', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Gastos generales', descripcion: 'Supermercado, oficina y otros gastos del giro', grupo: 'Gastos de administración y ventas' },
  { categoria: 'Gastos bancarios y financieros', descripcion: 'Comisiones bancarias, leasing, corredoras', grupo: 'Gastos financieros' },
  { categoria: 'Activo fijo', descripcion: 'Maquinaria, vehículos y equipos (no es gasto: se deprecia)', grupo: 'Activo fijo' },
  { categoria: 'Por revisar', descripcion: 'Proveedor sin clasificar con certeza', grupo: 'Por revisar' },
];

const cta = (codigo: number, nombre: string, tipo: TipoCuenta, extra: Partial<Cuenta> = {}): Cuenta => ({ codigo, nombre, tipo, ...extra });
const gasto = (codigo: number, categoria: string, grupo: GrupoEERR) => cta(codigo, categoria, 'Gasto', { categoria, grupo });

export const PLAN_BASE: Cuenta[] = [
  cta(1101, 'Caja', 'Activo'), cta(1102, 'Banco cuenta corriente', 'Activo'), cta(1103, 'Clientes', 'Activo'),
  cta(1104, 'Fondos mutuos e inversiones de corto plazo', 'Activo'), cta(1105, 'Existencias (inventario)', 'Activo'),
  cta(1106, 'IVA Crédito Fiscal', 'Activo'), cta(1107, 'Préstamos por cobrar a empresas relacionadas', 'Activo'),
  cta(1108, 'PPM por recuperar', 'Activo'), cta(1110, 'Anticipos y préstamos al personal', 'Activo'),
  cta(1198, 'Traspasos entre cuentas propias (transitoria)', 'Activo', { transitoria: true }),
  cta(1199, 'Cargos bancarios por identificar (transitoria)', 'Activo', { transitoria: true }),
  cta(1201, 'Maquinaria, vehículos y equipos', 'Activo', { categoria: 'Activo fijo' }), cta(1209, 'Depreciación acumulada', 'Activo'),
  cta(2101, 'Proveedores', 'Pasivo'), cta(2103, 'IVA Débito Fiscal', 'Pasivo'), cta(2105, 'Impuestos por pagar (F29)', 'Pasivo'),
  cta(2106, 'Remuneraciones y cotizaciones por pagar', 'Pasivo'), cta(2107, 'Honorarios por pagar', 'Pasivo'),
  cta(2112, 'Préstamo solidario por pagar (descuentos a trabajadores)', 'Pasivo'), cta(2120, 'Cuenta corriente socios', 'Pasivo'),
  cta(2190, 'Abonos bancarios por identificar (transitoria)', 'Pasivo', { transitoria: true }), cta(2201, 'Préstamos bancarios', 'Pasivo'),
  cta(3101, 'Capital', 'Patrimonio'), cta(3102, 'Resultados acumulados', 'Patrimonio'), cta(3103, 'Retiros de socios', 'Patrimonio'),
  cta(3190, 'Apertura por completar (transitoria)', 'Patrimonio', { transitoria: true }),
  cta(4101, 'Ventas', 'Ingreso', { grupo: 'Ingresos' }), cta(4103, 'Otros ingresos', 'Ingreso', { grupo: 'Otros ingresos' }),
  gasto(5101, 'Materiales e insumos del giro', 'Costo de ventas'), gasto(5102, 'Insumos y herramientas', 'Costo de ventas'),
  gasto(5103, 'Subcontratos e instalación', 'Costo de ventas'), gasto(5104, 'Fletes y despacho', 'Costo de ventas'),
  gasto(5105, 'Comisiones de ventas', 'Costo de ventas'), gasto(5106, 'Ganado y animales', 'Costo de ventas'),
  gasto(5107, 'Insumos agrícolas y veterinarios', 'Costo de ventas'),
  gasto(5201, 'Arriendos', 'Gastos de administración y ventas'), gasto(5202, 'Servicios básicos', 'Gastos de administración y ventas'),
  gasto(5203, 'Servicios profesionales', 'Gastos de administración y ventas'), gasto(5204, 'Computación y software', 'Gastos de administración y ventas'),
  gasto(5205, 'Vehículos y mantención', 'Gastos de administración y ventas'), gasto(5206, 'Combustibles y lubricantes', 'Gastos de administración y ventas'),
  gasto(5207, 'Peajes y autopistas', 'Gastos de administración y ventas'), gasto(5208, 'Seguros', 'Gastos de administración y ventas'),
  gasto(5209, 'Viajes y movilización', 'Gastos de administración y ventas'), gasto(5210, 'Publicidad', 'Gastos de administración y ventas'),
  gasto(5211, 'Gastos generales', 'Gastos de administración y ventas'),
  cta(5212, 'Gastos sin factura (cargos automáticos del banco)', 'Gasto', { grupo: 'Gastos de administración y ventas' }),
  cta(5213, 'Remuneraciones (libro de remuneraciones)', 'Gasto', { grupo: 'Personal' }),
  cta(5214, 'Honorarios (boletas de honorarios recibidas)', 'Gasto', { grupo: 'Personal' }),
  cta(5215, 'Leyes sociales (aporte del empleador)', 'Gasto', { grupo: 'Personal' }),
  gasto(5301, 'Gastos bancarios y financieros', 'Gastos financieros'),
  cta(5302, 'Depreciación del ejercicio', 'Gasto', { grupo: 'Depreciación' }),
  cta(5990, 'Compras por revisar (transitoria)', 'Gasto', { categoria: 'Por revisar', grupo: 'Por revisar', transitoria: true }),
];

/** Clasificación de un movimiento del banco (Banco > Por identificar) → cuenta de la contrapartida. */
export const CLASIFICACION_CUENTA: Record<string, number> = {
  'Pago de impuestos (F29)': 2105, 'Remuneraciones y cotizaciones': 2106, 'Honorarios': 2107, 'Comisiones y gastos bancarios': 5301,
  'Crédito bancario (cuotas)': 2201, 'Retiro de socios': 3103, 'Aporte de socios': 2120, 'Aporte de capital': 3101,
  'Traspaso entre cuentas propias': 1198, 'Anticipo de cliente': 1103, 'Cobro a cliente': 1103, 'Pago a proveedor': 2101,
  'Cobro consolidado de facturas': 2190, 'Otro gasto sin factura': 5212, 'Otro ingreso': 4103,
};

export const ordenarPlan = (p: Cuenta[]) => [...p].sort((a, b) => a.codigo - b.codigo);

/** Un movimiento del banco también se puede clasificar directo a una cuenta del plan: "Cuenta 1104: Fondos mutuos…". */
export const etiquetaCuenta = (c: Pick<Cuenta, 'codigo' | 'nombre'>) => `Cuenta ${c.codigo}: ${c.nombre}`;
export const codigoDeEtiqueta = (s: string) => Number(s.match(/^Cuenta (\d{3,6})\b/)?.[1] ?? 0);

/** Código libre sugerido para una cuenta nueva del tipo indicado (el siguiente al mayor de su grupo). */
export function codigoSugerido(plan: Cuenta[], tipo: TipoCuenta): number {
  const base: Record<TipoCuenta, [number, number]> = { Activo: [1100, 1999], Pasivo: [2100, 2999], Patrimonio: [3100, 3999], Ingreso: [4100, 4999], Gasto: [5100, 5899] };
  const [desde, hasta] = base[tipo];
  const usados = new Set(plan.map(c => c.codigo));
  let n = Math.max(desde, ...plan.filter(c => c.codigo >= desde && c.codigo <= hasta).map(c => c.codigo)) + 1;
  while (usados.has(n) && n <= hasta) n++;
  return n <= hasta ? n : 0;
}

/** Línea del Estado de Resultados de una cuenta de ingreso o gasto (la indicada en el plan, o por su código). */
export function grupoDe(c: Cuenta | undefined, codigo: number): GrupoEERR | null {
  if (c?.grupo) return c.grupo;
  const tipo = c?.tipo ?? (codigo >= 4000 ? (codigo < 5000 ? 'Ingreso' : 'Gasto') : 'Activo');
  if (tipo === 'Ingreso') return codigo === C.VENTAS ? 'Ingresos' : 'Otros ingresos';
  if (tipo !== 'Gasto') return null;
  if (c?.transitoria || codigo >= 5900) return 'Por revisar';
  if (codigo >= 5213 && codigo <= 5215) return 'Personal';
  if (codigo === C.DEPRECIACION) return 'Depreciación';
  if (codigo >= 5300) return 'Gastos financieros';
  if (codigo < 5200) return 'Costo de ventas';
  return 'Gastos de administración y ventas';
}

// ------------------------------------------------------------------ configuración que edita el usuario
export interface LineaApertura { codigo: number; debe: number; haber: number; glosa: string }
export interface Apertura { fecha: string; lineas: LineaApertura[] }
export interface LineaManual { asiento: string; fecha: string; codigo: number; glosa: string; documento: string; debe: number; haber: number }

/** Libro Diario traído de otro sistema: sus asientos reemplazan a los automáticos hasta su última fecha. */
export interface LibroImportado { archivo: string; importado: string; desde: string; hasta: string; asientos: number; lineas: LineaManual[] }

export interface ConfigContable {
  plan: Cuenta[];
  clasificacion: Record<string, number>;      // clasificación del banco → cuenta
  provCategoria: Record<string, string>;      // RUT del proveedor → categoría de gasto (aprendida)
  apertura: Apertura | null;
  manuales: LineaManual[];
  ivaComisionLF?: IvaComisionLF;              // IVA de la comisión de las liquidaciones-factura (por omisión, crédito fiscal)
  tasaPPM?: { opcion: string; tasa: number }; // tasa del PPM elegida para la empresa (ver nucleo/ppm.ts)
  libro?: LibroImportado | null;
}

/** Agrega al plan guardado las cuentas de la app que se crearon después (por ejemplo 5105 Comisiones de ventas). */
export function completarPlan(cfg: ConfigContable): ConfigContable {
  const usados = new Set(cfg.plan.map(c => c.codigo));
  const nuevas = new Set([5105, 5106, 5107]);            // cuentas agregadas al plan de la app después de su primera versión
  const faltan = PLAN_BASE.filter(c => !usados.has(c.codigo) && nuevas.has(c.codigo));
  return faltan.length ? { ...cfg, plan: ordenarPlan([...cfg.plan, ...faltan]) } : cfg;
}

/** Una cuenta contable por cada cuenta bancaria de las cartolas: la primera usa 1102; las otras, códigos libres desde 1111.
 *  Así cada banco tiene su mayor y la apertura y el control "Banco = cartola" van por cuenta. Devuelve la misma
 *  configuración si no falta ninguna. */
export function cuentasBancarias(movs: Movimiento[], cfg: ConfigContable): ConfigContable {
  const dig = (s: string) => s.replace(/\D/g, '');
  const cuentas = new Map<string, string>();
  for (const m of movs) if (dig(m.cuenta).length >= 6 && !cuentas.has(dig(m.cuenta))) cuentas.set(dig(m.cuenta), `${m.banco ? m.banco + ' ' : ''}${m.cuenta}`);
  const conNumero = cfg.plan.filter(c => dig(c.cuentaBancaria ?? '').length >= 6);
  const falta = [...cuentas].filter(([d]) => !conNumero.some(c => d.includes(dig(c.cuentaBancaria!)) || dig(c.cuentaBancaria!).includes(d)));
  if (!falta.length || cuentas.size < 2) return cfg;            // con una sola cuenta, 1102 ya basta
  let plan = [...cfg.plan];
  const usados = new Set(plan.map(c => c.codigo));
  for (const [d, nombre] of falta) {
    const base = plan.find(c => c.codigo === C.BANCO);
    if (base && !dig(base.cuentaBancaria ?? '')) { plan = plan.map(c => (c.codigo === C.BANCO ? { ...c, nombre: `Banco ${nombre}`, cuentaBancaria: d } : c)); continue; }
    let cod = 1111; while (usados.has(cod) && cod < 1197) cod++;
    usados.add(cod);
    plan.push({ codigo: cod, nombre: `Banco ${nombre}`, tipo: 'Activo', cuentaBancaria: d });
  }
  return { ...cfg, plan: ordenarPlan(plan) };
}

/** Usa un Libro Diario importado: suma su plan (sin tocar las cuentas de la app) y guarda sus líneas. */
export function usarLibro(cfg: ConfigContable, archivo: string, plan: Cuenta[], lineas: LineaManual[], hoy = new Date().toISOString().slice(0, 10)): ConfigContable {
  const propios = new Set(plan.map(c => c.codigo));
  const fechas = lineas.map(l => l.fecha).sort();
  return { ...cfg, plan: ordenarPlan([...cfg.plan.filter(c => !propios.has(c.codigo)), ...plan]),
    libro: { archivo, importado: hoy, desde: fechas[0] ?? '', hasta: fechas[fechas.length - 1] ?? '', asientos: new Set(lineas.map(l => l.asiento)).size, lineas } };
}
/** Deja de usar el Libro Diario importado: vuelven los asientos automáticos (sus cuentas quedan en el plan). */
export const dejarLibro = (cfg: ConfigContable): ConfigContable => ({ ...cfg, libro: null });
export const configInicial = (): ConfigContable => ({ plan: PLAN_BASE, clasificacion: { ...CLASIFICACION_CUENTA }, provCategoria: {}, apertura: null, manuales: [] });

export interface Entradas { empresa: string; docs: Documento[]; f29s: F29[]; movs: Movimiento[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[] }

// ------------------------------------------------------------------ categorías de las compras
const esLiquidacion = (d: Documento) => esComisionLF(d);
const signo = (d: Documento) => signoDoc(d.tipoDoc);

/** Categoría de una compra: la puesta a mano en el documento o la aprendida para su proveedor. */
export const categoriaDe = (d: Documento, provCategoria: Record<string, string>) => d.categoria || provCategoria[d.rutContraparte] || '';

/** Asigna una categoría a un proveedor (todas sus compras sin categoría propia) y la recuerda. "Por revisar" no se aprende. */
export function asignarCategoria(provCategoria: Record<string, string>, rut: string, categoria: string): Record<string, string> {
  const r = { ...provCategoria };
  if (!categoria) delete r[rut]; else r[rut] = categoria;
  return r;
}

/** Proveedores con compras sin categoría (o "Por revisar"), del mayor al menor monto. */
export function proveedoresSinCategoria(docs: Documento[], provCategoria: Record<string, string>, empresa: string) {
  const m = new Map<string, { rut: string; nombre: string; compras: number; monto: number }>();
  for (const d of docs) {
    if (d.libro !== 'COMPRA' || d.empresa !== empresa || esLiquidacion(d) || d.estado === 'ANULADA') continue;
    const c = categoriaDe(d, provCategoria);
    if (c && c !== 'Por revisar') continue;
    const x = m.get(d.rutContraparte) ?? { rut: d.rutContraparte, nombre: d.razonSocial, compras: 0, monto: 0 };
    x.compras++; x.monto += signo(d) * (d.total - d.iva); m.set(d.rutContraparte, x);
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto);
}

// ------------------------------------------------------------------ asientos
export type Origen = 'Apertura' | 'Manual' | 'Libro' | 'Ventas' | 'Compras' | 'Remuneraciones' | 'Honorarios' | 'F29' | 'Banco';
export interface Linea { codigo: number; monto: number }     // monto > 0 debe, < 0 haber
export interface Asiento { fecha: string; orden: number; glosa: string; documento: string; origen: Origen; clave: string; lineas: Linea[] }

const finDeMes = (p: string) => { const [y, m] = p.split('-').map(Number); return `${p}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const mesAnterior = (p: string) => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesTexto = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const fechaTexto = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const $ = (n: number) => (Math.round(n) < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('de-DE');
const soloDig = (s: string) => s.replace(/\D/g, '');
export const MARCA_CONSOLIDADO = 'COBRO CONSOLIDADO';

/** Primer mes de la contabilidad (AAAA-MM): el de la apertura o del libro importado; si no, el primer mes con documentos
 *  (o con banco, si no hay documentos). Los F29 de antes no se centralizan: no hay con qué cuadrarlos. */
export function inicioContable(e: Entradas, cfg: ConfigContable): string {
  const primero = (l: string[]) => l.filter(Boolean).sort()[0] ?? '';
  const docs = e.docs.filter(d => d.empresa === e.empresa && d.estado !== 'ANULADA');
  return (cfg.apertura?.fecha || (cfg.libro?.lineas.length ? cfg.libro.desde : '') || primero(docs.map(d => d.periodoRCV || d.fechaEmision)) || primero(e.movs.map(m => m.fecha))).slice(0, 7);
}

/** F29 que entran a la contabilidad: desde el primer mes de la contabilidad y después del Libro Diario importado. */
export function f29Contables(f29s: F29[], inicio: string, hastaLibro?: string): F29[] {
  return [...f29PorPeriodo(f29s).values()].filter(f => '538' in f.codigos && (!inicio || f.periodo >= inicio) && (!hastaLibro || finDeMes(f.periodo) > hastaLibro))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export interface ResultadoAsientos { asientos: Asiento[]; avisos: string[]; sinCuenta: number[]; manualesRechazados: string[] }

export function generarAsientos(e: Entradas, cfg: ConfigContable): ResultadoAsientos {
  const plan = new Map(cfg.plan.map(c => [c.codigo, c]));
  const catCuenta = new Map(cfg.plan.filter(c => c.categoria).map(c => [c.categoria!.trim().toLowerCase(), c.codigo]));
  const bancos = cfg.plan.filter(c => soloDig(c.cuentaBancaria ?? '').length >= 6).map(c => [soloDig(c.cuentaBancaria!), c.codigo] as const);
  const asientos: Asiento[] = [], avisos: string[] = [], sinCuenta = new Set<number>(), rechazados: string[] = [];
  let orden = 0;
  const nuevo = (fecha: string, glosa: string, documento: string, origen: Origen, clave: string) => {
    const a: Asiento = { fecha, orden: ++orden, glosa, documento, origen, clave, lineas: [] }; asientos.push(a); return a;
  };
  const L = (a: Asiento, codigo: number, monto: number) => {
    const m = Math.round(monto); if (Math.abs(m) < 1) return;
    if (!plan.has(codigo)) sinCuenta.add(codigo);
    a.lineas.push({ codigo, monto: m });
  };
  const cuentaCategoria = (cat: string) => catCuenta.get(cat.trim().toLowerCase()) ?? C.POR_REVISAR;
  const R = (rol: RolCuenta) => cuentaRol(cfg.plan, rol);
  const BANCO = R('banco'), CLIENTES = R('clientes'), PROVEEDORES = R('proveedores'), IVA_CF = R('iva_cf'), IVA_DF = R('iva_df'), IMPUESTOS = R('impuestos'), PPM = R('ppm');
  const cuentaBanco = (cuenta: string) => { const d = soloDig(cuenta); return bancos.find(([n]) => d && d.includes(n))?.[1] ?? BANCO; };
  const docs = e.docs.filter(d => d.empresa === e.empresa && d.folio && d.estado !== 'ANULADA');
  // Libro Diario importado: hasta su última fecha mandan sus asientos y no se generan los automáticos
  const libro = cfg.libro?.lineas.length ? cfg.libro : null;
  const cubre = (fecha: string) => !!libro && fecha <= libro.hasta;
  // Primer mes de la contabilidad: la apertura o el primer mes con documentos o banco. Los F29 anteriores no se centralizan
  const inicio = inicioContable(e, cfg);

  // Apertura (si no cuadra, la diferencia queda a la vista en 3190)
  if (libro && cfg.apertura && cfg.apertura.fecha <= libro.hasta) avisos.push('La apertura no se usó: el Libro Diario importado ya trae sus saldos iniciales.');
  if (cfg.apertura && cfg.apertura.lineas.some(l => l.debe || l.haber) && !(libro && cfg.apertura.fecha <= libro.hasta)) {
    const f = cfg.apertura.fecha;
    const a = nuevo(f, `Asiento de apertura al ${fechaTexto(f)} (saldos iniciales)`, '', 'Apertura', 'A|1');
    let dif = 0;
    for (const l of cfg.apertura.lineas) if (l.codigo) { L(a, l.codigo, l.debe - l.haber); dif += Math.round(l.debe) - Math.round(l.haber); }
    if (Math.abs(dif) >= 1) { L(a, C.APERTURA, -dif); avisos.push(`La apertura no cuadraba: la diferencia (${$(Math.abs(dif))}) quedó en 3190 Apertura por completar.`); }
  }

  // Libro Diario importado: un asiento por número, tal como viene del otro sistema
  if (libro) {
    const g = new Map<string, LineaManual[]>();
    for (const l of libro.lineas) g.set(l.asiento, [...(g.get(l.asiento) ?? []), l]);
    for (const [k, ls] of g) {
      const a = nuevo(ls.map(l => l.fecha).sort()[0], ls.find(l => l.glosa)?.glosa || `Asiento ${k} del libro importado`, ls.find(l => l.documento)?.documento ?? '', 'Libro', `L|${k}`);
      ls.forEach(l => L(a, l.codigo, l.debe - l.haber));
    }
  }

  // Asientos manuales: las líneas con el mismo N° forman un asiento; si no cuadra o usa una cuenta inexistente no entra
  const grupos = new Map<string, LineaManual[]>();
  for (const l of cfg.manuales) if (l.asiento.trim() && (l.debe || l.haber)) grupos.set(l.asiento.trim(), [...(grupos.get(l.asiento.trim()) ?? []), l]);
  for (const [k, ls] of grupos) {
    const suma = ls.reduce((s, l) => s + Math.round(l.debe) - Math.round(l.haber), 0);
    const malo = ls.some(l => !/^\d{4}-\d{2}-\d{2}$/.test(l.fecha)) ? 'sin fecha'
      : ls.find(l => !plan.has(l.codigo)) ? `la cuenta ${ls.find(l => !plan.has(l.codigo))!.codigo} no existe en el plan`
      : Math.abs(suma) >= 1 ? `no cuadra (diferencia ${$(Math.abs(suma))})` : '';
    if (malo) { rechazados.push(k); avisos.push(`Asiento manual ${k} NO se registró: ${malo}.`); continue; }
    const fecha = ls.map(l => l.fecha).sort()[0];
    const a = nuevo(fecha, `${ls.find(l => l.glosa)?.glosa || `Asiento manual ${k}`} (asiento manual ${k})`, ls.find(l => l.documento)?.documento ?? '', 'Manual', `M|${k}`);
    ls.forEach(l => L(a, l.codigo, l.debe - l.haber));
  }

  // Ventas (y cobro consolidado: un asiento por mes de cobro que salda contra los abonos del banco)
  const consolidado = new Map<string, { suma: number; n: number; fecha: string }>();
  for (const d of docs.filter(x => x.libro === 'VENTA' && !cubre(x.fechaEmision))) {
    const s = signo(d), tot = d.total * s, neto = (d.neto + d.exento) * s, iva = d.iva * s, otros = tot - neto - iva;
    const a = nuevo(d.fechaEmision, esResumen(d) ? `Venta: ${d.razonSocial}, ${mesTexto(d.periodoRCV)} (resumen del RCV)` : `${s < 0 ? 'Rebaja de venta' : 'Venta'}: ${nombreDoc(d.tipoDoc)} N° ${d.folio} - ${d.razonSocial}`, esResumen(d) ? `Resumen ${d.periodoRCV}` : String(d.folio), 'Ventas', `V|${d.clave}`);
    L(a, CLIENTES, tot); L(a, C.VENTAS, -neto); L(a, IVA_DF, -iva);
    // En una liquidación-factura el mandatario descuenta su comisión: se salda con su documento en el registro de compras
    if ((d.tipoDoc === 40 || d.tipoDoc === 43) && otros < 0) L(a, PROVEEDORES, -otros); else L(a, IMPUESTOS, -otros);
    if (d.estado === 'COBRADA' && d.fechaPago && d.observacion.toUpperCase().includes(MARCA_CONSOLIDADO)) {
      const k = d.fechaPago.slice(0, 7), x = consolidado.get(k) ?? { suma: 0, n: 0, fecha: '' };
      x.suma += tot; x.n++; if (d.fechaPago > x.fecha) x.fecha = d.fechaPago; consolidado.set(k, x);
    }
  }
  for (const [k, x] of consolidado) {
    const a = nuevo(x.fecha, `Cobro consolidado ${mesTexto(k)}: ${x.n} documentos de venta saldados con los abonos del banco (sin calce uno a uno)`, '', 'Ventas', `V|CONSOLIDADO|${k}`);
    L(a, C.ABONOS_ID, x.suma); L(a, CLIENTES, -x.suma);
  }

  // Compras: el crédito fiscal es del mes de registro en el RCV, así que el asiento va en ese mes
  const cuentaComision = (d: Documento) => { const cat = categoriaDe(d, cfg.provCategoria); return cat ? cuentaCategoria(cat) : plan.has(C.COMISIONES) ? C.COMISIONES : cuentaCategoria('Comisiones de ventas'); };
  for (const d of docs.filter(x => x.libro === 'COMPRA')) {
    const s = signo(d), tot = d.total * s, ivaR = d.iva * s;
    let fecha = d.fechaEmision, glosa = `${nombreDoc(d.tipoDoc)} N° ${d.folio} - ${d.razonSocial}`;
    if (/^\d{4}-\d{2}$/.test(d.periodoRCV) && `${d.periodoRCV}-01` > fecha) { glosa += ` (emitida el ${fechaTexto(fecha)})`; fecha = `${d.periodoRCV}-01`; }
    if (cubre(fecha)) continue;
    if (esLiquidacion(d)) {     // liquidación-factura recibida: la comisión del mandatario por una venta hecha a nombre de la empresa
      const cta = cuentaComision(d);
      if (cfg.ivaComisionLF === 'debito') {    // el IVA de la comisión se declara como débito (propuesta del SII): no se recupera
        const a = nuevo(fecha, `Comisión de liquidación-factura (IVA declarado como débito): ${glosa}`, String(d.folio), 'Compras', `C|${d.clave}`);
        L(a, cta, tot + ivaR); L(a, IVA_DF, -ivaR); L(a, PROVEEDORES, -tot);
      } else {
        const a = nuevo(fecha, `Comisión de liquidación-factura: ${glosa}`, String(d.folio), 'Compras', `C|${d.clave}`);
        L(a, cta, tot - ivaR); L(a, IVA_CF, ivaR); L(a, PROVEEDORES, -tot);
      }
    } else {
      const a = nuevo(fecha, `${s < 0 ? 'Rebaja de compra' : 'Compra'}: ${glosa}`, String(d.folio), 'Compras', `C|${d.clave}`);
      L(a, cuentaCategoria(categoriaDe(d, cfg.provCategoria)), tot - ivaR); L(a, IVA_CF, ivaR); L(a, PROVEEDORES, -tot);
    }
  }

  // Remuneraciones: centralización del libro y aporte del empleador (PREVIRED del mes siguiente − cotizaciones)
  const libros = e.libros.filter(l => !l.rutEmpresa || l.rutEmpresa === e.empresa);
  for (const m of resumenPersonal(libros, [], e.movs)) {
    if (!m.trabajadores || cubre(finDeMes(m.periodo))) continue;
    const a = nuevo(finDeMes(m.periodo), `Centralización libro de remuneraciones ${mesTexto(m.periodo)} (${m.trabajadores} trabajadores): haberes ${$(m.haberes)}, cotizaciones ${$(m.cotizaciones)}, impuesto único ${$(m.impuestoUnico)}, líquido ${$(m.liquido)}`,
      `Libro remuneraciones ${m.periodo}`, 'Remuneraciones', `R|${m.periodo}`);
    L(a, C.GASTO_REMUN, m.haberes); L(a, C.REMUN, -m.haberes);
    if (m.aporteEmpleador && m.aporteEmpleador >= 1) {
      const b = nuevo(finDeMes(m.periodo), `Aporte del empleador ${mesTexto(m.periodo)}: pago PREVIRED ${$(m.pagoPrevired ?? 0)} menos cotizaciones descontadas ${$(m.cotizaciones)} (SIS, seguro de cesantía y mutual)`,
        'PREVIRED', 'Remuneraciones', `R|AP|${m.periodo}`);
      L(b, C.APORTE_EMP, m.aporteEmpleador); L(b, C.REMUN, -m.aporteEmpleador);
    }
  }

  // Honorarios: gasto bruto contra honorarios por pagar (la retención la traspasa el F29, código 151)
  for (const h of e.honorarios) if (h.bruto > 0 && !cubre(finDeMes(h.periodo))) {
    const a = nuevo(finDeMes(h.periodo), `Honorarios ${mesTexto(h.periodo)}: ${h.vigentes} boletas recibidas, bruto ${$(h.bruto)}; retención ${$(h.retencionTerceros)} (F29 cód. 151)`, `BHE ${h.periodo}`, 'Honorarios', `H|${h.periodo}`);
    L(a, C.GASTO_HONOR, h.bruto); L(a, C.HONOR, -h.bruto);
  }

  // F29 declarados: IVA, PPM, retenciones y reajuste del remanente
  const f29 = f29Contables(e.f29s, inicio, libro?.hasta);
  const fuera = [...f29PorPeriodo(e.f29s).values()].filter(f => '538' in f.codigos && f.periodo < inicio).length;
  if (fuera) avisos.push(`${fuera} F29 de antes de ${inicio} no se contabilizaron: la contabilidad parte en ${inicio}.`);
  const rem077 = new Map([...f29PorPeriodo(e.f29s).values()].map(f => [f.periodo, f.codigos['077'] ?? 0]));
  for (const f of f29) {
    const k = (c: string) => f.codigos[c] ?? 0;
    const d538 = k('538'), i089 = k('089');
    const a = nuevo(finDeMes(f.periodo), `Centralización del F29 ${f.periodo} (folio ${f.folio}): IVA, PPM, retenciones y reajuste del remanente`, f.folio, 'F29', `F|${f.periodo}`);
    L(a, IVA_DF, d538); L(a, IVA_CF, -(d538 - i089)); L(a, IMPUESTOS, -i089);
    L(a, PPM, k('062')); L(a, IMPUESTOS, -k('062'));
    L(a, C.HONOR, k('151')); L(a, IMPUESTOS, -k('151'));
    L(a, C.REMUN, k('048')); L(a, IMPUESTOS, -k('048'));
    const pa = mesAnterior(f.periodo);
    if (rem077.has(pa) && ('504' in f.codigos)) {
      const rea = k('504') - rem077.get(pa)!;
      if (Math.abs(rea) >= 1) { L(a, IVA_CF, rea); L(a, C.OTROS_ING, -rea); }
    }
  }

  // Banco: todos los movimientos; la contrapartida depende de su estado
  const porClave = new Map(e.docs.map(d => [d.clave, d]));
  const provPorRut = new Set(docs.filter(d => d.libro === 'COMPRA').map(d => String(Number(soloDig(d.rutContraparte.split('-')[0])))));
  const trabajadores = cuerposTrabajadores(libros);
  for (const m of e.movs) {
    const mon = m.abono - m.cargo; if (!mon || !m.fecha || cubre(m.fecha)) continue;
    let contra = 0;
    if (m.estado === 'conciliado' && m.docs?.length) {
      const d = porClave.get(m.docs[0]);
      contra = d ? (d.libro === 'VENTA' ? CLIENTES : PROVEEDORES) : 0;
    } else if (m.estado === 'clasificado' && m.categoria) {
      const cod = codigoDeEtiqueta(m.categoria);
      contra = cfg.clasificacion[m.categoria] ?? (plan.has(cod) ? cod : 0);
    }
    if (!contra && mon < 0) {   // cargo sin registrar con el RUT de un proveedor o de un trabajador
      const ruts = rutsConDV(m.descripcion);
      if (ruts.some(r => provPorRut.has(r))) contra = PROVEEDORES;
      else if (/previred/i.test(m.descripcion) || ruts.some(r => trabajadores.has(r))) contra = C.REMUN;
    }
    if (!contra) contra = mon > 0 ? C.ABONOS_ID : C.CARGOS_ID;
    const est = m.estado === 'clasificado' ? ` [${m.categoria}]` : m.estado === 'conciliado' ? ' [conciliado]' : '';
    const a = nuevo(m.fecha, `Banco: ${m.descripcion.trim()}${est}`, m.documento, 'Banco', `B|${m.clave}`);
    L(a, cuentaBanco(m.cuenta), mon); L(a, contra, -mon);
  }

  return { asientos, avisos, sinCuenta: [...sinCuenta].sort(), manualesRechazados: rechazados };
}

const NOMBRES: Record<number, string> = { 35: 'Boleta', 38: 'Boleta exenta', 39: 'Boleta electrónica', 41: 'Boleta exenta electrónica', 48: 'Comprobante de pago electrónico', 33: 'Factura', 34: 'Factura exenta', 46: 'Factura de compra', 56: 'Nota de débito', 61: 'Nota de crédito', 40: 'Liquidación-factura', 43: 'Liquidación-factura', 110: 'Factura de exportación', 914: 'Declaración de ingreso' };
const nombreDoc = (t: number) => NOMBRES[t] ?? `Documento ${t}`;

// ------------------------------------------------------------------ Libro Diario y Mayor
export interface FilaDiario {
  asiento: number; fecha: string; codigo: number; cuenta: string; glosa: string; documento: string;
  debe: number; haber: number; saldo: number; mes: string; origen: Origen; clave: string;
}

/** Libro Diario ordenado por fecha (primero el debe, después el haber de cada asiento) con el saldo acumulado por cuenta. */
export function libroDiario(asientos: Asiento[], plan: Cuenta[]): FilaDiario[] {
  const nombre = new Map(plan.map(c => [c.codigo, c.nombre]));
  const saldo = new Map<number, number>(), filas: FilaDiario[] = [];
  let n = 0;
  for (const a of [...asientos].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.orden - y.orden)) {
    if (!a.lineas.length) continue;
    n++;
    for (const l of [...a.lineas.filter(x => x.monto > 0), ...a.lineas.filter(x => x.monto < 0)]) {
      const s = (saldo.get(l.codigo) ?? 0) + l.monto; saldo.set(l.codigo, s);
      filas.push({ asiento: n, fecha: a.fecha, codigo: l.codigo, cuenta: nombre.get(l.codigo) ?? '(cuenta no existe en el plan)', glosa: a.glosa,
        documento: a.documento, debe: Math.max(0, l.monto), haber: Math.max(0, -l.monto), saldo: s, mes: a.fecha.slice(0, 7), origen: a.origen, clave: a.clave });
    }
  }
  return filas;
}

export interface FilaMayor extends FilaDiario { saldoMayor: number }
/** Mayor de una cuenta en un rango de meses: saldo anterior y movimientos con saldo corrido. */
export function mayor(diario: FilaDiario[], codigo: number, desde = '0000-00', hasta = '9999-99') {
  const de = diario.filter(f => f.codigo === codigo);
  const anterior = de.filter(f => f.mes < desde).reduce((s, f) => s + f.debe - f.haber, 0);
  let s = anterior;
  const filas: FilaMayor[] = de.filter(f => f.mes >= desde && f.mes <= hasta).map(f => ({ ...f, saldoMayor: (s += f.debe - f.haber) }));
  return { anterior, filas, debe: filas.reduce((a, f) => a + f.debe, 0), haber: filas.reduce((a, f) => a + f.haber, 0), saldo: s };
}

// ------------------------------------------------------------------ Balance de 8 columnas
export interface FilaBalance {
  codigo: number; cuenta: string; transitoria: boolean; resultado: boolean;
  debitos: number; creditos: number; deudor: number; acreedor: number; activo: number; pasivo: number; perdidas: number; ganancias: number;
}
export interface Balance { filas: FilaBalance[]; sumas: Omit<FilaBalance, 'codigo' | 'cuenta' | 'transitoria' | 'resultado'>; resultado: number; cuadra: boolean }

export function balance8(diario: FilaDiario[], plan: Cuenta[], desde = '0000-00', hasta = '9999-99'): Balance {
  const porCod = new Map(plan.map(c => [c.codigo, c]));
  const acc = new Map<number, { d: number; h: number }>();
  for (const f of diario) if (f.mes >= desde && f.mes <= hasta) {
    const x = acc.get(f.codigo) ?? { d: 0, h: 0 }; x.d += f.debe; x.h += f.haber; acc.set(f.codigo, x);
  }
  const filas = [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([codigo, x]) => {
    const c = porCod.get(codigo), res = grupoDe(c, codigo) !== null;
    const deudor = Math.max(0, x.d - x.h), acreedor = Math.max(0, x.h - x.d);
    return { codigo, cuenta: c?.nombre ?? '(no está en el plan)', transitoria: !!c?.transitoria, resultado: res, debitos: x.d, creditos: x.h, deudor, acreedor,
      activo: res ? 0 : deudor, pasivo: res ? 0 : acreedor, perdidas: res ? deudor : 0, ganancias: res ? acreedor : 0 };
  });
  const k = ['debitos', 'creditos', 'deudor', 'acreedor', 'activo', 'pasivo', 'perdidas', 'ganancias'] as const;
  const sumas = Object.fromEntries(k.map(c => [c, filas.reduce((s, f) => s + f[c], 0)])) as Balance['sumas'];
  const resultado = sumas.ganancias - sumas.perdidas;
  const cuadra = Math.abs(sumas.debitos - sumas.creditos) < 1 && Math.abs(sumas.deudor - sumas.acreedor) < 1
    && Math.abs(sumas.activo - sumas.pasivo - resultado) < 1;
  return { filas, sumas, resultado, cuadra };
}

// ------------------------------------------------------------------ Estado de Resultados (por función)
export interface LineaEERR { concepto: string; monto: number; tipo: 'linea' | 'subtotal' | 'total'; cuentas?: { codigo: number; cuenta: string; monto: number }[] }

export function estadoResultados(b: Balance, plan: Cuenta[]): LineaEERR[] {
  const porCod = new Map(plan.map(c => [c.codigo, c]));
  const g = (grupo: GrupoEERR) => {
    const cuentas = b.filas.filter(f => f.resultado && grupoDe(porCod.get(f.codigo), f.codigo) === grupo)
      .map(f => ({ codigo: f.codigo, cuenta: f.cuenta, monto: f.ganancias - f.perdidas })).filter(c => Math.abs(c.monto) >= 1);
    return { monto: cuentas.reduce((s, c) => s + c.monto, 0), cuentas };
  };
  const ing = g('Ingresos'), cv = g('Costo de ventas'), gav = g('Gastos de administración y ventas'), per = g('Personal'), dep = g('Depreciación');
  const otros = g('Otros ingresos'), fin = g('Gastos financieros'), rev = g('Por revisar');
  const mb = ing.monto + cv.monto, ro = mb + gav.monto + per.monto + dep.monto, res = ro + otros.monto + fin.monto + rev.monto;
  const l = (concepto: string, x: { monto: number; cuentas: LineaEERR['cuentas'] }): LineaEERR => ({ concepto, monto: x.monto, tipo: 'linea', cuentas: x.cuentas });
  return [
    l('Ingresos de actividades ordinarias', ing), l('Costo de ventas', cv),
    { concepto: 'Margen bruto', monto: mb, tipo: 'subtotal' },
    l('Gastos de administración y ventas', gav), l('Remuneraciones, leyes sociales y honorarios', per), l('Depreciación', dep),
    { concepto: 'Resultado operacional', monto: ro, tipo: 'subtotal' },
    l('Otros ingresos', otros), l('Gastos financieros', fin), ...(rev.cuentas!.length ? [l('Compras por revisar (sin categoría)', rev)] : []),
    { concepto: res >= 0 ? 'Utilidad del período' : 'Pérdida del período', monto: res, tipo: 'total' },
  ];
}

// ------------------------------------------------------------------ apertura sugerida
/** Saldo inicial del banco según la primera cartola (saldo del primer movimiento menos su monto), por cuenta. */
export function aperturaSugerida(movs: Movimiento[], cfg: ConfigContable): Apertura | null {
  const primeros = new Map<string, Movimiento>();
  for (const m of [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha))) if (m.saldo !== null && !primeros.has(m.cuenta)) primeros.set(m.cuenta, m);
  if (!primeros.size) return null;
  const bancos = cfg.plan.filter(c => soloDig(c.cuentaBancaria ?? '').length >= 6);
  const lineas: LineaApertura[] = [];
  let fecha = '9999-12-31';
  for (const m of primeros.values()) {
    const ini = m.saldo! - (m.abono - m.cargo), d = soloDig(m.cuenta);
    const codigo = bancos.find(c => d.includes(soloDig(c.cuentaBancaria!)))?.codigo ?? C.BANCO;
    lineas.push({ codigo, debe: Math.max(0, ini), haber: Math.max(0, -ini), glosa: `Saldo inicial según la primera cartola${m.cuenta ? ` (cuenta ${m.cuenta})` : ''}` });
    if (m.fecha < fecha) fecha = m.fecha;
  }
  const neto = lineas.reduce((s, l) => s + l.debe - l.haber, 0);
  lineas.push({ codigo: C.APERTURA, debe: Math.max(0, -neto), haber: Math.max(0, neto), glosa: 'Contrapartida provisoria: reemplázala por las cuentas del balance al cierre anterior' });
  return { fecha: `${fecha.slice(0, 4)}-01-01`, lineas };
}

// ------------------------------------------------------------------ controles
export type EstadoControl = 'OK' | 'Revisar' | 'Pendiente';
export interface Control { nombre: string; estado: EstadoControl; resultado: string; accion: string }

export function controlesContables(e: Entradas, cfg: ConfigContable, r: ResultadoAsientos, diario: FilaDiario[]): Control[] {
  const out: Control[] = [];
  const add = (nombre: string, estado: EstadoControl, resultado: string, accion = '') => out.push({ nombre, estado, resultado, accion: estado === 'OK' ? '' : accion });
  const plan = new Map(cfg.plan.map(c => [c.codigo, c]));
  const saldo = new Map<number, number>(), porAs = new Map<number, number>();
  for (const f of diario) { saldo.set(f.codigo, (saldo.get(f.codigo) ?? 0) + f.debe - f.haber); porAs.set(f.asiento, (porAs.get(f.asiento) ?? 0) + f.debe - f.haber); }
  const S = (c: number) => saldo.get(c) ?? 0;
  const tD = diario.reduce((s, f) => s + f.debe, 0), tH = diario.reduce((s, f) => s + f.haber, 0);
  const desc = [...porAs.values()].filter(x => Math.abs(x) >= 1).length;

  add('Partida doble', Math.abs(tD - tH) < 1 && !desc ? 'OK' : 'Revisar',
    `Debe ${$(tD)} / haber ${$(tH)}; ${porAs.size.toLocaleString('de-DE')} asientos, ${desc} descuadrados.`, 'Revisa el asiento descuadrado y corrige el documento de origen.');

  // Banco = cartola: último saldo de cada cuenta contra el mayor de los bancos
  if (e.movs.length) {
    const ult = new Map<string, Movimiento>();
    for (const m of e.movs) if (m.saldo !== null) { const u = ult.get(m.cuenta); if (!u || m.fecha >= u.fecha) ult.set(m.cuenta, m); }
    const sCart = [...ult.values()].reduce((s, m) => s + (m.saldo ?? 0), 0);
    const codBancos = new Set([...codigosRol(cfg.plan, 'banco'), ...cfg.plan.filter(c => soloDig(c.cuentaBancaria ?? '').length >= 6).map(c => c.codigo)]);
    const sMay = [...codBancos].reduce((s, c) => s + S(c), 0);
    const fUlt = [...ult.values()].map(m => m.fecha).sort().pop() ?? '';
    add('Banco = cartola', Math.abs(sMay - sCart) < 1 ? 'OK' : 'Revisar',
      `Mayor de bancos ${$(sMay)} / último saldo de la cartola ${$(sCart)} (${ult.size} cuenta${ult.size === 1 ? '' : 's'}${fUlt ? `, al ${fechaTexto(fUlt)}` : ''}).`,
      'Si la diferencia es el saldo inicial, complétalo en la apertura; si no, falta una cartola.');
  } else add('Banco = cartola', 'Pendiente', 'No hay cartolas cargadas.', 'Arrastra las cartolas a la bandeja.');

  // IVA del libro = F29 declarados (débito, crédito y remanente al cierre de cada mes)
  const f29 = f29Contables(e.f29s, inicioContable(e, cfg), cfg.libro?.lineas.length ? cfg.libro.hasta : undefined);
  const cDF = codigosRol(cfg.plan, 'iva_df'), cCF = codigosRol(cfg.plan, 'iva_cf');
  if (f29.length) {
    const df = new Map<string, number>(), cf = new Map<string, number>(), cfAcum: { mes: string; x: number }[] = [];
    for (const f of diario) {
      if (cDF.has(f.codigo) && f.origen !== 'F29') df.set(f.mes, (df.get(f.mes) ?? 0) + f.haber - f.debe);
      if (cCF.has(f.codigo) && f.origen !== 'F29' && f.origen !== 'Apertura' && f.origen !== 'Libro') cf.set(f.mes, (cf.get(f.mes) ?? 0) + f.debe - f.haber);
      if (cCF.has(f.codigo)) cfAcum.push({ mes: f.mes, x: f.debe - f.haber });
    }
    const malos: string[] = [];
    for (const f of f29.sort((a, b) => a.periodo.localeCompare(b.periodo))) {
      const k = (c: string) => f.codigos[c] ?? 0, t: string[] = [];
      if (Math.abs((df.get(f.periodo) ?? 0) - k('538')) >= 1) t.push('débito');
      if (Math.abs((cf.get(f.periodo) ?? 0) - (k('520') - k('528'))) >= 1) t.push('crédito');
      const acum = cfAcum.filter(x => x.mes <= f.periodo).reduce((s, x) => s + x.x, 0);
      if (Math.abs(acum - k('077')) >= 1) t.push('remanente');
      if (t.length) malos.push(`${f.periodo} (${t.join(', ')})`);
    }
    add('IVA del libro = F29 declarados', malos.length ? 'Revisar' : 'OK',
      `${f29.length} F29 revisados (débito, crédito y remanente al cierre).${malos.length ? ` Con diferencias: ${malos.join('; ')}.` : ' Todos cuadran.'}`,
      'Revisa la cuadratura en IVA y F29, y si falta el remanente inicial en la apertura (código 504 del primer F29).');
  } else if (cfg.libro?.lineas.length && e.f29s.length) add('IVA del libro = F29 declarados', 'OK', `Los F29 hasta ${fechaTexto(cfg.libro.hasta)} están en el Libro Diario importado; la cuadratura con el RCV está en IVA y F29.`);
  else add('IVA del libro = F29 declarados', 'Pendiente', 'No hay F29 cargados.', 'Arrastra los F29 en PDF a la bandeja.');

  // Saldos con signo contrario a su naturaleza
  const contrarios: string[] = [];
  for (const [k, s] of saldo) {
    if (Math.abs(s) < 1 || codigosRol(cfg.plan, 'dep_acum').has(k) || k === C.RETIROS || k === C.RESULTADOS_ACUM) continue;
    const t = plan.get(k)?.tipo ?? '';
    if (((t === 'Pasivo' || t === 'Patrimonio' || t === 'Ingreso') && s > 0) || ((t === 'Activo' || t === 'Gasto') && s < 0))
      contrarios.push(`${k} ${plan.get(k)?.nombre ?? ''} ${$(Math.abs(s))} ${s > 0 ? 'deudor' : 'acreedor'}`);
  }
  add('Saldos con signo contrario al normal', contrarios.length ? 'Pendiente' : 'OK',
    contrarios.length ? `${contrarios.length} cuentas: ${contrarios.join('; ')}.` : 'Todas las cuentas tienen el saldo de su naturaleza.',
    'Suele faltar algo en la apertura (préstamos o remuneraciones por pagar al cierre anterior): complétalo en la apertura o con un asiento manual.');

  // Activo fijo y depreciación
  const SR = (rol: RolCuenta) => [...codigosRol(cfg.plan, rol)].reduce((a, c) => a + S(c), 0);
  const af = SR('activo_fijo'), da = -SR('dep_acum'), cDep = codigosRol(cfg.plan, 'depreciacion');
  const mesDep = diario.filter(f => cDep.has(f.codigo)).map(f => f.mes).sort().pop() ?? '';
  const mesUlt = diario.map(f => f.mes).sort().pop() ?? '';
  add('Depreciación del activo fijo', af < 1 || (da > 0 && mesDep >= mesUlt) ? 'OK' : 'Revisar',
    `Activo fijo ${$(af)}; depreciación acumulada ${$(da)}${mesDep ? `; último mes depreciado ${mesDep}.` : '; sin depreciación registrada.'}`,
    'Registra la depreciación del mes con un asiento manual (vida útil SII: computadores 6, vehículos 7, maquinaria 15 años).');

  // Pagados o cobrados sin respaldo del banco
  const docsEmp = e.docs.filter(d => d.empresa === e.empresa);
  const sinFecha = docsEmp.filter(d => (d.estado === 'COBRADA' || d.estado === 'PAGADA') && !d.fechaPago).length;
  add('Pagados o cobrados sin respaldo', sinFecha ? 'Revisar' : 'OK', `${sinFecha} documentos pagados o cobrados sin fecha del banco.`,
    'Un documento solo queda pagado con un movimiento del banco: usa Banco > Buscar cobros y pagos.');

  // Proveedores y clientes: mayor contra documentos pendientes
  const pend = (libro: 'COMPRA' | 'VENTA') => docsEmp.filter(d => d.libro === libro && (d.estado === 'POR PAGAR' || d.estado === 'POR COBRAR') && !esLiquidacion(d))
    .reduce((s, d) => s + d.total * signo(d), 0);
  const pK = pend('COMPRA'), pV = pend('VENTA');
  const sP = SR('proveedores'), sC = SR('clientes');
  if (cfg.libro?.lineas.length) {      // los saldos vienen del libro importado, sin el detalle de cada factura
    const t = `Los saldos de clientes y proveedores vienen del Libro Diario importado (hasta el ${fechaTexto(cfg.libro.hasta)}): revísalos con los auxiliares de ese sistema.`;
    add('Proveedores: mayor = facturas por pagar', 'Pendiente', `Mayor ${$(-sP)}. ${t}`, 'Revisa el auxiliar de proveedores del sistema de origen.');
    add('Clientes: mayor = facturas por cobrar', 'Pendiente', `Mayor ${$(sC)}. ${t}`, 'Revisa el auxiliar de clientes del sistema de origen.');
  } else {
  add('Proveedores: mayor = facturas por pagar', Math.abs(-sP - pK) < 1 ? 'OK' : 'Pendiente',
    `Mayor ${$(-sP)} / facturas por pagar ${$(pK)} / diferencia ${$(pK + sP)}.`,
    'La diferencia suele ser pagos por RUT aún no asignados a su factura, o proveedores de la apertura: asígnalos en Banco.');
  add('Clientes: mayor = facturas por cobrar', Math.abs(sC - pV) < 1 ? 'OK' : 'Pendiente',
    `Mayor ${$(sC)} / facturas por cobrar ${$(pV)} / diferencia ${$(sC - pV)}.`,
    'Revisa cobros sin movimiento del banco o abonos sin asignar a su factura.');
  }

  // Transitorias
  const trans = [...saldo].filter(([k, s]) => plan.get(k)?.transitoria && Math.abs(s) >= 1);
  add('Partidas por identificar (transitorias)', trans.length ? 'Pendiente' : 'OK',
    trans.length ? trans.map(([k, s]) => `${k} ${plan.get(k)!.nombre} ${$(Math.abs(s))}`).join('; ') + '.' : 'Sin partidas transitorias.',
    'Clasifica los movimientos en Banco > Por identificar y completa la apertura.');

  add('Asientos manuales', r.manualesRechazados.length ? 'Revisar' : 'OK',
    r.manualesRechazados.length ? `${r.manualesRechazados.length} no entraron: ${r.manualesRechazados.join(', ')}.` : 'Todos los asientos manuales entraron al Diario.',
    'Corrige el asiento (fecha, cuenta o que el debe sea igual al haber).');

  const hastaLibro = cfg.libro?.lineas.length ? cfg.libro.hasta : '';
  const sinCat = proveedoresSinCategoria(hastaLibro ? e.docs.filter(d => (d.periodoRCV ? `${d.periodoRCV}-01` : d.fechaEmision) > hastaLibro) : e.docs, cfg.provCategoria, e.empresa);
  add('Compras sin categoría o por revisar', sinCat.length ? 'Pendiente' : 'OK',
    `${sinCat.reduce((s, p) => s + p.compras, 0)} compras de ${sinCat.length} proveedores sin categoría definitiva (quedan en 5990).`,
    'Asigna la categoría del proveedor en Contabilidad > Categorías de compras.');

  const cats = new Set(cfg.plan.map(c => c.categoria?.trim().toLowerCase()).filter(Boolean));
  const usadas = [...new Set([...Object.values(cfg.provCategoria), ...e.docs.map(d => d.categoria ?? '')].filter(Boolean))];
  const huerfanas = usadas.filter(c => !cats.has(c.trim().toLowerCase()));
  add('Categorías de gasto con cuenta contable', huerfanas.length ? 'Revisar' : 'OK',
    huerfanas.length ? `${huerfanas.length} categorías sin cuenta (sus compras quedan en 5990): ${huerfanas.join('; ')}.` : 'Cada categoría usada tiene su cuenta en el plan.',
    'Indica en el plan de cuentas qué cuenta recibe esa categoría.');

  if (r.sinCuenta.length) add('Cuentas que no están en el plan', 'Revisar', `Se usaron los códigos ${r.sinCuenta.join(', ')}.`, 'Agrégalos al plan de cuentas.');
  return out;
}

// ------------------------------------------------------------------ todo junto
export function contabilidad(e: Entradas, cfg: ConfigContable, desde = '0000-00', hasta = '9999-99') {
  const r = generarAsientos(e, cfg);
  const diario = libroDiario(r.asientos, cfg.plan);
  const bal = balance8(diario, cfg.plan, desde, hasta);
  return { ...r, diario, balance: bal, eerr: estadoResultados(bal, cfg.plan), controles: controlesContables(e, cfg, r, diario) };
}
