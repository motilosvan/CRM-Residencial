import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../contratos';
import { crearBuzonMock } from './buzonMock';
import { crearResumenMock } from './resumenMock';
import { crearUsuariosMock } from './usuariosMock';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };

describe('resumenMock y buzonMock', () => {
  it('devuelven copias y respetan tasaError y AbortSignal', async () => {
    const resumen = crearResumenMock(SIN_LATENCIA);
    const a = await resumen.obtener();
    a.porEstado[0].n = 999;
    expect((await resumen.obtener()).porEstado[0].n).not.toBe(999);

    const resumenRoto = crearResumenMock({ ...SIN_LATENCIA, tasaError: 1 });
    await expect(resumenRoto.obtener()).rejects.toBeInstanceOf(ErrorApi);
    await expect(resumenRoto.obtener()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    const buzon = crearBuzonMock(SIN_LATENCIA);
    const b = await buzon.estado();
    expect(typeof b.conectado).toBe('boolean');

    const ctl = new AbortController();
    const promesa = crearBuzonMock({ latenciaMs: [50, 50] }).estado(ctl.signal);
    ctl.abort();
    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('usuariosMock', () => {
  it('listar filtra inactivos y cuentas deshabilitadas por defecto; incluirInactivos=true muestra todo', async () => {
    const srv = crearUsuariosMock(SIN_LATENCIA);
    const activos = await srv.listar();
    expect(activos.every((u) => u.activo && u.cuentaActiva)).toBe(true);

    const todos = await srv.listar({ incluirInactivos: true });
    expect(todos.length).toBeGreaterThan(activos.length);
    expect(todos.some((u) => !u.activo)).toBe(true);
    expect(todos.some((u) => !u.cuentaActiva)).toBe(true);
  });

  it('agregar: crea miembro nuevo, rechaza 409 miembro activo, reactiva inactivo y rechaza 422 cuenta deshabilitada', async () => {
    const srv = crearUsuariosMock({
      ...SIN_LATENCIA,
      iniciales: [
        { id: 1, nombre: 'Admin', correo: 'admin@demo.mailflow.test', rol: 'ADMIN', activo: true, version: 1, cuentaActiva: true },
        { id: 2, nombre: 'Inactivo', correo: 'inactivo@demo.mailflow.test', rol: 'SOPORTE', activo: false, version: 2, cuentaActiva: true },
        { id: 3, nombre: 'Bloqueado', correo: 'bloqueado@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: false },
      ],
      cuentasDeshabilitadas: ['deshabilitada@demo.mailflow.test'],
    });

    const creado = await srv.agregar({ nombre: '  Laura Gómez ', correo: 'LAURA@DEMO.MAILFLOW.TEST', rol: 'SOPORTE' });
    expect(creado).toMatchObject({ nombre: 'Laura Gómez', correo: 'laura@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: true });

    await expect(srv.agregar({ nombre: 'Admin', correo: 'admin@demo.mailflow.test', rol: 'SOPORTE' })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
      mensaje: 'Ese usuario ya pertenece al conjunto',
    });

    const reactivado = await srv.agregar({ nombre: 'Otro Nombre', correo: 'inactivo@demo.mailflow.test', rol: 'ADMIN' });
    expect(reactivado).toMatchObject({ id: 2, nombre: 'Inactivo', rol: 'ADMIN', activo: true, version: 3 });

    await expect(srv.agregar({ nombre: 'Bloqueado', correo: 'bloqueado@demo.mailflow.test', rol: 'SOPORTE' })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
      mensaje: 'Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto',
    });

    await expect(srv.agregar({ nombre: 'Externa', correo: 'deshabilitada@demo.mailflow.test', rol: 'SOPORTE' })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
      mensaje: 'Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto',
    });
  });

  it('actualizar: incrementa versión, rechaza 409 versión vieja y 422 último ADMIN', async () => {
    const srv = crearUsuariosMock({
      ...SIN_LATENCIA,
      iniciales: [
        { id: 1, nombre: 'Admin Único', correo: 'admin@demo.mailflow.test', rol: 'ADMIN', activo: true, version: 1, cuentaActiva: true },
        { id: 2, nombre: 'Soporte', correo: 'soporte@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: true },
      ],
    });

    // No puede degradar ni desactivar al último ADMIN
    await expect(srv.actualizar(1, { rol: 'SOPORTE', versionEsperada: 1 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
      mensaje: 'El conjunto debe conservar al menos un administrador activo',
    });
    await expect(srv.actualizar(1, { activo: false, versionEsperada: 1 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });

    // Promover a soporte a ADMIN sí funciona y sube versión
    const promovido = await srv.actualizar(2, { rol: 'ADMIN', versionEsperada: 1 });
    expect(promovido).toMatchObject({ id: 2, rol: 'ADMIN', version: 2 });

    // Versión vieja -> 409
    await expect(srv.actualizar(2, { rol: 'SOPORTE', versionEsperada: 1 })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    // Ahora sí puede degradar al 1 porque el 2 es ADMIN activo
    const degradado = await srv.actualizar(1, { rol: 'SOPORTE', versionEsperada: 1 });
    expect(degradado).toMatchObject({ id: 1, rol: 'SOPORTE', version: 2 });

    // ID inexistente -> 404
    await expect(srv.actualizar(999, { activo: false, versionEsperada: 1 })).rejects.toMatchObject({
      estado: 404,
      tipo: 'NO_ENCONTRADO',
    });
  });
});
