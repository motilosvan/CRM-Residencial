import { z } from 'zod';

export const loginSchema = z.object({
  correo: z
    .string()
    .min(1, 'El correo institucional es obligatorio.')
    .email('Ingresa un formato de correo válido (ej. administracion@parquesoccidente.demo).'),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres.'),
  recordarSesion: z.boolean().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const residenteSchema = z.object({
  nombre: z
    .string()
    .min(3, 'El nombre debe contener mínimo 3 caracteres.')
    .max(80, 'El nombre es demasiado largo.'),
  torre: z
    .string()
    .regex(/^Torre\s([1-8])$/, 'Formato requerido: Torre 1 a Torre 8.'),
  apartamento: z
    .string()
    .regex(/^[1-9]\d{2}$/, 'Ingresa un número de apartamento válido (ej. 101, 504).'),
  correo: z.string().email('Ingresa un correo electrónico válido.'),
  telefono: z.string().min(7, 'Ingresa un teléfono de contacto válido.'),
  activo: z.boolean().default(true),
});

export type ResidenteFormValues = z.infer<typeof residenteSchema>;
