import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signoDoc, type Documento, type Empresa } from './nucleo/rcv';
import { formatearRUT, rutValido } from './nucleo/rut';
import { leerArchivo, periodoLegible, type ResultadoLectura } from './nucleo/lector';
import { periodoDe } from './nucleo/resumen';
import { serviciosNavegador } from './servicios';
import ResumenAnio from './ResumenAnio';
import PanelIVA from './PanelIVA';
import type { F29 } from './nucleo/f29';
import type { Movimiento } from './nucleo/cartola';
import type { Regla } from './nucleo/cruce';
import PanelBanco from './PanelBanco';
import PanelPersonal from './PanelPersonal';
import type { LibroRemuneraciones, MesHonorarios } from './nucleo/remuneraciones';
import { pesos } from './formato';
import PanelContabilidad from './PanelContabilidad';
import { configInicial, completarPlan, usarLibro, cuentasBancarias, type ConfigContable } from './nucleo/contabilidad';
import { anularDocumento, reactivarDocumento } from './nucleo/rcv';
import PanelMes from './PanelMes';
import { panelMes, mesesConDatos, crearRespaldo, leerRespaldo } from './nucleo/panel';
import { controlesGenerales, observacionesDocumento } from './nucleo/controles';
import { descargarTodo } from './exportar';
import { iniciarRecorrido } from './recorrido';
import { ls, migrar, empresaActiva, empresas as listaEmpresas, claveDe, agregarEmpresa, activar, quitarEmpresa, datosDeEmpresa, importarRespaldo, clavesDocs, agregarLectura } from './almacen';
import PorClasificar from './PorClasificar';
import Asistente from './Asistente';
import Noticias from './Noticias';
import { contarPorClasificar } from './nucleo/porClasificar';
import Icono, { type NombreIcono } from './Icono';

// Todo se guarda solo en este navegador (IndexedDB, o ls() si no hay). Nada se envía a un servidor.
// Multiempresa: cada empresa guarda sus datos aparte ("ctp.<RUT>.documentos"); se cambia de empresa recargando la página.
try { migrar(ls()); } catch { /* sin almacenamiento */ }
const ACTIVA = (() => { try { return empresaActiva(ls()); } catch { return null; } })();
const K = (dato: string) => claveDe(ACTIVA?.rut ?? '', dato);
const CLAVE_DOCS = K('documentos'), CLAVE_F29 = K('f29'), CLAVE_MOVS = K('movimientos'), CLAVE_REGLAS = K('reglas'), CLAVE_LIBROS = K('libros'), CLAVE_HON = K('honorarios'), CLAVE_CONTA = K('contabilidad'), CLAVE_UTM = K('utm');
const leerLS = <T,>(k: string, def: T): T => { try { const v = ls().getItem(k); return v ? JSON.parse(v) as T : def; } catch { return def; } };
// Devuelve false si el navegador no pudo guardar (sin espacio o almacenamiento bloqueado): la app lo avisa.
const guardarLS = (k: string, v: unknown) => { try { ls().setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

const SELLO: Record<ResultadoLectura['estado'], { texto: string; clase: string }> = {
  leido: { texto: 'Cargado', clase: 'verde' },
  reconocido: { texto: 'Reconocido', clase: 'anil' },
  otra_empresa: { texto: 'Otra empresa', clase: 'ambar' },
  no_reconocido: { texto: 'No reconocido', clase: 'rojo' },
  error: { texto: 'No se pudo leer', clase: 'rojo' },
};

export type Vista = 'inicio' | 'cargar' | 'clasificar' | 'documentos' | 'iva' | 'personal' | 'banco' | 'contabilidad' | 'noticias';
const MENU: [Vista, string][] = [['inicio', 'Inicio'], ['cargar', 'Cargar documentos'], ['clasificar', 'Por clasificar'], ['documentos', 'Compras y ventas'],
  ['iva', 'IVA y F29'], ['personal', 'Personal'], ['banco', 'Banco'], ['contabilidad', 'Contabilidad'], ['noticias', 'Noticias del SII']];
const vistaDeHash = (): Vista => { const h = location.hash.slice(1) as Vista; return MENU.some(([v]) => v === h) ? h : 'inicio'; };

interface Ficha { id: number; archivo: string; leyendo: boolean; resultado?: ResultadoLectura; file?: File; cargadoEn?: string }

export default function App() {
  const [empresa] = useState<Empresa | null>(ACTIVA);
  const [agregando, setAgregando] = useState(false);
  const lista = useMemo(() => { try { return listaEmpresas(ls()); } catch { return []; } }, []);
  const [docs, setDocs] = useState<Documento[]>(() => leerLS<Documento[]>(CLAVE_DOCS, []));
  const [f29s, setF29s] = useState<F29[]>(() => leerLS<F29[]>(CLAVE_F29, []));
  const [movs, setMovs] = useState<Movimiento[]>(() => leerLS<Movimiento[]>(CLAVE_MOVS, []));
  const [reglas, setReglas] = useState<Regla[]>(() => leerLS<Regla[]>(CLAVE_REGLAS, []));
  const [libros, setLibros] = useState<LibroRemuneraciones[]>(() => leerLS<LibroRemuneraciones[]>(CLAVE_LIBROS, []));
  const [honorarios, setHonorarios] = useState<MesHonorarios[]>(() => leerLS<MesHonorarios[]>(CLAVE_HON, []));
  const [conta, setConta] = useState<ConfigContable>(() => completarPlan({ ...configInicial(), ...leerLS<Partial<ConfigContable>>(CLAVE_CONTA, {}) }));
  const [utm, setUtm] = useState<Record<string, number>>(() => leerLS<Record<string, number>>(CLAVE_UTM, {}));
  const [sinGuardar, setSinGuardar] = useState(false);
  const respaldoRef = useRef<HTMLInputElement>(null);
  const movsRef = useRef(new Set<string>());
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [verResumen, setVerResumen] = useState(false);
  const [vista, setVista] = useState<Vista>(vistaDeHash);
  const ir = useCallback((v: Vista) => { setVista(v); if (location.hash.slice(1) !== v) history.pushState(null, '', `#${v}`); scrollTo({ top: 0 }); }, []);
  useEffect(() => { const f = () => setSinGuardar(true); addEventListener('ctp:sin-guardar', f); return () => removeEventListener('ctp:sin-guardar', f); }, []);
  useEffect(() => {
    const alCambiar = () => setVista(vistaDeHash());
    const pedido = (e: Event) => ir((e as CustomEvent<Vista>).detail);    // el recorrido guiado cambia de vista
    addEventListener('popstate', alCambiar); addEventListener('ctp:vista', pedido);
    return () => { removeEventListener('popstate', alCambiar); removeEventListener('ctp:vista', pedido); };
  }, [ir]);
  const entrada = useRef<HTMLInputElement>(null);
  const clavesRef = useRef(new Set<string>());
  const idRef = useRef(0);

  useEffect(() => { clavesRef.current = new Set(docs.map(d => d.clave)); }, [docs]);
  useEffect(() => { movsRef.current = new Set(movs.map(m => m.clave)); }, [movs]);
  useEffect(() => {
    const ok = [guardarLS(CLAVE_DOCS, docs), guardarLS(CLAVE_F29, f29s), guardarLS(CLAVE_MOVS, movs), guardarLS(CLAVE_REGLAS, reglas), guardarLS(CLAVE_LIBROS, libros),
      guardarLS(CLAVE_HON, honorarios), guardarLS(CLAVE_CONTA, conta), guardarLS(CLAVE_UTM, utm)].every(Boolean);
    setSinGuardar(!ok);
  }, [docs, f29s, movs, reglas, libros, honorarios, conta, utm]);

  // Con dos o más bancos, cada cuenta de las cartolas tiene su cuenta contable (se crea sola la primera vez)
  useEffect(() => { setConta(c => cuentasBancarias(movs, c)); }, [movs]);
  const controles = useMemo(() => (empresa ? controlesGenerales({ empresa: empresa.rut, docs, f29s, movs, libros, honorarios, utm }, conta) : []), [empresa, docs, f29s, movs, libros, honorarios, utm, conta]);
  const meses = useMemo(() => mesesConDatos(docs, f29s, movs, libros), [docs, f29s, movs, libros]);
  const calcularMes = useCallback((p: string) => panelMes(p, docs, f29s, movs, libros, { comisionLF: conta.ivaComisionLF }), [docs, f29s, movs, libros, conta.ivaComisionLF]);
  const pendientes = useMemo(() => (empresa ? contarPorClasificar(empresa, movs, docs, conta) : null), [empresa, movs, docs, conta]);

  async function leer(lista: FileList | File[]) {
    if (!empresa) return;
    const archivos = Array.from(lista);
    const nuevas = archivos.map(f => ({ id: ++idRef.current, archivo: f.name, leyendo: true, file: f }));
    setFichas(fs => [...nuevas, ...fs]);
    for (let i = 0; i < archivos.length; i++) {
      const f = archivos[i];
      const r = await leerArchivo(f.name, new Uint8Array(await f.arrayBuffer()), { empresas: [empresa], clavesExistentes: clavesRef.current, servicios: serviciosNavegador });
      if (r.documentos.length) setDocs(d => [...d, ...r.documentos]);
      if (r.movimientos?.length) {
        const nuevos = r.movimientos.filter(m => !movsRef.current.has(m.clave));
        nuevos.forEach(m => movsRef.current.add(m.clave));
        const repetidos = r.movimientos.length - nuevos.length;
        if (repetidos) r.avisos.push(repetidos === r.movimientos.length ? 'Esta cartola ya estaba cargada: no se agregó nada.' : `${repetidos} movimientos ya estaban cargados y se omitieron.`);
        if (nuevos.length) setMovs(l => [...l, ...nuevos]);
      }
      const libro = r.libro, hon = r.honorarios;
      if (libro) setLibros(l => [...l.filter(x => x.periodo !== libro.periodo), libro].sort((a, b) => a.periodo.localeCompare(b.periodo)));   // el libro del mismo mes se reemplaza
      if (hon) setHonorarios(l => [...l.filter(x => !x.periodo.startsWith(hon.anio)), ...hon.meses]);
      const nuevos29 = r.f29s ?? (r.f29 ? [r.f29] : []);     // un F29 o todos los de una carpeta tributaria
      if (nuevos29.length) setF29s(l => [...l.filter(x => !nuevos29.some(f => x.periodo === f.periodo && x.folio === f.folio)), ...nuevos29]);   // el mismo folio no se duplica
      setFichas(fs => fs.map(x => (x.id === nuevas[i].id ? { ...x, leyendo: false, resultado: r } : x)));
    }
  }

  const porPeriodo = useMemo(() => {
    const m = new Map<string, { periodo: string; ventas: number; compras: number; nV: number; nC: number }>();
    for (const d of docs) {
      if (d.estado === 'ANULADA') continue;
      const p = periodoDe(d), s = signoDoc(d.tipoDoc);
      const r = m.get(p) ?? { periodo: p, ventas: 0, compras: 0, nV: 0, nC: 0 };
      if (d.libro === 'VENTA') { r.ventas += s * (d.neto + d.exento); r.nV++; } else { r.compras += s * (d.neto + d.exento); r.nC++; }
      m.set(p, r);
    }
    return [...m.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
  }, [docs]);

  const nuevaEmpresa = (e: Empresa) => {
    if (lista.some(x => x.rut === e.rut)) { activar(ls(), e.rut); location.reload(); return; }
    try { agregarEmpresa(ls(), e); } catch { alert('El navegador no pudo guardar la empresa.'); return; }
    location.hash = 'cargar'; location.reload();
  };
  if (!empresa || agregando) return <Bienvenida otras={lista} onGuardar={nuevaEmpresa} onCancelar={empresa ? () => setAgregando(false) : undefined} />;

  function cambiarA(rut: string) {
    if (rut === '__nueva') { setAgregando(true); return; }
    activar(ls(), rut); location.reload();
  }
  function quitarEsta() {
    if (!confirm(`¿Quitar ${empresa!.razonSocial} de este navegador? Se borran sus documentos, banco, reglas y contabilidad guardados aquí. Si no tienes un respaldo, descárgalo antes.`)) return;
    quitarEmpresa(ls(), empresa!.rut); location.hash = ''; location.reload();
  }

  function guardarRespaldo() {
    const datos = datosDeEmpresa(ls(), empresa!);
    const blob = new Blob([JSON.stringify(crearRespaldo(datos))], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Respaldo_ControlTributario_${empresa!.rut.replace(/\./g, '')}_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function abrirRespaldo(f: File) {
    const r = leerRespaldo(await f.text());
    if (!r.ok) { alert(r.error); return; }
    const existe = lista.some(x => x.rut === r.respaldo.empresa.rut);
    const que = existe ? `Reemplaza los datos de ${r.respaldo.empresa.razonSocial} guardados en este navegador (las otras empresas no se tocan).` : `Se agrega ${r.respaldo.empresa.razonSocial} como otra empresa (las que ya tienes no se tocan).`;
    if (!confirm(`Abrir el respaldo de ${r.resumen}\n\n${que} ¿Continuar?`)) return;
    try { importarRespaldo(ls(), r.respaldo); }
    catch { alert('El navegador no pudo guardar el respaldo (¿sin espacio?).'); return; }
    location.reload();
  }

  // Un archivo de otra empresa registrada se carga en esa empresa (sin cambiar la activa)
  async function cargarEn(f: Ficha, destino: Empresa) {
    if (!f.file) return;
    setFichas(fs => fs.map(x => (x.id === f.id ? { ...x, leyendo: true } : x)));
    const r = await leerArchivo(f.file.name, new Uint8Array(await f.file.arrayBuffer()), { empresas: [destino], clavesExistentes: clavesDocs(ls(), destino.rut), servicios: serviciosNavegador });
    let n = 0;
    try { if (r.estado === 'leido') n = agregarLectura(ls(), destino.rut, r); } catch { r.avisos.push('El navegador no pudo guardar (¿sin espacio?).'); }
    setFichas(fs => fs.map(x => (x.id === f.id ? { ...x, leyendo: false, resultado: r, cargadoEn: r.estado === 'leido' ? `${destino.razonSocial} (${n} ${n === 1 ? 'elemento nuevo' : 'elementos nuevos'})` : undefined } : x)));
  }

  const hay = !!(docs.length || f29s.length || movs.length || libros.length);
  const sinDatos = (texto: string) => <SinDatos texto={texto} onCargar={() => ir('cargar')} />;
  const nombreIcono: Record<Vista, NombreIcono> = { inicio: 'inicio', cargar: 'cargar', clasificar: 'clasificar', documentos: 'documentos', iva: 'iva', personal: 'personal', banco: 'banco', contabilidad: 'contabilidad', noticias: 'noticias' };

  return (
    <div className="app-marco">
      <aside className="menu-lateral" aria-label="Menú principal">
        <div className="marca"><span className="timbre-logo" aria-hidden>CT</span><span>Control Tributario</span></div>
        <div className="empresa-menu">
          <label htmlFor="sel-empresa">Empresa</label>
          <select id="sel-empresa" value={empresa.rut} onChange={e => cambiarA(e.target.value)}>
            {lista.map(x => <option key={x.rut} value={x.rut}>{x.razonSocial}</option>)}
            <option value="__nueva">＋ Agregar empresa…</option>
          </select>
          <span>RUT {empresa.rut}{lista.length > 1 ? ` · ${lista.length} empresas` : ''}</span>
        </div>
        <nav><ul>
          {MENU.map(([v, t]) => (
            <li key={v}><button className={vista === v ? 'activo' : ''} aria-current={vista === v ? 'page' : undefined} onClick={() => ir(v)}>
              <Icono n={nombreIcono[v]} /><span>{t}</span>
              {v === 'clasificar' && pendientes && pendientes.total > 0 && <b className="contador" aria-label={`${pendientes.total} por clasificar`}>{pendientes.total}</b>}
            </button></li>))}
          <li><button className="resumen-menu" onClick={() => setVerResumen(true)} disabled={!hay} title={hay ? 'Ver cómo va la empresa en el año' : 'Carga documentos para ver el resumen'}>
            <Icono n="resumen" /><span>Resumen del año</span></button></li>
        </ul></nav>
        <div className="menu-pie">
          <button onClick={iniciarRecorrido}><Icono n="ayuda" /><span>¿Cómo funciona?</span></button>
          <button onClick={guardarRespaldo} title="Descarga un archivo con todo lo cargado, para guardarlo o llevarlo a otro computador"><Icono n="guardar" /><span>Guardar respaldo</span></button>
          <button onClick={() => respaldoRef.current?.click()}><Icono n="abrir" /><span>Abrir respaldo</span></button>
          <input ref={respaldoRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) abrirRespaldo(f); e.target.value = ''; }} />
          <button onClick={() => setAgregando(true)}><Icono n="cambiar" /><span>Agregar empresa</span></button>
          <button onClick={quitarEsta}><Icono n="cambiar" /><span>Quitar esta empresa</span></button>
        </div>
      </aside>

      <main className="contenido">
        {sinGuardar && <p className="alerta-guardado" role="alert">El navegador no pudo guardar los últimos cambios (sin espacio o almacenamiento bloqueado). Descarga un respaldo antes de cerrar la página.</p>}

        {vista === 'inicio' && (<>
          {pendientes && pendientes.total > 0 && (
            <section className="libros llamado">
              <div><h2>Tienes {pendientes.total} cosas por clasificar</h2>
                <p className="vacio sin-margen">{[pendientes.banco && `${pendientes.banco} movimientos del banco`, pendientes.proveedores && `${pendientes.proveedores} proveedores sin categoría`, pendientes.documentos && `${pendientes.documentos} documentos con observaciones`].filter(Boolean).join(', ')}.</p></div>
              <button className="boton" onClick={() => ir('clasificar')}>Ir a Por clasificar</button>
            </section>)}
          {meses.length > 0 ? <PanelMes meses={meses} sugerido={meses.find(m => docs.some(d => d.estado !== 'ANULADA' && periodoDe(d) === m)) ?? meses[0]} calcular={calcularMes} controles={controles}
            onDescargar={() => descargarTodo({ empresa, docs, f29s, movs, libros, honorarios, cfg: conta, controles })} />
            : sinDatos('Bienvenido. Para empezar, carga lo que descargas del SII (RCV de compras y ventas, F29), las cartolas del banco y los libros de sueldos.')}
        </>)}

        {vista === 'cargar' && (<>
          <section
            className={`bandeja${arrastrando ? ' encima' : ''}`}
            onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={e => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files); }}
            aria-label="Lector de documentos"
          >
            <div className="hojas" aria-hidden><i /><i /><i /></div>
            <div className="bandeja-texto">
              <h1>Lector de documentos</h1>
              <p className="bajada">Suelta aquí lo que descargaste del SII, del banco o de tu sistema de sueldos. La app reconoce cada documento por su contenido y te dice qué entendió.</p>
              <button className="boton grande" onClick={() => entrada.current?.click()}>Elegir archivos</button>
              <input ref={entrada} type="file" multiple hidden onChange={e => { if (e.target.files) leer(e.target.files); e.target.value = ''; }} />
              <p className="formatos">Lee CSV, Excel, PDF y fotos o PDF escaneados. Los archivos no salen de tu navegador.</p>
            </div>
          </section>
          {fichas.length > 0 && (
            <section className="mesa" aria-live="polite">
              <div className="mesa-titulo"><h2>Lo que entendí</h2><button className="enlace" onClick={() => setFichas([])}>Limpiar la mesa</button></div>
              <div className="fichas">{fichas.map(f => <FichaDoc key={f.id} f={f} lista={lista} onCargarEn={cargarEn} libroEnUso={conta.libro?.archivo === f.archivo}
                onUsarLibro={() => {
                  const l = f.resultado?.libroDiario; if (!l) return;
                  const $ = (n: number) => '$' + Math.round(n).toLocaleString('de-DE');
                  if (!confirm(`Usar este Libro Diario en la contabilidad de ${empresa.razonSocial}?\n\n${l.asientos.toLocaleString('de-DE')} asientos del ${l.desde.split('-').reverse().join('-')} al ${l.hasta.split('-').reverse().join('-')} (debe ${$(l.debe)}). Hasta esa fecha sus asientos reemplazan a los automáticos de compras, ventas, F29 y banco; después, la app sigue sola. Su plan de cuentas se agrega al tuyo. Puedes dejar de usarlo en Contabilidad.`)) return;
                  setConta(c => usarLibro(c, f.archivo, l.plan, l.lineas)); ir('contabilidad');
                }} />)}</div>
            </section>
          )}
        </>)}

        {vista === 'clasificar' && (hay ? <PorClasificar empresa={empresa} movs={movs} docs={docs} reglas={reglas} cfg={conta}
          onCambio={(m, d, r) => { setMovs(m); if (d) setDocs(d); if (r) setReglas(r); }} onCfg={setConta}
          onDoc={d => setDocs(ds => ds.map(x => (x.clave === d.clave ? d : x)))} /> : sinDatos('Cuando cargues documentos, aquí aparecerá lo que la app no pudo clasificar sola.'))}

        {vista === 'documentos' && (
          <section className="libros compras-ventas">
            <h2>Compras y ventas</h2>
            {porPeriodo.length === 0 ? <p className="vacio">Todavía no hay documentos. Empieza por los RCV de compras y ventas del SII.</p> : (<>
              <table>
                <thead><tr><th>Mes</th><th className="n">Ventas netas</th><th className="n">Compras netas</th><th className="n">Diferencia</th><th className="n">Documentos</th></tr></thead>
                <tbody>{porPeriodo.map(p => (
                  <tr key={p.periodo}><td>{periodoLegible(p.periodo)}</td><td className="n">{pesos(p.ventas)}</td><td className="n">{pesos(p.compras)}</td>
                    <td className={`n ${p.ventas - p.compras < 0 ? 'neg' : ''}`}>{pesos(p.ventas - p.compras)}</td><td className="n">{p.nV + p.nC}</td></tr>))}</tbody>
              </table>
              <details className="detalle"><summary>Ver los {docs.length} documentos</summary><TablaDocs docs={docs} onCambio={d => setDocs(ds => ds.map(x => (x.clave === d.clave ? d : x)))} /></details>
              <button className="enlace peligro" onClick={() => { if (confirm('¿Borrar todos los documentos y F29 cargados en este navegador?')) { setDocs([]); setF29s([]); } }}>Borrar documentos cargados</button>
            </>)}
          </section>)}

        {vista === 'iva' && (docs.length > 0 || f29s.length > 0 ? <PanelIVA docs={docs} f29s={f29s} libros={libros} honorarios={honorarios} utmUsuario={utm} onUtm={setUtm} cfg={conta} onCfg={setConta} />
          : sinDatos('Carga los RCV y los F29 (PDF) para cuadrar el IVA y armar el borrador del próximo F29.'))}

        {vista === 'personal' && (libros.length > 0 || honorarios.length > 0 ? <PanelPersonal libros={libros} honorarios={honorarios} movs={movs}
          onBorrar={() => { if (confirm('¿Borrar los libros de remuneraciones y los honorarios cargados?')) { setLibros([]); setHonorarios([]); } }} />
          : sinDatos('Carga los libros de remuneraciones de cada mes y el informe de boletas de honorarios del SII.'))}

        {vista === 'banco' && (movs.length > 0 ? <PanelBanco movs={movs} docs={docs} f29s={f29s} reglas={reglas} libros={libros} rutEmpresa={empresa.rut} razonSocial={empresa.razonSocial}
          onIrClasificar={() => ir('clasificar')}
          onCambio={(m, d, r) => { setMovs(m); if (d) setDocs(d); if (r) setReglas(r); }}
          onBorrar={() => { if (confirm('¿Borrar los movimientos del banco y las reglas? Las facturas marcadas como pagadas o cobradas vuelven a quedar pendientes.')) {
            setMovs([]); setReglas([]); setDocs(ds => ds.map(d => (d.fechaPago ? { ...d, estado: d.libro === 'VENTA' ? 'POR COBRAR' : 'POR PAGAR', fechaPago: undefined } : d))); } }} />
          : sinDatos('Carga las cartolas del banco (Excel, CSV o PDF) para ver los movimientos y saber qué factura paga cada uno.'))}

        {vista === 'contabilidad' && (docs.length > 0 || movs.length > 0 ? <PanelContabilidad empresa={empresa.rut} docs={docs} f29s={f29s} movs={movs} libros={libros} honorarios={honorarios}
          cfg={conta} onCfg={setConta} controles={controles} /> : sinDatos('La contabilidad se arma sola cuando cargas documentos.'))}

        {vista === 'noticias' && <Noticias />}
      </main>

      <Asistente datos={{ empresa, docs, f29s, movs, reglas, libros, honorarios, cfg: conta }} controles={controles} porClasificar={pendientes?.total ?? 0}
        mes={meses.length ? calcularMes(meses.find(m => docs.some(d => d.estado !== 'ANULADA' && periodoDe(d) === m)) ?? meses[0]) : null}
        onIr={(v, pestana) => { ir(v); if (pestana) setTimeout(() => dispatchEvent(new CustomEvent('ctp:pestana', { detail: pestana })), 120); }}
        onArreglar={c => { if (c.docs) setDocs(c.docs); if (c.movs) setMovs(c.movs); if (c.libros) setLibros(c.libros); if (c.cfg) setConta(c.cfg); }}
        onRecorrido={iniciarRecorrido} onAgregarAsiento={lineas => setConta(c => ({ ...c, manuales: [...c.manuales, ...lineas] }))} />

      {verResumen && <ResumenAnio docs={docs} f29s={f29s} movs={movs} libros={libros} honorarios={honorarios} empresa={empresa} cfg={conta} controles={controles} onCerrar={() => setVerResumen(false)} />}
    </div>
  );
}

function SinDatos({ texto, onCargar }: { texto: string; onCargar: () => void }) {
  return (
    <section className="libros sin-datos">
      <p className="bajada chica">{texto}</p>
      <button className="boton" onClick={onCargar}>Cargar documentos</button>
    </section>
  );
}

function FichaDoc({ f, lista, onCargarEn, onUsarLibro, libroEnUso }: { f: Ficha; lista: Empresa[]; onCargarEn: (f: Ficha, e: Empresa) => void; onUsarLibro: () => void; libroEnUso: boolean }) {
  if (f.leyendo || !f.resultado) return (
    <article className="ficha leyendo"><p className="archivo">{f.archivo}</p><h3>Leyendo…</h3><p>Si es una foto o un PDF escaneado puede tardar un poco.</p></article>
  );
  const r = f.resultado, sello = f.cargadoEn ? { texto: 'Cargado', clase: 'verde' } : SELLO[r.estado];
  const otra = r.estado === 'otra_empresa' ? lista.find(e => e.rut === r.clasificacion.rutEmpresa) : undefined;
  return (
    <article className={`ficha ${sello.clase}`}>
      <span className={`sello ${sello.clase}`}>{sello.texto}</span>
      <h3>{r.titulo}</h3>
      {f.cargadoEn ? <p>Cargado en <b>{f.cargadoEn}</b>. {r.mensaje}</p>
        : otra ? <><p>Es de <b>{otra.razonSocial}</b>, otra empresa que tienes registrada.</p><button className="boton" onClick={() => onCargarEn(f, otra)}>Cargar en {otra.razonSocial}</button></>
        : r.estado === 'otra_empresa' ? <p>{r.mensaje} Si es tuya, agrégala con "Agregar empresa" y vuelve a cargar el archivo.</p>
        : <p>{r.mensaje}</p>}
      {r.libroDiario && (libroEnUso ? <p><b>En uso en la contabilidad.</b></p> : <button className="boton" onClick={onUsarLibro}>Usar este libro</button>)}
      {r.avisos.slice(0, 3).map((a, i) => <p key={i} className="aviso">{a}</p>)}
      <p className="archivo" title={r.archivo}>{r.archivo}</p>
    </article>
  );
}

function TablaDocs({ docs, onCambio }: { docs: Documento[]; onCambio: (d: Documento) => void }) {
  const [filtro, setFiltro] = useState(''), [anulando, setAnulando] = useState<string | null>(null), [motivo, setMotivo] = useState('');
  const vis = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    const orden = [...docs].sort((a, b) => periodoDe(b).localeCompare(periodoDe(a)) || b.fechaEmision.localeCompare(a.fechaEmision) || a.libro.localeCompare(b.libro) || b.folio - a.folio);
    return (t ? orden.filter(d => `${d.razonSocial} ${d.rutContraparte} ${d.folio}`.toLowerCase().includes(t)) : orden).slice(0, 300);
  }, [docs, filtro]);
  return (<>
    <input className="buscar" placeholder="Buscar por nombre, RUT o folio" value={filtro} onChange={e => setFiltro(e.target.value)} />
    <div className="desliza"><table>
      <thead><tr><th>Libro</th><th>Tipo</th><th>Folio</th><th>Emisión</th><th>RUT</th><th>Razón social</th><th className="n">Neto</th><th className="n">IVA</th><th className="n">Total</th><th>Estado</th></tr></thead>
      <tbody>{vis.map(d => <tr key={d.clave} className={d.estado === 'ANULADA' ? 'anulada' : ''}><td>{d.libro === 'VENTA' ? 'Venta' : 'Compra'}</td><td>{d.tipoDoc}</td><td>{d.folio}</td><td>{d.fechaEmision}</td><td>{d.rutContraparte}</td><td>{d.razonSocial}</td><td className="n">{pesos(d.neto)}</td><td className="n">{pesos(d.iva)}</td><td className="n">{pesos(d.total)}</td>
        <td className="estado-doc">{anulando === d.clave ? (
          <span className="anular"><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (ej.: no existe en el SII)" aria-label="Motivo de la anulación" autoFocus />
            <button className="enlace peligro" onClick={() => { onCambio(anularDocumento(d, motivo)); setAnulando(null); setMotivo(''); }}>Anular</button>
            <button className="enlace" onClick={() => setAnulando(null)}>Cancelar</button></span>
        ) : d.estado === 'ANULADA' ? (<><span title={d.observacion}>Anulado</span> <button className="enlace" onClick={() => onCambio(reactivarDocumento(d))}>Reactivar</button></>)
          : (<>{d.estado.toLowerCase()}{observacionesDocumento(d).length > 0 && <span className="chip rojo" title={observacionesDocumento(d).join(' ')}>revisar</span>}
            {' '}<button className="enlace" onClick={() => { setAnulando(d.clave); setMotivo(''); }}>Anular</button></>)}</td></tr>)}</tbody>
    </table></div>
    {docs.length > vis.length && <p className="vacio">Se muestran {vis.length} de {docs.length}; usa el buscador para encontrar otros.</p>}
  </>);
}

function Bienvenida({ onGuardar, onCancelar, otras = [] }: { onGuardar: (e: Empresa) => void; onCancelar?: () => void; otras?: Empresa[] }) {
  const [rut, setRut] = useState(''), [nombre, setNombre] = useState('');
  const ok = rutValido(rut) && nombre.trim().length > 1;
  return (
    <div className="app bienvenida">
      <div className="marca"><span className="timbre-logo" aria-hidden>CT</span><span>Control Tributario</span></div>
      <h1>{onCancelar ? 'Agrega otra empresa' : 'Ordena la información tributaria de tu pyme'}</h1>
      <p className="bajada">{onCancelar ? `Cada empresa guarda sus documentos, banco, reglas y contabilidad por separado. Ya tienes ${otras.length}: ${otras.map(o => o.razonSocial).join(', ')}.` : 'Carga lo que ya descargas del SII y del banco: la app lo reconoce, lo cuadra y te muestra cómo va la empresa. Todo queda en tu navegador.'}</p>
      <form className="alta" onSubmit={e => { e.preventDefault(); if (ok) onGuardar({ rut: formatearRUT(rut), razonSocial: nombre.trim().toUpperCase() }); }}>
        <label>RUT de la empresa<input value={rut} onChange={e => setRut(e.target.value)} placeholder="77.777.777-7" inputMode="text" autoComplete="off" /></label>
        <label>Razón social<input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Empresa de prueba SpA" autoComplete="organization" /></label>
        <button className="boton grande" disabled={!ok}>{onCancelar ? 'Agregar empresa' : 'Empezar'}</button>
        {onCancelar && <button type="button" className="enlace" onClick={onCancelar}>Volver</button>}
        {rut && !rutValido(rut) && <p className="error">Ese RUT no es válido: revisa el dígito verificador.</p>}
      </form>
    </div>
  );
}
