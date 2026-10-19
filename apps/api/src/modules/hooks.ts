/**
 * Punto de observación/inyección dentro de una transacción. Producción no lo usa;
 * las pruebas de atomicidad (S2-06) lanzan un error en un paso concreto para comprobar
 * que el ROLLBACK deja la BD exactamente como estaba.
 */
export interface Hooks {
  despuesDe?: (paso: string) => void | Promise<void>;
}

export async function paso(hooks: Hooks | undefined, nombre: string): Promise<void> {
  await hooks?.despuesDe?.(nombre);
}
