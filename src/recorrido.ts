// Recorrido guiado "¿Cómo funciona?": marca cada parte de la pantalla y la explica en palabras simples.
// Si una parte todavía no aparece (por ejemplo, sin documentos cargados), el globo se muestra al centro igual.
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const clic = (e: Element | null | undefined) => (e as HTMLElement | null)?.click();
const pestana = (t: string) => clic([...document.querySelectorAll('.conta .pestanas button')].find(b => b.textContent === t));
const arriba = (s: string) => $(s)?.scrollIntoView({ block: 'start' });
const LIBROS = 'main > section.libros:not(.panel-mes):not(.iva):not(.personal):not(.banco):not(.conta)';

interface Paso { sel?: string; titulo: string; texto: string; antes?: () => void }

const PASOS: Paso[] = [
  { titulo: '¡Hola! Esto es tu cuaderno mágico', texto: 'Una empresa recibe y entrega muchos papeles: facturas, la cartola del banco, los sueldos, los impuestos. Esta app es como un cuaderno mágico: le das esos papeles y ella los lee, los ordena, los suma y te avisa si algo no calza. Vamos a recorrerla parte por parte. Usa "Siguiente" (o la flecha →) cuando quieras seguir.' },
  { sel: '.barra', titulo: 'Arriba: de quién es el cuaderno', texto: 'Aquí dice de qué empresa es todo: su nombre y su RUT. El RUT es como el carnet de la empresa: si está mal escrito, la app rechaza los papeles porque cree que son de otra empresa. "Guardar respaldo" saca una foto de todo el cuaderno para guardarla o llevarla a otro computador, y "Abrir respaldo" la vuelve a poner.', antes: () => scrollTo({ top: 0 }) },
  { sel: '.bandeja', titulo: 'El buzón de papeles (Lector de documentos)', texto: 'Este es el buzón. Arrastras aquí los archivos que bajas del SII, del banco o del sistema de sueldos (Excel, CSV, PDF y hasta fotos). La app los mira por dentro, adivina qué papel es cada uno y le pone un timbre: verde "Cargado" si lo entendió, amarillo si es de otra empresa y rojo si no lo reconoce.' },
  { sel: '.panel-mes .avance', titulo: 'Panel del mes: qué papeles llegaron', texto: 'Estas pastillas son como una lista de tareas del mes. Las que tienen el círculo verde ya llegaron (RCV de ventas, RCV de compras, F29, cartola, libro de sueldos). Las punteadas son papeles que todavía faltan. Arriba puedes cambiar el mes. (Aparece cuando ya cargaste algún papel.)', antes: () => arriba('.panel-mes') },
  { sel: '.panel-mes .cifras', titulo: 'Los números del mes', texto: 'Aquí ves, en grande, lo más importante del mes: cuánto vendiste y compraste sin IVA, cuánto IVA quedó (lo que se le debe o no al Estado), el F29, cuánta plata había en el banco al cerrar el mes y cuánto se pagó en sueldos.' },
  { sel: '.panel-mes .controles-cab', titulo: 'El semáforo: 17 revisiones', texto: 'La app hace 17 revisiones solita, como un profesor que corrige la tarea. Verde "OK" = está bien. Amarillo "Pendiente" = falta algo por hacer. Rojo "Revisar" = algo no calza y hay que mirarlo. La barra verde muestra cuántas están bien, y abajo te dice qué revisar y qué hacer.' },
  { sel: LIBROS, titulo: 'Compras y ventas', texto: 'Aquí están todas las facturas de compra y de venta, sumadas por mes. Si abres "Ver los documentos" ves cada factura. Si una factura no existe en el SII, con "Anular" la apartas: deja de contar en todo, pero no se borra, y la puedes reactivar.', antes: () => arriba(LIBROS) },
  { sel: '.iva', titulo: 'IVA y F29: la cuenta con el SII', texto: 'Cuando vendes, una parte del precio (el IVA) es del Estado; cuando compras, pagas IVA que después puedes descontar. Cada mes se declara en el formulario F29. Esta tabla compara mes por mes lo que dicen tus facturas con lo que declaraste: "Cuadra" = coinciden al peso. Más abajo la app te arma un borrador del próximo F29.', antes: () => arriba('.iva') },
  { sel: '.personal', titulo: 'Personal: sueldos y honorarios', texto: 'Aquí van los libros de sueldos de cada mes y las boletas de honorarios. La app revisa que cada sueldo cuadre y calcula lo que la empresa pone encima del sueldo (el aporte del empleador), mirando lo que se pagó a PREVIRED.', antes: () => arriba('.personal') },
  { sel: '.banco', titulo: 'El banco: la alcancía', texto: 'Esta es la alcancía de la empresa: cada peso que entra o sale del banco. La app trata de adivinar qué es cada movimiento: qué factura paga, si es un impuesto o un sueldo. El porcentaje de arriba dice cuántos movimientos ya sabe qué son.', antes: () => arriba('.banco') },
  { sel: '.banco details', titulo: 'Los movimientos que hay que explicarle', texto: 'Aquí quedan los movimientos que la app no sabe qué son. A cada uno le puedes decir qué es: 1) una clasificación (por ejemplo, retiro de socios o comisión del banco), 2) cualquier cuenta del plan de cuentas, 3) una cuenta nueva que creas ahí mismo, o 4) "Asociar a facturas": buscas la factura que paga y la marcas. Si dejas marcado "Recordar", la próxima vez lo hace sola.',
    antes: () => { const d = $<HTMLDetailsElement>('.banco details'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } } },
  { sel: '.conta .pestanas', titulo: 'Contabilidad: el cuaderno ordenado', texto: 'Con todo lo anterior la app escribe sola el Libro Diario: cada movimiento anotado en su cuenta, con el debe igual al haber (como una balanza que siempre queda pareja). Estas pestañas son las distintas formas de mirar ese cuaderno.', antes: () => { pestana('Revisión'); arriba('.conta'); } },
  { sel: '.conta .eerr', titulo: 'Estado de resultados: ¿ganamos o perdimos?', texto: 'Parte de lo que vendiste, le resta lo que costó, los gastos, los sueldos y la depreciación, y al final dice si la empresa ganó (utilidad) o perdió plata (pérdida) en esos meses. Arriba eliges los meses.', antes: () => { pestana('Estado de resultados'); setTimeout(() => arriba('.conta'), 50); } },
  { sel: '.conta .balance', titulo: 'Balance de 8 columnas', texto: 'Es la "radiografía" de todas las cuentas: cuánto entró y salió de cada una y cuánto le queda. El sello verde "Cuadra" significa que todo está parejo. Las cuentas en rojo son "por aclarar": plata que todavía no sabemos bien qué es.', antes: () => pestana('Balance') },
  { sel: '.conta .diario', titulo: 'Libro Diario', texto: 'Aquí está cada anotación, una por una, con su fecha, su cuenta y su explicación. Puedes filtrar por origen (ventas, compras, banco…) o buscar una palabra.', antes: () => pestana('Libro Diario') },
  { sel: '.boton.resumen', titulo: 'Resumen del año', texto: 'Este botón abre una hoja con cómo va todo el año: ventas, compras, una cascada que baja desde las ventas hasta la ganancia o pérdida, los principales clientes y proveedores, y una lista de cosas para revisar. Se puede descargar en PDF o Excel. Al apretar "Siguiente" lo abro.', antes: () => { pestana('Revisión'); scrollTo({ top: 0 }); } },
  { sel: '.resumen-hoja .resultado-anio', titulo: 'La cascada del año', texto: 'Mira: la barra verde son las ventas; cada barra roja es algo que se resta; las azules son los subtotales. La última barra es el resultado del año. Así se ve de un vistazo dónde se va la plata.',
    antes: () => { const b = $<HTMLButtonElement>('.boton.resumen'); if (b && !b.disabled) b.click(); setTimeout(() => $('.resumen-hoja .resultado-anio')?.scrollIntoView({ block: 'center' }), 300); } },
  { titulo: '¡Listo! Ya conoces la app', texto: 'Resumen: 1) tiras los papeles al buzón, 2) miras el panel del mes y el semáforo, 3) le explicas a la app los movimientos del banco que no entiende, 4) la contabilidad se arma sola y 5) el Resumen del año te cuenta cómo va todo. Puedes volver a ver este recorrido cuando quieras con "¿Cómo funciona?".',
    antes: () => { clic($('.velo .cerrar')); scrollTo({ top: 0 }); } },
];

let i = 0;
const marco = () => $('#recorrido-marco'), globo = () => $('#recorrido-globo');

function teclas(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') mostrar(i + 1);
  else if (e.key === 'ArrowLeft') mostrar(i - 1);
  else if (e.key === 'Escape') cerrarRecorrido();
}

function ubicar() {
  const m = marco(), g = globo(); if (!m || !g) return;
  const p = PASOS[i], el = p.sel ? $(p.sel) : null;
  if (!el || el.getBoundingClientRect().height === 0) {
    m.style.display = 'none'; g.classList.add('centro'); g.style.left = ''; g.style.top = ''; return;
  }
  g.classList.remove('centro');
  const r = el.getBoundingClientRect();
  Object.assign(m.style, { display: 'block', left: `${r.left + scrollX - 8}px`, top: `${r.top + scrollY - 8}px`, width: `${r.width + 16}px`, height: `${Math.min(r.height, innerHeight * 0.7) + 16}px` });
  const gw = g.offsetWidth, gh = g.offsetHeight;
  let left = Math.min(Math.max(16, r.right - gw), innerWidth - gw - 16), top = r.bottom + 20;
  if (top + gh > innerHeight - 16) top = r.top - gh - 20;
  if (top < 16) { top = innerHeight - gh - 16; left = Math.max(16, innerWidth - gw - 24); }
  g.style.left = `${left}px`; g.style.top = `${top}px`;
}

function boton(texto: string, clase: string, accion: () => void) {
  const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.onclick = accion; return b;
}

function mostrar(n: number) {
  if (n >= PASOS.length) { cerrarRecorrido(); return; }
  if (n < 0) return;
  i = n;
  const p = PASOS[i];
  try { p.antes?.(); } catch { /* una parte que no existe no detiene el recorrido */ }
  setTimeout(() => {
    const g = globo(); if (!g) return;
    if (!p.antes && p.sel) $(p.sel)?.scrollIntoView({ block: 'center' });
    const h = document.createElement('h3'); h.id = 'recorrido-titulo'; h.textContent = p.titulo;
    const t = document.createElement('p'); t.textContent = p.texto;
    const pie = document.createElement('div'); pie.className = 'pie';
    const cuenta = document.createElement('span'); cuenta.className = 'cuenta'; cuenta.textContent = `${i + 1} de ${PASOS.length}`;
    pie.append(cuenta);
    if (i > 0) pie.append(boton('Anterior', 'ant', () => mostrar(i - 1)));
    pie.append(boton('Salir', 'salir', cerrarRecorrido));
    const sig = boton(i === PASOS.length - 1 ? 'Terminar' : 'Siguiente', 'sig', () => mostrar(i + 1));
    pie.append(sig);
    g.replaceChildren(h, t, pie);
    sig.focus({ preventScroll: true });
    setTimeout(ubicar, 450);
  }, p.antes ? 400 : 0);
}

export function cerrarRecorrido() {
  marco()?.remove(); globo()?.remove();
  document.removeEventListener('keydown', teclas);
  removeEventListener('scroll', ubicar); removeEventListener('resize', ubicar);
}

export function iniciarRecorrido() {
  cerrarRecorrido();
  const m = document.createElement('div'); m.id = 'recorrido-marco'; m.setAttribute('aria-hidden', 'true');
  const g = document.createElement('div'); g.id = 'recorrido-globo'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-labelledby', 'recorrido-titulo'); g.setAttribute('aria-live', 'polite');
  document.body.append(m, g);
  document.addEventListener('keydown', teclas);
  addEventListener('scroll', ubicar, { passive: true }); addEventListener('resize', ubicar);
  mostrar(0);
}
