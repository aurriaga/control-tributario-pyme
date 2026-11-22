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
| 2. Lector de documentos, diseño y F29 | modDocumentos, modFacturas, modNormativa | Botón **Lector de documentos** (reconoce todos los tipos y formatos; lee RCV en CSV o Excel y F29 en PDF), nuevo diseño, cuadratura IVA del RCV vs. F29 al peso, borrador del F29 con remanente reajustado por UTM y PPM. Queda para más adelante: clasificar compras por categoría y anular documentos que no existen en el SII | **Hecha** |
| 3. Banco | modCruce, modConciliacion | Lectura de cartolas (CSV, Excel, PDF; columnas por nombre, Cargo/Abono, D/C, Monto+Tipo, Debe/Haber, formato Banco de Chile) con control de saldos y sin duplicar; cruce banco–facturas (RUT o nombre en la glosa, monto exacto, combinaciones de 2 a 4 documentos, confianza alta/media/baja); pagos de F29 detectados solos; clasificación de movimientos sin factura con reglas aprendidas. Queda para la etapa de contabilidad: conciliación libro vs. banco (en tránsito, cargos no registrados, duplicados) | **Hecha** |
| 4. Remuneraciones y honorarios | modRemuneraciones | Libros de remuneraciones (columnas por nombre, control por fila y contra TOTALES), informe anual de boletas de honorarios del SII, aporte del empleador (PREVIRED del mes siguiente − cotizaciones), impuesto único (048) y retención (151) en el borrador del F29, pagos al personal clasificados solos en el banco. La apertura pasa a la etapa de contabilidad | **Hecha** |
| 5. Contabilidad | modContabilidad, modEstructura, modReportes | Plan de cuentas editable; categorías de compras aprendidas por proveedor; asientos automáticos de apertura, ventas, compras (al mes del RCV, notas de crédito, liquidación-factura), remuneraciones y aporte del empleador, honorarios, F29 (IVA, PPM, retenciones y reajuste del remanente) y todo el banco según su estado (lo no identificado va a transitorias 1199/2190, así el mayor del banco = cartola); asientos manuales que solo entran si cuadran; Libro Diario, Mayor, Balance de 8 columnas y Estado de resultados por rango de meses; 13 controles (partida doble, banco = cartola, IVA del libro = F29, signos, depreciación, transitorias, categorías); descarga a Excel. Validado en local con datos reales: igual al Excel al peso (3.527 líneas, mismo resultado y mismos controles) | **Hecha** |
| 6. Panel, controles y reportes | modReportes, modConstruir, modPruebas | **Panel del mes** (lo cargado y lo que falta: RCV, F29, cartola y libro; ventas, compras, IVA, F29, banco y sueldos del mes); los **17 controles** automáticos del Excel (los 12 contables más documentos con observaciones, duplicados del banco, UTM, remuneraciones vs. F29 048 y honorarios vs. F29 151); **anular y reactivar documentos** (no cuentan en IVA, F29, resumen ni contabilidad); **descargar todo en Excel**; **respaldo del proyecto** (guardar y abrir un archivo .json); aviso si el navegador no puede guardar. El PDF se descarga desde el Resumen del año. Validado en local con datos reales: los mismos controles que el Excel (la UTM de noviembre falta porque solo se ingresó en el Excel) y febrero cuadra con la NC folio 24 anulada | **Hecha** |
| 7. Resumen del año (dashboard exportable) | — (nuevo) | Botón **Resumen del año**: tablero de cómo va la empresa en el año (ventas, compras, margen, IVA y F29, banco, cobranza, resultado y alertas), exportable a PDF y Excel. Incluye RCV (ventas, compras, IVA, clientes y proveedores), F29 pagados y cuadratura, banco (saldo, por cobrar y por pagar), costo del personal y la contabilidad del año: resultado según el Libro Diario, cascada de las ventas al resultado, partidas por identificar y controles en Revisar como alertas | **Hecha** |
| 8. Robot contable | — (nuevo) | `robot/robot.ts` en la línea de comandos: lee la carpeta de una empresa, aplica su **memoria contable** (reglas por glosa o RUT, clasificaciones, cruces, categorías, anulados, apertura y asientos manuales), acepta solos los cruces de confianza alta, arma la contabilidad y los 17 controles, y deja **dudas** agrupadas para preguntar, un informe y un respaldo que la app abre. Cada respuesta se guarda con `aprender` y no se vuelve a preguntar. Lo usa el agente Riffo-Contador. La memoria vive en una carpeta local del usuario, nunca en el repositorio | **Hecha** |
| 9. Clasificación y menú | — (nuevo) | Menú lateral con una sección a la vez; vista **Por clasificar** con sugerencias (categoría del proveedor por palabras clave o parecido con proveedores ya clasificados; movimientos del banco por RUT ya visto, glosa igual o palabras clave) y aceptar todas; reglas por glosa igual, contiene o RUT, con alcance antes de guardar y lista para editar, desactivar o borrar. Medido en local con las decisiones reales del Excel: proveedores 70 aciertos y 2 diferencias de criterio de 72 sugeridos; banco 485 de 487 | **Hecha** |

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
- **Datos en el navegador**: `localStorage` (con los datos reales de un año ocupa cerca de 1 MB de los ~5 MB disponibles).
  Si el navegador no puede guardar, la app lo avisa. El **respaldo** (.json) lleva el trabajo a otro computador; si los
  datos crecen, el siguiente paso es IndexedDB.
- **Publicación**: GitHub Actions compila y publica en GitHub Pages en cada cambio de la rama `main`.
