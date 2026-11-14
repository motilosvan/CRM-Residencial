import { z } from 'zod';

export const MENSAJE_NEUTRO = 'Si el correo está registrado en este conjunto, recibirás un código';

export const esquemaPaso1 = z.object({
  conjuntoId: z.string().min(1, 'Elige tu conjunto'),
  correo: z.string().trim().min(1, 'Escribe tu correo').pipe(z.email('Escribe un correo válido')),
});
export type ValoresPaso1 = z.infer<typeof esquemaPaso1>;

export const esquemaPaso2 = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'Escribe los 6 dígitos'),
});
export type ValoresPaso2 = z.infer<typeof esquemaPaso2>;

/** Quita espacios y cualquier carácter que no sea dígito (por si se pega "123 456"). */
export function normalizarCodigo(texto: string): string {
  return texto.replace(/\D/g, '');
}
