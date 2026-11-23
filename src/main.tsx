import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bricolage-grotesque/400.css'
import '@fontsource/bricolage-grotesque/700.css'
import '@fontsource/bricolage-grotesque/800.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import { iniciarAlmacen } from './almacen'
import { aplicarNormativa } from './nucleo/normativa'

/** Normativa vigente (UTM y tasas) publicada junto a la app y actualizada cada mes desde el SII; sin conexión quedan los valores incluidos. */
async function cargarNormativa() {
  try {
    const r = await fetch('normativa.json', { cache: 'no-cache', signal: AbortSignal.timeout(4000) })
    if (r.ok) aplicarNormativa(await r.json())
  } catch { /* sin conexión: valores incluidos */ }
}

// Primero se abre el almacén (IndexedDB) y se lee la normativa; después se dibuja la app
Promise.allSettled([iniciarAlmacen(), cargarNormativa()]).finally(async () => {
  const { default: App } = await import('./App.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
