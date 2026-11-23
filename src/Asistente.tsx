import { useEffect, useRef, useState } from 'react';
import type { Control } from './nucleo/contabilidad';
import { buscarAyuda, diagnosticar, aplicarArreglo, intencion, SALUDO, NO_ENTENDI, type Accion, type Datos, type Hallazgo, type Vista } from './nucleo/asistente';
import type { PanelMes } from './nucleo/panel';
import { periodoLegible } from './nucleo/lector';

interface Mensaje { de: 'yo' | 'app'; texto: string; acciones?: Accion[]; hallazgos?: Hallazgo[] }
interface Props {
  datos: Datos; controles: Control[]; mes: PanelMes | null; porClasificar: number;
  onIr: (v: Vista, pestana?: string) => void; onArreglar: (cambios: ReturnType<typeof aplicarArreglo>) => void; onRecorrido: () => void;
}
const CHIPS = ['Revisa mi empresa', '¿Qué falta este mes?', '¿Cómo cargo una cartola?', '¿Cómo creo una regla?'];
const CHIP_NIVEL = { error: 'rojo', aviso: 'ambar', ok: 'verde' } as const;

export default function Asistente({ datos, controles, mes, porClasificar, onIr, onArreglar, onRecorrido }: Props) {
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
    const r: Mensaje = i === 'revisar' ? revisar() : i === 'falta' ? falta() : { de: 'app', ...(buscarAyuda(p) ?? NO_ENTENDI) };
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
    <button className="asis-abrir boton" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-controls="asistente">{abierto ? 'Cerrar asistente' : 'Asistente'}</button>
    {abierto && (
      <section id="asistente" className="asistente" role="dialog" aria-label="Asistente de la app" onKeyDown={e => e.key === 'Escape' && setAbierto(false)}>
        <header><b>Asistente</b><span>Responde con la ayuda de la app. Tus datos no salen del navegador.</span>
          <button className="cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el asistente">×</button></header>
        <div className="asis-mensajes" aria-live="polite">
          {mensajes.map((m, i) => (
            <div key={i} className={`asis-msj ${m.de}`}>
              <p>{m.texto}</p>
              {m.hallazgos && <ul className="asis-hallazgos">{m.hallazgos.map((h, k) => (
                <li key={k}><span className={`chip ${CHIP_NIVEL[h.nivel]}`}>{h.nivel === 'error' ? 'Revisar' : 'Pendiente'}</span> <b>{h.titulo}</b>
                  <p>{h.detalle}</p>{botones(h.acciones, `${i}-${k}`)}</li>))}</ul>}
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
