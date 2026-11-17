import { describe, expect, it } from 'vitest';
import { ErrorApi, ErrorAuth } from '@/services/contratos';
import { mensajeDeError } from './mensajeDeError';

describe('mensajeDeError', () => {
  it('usa el mensaje de la API en 409 y 422', () => {
    expect(mensajeDeError(new ErrorApi(409, 'La solicitud cambió'))).toBe('La solicitud cambió');
    expect(mensajeDeError(new ErrorApi(422, 'Transición no permitida'))).toBe('Transición no permitida');
  });
  it('textos fijos para red, 401, 403, 404, 429 y 5xx', () => {
    expect(mensajeDeError(new ErrorApi(0))).toMatch(/conexión/i);
    expect(mensajeDeError(new ErrorApi(401, 'Sesión no iniciada'))).toMatch(/sesión/i);
    expect(mensajeDeError(new ErrorApi(403, 'Forbidden: solo ADMIN'))).toBe('No tienes permiso para realizar esta acción.');
    expect(mensajeDeError(new ErrorApi(404, 'Solicitud X no existe'))).toBe('No encontramos lo que buscas.');
    expect(mensajeDeError(new ErrorApi(429, 'x'))).toMatch(/demasiadas/i);
    expect(mensajeDeError(new ErrorApi(500, 'Error interno'))).toMatch(/servidor/i);
  });
  it('nunca muestra JSON crudo ni trazas aunque vengan en 409/422', () => {
    const json = mensajeDeError(new ErrorApi(422, '{"error":"x","stack":"y"}'));
    expect(json).not.toContain('{');
    const traza = mensajeDeError(new ErrorApi(409, 'Error: boom\n    at foo (/app/x.js:1:2)'));
    expect(traza).not.toContain('at foo');
    expect(mensajeDeError(new ErrorApi(422, 'x'.repeat(500)).mensaje.length > 300 ? new ErrorApi(422, 'x'.repeat(500)) : null)).toBeTruthy();
  });
  it('errores desconocidos → texto genérico, sin filtrar el mensaje', () => {
    expect(mensajeDeError(new Error('TypeError interno'))).toBe('No pudimos completar la operación. Inténtalo de nuevo.');
    expect(mensajeDeError(new ErrorAuth('RED'))).toMatch(/conexión/i);
    expect(mensajeDeError('texto')).toBe('No pudimos completar la operación. Inténtalo de nuevo.');
    expect(mensajeDeError(undefined)).toBe('No pudimos completar la operación. Inténtalo de nuevo.');
  });
});
