const SEPARADOR = /^[ \t]*GO[ \t]*(?:--.*)?$/i;

interface Estado {
  /** Comentarios /* *\/ abiertos (T-SQL permite anidarlos). */
  bloque: number;
  /** Dentro de una cadena '...' que continúa en la línea siguiente. */
  cadena: boolean;
}

/** Recorre una línea carácter a carácter respetando el orden de cadenas y comentarios. */
function avanzar(linea: string, e: Estado): void {
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    const dos = linea.slice(i, i + 2);
    if (e.bloque > 0) {
      if (dos === '/*') { e.bloque++; i++; } else if (dos === '*/') { e.bloque--; i++; }
    } else if (e.cadena) {
      if (c === "'") {
        if (linea[i + 1] === "'") i++; // comilla escapada ''
        else e.cadena = false;
      }
    } else if (dos === '--') {
      return; // el resto de la línea es comentario
    } else if (dos === '/*') {
      e.bloque++; i++;
    } else if (c === "'") {
      e.cadena = true;
    }
  }
}

/**
 * Divide un script T-SQL en lotes usando el separador `GO` (que no es T-SQL, sino una
 * instrucción de sqlcmd/SSMS). `GO` solo cuenta si está solo en su línea y fuera de un
 * comentario de bloque o de una cadena. Los lotes vacíos se descartan.
 * Limitación: no se soporta `GO n` (repetir el lote n veces).
 */
export function splitBatches(script: string): string[] {
  const lotes: string[] = [];
  let actual: string[] = [];
  const e: Estado = { bloque: 0, cadena: false };

  for (const linea of script.split(/\r?\n/)) {
    if (e.bloque === 0 && !e.cadena && SEPARADOR.test(linea)) {
      lotes.push(actual.join('\n'));
      actual = [];
      continue;
    }
    actual.push(linea);
    avanzar(linea, e);
  }
  lotes.push(actual.join('\n'));
  return lotes.map((b) => b.trim()).filter((b) => b.length > 0);
}
