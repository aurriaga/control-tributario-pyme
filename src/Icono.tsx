// Íconos de línea del menú (dibujados aquí: sin librerías ni marcas).
export type NombreIcono = 'inicio' | 'cargar' | 'clasificar' | 'documentos' | 'iva' | 'personal' | 'banco' | 'contabilidad' | 'resumen' | 'ayuda' | 'guardar' | 'abrir' | 'cambiar' | 'noticias';

const TRAZOS: Record<NombreIcono, string> = {
  inicio: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  cargar: 'M12 15V4m0 0L8 8m4-4l4 4M4 14v5a1 1 0 001 1h14a1 1 0 001-1v-5',
  clasificar: 'M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9zM7.5 7.5h.01',
  documentos: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  iva: 'M5 19L19 5M7.5 7.5h.01M16.5 16.5h.01M6 7.5a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0M15 16.5a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0',
  personal: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14.5a6.5 6.5 0 013.5 5.5',
  banco: 'M3 9l9-5 9 5M4 9h16M6 9v8M10 9v8M14 9v8M18 9v8M3 20h18',
  contabilidad: 'M4 4.5A1.5 1.5 0 015.5 3H20v16H5.5A1.5 1.5 0 004 20.5zM4 20.5A1.5 1.5 0 005.5 22H20M8 7h8M8 11h8',
  resumen: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  ayuda: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 114 2c-.8.6-1.5 1.1-1.5 2.5M12 17h.01',
  guardar: 'M12 4v11m0 0l-4-4m4 4l4-4M4 19h16',
  abrir: 'M3 7a1 1 0 011-1h5l2 2h9a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1z',
  cambiar: 'M7 7h13l-4-4M17 17H4l4 4',
  noticias: 'M4 5h13v14H6a2 2 0 01-2-2zM17 9h3v8a2 2 0 01-2 2M7 9h7M7 13h7M7 16h4',
};

export default function Icono({ n }: { n: NombreIcono }) {
  return (
    <svg className="icono" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZOS[n]} />
    </svg>
  );
}
