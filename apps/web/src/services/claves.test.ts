import { describe, expect, it } from 'vitest';
import { clave, claveConjunto } from './claves';

describe('claves de consulta', () => {
  it('siempre incluyen el id del conjunto activo', () => {
    expect(clave('c1', 'solicitudes')).toEqual(['conjunto', 'c1', 'solicitudes']);
    expect(clave('c1', 'solicitudes', { estado: 'NUEVA' })).toEqual(['conjunto', 'c1', 'solicitudes', { estado: 'NUEVA' }]);
  });

  it('conjuntos distintos dan claves distintas', () => {
    expect(clave('c1', 'resumen')).not.toEqual(clave('c2', 'resumen'));
  });

  it('claveConjunto es prefijo de todas las claves del conjunto (para invalidar en bloque)', () => {
    const base = claveConjunto('c1');
    const k = clave('c1', 'usuarios');
    expect(k.slice(0, base.length)).toEqual(base);
    expect(clave('c2', 'usuarios').slice(0, base.length)).not.toEqual(base);
  });

  it('rechaza un id de conjunto vacío', () => {
    expect(() => clave('', 'resumen')).toThrow();
  });
});
