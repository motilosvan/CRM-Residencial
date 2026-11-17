import type { EstadoGateway, ResumenConjunto, UsuarioConjunto } from '../contratos';
import { PALETA_PARQUES } from '@/tema/paletas';
import type { Conjunto, Usuario } from '@/types/conjunto';

export const CODIGO_DEMO = '123456';

export const CONJUNTOS_DEMO: Conjunto[] = [
  { id: 'cj-parques', slug: 'parque-central-occidente', nombre: 'Parque Central de Occidente', paleta: PALETA_PARQUES },
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

export const RESUMEN_DEMO: ResumenConjunto = {
  porEstado: [
    { estado: 'NUEVA', n: 3 },
    { estado: 'ASIGNADA', n: 2 },
    { estado: 'EN_PROCESO', n: 4 },
    { estado: 'RESUELTA', n: 8 },
    { estado: 'CERRADA', n: 5 },
  ],
  carga: [{ idUsuario: 2, nombre: 'Soporte Demo', abiertas: 4 }],
  respuesta: [
    { categoria: 'MANTENIMIENTO', total: 6, minutosPromedio: 95, dentroSla: 5 },
    { categoria: 'FACTURACION', total: 4, minutosPromedio: 45, dentroSla: 4 },
  ],
};

export const ESTADO_GATEWAY_DEMO: EstadoGateway = {
  cuentas: [],
  totalCorreos: 22,
  ultimoCorreo: '2026-11-15T14:30:00.000Z',
  conectado: true,
  buzon: {
    correo: 'mesa.ayuda@demo.mailflow.test',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    buzon: 'INBOX',
    diasIniciales: 7,
    marcarLeido: false,
    activo: true,
    ultimaSincronizacion: '2026-11-15T15:00:00.000Z',
    ultimoError: null,
    version: 1,
  },
};

export const USUARIOS_CONJUNTO_DEMO: UsuarioConjunto[] = [
  {
    id: 1,
    nombre: 'Administración Demo',
    correo: 'admin@demo.mailflow.test',
    rol: 'ADMIN',
    activo: true,
    version: 1,
    cuentaActiva: true,
  },
  {
    id: 2,
    nombre: 'Soporte Demo',
    correo: 'soporte@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: true,
    version: 1,
    cuentaActiva: true,
  },
  {
    id: 3,
    nombre: 'Camila Torres',
    correo: 'camila@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: true,
    version: 1,
    cuentaActiva: true,
  },
  {
    id: 4,
    nombre: 'Mateo Rojas',
    correo: 'mateo@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: false,
    version: 2,
    cuentaActiva: true,
  },
  {
    id: 5,
    nombre: 'Lucía Méndez',
    correo: 'lucia@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: true,
    version: 1,
    cuentaActiva: false,
  },
];

export const CUENTAS_DESHABILITADAS_DEMO: readonly string[] = [
  'lucia@demo.mailflow.test',
  'deshabilitado@demo.mailflow.test',
];
