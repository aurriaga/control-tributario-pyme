# Control Tributario Pyme

Aplicación web para el control tributario y contable de una pyme chilena: lee los archivos que ya se descargan del SII
y del banco, los cuadra entre sí y arma la información del mes. Es la versión web de un sistema que nació como libro
de Excel con macros.

**Privacidad:** los archivos se procesan en tu navegador. Nada se sube a un servidor.

## Qué hace hoy

- **Lector de documentos**: arrastra cualquier archivo (CSV, Excel, PDF, fotos o PDF escaneados con OCR) y la app
  reconoce qué es por su contenido: RCV de compras o ventas, cartolas (y su banco), F29, F22, carpeta tributaria,
  libros de remuneraciones, boletas de honorarios y Libro Diario. No carga documentos de otra empresa.
- Carga el Registro de Compras y Ventas del SII (CSV o Excel): omite duplicados y avisa si falta el período.
- Lee el **F29** en PDF, lo cuadra al peso contra el RCV (débito, crédito y base del PPM) y arma el **borrador del F29**
  del mes con el remanente anterior reajustado por UTM y el PPM.
- Lee **cartolas** de distintos bancos y formatos, revisa que los saldos cuadren y **cruza cada movimiento con las
  facturas** que paga o cobra (RUT o nombre en la glosa y monto exacto); lo que no tiene factura se clasifica y la app
  aprende la regla.
- **Resumen del año**: ventas, compras, IVA, mes a mes, principales clientes y proveedores y alertas; se descarga
  en PDF o Excel.

El avance de la migración está en [PLAN.md](PLAN.md).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npx vitest run     # pruebas con datos ficticios (pruebas/datos)
npm run build
```
