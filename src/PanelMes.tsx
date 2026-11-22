import { useMemo, useState } from 'react';
import type { Control } from './nucleo/contabilidad';
import type { PanelMes as Datos } from './nucleo/panel';
import { periodoLegible } from './nucleo/lector';
import { pesos } from './formato';

const CHIP = { OK: 'verde', Revisar: 'rojo', Pendiente: 'ambar' } as const;
const fecha = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

interface Props { meses: string[]; sugerido: string; calcular: (p: string) => Datos; controles: Control[]; onDescargar: () => void }

export default function PanelMes({ meses, sugerido, calcular, controles, onDescargar }: Props) {
  const [elegido, setElegido] = useState<string | null>(null);
  const periodo = elegido && meses.includes(elegido) ? elegido : meses.includes(sugerido) ? sugerido : meses[0];
  const p = useMemo(() => calcular(periodo), [calcular, periodo]);
  const [verTodos, setVerTodos] = useState(false);
  const ok = controles.filter(c => c.estado === 'OK').length;
  const atencion = controles.filter(c => c.estado !== 'OK');
  const listos = p.pendientes.filter(x => x.hecho).length;

  return (
    <section className="libros panel-mes" aria-labelledby="titulo-panel">
      <div className="borrador-cab">
        <h2 id="titulo-panel">Panel del mes</h2>
        <select value={periodo} onChange={e => setElegido(e.target.value)} aria-label="Mes del panel">{meses.map(m => <option key={m} value={m}>{periodoLegible(m)}</option>)}</select>
        <button className="boton secundario" onClick={onDescargar}>Descargar todo en Excel</button>
      </div>

      <div className="avance" aria-label={`${listos} de ${p.pendientes.length} documentos del mes cargados`}>
        {p.pendientes.map(x => <span key={x.que} className={x.hecho ? 'hecho' : ''} title={x.detalle}>{x.que}</span>)}
      </div>

      <div className="cifras">
        <div><span>Ventas netas</span><b>{pesos(p.ventas)}</b><small>{p.docsVenta} documentos</small></div>
        <div><span>Compras netas</span><b>{pesos(p.compras)}</b><small>{p.docsCompra} documentos</small></div>
        <div><span>IVA débito menos crédito</span><b className={p.ivaDebito - p.ivaCredito < 0 ? 'neg' : ''}>{pesos(p.ivaDebito - p.ivaCredito)}</b>
          <small>{p.ivaDebito - p.ivaCredito >= 0 ? 'antes de remanente y PPM' : 'queda como remanente'}</small></div>
        <div><span>F29</span><b>{p.f29.cargado ? (p.f29.totalPagado !== null ? pesos(p.f29.totalPagado) : 'Cargado') : 'Sin declarar'}</b>
          <small>{p.f29.cargado ? (p.f29.estado ? `${p.f29.estado} con el RCV` : 'declarado') : `vence el ${fecha(p.f29.vence)}`}</small></div>
        <div><span>Banco al cierre</span><b>{p.banco.saldo === null ? '—' : pesos(p.banco.saldo)}</b>
          <small>{p.banco.movimientos ? `${p.banco.identificados} de ${p.banco.movimientos} movimientos identificados` : 'sin movimientos'}</small></div>
        {p.haberes !== null && <div><span>Remuneraciones</span><b>{pesos(p.haberes)}</b><small>total haberes del libro</small></div>}
      </div>

      <ul className="lista-mes">{p.pendientes.filter(x => !x.hecho).map(x => <li key={x.que}><b>{x.que}:</b> {x.detalle}</li>)}</ul>

      <div className="controles-cab">
        <h3>{ok} de {controles.length} controles en orden</h3>
        <div className="medidor" aria-hidden><i style={{ width: `${controles.length ? ok / controles.length * 100 : 0}%` }} /></div>
        <button className="enlace" onClick={() => setVerTodos(v => !v)}>{verTodos ? 'Ver solo los que piden atención' : `Ver los ${controles.length} controles`}</button>
      </div>
      <ul className="controles">{(verTodos ? controles : atencion).map(c => (
        <li key={c.nombre} className={CHIP[c.estado]}>
          <div className="sug-mov"><span className={`chip ${CHIP[c.estado]}`}>{c.estado}</span><b>{c.nombre}</b></div>
          <p className="sug-motivo">{c.resultado}</p>
          {c.accion && <p className="sug-docs">{c.accion}</p>}
        </li>))}</ul>
      {!verTodos && atencion.length === 0 && <p className="vacio">Todo en orden con lo cargado hasta ahora.</p>}
    </section>
  );
}
