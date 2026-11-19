import { derivarTema, validarPaleta } from './derivarTema';
import { PALETA_MAILFLOW, type Paleta } from './paletas';

/**
 * Escribe las variables del tema en `raiz`. Usa MailFlow si no hay paleta, si algún hex
 * no es válido o si no cumple contraste AA. Siempre escribe el mismo conjunto de claves,
 * así una llamada posterior sobrescribe todo y no queda rastro del conjunto anterior.
 */
export function aplicarTema(
  paleta?: Paleta,
  raiz: HTMLElement = document.documentElement,
): 'conjunto' | 'mailflow' {
  const usar = paleta && validarPaleta(paleta).valida;
  const variables = derivarTema(usar ? paleta : PALETA_MAILFLOW);
  for (const [clave, valor] of Object.entries(variables)) raiz.style.setProperty(clave, valor);
  return usar ? 'conjunto' : 'mailflow';
}
