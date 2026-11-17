import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../contratos';
import { crearBuzonMock } from './buzonMock';
import { crearCorreosMock } from './correosMock';
import { CORREOS_DEMO } from './datos';
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

describe('buzonMock · guardar, desconectar y sincronizar', () => {
  const sinBuzon = {
    cuentas: [],
    totalCorreos: 0,
    ultimoCorreo: null,
    conectado: false,
    buzon: null,
  };

  it('conecta, reconecta subiendo versión, rechaza contraseña inválida (422) y versión vieja (409)', async () => {
    const srv = crearBuzonMock({ ...SIN_LATENCIA, estadoInicial: sinBuzon });

    await expect(
      srv.guardar({ correo: 'mesa@demo.mailflow.test', contrasena: 'invalida' }),
    ).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });
    expect((await srv.estado()).conectado).toBe(false);

    const primero = await srv.guardar({
      correo: '  MESA@DEMO.MAILFLOW.TEST ',
      contrasena: 'abcd efgh ijkl mnop',
      buzon: 'INBOX',
      diasIniciales: 14,
      marcarLeido: true,
    });
    expect(primero.conectado).toBe(true);
    expect(primero.buzon).toMatchObject({
      correo: 'mesa@demo.mailflow.test',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      buzon: 'INBOX',
      diasIniciales: 14,
      marcarLeido: true,
      activo: true,
      version: 1,
      ultimoError: null,
    });

    await expect(
      srv.guardar({ correo: 'mesa@demo.mailflow.test', contrasena: 'abcd efgh ijkl mnop', versionEsperada: 9 }),
    ).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });

    const segundo = await srv.guardar({
      correo: 'mesa@demo.mailflow.test',
      contrasena: 'qwer tyui opas dfgh',
      versionEsperada: 1,
    });
    expect(segundo.buzon?.version).toBe(2);
  });

  it('desconectar: 404 si nunca se conectó, 409 versión vieja, 200 al desconectar e idempotente', async () => {
    const vacio = crearBuzonMock({ ...SIN_LATENCIA, estadoInicial: sinBuzon });
    await expect(vacio.desconectar()).rejects.toMatchObject({ estado: 404, tipo: 'NO_ENCONTRADO' });

    const srv = crearBuzonMock(SIN_LATENCIA);
    await expect(srv.desconectar(99)).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });

    const off = await srv.desconectar(1);
    expect(off.conectado).toBe(false);
    expect(off.buzon?.activo).toBe(false);
    expect(off.buzon?.version).toBe(2);

    const idem = await srv.desconectar(2);
    expect(idem.buzon?.version).toBe(2);
  });

  it('sincronizar: 422 si desconectado, devuelve conteos y actualiza estado; 409 si concurren dos llamadas', async () => {
    const desconectado = crearBuzonMock({ ...SIN_LATENCIA, estadoInicial: sinBuzon });
    await expect(desconectado.sincronizar()).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });

    const srv = crearBuzonMock(SIN_LATENCIA);
    const r = await srv.sincronizar();
    expect(r).toEqual(
      expect.objectContaining({
        revisados: expect.any(Number),
        nuevos: expect.any(Number),
        duplicados: expect.any(Number),
        respaldos: expect.any(Number),
        pendientes: expect.any(Boolean),
      }),
    );
    const despues = await srv.estado();
    expect(despues.buzon?.ultimoError).toBeNull();
    expect(despues.buzon?.ultimaSincronizacion).toBeTruthy();

    const lento = crearBuzonMock({ latenciaMs: [40, 40] });
    const p1 = lento.sincronizar();
    const p2 = lento.sincronizar();
    await expect(p2).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });
    await expect(p1).resolves.toMatchObject({ revisados: expect.any(Number) });
  });
});

describe('correosMock', () => {
  it('datos demo cumplen Ley 1581 (@demo.mailflow.test) e incluyen casos con y sin residente y sugerencia IA', () => {
    expect(CORREOS_DEMO.length).toBeGreaterThanOrEqual(4);
    for (const c of CORREOS_DEMO) {
      expect(c.remitente).toMatch(/@demo\.mailflow\.test$/);
    }
    expect(CORREOS_DEMO.some((c) => c.idResidente === null && c.residente === null)).toBe(true);
    expect(CORREOS_DEMO.some((c) => c.idResidente !== null && c.residente !== null)).toBe(true);
    expect(CORREOS_DEMO.some((c) => c.sugerencia?.estado === 'LISTA')).toBe(true);
    expect(CORREOS_DEMO.some((c) => c.sugerencia === null)).toBe(true);
  });

  it('listar ordena más recientes primero, filtra por q, pagina y recorta extracto a 200 caracteres', async () => {
    const srv = crearCorreosMock(SIN_LATENCIA);
    const todos = await srv.listar();
    expect(todos.total).toBe(CORREOS_DEMO.length);
    for (let i = 1; i < todos.correos.length; i++) {
      const prev = new Date(todos.correos[i - 1].fechaRecepcion).getTime();
      const curr = new Date(todos.correos[i].fechaRecepcion).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
    for (const f of todos.correos) {
      expect(f.extracto.length).toBeLessThanOrEqual(200);
    }

    const pagina2 = await srv.listar({ limite: 2, desplazamiento: 2 });
    expect(pagina2.total).toBe(todos.total);
    expect(pagina2.correos).toHaveLength(2);
    expect(pagina2.correos[0].id).toBe(todos.correos[2].id);

    const sinResidente = todos.correos.find((c) => c.idResidente === null)!;
    const porRemitente = await srv.listar({ q: sinResidente.remitente });
    expect(porRemitente.correos.some((c) => c.id === sinResidente.id)).toBe(true);
  });

  it('detalle devuelve cuerpo, cuerpoEnmascarado y sugerencia; 404 si no existe y respeta AbortSignal/tasaError', async () => {
    const srv = crearCorreosMock(SIN_LATENCIA);
    const { correos } = await srv.listar();
    const d = await srv.detalle(correos[0].id);
    expect(d.cuerpo.length).toBeGreaterThan(0);
    expect(d.cuerpoEnmascarado.length).toBeGreaterThan(0);

    await expect(srv.detalle(999_999)).rejects.toMatchObject({ estado: 404, tipo: 'NO_ENCONTRADO' });

    const roto = crearCorreosMock({ ...SIN_LATENCIA, tasaError: 1 });
    await expect(roto.listar()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    const ctl = new AbortController();
    const promesa = crearCorreosMock({ latenciaMs: [50, 50] }).detalle(correos[0].id, ctl.signal);
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
