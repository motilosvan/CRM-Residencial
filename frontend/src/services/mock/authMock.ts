import { ErrorAuth, type AuthService, type CodigoEnviado, type SolicitudCodigo } from '../contratos';
import type { Conjunto, Sesion } from '@/types/conjunto';
import { CODIGO_DEMO, CONJUNTOS_DEMO, USUARIOS_DEMO } from './datos';
import type { EstadoPanelMock } from './estadoCompartido';
import { setSesionMock } from './sesionMockEstado';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRed } from './util';

export { CODIGO_DEMO } from './datos';
export type { OpcionesMock } from './tipos';

export interface OpcionesAuthMock extends OpcionesMock {
  estado?: EstadoPanelMock;
}

const VIGENCIA_MS = 10 * 60_000;
const REENVIO_MS = 60_000;
const BLOQUEO_MS = 15 * 60_000;
const MAX_INTENTOS = 5;

interface Estado {
  /** Hay un código vigente por verificar (se gasta al usarlo o al bloquear). */
  activo: boolean;
  venceEn: number;
  reenvioDisponibleEn: number;
  fallidos: number;
  bloqueadoHasta: number;
}

const clave = (conjuntoId: string, correo: string) => `${conjuntoId}|${correo}`;
const normalizar = (correo: string) => correo.trim().toLowerCase();

function aConjuntoPublico(c: Conjunto): Conjunto {
  const pub: Conjunto = { id: c.id, slug: c.slug, nombre: c.nombre };
  if (c.logoUrl) pub.logoUrl = c.logoUrl;
  if (c.paleta) pub.paleta = { ...c.paleta };
  return pub;
}

/**
 * El estado se lleva por (conjunto, correo) exista o no el usuario: así un correo desconocido
 * se comporta igual que uno registrado y no se revela quién pertenece al conjunto.
 */
export function crearAuthMock(o: OpcionesAuthMock = {}): AuthService {
  const ahora = o.ahora ?? Date.now;
  const estados = new Map<string, Estado>();
  let sesionActual: Sesion | null = null;
  const copia = (s: Sesion): Sesion => structuredClone(s);
  const conjuntosFuente = (): readonly Conjunto[] => (o.estado ? o.estado.conjuntos : CONJUNTOS_DEMO);

  const sincronizarConjuntosDeSesion = (s: Sesion): Sesion => {
    const fuente = conjuntosFuente();
    const mapa = new Map(fuente.map((c) => [c.id, aConjuntoPublico(c)]));
    return {
      ...s,
      conjuntoActivo: mapa.get(s.conjuntoActivo.id) ?? aConjuntoPublico(s.conjuntoActivo),
      conjuntos: s.conjuntos.map((c) => mapa.get(c.id) ?? aConjuntoPublico(c)),
    };
  };

  const estadoDe = (p: SolicitudCodigo): Estado => {
    const k = clave(p.conjuntoId, normalizar(p.correo));
    let e = estados.get(k);
    if (!e) {
      e = { activo: false, venceEn: 0, reenvioDisponibleEn: 0, fallidos: 0, bloqueadoHasta: 0 };
      estados.set(k, e);
    }
    if (e.bloqueadoHasta && ahora() >= e.bloqueadoHasta) {
      e.bloqueadoHasta = 0;
      e.fallidos = 0;
    }
    return e;
  };

  const bloqueado = (e: Estado) => new ErrorAuth('BLOQUEADO', { intentosRestantes: 0, desbloqueoEn: e.bloqueadoHasta });

  return {
    async solicitarCodigo(p): Promise<CodigoEnviado> {
      await esperar(o);
      fallaRed(o);
      const e = estadoDe(p);
      if (e.bloqueadoHasta) throw bloqueado(e);
      if (ahora() < e.reenvioDisponibleEn) throw new ErrorAuth('REENVIO_PRONTO');
      const t = ahora();
      e.activo = true;
      e.venceEn = t + VIGENCIA_MS;
      e.reenvioDisponibleEn = t + REENVIO_MS;
      return { venceEn: e.venceEn, reenvioDisponibleEn: e.reenvioDisponibleEn };
    },

    async verificarCodigo(p): Promise<Sesion> {
      await esperar(o);
      fallaRed(o);
      const e = estadoDe(p);
      if (e.bloqueadoHasta) throw bloqueado(e);

      const codigo = p.codigo.replace(/\s+/g, '');
      if (codigo === '') {
        throw new ErrorAuth('CODIGO_INCORRECTO', { intentosRestantes: MAX_INTENTOS - e.fallidos });
      }
      if (e.activo && ahora() > e.venceEn) throw new ErrorAuth('CODIGO_VENCIDO');

      const correo = normalizar(p.correo);
      const usuario = USUARIOS_DEMO.find((u) => u.correo === correo && u.conjuntoIds.includes(p.conjuntoId));
      const fuente = conjuntosFuente();
      const activo = fuente.find((c) => c.id === p.conjuntoId);

      if (e.activo && usuario && activo && codigo === CODIGO_DEMO) {
        e.activo = false;
        e.fallidos = 0;
        const { conjuntoIds, ...datos } = usuario;
        sesionActual = {
          usuario: datos,
          conjuntoActivo: aConjuntoPublico(activo),
          conjuntos: fuente.filter((c) => conjuntoIds.includes(c.id)).map(aConjuntoPublico),
          ultimaActividad: ahora(),
        };
        setSesionMock(sesionActual);
        return copia(sesionActual);
      }

      e.fallidos += 1;
      if (e.fallidos >= MAX_INTENTOS) {
        e.activo = false;
        e.bloqueadoHasta = ahora() + BLOQUEO_MS;
        throw bloqueado(e);
      }
      throw new ErrorAuth('CODIGO_INCORRECTO', { intentosRestantes: MAX_INTENTOS - e.fallidos });
    },

    async sesion(): Promise<Sesion | null> {
      await esperar(o);
      fallaRed(o);
      if (!sesionActual) return null;
      if (o.estado) {
        sesionActual = sincronizarConjuntosDeSesion(sesionActual);
        setSesionMock(sesionActual);
      }
      return copia(sesionActual);
    },

    async cambiarConjunto(conjuntoId): Promise<Sesion> {
      await esperar(o);
      fallaRed(o);
      // Sin sesión el servidor responde 401, que el cliente trata como 'RED'.
      if (!sesionActual) throw new ErrorAuth('RED');
      if (o.estado) {
        sesionActual = sincronizarConjuntosDeSesion(sesionActual);
      }
      const nuevo = sesionActual.conjuntos.find((c) => c.id === conjuntoId);
      if (!nuevo) throw new ErrorAuth('SIN_MEMBRESIA');
      sesionActual = { ...sesionActual, conjuntoActivo: aConjuntoPublico(nuevo), ultimaActividad: ahora() };
      setSesionMock(sesionActual);
      return copia(sesionActual);
    },

    async salir(): Promise<void> {
      sesionActual = null;
      setSesionMock(null);
    },
  };
}
