import type { Paleta } from '@/tema/paletas';

export type Rol = 'ADMIN' | 'SOPORTE';

export interface Conjunto {
  id: string;
  slug: string;
  nombre: string;
  logoUrl?: string;
  paleta?: Paleta;
}

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
}

export interface Sesion {
  usuario: Usuario;
  conjuntoActivo: Conjunto;
  conjuntos: Conjunto[];
  /** Epoch ms de la última actividad. */
  ultimaActividad: number;
}
