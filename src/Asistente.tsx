import { useEffect, useRef, useState } from 'react';
import type { Control } from './nucleo/contabilidad';
import { buscarAyuda, diagnosticar, aplicarArreglo, intencion, respuestaNormativa, SALUDO, NO_ENTENDI, type Accion, type Datos, type Hallazgo, type Vista } from './nucleo/asistente';
import { proponerAsiento, comoManual, type AsientoPropuesto } from './nucleo/asientosAyuda';
import type { LineaManual } from './nucleo/contabilidad';
import { pesos } from './formato';
import { responderTributaria } from './nucleo/tributario';
import { responderGlosario } from './nucleo/vocabulario';
import { resumenNoticias } from './nucleo/noticias';
import type { PanelMes } from './nucleo/panel';
import { periodoLegible } from './nucleo/lector';

interface Mensaje { de: 'yo' | 'app'; texto: string; acciones?: Accion[]; hallazgos?: Hallazgo[]; asiento?: AsientoPropuesto }
interface Props {
  datos: Datos; controles: Control[]; mes: PanelMes | null; porClasificar: number;
  onIr: (v: Vista, pestana?: string) => void; onArreglar: (cambios: ReturnType<typeof aplicarArreglo>) => void; onRecorrido: () => void;
  onAgregarAsiento: (lineas: LineaManual[]) => void;
}
const CHIPS = ['Revisa mi empresa', '¿Qué falta este mes?', 'Noticias del SII', '¿Qué DJ me tocan?','Si tengo 30.000.000 de renta, ¿cuánto pago de primera categoría siendo 14 D N°3?', 'Asiento: depreciación de un vehículo de 12.000.000'];
const CHIP_NIVEL = { error: 'rojo', aviso: 'ambar', ok: 'verde' } as const;
/** Las fuentes oficiales (sii.cl, tgr.cl) se pueden abrir con un clic. */
const conEnlaces = (s: string) => s.split(/(https:\/\/[^\s)]+)/).map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noreferrer">{p.replace(/^https:\/\/(www\.)?/, '').split('/')[0]}</a> : p));

export default function Asistente({ datos, controles, mes, porClasificar, onIr, onArreglar, onRecorrido, onAgregarAsiento }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: 'app', ...SALUDO }]);
  const [texto, setTexto] = useState('');
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }); }, [mensajes, abierto]);

  function revisar(): Mensaje {
    const h = diagnosticar(datos, controles);
    if (!h.length) return { de: 'app', texto: 'Revisé los 17 controles y la integridad de los datos: todo está en orden. 🎉' };
    const errores = h.filter(x => x.nivel === 'error').length;
    return { de: 'app', texto: `Revisé tu empresa: encontré ${h.length} cosa${h.length > 1 ? 's' : ''} para mirar${errores ? ` (${errores} importante${errores > 1 ? 's' : ''})` : ''}. Lo que puedo corregir solo tiene un botón; te pido confirmación antes de cambiar algo.`, hallazgos: h };
  }
  function falta(): Mensaje {
    if (!mes) return { de: 'app', texto: 'Todavía no hay documentos cargados. Empieza por los RCV de compras y ventas, el F29 y la cartola del mes.', acciones: [{ tipo: 'ir', etiqueta: 'Ir a Cargar documentos', vista: 'cargar' }] };
    const pend = mes.pendientes.filter(p => !p.hecho);
    const lineas = pend.map(p => `• ${p.que}: ${p.detalle}`);
    if (porClasificar) lineas.push(`• ${porClasificar} cosas por clasificar.`);
    return { de: 'app', texto: lineas.length ? `En ${periodoLegible(mes.periodo)} falta:\n${lineas.join('\n')}` : `En ${periodoLegible(mes.periodo)} está todo cargado y clasificado.`,
      acciones: [...(pend.length ? [{ tipo: 'ir' as const, etiqueta: 'Ir a Cargar documentos', vista: 'cargar' as Vista }] : []), ...(porClasificar ? [{ tipo: 'ir' as const, etiqueta: 'Ir a Por clasificar', vista: 'clasificar' as Vista }] : [])] };
  }
  function preguntar(q: string) {
    const p = q.trim(); if (!p) return;
    const i = intencion(p);
    let r: Mensaje;
    if (i === 'tributaria') r = { de: 'app', ...(responderTributaria(p) ?? responderGlosario(p) ?? NO_ENTENDI) };
    else if (i === 'glosario') r = { de: 'app', ...(responderGlosario(p) ?? buscarAyuda(p) ?? NO_ENTENDI) };
    else if (i === 'noticias') r = { de: 'app', texto: resumenNoticias(), acciones: [{ tipo: 'ir', etiqueta: 'Ver todas las noticias', vista: 'noticias' }] };
    else if (i === 'asiento') {
      const a = proponerAsiento(p, datos.cfg.plan);
      r = a ? { de: 'app', texto: `Te propongo este asiento: ${a.titulo.toLowerCase()}. Revísalo antes de agregarlo.`, asiento: a }
        : { de: 'app', texto: 'Para armar el asiento necesito la operación y el monto. Por ejemplo: "vendí 1.190.000 con boleta en efectivo", "compré un notebook en 800.000 neto con transferencia", "depreciación de una camioneta de 15.000.000" o "boleta de honorarios de 300.000".' };
    } else r = i === 'normativa' ? { de: 'app', ...respuestaNormativa() } : i === 'revisar' ? revisar() : i === 'falta' ? falta() : { de: 'app', ...(buscarAyuda(p) ?? responderGlosario(p) ?? NO_ENTENDI) };
    setMensajes(m => [...m, { de: 'yo', texto: p }, r]); setTexto(''); setConfirmar(null);
  }
  function accion(a: Accion, clave: string) {
    if (a.tipo === 'ir') { onIr(a.vista, a.pestana); return; }
    if (a.tipo === 'recorrido') { setAbierto(false); onRecorrido(); return; }
    if (confirmar !== clave) { setConfirmar(clave); return; }       // el primer clic muestra qué se va a hacer
    onArreglar(aplicarArreglo(a.arreglo, datos));
    setConfirmar(null);
    setMensajes(m => [...m, { de: 'app', texto: `Listo: ${a.etiqueta.toLowerCase()}. ¿Reviso de nuevo?`, acciones: [] }]);
  }
  const botones = (acciones: Accion[] = [], base: string) => acciones.length > 0 && (
    <div className="asis-acciones">{acciones.map((a, j) => {
      const clave = `${base}-${j}`;
      return a.tipo === 'arreglar' && confirmar === clave
        ? <span key={clave} className="asis-confirmar">{a.explica} <button className="boton" onClick={() => accion(a, clave)}>Sí, arreglar</button> <button className="enlace" onClick={() => setConfirmar(null)}>Cancelar</button></span>
        : <button key={clave} className={a.tipo === 'arreglar' ? 'boton' : 'boton secundario'} onClick={() => accion(a, clave)}>{a.etiqueta}</button>;
    })}</div>);

  return (<>
    <button className="asis-abrir boton" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-controls="asistente">{abierto ? 'Cerrar' : 'Riffo Junior'}</button>
    {abierto && (
      <section id="asistente" className="asistente" role="dialog" aria-label="Riffo Junior, asistente contable" onKeyDown={e => e.key === 'Escape' && setAbierto(false)}>
        <header><b>Riffo Junior</b><span>Tu asistente contable. Tus datos no salen del navegador.</span>
          <button className="cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el asistente">×</button></header>
        <div className="asis-mensajes" aria-live="polite">
          {mensajes.map((m, i) => (
            <div key={i} className={`asis-msj ${m.de}`}>
              <p>{conEnlaces(m.texto)}</p>
              {m.hallazgos && <ul className="asis-hallazgos">{m.hallazgos.map((h, k) => (
                <li key={k}><span className={`chip ${CHIP_NIVEL[h.nivel]}`}>{h.nivel === 'error' ? 'Revisar' : 'Pendiente'}</span> <b>{h.titulo}</b>
                  <p>{h.detalle}</p>{botones(h.acciones, `${i}-${k}`)}</li>))}</ul>}
              {m.asiento && <AsientoVista a={m.asiento} clave={`as-${i}`} confirmar={confirmar} setConfirmar={setConfirmar}
                onAgregar={() => { const n = datos.cfg.manuales.filter(l => l.asiento.startsWith('RJ-')).map(l => Number(l.asiento.slice(3)) || 0).reduce((x, y) => Math.max(x, y), 0) + 1;
                  onAgregarAsiento(comoManual(m.asiento!, `RJ-${n}`)); setConfirmar(null);
                  setMensajes(ms => [...ms, { de: 'app', texto: `Listo: agregué el asiento RJ-${n} en Contabilidad > Apertura y ajustes > Asientos manuales. Ahí puedes cambiar la fecha o las cuentas.`, acciones: [{ tipo: 'ir', etiqueta: 'Ver el asiento', vista: 'contabilidad', pestana: 'Apertura y ajustes' }] }]); }} />}
              {botones(m.acciones, `${i}`)}
            </div>))}
          <div ref={fin} />
        </div>
        <div className="asis-chips">{CHIPS.map(c => <button key={c} className="enlace" onClick={() => preguntar(c)}>{c}</button>)}</div>
        <form className="asis-escribir" onSubmit={e => { e.preventDefault(); preguntar(texto); }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe tu pregunta…" aria-label="Pregunta para el asistente" autoFocus />
          <button className="boton" disabled={!texto.trim()}>Enviar</button>
        </form>
      </section>)}
  </>);
}

function AsientoVista({ a, clave, confirmar, setConfirmar, onAgregar }: { a: AsientoPropuesto; clave: string; confirmar: string | null; setConfirmar: (c: string | null) => void; onAgregar: () => void }) {
  const d = a.lineas.reduce((s, l) => s + l.debe, 0), h = a.lineas.reduce((s, l) => s + l.haber, 0);
  return (
    <div className="asis-asiento">
      <p className="vacio">{a.fecha.split('-').reverse().join('-')} · {a.glosa}</p>
      <table><thead><tr><th>Cuenta</th><th className="n">Debe</th><th className="n">Haber</th></tr></thead>
        <tbody>{a.lineas.map((l, i) => <tr key={i}><td>{l.codigo} {l.cuenta}</td><td className="n">{l.debe ? pesos(l.debe) : ''}</td><td className="n">{l.haber ? pesos(l.haber) : ''}</td></tr>)}
          <tr className="total"><td>Totales</td><td className="n">{pesos(d)}</td><td className="n">{pesos(h)}</td></tr></tbody></table>
      {a.calculo && <p><b>Cálculo:</b> {a.calculo}</p>}
      <p><b>Por qué:</b> {a.porque}</p>
      {a.supuestos.length > 0 && <p className="vacio"><b>Supuse:</b> {a.supuestos.join(' ')}</p>}
      {a.aviso && <p className="aviso">{a.aviso}</p>}
      <div className="asis-acciones">{confirmar === clave
        ? <span className="asis-confirmar">Se agrega como asiento manual (debe = haber). <button className="boton" onClick={onAgregar}>Sí, agregar</button> <button className="enlace" onClick={() => setConfirmar(null)}>Cancelar</button></span>
        : <button className="boton" disabled={Math.abs(d - h) >= 1} onClick={() => setConfirmar(clave)}>Agregar como asiento manual</button>}</div>
    </div>
  );
}
