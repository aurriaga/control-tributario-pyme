import { useMemo, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import type { Documento } from './nucleo/rcv';
import type { Movimiento } from './nucleo/cartola';
import type { F29 } from './nucleo/f29';
import type { LibroRemuneraciones, MesHonorarios } from './nucleo/remuneraciones';
import { periodoLegible } from './nucleo/lector';
import {
  contabilidad, balance8, estadoResultados, mayor, aperturaSugerida, proveedoresSinCategoria, asignarCategoria, ordenarPlan, PLAN_BASE,
  CATEGORIAS_GASTO, type ConfigContable, type Cuenta, type TipoCuenta, type LineaApertura, type LineaManual, type Origen, type EstadoControl, type Control,
} from './nucleo/contabilidad';
import { pesos } from './formato';

interface Props {
  empresa: string; docs: Documento[]; f29s: F29[]; movs: Movimiento[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[];
  cfg: ConfigContable; onCfg: (c: ConfigContable) => void;
  controles?: Control[];       // los 17 controles generales (si no, solo los contables)
}
type Pestana = 'revision' | 'resultados' | 'balance' | 'diario' | 'mayor' | 'categorias' | 'ajustes' | 'plan';
const PESTANAS: [Pestana, string][] = [['revision', 'Revisión'], ['resultados', 'Estado de resultados'], ['balance', 'Balance'], ['diario', 'Libro Diario'],
  ['mayor', 'Mayor'], ['categorias', 'Categorías de compras'], ['ajustes', 'Apertura y ajustes'], ['plan', 'Plan de cuentas']];
const CHIP: Record<EstadoControl, string> = { OK: 'verde', Revisar: 'rojo', Pendiente: 'ambar' };
const ORIGENES: Origen[] = ['Apertura', 'Manual', 'Ventas', 'Compras', 'Remuneraciones', 'Honorarios', 'F29', 'Banco'];
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const num = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) || 0);
const vacio = (n: number) => (n ? pesos(n) : '');

export default function PanelContabilidad({ empresa, docs, f29s, movs, libros, honorarios, cfg, onCfg, controles }: Props) {
  const [pestana, setPestana] = useState<Pestana>('revision');
  const r = useMemo(() => contabilidad({ empresa, docs, f29s, movs, libros, honorarios }, cfg), [empresa, docs, f29s, movs, libros, honorarios, cfg]);
  const meses = useMemo(() => [...new Set(r.diario.map(f => f.mes))].sort(), [r.diario]);
  const ultimo = meses[meses.length - 1] ?? '';
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const desde = rango?.desde ?? meses.find(m => m.startsWith(ultimo.slice(0, 4))) ?? '', hasta = rango?.hasta ?? ultimo;
  const bal = useMemo(() => balance8(r.diario, cfg.plan, desde, hasta), [r.diario, cfg.plan, desde, hasta]);
  const eerr = useMemo(() => estadoResultados(bal, cfg.plan), [bal, cfg.plan]);
  const lista = controles ?? r.controles;
  const pendientes = lista.filter(c => c.estado !== 'OK').length;

  function descargar() {
    const libro = XLSX.utils.book_new();
    const hoja = (filas: unknown[][], nombre: string) => XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombre);
    hoja([['N° asiento', 'Fecha', 'Código', 'Cuenta', 'Glosa', 'Documento', 'Debe', 'Haber', 'Saldo cuenta', 'Origen'],
      ...r.diario.map(f => [f.asiento, f.fecha, f.codigo, f.cuenta, f.glosa, f.documento, f.debe || '', f.haber || '', f.saldo, f.origen])], 'Libro Diario');
    hoja([['Código', 'Cuenta', 'Débitos', 'Créditos', 'Saldo deudor', 'Saldo acreedor', 'Activo', 'Pasivo', 'Pérdidas', 'Ganancias'],
      ...bal.filas.map(f => [f.codigo, f.cuenta, f.debitos, f.creditos, f.deudor, f.acreedor, f.activo, f.pasivo, f.perdidas, f.ganancias]),
      ['', 'Sumas', ...Object.values(bal.sumas)], ['', bal.resultado >= 0 ? 'Utilidad del período' : 'Pérdida del período', '', '', '', '',
        Math.max(0, -bal.resultado), Math.max(0, bal.resultado), Math.max(0, bal.resultado), Math.max(0, -bal.resultado)]], 'Balance 8 columnas');
    hoja([['Concepto', 'Monto'], ...eerr.flatMap(l => [[l.concepto, l.monto], ...(l.cuentas ?? []).map(c => [`   ${c.codigo} ${c.cuenta}`, c.monto])])], 'Estado de resultados');
    hoja([['Control', 'Estado', 'Resultado', 'Qué hacer'], ...lista.map(c => [c.nombre, c.estado, c.resultado, c.accion])], 'Controles');
    hoja([['Código', 'Cuenta', 'Tipo', 'Categoría de gasto', 'Cuenta bancaria', 'Transitoria'],
      ...cfg.plan.map(c => [c.codigo, c.nombre, c.tipo, c.categoria ?? '', c.cuentaBancaria ?? '', c.transitoria ? 'SI' : 'NO'])], 'Plan de cuentas');
    XLSX.writeFile(libro, `Contabilidad_${desde}_${hasta}.xlsx`);
  }

  return (
    <section className="libros conta">
      <div className="borrador-cab"><h2>Contabilidad</h2>
        <button className="boton secundario" onClick={descargar} disabled={!r.diario.length}>Descargar en Excel</button></div>
      <p className="bajada chica">El Libro Diario se arma solo con lo que cargaste: {r.asientos.length.toLocaleString('de-DE')} asientos y {r.diario.length.toLocaleString('de-DE')} líneas.
        {' '}Tú decides las categorías de las compras, la apertura y los ajustes. {pendientes ? `${pendientes} controles piden atención.` : 'Todos los controles están en orden.'}</p>

      <div className="pestanas" role="tablist" aria-label="Partes de la contabilidad">
        {PESTANAS.map(([k, t]) => <button key={k} role="tab" aria-selected={pestana === k} className={pestana === k ? 'activa' : ''} onClick={() => setPestana(k)}>{t}</button>)}
      </div>

      {(pestana === 'resultados' || pestana === 'balance' || pestana === 'mayor') && meses.length > 0 && (
        <div className="ajustes rango">
          <label>Desde<select value={desde} onChange={e => setRango({ desde: e.target.value, hasta: e.target.value > hasta ? e.target.value : hasta })}>
            {meses.map(m => <option key={m} value={m}>{periodoLegible(m)}</option>)}</select></label>
          <label>Hasta<select value={hasta} onChange={e => setRango({ desde: e.target.value < desde ? e.target.value : desde, hasta: e.target.value })}>
            {meses.map(m => <option key={m} value={m}>{periodoLegible(m)}</option>)}</select></label>
        </div>)}

      {pestana === 'revision' && <Revision r={r} controles={lista} />}
      {pestana === 'resultados' && <Resultados eerr={eerr} cuadra={bal.cuadra} resultado={bal.resultado} />}
      {pestana === 'balance' && <TablaBalance bal={bal} />}
      {pestana === 'diario' && <Diario filas={r.diario} />}
      {pestana === 'mayor' && <Mayor diario={r.diario} plan={cfg.plan} desde={desde} hasta={hasta} />}
      {pestana === 'categorias' && <Categorias docs={docs} empresa={empresa} cfg={cfg} onCfg={onCfg} />}
      {pestana === 'ajustes' && <Ajustes cfg={cfg} onCfg={onCfg} movs={movs} avisos={r.avisos} />}
      {pestana === 'plan' && <Plan cfg={cfg} onCfg={onCfg} usadas={new Set(r.diario.map(f => f.codigo))} />}
    </section>
  );
}

function Revision({ r, controles }: { r: ReturnType<typeof contabilidad>; controles: Control[] }) {
  const trans = r.diario.filter(f => f.origen === 'Banco' && (f.codigo === 1199 || f.codigo === 2190));
  return (<>
    <ul className="controles">{controles.map(c => (
      <li key={c.nombre} className={CHIP[c.estado]}>
        <div className="sug-mov"><span className={`chip ${CHIP[c.estado]}`}>{c.estado}</span><b>{c.nombre}</b></div>
        <p className="sug-motivo">{c.resultado}</p>
        {c.accion && <p className="sug-docs">{c.accion}</p>}
      </li>))}</ul>
    {trans.length > 0 && <details className="detalle">
      <summary>Movimientos del banco por identificar ({trans.length})</summary>
      <p className="vacio">Quedaron en cuentas transitorias porque no tienen factura, regla ni RUT conocido. Clasifícalos en la sección Banco.</p>
      <div className="desliza"><table>
        <thead><tr><th>Fecha</th><th>Glosa</th><th>Cuenta</th><th className="n">Monto</th></tr></thead>
        <tbody>{trans.slice(0, 200).map(f => <tr key={f.clave + f.codigo}><td>{fechaCorta(f.fecha)}</td><td>{f.glosa.replace(/^Banco: /, '')}</td><td>{f.codigo}</td>
          <td className={`n ${f.codigo === 1199 ? 'neg' : 'pos'}`}>{pesos(f.debe || f.haber)}</td></tr>)}</tbody>
      </table></div>
    </details>}
  </>);
}

function Resultados({ eerr, cuadra, resultado }: { eerr: ReturnType<typeof estadoResultados>; cuadra: boolean; resultado: number }) {
  return (<>
    <div className="desliza"><table className="eerr">
      <tbody>{eerr.map(l => (<FilasEERR key={l.concepto} l={l} />))}</tbody>
    </table></div>
    <p className="nota-borrador">El resultado ({pesos(resultado)}) es el mismo del balance de 8 columnas{cuadra ? ', que cuadra.' : ', que hoy NO cuadra: revisa la pestaña Revisión.'}
      {' '}Las cifras vienen del Libro Diario: compras por categoría, sueldos y honorarios centralizados, gastos del banco sin factura y ajustes manuales.</p>
  </>);
}
function FilasEERR({ l }: { l: ReturnType<typeof estadoResultados>[number] }) {
  return (<>
    <tr className={l.tipo === 'linea' ? '' : l.tipo}><td>{l.concepto}</td><td className={`n ${l.monto < 0 ? 'neg' : ''}`}>{pesos(l.monto)}</td></tr>
    {l.tipo === 'linea' && (l.cuentas ?? []).map(c => <tr key={c.codigo} className="sub"><td>{c.codigo} {c.cuenta}</td><td className="n">{pesos(c.monto)}</td></tr>)}
  </>);
}

function TablaBalance({ bal }: { bal: ReturnType<typeof balance8> }) {
  const s = bal.sumas, res = bal.resultado;
  const fila = (k: string, nombre: string, v: number[], clase = '') => <tr key={k} className={clase}><td></td><td>{nombre}</td>{v.map((x, i) => <td key={i} className="n">{vacio(x)}</td>)}</tr>;
  const ajuste = [0, 0, 0, 0, Math.max(0, -res), Math.max(0, res), Math.max(0, res), Math.max(0, -res)];
  const sumas = [s.debitos, s.creditos, s.deudor, s.acreedor, s.activo, s.pasivo, s.perdidas, s.ganancias];
  return (<>
    <p className="vacio"><span className={`chip ${bal.cuadra ? 'verde' : 'rojo'}`}>{bal.cuadra ? 'Cuadra' : 'No cuadra'}</span>{' '}
      {bal.cuadra ? 'Débitos = créditos, deudor = acreedor y el resultado calza.' : 'Revisa la pestaña Revisión.'} En rojo, las cuentas transitorias.</p>
    <div className="desliza"><table className="balance">
      <thead>
        <tr><th></th><th></th><th colSpan={2} className="grupo">Sumas</th><th colSpan={2} className="grupo">Saldos</th><th colSpan={2} className="grupo">Inventario</th><th colSpan={2} className="grupo">Resultados</th></tr>
        <tr><th>Código</th><th>Cuenta</th><th className="n">Débitos</th><th className="n">Créditos</th><th className="n">Deudor</th><th className="n">Acreedor</th>
          <th className="n">Activo</th><th className="n">Pasivo</th><th className="n">Pérdidas</th><th className="n">Ganancias</th></tr>
      </thead>
      <tbody>
        {bal.filas.map(f => <tr key={f.codigo} className={f.transitoria ? 'transitoria' : ''}><td>{f.codigo}</td><td>{f.cuenta}</td>
          {[f.debitos, f.creditos, f.deudor, f.acreedor, f.activo, f.pasivo, f.perdidas, f.ganancias].map((x, i) => <td key={i} className="n">{vacio(x)}</td>)}</tr>)}
        {fila('s', 'Sumas', sumas, 'total')}
        {fila('r', res >= 0 ? 'Utilidad del período' : 'Pérdida del período', ajuste)}
        {fila('t', 'Totales', sumas.map((x, i) => x + ajuste[i]), 'total')}
      </tbody>
    </table></div>
  </>);
}

function Diario({ filas }: { filas: ReturnType<typeof contabilidad>['diario'] }) {
  const [origen, setOrigen] = useState(''), [buscar, setBuscar] = useState(''), [ver, setVer] = useState(200);
  const vis = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return filas.filter(f => (!origen || f.origen === origen) && (!t || `${f.codigo} ${f.cuenta} ${f.glosa} ${f.documento}`.toLowerCase().includes(t)));
  }, [filas, origen, buscar]);
  return (<>
    <div className="ajustes">
      <label>Origen<select value={origen} onChange={e => { setOrigen(e.target.value); setVer(200); }}><option value="">Todos</option>{ORIGENES.map(o => <option key={o}>{o}</option>)}</select></label>
      <input className="buscar" placeholder="Buscar por cuenta, glosa o documento" value={buscar} onChange={e => { setBuscar(e.target.value); setVer(200); }} aria-label="Buscar en el Libro Diario" />
    </div>
    <div className="desliza"><table className="diario">
      <thead><tr><th>N°</th><th>Fecha</th><th>Cuenta</th><th>Glosa</th><th className="n">Debe</th><th className="n">Haber</th></tr></thead>
      <tbody>{vis.slice(0, ver).map((f, i) => (
        <tr key={i} className={i > 0 && vis[i - 1].asiento !== f.asiento ? 'nuevo' : ''}><td>{f.asiento}</td><td>{fechaCorta(f.fecha)}</td>
          <td className={f.haber ? 'haber' : ''}>{f.codigo} {f.cuenta}</td><td className="glosa">{f.glosa}</td><td className="n">{vacio(f.debe)}</td><td className="n">{vacio(f.haber)}</td></tr>))}</tbody>
    </table></div>
    {vis.length > ver && <button className="enlace" onClick={() => setVer(v => v + 500)}>Ver más ({vis.length - ver} líneas restantes)</button>}
  </>);
}

function Mayor({ diario, plan, desde, hasta }: { diario: ReturnType<typeof contabilidad>['diario']; plan: Cuenta[]; desde: string; hasta: string }) {
  const usadas = useMemo(() => ordenarPlan(plan).filter(c => diario.some(f => f.codigo === c.codigo)), [diario, plan]);
  const [codigo, setCodigo] = useState(usadas.find(c => c.codigo === 1102)?.codigo ?? usadas[0]?.codigo ?? 0);
  const m = useMemo(() => mayor(diario, codigo, desde, hasta), [diario, codigo, desde, hasta]);
  return (<>
    <div className="ajustes"><label>Cuenta<select value={codigo} onChange={e => setCodigo(Number(e.target.value))}>
      {usadas.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.nombre}</option>)}</select></label></div>
    <div className="desliza"><table className="diario">
      <thead><tr><th>Fecha</th><th>N°</th><th>Glosa</th><th className="n">Debe</th><th className="n">Haber</th><th className="n">Saldo</th></tr></thead>
      <tbody>
        <tr className="sub"><td></td><td></td><td>Saldo anterior</td><td></td><td></td><td className="n">{pesos(m.anterior)}</td></tr>
        {m.filas.map((f, i) => <tr key={i}><td>{fechaCorta(f.fecha)}</td><td>{f.asiento}</td><td className="glosa">{f.glosa}</td><td className="n">{vacio(f.debe)}</td>
          <td className="n">{vacio(f.haber)}</td><td className={`n ${f.saldoMayor < 0 ? 'neg' : ''}`}>{pesos(f.saldoMayor)}</td></tr>)}
        <tr className="total"><td></td><td></td><td>Totales del período</td><td className="n">{pesos(m.debe)}</td><td className="n">{pesos(m.haber)}</td><td className="n">{pesos(m.saldo)}</td></tr>
      </tbody>
    </table></div>
  </>);
}

function Categorias({ docs, empresa, cfg, onCfg }: { docs: Documento[]; empresa: string; cfg: ConfigContable; onCfg: (c: ConfigContable) => void }) {
  const sin = useMemo(() => proveedoresSinCategoria(docs, cfg.provCategoria, empresa), [docs, cfg.provCategoria, empresa]);
  const categorias = useMemo(() => [...new Set(cfg.plan.map(c => c.categoria).filter((c): c is string => !!c))], [cfg.plan]);
  const nombres = useMemo(() => new Map(docs.map(d => [d.rutContraparte, d.razonSocial])), [docs]);
  const asignar = (rut: string, c: string) => onCfg({ ...cfg, provCategoria: asignarCategoria(cfg.provCategoria, rut, c) });
  const aprendidas = Object.entries(cfg.provCategoria).sort((a, b) => (nombres.get(a[0]) ?? a[0]).localeCompare(nombres.get(b[0]) ?? b[0]));
  return (<>
    <p className="vacio">Cada compra se carga a la cuenta de su categoría. Elige la categoría del proveedor una vez y la app la usa para todas sus compras, ahora y en adelante. Las compras sin categoría quedan en 5990 Compras por revisar.</p>
    {sin.length === 0 ? <p><span className="chip verde">Listo</span> Todas las compras tienen categoría.</p> : (
      <ul className="por-identificar">{sin.map(p => (
        <li key={p.rut}><div className="sug-mov"><b>{p.nombre}</b> <span className="vacio">{p.rut}</span> <span>{p.compras} compra{p.compras > 1 ? 's' : ''}, {pesos(p.monto)} sin IVA</span></div>
          <div className="clasificar"><select defaultValue="" onChange={e => e.target.value && asignar(p.rut, e.target.value)} aria-label={`Categoría de ${p.nombre}`}>
            <option value="">Elegir categoría…</option>{categorias.map(c => <option key={c}>{c}</option>)}</select></div></li>))}</ul>)}
    {aprendidas.length > 0 && <details className="detalle"><summary>Categorías aprendidas ({aprendidas.length} proveedores)</summary>
      <div className="desliza"><table>
        <thead><tr><th>Proveedor</th><th>RUT</th><th>Categoría</th></tr></thead>
        <tbody>{aprendidas.map(([rut, c]) => <tr key={rut}><td>{nombres.get(rut) ?? '—'}</td><td>{rut}</td><td>
          <select value={c} onChange={e => asignar(rut, e.target.value)} aria-label={`Categoría de ${nombres.get(rut) ?? rut}`}>
            <option value="">(quitar)</option>{categorias.map(x => <option key={x}>{x}</option>)}</select></td></tr>)}</tbody>
      </table></div></details>}
  </>);
}

function Ajustes({ cfg, onCfg, movs, avisos }: { cfg: ConfigContable; onCfg: (c: ConfigContable) => void; movs: Movimiento[]; avisos: string[] }) {
  const plan = ordenarPlan(cfg.plan);
  const ap = cfg.apertura ?? { fecha: `${new Date().getFullYear()}-01-01`, lineas: [] };
  const setAp = (lineas: LineaApertura[], fecha = ap.fecha) => onCfg({ ...cfg, apertura: { fecha, lineas } });
  const difAp = ap.lineas.reduce((s, l) => s + l.debe - l.haber, 0);
  const setMan = (manuales: LineaManual[]) => onCfg({ ...cfg, manuales });
  const sugerida = () => { const s = aperturaSugerida(movs, cfg); if (s) onCfg({ ...cfg, apertura: s }); };
  const selCuenta = (v: number, on: (c: number) => void, etiqueta: string) => (
    <select value={v || ''} onChange={e => on(Number(e.target.value))} aria-label={etiqueta}><option value="">Cuenta…</option>
      {plan.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.nombre}</option>)}</select>);
  return (<>
    <div className="borrador-cab"><h3>Asiento de apertura</h3>
      <label className="en-linea">Fecha <input type="date" value={ap.fecha} onChange={e => setAp(ap.lineas, e.target.value)} /></label>
      {movs.length > 0 && <button className="enlace" onClick={sugerida}>Usar el saldo inicial de la cartola</button>}</div>
    <p className="vacio">Copia aquí el balance al cierre del año anterior, una línea por cuenta. Si no cuadra, la diferencia queda a la vista en 3190 Apertura por completar.</p>
    <Lineas filas={ap.lineas.map((l, i) => ({ i, codigo: l.codigo, debe: l.debe, haber: l.haber, glosa: l.glosa }))} selCuenta={selCuenta}
      onCambio={(i, x) => setAp(ap.lineas.map((l, j) => (j === i ? { ...l, ...x } : l)))} onQuitar={i => setAp(ap.lineas.filter((_, j) => j !== i))} />
    <div className="ajustes"><button className="enlace" onClick={() => setAp([...ap.lineas, { codigo: 0, debe: 0, haber: 0, glosa: '' }])}>Agregar línea</button>
      {ap.lineas.length > 0 && <span className={Math.abs(difAp) >= 1 ? 'aviso' : 'vacio'}>{Math.abs(difAp) >= 1 ? `Diferencia ${pesos(difAp)}: irá a 3190.` : 'La apertura cuadra.'}</span>}</div>

    <div className="borrador"><div className="borrador-cab"><h3>Asientos manuales</h3></div>
      <p className="vacio">Depreciación, ajustes y reclasificaciones. Las líneas con el mismo N° forman un asiento; si no cuadra, no entra al Diario y se avisa.</p>
      {avisos.filter(a => a.startsWith('Asiento manual')).map(a => <p key={a} className="aviso">{a}</p>)}
      <Lineas manual filas={cfg.manuales.map((l, i) => ({ i, ...l }))} selCuenta={selCuenta}
        onCambio={(i, x) => setMan(cfg.manuales.map((l, j) => (j === i ? { ...l, ...x } : l)))} onQuitar={i => setMan(cfg.manuales.filter((_, j) => j !== i))} />
      <div className="ajustes"><button className="enlace" onClick={() => {
        const u = cfg.manuales[cfg.manuales.length - 1];
        setMan([...cfg.manuales, { asiento: u?.asiento ?? 'AM-1', fecha: u?.fecha ?? '', codigo: 0, glosa: u?.glosa ?? '', documento: '', debe: 0, haber: 0 }]);
      }}>Agregar línea</button></div>
    </div>
  </>);
}

type FilaLinea = { i: number; codigo: number; debe: number; haber: number; glosa: string; asiento?: string; fecha?: string };
function Lineas({ filas, manual, selCuenta, onCambio, onQuitar }: {
  filas: FilaLinea[]; manual?: boolean; selCuenta: (v: number, on: (c: number) => void, etiqueta: string) => ReactNode;
  onCambio: (i: number, x: Partial<LineaManual>) => void; onQuitar: (i: number) => void;
}) {
  if (!filas.length) return null;
  return (<div className="desliza"><table className="editable">
    <thead><tr>{manual && <><th>N°</th><th>Fecha</th></>}<th>Cuenta</th><th className="n">Debe</th><th className="n">Haber</th><th>Glosa</th><th></th></tr></thead>
    <tbody>{filas.map(f => (
      <tr key={`${f.i}|${f.asiento}|${f.codigo}|${f.debe}|${f.haber}|${f.glosa}`}>
        {manual && <><td><input className="corto" defaultValue={f.asiento} onBlur={e => onCambio(f.i, { asiento: e.target.value })} aria-label="N° de asiento" /></td>
          <td><input type="date" value={f.fecha} onChange={e => onCambio(f.i, { fecha: e.target.value })} aria-label="Fecha" /></td></>}
        <td>{selCuenta(f.codigo, c => onCambio(f.i, { codigo: c }), 'Cuenta')}</td>
        <td><input className="monto" inputMode="numeric" defaultValue={f.debe || ''} onBlur={e => onCambio(f.i, { debe: num(e.target.value) })} aria-label="Debe" /></td>
        <td><input className="monto" inputMode="numeric" defaultValue={f.haber || ''} onBlur={e => onCambio(f.i, { haber: num(e.target.value) })} aria-label="Haber" /></td>
        <td><input defaultValue={f.glosa} onBlur={e => onCambio(f.i, { glosa: e.target.value })} aria-label="Glosa" /></td>
        <td><button className="enlace peligro" onClick={() => onQuitar(f.i)} aria-label="Quitar la línea">Quitar</button></td>
      </tr>))}</tbody>
  </table></div>);
}

function Plan({ cfg, onCfg, usadas }: { cfg: ConfigContable; onCfg: (c: ConfigContable) => void; usadas: Set<number> }) {
  const [nuevo, setNuevo] = useState({ codigo: '', nombre: '', tipo: 'Gasto' as TipoCuenta });
  const cambiar = (codigo: number, x: Partial<Cuenta>) => onCfg({ ...cfg, plan: cfg.plan.map(c => (c.codigo === codigo ? { ...c, ...x } : c)) });
  const existe = cfg.plan.some(c => c.codigo === Number(nuevo.codigo));
  return (<>
    <p className="vacio">Puedes cambiar los nombres, decir qué categoría de gasto recibe cada cuenta y anotar el número de cada cuenta bancaria (si tienes más de un banco). Una cuenta con movimientos no se puede borrar.</p>
    <div className="desliza"><table className="editable">
      <thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th>Categoría de gasto</th><th>N° cuenta bancaria</th><th></th></tr></thead>
      <tbody>{ordenarPlan(cfg.plan).map(c => (
        <tr key={c.codigo} className={c.transitoria ? 'transitoria' : ''}><td>{c.codigo}</td>
          <td><input defaultValue={c.nombre} onBlur={e => e.target.value.trim() && cambiar(c.codigo, { nombre: e.target.value.trim() })} aria-label={`Nombre de la cuenta ${c.codigo}`} /></td>
          <td>{c.tipo}</td>
          <td>{c.tipo === 'Gasto' || c.categoria ? <select value={c.categoria ?? ''} onChange={e => cambiar(c.codigo, { categoria: e.target.value || undefined })} aria-label={`Categoría de la cuenta ${c.codigo}`}>
            <option value="">—</option>{CATEGORIAS_GASTO.map(x => <option key={x.categoria}>{x.categoria}</option>)}
            {c.categoria && !CATEGORIAS_GASTO.some(x => x.categoria === c.categoria) && <option>{c.categoria}</option>}</select> : null}</td>
          <td>{c.tipo === 'Activo' && c.codigo < 1200 ? <input className="corto" defaultValue={c.cuentaBancaria ?? ''} onBlur={e => cambiar(c.codigo, { cuentaBancaria: e.target.value.trim() || undefined })} aria-label={`Número de cuenta bancaria de ${c.codigo}`} /> : null}</td>
          <td>{!usadas.has(c.codigo) && !PLAN_BASE.some(b => b.codigo === c.codigo) &&
            <button className="enlace peligro" onClick={() => onCfg({ ...cfg, plan: cfg.plan.filter(x => x.codigo !== c.codigo) })}>Borrar</button>}</td>
        </tr>))}</tbody>
    </table></div>
    <form className="ajustes" onSubmit={e => { e.preventDefault(); if (!existe && Number(nuevo.codigo) > 999 && nuevo.nombre.trim()) {
      onCfg({ ...cfg, plan: [...cfg.plan, { codigo: Number(nuevo.codigo), nombre: nuevo.nombre.trim(), tipo: nuevo.tipo }] }); setNuevo({ codigo: '', nombre: '', tipo: nuevo.tipo }); } }}>
      <label>Código<input className="corto" inputMode="numeric" value={nuevo.codigo} onChange={e => setNuevo({ ...nuevo, codigo: e.target.value.replace(/\D/g, '') })} /></label>
      <label>Nombre<input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
      <label>Tipo<select value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value as TipoCuenta })}>
        {(['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'] as TipoCuenta[]).map(t => <option key={t}>{t}</option>)}</select></label>
      <button className="boton" disabled={existe || Number(nuevo.codigo) < 1000 || !nuevo.nombre.trim()}>Agregar cuenta</button>
      {existe && <span className="aviso">Ese código ya existe.</span>}
    </form>
  </>);
}
