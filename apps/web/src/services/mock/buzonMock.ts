import { ErrorApi, type BuzonService, type EstadoGateway, type ResultadoSincronizacionBuzon } from '../contratos';
import { ESTADO_GATEWAY_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesBuzonMock extends OpcionesMock {
  estadoInicial?: EstadoGateway;
  resultadoSincronizacion?: ResultadoSincronizacionBuzon;
}

const CONTRASENAS_RECHAZADAS = new Set(['invalida', 'rechazada', 'incorrecta']);

export function crearBuzonMock(o: OpcionesBuzonMock = {}): BuzonService {
  let estadoActual: EstadoGateway = structuredClone(o.estadoInicial ?? ESTADO_GATEWAY_DEMO);
  let sincronizando = false;

  return {
    async estado(signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      return structuredClone(estadoActual);
    },

    async guardar(entrada) {
      await esperar(o);
      fallaRedApi(o);
      const correo = entrada.correo.trim().toLowerCase();
      const contrasena = entrada.contrasena.replace(/\s+/g, '');
      const imapHost = (entrada.imapHost ?? 'imap.gmail.com').trim().toLowerCase();
      const imapPort = entrada.imapPort ?? 993;
      const buzon = (entrada.buzon ?? 'INBOX').trim() || 'INBOX';
      const diasIniciales = entrada.diasIniciales ?? 7;
      const marcarLeido = entrada.marcarLeido ?? false;

      if (!correo || !correo.includes('@')) {
        throw new ErrorApi(422, 'Datos inválidos — indica un correo válido');
      }
      if (!contrasena) {
        throw new ErrorApi(422, 'Datos inválidos — la contraseña no puede estar vacía');
      }
      if (imapHost !== 'imap.gmail.com') {
        throw new ErrorApi(422, 'Datos inválidos — imapHost: ese servidor de correo no está permitido');
      }
      if (imapPort !== 993) {
        throw new ErrorApi(422, 'Datos inválidos — imapPort: debe ser 993');
      }
      if (CONTRASENAS_RECHAZADAS.has(contrasena.toLowerCase())) {
        throw new ErrorApi(
          422,
          'El servidor de correo rechazó el inicio de sesión. Revise el correo y use una «contraseña de aplicación» (https://myaccount.google.com/apppasswords), no la contraseña normal de la cuenta.',
        );
      }

      const actual = estadoActual.buzon;
      if (actual && entrada.versionEsperada !== undefined && actual.version !== entrada.versionEsperada) {
        throw new ErrorApi(
          409,
          `El buzón cambió (versión ${actual.version}, se esperaba ${entrada.versionEsperada}). Recárguelo.`,
        );
      }

      estadoActual = {
        ...estadoActual,
        conectado: true,
        buzon: {
          correo,
          imapHost,
          imapPort,
          buzon,
          diasIniciales,
          marcarLeido,
          activo: true,
          ultimaSincronizacion: actual?.ultimaSincronizacion ?? null,
          ultimoError: null,
          version: actual ? actual.version + 1 : 1,
        },
      };
      return structuredClone(estadoActual);
    },

    async desconectar(versionEsperada) {
      await esperar(o);
      fallaRedApi(o);
      const actual = estadoActual.buzon;
      if (!actual) {
        throw new ErrorApi(404, 'El conjunto no tiene un buzón conectado');
      }
      if (!actual.activo) {
        return structuredClone(estadoActual);
      }
      if (versionEsperada !== undefined && actual.version !== versionEsperada) {
        throw new ErrorApi(
          409,
          `El buzón cambió (versión ${actual.version}, se esperaba ${versionEsperada}). Recárguelo.`,
        );
      }
      estadoActual = {
        ...estadoActual,
        conectado: false,
        buzon: {
          ...actual,
          activo: false,
          version: actual.version + 1,
        },
      };
      return structuredClone(estadoActual);
    },

    async sincronizar() {
      if (!estadoActual.conectado || !estadoActual.buzon?.activo) {
        await esperar(o);
        fallaRedApi(o);
        throw new ErrorApi(422, 'El conjunto no tiene un buzón conectado');
      }
      if (sincronizando) {
        throw new ErrorApi(409, 'Ya hay una sincronización en curso para este conjunto');
      }
      sincronizando = true;
      try {
        await esperar(o);
        fallaRedApi(o);
        const resultado: ResultadoSincronizacionBuzon = o.resultadoSincronizacion ?? {
          revisados: 3,
          nuevos: 1,
          duplicados: 2,
          respaldos: 0,
          pendientes: false,
        };
        const ahora = new Date().toISOString();
        estadoActual = {
          ...estadoActual,
          totalCorreos: estadoActual.totalCorreos + resultado.nuevos,
          ultimoCorreo: resultado.nuevos > 0 ? ahora : estadoActual.ultimoCorreo,
          buzon: {
            ...estadoActual.buzon,
            ultimaSincronizacion: ahora,
            ultimoError: null,
          },
        };
        return { ...resultado };
      } finally {
        sincronizando = false;
      }
    },
  };
}
