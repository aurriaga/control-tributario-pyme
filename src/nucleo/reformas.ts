// Fichas de las reformas tributarias recientes, con lo que confirman las fuentes oficiales (sii.cl) y la fecha de
// publicación. Cada cambio dice a quién aplica y desde cuándo. Lo que todavía depende de una circular en consulta pública
// se marca así: Riffo no lo presenta como definitivo.
export type Para = 'general' | 'propyme' | 'transparente' | 'empresas' | 'empleadores' | 'personas' | 'inmobiliario' | 'exportadores';
export interface Cambio { para: Para[]; vigencia: string; texto: string; porConfirmar?: boolean }
export interface Reforma { ley: string; nombre: string; publicada: string; claves: string; resumen: string; cambios: Cambio[]; estado: string; fuentes: string[] }

export const REFORMAS: Reforma[] = [
  {
    ley: 'Ley 21.850',
    nombre: 'Ley para la Reconstrucción Nacional y el Desarrollo Económico y Social',
    publicada: '2026-10-17',
    claves: 'reforma tributaria nueva ley 21850 21 850 reconstruccion nacional megarreforma desarrollo economico social',
    resumen: 'Rebaja la tasa de Primera Categoría del régimen general de 27% a 23% y vuelve a integrar el sistema (el crédito para los dueños pasa a ser íntegro), además de medidas transitorias de IVA, donaciones, repatriación de capitales y empleo.',
    cambios: [
      { para: ['general'], vigencia: 'AT 2028 a AT 2030 (años comerciales 2027 a 2029)', texto: 'La tasa de Primera Categoría baja de 27% a 23% en tres años: 25,5% en el AT 2028, 24% en el AT 2029 y 23% desde el AT 2030.' },
      { para: ['general'], vigencia: 'AT 2028 a AT 2030', texto: 'Reintegración del sistema: el impuesto de Primera Categoría se podrá usar íntegramente como crédito en los impuestos finales de los dueños. La parte a restituir baja de 35% a 30% (AT 2028), 20% (AT 2029) y 0% (AT 2030).' },
      { para: ['general'], vigencia: 'Según la circular del SII', texto: 'Rebaja de los PPM para las empresas del régimen general, en línea con la nueva tasa. Las tasas y la forma de aplicarla las fija la circular que el SII tiene en consulta pública.', porConfirmar: true },
      { para: ['empresas', 'personas'], vigencia: 'Desde la publicación (17-10-2026)', texto: 'Impuesto Único y Sustitutivo de Impuestos Finales (IUSIF), opcional, de 10%, para dueños con rentas acumuladas pendientes de tributar (STUT, FUR o retiros en exceso).' },
      { para: ['empleadores'], vigencia: 'Desde el 1 de noviembre de 2026', texto: 'Crédito por pago de remuneraciones: 20% para trabajadores de regiones y 15% para la Región Metropolitana.' },
      { para: ['empresas'], vigencia: 'Desde el 1 de noviembre de 2026', texto: 'Código Tributario: el SII puede pedir información nominada a organismos del Estado (art. 59) y debe informar a la Dipres sobre ciertos contribuyentes (art. 85 quáter).' },
      { para: ['inmobiliario'], vigencia: 'Desde el 1 de diciembre de 2026, por un año', texto: 'Exención transitoria de IVA en la venta de viviendas nuevas, con devolución del IVA cobrado entre el 22 de abril de 2026 y el inicio de la vigencia.' },
      { para: ['personas'], vigencia: 'Desde el 1 de diciembre de 2026, por un año', texto: 'Rebaja del 50% del impuesto a las donaciones, por una vez, con tope del 50% del patrimonio del donante (formulario 4412).' },
      { para: ['personas', 'empresas'], vigencia: 'Desde el 1 de enero de 2027', texto: 'Repatriación de capitales transitoria por un año (tasa de 7% o 10%), estatuto de invariabilidad tributaria y eliminación del impuesto único de 10% a las ganancias de capital de ciertos instrumentos financieros.' },
      { para: ['personas', 'inmobiliario'], vigencia: 'Desde el 1 de enero de 2027', texto: 'Exención de contribuciones de la vivienda principal para mayores de 65 años (se pide) y régimen DFL 2: impuesto único de 5% al arriendo de viviendas de hasta 90 m² (hasta 140 m² en viviendas económicas nuevas).' },
      { para: ['empleadores'], vigencia: 'Desde el 1 de enero de 2027', texto: 'Crédito por financiamiento de enfermedades catastróficas (tope 150 UTM por trabajador) y la franquicia SENCE baja de 1% a 0,7% de las remuneraciones.' },
      { para: ['exportadores'], vigencia: 'Según la circular del SII', texto: 'Exportadores que hacen término de giro: deben acreditar exportaciones al menos por el IVA que se les devolvió.', porConfirmar: true },
      { para: ['propyme'], vigencia: 'Desde 2029', texto: 'PPM mínimo Pro Pyme de 0,23% desde 2029 (según la normativa cargada en la app; confírmalo con la circular final).', porConfirmar: true },
    ],
    estado: 'El SII dictará 13 circulares y 17 resoluciones. Las 7 primeras (entre ellas la de la rebaja de Primera Categoría y la reintegración) se publicaron en consulta pública el 5 de noviembre de 2026; las tasas finales y la forma de aplicar los PPM quedan en esas circulares.',
    fuentes: ['https://www.sii.cl/noticias/2026/191026noti01pcr.htm', 'https://www.sii.cl/noticias/2026/051126noti02pcr.htm'],
  },
  {
    ley: 'Ley 21.755',
    nombre: 'Rebaja transitoria de la tasa Pro Pyme',
    publicada: '2025',
    claves: 'pro pyme propyme 14 d 12 5 rebaja transitoria tasa pyme 21755 circular 53',
    resumen: 'Mantiene rebajada la tasa de Primera Categoría del régimen Pro Pyme General (14 D N° 3).',
    cambios: [
      { para: ['propyme'], vigencia: 'Años comerciales 2025 a 2028', texto: 'Primera Categoría Pro Pyme General (14 D N° 3): 12,5% en los años comerciales 2025, 2026 y 2027, y 15% en 2028. El factor de crédito para los dueños es 0,142857 (2025-2027) y 0,176470 (2028).' },
      { para: ['propyme'], vigencia: 'Años comerciales 2025 a 2028', texto: 'Condición: al cierre de cada año, la cotización del empleador de la Ley 21.735 debe ser la que indica la ley; la Circular SII 53/2025 la da por cumplida hasta 2028.' },
    ],
    estado: 'Vigente; instruida por la Circular SII N° 53/2025.',
    fuentes: ['https://www.sii.cl/normativa_legislacion/circulares/2025/circu53.pdf'],
  },
];
