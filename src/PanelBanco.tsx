import { useMemo, useState } from 'react';
import type { Documento } from './nucleo/rcv';
import type { Movimiento } from './nucleo/cartola';
import type { F29 } from './nucleo/f29';
import { sugerirCruces, aplicarCruces, clasificar, crearRegla, CATEGORIAS, type Regla, type Sugerencia, type Confianza } from './nucleo/cruce';
import { periodoLegible } from './nucleo/lector';
import { pesos } from './formato';

interface Props {
  movs: Movimiento[]; docs: Documento[]; f29s: F29[]; reglas: Regla[]; rutEmpresa: string;
  onCambio: (movs: Movimiento[], docs?: Documento[], reglas?: Regla[]) => void;
  onBorrar: () => void;
}
const CLASE: Record<Confianza, string> = { Alta: 'verde', Media: 'anil', Baja: 'ambar', 'Sin calce': 'rojo' };
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const montoMov = (m: Movimiento) => <span className={m.cargo ? 'neg' : 'pos'}>{pesos(m.abono - m.cargo)}</span>;

export default function PanelBanco({ movs, docs, f29s, reglas, rutEmpresa, onCambio, onBorrar }: Props) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[] | null>(null);
  const [decision, setDecision] = useState<Record<string, 'Aceptar' | 'Rechazar'>>({});
  const [verTodos, setVerTodos] = useState(false);
  const porClave = useMemo(() => new Map(movs.map(m => [m.clave, m])), [movs]);
  const docPorClave = useMemo(() => new Map(docs.map(d => [d.clave, d])), [docs]);

  const porMes = useMemo(() => {
    const m = new Map<string, { cuenta: string; periodo: string; n: number; entra: number; sale: number; saldo: number | null }>();
    for (const x of [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const k = `${x.cuenta}|${x.fecha.slice(0, 7)}`;
      const r = m.get(k) ?? { cuenta: x.cuenta, periodo: x.fecha.slice(0, 7), n: 0, entra: 0, sale: 0, saldo: null };
      r.n++; r.entra += x.abono; r.sale += x.cargo; if (x.saldo !== null) r.saldo = x.saldo; m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
  }, [movs]);
  const identificados = movs.filter(m => m.estado !== 'pendiente').length;

  function buscar() {
    const r = sugerirCruces(movs, docs, f29s, rutEmpresa);
    const conReglas = clasificar(movs, reglas, r.pagosF29);       // pagos de F29 y reglas aprendidas se clasifican solos
    const cambiaron = conReglas.some((m, i) => m !== movs[i]);
    if (cambiaron) onCambio(conReglas);
    setSugerencias(r.sugerencias.filter(s => conReglas.find(m => m.clave === s.movimiento)?.estado === 'pendiente'));
    setDecision({});
  }
  function aplicar() {
    if (!sugerencias) return;
    const aceptadas = sugerencias.filter(s => decision[s.movimiento] === 'Aceptar' && s.docs.length);
    const r = aplicarCruces(aceptadas, docs, movs);
    onCambio(r.movs, r.docs);
    setSugerencias(sugerencias.filter(s => !aceptadas.includes(s) && decision[s.movimiento] !== 'Rechazar'));
    setDecision({});
  }
  function clasificarMov(m: Movimiento, categoria: string, recordar: boolean) {
    let nuevas = reglas;
    if (recordar) nuevas = [...reglas, crearRegla(m, categoria, reglas)];
    const marcados = movs.map(x => (x.clave === m.clave ? { ...x, estado: 'clasificado' as const, categoria, regla: recordar ? nuevas[nuevas.length - 1].id : 'a mano' } : x));
    onCambio(recordar ? clasificar(marcados, nuevas) : marcados, undefined, recordar ? nuevas : undefined);
    if (sugerencias) setSugerencias(sugerencias.filter(s => s.movimiento !== m.clave));
  }

  const conSugerencia = new Set((sugerencias ?? []).filter(s => s.docs.length).map(s => s.movimiento));
  const porIdentificar = movs.filter(m => m.estado === 'pendiente' && !conSugerencia.has(m.clave)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const nAceptar = Object.values(decision).filter(v => v === 'Aceptar').length;

  return (
    <section className="libros banco">
      <h2>Banco</h2>
      <p className="bajada chica">{movs.length.toLocaleString('de-DE')} movimientos cargados; {identificados.toLocaleString('de-DE')} ya identificados
        ({Math.round(identificados / movs.length * 100)}%). Busca qué factura paga o cobra cada movimiento y clasifica el resto.</p>
      <div className="desliza"><table>
        <thead><tr><th>Mes</th><th>Cuenta</th><th className="n">Movimientos</th><th className="n">Entra</th><th className="n">Sale</th><th className="n">Saldo final</th></tr></thead>
        <tbody>{porMes.map(p => <tr key={p.cuenta + p.periodo}><td>{periodoLegible(p.periodo)}</td><td>{p.cuenta || '—'}</td><td className="n">{p.n}</td>
          <td className="n">{pesos(p.entra)}</td><td className="n">{pesos(p.sale)}</td><td className="n">{p.saldo === null ? '—' : pesos(p.saldo)}</td></tr>)}</tbody>
      </table></div>

      <div className="borrador">
        <div className="borrador-cab">
          <h3>Cobros y pagos</h3>
          <button className="boton" onClick={buscar}>{sugerencias ? 'Buscar de nuevo' : 'Buscar cobros y pagos'}</button>
          {sugerencias && sugerencias.some(s => s.confianza === 'Alta') && (
            <button className="boton secundario" onClick={() => setDecision(d => ({ ...d, ...Object.fromEntries(sugerencias.filter(s => s.confianza === 'Alta').map(s => [s.movimiento, 'Aceptar' as const])) }))}>Aceptar las de confianza alta</button>)}
          {nAceptar > 0 && <button className="boton" onClick={aplicar}>Aplicar {nAceptar} aceptada{nAceptar > 1 ? 's' : ''}</button>}
        </div>
        {!sugerencias ? <p className="vacio">La app busca por el RUT o el nombre en la glosa y por el monto exacto. Nada se marca como pagado sin que lo aceptes.</p>
          : sugerencias.length === 0 ? <p className="vacio">No hay sugerencias nuevas.</p> : (
          <ul className="sugerencias">
            {(verTodos ? sugerencias : sugerencias.slice(0, 40)).map(s => {
              const m = porClave.get(s.movimiento); if (!m) return null;
              const dec = decision[s.movimiento];
              return (
                <li key={s.movimiento} className={dec ? `decidida ${dec === 'Aceptar' ? 'si' : 'no'}` : ''}>
                  <div className="sug-mov"><span className={`chip ${CLASE[s.confianza]}`}>{s.confianza}</span>
                    <b>{fechaCorta(m.fecha)}</b> {m.descripcion} <b>{montoMov(m)}</b></div>
                  <p className="sug-motivo">{s.motivo}</p>
                  {s.docs.length > 0 && <p className="sug-docs">{s.docs.map(k => docPorClave.get(k)).filter(Boolean).map(d => `${d!.razonSocial} folio ${d!.folio} (${pesos(d!.total)})`).join(' · ')}</p>}
                  {s.docs.length > 0 && <div className="sug-botones">
                    <button className={`enlace ${dec === 'Aceptar' ? 'activo' : ''}`} onClick={() => setDecision(d => ({ ...d, [s.movimiento]: 'Aceptar' }))}>Aceptar</button>
                    <button className={`enlace ${dec === 'Rechazar' ? 'activo' : ''}`} onClick={() => setDecision(d => ({ ...d, [s.movimiento]: 'Rechazar' }))}>Rechazar</button>
                  </div>}
                </li>);
            })}
          </ul>)}
        {sugerencias && sugerencias.length > 40 && !verTodos && <button className="enlace" onClick={() => setVerTodos(true)}>Ver las {sugerencias.length} sugerencias</button>}
      </div>

      <details className="detalle">
        <summary>Por identificar ({porIdentificar.length})</summary>
        <p className="vacio">Movimientos sin factura: clasifícalos. Si marcas "recordar", los movimientos con la misma glosa se clasifican solos.</p>
        <ul className="por-identificar">{porIdentificar.slice(0, 60).map(m => <Clasificador key={m.clave} m={m} onClasificar={clasificarMov} />)}</ul>
        {porIdentificar.length > 60 && <p className="vacio">Se muestran 60 de {porIdentificar.length}.</p>}
      </details>
      {reglas.length > 0 && <p className="vacio">{reglas.length} regla{reglas.length > 1 ? 's' : ''} aprendida{reglas.length > 1 ? 's' : ''}.</p>}
      <button className="enlace peligro" onClick={onBorrar}>Borrar movimientos del banco</button>
    </section>
  );
}

function Clasificador({ m, onClasificar }: { m: Movimiento; onClasificar: (m: Movimiento, c: string, recordar: boolean) => void }) {
  const [cat, setCat] = useState(''), [recordar, setRecordar] = useState(true);
  return (
    <li>
      <div className="sug-mov"><b>{fechaCorta(m.fecha)}</b> {m.descripcion} <b>{montoMov(m)}</b></div>
      <div className="clasificar">
        <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Clasificar como"><option value="">Clasificar como…</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
        <label><input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} /> Recordar para movimientos con esta glosa</label>
        <button className="boton" disabled={!cat} onClick={() => onClasificar(m, cat, recordar)}>Guardar</button>
      </div>
    </li>
  );
}
