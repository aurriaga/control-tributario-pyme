// Texto de un PDF con pdf.js, una línea por renglón del documento. Se comparte entre el navegador y las pruebas.
interface PaginaPDF { getTextContent(): Promise<{ items: unknown[] }> }
interface DocPDF { numPages: number; getPage(n: number): Promise<PaginaPDF> }
export interface PdfJs { getDocument(src: { data: Uint8Array; useSystemFonts?: boolean }): { promise: Promise<DocPDF> } }

export async function textoDePdf(pdfjs: PdfJs, bytes: Uint8Array): Promise<{ texto: string; paginas: number; escaneado: boolean }> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  let texto = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) texto += (it.str ?? '') + (it.hasEOL ? '\n' : ' ');
    texto += '\n';
  }
  const util = texto.replace(/\s/g, '').length;
  return { texto, paginas: doc.numPages, escaneado: util < 25 * doc.numPages };
}
