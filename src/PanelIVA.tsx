import { useMemo, useState } from 'react';
import type { Documento } from './nucleo/rcv';
import { cuadratura, borradorF29, mesVecino, UTM_SII, type F29, type EstadoCuadratura } from './nucleo/f29';
import { periodoLegible } from './nucleo/lector';
import { pesos } from './formato';
import type { LibroRemuneraciones, MesHonorarios } from './nucleo/remuneraciones';

const CLASE: Record<EstadoCuadratura, string> = { Cuadra: 'verde', Diferencias: 'rojo', 'Falta F29': 'ambar', 'Falta RCV': 'ambar' };
const CLAVE_TASA = 'ctp.tasaPPM';
const leerLS = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const guardarLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const celda = (n: number | null) => (n === null ? '—' : pesos(n));

export default function PanelIVA({ docs, f29s, libros, honorarios, utmUsuario, onUtm }: { docs: Documento[]; f29s: F29[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[];
  utmUsuario: Record<string, number>; onUtm: (u: Record<string, number>) => void }) {
  const filas = useMemo(() => cuadratura(docs, f29s), [docs, f29s]);
  const periodos = useMemo(() => filas.map(f => f.periodo).sort().reverse(), [filas]);
  const sugerido = filas.slice().reverse().find(f => f.estado === 'Falta F29')?.periodo ?? periodos[0] ?? '';
  const [periodo, setPeriodo] = useState<string | null>(null);     // null: sigue el mes sugerido (el último sin F29)
  const utm = useMemo(() => ({ ...UTM_SII, ...utmUsuario }), [utmUsuario]);
  const [tasaTxt, setTasaTxt] = useState<string>(() => leerLS<string>(CLAVE_TASA, ''));
  const tasaManual = tasaTxt.trim() ? Number(tasaTxt.replace(',', '.')) / 100 : undefined;
  const per = periodo && periodos.includes(periodo) ? periodo : sugerido;
  const personal = useMemo(() => {
    const l = libros.find(x => x.periodo === per);
    const conInforme = honorarios.some(h => h.periodo.slice(0, 4) === per.slice(0, 4));
    return { impuestoUnico: l ? l.trabajadores.reduce((a, t) => a + t.impuestoUnico, 0) : null,
      retencionHonorarios: conInforme ? honorarios.find(h => h.periodo === per)?.retencionTerceros ?? 0 : null };
  }, [libros, honorarios, per]);
  const b = useMemo(() => (per ? borradorF29(docs, f29s, per, utm, tasaManual, personal) : null), [docs, f29s, per, utm, tasaManual, personal]);
  const cuadran = filas.filter(f => f.estado === 'Cuadra').length, conF29 = filas.filter(f => f.debitoF29 !== null).length;

  function cambiarUTM(p: string, v: string) {
    const n = Number(v.replace(/\./g, ''));
    const nuevo = { ...utmUsuario }; if (n > 0) nuevo[p] = n; else delete nuevo[p];
    onUtm(nuevo);
  }

  return (
    <section className="libros iva">
      <h2>IVA y F29</h2>
      <p className="bajada chica">{conF29 === 0 ? 'Carga los F29 del SII (PDF del formulario compacto) para compararlos con el RCV.'
        : `${cuadran} de ${conF29} F29 cargados cuadran al peso con el RCV.`}</p>
      <div className="desliza"><table>
        <thead><tr><th>Mes</th><th className="n">Débito RCV</th><th className="n">Débito F29</th><th className="n">Crédito RCV</th><th className="n">Crédito F29</th><th>Estado</th></tr></thead>
        <tbody>{filas.slice().reverse().map(f => (
          <tr key={f.periodo} title={f.detalle}>
            <td>{periodoLegible(f.periodo)}</td><td className="n">{pesos(f.debitoRCV)}</td><td className="n">{celda(f.debitoF29)}</td>
            <td className="n">{pesos(f.creditoRCV)}</td><td className="n">{celda(f.creditoF29)}</td>
            <td><span className={`chip ${CLASE[f.estado]}`}>{f.estado}</span>{f.estado === 'Diferencias' && <span className="detalle-fila">{f.detalle}</span>}</td>
          </tr>))}</tbody>
      </table></div>

      {b && (
        <div className="borrador">
          <div className="borrador-cab">
            <h3>Borrador del F29</h3>
            <label>Mes <select value={per} onChange={e => setPeriodo(e.target.value)}>{periodos.map(p => <option key={p} value={p}>{periodoLegible(p)}</option>)}</select></label>
            <span className="vence">Vence el {b.vence}</span>
          </div>
          <div className="desliza"><table>
            <thead><tr><th>Código</th><th>Concepto</th><th className="n">Borrador</th><th className="n">Declarado</th><th className="n">Diferencia</th></tr></thead>
            <tbody>{b.lineas.map(l => (
              <tr key={l.codigo} className={l.total ? 'total' : ''}>
                <td>{l.codigo}</td><td>{l.concepto}{l.nota && <span className="detalle-fila">{l.nota}</span>}</td>
                <td className="n">{celda(l.borrador)}</td><td className="n">{celda(l.declarado)}</td>
                <td className={`n ${l.borrador !== null && l.declarado !== null && Math.abs(l.borrador - l.declarado) > 1 ? 'neg' : ''}`}>
                  {l.borrador !== null && l.declarado !== null ? pesos(l.borrador - l.declarado) : '—'}</td>
              </tr>))}</tbody>
          </table></div>
          {b.avisos.map((a, i) => <p key={i} className="aviso">{a}</p>)}
          <div className="ajustes">
            <label>UTM de {periodoLegible(per)}<input inputMode="numeric" value={utm[per] ?? ''} onChange={e => cambiarUTM(per, e.target.value)} placeholder="sii.cl, valores UTM" /></label>
            <label>UTM de {periodoLegible(mesVecino(per, 1))}<input inputMode="numeric" value={utm[mesVecino(per, 1)] ?? ''} onChange={e => cambiarUTM(mesVecino(per, 1), e.target.value)} placeholder="sii.cl, valores UTM" /></label>
            <label>Tasa del PPM (%)<input inputMode="decimal" value={tasaTxt} onChange={e => { setTasaTxt(e.target.value); guardarLS(CLAVE_TASA, e.target.value); }}
              placeholder={b.tasaPPM !== null ? `${(b.tasaPPM * 100).toLocaleString('es-CL')} (del último F29)` : 'ej. 1'} /></label>
          </div>
          <p className="nota-borrador">Es una estimación con los documentos cargados; la cifra final es la que declares en el SII. La retención de honorarios sale del informe de boletas recibidas y el impuesto único del libro de remuneraciones del mes.</p>
        </div>
      )}
    </section>
  );
}
