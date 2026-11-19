import { describe, expect, it } from 'vitest';
import { formatearDuracion, formatearFecha, formatearFechaHora } from './formato';

describe('formatearFecha', () => {
  it('formatea en español de Colombia (zona America/Bogota)', () => {
    expect(formatearFecha('2026-03-05T15:00:00Z')).toBe('5 mar 2026');
  });
  it('usa la zona de Bogotá, no la del equipo', () => {
    // 02:00 UTC del día 6 = 21:00 del día 5 en Bogotá (UTC-5).
    expect(formatearFecha('2026-03-06T02:00:00Z')).toBe('5 mar 2026');
  });
  it('acepta Date y epoch ms', () => {
    expect(formatearFecha(new Date('2026-12-25T15:00:00Z'))).toBe('25 dic 2026');
    expect(formatearFecha(Date.parse('2026-12-25T15:00:00Z'))).toBe('25 dic 2026');
  });
  it('valor vacío o inválido → guion', () => {
    expect(formatearFecha(null)).toBe('—');
    expect(formatearFecha(undefined)).toBe('—');
    expect(formatearFecha('no es fecha')).toBe('—');
  });
});

describe('formatearFechaHora', () => {
  it('incluye hora de 24 h en Bogotá', () => {
    const t = formatearFechaHora('2026-03-05T20:45:00Z');
    expect(t).toContain('5 mar 2026');
    expect(t).toContain('15:45');
  });
  it('inválido → guion', () => {
    expect(formatearFechaHora('x')).toBe('—');
    expect(formatearFechaHora(null)).toBe('—');
  });
});

describe('formatearDuracion (minutos)', () => {
  it('menos de una hora', () => {
    expect(formatearDuracion(0)).toBe('0 min');
    expect(formatearDuracion(45)).toBe('45 min');
  });
  it('horas exactas y con minutos', () => {
    expect(formatearDuracion(60)).toBe('1 h');
    expect(formatearDuracion(90)).toBe('1 h 30 min');
    expect(formatearDuracion(1500)).toBe('25 h');
  });
  it('redondea fracciones al minuto', () => {
    expect(formatearDuracion(59.6)).toBe('1 h');
    expect(formatearDuracion(10.4)).toBe('10 min');
  });
  it('inválido o negativo → guion', () => {
    expect(formatearDuracion(null)).toBe('—');
    expect(formatearDuracion(undefined)).toBe('—');
    expect(formatearDuracion(Number.NaN)).toBe('—');
    expect(formatearDuracion(-5)).toBe('—');
  });
});
