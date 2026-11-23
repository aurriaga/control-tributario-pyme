// Actualiza public/normativa.json con las UTM publicadas por el SII (sii.cl > Valores y fechas > UTM). Lo corre cada mes
// GitHub Actions (.github/workflows/normativa.yml); también se puede correr a mano: npx vite-node robot/actualizar-normativa.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { leerTablaUTM, type Normativa } from '../src/nucleo/normativa';

const RUTA = 'public/normativa.json';

async function bajar(anio: number) {
  const res = await fetch(`https://www.sii.cl/valores_y_fechas/utm/utm${anio}.htm`, { headers: { 'User-Agent': 'control-tributario-pyme (actualizacion de normativa)' } });
  if (!res.ok) return {};
  return leerTablaUTM(new TextDecoder('latin1').decode(new Uint8Array(await res.arrayBuffer())), anio);
}

const anio = new Date().getFullYear();
const actual: Partial<Normativa> = existsSync(RUTA) ? JSON.parse(readFileSync(RUTA, 'utf8')) : {};
const utm = { ...(actual.utm ?? {}), ...(await bajar(anio - 1)), ...(await bajar(anio)) };
const antes = JSON.stringify(actual.utm ?? {});
const nuevos = Object.keys(utm).filter(k => !(actual.utm && k in actual.utm));
const utmCambio = JSON.stringify(utm) !== antes;
if (!utmCambio) console.log('Sin cambios en la UTM.');
const hoy = new Date().toISOString().slice(0, 10);
const novedades = [...(actual.novedades ?? [])];
if (nuevos.length) novedades.unshift({ fecha: hoy, titulo: `UTM publicada: ${nuevos.sort().join(', ')}`, detalle: nuevos.sort().map(k => `${k}: $${utm[k].toLocaleString('de-DE')}`).join('; '), fuente: 'sii.cl > Valores y fechas > UTM' });
const salida = { ...actual, actualizado: hoy, fuente: 'SII (sii.cl) y leyes citadas en cada valor', utm: Object.fromEntries(Object.entries(utm).sort()), novedades: novedades.slice(0, 30) };
if (utmCambio) writeFileSync(RUTA, JSON.stringify(salida, null, 1) + '\n');
if (utmCambio) console.log(`normativa.json actualizada: ${nuevos.length} UTM nuevas (${nuevos.join(', ') || 'valores corregidos'}).`);

// ------------------------------------------------------------------ noticias del SII (circulares y resoluciones)
import { leerIndiceSII, type Noticia } from '../src/nucleo/noticias';
const RUTA_NOT = 'public/noticias.json';
async function indice(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'control-tributario-pyme (noticias)' } });
  return res.ok ? leerIndiceSII(new TextDecoder('latin1').decode(new Uint8Array(await res.arrayBuffer())), url) : [];
}
const fuentes = [anio, ...(new Date().getMonth() < 2 ? [anio - 1] : [])].flatMap(a => [
  `https://www.sii.cl/normativa_legislacion/circulares/${a}/indcir${a}.htm`, `https://www.sii.cl/normativa_legislacion/resoluciones/${a}/res_ind${a}.htm`]);
const todas: Noticia[] = (await Promise.all(fuentes.map(indice))).flat().filter(x => x.fecha).sort((a, b) => b.fecha.localeCompare(a.fecha) || Number(b.numero) - Number(a.numero));
if (todas.length) {
  const previo = existsSync(RUTA_NOT) ? JSON.parse(readFileSync(RUTA_NOT, 'utf8')) : { items: [] };
  const items = todas.slice(0, 60);
  if (JSON.stringify(items) !== JSON.stringify(previo.items)) {
    writeFileSync(RUTA_NOT, JSON.stringify({ actualizado: new Date().toISOString().slice(0, 10), items }, null, 1) + '\n');
    console.log(`noticias.json: ${items.length} publicaciones (${items.filter(x => !x.rutina).length} no rutinarias).`);
  } else console.log('Sin noticias nuevas.');
}
