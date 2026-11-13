import { beforeEach, describe, expect, it } from 'vitest';
import { aplicarTema } from './aplicarTema';
import { derivarTema } from './derivarTema';
import { PALETA_MAILFLOW, PALETA_PARQUES } from './paletas';

let el: HTMLElement;
beforeEach(() => {
  el = document.createElement('div');
});

describe('aplicarTema', () => {
  it('conjunto válido: devuelve "conjunto" y escribe las variables', () => {
    expect(aplicarTema(PALETA_PARQUES, el)).toBe('conjunto');
    const t = derivarTema(PALETA_PARQUES);
    for (const [k, v] of Object.entries(t)) expect(el.style.getPropertyValue(k)).toBe(v);
  });
  it('hex inválido cae a MailFlow', () => {
    expect(aplicarTema({ primario: 'verde', acento: '#fff' }, el)).toBe('mailflow');
    expect(el.style.getPropertyValue('--primary')).toBe(derivarTema(PALETA_MAILFLOW)['--primary']);
  });
  it('sin paleta, vacío, null o contraste insuficiente usa MailFlow', () => {
    const base = derivarTema(PALETA_MAILFLOW)['--primary'];
    expect(aplicarTema(undefined, el)).toBe('mailflow');
    expect(el.style.getPropertyValue('--primary')).toBe(base);
    expect(aplicarTema(null as never, el)).toBe('mailflow');
    expect(aplicarTema({ primario: '', acento: '' }, el)).toBe('mailflow');
    expect(aplicarTema({ primario: '#FFFF00', acento: '#E0A458' }, el)).toBe('mailflow');
    expect(el.style.getPropertyValue('--primary')).toBe(base);
  });
  it('una llamada posterior sin paleta no deja rastro del conjunto anterior', () => {
    aplicarTema(PALETA_PARQUES, el);
    aplicarTema(undefined, el);
    for (const [k, v] of Object.entries(derivarTema(PALETA_MAILFLOW))) {
      expect(el.style.getPropertyValue(k)).toBe(v);
    }
    // Parques tiene secundario distinto: no debe quedar el suyo.
    expect(el.style.getPropertyValue('--secondary')).toBe(derivarTema(PALETA_MAILFLOW)['--secondary']);
  });
  it('escribe solo las claves de derivarTema', () => {
    aplicarTema(PALETA_PARQUES, el);
    expect(el.style.length).toBe(Object.keys(derivarTema(PALETA_PARQUES)).length);
  });
  it('por defecto escribe en document.documentElement', () => {
    expect(aplicarTema()).toBe('mailflow');
    expect(document.documentElement.style.getPropertyValue('--primary')).toMatch(/^oklch\(/);
    document.documentElement.removeAttribute('style');
  });
});
