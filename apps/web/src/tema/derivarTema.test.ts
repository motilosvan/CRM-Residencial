import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { derivarTema, hexAOklch, validarPaleta } from './derivarTema';
import { PALETA_MAILFLOW, PALETA_PARQUES, FONDO } from './paletas';

const CLAVES = [
  '--primary', '--primary-foreground', '--primary-hover', '--primary-claro',
  '--accent', '--accent-foreground', '--secondary', '--secondary-foreground',
  '--ring', '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-ring',
] as const;

const luz = (v: string) => Number(/oklch\(([\d.]+)/.exec(v)?.[1]);

describe('validarPaleta', () => {
  it('acepta MailFlow y Parques', () => {
    expect(validarPaleta(PALETA_MAILFLOW).valida).toBe(true);
    expect(validarPaleta(PALETA_PARQUES).valida).toBe(true);
  });
  it('rechaza un primario amarillo sobre el fondo', () => {
    const r = validarPaleta({ primario: '#FFFF00', acento: '#E0A458' });
    expect(r.valida).toBe(false);
    expect(r.problemas.some((p) => /primario/i.test(p.par) && /fondo/i.test(p.par))).toBe(true);
    expect(r.problemas[0].minimo).toBe(4.5);
  });
  it('rechaza hex mal formado sin lanzar', () => {
    for (const mala of ['verde', '', '#12', '#ggg', null, undefined, 42]) {
      const p = { primario: mala, acento: '#fff' } as unknown as Parameters<typeof validarPaleta>[0];
      expect(validarPaleta(p).valida).toBe(false);
    }
    expect(validarPaleta(null as never).valida).toBe(false);
    expect(validarPaleta(undefined as never).valida).toBe(false);
  });
  it('acepta hex corto y mayúsculas/minúsculas', () => {
    expect(validarPaleta({ primario: '#123', acento: '#E0A458' }).valida).toBe(true);
    expect(validarPaleta({ primario: '#1e3a5f', acento: '#e0a458' }).valida).toBe(true);
    expect(derivarTema({ primario: '#1e3a5f', acento: '#e0a458' })).toEqual(derivarTema(PALETA_MAILFLOW));
    expect(derivarTema({ primario: '#abc', acento: '#E0A458' })['--primary']).toMatch(/^oklch\(/);
  });
});

describe('derivarTema', () => {
  it('produce las claves mínimas en oklch', () => {
    const t = derivarTema(PALETA_MAILFLOW);
    for (const k of CLAVES) expect(t[k], k).toMatch(/^oklch\(/);
  });
  it('foreground oscuro sobre ámbar y claro sobre azul', () => {
    const t = derivarTema(PALETA_MAILFLOW);
    expect(luz(t['--accent-foreground'])).toBeLessThan(0.5);
    expect(luz(t['--primary-foreground'])).toBeGreaterThan(0.9);
  });
  it('hover más oscuro y claro más luminoso que el primario', () => {
    const t = derivarTema(PALETA_MAILFLOW);
    expect(luz(t['--primary-hover'])).toBeLessThan(luz(t['--primary']));
    expect(luz(t['--primary-claro'])).toBeGreaterThan(0.9);
  });
  it('sin secundario lo deriva del primario; con secundario lo usa', () => {
    const sin = derivarTema(PALETA_MAILFLOW);
    expect(luz(sin['--secondary'])).toBeGreaterThan(0.9);
    const con = derivarTema(PALETA_PARQUES);
    expect(con['--secondary']).not.toBe(sin['--secondary']);
  });
  it('hex inválido cae a MailFlow', () => {
    const base = derivarTema(PALETA_MAILFLOW);
    expect(derivarTema({ primario: 'verde', acento: '#fff' })).toEqual(base);
    expect(derivarTema(undefined as never)).toEqual(base);
    expect(derivarTema({ primario: '#355E3B', acento: null } as never)).toEqual(base);
  });
  it('FONDO es el hex de marca', () => {
    expect(FONDO).toBe('#FAF9F6');
  });
});

describe('index.css coincide con derivarTema(PALETA_MAILFLOW)', () => {
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  const raiz = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? '';
  const estatico = (k: string) => new RegExp(`${k}:\\s*([^;]+);`).exec(raiz)?.[1].trim();
  for (const [k, v] of Object.entries(derivarTema(PALETA_MAILFLOW))) {
    it(k, () => expect(estatico(k)).toBe(v));
  }
  it('--background es el hex de marca', () => {
    expect(estatico('--background')).toBe(hexAOklch(FONDO));
  });
  it('@theme inline mapea primary-hover y primary-claro', () => {
    expect(css).toMatch(/--color-primary-hover:\s*var\(--primary-hover\)/);
    expect(css).toMatch(/--color-primary-claro:\s*var\(--primary-claro\)/);
  });
});

describe('validación ampliada', () => {
  it('deriva --sidebar-accent-foreground', () => {
    expect(derivarTema(PALETA_MAILFLOW)['--sidebar-accent-foreground']).toMatch(/^oklch\(/);
  });
  it('primario en el límite: pasa sobre fondo pero falla sobre el claro', () => {
    // Busca un gris que pase sobre FONDO y falle sobre su claro (tinte L 0.95).
    let hallado: string | null = null;
    for (let v = 0x60; v <= 0x90 && !hallado; v++) {
      const hex = '#' + v.toString(16).padStart(2, '0').repeat(3);
      const r = validarPaleta({ primario: hex, acento: '#E0A458' });
      if (!r.problemas.some((p) => /fondo/.test(p.par)) && r.problemas.some((p) => /claro/.test(p.par))) hallado = hex;
    }
    expect(hallado).not.toBeNull();
    const r = validarPaleta({ primario: hallado!, acento: '#E0A458' });
    expect(r.valida).toBe(false);
    expect(r.problemas.some((p) => /primario\/claro/.test(p.par))).toBe(true);
  });
});
