import { useState } from 'react';
import { noticias, resumenNoticias } from './nucleo/noticias';

const fecha = (iso: string) => iso.split('-').reverse().join('-');

export default function Noticias() {
  const n = noticias();
  const [todas, setTodas] = useState(false);
  const lista = n.items.filter(x => todas || !x.rutina);
  return (
    <section className="libros noticias">
      <h2>Noticias del SII</h2>
      <p className="bajada chica">Circulares y resoluciones que publica el Servicio de Impuestos Internos. Se actualizan solas cada semana desde sii.cl{n.actualizado ? ` (última vez: ${fecha(n.actualizado)})` : ''}.</p>
      <div className="riffo-resumen">
        <b>Riffo Junior te resume</b>
        <p>{resumenNoticias(n)}</p>
      </div>
      {n.items.length > 0 && <>
        <label className="ver-rutina"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Mostrar también las de rutina y las de un solo contribuyente</label>
        <ul className="lista-noticias">{lista.map(x => (
          <li key={x.enlace}>
            <div className="sug-mov"><span className={`chip ${x.tipo === 'Circular' ? 'anil' : 'verde'}`}>{x.tipo}</span><b>N° {x.numero}</b><span className="vacio">{fecha(x.fecha)}</span>{x.rutina && <span className="vacio">· rutina</span>}</div>
            <p>{x.materia}</p>
            <p className="vacio">{x.fuente} · <a href={x.enlace} target="_blank" rel="noopener noreferrer">Ver el documento en sii.cl</a></p>
          </li>))}</ul>
      </>}
    </section>
  );
}
