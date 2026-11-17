import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../contratos';
import { respuesta, simularFetch } from './ayudas.test-util';
import { crearBuzonHttp } from './buzonHttp';
import { crearResumenHttp } from './resumenHttp';
import { crearUsuariosHttp } from './usuariosHttp';

afterEach(() => vi.unstubAllGlobals());

function cuerpoDe(f: ReturnType<typeof simularFetch>) {
  return JSON.parse(String(f.mock.calls[0][1]?.body));
}

describe('resumenHttp', () => {
  const resumenValido = {
    porEstado: [
      { estado: 'NUEVA', n: 2 },
      { estado: 'RESUELTA', n: 5 },
    ],
    carga: [{ idUsuario: 2, nombre: 'Soporte Demo', abiertas: 2 }],
    respuesta: [{ categoria: 'MANTENIMIENTO', total: 3, minutosPromedio: 45, dentroSla: 3 }],
  };

  it('obtener: GET /api/resumen valida la forma y pasa signal', async () => {
    const ctl = new AbortController();
    const f = simularFetch(async () => respuesta(200, resumenValido));
    expect(await crearResumenHttp().obtener(ctl.signal)).toEqual(resumenValido);
    expect(f).toHaveBeenCalledWith('/api/resumen', expect.objectContaining({ credentials: 'same-origin', signal: ctl.signal }));
  });

  it('obtener: forma inesperada → ErrorApi tipo RED; 401/500 → ErrorApi', async () => {
    simularFetch(async () => respuesta(200, { porEstado: 'mal' }));
    await expect(crearResumenHttp().obtener()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    simularFetch(async () => respuesta(401, { error: 'Sesión no iniciada' }));
    await expect(crearResumenHttp().obtener()).rejects.toMatchObject({ tipo: 'NO_AUTENTICADO', estado: 401 });

    simularFetch(async () => respuesta(500, { error: 'Error interno' }));
    await expect(crearResumenHttp().obtener()).rejects.toMatchObject({ tipo: 'SERVIDOR', estado: 500 });
  });
});

describe('buzonHttp', () => {
  const sinBuzon = {
    cuentas: [],
    totalCorreos: 0,
    ultimoCorreo: null,
    conectado: false,
    buzon: null,
  };

  const conError = {
    cuentas: [{ cuenta: '1:mesa@demo.mailflow.test/INBOX', ultimoUid: 15, actualizadoEn: '2026-11-16T10:00:00.000Z' }],
    totalCorreos: 12,
    ultimoCorreo: '2026-11-16T09:50:00.000Z',
    conectado: true,
    buzon: {
      correo: 'mesa@demo.mailflow.test',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      buzon: 'INBOX',
      diasIniciales: 7,
      marcarLeido: false,
      activo: true,
      ultimaSincronizacion: '2026-11-16T10:00:00.000Z',
      ultimoError: 'AUTENTICACION',
      version: 2,
    },
  };

  it('estado: GET /api/gateway/estado sin buzón y con buzón con ultimoError', async () => {
    const f = simularFetch(async () => respuesta(200, sinBuzon));
    expect(await crearBuzonHttp().estado()).toEqual(sinBuzon);
    expect(f.mock.calls[0][0]).toBe('/api/gateway/estado');

    simularFetch(async () => respuesta(200, conError));
    expect(await crearBuzonHttp().estado()).toEqual(conError);
  });

  it('estado: forma inesperada → RED; error de red → ErrorApi RED', async () => {
    simularFetch(async () => respuesta(200, { conectado: 'si' }));
    await expect(crearBuzonHttp().estado()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    simularFetch(async () => {
      throw new TypeError('red');
    });
    const err = await crearBuzonHttp().estado().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorApi);
    expect(err).toMatchObject({ tipo: 'RED', estado: 0 });
  });
});

describe('usuariosHttp', () => {
  const usuarioBase = {
    id: 12,
    nombre: 'Luz Pérez',
    correo: 'luz@demo.mailflow.test',
    rol: 'SOPORTE' as const,
    activo: true,
    version: 1,
    cuentaActiva: true,
  };

  it('listar: GET /api/usuarios y query params opcionales', async () => {
    const f1 = simularFetch(async () => respuesta(200, [usuarioBase]));
    expect(await crearUsuariosHttp().listar()).toEqual([usuarioBase]);
    expect(f1.mock.calls[0][0]).toBe('/api/usuarios');

    const f2 = simularFetch(async () => respuesta(200, [usuarioBase]));
    await crearUsuariosHttp().listar({ incluirInactivos: true });
    expect(f2.mock.calls[0][0]).toBe('/api/usuarios?incluirInactivos=true');

    const f3 = simularFetch(async () => respuesta(200, []));
    await crearUsuariosHttp().listar({ rol: 'ADMIN', incluirInactivos: false });
    expect(f3.mock.calls[0][0]).toBe('/api/usuarios?rol=ADMIN');
  });

  it('listar: exige cuentaActiva booleana en la respuesta', async () => {
    const sinCuentaActiva = { id: 12, nombre: 'Luz', correo: 'luz@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1 };
    simularFetch(async () => respuesta(200, [sinCuentaActiva]));
    await expect(crearUsuariosHttp().listar()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });
  });

  it('agregar: POST /api/usuarios y errores 409 / 422 con mensaje de la API', async () => {
    const entrada = { nombre: 'Luz Pérez', correo: 'luz@demo.mailflow.test', rol: 'SOPORTE' as const };
    const f = simularFetch(async () => respuesta(201, usuarioBase));
    expect(await crearUsuariosHttp().agregar(entrada)).toEqual(usuarioBase);
    expect(f.mock.calls[0][0]).toBe('/api/usuarios');
    expect(f.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f)).toEqual(entrada);

    simularFetch(async () => respuesta(409, { error: 'Ese usuario ya pertenece al conjunto' }));
    await expect(crearUsuariosHttp().agregar(entrada)).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
      mensaje: 'Ese usuario ya pertenece al conjunto',
    });

    simularFetch(async () => respuesta(422, { error: 'Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto' }));
    await expect(crearUsuariosHttp().agregar(entrada)).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
      mensaje: 'Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto',
    });
  });

  it('actualizar: PATCH /api/usuarios/:id con versionEsperada y errores 409 / 422 / 404', async () => {
    const actualizado = { ...usuarioBase, rol: 'ADMIN' as const, version: 2 };
    const f = simularFetch(async () => respuesta(200, actualizado));
    expect(await crearUsuariosHttp().actualizar(12, { rol: 'ADMIN', versionEsperada: 1 })).toEqual(actualizado);
    expect(f.mock.calls[0][0]).toBe('/api/usuarios/12');
    expect(f.mock.calls[0][1]?.method).toBe('PATCH');
    expect(cuerpoDe(f)).toEqual({ rol: 'ADMIN', versionEsperada: 1 });

    simularFetch(async () => respuesta(409, { error: 'La membresía cambió (versión 2, se esperaba 1). Recárguela.' }));
    await expect(crearUsuariosHttp().actualizar(12, { activo: false, versionEsperada: 1 })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    simularFetch(async () => respuesta(422, { error: 'El conjunto debe conservar al menos un administrador activo' }));
    await expect(crearUsuariosHttp().actualizar(12, { rol: 'SOPORTE', versionEsperada: 2 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
      mensaje: 'El conjunto debe conservar al menos un administrador activo',
    });

    simularFetch(async () => respuesta(404, { error: 'El usuario no pertenece al conjunto' }));
    await expect(crearUsuariosHttp().actualizar(999, { rol: 'ADMIN', versionEsperada: 1 })).rejects.toMatchObject({
      estado: 404,
      tipo: 'NO_ENCONTRADO',
    });
  });
});
