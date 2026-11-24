// Lectura de un Libro Diario hecho en otro sistema o en Excel: su plan de cuentas (si viene en otra hoja) y sus asientos.
// Las columnas se reconocen por su nombre. Los códigos con guiones o puntos ("1-01-001") pasan a número (101001).
import type { Contenido, Hoja } from './extraer';
import { normalizar, parseFecha, parseMonto } from './texto';
import type { Cuenta, LineaManual, RolCuenta, TipoCuenta, GrupoEERR } from './contabilidad';

export interface LibroLeido {
  plan: Cuenta[];
  lineas: LineaManual[];
  asientos: number;
  desde: string; hasta: string;
  debe: number; haber: number;
  descuadrados: string[];     // asientos cuyo debe no es igual al haber
  avisos: string[];
}

type Col = 'asiento' | 'fecha' | 'codigo' | 'nombre' | 'glosa' | 'documento' | 'debe' | 'haber';
function columna(h: string): Col | '' {
  if (/^(n|no|nro|num|numero)?(de)?(asiento|comprobante|voucher)$/.test(h) || h === 'asiento') return 'asiento';
  if (h.startsWith('fecha')) return 'fecha';
  if (['cuenta', 'codigo', 'codigocuenta', 'codcuenta', 'ctacontable', 'cuentacontable', 'codigodelacuenta'].includes(h)) return 'codigo';
  if (h.startsWith('nombre') || h === 'descripcioncuenta') return 'nombre';
  if (['glosa', 'detalle', 'concepto', 'descripcion'].includes(h)) return 'glosa';
  if (h.startsWith('documento') || h === 'ndocumento' || h === 'nrodocumento') return 'documento';
  if (['debe', 'debito', 'debitos', 'cargo', 'cargos'].includes(h)) return 'debe';
  if (['haber', 'credito', 'creditos', 'abono', 'abonos'].includes(h)) return 'haber';
  return '';
}

/** Encabezado de una hoja: la primera de sus 10 primeras filas que tenga las columnas pedidas. */
function encabezado(h: Hoja, pedidas: Col[]): { fila: number; mapa: Map<Col, number> } | null {
  for (let i = 0; i < Math.min(10, h.filas.length); i++) {
    const mapa = new Map<Col, number>();
    h.filas[i].forEach((c, j) => { const t = columna(normalizar(c)); if (t && !mapa.has(t)) mapa.set(t, j); });
    if (pedidas.every(p => mapa.has(p))) return { fila: i, mapa };
  }
  return null;
}

export const codigoNumerico = (s: string) => { const d = String(s).replace(/\D/g, ''); return d ? Number(d) : 0; };

const ROLES: [RolCuenta, TipoCuenta[], RegExp, RegExp?][] = [
  ['dep_acum', ['Activo'], /depreciacion acumulada/],
  ['banco', ['Activo'], /\bbanco\b|cta\.? ?cte|cuenta corriente bancaria/, /prestamo|credito|relacionad|socio|particular/],
  ['clientes', ['Activo'], /cliente|deudores (comerciales|por venta|por exportacion)/],
  ['iva_cf', ['Activo'], /iva\s*credito|remanente/],
  ['ppm', ['Activo'], /\bppm\b|pagos? provisional/],
  ['activo_fijo', ['Activo'], /propiedad|planta y equipo|maquinaria|vehiculo|activo fijo|muebles/, /depreciacion/],
  ['proveedores', ['Pasivo'], /proveedor/],
  ['iva_df', ['Pasivo'], /iva\s*debito/],
  ['impuestos', ['Pasivo'], /impuestos? por pagar|\bf29\b/],
  ['depreciacion', ['Gasto'], /depreciacion/],
];
const sinTilde = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function tipoDe(clase: string, rubro: string, codigo: string): TipoCuenta {
  const c = sinTilde(clase), r = sinTilde(rubro);
  if (c.startsWith('activo')) return 'Activo';
  if (c.startsWith('pasivo')) return 'Pasivo';
  if (c.startsWith('patrimonio')) return 'Patrimonio';
  if (c.startsWith('ingreso') || (/resultado|perdida|ganancia/.test(c) && /ingreso|venta/.test(r))) return 'Ingreso';
  if (c.startsWith('gasto') || c.startsWith('costo') || /resultado|perdida/.test(c)) return codigo.replace(/\D/g, '').startsWith('4') ? 'Ingreso' : 'Gasto';
  return (['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto', 'Gasto', 'Gasto'] as TipoCuenta[])[Number(codigo.replace(/\D/g, '')[0] ?? 5) - 1] ?? 'Gasto';
}
function grupoDeRubro(tipo: TipoCuenta, rubro: string, nombre: string): GrupoEERR | undefined {
  const r = sinTilde(rubro), n = sinTilde(nombre);
  if (tipo === 'Ingreso') return /no operac|otros/.test(r) || /otros ingresos|intereses ganados/.test(n) ? 'Otros ingresos' : 'Ingresos';
  if (tipo !== 'Gasto') return undefined;
  if (/por clasificar|por identificar|por revisar/.test(n)) return 'Por revisar';
  if (/deprecia/.test(n)) return 'Depreciación';
  if (/costo/.test(r)) return 'Costo de ventas';
  if (/no operac|financ/.test(r)) return 'Gastos financieros';
  if (/administr|venta/.test(r)) return 'Gastos de administración y ventas';
  if (/costo/.test(n)) return 'Costo de ventas';
  if (/financ|interes|bancari/.test(n)) return 'Gastos financieros';
  return 'Gastos de administración y ventas';
}

function cuentaImportada(codigoTxt: string, nombre: string, clase = '', rubro = ''): Cuenta {
  const tipo = tipoDe(clase, rubro, codigoTxt), n = sinTilde(nombre);
  const rol = ROLES.find(([, tipos, si, no]) => tipos.includes(tipo) && si.test(n) && !(no && no.test(n)))?.[0];
  const numCta = nombre.match(/\d[\d.-]{5,}\d/)?.[0];
  const c: Cuenta = { codigo: codigoNumerico(codigoTxt), nombre: nombre.trim(), tipo };
  const grupo = grupoDeRubro(tipo, rubro, nombre);
  if (grupo) c.grupo = grupo;
  if (rol) c.rol = rol;
  if (rol === 'banco' && numCta) c.cuentaBancaria = numCta;
  if (/por (clasificar|identificar|conciliar|rendir)|transitori/.test(n)) c.transitoria = true;
  return c;
}

export function leerLibroDiario(c: Contenido): { dato: LibroLeido | null; mensaje: string } {
  // Hoja del diario: la que se llama "diario" o la primera con fecha, cuenta, debe y haber (no el mayor ni el balance)
  const candidatas = c.hojas.map(h => ({ h, e: encabezado(h, ['fecha', 'codigo', 'debe', 'haber']) })).filter(x => x.e && !/mayor|balance|comprobaci/i.test(x.h.nombre));
  const elegida = candidatas.find(x => /diario/i.test(x.h.nombre)) ?? candidatas[0];
  if (!elegida?.e) return { dato: null, mensaje: 'No se encontró una hoja con fecha, cuenta, debe y haber.' };
  const { h, e } = elegida, col = (f: string[], k: Col) => { const i = e.mapa.get(k); return i === undefined ? '' : (f[i] ?? '').trim(); };

  // Plan de cuentas: una hoja con código, nombre y clase (o tipo); si no hay, se arma con las cuentas del diario
  const plan = new Map<number, Cuenta>();
  for (const hp of c.hojas) {
    if (hp === h) continue;
    const enc = hp.filas.slice(0, 10).findIndex(f => { const n = f.map(normalizar); return n.some(x => x.startsWith('codigo')) && n.some(x => x.startsWith('nombre') || x === 'cuenta') && n.some(x => x === 'clase' || x === 'tipo'); });
    if (enc < 0) continue;
    const n = hp.filas[enc].map(normalizar), ix = (p: (x: string) => boolean) => n.findIndex(p);
    const iC = ix(x => x.startsWith('codigo')), iN = ix(x => x.startsWith('nombre') || x === 'cuenta'), iT = ix(x => x === 'clase' || x === 'tipo'), iR = ix(x => x === 'rubro' || x === 'grupo');
    for (const f of hp.filas.slice(enc + 1)) {
      const cod = f[iC] ?? '', nom = f[iN] ?? '';
      if (!codigoNumerico(cod) || !nom.trim()) continue;
      plan.set(codigoNumerico(cod), cuentaImportada(cod, nom, f[iT] ?? '', iR >= 0 ? f[iR] ?? '' : ''));
    }
    break;
  }

  const lineas: LineaManual[] = [], avisos: string[] = [];
  let anterior = '', correlativo = 0, abierto = 0, sinFecha = 0;
  for (const f of h.filas.slice(e.fila + 1)) {
    const codTxt = col(f, 'codigo'), debe = parseMonto(col(f, 'debe')), haber = parseMonto(col(f, 'haber'));
    if (!codigoNumerico(codTxt) || (!debe && !haber)) continue;
    const fecha = parseFecha(col(f, 'fecha'));
    if (!fecha) { sinFecha++; continue; }
    // Sin columna de N° de asiento, cada asiento termina cuando su debe iguala al haber
    let asiento = col(f, 'asiento');
    if (!asiento) { if (Math.abs(abierto) < 1) correlativo++; asiento = String(correlativo); abierto += debe - haber; }
    const codigo = codigoNumerico(codTxt);
    if (!plan.has(codigo)) plan.set(codigo, cuentaImportada(codTxt, col(f, 'nombre') || `Cuenta ${codTxt}`));
    lineas.push({ asiento: `L${asiento}`, fecha, codigo, glosa: col(f, 'glosa') || anterior, documento: col(f, 'documento'), debe, haber });
    anterior = col(f, 'glosa') || anterior;
  }
  if (!lineas.length) return { dato: null, mensaje: 'La hoja del diario no tiene líneas con cuenta, fecha y monto.' };
  if (sinFecha) avisos.push(`${sinFecha} líneas sin fecha válida no se leyeron.`);

  const suma = new Map<string, number>();
  for (const l of lineas) suma.set(l.asiento, (suma.get(l.asiento) ?? 0) + l.debe - l.haber);
  const descuadrados = [...suma].filter(([, v]) => Math.abs(v) >= 1).map(([k]) => k.slice(1));
  if (descuadrados.length) avisos.push(`${descuadrados.length} asientos no cuadran (debe distinto del haber): ${descuadrados.slice(0, 5).join(', ')}${descuadrados.length > 5 ? '…' : ''}.`);
  const fechas = lineas.map(l => l.fecha).sort();
  const debe = lineas.reduce((a, l) => a + l.debe, 0), haber = lineas.reduce((a, l) => a + l.haber, 0);
  const dato: LibroLeido = { plan: [...plan.values()].sort((a, b) => a.codigo - b.codigo), lineas, asientos: suma.size, desde: fechas[0], hasta: fechas[fechas.length - 1], debe, haber, descuadrados, avisos };
  const $ = (n: number) => '$' + Math.round(n).toLocaleString('de-DE');
  const f = (iso: string) => iso.split('-').reverse().join('-');
  return { dato, mensaje: `${dato.asientos.toLocaleString('de-DE')} asientos y ${lineas.length.toLocaleString('de-DE')} líneas del ${f(dato.desde)} al ${f(dato.hasta)}, con ${dato.plan.length} cuentas; debe ${$(debe)} y haber ${$(haber)}.` };
}
