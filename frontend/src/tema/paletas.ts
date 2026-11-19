/** Paleta de un conjunto: colores hex (#rgb o #rrggbb). */
export interface Paleta {
  primario: string;
  acento: string;
  secundario?: string;
}

export const PALETA_MAILFLOW: Paleta = { primario: '#1E3A5F', acento: '#E0A458' };

export const PALETA_PARQUES: Paleta = { primario: '#355E3B', acento: '#D6A64F', secundario: '#789653' };

/** Fondo de la aplicación (marca MailFlow). */
export const FONDO = '#FAF9F6';

/** Tinta oscura para foregrounds: el `--foreground` del tema MailFlow. */
export const TINTA_OSCURA = 'oklch(0.2 0.025 255)';
