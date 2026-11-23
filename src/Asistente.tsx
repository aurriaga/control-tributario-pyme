import { useEffect, useRef, useState } from 'react';
import type { Control } from './nucleo/contabilidad';
import { buscarAyuda, diagnosticar, aplicarArreglo, intencion, respuestaNormativa, SALUDO, NO_ENTENDI, type Accion, type Datos, type Hallazgo, type Vista } from './nucleo/asistente';
import { proponerAsiento, comoManual, type AsientoPropuesto } from './nucleo/asientosAyuda';
import type { LineaManual } from './nucleo/contabilidad';
import { pesos } from './formato';
import { responderTributaria } from './nucleo/tributario';
import { responderGlosario } from './nucleo/vocabulario';
import { buscar } from './nucleo/buscador';
import { temasAyuda } from './nucleo/asistente';
import { claveIA, guardarClaveIA, preguntarIA } from './ia';
import { resumenNoticias } from './nucleo/noticias';
import type { PanelMes } from './nucleo/panel';
import { periodoLegible } from './nucleo/lector';

interface Mensaje { de: 'yo' | 'app'; texto: string; acciones?: Accion[]; hallazgos?: Hallazgo[]; asiento?: AsientoPropuesto; cargando?: boolean; ia?: boolean }
interface Props {
  datos: Datos; controles: Control[]; mes: PanelMes | null; porClasificar: number;
  onIr: (v: Vista, pestana?: string) => void; onArreglar: (cambios: ReturnType<typeof aplicarArreglo>) => void; onRecorrido: () => void;
  onAgregarAsiento: (lineas: LineaManual[]) => void;
}
const CHIPS = ['Revisa mi empresa', '¿Qué falta este mes?', 'Noticias del SII', '¿Qué cambia la reforma para las 14 A?', '¿Qué DJ me tocan?', 'Si tengo 30.000.000 de renta, ¿cuánto pago de primera categoría siendo 14 D N°3?', 'Asiento: depreciación de un vehículo de 12.000.000'];
const CHIP_NIVEL = { error: 'rojo', aviso: 'ambar', ok: 'verde' } as const;
/** Las fuentes oficiales (sii.cl, tgr.cl) se pueden abrir con un clic. */
const conEnlaces = (s: string) => s.split(/(https:\/\/[^\s)]+)/).map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noreferrer">{corto(p.replace(/^https:\/\/(www\.)?/, ''))}</a> : p));
const corto = (x: string) => (x.length > 52 ? `${x.slice(0, 51)}…` : x);

export default function Asistente({ datos, controles, mes, porClasificar, onIr, onArreglar, onRecorrido, onAgregarAsiento }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ de: 'app', ...SALUDO }]);
  const [texto, setTexto] = useState('');
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [clave, setClave] = useState<string | null>(() => claveIA());
  const [verIA, setVerIA] = useState(false);
  const [pensando, setPensando] = useState(false);
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
  /** Modo IA: Claude busca en sitios oficiales. Solo viaja la pregunta y el resumen público de la app. */
  async function correrIA(pregunta: string, contexto?: string) {
    if (!clave) { setVerIA(true); return; }
    if (pensando) return;
    setPensando(true);
    setMensajes(m => [...m, { de: 'app', texto: 'Buscando en sii.cl, bcn.cl y otras fuentes oficiales…', cargando: true }]);
    let r: Mensaje;
    try {
      const x = await preguntarIA(pregunta, clave, contexto);
      r = { de: 'app', ia: true, texto: `${x.texto}${x.fuentes.length ? `\nFuentes: ${x.fuentes.map(f => f.url).join(' · ')}` : ''}` };
    } catch (e) {
      r = { de: 'app', texto: e instanceof Error ? e.message : 'No pude consultar la IA.', acciones: [{ tipo: 'ia', etiqueta: 'Reintentar', pregunta, contexto }] };
    }
    setMensajes(m => [...m.filter(x => !x.cargando), r]);
    setPensando(false);
  }
  const conIA = (r: Mensaje, p: string): Mensaje => ({ ...r, acciones: [...(r.acciones ?? []), { tipo: 'ia', etiqueta: clave ? 'Buscar en fuentes oficiales con IA' : 'Profundizar con IA (opcional)', pregunta: p, contexto: r.texto }] });

  function preguntar(q: string) {
    const p = q.trim(); if (!p) return;
    const i = intencion(p);
    let r: Mensaje;
    let autoIA = false;
    if (i === 'tributaria') r = { de: 'app', ...(responderTributaria(p) ?? responderGlosario(p) ?? NO_ENTENDI) };
    else if (i === 'glosario') r = { de: 'app', ...(responderGlosario(p) ?? buscarAyuda(p) ?? NO_ENTENDI) };
    else if (i === 'buscar') {
      const b = buscar(p);
      r = conIA({ de: 'app', ...(b ?? { texto: 'No tengo una fuente oficial cargada que responda eso. Puedo buscarlo en sii.cl y bcn.cl con el modo IA, o puedes revisar las noticias del SII.', acciones: [{ tipo: 'ir', etiqueta: 'Ver las noticias del SII', vista: 'noticias' }] }) }, p);
      autoIA = !!clave;
    }
    else if (i === 'noticias') r = { de: 'app', texto: resumenNoticias(), acciones: [{ tipo: 'ir', etiqueta: 'Ver todas las noticias', vista: 'noticias' }] };
    else if (i === 'asiento') {
      const a = proponerAsiento(p, datos.cfg.plan);
      r = a ? { de: 'app', texto: `Te propongo este asiento: ${a.titulo.toLowerCase()}. Revísalo antes de agregarlo.`, asiento: a }
        : { de: 'app', texto: 'Para armar el asiento necesito la operación y el monto. Por ejemplo: "vendí 1.190.000 con boleta en efectivo", "compré un notebook en 800.000 neto con transferencia", "depreciación de una camioneta de 15.000.000" o "boleta de honorarios de 300.000".' };
    } else r = i === 'normativa' ? { de: 'app', ...respuestaNormativa() } : i === 'revisar' ? revisar() : i === 'falta' ? falta() : { de: 'app', ...(buscarAyuda(p) ?? responderGlosario(p) ?? buscar(p, temasAyuda()) ?? NO_ENTENDI) };
    if (r.texto === NO_ENTENDI.texto) { r = conIA(r, p); autoIA = !!clave; }
    else if (i === 'tributaria' || i === 'glosario' || i === 'normativa') r = conIA(r, p);
    setMensajes(m => [...m, { de: 'yo', texto: p }, r]); setTexto(''); setConfirmar(null);
    if (autoIA) void correrIA(p, r.texto === NO_ENTENDI.texto ? undefined : r.texto);
  }
  function guardarClave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const k = String(new FormData(e.currentTarget).get('clave') ?? '').trim();
    if (!k) return;
    guardarClaveIA(k); setClave(k); setVerIA(false);
    setMensajes(m => [...m, { de: 'app', texto: 'Modo IA activado. Para preguntas abiertas buscaré en fuentes oficiales; solo envío tu pregunta, nunca los datos de la empresa.' }]);
  }
  function quitarClave() { guardarClaveIA(null); setClave(null); setMensajes(m => [...m, { de: 'app', texto: 'Quité la clave: el modo IA quedó apagado.' }]); }
  function accion(a: Accion, clave: string) {
    if (a.tipo === 'ir') { onIr(a.vista, a.pestana); return; }
    if (a.tipo === 'recorrido') { setAbierto(false); onRecorrido(); return; }
    if (a.tipo === 'ia') { void correrIA(a.pregunta, a.contexto); return; }
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
          <button className="cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el asistente">×</button>
          <button className="enlace asis-ia-boton" onClick={() => setVerIA(v => !v)} aria-expanded={verIA}>Modo IA: {clave ? 'activado' : 'apagado'}</button></header>
        {verIA && (
          <div className="asis-ia">
            <p><b>Modo IA (opcional).</b> Con tu propia clave de API de Anthropic, Riffo busca en sitios oficiales (SII, BCN, Diario Oficial, TGR, Congreso) y redacta la respuesta con sus fuentes. Solo se envía tu pregunta y el resumen público que arma la app, nunca los datos de la empresa. Cada consulta se cobra en tu cuenta de Anthropic.</p>
            <p className="vacio">La clave queda guardada solo en este navegador. Úsala en un computador personal y fija un límite de gasto en console.anthropic.com.</p>
            {clave
              ? <p>Activado con la clave terminada en …{clave.slice(-4)}. <button className="enlace" onClick={quitarClave}>Quitar la clave</button></p>
              : <form className="asis-escribir" onSubmit={guardarClave}>
                  <input name="clave" type="password" autoComplete="off" placeholder="sk-ant-…" aria-label="Clave de API de Anthropic" />
                  <button className="boton">Activar</button>
                </form>}
          </div>)}
        <div className="asis-mensajes" aria-live="polite">
          {mensajes.map((m, i) => (
            <div key={i} className={`asis-msj ${m.de}${m.cargando ? ' cargando' : ''}${m.ia ? ' ia' : ''}`}>
              {m.ia && <span className="asis-etiqueta">Respuesta con IA · fuentes oficiales</span>}
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
          <button className="boton" disabled={!texto.trim() || pensando}>Enviar</button>
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
