// Cuántas cosas quedan por clasificar (número del menú lateral).
import type { Documento, Empresa } from './rcv';
import type { Movimiento } from './cartola';
import { proveedoresSinCategoria, type ConfigContable } from './contabilidad';
import { observacionesDocumento } from './controles';

/** Lo que está por clasificar (para el número del menú). */
export function contarPorClasificar(empresa: Empresa, movs: Movimiento[], docs: Documento[], cfg: ConfigContable) {
  const banco = movs.filter(m => m.estado === 'pendiente').length;
  const proveedores = proveedoresSinCategoria(docs, cfg.provCategoria, empresa.rut).length;
  const documentos = docs.filter(d => d.empresa === empresa.rut && d.estado !== 'ANULADA' && observacionesDocumento(d).length).length;
  return { banco, proveedores, documentos, total: banco + proveedores + documentos };
}
