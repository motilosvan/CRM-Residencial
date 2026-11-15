import { z } from 'zod';

const color = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const esquemaConjunto = z.object({
  id: z.string(),
  slug: z.string(),
  nombre: z.string(),
  logoUrl: z.string().optional(),
  paleta: z.object({ primario: color, acento: color, secundario: color.optional() }).optional(),
});

export const esquemaSesion = z.object({
  usuario: z.object({
    id: z.string(),
    nombre: z.string(),
    correo: z.string(),
    rol: z.enum(['ADMIN', 'SOPORTE']),
  }),
  conjuntoActivo: esquemaConjunto,
  conjuntos: z.array(esquemaConjunto),
  ultimaActividad: z.number(),
});
