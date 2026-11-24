import { useMemo, useState } from 'react';
import type { Documento } from './nucleo/rcv';
import type { Movimiento } from './nucleo/cartola';
import type { F29 } from './nucleo/f29';
import { sugerirCruces, aplicarCruces, clasificar, traspasosPropios, reaplicarReglas, CATEGORIAS, type Regla, type Sugerencia, type Confianza } from './nucleo/cruce';
import { periodoLegible } from './nucleo/lector';
import { pesos } from './formato';
import { cuerposTrabajadores, type LibroRemuneraciones } from './nucleo/remuneraciones';

interface Props {
  movs: Movimiento[]; docs: Documento[]; f29s: F29[]; reglas: Regla[]; libros: LibroRemuneraciones[]; rutEmpresa: string; razonSocial?: string;
  onIrClasificar: () => void;
  onCambio: (movs: Movimiento[], docs?: Documento[], reglas?: Regla[]) => void;
  onBorrar: () => void;
}
const CLASE: Record<Confianza, string> = { Alta: 'verde', Media: 'anil', Baja: 'ambar', 'Sin calce': 'rojo' };
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const montoMov = (m: Movimiento) => <span className={m.cargo ? 'neg' : 'pos'}>{pesos(m.abono - m.cargo)}</span>;

export default function PanelBanco({ movs, docs, f29s, reglas, libros, rutEmpresa, razonSocial = '', onIrClasificar, onCambio, onBorrar }: Props) {
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
    // F29, traspasos entre cuentas propias, pagos al personal y reglas aprendidas se clasifican solos
    const conReglas = clasificar(movs, reglas, r.pagosF29, cuerposTrabajadores(libros), traspasosPropios(movs, rutEmpresa, razonSocial));
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
  const porIdentificar = movs.filter(m => m.estado === 'pendiente').length;
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

      <div className="borrador">
        <div className="borrador-cab"><h3>Por identificar</h3>
          {porIdentificar > 0 && <button className="boton secundario" onClick={onIrClasificar}>Clasificar {porIdentificar} movimiento{porIdentificar > 1 ? 's' : ''}</button>}</div>
        <p className="vacio">{porIdentificar ? 'Los movimientos sin factura ni regla se ordenan en "Por clasificar", donde la app además te sugiere qué es cada uno.' : 'Todos los movimientos están identificados.'}</p>
      </div>
      <ReglasAprendidas reglas={reglas} movs={movs} onCambio={(m, r) => onCambio(m, undefined, r)} />
      <button className="enlace peligro" onClick={onBorrar}>Borrar movimientos del banco</button>
    </section>
  );
}

const NOMBRE_TIPO = { igual: 'Glosa igual a', contiene: 'Glosa contiene', rut: 'RUT en la glosa' } as const;

/** Reglas aprendidas: ver, cambiar la clasificación, desactivar o borrar. Lo que clasificó una regla borrada o desactivada
 *  vuelve a "Por clasificar". */
function ReglasAprendidas({ reglas, movs, onCambio }: { reglas: Regla[]; movs: Movimiento[]; onCambio: (movs: Movimiento[], reglas: Regla[]) => void }) {
  const usos = useMemo(() => { const u = new Map<string, number>(); for (const m of movs) if (m.regla) u.set(m.regla, (u.get(m.regla) ?? 0) + 1); return u; }, [movs]);
  const cambiar = (nuevas: Regla[]) => onCambio(reaplicarReglas(movs, nuevas), nuevas);
  const editar = (id: string, x: Partial<Regla>) => cambiar(reglas.map(r => (r.id === id ? { ...r, ...x } : r)));
  if (!reglas.length) return <p className="vacio reglas">Todavía no hay reglas aprendidas. Se crean al clasificar con "Recordar como regla".</p>;
  return (
    <div className="borrador reglas">
      <div className="borrador-cab"><h3>Reglas aprendidas ({reglas.length})</h3></div>
      <p className="vacio">Si cambias la clasificación de una regla, cambian todos los movimientos que clasificó. Si la desactivas o la borras, esos movimientos vuelven a "Por clasificar".</p>
      <div className="desliza"><table>
        <thead><tr><th>Regla</th><th>Lado</th><th>Clasificación</th><th className="n">Aplicada</th><th>Activa</th><th></th></tr></thead>
        <tbody>{reglas.map(r => (
          <tr key={r.id} className={r.activa === false ? 'apagada' : ''}>
            <td><span className="vacio">{NOMBRE_TIPO[r.tipo ?? 'igual']}</span> <b>{r.texto ?? r.patron}</b></td>
            <td>{r.lado === 'ambos' ? 'Cargo y abono' : r.lado === 'cargo' ? 'Cargo' : 'Abono'}</td>
            <td><select value={r.categoria} onChange={e => editar(r.id, { categoria: e.target.value })} aria-label={`Clasificación de la regla ${r.id}`}>
              {!(CATEGORIAS as readonly string[]).includes(r.categoria) && <option>{r.categoria}</option>}
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></td>
            <td className="n">{usos.get(r.id) ?? 0}</td>
            <td><input type="checkbox" checked={r.activa !== false} onChange={e => editar(r.id, { activa: e.target.checked })} aria-label={`Regla ${r.id} activa`} /></td>
            <td><button className="enlace peligro" onClick={() => cambiar(reglas.filter(x => x.id !== r.id))}>Borrar</button></td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );
}
