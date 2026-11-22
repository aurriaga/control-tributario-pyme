# Control Tributario Pyme

Aplicación web para el control tributario y contable de una pyme chilena: lee los archivos que ya se descargan del SII
y del banco, los cuadra entre sí y arma la información del mes. Es la versión web de un sistema que nació como libro
de Excel con macros.

**Privacidad:** los archivos se procesan en tu navegador. Nada se sube a un servidor.

## Qué hace hoy

- Registra la empresa (RUT con dígito verificador).
- Carga el Registro de Compras y Ventas (RCV) del SII: CSV con ";", UTF-16, con línea de título; omite duplicados;
  rechaza archivos de otra empresa y avisa si falta el período del registro.
- Muestra el resumen por período (neto, IVA y total) y el detalle de documentos.

El avance de la migración está en [PLAN.md](PLAN.md).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npx vitest run     # pruebas con datos ficticios (pruebas/datos)
npm run build
```
