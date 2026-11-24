import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { signoDoc, esComisionLF, type Documento, type Empresa } from './nucleo/rcv';
import { aniosDisponibles, resumenAnual } from './nucleo/resumen';
import { resumenF29, type F29 } from './nucleo/f29';
import type { Movimiento } from './nucleo/cartola';
import { resumenPersonal, librosFaltantes, type LibroRemuneraciones, type MesHonorarios } from './nucleo/remuneraciones';
import { periodoLegible } from './nucleo/lector';
import { pesos } from './formato';
import { contabilidad, type ConfigContable, type Control } from './nucleo/contabilidad';
import Cascada from './Cascada';

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const millones = (n: number) => (n < 0 ? '−' : '') + '$' + (Math.abs(n) / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' M';

export default function ResumenAnio({ docs, f29s, movs, libros, honorarios, empresa, cfg, controles, onCerrar }: { docs: Documento[]; f29s: F29[]; movs: Movimiento[]; libros: LibroRemuneraciones[]; honorarios: MesHonorarios[]; empresa: Empresa; cfg: ConfigContable; controles: Control[]; onCerrar: () => void }) {
  const anios = useMemo(() => [...new Set([...aniosDisponibles(docs), ...f29s.map(f => Number(f.periodo.slice(0, 4)))])].sort((a, b) => b - a), [docs, f29s]);
  const [anio, setAnio] = useState(anios[0] ?? new Date().getFullYear());
  const r = useMemo(() => resumenAnual(docs, anio, { comisionLF: cfg.ivaComisionLF }), [docs, anio, cfg.ivaComisionLF]);
  const rf = useMemo(() => resumenF29(docs, f29s, anio, { comisionLF: cfg.ivaComisionLF }), [docs, f29s, anio, cfg.ivaComisionLF]);
  const banco = useMemo(() => {
    const delAnio = movs.filter(m => m.fecha.startsWith(String(anio))).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const porCobrar = docs.filter(d => d.libro === 'VENTA' && d.estado === 'POR COBRAR' && signoDoc(d.tipoDoc) > 0).reduce((a, d) => a + d.total, 0);
    const porPagar = docs.filter(d => d.libro === 'COMPRA' && d.estado === 'POR PAGAR' && signoDoc(d.tipoDoc) > 0 && !esComisionLF(d)).reduce((a, d) => a + d.total, 0);
    const sinIdentificar = delAnio.filter(m => m.estado === 'pendiente');
    return { n: delAnio.length, saldo: delAnio.length ? delAnio[delAnio.length - 1].saldo : null, porCobrar, porPagar,
      sinIdentificar: sinIdentificar.length, montoSinIdentificar: sinIdentificar.reduce((a, m) => a + m.abono + m.cargo, 0), conBanco: movs.length > 0 };
  }, [movs, docs, anio]);
  const personal = useMemo(() => {
    const meses = resumenPersonal(libros, honorarios, movs).filter(m => m.periodo.startsWith(String(anio)));
    const s = (k: 'haberes' | 'aporteEmpleador' | 'honorariosBruto') => meses.reduce((a, m) => a + (m[k] ?? 0), 0);
    return { hay: meses.length > 0, remuneraciones: s('haberes'), aporte: s('aporteEmpleador'), honorarios: s('honorariosBruto'),
      total: s('haberes') + s('aporteEmpleador') + s('honorariosBruto'), faltan: librosFaltantes(libros).filter(p => p.startsWith(String(anio))) };
  }, [libros, honorarios, movs, anio]);
  // Contabilidad del año: Estado de resultados de enero a diciembre y partidas por identificar al cierre
  const conta = useMemo(() => {
    const r = contabilidad({ empresa: empresa.rut, docs, f29s, movs, libros, honorarios }, cfg, `${anio}-01`, `${anio}-12`);
    const hay = r.diario.some(f => f.mes.startsWith(String(anio)));
    const transitorias = r.balance.filas.filter(f => f.transitoria).map(f => ({ cuenta: `${f.codigo} ${f.cuenta}`, saldo: f.deudor - f.acreedor })).filter(t => Math.abs(t.saldo) >= 1);
    return { hay, eerr: r.eerr, resultado: r.balance.resultado, transitorias, porIdentificar: transitorias.reduce((s, t) => s + Math.abs(t.saldo), 0) };
  }, [empresa, docs, f29s, movs, libros, honorarios, cfg, anio]);
  const revisar = controles.filter(c => c.estado === 'Revisar');
  const alertas = useMemo(() => [
    ...(revisar.length ? [{ nivel: 'falta' as const, texto: `${revisar.length} control${revisar.length > 1 ? 'es' : ''} en Revisar: ${revisar.map(c => c.nombre).join('; ')}.` }] : []),
    ...(conta.hay && conta.porIdentificar ? [{ nivel: 'revisar' as const, texto: `${pesos(conta.porIdentificar)} en partidas por identificar al cierre (${conta.transitorias.map(t => t.cuenta.replace(/ \(transitoria\)/, '')).join(', ')}): el resultado puede cambiar cuando se aclaren.` }] : []),
    ...(personal.faltan.length ? [{ nivel: 'falta' as const, texto: `Falta el libro de remuneraciones de ${personal.faltan.map(periodoLegible).join(', ')}.` }] : []),
    ...(banco.sinIdentificar ? [{ nivel: 'revisar' as const, texto: `${banco.sinIdentificar} movimientos del banco sin identificar (${pesos(banco.montoSinIdentificar)} entre cargos y abonos).` }] : []),
    ...rf.conDiferencias.map(p => ({ nivel: 'falta' as const, texto: `El F29 de ${periodoLegible(p)} no cuadra con el RCV: revisa la sección IVA y F29.` })),
    ...(rf.sinF29.length ? [{ nivel: 'revisar' as const, texto: `Sin F29 cargado: ${rf.sinF29.map(periodoLegible).join(', ')}.` }] : []),
    ...r.alertas,
  ], [r, rf, banco, personal, conta, revisar]);
  const tope = Math.max(1, ...r.meses.map(m => Math.max(m.ventas, m.compras)));

  function descargarExcel() {
    const libro = XLSX.utils.book_new();
    const filas = [['Mes', 'Ventas netas', 'Compras netas', 'Diferencia', 'IVA débito', 'IVA crédito', 'Documentos de venta', 'Documentos de compra'],
      ...r.meses.map((m, i) => [`${MES[i]} ${anio}`, m.ventas, m.compras, m.ventas - m.compras, m.ivaDebito, m.ivaCredito, m.docsVenta, m.docsCompra]),
      ['Total', r.ventas, r.compras, r.margen, r.ivaDebito, r.ivaCredito, '', '']];
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Resumen mensual');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Cliente', 'RUT', 'Ventas netas', 'Participación'], ...r.clientes.map(c => [c.nombre, c.rut, c.monto, c.participacion])]), 'Principales clientes');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Proveedor', 'RUT', 'Compras netas', 'Participación'], ...r.proveedores.map(c => [c.nombre, c.rut, c.monto, c.participacion])]), 'Principales proveedores');
    if (conta.hay) XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Concepto', 'Monto'], ...conta.eerr.map(l => [l.concepto, l.monto])]), 'Estado de resultados');
    XLSX.writeFile(libro, `Resumen_${anio}.xlsx`);
  }

  return (
    <div className="velo" role="dialog" aria-modal="true" aria-labelledby="titulo-resumen" onKeyDown={e => e.key === 'Escape' && onCerrar()}>
      <article className="resumen-hoja">
        <header className="resumen-cab">
          <div>
            <p className="resumen-empresa">{empresa.razonSocial}, RUT {empresa.rut}</p>
            <h2 id="titulo-resumen">Cómo va {anio}</h2>
          </div>
          <div className="resumen-acciones no-imprimir">
            {anios.length > 1 && <select value={anio} onChange={e => setAnio(Number(e.target.value))} aria-label="Año">{anios.map(a => <option key={a}>{a}</option>)}</select>}
            <button className="boton" onClick={() => window.print()}>Descargar PDF</button>
            <button className="boton secundario" onClick={descargarExcel}>Descargar Excel</button>
            <button className="cerrar" onClick={onCerrar} aria-label="Cerrar el resumen" autoFocus>×</button>
          </div>
        </header>

        <p className="veredicto">
          Vendiste <strong>{millones(r.ventas)}</strong> y compraste <strong>{millones(r.compras)}</strong> en neto.
          {r.margenPct !== null && <> Lo que queda después de las compras es <strong className={r.margen < 0 ? 'neg' : ''}>{millones(r.margen)}</strong>, un {Math.round(r.margenPct * 100)}% de las ventas.</>}
          {personal.hay ? <> Con el personal ({millones(personal.total)} entre sueldos, aporte del empleador y honorarios) queda <strong className={r.margen - personal.total < 0 ? 'neg' : ''}>{millones(r.margen - personal.total)}</strong>, antes de los gastos sin factura.</>
            : <>{' '}Aún no incluye sueldos, honorarios ni gastos sin factura.</>}
          {conta.hay && <> Según la contabilidad, el año va con una <strong className={conta.resultado < 0 ? 'neg' : ''}>{conta.resultado >= 0 ? 'utilidad' : 'pérdida'} de {millones(Math.abs(conta.resultado))}</strong>.</>}
        </p>

        <div className="cifras">
          <div><span>Ventas netas</span><b>{pesos(r.ventas)}</b></div>
          <div><span>Compras netas</span><b>{pesos(r.compras)}</b></div>
          <div><span>IVA débito menos crédito</span><b className={r.ivaNeto < 0 ? 'neg' : ''}>{pesos(r.ivaNeto)}</b><small>{r.ivaNeto >= 0 ? 'a pagar antes de remanentes y PPM' : 'queda como remanente'}</small></div>
          <div><span>Documentos</span><b>{r.documentos.toLocaleString('de-DE')}</b></div>
          {rf.cargados > 0 && <>
            <div><span>Pagado en F29</span><b>{pesos(rf.totalPagado)}</b><small>{rf.cargados} F29: IVA {pesos(rf.ivaPagado)} y PPM {pesos(rf.ppm)}</small></div>
            <div><span>F29 que cuadran con el RCV</span><b className={rf.conDiferencias.length ? 'neg' : ''}>{rf.cuadran} de {rf.cargados}</b></div>
          </>}
          {personal.hay && <div><span>Costo del personal</span><b>{pesos(personal.total)}</b><small>sueldos {pesos(personal.remuneraciones)}, aporte {pesos(personal.aporte)} y honorarios {pesos(personal.honorarios)}</small></div>}
          {banco.conBanco && <>
            <div><span>Saldo en el banco</span><b>{banco.saldo === null ? '—' : pesos(banco.saldo)}</b><small>último movimiento cargado</small></div>
            <div><span>Por cobrar</span><b>{pesos(banco.porCobrar)}</b><small>facturas de venta sin cobro en el banco</small></div>
            <div><span>Por pagar</span><b>{pesos(banco.porPagar)}</b><small>facturas de compra sin pago en el banco</small></div>
          </>}
        </div>

        <section className="grafico" aria-label="Ventas y compras por mes">
          <div className="leyenda"><span className="v">Ventas</span><span className="c">Compras</span></div>
          <div className="barras">
            {r.meses.map((m, i) => (
              <div className="mes" key={m.periodo} title={`${MES[i]}: ventas ${pesos(m.ventas)}, compras ${pesos(m.compras)}`}>
                <div className="par">
                  <i className="v" style={{ height: `${Math.max(0, m.ventas) / tope * 100}%` }} />
                  <i className="c" style={{ height: `${Math.max(0, m.compras) / tope * 100}%` }} />
                </div>
                <span>{MES[i]}</span>
              </div>
            ))}
          </div>
        </section>

        {conta.hay && <section className="resultado-anio">
          <h3>De las ventas al resultado</h3>
          <Cascada eerr={conta.eerr} />
          <p className="nota-borrador">Sale del Libro Diario de {anio}: compras por categoría, sueldos y honorarios centralizados, gastos del banco sin factura, depreciación y ajustes manuales.{conta.porIdentificar ? ` Hay ${pesos(conta.porIdentificar)} en partidas por identificar que todavía no entran al resultado.` : ''}</p>
        </section>}

        <div className="dos">
          <Ranking titulo="Principales clientes" filas={r.clientes} />
          <Ranking titulo="Principales proveedores" filas={r.proveedores} />
        </div>

        <section className="alertas">
          <h3>Para revisar</h3>
          {alertas.length === 0 ? <p>No hay alertas con lo cargado hasta ahora.</p>
            : <ul>{alertas.map((a, i) => <li key={i} className={a.nivel}>{a.texto}</li>)}</ul>}
        </section>
      </article>
    </div>
  );
}

function Ranking({ titulo, filas }: { titulo: string; filas: { rut: string; nombre: string; monto: number; participacion: number }[] }) {
  return (
    <section className="ranking">
      <h3>{titulo}</h3>
      {filas.length === 0 ? <p className="vacio">Sin datos.</p> : <ol>{filas.map(f => (
        <li key={f.rut}><span className="nombre">{f.nombre}</span><span className="pct">{Math.round(f.participacion * 100)}%</span>
          <span className="pista"><i style={{ width: `${Math.max(2, f.participacion * 100)}%` }} /></span></li>))}</ol>}
    </section>
  );
}
