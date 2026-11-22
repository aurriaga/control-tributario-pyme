import { useMemo } from 'react';
import type { Movimiento } from './nucleo/cartola';
import { resumenPersonal, librosFaltantes, type LibroRemuneraciones, type MesHonorarios } from './nucleo/remuneraciones';
import { periodoLegible } from './nucleo/lector';
import { pesos } from './formato';

export default function PanelPersonal({ libros, honorarios, movs, onBorrar }: { libros: LibroRemuneraciones[]; honorarios: MesHonorarios[]; movs: Movimiento[]; onBorrar: () => void }) {
  const meses = useMemo(() => resumenPersonal(libros, honorarios, movs).reverse(), [libros, honorarios, movs]);
  const faltan = useMemo(() => librosFaltantes(libros), [libros]);
  const total = (k: 'haberes' | 'aporteEmpleador' | 'honorariosBruto') => meses.reduce((a, m) => a + (m[k] ?? 0), 0);
  const sinAporte = meses.filter(m => m.trabajadores && m.aporteEmpleador === null).map(m => periodoLegible(m.periodo));
  const revisar = libros.flatMap(l => l.trabajadores.filter(t => t.control !== 'OK').map(t => `${periodoLegible(l.periodo)}: ${t.nombre || t.rut} (${t.control.replace('Revisar: ', '')})`));
  return (
    <section className="libros personal">
      <h2>Personal</h2>
      <p className="bajada chica">Remuneraciones {pesos(total('haberes'))}, aporte del empleador {pesos(total('aporteEmpleador'))} y honorarios {pesos(total('honorariosBruto'))}:
        en total {pesos(total('haberes') + total('aporteEmpleador') + total('honorariosBruto'))}.</p>
      <div className="desliza"><table>
        <thead><tr><th>Mes</th><th className="n">Trabajadores</th><th className="n">Haberes</th><th className="n">Cotizaciones</th><th className="n">Impuesto único</th>
          <th className="n">Líquido</th><th className="n">Aporte empleador</th><th className="n">Honorarios</th><th className="n">Retención</th><th>Libro</th></tr></thead>
        <tbody>{meses.map(m => (
          <tr key={m.periodo}>
            <td>{periodoLegible(m.periodo)}</td><td className="n">{m.trabajadores || '—'}</td><td className="n">{m.trabajadores ? pesos(m.haberes) : '—'}</td>
            <td className="n">{m.trabajadores ? pesos(m.cotizaciones) : '—'}</td><td className="n">{m.trabajadores ? pesos(m.impuestoUnico) : '—'}</td>
            <td className="n">{m.trabajadores ? pesos(m.liquido) : '—'}</td>
            <td className="n" title={m.pagoPrevired !== null ? `PREVIRED del mes siguiente: ${pesos(m.pagoPrevired)}` : 'Falta el pago a PREVIRED del mes siguiente en la cartola'}>{m.aporteEmpleador === null ? '—' : pesos(m.aporteEmpleador)}</td>
            <td className="n">{m.honorariosBruto ? pesos(m.honorariosBruto) : '—'}</td><td className="n">{m.retencionHonorarios ? pesos(m.retencionHonorarios) : '—'}</td>
            <td>{!m.trabajadores ? <span className="chip ambar">Falta</span> : m.filasRevisar || m.cuadraTotales === false ? <span className="chip rojo">Revisar</span> : <span className="chip verde">Cuadra</span>}</td>
          </tr>))}</tbody>
      </table></div>
      {faltan.length > 0 && <p className="aviso">Falta el libro de remuneraciones de {faltan.map(periodoLegible).join(', ')}.</p>}
      {sinAporte.length > 0 && <p className="vacio">Sin aporte del empleador en {sinAporte.join(', ')}: se calcula con el pago a PREVIRED del mes siguiente que aparece en la cartola, menos las cotizaciones del libro.</p>}
      {revisar.length > 0 && <ul className="mensajes">{revisar.slice(0, 8).map((x, i) => <li key={i} className="error">{x}</li>)}</ul>}
      <button className="enlace peligro" onClick={onBorrar}>Borrar libros y honorarios</button>
    </section>
  );
}
