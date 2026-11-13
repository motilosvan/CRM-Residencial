import { PALETA_PARQUES } from '@/tema/paletas';
import type { Conjunto, Usuario } from '@/types/conjunto';

export const CODIGO_DEMO = '123456';

export const CONJUNTOS_DEMO: Conjunto[] = [
  { id: 'cj-parques', slug: 'parques-occidente', nombre: 'Parques del Occidente', paleta: PALETA_PARQUES },
  { id: 'cj-nogal', slug: 'altos-del-nogal', nombre: 'Altos del Nogal' },
  {
    id: 'cj-miradores',
    slug: 'miradores-del-rio',
    nombre: 'Miradores del Río',
    paleta: { primario: '#1F4E79', acento: '#C8742B', secundario: '#5584B5' },
  },
];

export interface UsuarioDemo extends Usuario {
  conjuntoIds: string[];
}

export const USUARIOS_DEMO: UsuarioDemo[] = [
  {
    id: 'us-admin',
    nombre: 'Administración Demo',
    correo: 'admin@demo.mailflow.test',
    rol: 'ADMIN',
    conjuntoIds: ['cj-parques', 'cj-nogal'],
  },
  {
    id: 'us-soporte',
    nombre: 'Soporte Demo',
    correo: 'soporte@demo.mailflow.test',
    rol: 'SOPORTE',
    conjuntoIds: ['cj-parques'],
  },
];
