import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/bricolage-grotesque/400.css'
import '@fontsource/bricolage-grotesque/700.css'
import '@fontsource/bricolage-grotesque/800.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import { iniciarAlmacen } from './almacen'

// Primero se abre el almacén (IndexedDB) y se pasan los datos antiguos; después se dibuja la app
iniciarAlmacen().finally(async () => {
  const { default: App } = await import('./App.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
