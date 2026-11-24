import { useMemo, useState } from 'react';
import type { Documento, Empresa } from './nucleo/rcv';
import { anularDocumento } from './nucleo/rcv';
import type { Movimiento } from './nucleo/cartola';
import { aplicarCruces, clasificar, crearRegla, alcanceRegla, patronDe, rutsConDV, CATEGORIAS, type Regla, type TipoRegla } from './nucleo/cruce';
import { etiquetaCuenta, codigoSugerido, ordenarPlan, proveedoresSinCategoria, asignarCategoria, type ConfigContable, type Cuenta, type TipoCuenta } from './nucleo/contabilidad';
import { sugerirMovimiento, sugerenciasProveedores, type Propuesta } from './nucleo/sugerir';
import { observacionesDocumento } from './nucleo/controles';
import { calcularDV, formatearRUT } from './nucleo/rut';
import { pesos } from './formato';

type Sub = 'sugerencias' | 'banco' | 'proveedores' | 'documentos';
interface Props {
  empresa: Empresa; movs: Movimiento[]; docs: Documento[]; reglas: Regla[]; cfg: ConfigContable;
  onCambio: (movs: Movimiento[], docs?: Documento[], reglas?: Regla[]) => void;
  onCfg: (c: ConfigContable) => void;
  onDoc: (d: Documento) => void;
}
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const montoMov = (m: Movimiento) => <span className={m.cargo ? 'neg' : 'pos'}>{pesos(m.abono - m.cargo)}</span>;
const signoDoc = (d: Documento) => (d.tipoDoc === 60 || d.tipoDoc === 61 || d.tipoDoc === 112 ? -1 : 1);

export default function PorClasificar({ empresa, movs, docs, reglas, cfg, onCambio, onCfg, onDoc }: Props) {
  const [sub, setSub] = useState<Sub>('sugerencias');
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set());
  const [ver, setVer] = useState(60);
  const pendientes = useMemo(() => movs.filter(m => m.estado === 'pendiente').sort((a, b) => b.fecha.localeCompare(a.fecha)), [movs]);
  const clasificados = useMemo(() => movs.filter(m => m.estado === 'clasificado'), [movs]);
  const propMov = useMemo(() => new Map(pendientes.map(m => [m.clave, sugerirMovimiento(m, { clasificados, rutEmpresa: empresa.rut, razonSocial: empresa.razonSocial, docs })] as const).filter((x): x is [string, Propuesta] => !!x[1])), [pendientes, clasificados, empresa, docs]);
  const categoriasPlan = useMemo(() => [...new Set(cfg.plan.map(c => c.categoria).filter((c): c is string => !!c))], [cfg.plan]);
  const sinCat = useMemo(() => proveedoresSinCategoria(docs, cfg.provCategoria, empresa.rut), [docs, cfg.provCategoria, empresa.rut]);
  const propProv = useMemo(() => sugerenciasProveedores(sinCat, docs, cfg.provCategoria, categoriasPlan, empresa.razonSocial), [sinCat, docs, cfg.provCategoria, categoriasPlan, empresa.razonSocial]);
  const conObs = useMemo(() => docs.filter(d => d.empresa === empresa.rut && d.estado !== 'ANULADA' && observacionesDocumento(d).length), [docs, empresa.rut]);
  const abiertos = useMemo(() => ({
    abono: docs.filter(d => d.libro === 'VENTA' && d.estado === 'POR COBRAR'),
    cargo: docs.filter(d => d.libro === 'COMPRA' && d.estado === 'POR PAGAR' && d.tipoDoc !== 40 && d.tipoDoc !== 43),
  }), [docs]);

  // Sugerencias para confirmar, de mayor a menor monto
  const sugerencias = useMemo(() => [
    ...pendientes.filter(m => propMov.has(m.clave) && !descartadas.has(m.clave)).map(m => ({ clave: m.clave, tipo: 'mov' as const, m, p: propMov.get(m.clave)!, monto: Math.abs(m.abono - m.cargo) })),
    ...sinCat.filter(x => propProv.has(x.rut) && !descartadas.has(x.rut)).map(x => ({ clave: x.rut, tipo: 'prov' as const, x, p: propProv.get(x.rut)!, monto: x.monto })),
  ].sort((a, b) => b.monto - a.monto), [pendientes, propMov, sinCat, propProv, descartadas]);

  function clasificarMov(m: Movimiento, categoria: string, regla: { tipo: TipoRegla; texto: string } | null) {
    let nuevas = reglas, id = 'a mano';
    if (regla) { const r = crearRegla(m, categoria, reglas, regla); nuevas = [...reglas, r]; id = r.id; }
    const marcados = movs.map(x => (x.clave === m.clave ? { ...x, estado: 'clasificado' as const, categoria, regla: id } : x));
    onCambio(regla ? clasificar(marcados, nuevas) : marcados, undefined, regla ? nuevas : undefined);
  }
  function conciliarMov(m: Movimiento, claves: string[]) {
    const r = aplicarCruces([{ movimiento: m.clave, confianza: 'Alta', motivo: 'Conciliado a mano', docs: claves, contraparte: '' }], docs, movs);
    onCambio(r.movs, r.docs);
  }
  const asignar = (rut: string, c: string) => onCfg({ ...cfg, provCategoria: asignarCategoria(cfg.provCategoria, rut, c) });
  const nuevaCuenta = (c: Cuenta) => onCfg({ ...cfg, plan: [...cfg.plan, c] });

  function aceptarTodas() {
    const movAcept = new Map(sugerencias.filter(s => s.tipo === 'mov').map(s => [s.clave, s.p.categoria]));
    if (movAcept.size) onCambio(movs.map(m => (movAcept.has(m.clave) ? { ...m, estado: 'clasificado' as const, categoria: movAcept.get(m.clave)!, regla: 'sugerencia' } : m)));
    const provs = sugerencias.filter(s => s.tipo === 'prov');
    if (provs.length) onCfg({ ...cfg, provCategoria: provs.reduce((acc, s) => asignarCategoria(acc, s.clave, s.p.categoria), cfg.provCategoria) });
  }

  const BOTONES: [Sub, string, number][] = [
    ['sugerencias', 'Sugerencias para confirmar', sugerencias.length], ['banco', 'Movimientos del banco', pendientes.length],
    ['proveedores', 'Proveedores sin categoría', sinCat.length], ['documentos', 'Documentos con observaciones', conObs.length],
  ];

  return (
    <section className="libros por-clasificar">
      <h2>Por clasificar</h2>
      <p className="bajada chica">Aquí está todo lo que la app no pudo decidir sola. Elige qué quieres ordenar.</p>
      <div className="segmentos" role="tablist" aria-label="Qué clasificar">
        {BOTONES.map(([k, t, n]) => (
          <button key={k} role="tab" aria-selected={sub === k} className={sub === k ? 'activo' : ''} onClick={() => setSub(k)}>
            <span>{t}</span><b className={n ? '' : 'cero'}>{n}</b></button>))}
      </div>

      {sub === 'sugerencias' && (sugerencias.length === 0
        ? <p className="vacio">No hay sugerencias por confirmar. Lo que queda sin clasificar está en los otros botones.</p> : (<>
          <div className="borrador-cab"><p className="vacio sin-margen">La app propone qué es cada cosa mirando la glosa, el nombre del proveedor y lo que ya clasificaste. Revisa y acepta.</p>
            <button className="boton" onClick={aceptarTodas}>Aceptar todas ({sugerencias.length})</button></div>
          <ul className="sugerencias lista-sugerencias">{sugerencias.map(s => (
            <li key={s.clave}>
              <div className="sug-mov"><span className={`chip ${s.p.fuerza === 'alta' ? 'verde' : 'anil'}`}>{s.tipo === 'mov' ? 'Banco' : 'Proveedor'}</span>
                {s.tipo === 'mov' ? <><b>{fechaCorta(s.m.fecha)}</b> {s.m.descripcion} <b>{montoMov(s.m)}</b></> : <><b>{s.x.nombre}</b> <span className="vacio">{s.x.compras} compra{s.x.compras > 1 ? 's' : ''}, {pesos(s.x.monto)}</span></>}</div>
              <p className="sug-docs">→ <b>{s.p.categoria}</b> <span className="vacio">· {s.p.motivo}</span></p>
              <div className="sug-botones">
                <button className="enlace activo" onClick={() => (s.tipo === 'mov' ? clasificarMov(s.m, s.p.categoria, null) : asignar(s.clave, s.p.categoria))}>Aceptar</button>
                <button className="enlace" onClick={() => setDescartadas(d => new Set(d).add(s.clave))}>No es eso</button>
              </div>
            </li>))}</ul>
        </>))}

      {sub === 'banco' && (pendientes.length === 0 ? <p className="vacio">Todos los movimientos del banco están identificados.</p> : (<>
        <p className="vacio">Dile a la app qué es cada movimiento: una clasificación del banco, una cuenta del plan (o una nueva), o asócialo a una o varias facturas. Con "Recordar" la app crea una regla y la próxima vez lo hace sola.</p>
        <ul className="por-identificar">{pendientes.slice(0, ver).map(m => (
          <Clasificador key={m.clave} m={m} plan={cfg.plan} pendientes={pendientes} propuesta={propMov.get(m.clave)} abiertos={m.abono > m.cargo ? abiertos.abono : abiertos.cargo}
            onClasificar={clasificarMov} onConciliar={conciliarMov} onNuevaCuenta={nuevaCuenta} />))}</ul>
        {pendientes.length > ver && <button className="enlace" onClick={() => setVer(v => v + 60)}>Ver más ({pendientes.length - ver} restantes)</button>}
      </>))}

      {sub === 'proveedores' && (sinCat.length === 0 ? <p className="vacio">Todas las compras tienen categoría.</p> : (<>
        <p className="vacio">Cada compra se carga a la cuenta de su categoría. Elige la del proveedor una vez y vale para todas sus compras, ahora y en adelante. Sin categoría quedan en 5990 Compras por revisar.</p>
        <ul className="por-identificar">{sinCat.map(p => {
          const s = propProv.get(p.rut);
          return (
            <li key={p.rut}><div className="sug-mov"><b>{p.nombre}</b> <span className="vacio">{p.rut}</span> <span>{p.compras} compra{p.compras > 1 ? 's' : ''}, {pesos(p.monto)} sin IVA</span></div>
              {s && <p className="sug-docs"><span className="chip anil">Sugerencia</span> <b>{s.categoria}</b> <span className="vacio">· {s.motivo}</span>{' '}
                <button className="enlace activo" onClick={() => asignar(p.rut, s.categoria)}>Aceptar</button></p>}
              <div className="clasificar"><select defaultValue="" onChange={e => e.target.value && asignar(p.rut, e.target.value)} aria-label={`Categoría de ${p.nombre}`}>
                <option value="">{s ? 'Elegir otra categoría…' : 'Elegir categoría…'}</option>{categoriasPlan.map(c => <option key={c}>{c}</option>)}</select></div></li>);
        })}</ul>
      </>))}

      {sub === 'documentos' && (conObs.length === 0 ? <p className="vacio">Ningún documento tiene observaciones (RUT válido, IVA del 19% y total que cuadra).</p> : (
        <ul className="por-identificar">{conObs.map(d => (
          <li key={d.clave}><div className="sug-mov"><b>{d.libro === 'VENTA' ? 'Venta' : 'Compra'} folio {d.folio}</b> {d.razonSocial} <span className="vacio">{fechaCorta(d.fechaEmision)}</span> <b>{pesos(d.total)}</b></div>
            <p className="sug-motivo">{observacionesDocumento(d).join(' ')} Revísalo en el SII: si no existe, anúlalo; si está bien, déjalo.</p>
            <div className="sug-botones"><button className="enlace peligro" onClick={() => onDoc(anularDocumento(d, `observado: ${observacionesDocumento(d).join(' ')}`))}>Anular</button></div></li>))}</ul>))}
    </section>
  );
}

const TIPOS: TipoCuenta[] = ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'];

function Clasificador({ m, plan, pendientes, propuesta, abiertos, onClasificar, onConciliar, onNuevaCuenta }: {
  m: Movimiento; plan: Cuenta[]; pendientes: Movimiento[]; propuesta?: Propuesta; abiertos: Documento[];
  onClasificar: (m: Movimiento, c: string, regla: { tipo: TipoRegla; texto: string } | null) => void;
  onConciliar: (m: Movimiento, docs: string[]) => void; onNuevaCuenta: (c: Cuenta) => void;
}) {
  const rutGlosa = useMemo(() => { const c = rutsConDV(m.descripcion)[0]; return c ? formatearRUT(`${c}-${calcularDV(Number(c))}`) : ''; }, [m.descripcion]);
  const [modo, setModo] = useState<'clasificar' | 'factura'>('clasificar');
  const [cat, setCat] = useState(''), [recordar, setRecordar] = useState(true);
  const [tipoRegla, setTipoRegla] = useState<TipoRegla>(rutGlosa ? 'rut' : 'contiene');
  const [textoRegla, setTextoRegla] = useState(() => m.descripcion.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim());
  const [nueva, setNueva] = useState<{ tipo: TipoCuenta; codigo: string; nombre: string } | null>(null);
  const [buscar, setBuscar] = useState(''), [sel, setSel] = useState<string[]>([]);
  const monto = Math.abs(m.abono - m.cargo);
  const cuentas = useMemo(() => ordenarPlan(plan).filter(c => !c.transitoria), [plan]);
  const textoFinal = tipoRegla === 'rut' ? rutGlosa : tipoRegla === 'igual' ? m.descripcion : textoRegla;
  const regla = recordar ? { tipo: tipoRegla, texto: textoFinal } : null;
  const reglaOk = !recordar || (tipoRegla === 'contiene' ? patronDe(textoFinal).length >= 4 : !!textoFinal);
  const alcance = useMemo(() => (recordar && reglaOk ? alcanceRegla(crearRegla(m, 'x', [], { tipo: tipoRegla, texto: textoFinal }), pendientes) : 0),
    [recordar, reglaOk, tipoRegla, textoFinal, m, pendientes]);
  const candidatos = useMemo(() => {
    const t = buscar.trim().toLowerCase().replace(/\./g, '');
    return abiertos.filter(d => !t || `${d.razonSocial} ${d.rutContraparte.replace(/\./g, '')} ${d.folio} ${d.total}`.toLowerCase().includes(t))
      .sort((a, b) => Math.abs(a.total - monto) - Math.abs(b.total - monto)).slice(0, 8);
  }, [abiertos, buscar, monto]);
  const elegidos = abiertos.filter(d => sel.includes(d.clave));
  const suma = elegidos.reduce((s, d) => s + signoDoc(d) * d.total, 0);
  const codigo = Number(nueva?.codigo ?? 0), repetido = plan.some(c => c.codigo === codigo);
  const nuevaOk = !!nueva && codigo >= 1000 && codigo <= 9999 && !repetido && nueva.nombre.trim().length > 2;

  function elegir(v: string) {
    if (v === '__nueva') { const tipo: TipoCuenta = m.cargo ? 'Gasto' : 'Ingreso'; setNueva({ tipo, codigo: String(codigoSugerido(plan, tipo) || ''), nombre: '' }); setCat(''); }
    else { setNueva(null); setCat(v); }
  }
  function crear() {
    if (!nueva || !nuevaOk) return;
    const c: Cuenta = { codigo, nombre: nueva.nombre.trim(), tipo: nueva.tipo };
    onNuevaCuenta(c); onClasificar(m, etiquetaCuenta(c), regla);
  }
  return (
    <li>
      <div className="sug-mov"><b>{fechaCorta(m.fecha)}</b> {m.descripcion} <b>{montoMov(m)}</b></div>
      {propuesta && <p className="sug-docs"><span className={`chip ${propuesta.fuerza === 'alta' ? 'verde' : 'anil'}`}>Sugerencia</span> <b>{propuesta.categoria}</b> <span className="vacio">· {propuesta.motivo}</span>{' '}
        <button className="enlace activo" onClick={() => onClasificar(m, propuesta.categoria, regla && reglaOk ? regla : null)}>Aceptar</button></p>}
      <div className="modos" role="group" aria-label="Cómo identificar el movimiento">
        <button className={`enlace ${modo === 'clasificar' ? 'activo' : ''}`} onClick={() => setModo('clasificar')}>Clasificar</button>
        <button className={`enlace ${modo === 'factura' ? 'activo' : ''}`} onClick={() => setModo('factura')}>Asociar a {m.abono > m.cargo ? 'facturas de venta' : 'facturas de compra'}</button>
      </div>
      {modo === 'clasificar' ? (<>
        <div className="clasificar">
          <select value={nueva ? '__nueva' : cat} onChange={e => elegir(e.target.value)} aria-label="Clasificar como">
            <option value="">Clasificar como…</option>
            <optgroup label="Clasificaciones del banco">{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</optgroup>
            <optgroup label="Cuentas del plan">{cuentas.map(c => <option key={c.codigo} value={etiquetaCuenta(c)}>{c.codigo} {c.nombre}</option>)}</optgroup>
            <option value="__nueva">＋ Crear una cuenta nueva…</option>
          </select>
          {!nueva && <button className="boton" disabled={!cat || !reglaOk} onClick={() => onClasificar(m, cat, regla)}>Guardar</button>}
        </div>
        <div className="regla-opciones">
          <label><input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} /> Recordar como regla</label>
          {recordar && <>
            <select value={tipoRegla} onChange={e => setTipoRegla(e.target.value as TipoRegla)} aria-label="Tipo de regla">
              <option value="contiene">Glosas que contienen…</option>
              <option value="igual">Glosa igual a esta</option>
              {rutGlosa && <option value="rut">Movimientos con el RUT {rutGlosa}</option>}
            </select>
            {tipoRegla === 'contiene' && <input value={textoRegla} onChange={e => setTextoRegla(e.target.value)} aria-label="Texto que debe contener la glosa" />}
            <span className={reglaOk ? 'vacio' : 'aviso'}>{reglaOk ? `Clasificaría ${alcance} movimiento${alcance === 1 ? '' : 's'} pendiente${alcance === 1 ? '' : 's'}.` : 'Escribe al menos 4 letras.'}</span>
          </>}
        </div>
        {nueva && (
          <div className="nueva-cuenta">
            <label>Tipo<select value={nueva.tipo} onChange={e => { const tipo = e.target.value as TipoCuenta; setNueva({ ...nueva, tipo, codigo: String(codigoSugerido(plan, tipo) || '') }); }}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}</select></label>
            <label>Código<input className="corto" inputMode="numeric" value={nueva.codigo} onChange={e => setNueva({ ...nueva, codigo: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
            <label className="ancho">Nombre de la cuenta<input value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Ej.: Arriendo de maquinaria" autoFocus /></label>
            <button className="boton" disabled={!nuevaOk || !reglaOk} onClick={crear}>Crear cuenta y guardar</button>
            <button className="enlace" onClick={() => setNueva(null)}>Cancelar</button>
            {repetido && <span className="aviso">El código {codigo} ya existe en el plan.</span>}
          </div>)}
      </>) : (
        <div className="asociar">
          <input className="buscar" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, RUT, folio o monto" aria-label="Buscar facturas pendientes" />
          {abiertos.length === 0 ? <p className="vacio">No hay facturas pendientes de este lado.</p> : (
            <ul>{candidatos.map(d => (
              <li key={d.clave}><label>
                <input type="checkbox" checked={sel.includes(d.clave)} onChange={e => setSel(e.target.checked ? [...sel, d.clave] : sel.filter(x => x !== d.clave))} />
                {' '}{signoDoc(d) < 0 ? 'NC' : 'Folio'} {d.folio} · {d.razonSocial} · {fechaCorta(d.fechaEmision)} · <b>{pesos(signoDoc(d) * d.total)}</b>
              </label></li>))}</ul>)}
          {elegidos.length > 0 && <p className={Math.abs(suma - monto) < 1 ? 'pos' : 'aviso'}>
            {elegidos.length} documento{elegidos.length > 1 ? 's' : ''} suman {pesos(suma)}; el movimiento es {pesos(monto)}{Math.abs(suma - monto) < 1 ? ': calzan.' : ` (diferencia ${pesos(monto - suma)}).`}</p>}
          <button className="boton" disabled={!sel.length} onClick={() => onConciliar(m, sel)}>Conciliar con {sel.length || ''} documento{sel.length === 1 ? '' : 's'}</button>
        </div>)}
    </li>
  );
}
