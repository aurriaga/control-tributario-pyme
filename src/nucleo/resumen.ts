// Resumen del año a partir de lo que esté cargado. Por ahora usa el RCV; crece con cada etapa (F29, banco, contabilidad).
import type { Documento } from './rcv';

export interface Mes { periodo: string; ventas: number; compras: number; ivaDebito: number; ivaCredito: number; docsVenta: number; docsCompra: number }
export interface Contraparte { rut: string; nombre: string; monto: number; participacion: number }
export interface Alerta { nivel: 'falta' | 'revisar'; texto: string }

export interface ResumenAnual {
  anio: number;
  meses: Mes[];               // 12 meses, aunque estén vacíos
  ventas: number; compras: number; margen: number; margenPct: number | null;
  ivaDebito: number; ivaCredito: number; ivaNeto: number;   // ivaNeto > 0: IVA a pagar (antes de remanentes y PPM)
  documentos: number;
  clientes: Contraparte[]; proveedores: Contraparte[];
  alertas: Alerta[];
}

const signo = (d: Documento) => (d.tipoDoc === 61 ? -1 : 1);                // nota de crédito resta
export const periodoDe = (d: Documento) => d.periodoRCV || d.fechaEmision.slice(0, 7);

export function aniosDisponibles(docs: Documento[]): number[] {
  return [...new Set(docs.map(d => Number(periodoDe(d).slice(0, 4))))].sort((a, b) => b - a);
}

function ranking(docs: Documento[], total: number): Contraparte[] {
  const m = new Map<string, Contraparte>();
  for (const d of docs) {
    const c = m.get(d.rutContraparte) ?? { rut: d.rutContraparte, nombre: d.razonSocial, monto: 0, participacion: 0 };
    c.monto += signo(d) * (d.neto + d.exento); m.set(d.rutContraparte, c);
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto).slice(0, 5).map(c => ({ ...c, participacion: total ? c.monto / total : 0 }));
}

export function resumenAnual(docs: Documento[], anio: number): ResumenAnual {
  const delAnio = docs.filter(d => d.estado !== 'ANULADA' && periodoDe(d).startsWith(String(anio)));
  const meses: Mes[] = Array.from({ length: 12 }, (_, i) => ({ periodo: `${anio}-${String(i + 1).padStart(2, '0')}`, ventas: 0, compras: 0, ivaDebito: 0, ivaCredito: 0, docsVenta: 0, docsCompra: 0 }));
  for (const d of delAnio) {
    const m = meses[Number(periodoDe(d).slice(5, 7)) - 1];
    if (!m) continue;
    const s = signo(d);
    if (d.libro === 'VENTA') { m.ventas += s * (d.neto + d.exento); m.ivaDebito += s * d.iva; m.docsVenta++; }
    else { m.compras += s * (d.neto + d.exento); m.ivaCredito += s * d.iva; m.docsCompra++; }
  }
  const suma = (k: keyof Mes) => meses.reduce((a, m) => a + (m[k] as number), 0);
  const ventas = suma('ventas'), compras = suma('compras'), ivaDebito = suma('ivaDebito'), ivaCredito = suma('ivaCredito');
  const clientes = ranking(delAnio.filter(d => d.libro === 'VENTA'), ventas);
  const proveedores = ranking(delAnio.filter(d => d.libro === 'COMPRA'), compras);

  const alertas: Alerta[] = [];
  const conDatos = meses.filter(m => m.docsVenta + m.docsCompra > 0);
  const ultimo = conDatos.length ? Number(conDatos[conDatos.length - 1].periodo.slice(5)) : 0;
  // Los huecos se buscan entre el primer y el último mes con datos (si la empresa empezó a cargar en julio, enero no "falta")
  const primero = conDatos.length ? Number(conDatos[0].periodo.slice(5)) - 1 : 0;
  const nombreMes = (p: string) => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(p.slice(5)) - 1];
  const huecos = meses.slice(primero, ultimo).filter(m => m.docsCompra === 0).map(m => nombreMes(m.periodo));
  if (huecos.length) alertas.push({ nivel: 'falta', texto: `Falta el RCV de compras de ${huecos.join(', ')}.` });
  const top3 = clientes.slice(0, 3).reduce((a, c) => a + c.participacion, 0);
  if (clientes.length >= 3 && top3 >= 0.7) alertas.push({ nivel: 'revisar', texto: `Tres clientes concentran el ${Math.round(top3 * 100)}% de las ventas del año.` });
  const sinVentas = meses.slice(primero, ultimo).filter(m => m.docsVenta === 0).map(m => nombreMes(m.periodo));
  if (sinVentas.length) alertas.push({ nivel: 'revisar', texto: `Meses sin ventas registradas: ${sinVentas.join(', ')}.` });
  if (compras > ventas && ventas > 0) alertas.push({ nivel: 'revisar', texto: 'Las compras del año superan a las ventas.' });

  return { anio, meses, ventas, compras, margen: ventas - compras, margenPct: ventas ? (ventas - compras) / ventas : null,
    ivaDebito, ivaCredito, ivaNeto: ivaDebito - ivaCredito, documentos: delAnio.length, clientes, proveedores, alertas };
}
