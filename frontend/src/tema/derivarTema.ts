import { converter, parse, wcagContrast, type Oklch } from 'culori';
import { FONDO, PALETA_MAILFLOW, TINTA_OSCURA, type Paleta } from './paletas';

export type VariablesTema = Record<`--${string}`, string>;

export interface ProblemaContraste {
  par: string;
  razon: number;
  minimo: number;
}

const MINIMO_AA = 4.5;
const BLANCO = 'oklch(1 0 0)';
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const aOklch = converter('oklch');

function color(hex: unknown): Oklch | null {
  if (typeof hex !== 'string' || !HEX.test(hex)) return null;
  const c = parse(hex);
  return c ? aOklch(c) : null;
}

function texto(c: Oklch): string {
  const n = (v: number, d: number) => Number(v.toFixed(d));
  const h = c.h === undefined || Number.isNaN(c.h) ? 0 : c.h;
  return `oklch(${n(c.l, 4)} ${n(c.c, 4)} ${n(h, 2)})`;
}

/** Convierte un hex a `oklch(...)`; `null` si no es un hex válido. */
export function hexAOklch(hex: string): string | null {
  const c = color(hex);
  return c ? texto(c) : null;
}

function foregroundDe(fondo: Oklch): Oklch {
  const blanco = aOklch(parse(BLANCO)!);
  const tinta = aOklch(parse(TINTA_OSCURA)!);
  return wcagContrast(blanco, fondo) >= wcagContrast(tinta, fondo) ? blanco : tinta;
}

interface Colores {
  primario: Oklch;
  acento: Oklch;
  secundario?: Oklch;
}

/** Paleta con todos los hex parseados, o `null` si alguno es inválido. */
function leer(p: unknown): Colores | null {
  if (!p || typeof p !== 'object') return null;
  const { primario, acento, secundario } = p as Partial<Paleta>;
  const pr = color(primario);
  const ac = color(acento);
  if (!pr || !ac) return null;
  if (secundario === undefined || secundario === null) return { primario: pr, acento: ac };
  const se = color(secundario);
  return se ? { primario: pr, acento: ac, secundario: se } : null;
}

function tinte(base: Oklch, l: number, factorC: number): Oklch {
  return { mode: 'oklch', l, c: base.c * factorC, h: base.h };
}

/** Tinte muy claro del primario: fondo de `--primary-claro`, `--accent`, `--sidebar-accent` y `--secondary` por defecto. */
function tinteClaro(primario: Oklch): Oklch {
  return tinte(primario, 0.95, 0.25);
}

/** Pares (nombre, fondo, foreground) cuyo contraste debe ser AA. */
function pares(c: Colores): Array<[string, Oklch, Oklch]> {
  const fondo = aOklch(parse(FONDO)!);
  const secundario = c.secundario ?? tinteClaro(c.primario);
  const claro = tinteClaro(c.primario);
  const lista: Array<[string, Oklch, Oklch]> = [
    ['primario/fondo', fondo, c.primario],
    ['primario/claro', claro, c.primario],
    ['sidebar-accent-foreground/sidebar-accent', claro, foregroundDe(claro)],
    ['primary-foreground/primario', c.primario, foregroundDe(c.primario)],
    ['acento-foreground/acento', c.acento, foregroundDe(c.acento)],
    ['secondary-foreground/secundario', secundario, foregroundDe(secundario)],
  ];
  // Un secundario explícito es un relleno de marca con su propio foreground; el primario solo
  // se pinta sobre `--secondary` cuando este es el tinte claro derivado.
  if (!c.secundario) lista.push(['primario/secondary', secundario, c.primario]);
  return lista;
}

export function validarPaleta(p: Paleta): { valida: boolean; problemas: ProblemaContraste[] } {
  const c = leer(p);
  if (!c) return { valida: false, problemas: [{ par: 'formato de color inválido', razon: 0, minimo: MINIMO_AA }] };
  const problemas: ProblemaContraste[] = [];
  for (const [par, fondo, fg] of pares(c)) {
    const razon = wcagContrast(fg, fondo);
    if (razon < MINIMO_AA) problemas.push({ par, razon: Number(razon.toFixed(2)), minimo: MINIMO_AA });
  }
  return { valida: problemas.length === 0, problemas };
}

/** Variables CSS de shadcn en OKLCH. Con una paleta inválida deriva la de MailFlow. */
export function derivarTema(p: Paleta): VariablesTema {
  const c = leer(p) ?? leer(PALETA_MAILFLOW)!;
  const claro = tinteClaro(c.primario);
  const secundario = c.secundario ?? claro;
  const ring = tinte(c.primario, 0.55, 1.4);
  return {
    '--primary': texto(c.primario),
    '--primary-foreground': texto(foregroundDe(c.primario)),
    '--primary-hover': texto({ ...c.primario, l: Math.max(0, c.primario.l - 0.06) }),
    '--primary-claro': texto(claro),
    '--accent': texto(claro),
    '--accent-foreground': texto(foregroundDe(claro)),
    '--acento': texto(c.acento),
    '--acento-foreground': texto(foregroundDe(c.acento)),
    '--secondary': texto(secundario),
    '--secondary-foreground': texto(foregroundDe(secundario)),
    '--ring': texto(ring),
    '--sidebar-primary': texto(c.primario),
    '--sidebar-primary-foreground': texto(foregroundDe(c.primario)),
    '--sidebar-accent': texto(claro),
    '--sidebar-accent-foreground': texto(foregroundDe(claro)),
    '--sidebar-ring': texto(ring),
  };
}

