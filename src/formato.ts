export const pesos = (n: number) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('de-DE');
