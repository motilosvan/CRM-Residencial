import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import LandingPage from './LandingPage';

function montar() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  it('tiene exactamente un h1', () => {
    montar();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('todo enlace "Iniciar sesión" apunta a /login y hay al menos uno', () => {
    montar();
    const enlaces = screen.getAllByRole('link', { name: /iniciar sesión/i });
    expect(enlaces.length).toBeGreaterThan(0);
    for (const e of enlaces) expect(e).toHaveAttribute('href', '/login');
  });

  it('expone las regiones Cómo funciona, Beneficios y Seguridad', () => {
    montar();
    for (const nombre of [/cómo funciona/i, /beneficios/i, /seguridad/i]) {
      expect(screen.getByRole('region', { name: nombre })).toBeInTheDocument();
    }
  });

  it('tiene header, main y footer, y enlace para saltar al contenido', () => {
    montar();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /saltar al contenido/i })).toHaveAttribute('href', '#contenido');
  });

  it('no tiene formularios ni la palabra "Contacto"', () => {
    const { container } = montar();
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/contacto/i);
  });

  it('menciona la Ley 1581', () => {
    montar();
    const seguridad = screen.getByRole('region', { name: /seguridad/i });
    expect(within(seguridad).getByText(/ley 1581/i)).toBeInTheDocument();
  });

  it('el acceso de la banda azul usa un foco claro visible sobre bg-primary', () => {
    montar();
    const seguridad = screen.getByRole('region', { name: /seguridad/i });
    const acceso = within(seguridad).getByRole('link', { name: /iniciar sesión/i });
    expect(acceso.className).toContain('focus-visible:outline-primary-foreground');
  });

  it('C5: los CTA blancos sobre azul oscuro tienen anillo separado del botón (outline con offset)', () => {
    montar();
    const accesos = screen.getAllByRole('link', { name: /iniciar sesión/i }).filter((a) => a.className.includes('focus-visible:outline-primary-foreground'));
    expect(accesos.length).toBeGreaterThanOrEqual(3); // cabecera transparente, hero y banda de seguridad
    for (const a of accesos) {
      expect(a.className).toContain('focus-visible:outline-2');
      expect(a.className).toContain('focus-visible:outline-offset-4');
      expect(a.className).toContain('focus-visible:outline-solid');
      expect(a.className).toContain('focus-visible:outline-primary-foreground');
      expect(a.className).toContain('focus-visible:ring-0');
    }
  });
});

describe('Franja de garantías', () => {
  it('contiene los cuatro textos exactos', () => {
    montar();
    const franja = screen.getByRole('region', { name: /garantías/i });
    for (const t of [
      'Código de un solo uso',
      'Sesión que se cierra sola a los 30 min',
      'Tratamiento según Ley 1581',
      'La IA solo sugiere',
    ]) {
      const accesibles = within(franja)
        .getAllByText(t)
        .filter((el) => !el.closest('[aria-hidden="true"]'));
      expect(accesibles).toHaveLength(1);
    }
  });
});
