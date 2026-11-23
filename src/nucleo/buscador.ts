// Buscador de Riffo Junior: para preguntas abiertas ("¿qué cambia la reforma para las 14 A?") busca en lo que la app ya
// tiene —fichas de reformas verificadas, noticias del SII, normativa, glosario y ayuda— y arma una síntesis con las
// fuentes. Corre en el navegador: no envía nada. Si no encuentra algo con respaldo, lo dice en vez de inventar.
import { jerga, documentosGlosario } from './vocabulario';
import { noticias } from './noticias';
import { normativa } from './normativa';
import { REFORMAS, type Para } from './reformas';
import { regimenDe } from './tributario';
import type { Respuesta } from './asistente';

export interface Doc {
  tipo: 'reforma' | 'glosario' | 'ayuda' | 'noticia' | 'normativa';
  titulo: string; texto: string; claves?: string; fuente?: string; url?: string;
  para?: Para[]; ley?: string; vigencia?: string; porConfirmar?: boolean;
}

const STOP = new Set(('que como cual cuales cuando donde para por con sin los las del una uno unos unas el la de en y o a se me mi mis tu tus es son '
  + 'lo le les al hay trae traen tiene tienen sobre esta este estos estas esa ese eso nueva nuevo nuevas nuevos cambia cambian cambio cambios '
  + 'ley leyes sii empresa empresas ser siendo puedo debo hace va van ahora tema saber quiero necesito dime explicame cuentame').split(' '));
const tokens = (s: string) => jerga(s).trim().split(' ').filter(w => w.length > 1 && !STOP.has(w));
const REGIMENES: Para[] = ['general', 'propyme', 'transparente'];
const NOMBRE_PARA: Record<Para, string> = {
  general: 'las empresas del régimen general (14 A)', propyme: 'las empresas Pro Pyme General (14 D N° 3)', transparente: 'las empresas Pro Pyme Transparente (14 D N° 8)',
  empresas: 'todas las empresas', empleadores: 'los empleadores', personas: 'las personas', inmobiliario: 'las viviendas y el sector inmobiliario', exportadores: 'los exportadores',
};
const CLAVES_PARA: Record<Para, string> = {
  general: 'regimen general 14 a semi integrado parcialmente integrado primera categoria', propyme: 'pro pyme propyme 14 d 14d3 pyme', transparente: 'transparente 14 d 8',
  empresas: 'empresas contribuyentes', empleadores: 'empleador trabajadores remuneraciones', personas: 'personas dueños socios', inmobiliario: 'vivienda inmobiliaria arriendo', exportadores: 'exportador exportaciones',
};

/** ¿Es una pregunta abierta sobre leyes, reformas o cambios? (va al buscador antes que a otras respuestas). */
export function pideBusqueda(pregunta: string): boolean {
  const t = jerga(pregunta);
  if (/ normativa /.test(t) && !/ (?:reformas?|ley) /.test(t)) return false;    // "¿qué cambió en la normativa?" = resumen de tasas
  return /(?<= )(?:reformas?|megarreforma|reconstruccion|ley (?:\d|nueva|de)|nueva ley|leyes nuevas|que cambi\w*|cambios? (?:tributari\w*|para|en|de|que)|que dice la (?:ley|circular)|que trae|como afecta|afecta a|lo nuevo|novedades? (?:para|de la))(?= )/.test(t);
}

function documentos(extra: Doc[]): Doc[] {
  const docs: Doc[] = [];
  for (const r of REFORMAS) for (const c of r.cambios)
    docs.push({ tipo: 'reforma', titulo: `${r.ley}: ${r.nombre}`, texto: c.texto, claves: `${r.claves} ${c.para.map(p => CLAVES_PARA[p]).join(' ')}`, url: r.fuentes[0], para: c.para, ley: r.ley, vigencia: c.vigencia, porConfirmar: c.porConfirmar });
  for (const n of noticias().items.filter(x => !x.rutina))
    docs.push({ tipo: 'noticia', titulo: `${n.tipo} SII N° ${n.numero} (${n.fecha.split('-').reverse().join('-')})`, texto: n.materia || n.titulo, url: n.enlace });
  for (const x of normativa().novedades) docs.push({ tipo: 'normativa', titulo: x.titulo, texto: x.detalle, fuente: x.fuente });
  for (const g of documentosGlosario()) docs.push({ tipo: 'glosario', ...g });
  return [...docs, ...extra];
}

function puntaje(d: Doc, q: string[], reg: Para | null, quiereReforma: boolean): { base: number; total: number } {
  const cabeza = new Set(tokens(`${d.titulo} ${d.claves ?? ''}`)), cuerpo = new Set(tokens(d.texto));
  const todos = [...cabeza, ...cuerpo];
  let s = 0;
  for (const w of q) {
    if (cabeza.has(w)) s += 3;
    else if (cuerpo.has(w)) s += 1;
    else if (w.length >= 5 && todos.some(k => k.length >= 5 && k.slice(0, 5) === w.slice(0, 5))) s += 0.5;
  }
  const base = s;
  if (reg && d.para) s += d.para.includes(reg) ? 4 : d.para.every(p => REGIMENES.includes(p)) ? -4 : 0;
  if (quiereReforma && d.tipo === 'reforma') s += 4;
  if (quiereReforma && d.tipo === 'noticia') s += 1;
  return { base, total: s };
}

const primeraFrase = (s: string, max = 240) => { const f = s.split(/(?<=\.)\s(?=[A-ZÁÉÍÓÚÑ])/)[0]; return f.length > max ? `${f.slice(0, max - 1)}…` : f; };
const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('-') : iso);

/** Busca en la información de la app y arma una respuesta con sus fuentes; null si no hay nada con respaldo. */
export function buscar(pregunta: string, extra: Doc[] = []): Respuesta | null {
  const q = tokens(pregunta);
  if (!q.length) return null;
  const t = jerga(pregunta), regimen = regimenDe(t) as Para | null, quiereReforma = pideBusqueda(pregunta);
  const ranking = documentos(extra).map(d => ({ d, p: puntaje(d, q, regimen, quiereReforma) })).filter(x => x.p.base >= 2 && x.p.total >= 3).map(x => ({ d: x.d, s: x.p.total, base: x.p.base })).sort((a, b) => b.s - a.s);
  if (!ranking.length) return null;
  const pie = `Es una síntesis de las fuentes oficiales que tiene la app (normativa al ${fecha(normativa().actualizado)}); confírmala antes de decidir.`;

  // Una reforma: lo que cambia para quien pregunta, lo demás de la misma ley, el estado y las fuentes
  const top = ranking[0].d;
  const r = top.tipo === 'reforma' ? REFORMAS.find(x => x.ley === top.ley) : undefined;
  if (r) {
    const marca = (c: { texto: string; vigencia: string; porConfirmar?: boolean }) => `• ${c.texto} Vigencia: ${c.vigencia}${c.porConfirmar ? ' (por confirmar)' : ''}.`;
    const propios = regimen ? r.cambios.filter(c => c.para.includes(regimen)) : r.cambios.filter(c => c.para.some(p => REGIMENES.includes(p) || p === 'empresas'));
    const otros = r.cambios.filter(c => !propios.includes(c) && c.para.some(p => p === 'empresas' || p === 'empleadores'));
    const noticiasRel = ranking.filter(x => x.d.tipo === 'noticia' && x.base >= 4).slice(0, 2);
    const relacionadas = noticiasRel.map(x => `• ${x.d.titulo}: ${primeraFrase(x.d.texto, 180)}`);
    const lineas = [
      `${r.ley} (${r.nombre}, publicada en el Diario Oficial el ${fecha(r.publicada)}). ${r.resumen}`,
      `${regimen ? `Lo que cambia para ${NOMBRE_PARA[regimen]}:` : 'Lo principal para las empresas:'}`,
      ...propios.map(marca),
      ...(otros.length ? ['También aplica a las empresas y empleadores:', ...otros.map(c => `• ${primeraFrase(c.texto)} Vigencia: ${c.vigencia}.`)] : []),
      `Estado: ${r.estado}`,
      ...(relacionadas.length ? ['Publicaciones del SII relacionadas:', ...relacionadas] : []),
      ...(regimen === 'general' ? ['Para calcular con la nueva tasa, pregúntame por ejemplo: "renta de 50.000.000, ¿cuánto pago de primera categoría siendo 14 A en el año comercial 2028?".'] : []),
      `Fuentes: ${[...new Set([...r.fuentes, ...noticiasRel.map(x => x.d.url!)])].join(' · ')}`,
      pie,
    ];
    return { texto: lineas.join('\n'), acciones: [] };
  }

  // Otra cosa: los 3 resultados más relevantes, cada uno con su fuente
  const mejores = ranking.slice(0, 3).map(x => x.d);
  const fuentes = [...new Set(mejores.map(d => d.url ?? d.fuente).filter(Boolean))];
  return {
    texto: ['Esto encontré en la información de la app:', ...mejores.map(d => `• ${d.titulo}: ${primeraFrase(d.texto.replace(/^[^:]{0,60}:\s*/, ''))}`),
      ...(fuentes.length ? [`Fuentes: ${fuentes.join(' · ')}`] : []), pie].join('\n'),
    acciones: [],
  };
}
