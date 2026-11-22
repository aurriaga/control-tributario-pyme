// Robot contable en la línea de comandos (lo usa el agente Riffo-Contador). Lee una carpeta con los documentos de la
// empresa, aplica la memoria contable, acepta los cruces seguros y deja escritas las dudas, un informe y un respaldo que
// la app abre con "Abrir respaldo". Los datos y la memoria quedan en las rutas que se indiquen: nada se sube a internet.
//
//   npm run robot -- revisar  --carpeta <dir> --memoria <memoria.json> --salida <dir> [--rut 77.777.777-7 --nombre "EMPRESA"]
//   npm run robot -- aprender --memoria <memoria.json> --decision '<json>'      (o --decisiones <archivo.json> con una lista)
//   npm run robot -- memoria  --memoria <memoria.json>                          (muestra reglas y decisiones guardadas)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { leerArchivo } from '../src/nucleo/lector';
import { textoDePdf, type PdfJs } from '../src/nucleo/pdfTexto';
import type { Documento } from '../src/nucleo/rcv';
import type { Movimiento } from '../src/nucleo/cartola';
import type { F29 } from '../src/nucleo/f29';
import type { LibroRemuneraciones, MesHonorarios } from '../src/nucleo/remuneraciones';
import { formatearRUT, rutValido } from '../src/nucleo/rut';
import { controlesGenerales } from '../src/nucleo/controles';
import { crearRespaldo } from '../src/nucleo/panel';
import { memoriaNueva, validarMemoria, revisar, aprender, type Decision, type MemoriaContable, type Datos } from '../src/nucleo/robot';
import { PLAN_BASE } from '../src/nucleo/contabilidad';
import { CATEGORIAS } from '../src/nucleo/cruce';

const args = process.argv.slice(2).filter(a => a !== '--');
const cmd = args[0];
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const salir = (msg: string): never => { console.error(`ERROR: ${msg}`); process.exit(1); };
const $ = (n: number) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('de-DE');
const EXT = new Set(['.csv', '.txt', '.xlsx', '.xls', '.pdf']);     // el .xlsm de macros no se lee

/** Lee texto quitando el BOM que agrega PowerShell 5.1 al guardar en UTF-8. */
const leerTexto = (ruta: string) => readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '');
function leerMemoria(ruta: string): MemoriaContable {
  try { return validarMemoria(JSON.parse(leerTexto(ruta))); } catch (e) { return salir(`No se pudo leer la memoria ${ruta}: ${(e as Error).message}`); }
}
/** Guarda la memoria solo si cambió, dejando la versión anterior al lado (memoria_contable.anterior.json). */
function guardarMemoria(ruta: string, m: MemoriaContable) {
  const nuevo = JSON.stringify(m, null, 1);
  if (existsSync(ruta) && leerTexto(ruta) === nuevo) return false;
  mkdirSync(dirname(resolve(ruta)), { recursive: true });
  if (existsSync(ruta)) copyFileSync(ruta, ruta.replace(/\.json$/i, '') + '.anterior.json');
  writeFileSync(ruta, nuevo);
  return true;
}
/** Antes de reescribir un resultado, guarda el de la corrida anterior (informe.anterior.md, dudas.anterior.json). */
function conAnterior(ruta: string, contenido: string) {
  if (existsSync(ruta)) copyFileSync(ruta, ruta.replace(/(\.\w+)$/, '.anterior$1'));
  writeFileSync(ruta, contenido);
}

async function cmdRevisar() {
  const carpeta = opt('carpeta') ?? salir('Falta --carpeta'), rutaMem = opt('memoria') ?? salir('Falta --memoria'), salida = opt('salida') ?? salir('Falta --salida');
  let mem: MemoriaContable;
  if (existsSync(rutaMem)) mem = leerMemoria(rutaMem);
  else {
    const rut = formatearRUT(opt('rut') ?? salir('La memoria no existe: indica --rut y --nombre de la empresa para crearla.'));
    if (!rutValido(rut)) salir(`El RUT ${rut} no es válido.`);
    mem = memoriaNueva({ rut, razonSocial: (opt('nombre') ?? 'EMPRESA').toUpperCase() });
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  const servicios = { textoPDF: (b: Uint8Array) => textoDePdf(pdfjs as unknown as PdfJs, b) };

  const d: Datos = { docs: [], f29s: [], movs: [], libros: [], honorarios: [] };
  const claves = new Set<string>(), vistos = new Set<string>(), leidos: string[] = [], omitidos: string[] = [];
  const archivos = readdirSync(carpeta).filter(f => EXT.has(extname(f).toLowerCase()) && statSync(join(carpeta, f)).isFile()).sort();
  for (const f of archivos) {
    const r = await leerArchivo(f.replace(/ \(\d+\)(?=\.\w+$)/, ''), new Uint8Array(readFileSync(join(carpeta, f))), { empresas: [mem.empresa], clavesExistentes: claves, servicios });
    if (r.estado !== 'leido') { omitidos.push(`${f}: ${r.titulo} (${r.estado === 'otra_empresa' ? 'otra empresa' : r.mensaje.slice(0, 90)})`); continue; }
    leidos.push(`${f}: ${r.titulo}`);
    d.docs.push(...r.documentos); r.documentos.forEach(x => claves.add(x.clave));
    for (const m of r.movimientos ?? []) if (!vistos.has(m.clave)) { vistos.add(m.clave); d.movs.push(m); }
    if (r.f29) d.f29s.push(r.f29);
    if (r.libro) { d.libros = d.libros.filter(l => l.periodo !== r.libro!.periodo); d.libros.push(r.libro); }
    if (r.honorarios) d.honorarios = [...d.honorarios.filter(h => !h.periodo.startsWith(r.honorarios!.anio)), ...r.honorarios.meses];
  }
  d.libros.sort((a, b) => a.periodo.localeCompare(b.periodo));

  const r = revisar(d, mem);
  const memoriaCambio = guardarMemoria(rutaMem, r.mem);
  const a = r.aplicada;
  const controles = controlesGenerales({ empresa: mem.empresa.rut, docs: a.docs, f29s: d.f29s, movs: a.movs, libros: d.libros, honorarios: d.honorarios, utm: r.mem.utm ?? {} }, a.cfg);
  mkdirSync(salida, { recursive: true });
  const rutaDudas = join(salida, 'dudas.json');
  const dudasAntes = existsSync(rutaDudas) ? (JSON.parse(leerTexto(rutaDudas)) as unknown[]).length : null;
  conAnterior(rutaDudas, JSON.stringify(r.dudas, null, 1));
  writeFileSync(join(salida, 'respaldo_app.json'), JSON.stringify(crearRespaldo(respaldoApp(r.mem, a.docs, d, a.movs, a.cfg))));
  const b = r.conta.balance, ok = controles.filter(c => c.estado === 'OK').length;
  const porTipo = (t: string) => r.dudas.filter(x => x.tipo === t).length;
  const informe = [
    `# Revisión contable: ${mem.empresa.razonSocial} (RUT ${mem.empresa.rut})`, '',
    `Corrida del ${new Date().toLocaleString('es-CL')}. Carpeta: ${resolve(carpeta)}.`, '',
    '## Lo que se leyó', '', `${leidos.length} archivos leídos y ${omitidos.length} omitidos.`,
    `${d.docs.length} documentos del RCV, ${d.f29s.length} F29, ${d.movs.length} movimientos del banco, ${d.libros.length} libros de remuneraciones y ${d.honorarios.length} meses de honorarios.`, '',
    ...leidos.map(x => `- ${x}`), ...(omitidos.length ? ['', 'Omitidos:', ...omitidos.map(x => `- ${x}`)] : []), '',
    '## Lo que aplicó la memoria', '',
    `- ${a.cuenta.decisiones} movimientos con decisión guardada, ${a.cuenta.conciliados} conciliados con su factura y ${a.cuenta.reglas} clasificados por regla (${r.mem.reglas.filter(x => x.activa).length} reglas activas).`,
    `- ${a.cuenta.pagos} documentos pagados o cobrados, ${a.cuenta.categorias} con categoría propia, ${Object.keys(r.mem.provCategoria).length} proveedores con categoría y ${a.cuenta.anulados} anulados.`,
    `- ${r.altasAceptadas} cruces nuevos de confianza alta aceptados solos${r.mem.politica.aceptarCrucesAlta ? '' : ' (desactivado)'}.`, '',
    '## Resultado', '',
    `- Libro Diario: ${r.conta.asientos.length.toLocaleString('de-DE')} asientos, ${r.conta.diario.length.toLocaleString('de-DE')} líneas; balance ${b.cuadra ? 'cuadra' : 'NO cuadra'}.`,
    `- ${b.resultado >= 0 ? 'Utilidad' : 'Pérdida'} del período: ${$(b.resultado)}.`,
    ...r.conta.eerr.map(l => `  - ${l.concepto}: ${$(l.monto)}`), '',
    `## Controles: ${ok} de ${controles.length} en orden`, '',
    ...controles.map(c => `- **${c.estado}** ${c.nombre}: ${c.resultado}${c.accion ? ` _${c.accion}_` : ''}`), '',
    `## Dudas para preguntar: ${r.dudas.length}`, '',
    `${porTipo('movimiento')} grupos de movimientos sin identificar, ${porTipo('cruce')} cruces por confirmar, ${porTipo('categoria')} proveedores sin categoría y ${porTipo('documento')} documentos con observaciones. Detalle en dudas.json.`, '',
    'Para ver todo en la app: "Abrir respaldo" y elegir respaldo_app.json (reemplaza lo que haya en ese navegador).',
  ].join('\n');
  conAnterior(join(salida, 'informe.md'), informe);
  console.log(JSON.stringify({ memoriaCambio, dudasAntes, archivosLeidos: leidos.length, omitidos: omitidos.length, documentos: d.docs.length, movimientos: d.movs.length,
    resultado: b.resultado, cuadra: b.cuadra, controlesOK: `${ok}/${controles.length}`, altasAceptadas: r.altasAceptadas,
    dudas: { total: r.dudas.length, movimiento: porTipo('movimiento'), cruce: porTipo('cruce'), categoria: porTipo('categoria'), documento: porTipo('documento') },
    salida: resolve(salida) }, null, 1));
}

function respaldoApp(mem: MemoriaContable, docs: Documento[], d: Datos, movs: Movimiento[], cfg: ReturnType<typeof revisar>['aplicada']['cfg']) {
  const datos: Record<string, unknown> = {
    'ctp.empresa': mem.empresa, 'ctp.documentos': docs, 'ctp.f29': d.f29s as F29[], 'ctp.movimientos': movs, 'ctp.reglas': [],
    'ctp.libros': d.libros as LibroRemuneraciones[], 'ctp.honorarios': d.honorarios as MesHonorarios[], 'ctp.utm': mem.utm ?? {}, 'ctp.contabilidad': cfg,
  };
  return datos;
}

function cmdAprender() {
  const rutaMem = opt('memoria') ?? salir('Falta --memoria');
  const texto = opt('decision') ?? (opt('decisiones') ? leerTexto(opt('decisiones')!) : salir('Falta --decision o --decisiones'));
  let lista: Decision[];
  try { const x = JSON.parse(texto); lista = Array.isArray(x) ? x : [x]; } catch { return salir('La decisión no es JSON válido.'); }
  let mem = leerMemoria(rutaMem);
  const hechas: string[] = [], errores: string[] = [];
  for (const dec of lista) {
    try { mem = aprender(mem, dec, opt('fuente') ?? 'usuario'); hechas.push(mem.historial[mem.historial.length - 1].que); }
    catch (e) { errores.push(`${JSON.stringify(dec).slice(0, 120)} → ${(e as Error).message}`); }
  }
  if (hechas.length) guardarMemoria(rutaMem, mem);
  console.log(JSON.stringify({ aprendidas: hechas, errores }, null, 1));
  if (errores.length) process.exitCode = 2;
}

function cmdMemoria() {
  const m = leerMemoria(opt('memoria') ?? salir('Falta --memoria'));
  const plan = m.plan ?? PLAN_BASE;
  console.log(JSON.stringify({ empresa: m.empresa, politica: m.politica, reglas: m.reglas,
    clasificacionesBanco: [...CATEGORIAS], categoriasGasto: [...new Set(plan.map(c => c.categoria).filter(Boolean))],
    decisiones: Object.keys(m.movimientos).length, conciliados: Object.keys(m.conciliados).length, pagos: Object.keys(m.pagos).length,
    proveedores: m.provCategoria, anulados: m.anulados, apertura: m.apertura ? `${m.apertura.lineas.length} líneas al ${m.apertura.fecha}` : null,
    manuales: m.manuales.length, ultimos: m.historial.slice(-15) }, null, 1));
}

if (cmd === 'revisar') await cmdRevisar();
else if (cmd === 'aprender') cmdAprender();
else if (cmd === 'memoria') cmdMemoria();
else salir('Comandos: revisar, aprender, memoria (ver el encabezado de robot/robot.ts).');
