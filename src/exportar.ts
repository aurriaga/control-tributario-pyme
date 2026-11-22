// Descarga de todo lo cargado y calculado en un solo Excel.
import * as XLSX from 'xlsx';
import type { Documento, Empresa } from './nucleo/rcv';
import type { Movimiento } from './nucleo/cartola';
import type { F29 } from './nucleo/f29';
import type { LibroRemuneraciones, MesHonorarios } from './nucleo/remuneraciones';
import { contabilidad, categoriaDe, type ConfigContable, type Control } from './nucleo/contabilidad';
import { observacionesDocumento } from './nucleo/controles';

export interface Todo { empresa: Empresa; docs: Documento[]; f29s: F29[]; movs: Movimiento[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[]; cfg: ConfigContable; controles: Control[] }

export function descargarTodo(t: Todo) {
  const libro = XLSX.utils.book_new();
  const hoja = (nombre: string, filas: unknown[][]) => XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombre);
  const docs = (l: 'VENTA' | 'COMPRA') => t.docs.filter(d => d.libro === l).map(d => [d.periodoRCV, d.tipoDoc, d.folio, d.fechaEmision, d.rutContraparte, d.razonSocial,
    d.exento, d.neto, d.iva, d.total, d.estado, d.fechaPago ?? '', ...(l === 'COMPRA' ? [categoriaDe(d, t.cfg.provCategoria)] : []), observacionesDocumento(d).join(' ') || 'OK', d.observacion]);
  const cab = ['Período RCV', 'Tipo', 'Folio', 'Emisión', 'RUT', 'Razón social', 'Exento', 'Neto', 'IVA', 'Total', 'Estado', 'Fecha pago'];
  hoja('Controles', [['Control', 'Estado', 'Resultado', 'Qué hacer'], ...t.controles.map(c => [c.nombre, c.estado, c.resultado, c.accion])]);
  hoja('Ventas', [[...cab, 'Control', 'Observación'], ...docs('VENTA')]);
  hoja('Compras', [[...cab, 'Categoría', 'Control', 'Observación'], ...docs('COMPRA')]);
  hoja('Banco', [['Fecha', 'Cuenta', 'Descripción', 'Documento', 'Cargo', 'Abono', 'Saldo', 'Estado', 'Clasificación'],
    ...t.movs.map(m => [m.fecha, m.cuenta, m.descripcion, m.documento, m.cargo || '', m.abono || '', m.saldo ?? '', m.estado, m.categoria ?? ''])]);
  const cods = ['538', '520', '528', '537', '089', '077', '062', '048', '151', '91'];
  hoja('F29', [['Período', 'Folio', 'Tipo', 'Presentado', ...cods.map(c => `Cód. ${c}`)], ...t.f29s.map(f => [f.periodo, f.folio, f.tipo, f.fechaPresentacion, ...cods.map(c => f.codigos[c] ?? '')])]);
  hoja('Remuneraciones', [['Período', 'RUT', 'Nombre', 'Total haberes', 'AFP', 'Salud', 'Cesantía', 'Impuesto único', 'Líquido', 'Control'],
    ...t.libros.flatMap(l => l.trabajadores.map(x => [l.periodo, x.rut, x.nombre, x.totalHaberes, x.afp, x.salud, x.cesantia, x.impuestoUnico, x.liquido, x.control]))]);
  hoja('Honorarios', [['Período', 'Boletas vigentes', 'Bruto', 'Retención terceros', 'Retención emisor', 'Líquido'],
    ...t.honorarios.map(h => [h.periodo, h.vigentes, h.bruto, h.retencionTerceros, h.retencionEmisor, h.liquido])]);
  const r = contabilidad({ empresa: t.empresa.rut, docs: t.docs, f29s: t.f29s, movs: t.movs, libros: t.libros, honorarios: t.honorarios }, t.cfg);
  hoja('Libro Diario', [['N° asiento', 'Fecha', 'Código', 'Cuenta', 'Glosa', 'Documento', 'Debe', 'Haber', 'Origen'],
    ...r.diario.map(f => [f.asiento, f.fecha, f.codigo, f.cuenta, f.glosa, f.documento, f.debe || '', f.haber || '', f.origen])]);
  hoja('Balance', [['Código', 'Cuenta', 'Débitos', 'Créditos', 'Saldo deudor', 'Saldo acreedor', 'Activo', 'Pasivo', 'Pérdidas', 'Ganancias'],
    ...r.balance.filas.map(f => [f.codigo, f.cuenta, f.debitos, f.creditos, f.deudor, f.acreedor, f.activo, f.pasivo, f.perdidas, f.ganancias])]);
  hoja('Estado de resultados', [['Concepto', 'Monto'], ...r.eerr.map(l => [l.concepto, l.monto])]);
  XLSX.writeFile(libro, `Control_Tributario_${t.empresa.rut.replace(/\./g, '')}.xlsx`);
}
