# Plan de migración: del Excel con macros a una aplicación web

Objetivo: llevar la **funcionalidad** del libro de Excel con macros (17 módulos VBA, unas 10.900 líneas) a una aplicación web
que se abre desde GitHub Pages y procesa los archivos **en el navegador**: nada se sube a un servidor.

## Reglas del proyecto

- El repositorio es público y contiene **solo código y datos de prueba ficticios** (empresa 77.777.777-7).
  Ningún RUT, nombre ni cifra de una empresa real entra al repositorio.
- Cada módulo se migra con sus pruebas (las mismas de `modPruebas.bas`, con los archivos ficticios de `pruebas/datos`).
- Antes de dar por terminado un módulo se compara en local con el Excel original usando datos reales, desde la carpeta
  `local/`, que está excluida de git.
- Las reglas tributarias (tasas, PPM, retención de honorarios) se toman del régimen configurado para cada empresa,
  como en `modNormativa.bas`.

## Etapas

| Etapa | Módulos VBA de origen | Qué entrega la app | Estado |
|---|---|---|---|
| 1. Base y RCV | modRUT, modUtil, modImportRCV | Registro de empresa, carga de RCV de compras y ventas (CSV, UTF-16, con título), duplicados, resumen por período | **Hecha** |
| 2. Lector de documentos, diseño y F29 | modDocumentos, modFacturas, modNormativa | Botón **Lector de documentos** (hecho: reconoce todos los tipos y formatos y lee el RCV en CSV o Excel). Nuevo diseño (hecho). Falta: lectura de F29 en PDF, cuadratura IVA del RCV vs. F29, PPM y borrador del F29, clasificación de compras por categoría | En curso |
| 3. Banco | modCruce, modConciliacion | Lectura de cartolas (CSV, Excel, PDF), cruce banco–facturas con reglas por RUT, conciliación y partidas por identificar | Pendiente |
| 4. Remuneraciones y honorarios | modRemuneraciones | Libros de remuneraciones, boletas de honorarios, aporte del empleador, apertura | Pendiente |
| 5. Contabilidad | modContabilidad, modEstructura | Libro Diario automático, Mayor, Balance de 8 columnas, Estado de resultados, asientos manuales | Pendiente |
| 6. Panel, controles y reportes | modReportes, modConstruir | Panel del mes, los 17 controles automáticos, exportar a Excel y PDF, respaldo del proyecto (guardar/abrir archivo) | Pendiente |
| 7. Resumen del año (dashboard exportable) | — (nuevo) | Botón **Resumen del año**: tablero de cómo va la empresa en el año (ventas, compras, margen, IVA y F29, banco, cobranza, resultado y alertas), exportable a PDF y Excel. Primera versión hecha con el RCV (ventas, compras, IVA, clientes, proveedores y alertas); crece en cada etapa | En curso |

## Lector de documentos

Un único botón donde se arrastran uno o muchos archivos. La app reconoce **qué documento es por su contenido** (no solo
por el nombre) y lo envía al lector que corresponde; al final muestra qué entendió de cada archivo y qué falta.

- **Formatos**: CSV y TXT (cualquier separador y codificación, incluso UTF-16), Excel (.xlsx, .xls, .xlsm), PDF digital,
  PDF escaneado y fotos (JPG, PNG) con reconocimiento de texto (OCR) en el navegador.
- **Documentos**: RCV de compras y ventas, cartolas de distintos bancos (Santander, BancoEstado, Banco de Chile, BCI y
  formatos genéricos con Debe/Haber o Monto), F29, F22 y Carpeta Tributaria, libros de remuneraciones, boletas de
  honorarios, Libro Diario de apertura y facturas sueltas.
- Si un archivo no se reconoce, lo dice y explica qué columnas o datos esperaba, en vez de cargarlo mal.

## Diseño

Interfaz amigable y llamativa, lejos de la típica pantalla de formularios: tarjetas grandes con una cifra y una frase,
colores con significado (cuadra, revisar, falta), avance visible del mes y textos en lenguaje simple.

## Decisiones técnicas

- **Vite + React + TypeScript**, pruebas con **Vitest**. El cálculo vive en `src/nucleo/` como funciones puras sin
  dependencia de la pantalla, para probarlo igual que las macros.
- **Datos en el navegador**: por ahora `localStorage`; desde la etapa 3 se pasa a IndexedDB y se agrega un archivo de
  respaldo descargable para llevar el trabajo a otro computador.
- **Publicación**: GitHub Actions compila y publica en GitHub Pages en cada cambio de la rama `main`.
