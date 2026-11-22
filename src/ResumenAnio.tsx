import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Documento, Empresa } from './nucleo/rcv';
import { aniosDisponibles, resumenAnual } from './nucleo/resumen';
import { pesos } from './formato';

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const millones = (n: number) => (n < 0 ? '−' : '') + '$' + (Math.abs(n) / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' M';

export default function ResumenAnio({ docs, empresa, onCerrar }: { docs: Documento[]; empresa: Empresa; onCerrar: () => void }) {
  const anios = useMemo(() => aniosDisponibles(docs), [docs]);
  const [anio, setAnio] = useState(anios[0] ?? new Date().getFullYear());
  const r = useMemo(() => resumenAnual(docs, anio), [docs, anio]);
  const tope = Math.max(1, ...r.meses.map(m => Math.max(m.ventas, m.compras)));

  function descargarExcel() {
    const libro = XLSX.utils.book_new();
    const filas = [['Mes', 'Ventas netas', 'Compras netas', 'Diferencia', 'IVA débito', 'IVA crédito', 'Documentos de venta', 'Documentos de compra'],
      ...r.meses.map((m, i) => [`${MES[i]} ${anio}`, m.ventas, m.compras, m.ventas - m.compras, m.ivaDebito, m.ivaCredito, m.docsVenta, m.docsCompra]),
      ['Total', r.ventas, r.compras, r.margen, r.ivaDebito, r.ivaCredito, '', '']];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Resumen mensual');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Cliente', 'RUT', 'Ventas netas', 'Participación'], ...r.clientes.map(c => [c.nombre, c.rut, c.monto, c.participacion])]), 'Principales clientes');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Proveedor', 'RUT', 'Compras netas', 'Participación'], ...r.proveedores.map(c => [c.nombre, c.rut, c.monto, c.participacion])]), 'Principales proveedores');
    XLSX.writeFile(libro, `Resumen_${anio}.xlsx`);
  }

  return (
    <div className="velo" role="dialog" aria-modal="true" aria-labelledby="titulo-resumen" onKeyDown={e => e.key === 'Escape' && onCerrar()}>
      <article className="resumen-hoja">
        <header className="resumen-cab">
          <div>
            <p className="resumen-empresa">{empresa.razonSocial}, RUT {empresa.rut}</p>
            <h2 id="titulo-resumen">Cómo va {anio}</h2>
          </div>
          <div className="resumen-acciones no-imprimir">
            {anios.length > 1 && <select value={anio} onChange={e => setAnio(Number(e.target.value))} aria-label="Año">{anios.map(a => <option key={a}>{a}</option>)}</select>}
            <button className="boton" onClick={() => window.print()}>Descargar PDF</button>
            <button className="boton secundario" onClick={descargarExcel}>Descargar Excel</button>
            <button className="cerrar" onClick={onCerrar} aria-label="Cerrar el resumen" autoFocus>×</button>
          </div>
        </header>

        <p className="veredicto">
          Vendiste <strong>{millones(r.ventas)}</strong> y compraste <strong>{millones(r.compras)}</strong> en neto.
          {r.margenPct !== null && <> Lo que queda después de las compras es <strong className={r.margen < 0 ? 'neg' : ''}>{millones(r.margen)}</strong>, un {Math.round(r.margenPct * 100)}% de las ventas.</>}
          {' '}Aún no incluye sueldos, honorarios ni gastos sin factura.
        </p>

        <div className="cifras">
          <div><span>Ventas netas</span><b>{pesos(r.ventas)}</b></div>
          <div><span>Compras netas</span><b>{pesos(r.compras)}</b></div>
          <div><span>IVA débito menos crédito</span><b className={r.ivaNeto < 0 ? 'neg' : ''}>{pesos(r.ivaNeto)}</b><small>{r.ivaNeto >= 0 ? 'a pagar antes de remanentes y PPM' : 'queda como remanente'}</small></div>
          <div><span>Documentos</span><b>{r.documentos.toLocaleString('de-DE')}</b></div>
        </div>

        <section className="grafico" aria-label="Ventas y compras por mes">
          <div className="leyenda"><span className="v">Ventas</span><span className="c">Compras</span></div>
          <div className="barras">
            {r.meses.map((m, i) => (
              <div className="mes" key={m.periodo} title={`${MES[i]}: ventas ${pesos(m.ventas)}, compras ${pesos(m.compras)}`}>
                <div className="par">
                  <i className="v" style={{ height: `${Math.max(0, m.ventas) / tope * 100}%` }} />
                  <i className="c" style={{ height: `${Math.max(0, m.compras) / tope * 100}%` }} />
                </div>
                <span>{MES[i]}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="dos">
          <Ranking titulo="Principales clientes" filas={r.clientes} />
          <Ranking titulo="Principales proveedores" filas={r.proveedores} />
        </div>

        <section className="alertas">
          <h3>Para revisar</h3>
          {r.alertas.length === 0 ? <p>No hay alertas con lo cargado hasta ahora.</p>
            : <ul>{r.alertas.map((a, i) => <li key={i} className={a.nivel}>{a.texto}</li>)}</ul>}
        </section>
      </article>
    </div>
  );
}

function Ranking({ titulo, filas }: { titulo: string; filas: { rut: string; nombre: string; monto: number; participacion: number }[] }) {
  return (
    <section className="ranking">
      <h3>{titulo}</h3>
      {filas.length === 0 ? <p className="vacio">Sin datos.</p> : <ol>{filas.map(f => (
        <li key={f.rut}><span className="nombre">{f.nombre}</span><span className="pct">{Math.round(f.participacion * 100)}%</span>
          <span className="pista"><i style={{ width: `${Math.max(2, f.participacion * 100)}%` }} /></span></li>))}</ol>}
    </section>
  );
}
