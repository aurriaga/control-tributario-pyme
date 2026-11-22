// Servicios del navegador para el lector: PDF con pdf.js y reconocimiento de texto (OCR) con Tesseract.
// Se cargan solo cuando se necesitan, para que la app abra rápido. El OCR descarga una vez el modelo de idioma
// español; los archivos del usuario no salen del navegador.
import type { Servicios } from './nucleo/extraer';
import { textoDePdf, type PdfJs } from './nucleo/pdfTexto';

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

let trabajadorOCR: Promise<{ recognize(img: Blob | HTMLCanvasElement): Promise<{ data: { text: string } }> }> | null = null;
function ocr() {
  trabajadorOCR ??= import('tesseract.js').then(t => t.createWorker('spa'));
  return trabajadorOCR;
}

export const serviciosNavegador: Servicios = {
  async textoPDF(bytes) {
    return textoDePdf(await pdfjs() as unknown as PdfJs, bytes);
  },
  async ocrImagen(bytes) {
    const w = await ocr();
    return (await w.recognize(new Blob([bytes]))).data.text;
  },
  async ocrPDF(bytes) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: bytes.slice() }).promise;
    const w = await ocr();
    let texto = '';
    for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
      const pag = await doc.getPage(p);
      const vista = pag.getViewport({ scale: 2 });
      const lienzo = document.createElement('canvas');
      lienzo.width = vista.width; lienzo.height = vista.height;
      await pag.render({ canvasContext: lienzo.getContext('2d')!, viewport: vista }).promise;
      texto += (await w.recognize(lienzo)).data.text + '\n';
    }
    return texto;
  },
};
