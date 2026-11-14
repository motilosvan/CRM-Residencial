import {
  BookOpenText,
  FlaskConical,
  History,
  House,
  Inbox,
  ListChecks,
  Palette,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
  ChartColumn,
} from 'lucide-react';

export type GrupoNavegacion = 'Trabajo diario' | 'Administración';

export interface EntradaNavegacion {
  /** Segmento bajo `/app/:conjunto/`. */
  ruta: string;
  etiqueta: string;
  /** Descripción corta para la página «Próximamente». */
  detalle: string;
  icono: LucideIcon;
  soloAdmin: boolean;
  grupo: GrupoNavegacion;
}

/** Debe coincidir con las rutas de `router.tsx`. */
export const ENTRADAS: EntradaNavegacion[] = [
  { ruta: 'inicio', etiqueta: 'Inicio', detalle: 'Tu resumen y los primeros pasos.', icono: House, soloAdmin: false, grupo: 'Trabajo diario' },
  { ruta: 'bandeja', etiqueta: 'Bandeja', detalle: 'Aquí llegarán los correos de los residentes, listos para atender.', icono: Inbox, soloAdmin: false, grupo: 'Trabajo diario' },
  { ruta: 'solicitudes', etiqueta: 'Solicitudes', detalle: 'Cada correo se convertirá en una solicitud con responsable, estado e historial.', icono: ListChecks, soloAdmin: false, grupo: 'Trabajo diario' },
  { ruta: 'laboratorio-ia', etiqueta: 'Laboratorio IA', detalle: 'Prueba las sugerencias de clasificación antes de usarlas en la bandeja.', icono: FlaskConical, soloAdmin: false, grupo: 'Trabajo diario' },
  { ruta: 'validacion', etiqueta: 'Validación', detalle: 'Aquí confirmarás que cada remitente es un residente del conjunto.', icono: ShieldCheck, soloAdmin: true, grupo: 'Administración' },
  { ruta: 'residentes', etiqueta: 'Residentes', detalle: 'Aquí cargarás y mantendrás el directorio de residentes.', icono: UsersRound, soloAdmin: true, grupo: 'Administración' },
  { ruta: 'usuarios', etiqueta: 'Usuarios', detalle: 'Aquí invitarás al personal y definirás qué puede hacer cada persona.', icono: Users, soloAdmin: true, grupo: 'Administración' },
  { ruta: 'catalogos', etiqueta: 'Catálogos', detalle: 'Aquí ajustarás categorías, prioridades y estados de las solicitudes.', icono: BookOpenText, soloAdmin: true, grupo: 'Administración' },
  { ruta: 'identidad', etiqueta: 'Identidad', detalle: 'Aquí personalizarás el logo y los colores de tu conjunto.', icono: Palette, soloAdmin: true, grupo: 'Administración' },
  { ruta: 'reportes', etiqueta: 'Reportes', detalle: 'Aquí verás cuánto tardan y cómo se resuelven las solicitudes.', icono: ChartColumn, soloAdmin: true, grupo: 'Administración' },
  { ruta: 'auditoria', etiqueta: 'Auditoría', detalle: 'Aquí consultarás quién cambió qué y cuándo.', icono: History, soloAdmin: true, grupo: 'Administración' },
];

export const GRUPOS: GrupoNavegacion[] = ['Trabajo diario', 'Administración'];

export function entradasPara(rol: 'ADMIN' | 'SOPORTE'): EntradaNavegacion[] {
  return ENTRADAS.filter((e) => rol === 'ADMIN' || !e.soloAdmin);
}

export function entradaDe(ruta: string): EntradaNavegacion | undefined {
  return ENTRADAS.find((e) => e.ruta === ruta);
}
