// Modo IA de Riffo Junior (opcional): con la clave de API de Anthropic del propio usuario, Claude responde preguntas
// tributarias abiertas buscando en sitios oficiales chilenos. Solo se envía la pregunta y, si la hay, la síntesis
// pública que armó el buscador de la app: nunca los datos de la empresa. La clave queda guardada solo en este navegador.
const CLAVE = 'riffo-ia-clave';
const MODELO = 'claude-opus-5-5';
const DOMINIOS = ['sii.cl', 'bcn.cl', 'leychile.cl', 'hacienda.cl', 'diariooficial.interior.gob.cl', 'tgr.cl', 'camara.cl', 'senado.cl', 'dt.gob.cl', 'previred.com'];

const SISTEMA = `Eres Riffo Junior, el asistente tributario y contable de la app Control Tributario Pyme, para pymes chilenas.
Responde en español de Chile, claro y breve: máximo unas 250 palabras, con viñetas cuando ayuden.
- Antes de responder sobre leyes, tasas, plazos, formularios o reformas, busca en las fuentes oficiales permitidas (SII, BCN/LeyChile, Hacienda, Diario Oficial, TGR, Congreso, Dirección del Trabajo, Previred).
- Distingue lo que ya es ley publicada de lo que es proyecto o borrador de circular, y di desde cuándo rige; aclara si hablas de año comercial o año tributario.
- No inventes cifras ni números de ley. Si no encuentras una fuente oficial que lo respalde, dilo.
- Responde solo sobre impuestos, contabilidad, remuneraciones y temas previsionales de empresas en Chile, o sobre el uso de la app. Si te preguntan otra cosa, dilo con amabilidad.
- Si la pregunta trae un "Resumen de la app", úsalo como punto de partida y corrígelo si las fuentes dicen otra cosa.
- Termina con una línea que recuerde que es orientación general y que conviene confirmarla con el SII o un contador.`;

export function claveIA(): string | null {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
}
export function guardarClaveIA(clave: string | null) {
  try { if (clave) localStorage.setItem(CLAVE, clave.trim()); else localStorage.removeItem(CLAVE); } catch { /* navegador sin almacenamiento */ }
}

export interface RespuestaIA { texto: string; fuentes: { titulo: string; url: string }[] }

/** Pregunta a Claude con búsqueda web en sitios oficiales. Lanza un Error con un mensaje para el usuario si algo falla. */
export async function preguntarIA(pregunta: string, clave: string, resumenApp?: string): Promise<RespuestaIA> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: clave, dangerouslyAllowBrowser: true });
  const contenido = resumenApp ? `${pregunta}\n\nResumen de la app (información pública que ya tiene la app):\n${resumenApp}` : pregunta;
  const messages: Parameters<typeof client.beta.messages.create>[0]['messages'] = [{ role: 'user', content: contenido }];
  try {
    let r = null;
    for (let vuelta = 0; vuelta < 4; vuelta++) {           // una búsqueda larga puede pausar el turno: se continúa
      r = await client.beta.messages.create({
        model: MODELO, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SISTEMA,
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 5, allowed_domains: DOMINIOS },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3, allowed_domains: DOMINIOS },
        ],
        messages,
      });
      if (r.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: r.content });
    }
    if (!r) throw new Error('No hubo respuesta.');
    if (r.stop_reason === 'refusal') throw new Error('La IA no quiso responder esa pregunta. Prueba a formularla de otra manera.');
    const texto = r.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim();
    const fuentes = new Map<string, string>();
    for (const b of r.content) if (b.type === 'text') for (const c of b.citations ?? [])
      if ('url' in c && typeof c.url === 'string') fuentes.set(c.url, ('title' in c && typeof c.title === 'string' && c.title) || c.url);
    return { texto: texto || 'La IA no devolvió texto.', fuentes: [...fuentes].map(([url, titulo]) => ({ url, titulo })) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('La clave de API no es válida. Revísala en "Modo IA".');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('La clave no tiene permiso para esto. Revisa en console.anthropic.com que la búsqueda web esté habilitada para tu organización.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Se alcanzó el límite de uso de tu cuenta de Anthropic. Espera un momento o revisa tus límites.');
    if (e instanceof Anthropic.BadRequestError) throw new Error(`La API rechazó la consulta: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new Error('No se pudo conectar con la IA. Revisa tu conexión a internet.');
    if (e instanceof Anthropic.APIError) throw new Error(`La IA respondió con un error (${e.status}). Intenta de nuevo en un rato.`);
    throw e;
  }
}
