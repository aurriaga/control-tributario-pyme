import { useEffect, useMemo, useRef, useState } from 'react';
import type { Documento, Empresa } from './nucleo/rcv';
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

// Todo se guarda solo en este navegador (localStorage). Nada se envía a un servidor.
const CLAVE_EMPRESA = 'ctp.empresa', CLAVE_DOCS = 'ctp.documentos', CLAVE_F29 = 'ctp.f29', CLAVE_MOVS = 'ctp.movimientos', CLAVE_REGLAS = 'ctp.reglas', CLAVE_LIBROS = 'ctp.libros', CLAVE_HON = 'ctp.honorarios';
const leerLS = <T,>(k: string, def: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : def; } catch { return def; } };
const guardarLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

const SELLO: Record<ResultadoLectura['estado'], { texto: string; clase: string }> = {
  leido: { texto: 'Cargado', clase: 'verde' },
  reconocido: { texto: 'Reconocido', clase: 'anil' },
  otra_empresa: { texto: 'Otra empresa', clase: 'ambar' },
  no_reconocido: { texto: 'No reconocido', clase: 'rojo' },
  error: { texto: 'No se pudo leer', clase: 'rojo' },
};

interface Ficha { id: number; archivo: string; leyendo: boolean; resultado?: ResultadoLectura }

export default function App() {
  const [empresa, setEmpresa] = useState<Empresa | null>(() => leerLS<Empresa | null>(CLAVE_EMPRESA, null));
  const [docs, setDocs] = useState<Documento[]>(() => leerLS<Documento[]>(CLAVE_DOCS, []));
  const [f29s, setF29s] = useState<F29[]>(() => leerLS<F29[]>(CLAVE_F29, []));
  const [movs, setMovs] = useState<Movimiento[]>(() => leerLS<Movimiento[]>(CLAVE_MOVS, []));
  const [reglas, setReglas] = useState<Regla[]>(() => leerLS<Regla[]>(CLAVE_REGLAS, []));
  const [libros, setLibros] = useState<LibroRemuneraciones[]>(() => leerLS<LibroRemuneraciones[]>(CLAVE_LIBROS, []));
  const [honorarios, setHonorarios] = useState<MesHonorarios[]>(() => leerLS<MesHonorarios[]>(CLAVE_HON, []));
  const movsRef = useRef(new Set<string>());
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [verResumen, setVerResumen] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const clavesRef = useRef(new Set<string>());
  const idRef = useRef(0);

  useEffect(() => { guardarLS(CLAVE_DOCS, docs); clavesRef.current = new Set(docs.map(d => d.clave)); }, [docs]);
  useEffect(() => guardarLS(CLAVE_F29, f29s), [f29s]);
  useEffect(() => { guardarLS(CLAVE_MOVS, movs); movsRef.current = new Set(movs.map(m => m.clave)); }, [movs]);
  useEffect(() => guardarLS(CLAVE_REGLAS, reglas), [reglas]);
  useEffect(() => guardarLS(CLAVE_LIBROS, libros), [libros]);
  useEffect(() => guardarLS(CLAVE_HON, honorarios), [honorarios]);

  async function leer(lista: FileList | File[]) {
    if (!empresa) return;
    const archivos = Array.from(lista);
    const nuevas = archivos.map(f => ({ id: ++idRef.current, archivo: f.name, leyendo: true }));
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
      const f29 = r.f29;
      if (f29) setF29s(l => [...l.filter(x => !(x.periodo === f29.periodo && x.folio === f29.folio)), f29]);   // el mismo folio no se duplica
      setFichas(fs => fs.map(x => (x.id === nuevas[i].id ? { ...x, leyendo: false, resultado: r } : x)));
    }
  }

  const porPeriodo = useMemo(() => {
    const m = new Map<string, { periodo: string; ventas: number; compras: number; nV: number; nC: number }>();
    for (const d of docs) {
      const p = periodoDe(d), s = d.tipoDoc === 61 ? -1 : 1;
      const r = m.get(p) ?? { periodo: p, ventas: 0, compras: 0, nV: 0, nC: 0 };
      if (d.libro === 'VENTA') { r.ventas += s * (d.neto + d.exento); r.nV++; } else { r.compras += s * (d.neto + d.exento); r.nC++; }
      m.set(p, r);
    }
    return [...m.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
  }, [docs]);

  if (!empresa) return <Bienvenida onGuardar={e => { setEmpresa(e); guardarLS(CLAVE_EMPRESA, e); }} />;

  function cambiarEmpresa() {
    if (!confirm('Cambiar de empresa borra los documentos cargados en este navegador. ¿Continuar?')) return;
    setEmpresa(null); setDocs([]); setF29s([]); setMovs([]); setReglas([]); setLibros([]); setHonorarios([]); setFichas([]);
    try { localStorage.removeItem(CLAVE_EMPRESA); } catch { /* sin almacenamiento */ }
  }

  return (
    <div className="app">
      <header className="barra">
        <div className="marca"><span className="timbre-logo" aria-hidden>CT</span><span>Control Tributario</span></div>
        <div className="empresa"><strong>{empresa.razonSocial}</strong><span>RUT {empresa.rut}</span>
          <button className="enlace" onClick={cambiarEmpresa}>Cambiar</button></div>
        <button className="boton resumen" onClick={() => setVerResumen(true)} disabled={!docs.length && !f29s.length && !movs.length && !libros.length}
          title={docs.length || f29s.length ? 'Ver cómo va la empresa en el año' : 'Carga documentos para ver el resumen'}>Resumen del año</button>
      </header>

      <main>
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
            <div className="fichas">{fichas.map(f => <FichaDoc key={f.id} f={f} />)}</div>
          </section>
        )}

        <section className="libros">
          <h2>Compras y ventas cargadas</h2>
          {porPeriodo.length === 0 ? <p className="vacio">Todavía no hay documentos. Empieza por los RCV de compras y ventas del SII.</p> : (<>
            <table>
              <thead><tr><th>Mes</th><th className="n">Ventas netas</th><th className="n">Compras netas</th><th className="n">Diferencia</th><th className="n">Documentos</th></tr></thead>
              <tbody>{porPeriodo.map(p => (
                <tr key={p.periodo}><td>{periodoLegible(p.periodo)}</td><td className="n">{pesos(p.ventas)}</td><td className="n">{pesos(p.compras)}</td>
                  <td className={`n ${p.ventas - p.compras < 0 ? 'neg' : ''}`}>{pesos(p.ventas - p.compras)}</td><td className="n">{p.nV + p.nC}</td></tr>))}</tbody>
            </table>
            <details className="detalle"><summary>Ver los {docs.length} documentos</summary><TablaDocs docs={docs} /></details>
            <button className="enlace peligro" onClick={() => { if (confirm('¿Borrar todos los documentos y F29 cargados en este navegador?')) { setDocs([]); setF29s([]); } }}>Borrar documentos cargados</button>
          </>)}
        </section>

        {(docs.length > 0 || f29s.length > 0) && <PanelIVA docs={docs} f29s={f29s} libros={libros} honorarios={honorarios} />}
        {(libros.length > 0 || honorarios.length > 0) && <PanelPersonal libros={libros} honorarios={honorarios} movs={movs}
          onBorrar={() => { if (confirm('¿Borrar los libros de remuneraciones y los honorarios cargados?')) { setLibros([]); setHonorarios([]); } }} />}
        {movs.length > 0 && <PanelBanco movs={movs} docs={docs} f29s={f29s} reglas={reglas} libros={libros} rutEmpresa={empresa.rut}
          onCambio={(m, d, r) => { setMovs(m); if (d) setDocs(d); if (r) setReglas(r); }}
          onBorrar={() => { if (confirm('¿Borrar los movimientos del banco y las reglas? Las facturas marcadas como pagadas o cobradas vuelven a quedar pendientes.')) {
            setMovs([]); setReglas([]); setDocs(ds => ds.map(d => (d.fechaPago ? { ...d, estado: d.libro === 'VENTA' ? 'POR COBRAR' : 'POR PAGAR', fechaPago: undefined } : d))); } }} />}
      </main>

      {verResumen && <ResumenAnio docs={docs} f29s={f29s} movs={movs} libros={libros} honorarios={honorarios} empresa={empresa} onCerrar={() => setVerResumen(false)} />}
    </div>
  );
}

function FichaDoc({ f }: { f: Ficha }) {
  if (f.leyendo || !f.resultado) return (
    <article className="ficha leyendo"><p className="archivo">{f.archivo}</p><h3>Leyendo…</h3><p>Si es una foto o un PDF escaneado puede tardar un poco.</p></article>
  );
  const r = f.resultado, sello = SELLO[r.estado];
  return (
    <article className={`ficha ${sello.clase}`}>
      <span className={`sello ${sello.clase}`}>{sello.texto}</span>
      <h3>{r.titulo}</h3>
      <p>{r.mensaje}</p>
      {r.avisos.slice(0, 3).map((a, i) => <p key={i} className="aviso">{a}</p>)}
      <p className="archivo" title={r.archivo}>{r.archivo}</p>
    </article>
  );
}

function TablaDocs({ docs }: { docs: Documento[] }) {
  const [filtro, setFiltro] = useState('');
  const vis = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return (t ? docs.filter(d => `${d.razonSocial} ${d.rutContraparte} ${d.folio}`.toLowerCase().includes(t)) : docs).slice(0, 300);
  }, [docs, filtro]);
  return (<>
    <input className="buscar" placeholder="Buscar por nombre, RUT o folio" value={filtro} onChange={e => setFiltro(e.target.value)} />
    <div className="desliza"><table>
      <thead><tr><th>Libro</th><th>Tipo</th><th>Folio</th><th>Emisión</th><th>RUT</th><th>Razón social</th><th className="n">Neto</th><th className="n">IVA</th><th className="n">Total</th></tr></thead>
      <tbody>{vis.map(d => <tr key={d.clave}><td>{d.libro === 'VENTA' ? 'Venta' : 'Compra'}</td><td>{d.tipoDoc}</td><td>{d.folio}</td><td>{d.fechaEmision}</td><td>{d.rutContraparte}</td><td>{d.razonSocial}</td><td className="n">{pesos(d.neto)}</td><td className="n">{pesos(d.iva)}</td><td className="n">{pesos(d.total)}</td></tr>)}</tbody>
    </table></div>
    {docs.length > vis.length && <p className="vacio">Se muestran {vis.length} de {docs.length}; usa el buscador para encontrar otros.</p>}
  </>);
}

function Bienvenida({ onGuardar }: { onGuardar: (e: Empresa) => void }) {
  const [rut, setRut] = useState(''), [nombre, setNombre] = useState('');
  const ok = rutValido(rut) && nombre.trim().length > 1;
  return (
    <div className="app bienvenida">
      <div className="marca"><span className="timbre-logo" aria-hidden>CT</span><span>Control Tributario</span></div>
      <h1>Ordena la información tributaria de tu pyme</h1>
      <p className="bajada">Carga lo que ya descargas del SII y del banco: la app lo reconoce, lo cuadra y te muestra cómo va la empresa. Todo queda en tu navegador.</p>
      <form className="alta" onSubmit={e => { e.preventDefault(); if (ok) onGuardar({ rut: formatearRUT(rut), razonSocial: nombre.trim().toUpperCase() }); }}>
        <label>RUT de la empresa<input value={rut} onChange={e => setRut(e.target.value)} placeholder="77.777.777-7" inputMode="text" autoComplete="off" /></label>
        <label>Razón social<input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Empresa de prueba SpA" autoComplete="organization" /></label>
        <button className="boton grande" disabled={!ok}>Empezar</button>
        {rut && !rutValido(rut) && <p className="error">Ese RUT no es válido: revisa el dígito verificador.</p>}
      </form>
    </div>
  );
}
