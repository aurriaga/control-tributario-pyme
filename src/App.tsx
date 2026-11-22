import { useEffect, useMemo, useState } from 'react';
import { importarRCV, type Documento, type Empresa, type ResultadoImportacion } from './nucleo/rcv';
import { formatearRUT, rutValido } from './nucleo/rut';

// Los datos se guardan solo en este navegador (localStorage). Nada se envía a un servidor.
const CLAVE_EMPRESA = 'ctp.empresa', CLAVE_DOCS = 'ctp.documentos';
const leerLS = <T,>(k: string, def: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : def; } catch { return def; } };
const guardarLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento disponible */ } };
const $ = (n: number) => '$' + Math.round(n).toLocaleString('de-DE');
const signo = (d: Documento) => (d.tipoDoc === 61 ? -1 : 1);   // la nota de crédito resta

export default function App() {
  const [empresa, setEmpresa] = useState<Empresa | null>(() => leerLS<Empresa | null>(CLAVE_EMPRESA, null));
  const [docs, setDocs] = useState<Documento[]>(() => leerLS<Documento[]>(CLAVE_DOCS, []));
  const [mensajes, setMensajes] = useState<ResultadoImportacion[]>([]);
  const [filtro, setFiltro] = useState('');

  useEffect(() => guardarLS(CLAVE_DOCS, docs), [docs]);

  async function cargar(archivos: FileList | null) {
    if (!archivos || !empresa) return;
    const claves = new Set(docs.map(d => d.clave));
    const nuevos: Documento[] = [], res: ResultadoImportacion[] = [];
    for (const f of Array.from(archivos)) {
      const r = importarRCV(f.name, new Uint8Array(await f.arrayBuffer()), { empresas: [empresa], clavesExistentes: claves });
      res.push(r); nuevos.push(...r.documentos);
    }
    setDocs(d => [...d, ...nuevos]);
    setMensajes(res);
  }

  const resumen = useMemo(() => {
    const m = new Map<string, { libro: string; periodo: string; n: number; neto: number; iva: number; total: number }>();
    for (const d of docs) {
      const periodo = d.periodoRCV || d.fechaEmision.slice(0, 7);
      const k = d.libro + periodo;
      const r = m.get(k) ?? { libro: d.libro, periodo, n: 0, neto: 0, iva: 0, total: 0 };
      r.n++; r.neto += signo(d) * d.neto; r.iva += signo(d) * d.iva; r.total += signo(d) * d.total;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => (a.libro + a.periodo).localeCompare(b.libro + b.periodo));
  }, [docs]);

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return (f ? docs.filter(d => `${d.razonSocial} ${d.rutContraparte} ${d.folio}`.toLowerCase().includes(f)) : docs).slice(0, 300);
  }, [docs, filtro]);

  function cambiarEmpresa() {
    if (!confirm('¿Cambiar de empresa? Se borran los documentos cargados en este navegador.')) return;
    setEmpresa(null); setDocs([]);
    try { localStorage.removeItem(CLAVE_EMPRESA); } catch { /* sin almacenamiento */ }
  }

  return (
    <main>
      <header>
        <p className="kicker">CONTROL TRIBUTARIO · PYME</p>
        <h1>Registro de Compras y Ventas</h1>
        <p className="nota">Los archivos se procesan en este navegador. Nada se sube a internet.</p>
      </header>

      {!empresa ? <FormEmpresa onGuardar={e => { setEmpresa(e); guardarLS(CLAVE_EMPRESA, e); }} /> : (
        <section className="tarjeta fila">
          <div><strong>{empresa.razonSocial}</strong> · RUT {empresa.rut}</div>
          <button className="secundario" onClick={cambiarEmpresa}>Cambiar empresa</button>
        </section>
      )}

      {empresa && (
        <section className="tarjeta">
          <h2>1 · Cargar RCV del SII</h2>
          <p>Archivos CSV de "Descargar detalle" del Registro de Compras y Ventas. Puedes elegir varios a la vez; los repetidos se omiten.</p>
          <input type="file" accept=".csv,.txt" multiple onChange={e => { cargar(e.target.files); e.target.value = ''; }} />
          {mensajes.length > 0 && <ul className="mensajes">{mensajes.map((m, i) => <li key={i} className={m.error ? 'error' : ''}>{m.mensaje}</li>)}</ul>}
        </section>
      )}

      {docs.length > 0 && (<>
        <section className="tarjeta">
          <div className="fila"><h2>2 · Resumen por período</h2>
            <button className="secundario" onClick={() => { if (confirm('¿Borrar todos los documentos cargados?')) setDocs([]); }}>Borrar documentos</button></div>
          <table>
            <thead><tr><th>Libro</th><th>Período</th><th>Documentos</th><th>Neto</th><th>IVA</th><th>Total</th></tr></thead>
            <tbody>{resumen.map(r => <tr key={r.libro + r.periodo}><td>{r.libro === 'VENTA' ? 'Ventas' : 'Compras'}</td><td>{r.periodo}</td><td className="n">{r.n}</td><td className="n">{$(r.neto)}</td><td className="n">{$(r.iva)}</td><td className="n">{$(r.total)}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="tarjeta">
          <div className="fila"><h2>3 · Documentos ({docs.length})</h2>
            <input className="buscar" placeholder="Buscar por razón social, RUT o folio" value={filtro} onChange={e => setFiltro(e.target.value)} /></div>
          <table>
            <thead><tr><th>Libro</th><th>Tipo</th><th>Folio</th><th>Emisión</th><th>RUT</th><th>Razón social</th><th>Neto</th><th>IVA</th><th>Total</th><th>Observación</th></tr></thead>
            <tbody>{visibles.map(d => <tr key={d.clave}><td>{d.libro === 'VENTA' ? 'V' : 'C'}</td><td>{d.tipoDoc}</td><td>{d.folio}</td><td>{d.fechaEmision}</td><td>{d.rutContraparte}</td><td>{d.razonSocial}</td><td className="n">{$(d.neto)}</td><td className="n">{$(d.iva)}</td><td className="n">{$(d.total)}</td><td className="obs">{d.observacion}</td></tr>)}</tbody>
          </table>
          {docs.length > visibles.length && <p className="nota">Se muestran {visibles.length} de {docs.length}. Usa el buscador para ver otros.</p>}
        </section>
      </>)}
    </main>
  );
}

function FormEmpresa({ onGuardar }: { onGuardar: (e: Empresa) => void }) {
  const [rut, setRut] = useState(''), [nombre, setNombre] = useState('');
  const ok = rutValido(rut) && nombre.trim().length > 1;
  return (
    <section className="tarjeta">
      <h2>Empresa</h2>
      <p>Registra la empresa. Solo se importan los RCV cuyo nombre de archivo trae este RUT.</p>
      <div className="fila izq">
        <input placeholder="RUT (ej. 77.777.777-7)" value={rut} onChange={e => setRut(e.target.value)} />
        <input placeholder="Razón social" value={nombre} onChange={e => setNombre(e.target.value)} />
        <button disabled={!ok} onClick={() => onGuardar({ rut: formatearRUT(rut), razonSocial: nombre.trim().toUpperCase() })}>Guardar</button>
      </div>
      {rut && !rutValido(rut) && <p className="error">El RUT no es válido (revisa el dígito verificador).</p>}
    </section>
  );
}
