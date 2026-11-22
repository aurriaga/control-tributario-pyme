# Control Tributario Pyme

Aplicación web para el control tributario y contable de una pyme chilena: lee los archivos que ya se descargan del SII
y del banco, los cuadra entre sí y arma la información del mes. Es la versión web de un sistema que nació como libro
de Excel con macros.

**Privacidad:** los archivos se procesan en tu navegador. Nada se sube a un servidor.

## Qué hace hoy

La app se recorre con el **menú de la izquierda**: Inicio, Cargar documentos, Por clasificar, Compras y ventas, IVA y F29,
Personal, Banco, Contabilidad y Resumen del año (en el celular, el menú queda arriba).

- **Lector de documentos**: arrastra cualquier archivo (CSV, Excel, PDF, fotos o PDF escaneados con OCR) y la app
  reconoce qué es por su contenido: RCV de compras o ventas, cartolas (y su banco), F29, F22, carpeta tributaria,
  libros de remuneraciones, boletas de honorarios y Libro Diario. No carga documentos de otra empresa.
- Carga el Registro de Compras y Ventas del SII (CSV o Excel): omite duplicados y avisa si falta el período.
- Lee el **F29** en PDF, lo cuadra al peso contra el RCV (débito, crédito y base del PPM) y arma el **borrador del F29**
  del mes con el remanente anterior reajustado por UTM y el PPM.
- Lee **cartolas** de distintos bancos y formatos, revisa que los saldos cuadren y **cruza cada movimiento con las
  facturas** que paga o cobra (RUT o nombre en la glosa y monto exacto); lo que no tiene factura se clasifica y la app
  aprende la regla. Cada movimiento se puede clasificar con una clasificación del banco, directo a una cuenta del plan
  (o a una cuenta nueva creada ahí mismo) o asociarlo a mano a una o varias facturas.
- Lee los **libros de remuneraciones** y el **informe de boletas de honorarios** del SII: controla cada fila, calcula el
  aporte del empleador con el pago a PREVIRED y completa el impuesto único y la retención en el borrador del F29.
- **Contabilidad automática**: arma el Libro Diario con todo lo cargado (ventas, compras, sueldos, honorarios, F29 y
  banco), más la apertura y los asientos manuales; muestra el Mayor, el Balance de 8 columnas, el Estado de resultados
  y los controles, aprende la categoría de gasto de cada proveedor y se descarga en Excel.
- **Panel del mes** con lo cargado y lo que falta, y los **17 controles** automáticos; se puede **anular** un documento que
  no existe en el SII, **descargar todo en Excel** y **guardar o abrir un respaldo** para llevar el trabajo a otro computador.
- **Por clasificar**: junta lo que la app no pudo decidir sola (sugerencias para confirmar, movimientos del banco,
  proveedores sin categoría y documentos con observaciones). La app **sugiere** la categoría de cada proveedor por su
  nombre o por proveedores parecidos ya clasificados, y qué es cada movimiento del banco por su glosa o su RUT.
- **Reglas** que se aprenden al clasificar: por glosa igual, por glosa que contiene unas palabras o por RUT; se pueden
  editar, desactivar o borrar en Banco > Reglas aprendidas.
- **¿Cómo funciona?**: un recorrido guiado que marca cada parte de la pantalla y la explica en palabras simples.
- **Resumen del año**: ventas, compras, IVA, mes a mes, principales clientes y proveedores, el resultado contable en
  cascada (de las ventas al resultado) y alertas; se descarga en PDF o Excel.

## Robot contable

Para llevar la contabilidad desde la línea de comandos, por ejemplo con un agente que pregunta lo dudoso:

```bash
npm run robot -- revisar  --carpeta <documentos> --memoria <memoria.json> --salida <carpeta> [--rut 77.777.777-7 --nombre "Empresa"]
npm run robot -- aprender --memoria <memoria.json> --decision '{"tipo":"proveedor","rut":"79.000.001-3","categoria":"Arriendos"}'
npm run robot -- memoria  --memoria <memoria.json>
```

`revisar` lee todos los documentos de la carpeta, aplica la **memoria contable** (lo que ya se decidió), arma la
contabilidad y deja `informe.md`, `dudas.json` y `respaldo_app.json` (se abre en la app con "Abrir respaldo").
`aprender` guarda cada respuesta: reglas por glosa o RUT, clasificaciones, cruces, categorías de proveedores y
documentos anulados. La memoria y los documentos quedan en las carpetas que indiques; no van al repositorio.

El avance de la migración está en [PLAN.md](PLAN.md).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npx vitest run     # pruebas con datos ficticios (pruebas/datos)
npm run build
```
