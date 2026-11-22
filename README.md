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
