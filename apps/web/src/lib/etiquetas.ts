import type { CategoriaSolicitud, PrioridadSolicitud } from '../types/domain';

/**
 * Traducción de los nombres canónicos de la BD (MAYÚSCULAS) a los textos del panel.
 * La BD es la fuente de verdad: aquí solo se presenta, nunca se compara para decidir reglas.
 */

const ESTADOS: Record<string, string> = {
  NUEVA: 'Nueva',
  ASIGNADA: 'Asignada',
  EN_PROCESO: 'En proceso',
  RESUELTA: 'Resuelta',
  CERRADA: 'Cerrada',
};

const CATEGORIAS: Record<string, CategoriaSolicitud> = {
  MANTENIMIENTO: 'Mantenimiento',
  ADMINISTRATIVO: 'Administrativo',
  FACTURACION: 'Facturación',
  SEGURIDAD: 'Seguridad',
};

const PRIORIDADES: Record<string, PrioridadSolicitud> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

export const etiquetaEstado = (v: string | null) => (v ? ESTADOS[v] ?? v : '—');

/** null para SIN_CLASIFICAR (o una categoría que el panel aún no conoce): se muestra aparte. */
export const categoriaPanel = (v: string | null): CategoriaSolicitud | null => (v ? CATEGORIAS[v] ?? null : null);

export const etiquetaCategoria = (v: string | null) => categoriaPanel(v) ?? 'Sin clasificar';

export const prioridadPanel = (v: string | null): PrioridadSolicitud | null => (v ? PRIORIDADES[v] ?? null : null);

export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "hace 3 min", "hace 2 h", "hace 4 días". */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'hace unos segundos';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86_400);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
