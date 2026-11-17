import { CATEGORIAS, type Categoria } from '../../api/src/domain/clasificador.js';
import { PRIORIDADES, type Prioridad } from '../../api/src/domain/priorizador.js';
import { barajar, generador, type Ejemplo } from '../src/datos.js';

/**
 * Corpus sintético SOLO para pruebas: cada categoría y cada prioridad tiene palabras propias, mezcladas con
 * relleno al azar. Es separable a propósito: sirve para comprobar que la red aprende, guarda y carga bien,
 * no para medir su calidad (eso se hace con el corpus real, RN-06).
 */
const DE_CATEGORIA: Record<Categoria, string[]> = {
  SEGURIDAD: ['robo', 'intruso', 'alarma', 'sospechoso'],
  MANTENIMIENTO: ['fuga', 'tuberia', 'gotera', 'ascensor'],
  FACTURACION: ['factura', 'cuota', 'saldo', 'recibo'],
  ADMINISTRATIVO: ['asamblea', 'mudanza', 'reglamento', 'parqueadero'],
  SIN_CLASIFICAR: ['gracias', 'felicitaciones', 'saludos', 'bendiciones'],
};
const DE_PRIORIDAD: Record<Prioridad, string[]> = {
  ALTA: ['urgente', 'grave', 'peligro'],
  MEDIA: ['pendiente', 'revisar', 'semana'],
  BAJA: ['tranquilos', 'opcional', 'despues'],
};
const RELLENO = ['buenos', 'dias', 'administracion', 'torre', 'apartamento', 'vecino', 'edificio', 'conjunto', 'piso', 'hola'];

export function corpusSintetico(porCombinacion: number, semilla: number, prefijo = 's'): Ejemplo[] {
  const azar = generador(semilla);
  const una = (xs: readonly string[]) => xs[Math.floor(azar() * xs.length)]!;
  const ejemplos: Ejemplo[] = [];
  for (const categoria of CATEGORIAS) {
    for (const prioridad of PRIORIDADES) {
      for (let i = 0; i < porCombinacion; i++) {
        const relleno = Array.from({ length: 4 }, () => una(RELLENO));
        ejemplos.push({
          id: `${prefijo}-${ejemplos.length}`,
          asunto: `${una(DE_CATEGORIA[categoria])} ${una(RELLENO)}`,
          cuerpo: barajar([...relleno, una(DE_CATEGORIA[categoria]), una(DE_PRIORIDAD[prioridad])], azar).join(' '),
          categoria,
          prioridad,
        });
      }
    }
  }
  return barajar(ejemplos, azar);
}

/** Proporción de aciertos de una salida. */
export function exactitud<T>(reales: readonly T[], predichos: readonly T[]): number {
  return reales.filter((r, i) => r === predichos[i]).length / reales.length;
}
