import { useMemo, useState } from 'react';
import { esComisionLF, type Documento, type OpcionesIVA } from './nucleo/rcv';
import { cuadratura, borradorF29, mesVecino, UTM_SII, type F29, type EstadoCuadratura } from './nucleo/f29';
import { periodoLegible } from './nucleo/lector';
import { pesos } from './formato';
import type { LibroRemuneraciones, MesHonorarios } from './nucleo/remuneraciones';
import type { ConfigContable } from './nucleo/contabilidad';
import { opcionesPPM, tasa84a, textoTasa, NOMBRE_REGIMEN, type RegimenPPM } from './nucleo/ppm';

const CLASE: Record<EstadoCuadratura, string> = { Cuadra: 'verde', Diferencias: 'rojo', 'Falta F29': 'ambar', 'Falta RCV': 'ambar' };
import { claveActiva, ls } from './almacen';
const CLAVE_TASA = (() => { try { return claveActiva('tasaPPM'); } catch { return 'ctp.tasaPPM'; } })();
const leerLS = <T,>(k: string, d: T): T => { try { const v = ls().getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const celda = (n: number | null) => (n === null ? '—' : pesos(n));
const numero = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

export default function PanelIVA({ docs, f29s, libros, honorarios, utmUsuario, onUtm, cfg, onCfg }: { docs: Documento[]; f29s: F29[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[];
  utmUsuario: Record<string, number>; onUtm: (u: Record<string, number>) => void; cfg: ConfigContable; onCfg: (c: ConfigContable) => void }) {
  const op: OpcionesIVA = useMemo(() => ({ comisionLF: cfg.ivaComisionLF }), [cfg.ivaComisionLF]);
  const filas = useMemo(() => cuadratura(docs, f29s, op), [docs, f29s, op]);
  const periodos = useMemo(() => filas.map(f => f.periodo).sort().reverse(), [filas]);
  const sugerido = filas.slice().reverse().find(f => f.estado === 'Falta F29')?.periodo ?? periodos[0] ?? '';
  const [periodo, setPeriodo] = useState<string | null>(null);     // null: sigue el mes sugerido (el último sin F29)
  const utm = useMemo(() => ({ ...UTM_SII, ...utmUsuario }), [utmUsuario]);
  // Tasa elegida para la empresa; una tasa escrita en la versión anterior se respeta como voluntaria
  const antigua = useMemo(() => { const t = leerLS<string>(CLAVE_TASA, ''); return t.trim() ? numero(t) / 100 : null; }, []);
  const eleccion = cfg.tasaPPM ?? (antigua ? { opcion: 'voluntaria', tasa: antigua } : null);
  const tasaManual = eleccion && eleccion.opcion !== 'f29' ? eleccion.tasa : undefined;
  const [verPPM, setVerPPM] = useState(false);
  const per = periodo && periodos.includes(periodo) ? periodo : sugerido;
  const personal = useMemo(() => {
    const l = libros.find(x => x.periodo === per);
    const conInforme = honorarios.some(h => h.periodo.slice(0, 4) === per.slice(0, 4));
    return { impuestoUnico: l ? l.trabajadores.reduce((a, t) => a + t.impuestoUnico, 0) : null,
      retencionHonorarios: conInforme ? honorarios.find(h => h.periodo === per)?.retencionTerceros ?? 0 : null };
  }, [libros, honorarios, per]);
  const b = useMemo(() => (per ? borradorF29(docs, f29s, per, utm, tasaManual, personal, op) : null), [docs, f29s, per, utm, tasaManual, personal, op]);
  const cuadran = filas.filter(f => f.estado === 'Cuadra').length, conF29 = filas.filter(f => f.debitoF29 !== null).length;
  const hayLF = useMemo(() => docs.some(d => esComisionLF(d) && d.estado !== 'ANULADA'), [docs]);

  function cambiarUTM(p: string, v: string) {
    const n = Number(v.replace(/\./g, ''));
    const nuevo = { ...utmUsuario }; if (n > 0) nuevo[p] = n; else delete nuevo[p];
    onUtm(nuevo);
  }

  return (
    <section className="libros iva">
      <h2>IVA y F29</h2>
      <p className="bajada chica">{conF29 === 0 ? 'Carga los F29 del SII (PDF del formulario compacto, o la carpeta tributaria) para compararlos con el RCV.'
        : `${cuadran} de ${conF29} F29 cargados cuadran al peso con el RCV.`}</p>
      {hayLF && (
        <div className="opcion-lf">
          <p><b>Comisiones de liquidaciones-factura.</b> Hay liquidaciones-factura en tus compras: es la comisión que cobra la feria o el consignatario. ¿Cómo declaras su IVA?</p>
          <label><input type="radio" name="iva-lf" checked={cfg.ivaComisionLF !== 'debito'} onChange={() => onCfg({ ...cfg, ivaComisionLF: 'credito' })} /> Como crédito fiscal (es el IVA de un servicio que te cobran)</label>
          <label><input type="radio" name="iva-lf" checked={cfg.ivaComisionLF === 'debito'} onChange={() => onCfg({ ...cfg, ivaComisionLF: 'debito' })} /> Como débito, como lo propone el SII en el F29 (código 501)</label>
        </div>)}
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
            <div className="tasa-ppm">
              <span>Tasa del PPM</span>
              <b>{b.tasaPPM !== null ? textoTasa(b.tasaPPM) : 'sin tasa'}</b>
              <small>{!eleccion || eleccion.opcion === 'f29' ? 'del último F29 declarado' : opcionesPPM(Number(per.slice(0, 4))).find(o => o.id === eleccion.opcion)?.etiqueta.split(':')[0] ?? 'elegida'}</small>
              <button className="boton chico" onClick={() => setVerPPM(v => !v)} aria-expanded={verPPM}>Cambiar tasa del PPM</button>
            </div>
          </div>
          {verPPM && <ElegirPPM anio={Number(per.slice(0, 4))} eleccion={eleccion} onElegir={x => { onCfg({ ...cfg, tasaPPM: x ?? undefined }); try { ls().removeItem(CLAVE_TASA); } catch { /* sin almacenamiento */ } setVerPPM(false); }} />}
          <p className="nota-borrador">Es una estimación con los documentos cargados; la cifra final es la que declares en el SII. La retención de honorarios sale del informe de boletas recibidas y el impuesto único del libro de remuneraciones del mes.</p>
        </div>
      )}
    </section>
  );
}

/** Tasas del PPM según el SII para cada régimen, la del último F29 y una voluntaria. */
function ElegirPPM({ anio, eleccion, onElegir }: { anio: number; eleccion: { opcion: string; tasa: number } | null; onElegir: (x: { opcion: string; tasa: number } | null) => void }) {
  const opciones = useMemo(() => opcionesPPM(anio), [anio]);
  const [sel, setSel] = useState(eleccion?.opcion ?? 'f29');
  const [vol, setVol] = useState(eleccion?.opcion === 'voluntaria' ? String(eleccion.tasa * 100).replace('.', ',') : '');
  const [imp, setImp] = useState(''), [ing, setIng] = useState('');
  const t84 = tasa84a(numero(imp), numero(ing));
  const tasa = sel === 'voluntaria' ? (numero(vol) > 0 ? numero(vol) / 100 : null) : sel === 'general-84a' ? t84 : opciones.find(o => o.id === sel)?.tasa ?? null;
  const listo = sel === 'f29' || (tasa !== null && tasa > 0 && tasa < 0.2);
  const grupos: RegimenPPM[] = ['propyme', 'transparente', 'general', 'otra'];
  return (
    <div className="elegir-ppm" role="group" aria-label="Tasa del PPM">
      <p className="chica">Elige la tasa que usa tu empresa en {anio}. Las del SII dependen del régimen y de los ingresos brutos del año anterior (50.000 UF).</p>
      {grupos.map(g => (
        <fieldset key={g}><legend>{NOMBRE_REGIMEN[g]}</legend>
          {opciones.filter(o => o.regimen === g).map(o => (
            <label key={o.id} className="opcion-ppm">
              <input type="radio" name="ppm" checked={sel === o.id} onChange={() => setSel(o.id)} />
              <span><b>{o.etiqueta}</b>{o.detalle && <small> {o.detalle}</small>}<small className="fuente"> Fuente: {o.fuente}.</small>
                {o.id === 'voluntaria' && sel === o.id && <span className="ajustes en-linea"><label>Tasa (%)<input inputMode="decimal" value={vol} onChange={e => setVol(e.target.value)} placeholder="ej. 1" autoFocus /></label></span>}
                {o.id === 'general-84a' && sel === o.id && <span className="ajustes en-linea">
                  <label>Impuesto de Primera Categoría del año anterior<input inputMode="numeric" value={imp} onChange={e => setImp(e.target.value)} /></label>
                  <label>Ingresos brutos del año anterior<input inputMode="numeric" value={ing} onChange={e => setIng(e.target.value)} /></label>
                  {t84 !== null && <b>= {textoTasa(t84)}</b>}</span>}
              </span>
            </label>))}
        </fieldset>))}
      <div className="acciones-ppm">
        <button className="boton" disabled={!listo} onClick={() => onElegir(sel === 'f29' ? null : { opcion: sel, tasa: tasa! })}>Usar esta tasa{tasa !== null && sel !== 'f29' ? ` (${textoTasa(tasa)})` : ''}</button>
        <button className="enlace" onClick={() => onElegir(eleccion)}>Cancelar</button>
      </div>
    </div>
  );
}
