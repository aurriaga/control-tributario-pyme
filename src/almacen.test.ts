// Multiempresa: migración sin pérdida, varias empresas separadas, quitar y abrir respaldos.
import { describe, it, expect } from 'vitest';
import { migrar, empresas, empresaActiva, agregarEmpresa, activar, quitarEmpresa, datosDeEmpresa, importarRespaldo, claveDe, type Almacen } from './almacen';
import { crearRespaldo } from './nucleo/panel';

function memoria(): Almacen & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
}
const A = { rut: '77.777.777-7', razonSocial: 'EMPRESA DE PRUEBA SPA' }, B = { rut: '78.000.002-3', razonSocial: 'SEGUNDA PRUEBA LTDA' };

describe('multiempresa', () => {
  it('migra los datos de la versión de una sola empresa sin perder nada', () => {
    const ls = memoria();
    ls.setItem('ctp.empresa', JSON.stringify(A)); ls.setItem('ctp.documentos', '[1,2,3]'); ls.setItem('ctp.contabilidad', '{"x":1}');
    expect(migrar(ls)).toBe(true);
    expect(empresas(ls)).toEqual([A]);
    expect(ls.getItem(claveDe(A.rut, 'documentos'))).toBe('[1,2,3]');
    expect(ls.getItem(claveDe(A.rut, 'contabilidad'))).toBe('{"x":1}');
    expect(ls.getItem('ctp.documentos')).toBeNull();
    expect(migrar(ls)).toBe(false);          // la segunda vez no hace nada
  });
  it('varias empresas con datos separados; cambiar y quitar', () => {
    const ls = memoria();
    agregarEmpresa(ls, A); ls.setItem(claveDe(A.rut, 'documentos'), '["a"]');
    agregarEmpresa(ls, B); ls.setItem(claveDe(B.rut, 'documentos'), '["b"]');
    expect(empresaActiva(ls)).toEqual(B);
    activar(ls, A.rut);
    expect(empresaActiva(ls)).toEqual(A);
    expect(datosDeEmpresa(ls, A)['ctp.documentos']).toEqual(['a']);
    quitarEmpresa(ls, A.rut);
    expect(empresas(ls)).toEqual([B]);
    expect(ls.getItem(claveDe(A.rut, 'documentos'))).toBeNull();
    expect(empresaActiva(ls)).toEqual(B);
  });
  it('abrir un respaldo de otra empresa la agrega sin tocar las demás', () => {
    const ls = memoria();
    agregarEmpresa(ls, A); ls.setItem(claveDe(A.rut, 'documentos'), '["a"]');
    importarRespaldo(ls, crearRespaldo({ 'ctp.empresa': B, 'ctp.documentos': ['b1', 'b2'], 'ctp.reglas': [] }));
    expect(empresas(ls).map(e => e.rut)).toEqual([A.rut, B.rut]);
    expect(empresaActiva(ls)?.rut).toBe(B.rut);
    expect(JSON.parse(ls.getItem(claveDe(B.rut, 'documentos'))!)).toEqual(['b1', 'b2']);
    expect(ls.getItem(claveDe(A.rut, 'documentos'))).toBe('["a"]');
  });
});
