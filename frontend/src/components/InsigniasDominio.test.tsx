import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { converter, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS,
  ESTADOS,
  InsigniaCategoria,
  InsigniaEstado,
  InsigniaPrioridad,
  PRIORIDADES,
} from './InsigniasDominio';

describe('insignias de dominio', () => {
  it('estado: etiqueta legible en español para cada valor', () => {
    const esperado = { NUEVA: 'Nueva', ASIGNADA: 'Asignada', EN_PROCESO: 'En proceso', RESUELTA: 'Resuelta', CERRADA: 'Cerrada' };
    expect(ESTADOS).toEqual(Object.keys(esperado));
    for (const [valor, texto] of Object.entries(esperado)) {
      const { unmount } = render(<InsigniaEstado estado={valor as (typeof ESTADOS)[number]} />);
      expect(screen.getByText(texto)).toBeVisible();
      unmount();
    }
  });

  it('prioridad: etiqueta para cada valor', () => {
    const esperado = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };
    expect(PRIORIDADES).toEqual(Object.keys(esperado));
    for (const [valor, texto] of Object.entries(esperado)) {
      const { unmount } = render(<InsigniaPrioridad prioridad={valor as (typeof PRIORIDADES)[number]} />);
      expect(screen.getByText(texto)).toBeVisible();
      unmount();
    }
  });

  it('categoría: etiqueta para cada valor', () => {
    const esperado = {
      SEGURIDAD: 'Seguridad',
      MANTENIMIENTO: 'Mantenimiento',
      FACTURACION: 'Facturación',
      ADMINISTRATIVO: 'Administrativo',
      SIN_CLASIFICAR: 'Sin clasificar',
    };
    expect(CATEGORIAS).toEqual(Object.keys(esperado));
    for (const [valor, texto] of Object.entries(esperado)) {
      const { unmount } = render(<InsigniaCategoria categoria={valor as (typeof CATEGORIAS)[number]} />);
      expect(screen.getByText(texto)).toBeVisible();
      unmount();
    }
  });

  it('valor desconocido: muestra el texto tal cual, sin fallar', () => {
    render(<InsigniaEstado estado="OTRA" />);
    expect(screen.getByText('OTRA')).toBeInTheDocument();
  });

  it('expone el valor en data-valor y acepta className', () => {
    render(<InsigniaPrioridad prioridad="ALTA" className="ml-2" />);
    const el = screen.getByText('Alta');
    expect(el).toHaveAttribute('data-valor', 'ALTA');
    expect(el.className).toContain('ml-2');
  });

  it('usa tokens: ningún hex ni clase dark: en el componente', () => {
    const fuente = readFileSync(resolve(__dirname, 'InsigniasDominio.tsx'), 'utf8');
    expect(fuente).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(fuente).not.toMatch(/\bdark:/);
  });
});

describe('contraste AA de los tokens de insignia', () => {
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  const aRgb = converter('rgb');
  const token = (nombre: string) => {
    const m = new RegExp(`--${nombre}:\\s*(oklch\\([^)]*\\))`).exec(css);
    if (!m) throw new Error(`Falta el token --${nombre}`);
    return aRgb(m[1])!;
  };
  const pares: Array<[string, string]> = [
    ['primary', 'primary-claro'],
    ['secondary-foreground', 'secondary'],
    ['aviso', 'aviso-claro'],
    ['exito', 'exito-claro'],
    ['destructive', 'destructive-claro'],
    ['muted-foreground', 'muted'],
  ];
  for (const [fg, bg] of pares) {
    it(`--${fg} sobre --${bg} >= 4.5:1`, () => {
      expect(wcagContrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
