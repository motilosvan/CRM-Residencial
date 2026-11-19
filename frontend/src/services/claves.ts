function validarConjuntoId(conjuntoId: string): string {
  if (!conjuntoId || !conjuntoId.trim()) {
    throw new Error('El identificador del conjunto no puede estar vacío.');
  }
  return conjuntoId;
}

/** Prefijo común de todas las consultas de un conjunto (útil para invalidar en bloque). */
export function claveConjunto(conjuntoId: string): readonly ['conjunto', string] {
  return ['conjunto', validarConjuntoId(conjuntoId)] as const;
}

/** Clave de consulta ligada al conjunto activo para aislar la caché entre conjuntos. */
export function clave(conjuntoId: string, ...partes: readonly unknown[]): readonly ['conjunto', string, ...unknown[]] {
  return [...claveConjunto(conjuntoId), ...partes] as const;
}
