// Noticias tributarias: circulares y resoluciones que publica el SII (sii.cl > Normativa y legislación). Un robot las lee
// cada semana (robot/actualizar-normativa.ts) y las deja en public/noticias.json; la app las muestra y Riffo Junior hace el
// resumen con el texto oficial de cada una ("materia"), sin inventar contenido.
export interface Noticia {
  tipo: 'Circular' | 'Resolución'; numero: string; fecha: string; titulo: string; materia: string; fuente: string; enlace: string;
  rutina: boolean;     // publicaciones que se repiten cada mes (UF, reajustes y multas, tablas del impuesto único)
}
export interface Noticias { actualizado: string; items: Noticia[] }

const ENTIDADES: Record<string, string> = { aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó',
  Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', deg: '°', ordm: 'º', ordf: 'ª', nbsp: ' ', amp: '&', quot: '"', laquo: '«', raquo: '»', ndash: '–', mdash: '—', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…' };
export const desentidad = (s: string) => s.replace(/&(#\d+|[a-zA-Z]+);/g, (m, e: string) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : ENTIDADES[e] ?? m))
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// De rutina o de un solo contribuyente: no cambian las reglas para las pymes en general
const RUTINA = /(reajustes y multas|unidad de fomento|impuesto [uú]nico de segunda categor[ií]a|tabla de c[aá]lculos|contribuyentes? que se indican?|empresas? que se indican?|entidad(es)? que (se )?indican?)/i;

/** Lee el índice anual de circulares o resoluciones del SII (h5 con el enlace y el título, p con la materia, span con la fuente). */
export function leerIndiceSII(html: string, base: string): Noticia[] {
  const out: Noticia[] = [];
  const re = /<h5[^>]*>\s*<a href='([^']+)'[^>]*>([^<]+)<\/a>\s*<\/h5>\s*<p[^>]*>([\s\S]*?)<\/p>\s*(?:<span[^>]*>\s*<i>([\s\S]*?)<\/i>)?/g;
  for (const m of html.matchAll(re)) {
    const titulo = desentidad(m[2]), materia = desentidad(m[3]);
    const f = titulo.toLowerCase().match(/(\d{1,2}) de ([a-záéíóú]+) del? (\d{4})/);
    const mes = f ? MESES.indexOf(f[2]) + 1 : 0;
    out.push({ tipo: /resoluci/i.test(titulo) ? 'Resolución' : 'Circular', numero: titulo.match(/N[°º]\s*(\d+)/)?.[1] ?? '',
      fecha: f && mes ? `${f[3]}-${String(mes).padStart(2, '0')}-${f[1].padStart(2, '0')}` : '', titulo, materia,
      fuente: desentidad(m[4] ?? '').replace(/^Fuente:\s*/i, ''), enlace: new URL(m[1], base).href, rutina: RUTINA.test(materia) });
  }
  return out;
}

let actuales: Noticias = { actualizado: '', items: [] };
export const noticias = () => actuales;
export function aplicarNoticias(n: Noticias) { if (n?.items?.length) actuales = n; }

const fechaTxt = (iso: string) => iso.split('-').reverse().join('-');
/** Resumen para Riffo Junior: lo importante primero (con la materia oficial) y lo de rutina en una línea. */
export function resumenNoticias(n: Noticias = actuales, dias = 45, hoy = new Date()): string {
  if (!n.items.length) return 'Todavía no tengo noticias del SII cargadas. Se actualizan solas cada semana desde sii.cl.';
  const limite = new Date(hoy.getTime() - dias * 86400000).toISOString().slice(0, 10);
  const recientes = n.items.filter(x => x.fecha >= limite);
  const lista = recientes.length ? recientes : n.items.slice(0, 10);
  const imp = lista.filter(x => !x.rutina), rut = lista.filter(x => x.rutina);
  const lineas = [`Resumen de lo que publicó el SII${recientes.length ? ` en los últimos ${dias} días` : ''} (actualizado al ${fechaTxt(n.actualizado)}):`];
  if (imp.length) lineas.push(...imp.slice(0, 6).map(x => `• ${x.tipo} N° ${x.numero} (${fechaTxt(x.fecha)}): ${x.materia}`));
  else lineas.push('• No hubo publicaciones fuera de las habituales.');
  if (imp.length > 6) lineas.push(`• … y ${imp.length - 6} más en la sección Noticias.`);
  if (rut.length) lineas.push(`• Además, ${rut.length} publicaciones de rutina (UF, reajustes y multas, tablas del impuesto único).`);
  lineas.push('El detalle oficial está en el PDF de cada una (sección Noticias). Revisa la fuente antes de aplicar un cambio.');
  return lineas.join('\n');
}
