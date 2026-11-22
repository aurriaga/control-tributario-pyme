import type { LineaEERR } from './nucleo/contabilidad';
import { pesos } from './formato';

/** Cascada del Estado de resultados: cada línea sube o baja desde donde quedó la anterior; los subtotales parten de cero. */
export default function Cascada({ eerr }: { eerr: LineaEERR[] }) {
  let acum = 0;
  const pasos = eerr.filter(l => l.tipo !== 'linea' || Math.abs(l.monto) >= 1).map(l => {
    if (l.tipo === 'linea') { const desde = acum; acum += l.monto; return { ...l, desde, hasta: acum }; }
    return { ...l, desde: 0, hasta: l.monto };
  });
  const min = Math.min(0, ...pasos.map(p => Math.min(p.desde, p.hasta))), max = Math.max(1, ...pasos.map(p => Math.max(p.desde, p.hasta)));
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="cascada" role="table" aria-label="Estado de resultados en cascada">
      {pasos.map(p => {
        const izq = x(Math.min(p.desde, p.hasta)), ancho = Math.max(0.6, Math.abs(x(p.hasta) - x(p.desde)));
        const clase = p.tipo !== 'linea' ? 'sub' : p.monto >= 0 ? 'sube' : 'baja';
        return (
          <div className={`paso ${p.tipo}`} role="row" key={p.concepto}>
            <span role="cell" className="etiqueta">{p.concepto}</span>
            <span role="cell" className="pista-cascada">
              {min < 0 && <i className="cero" style={{ left: `${x(0)}%` }} />}
              <b className={clase} style={{ left: `${izq}%`, width: `${ancho}%` }} />
            </span>
            <span role="cell" className={`n ${p.monto < 0 ? 'neg' : ''}`}>{pesos(p.monto)}</span>
          </div>);
      })}
    </div>
  );
}
