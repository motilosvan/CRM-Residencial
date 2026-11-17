import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../contratos';
import { CODIGO_DEMO, crearAuthMock } from './authMock';
import { crearBuzonMock } from './buzonMock';
import { crearCorreosMock } from './correosMock';
import { CORREOS_DEMO, SOLICITUDES_DEMO } from './datos';
import { crearResumenMock } from './resumenMock';
import { getSesionMock, setSesionMock } from './sesionMockEstado';
import { actorDesdeSesionMock, crearSolicitudesMock } from './solicitudesMock';
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

describe('solicitudesMock', () => {
  it('datos demo cumplen Ley 1581 (@demo.mailflow.test), vinculan CORREOS_DEMO (id=22) y tienen estados y sugerencias variadas', () => {
    expect(SOLICITUDES_DEMO.length).toBeGreaterThanOrEqual(12);
    for (const s of SOLICITUDES_DEMO) {
      expect(s.remitente).toMatch(/@demo\.mailflow\.test$/);
      expect(s.destinos).not.toContain('ASIGNADA');
    }
    const sol22 = SOLICITUDES_DEMO.find((s) => s.id === 22);
    expect(sol22).toMatchObject({ codigo: 'SOL-000022', estado: 'NUEVA' });
    expect(SOLICITUDES_DEMO.some((s) => s.estado === 'NUEVA')).toBe(true);
    expect(
      SOLICITUDES_DEMO.some(
        (s) =>
          s.estado !== 'CERRADA' &&
          s.sugerencia?.estado === 'LISTA' &&
          (s.sugerencia.categoria !== s.categoria || s.sugerencia.prioridad !== s.prioridad),
      ),
    ).toBe(true);
  });

  it('listar ordena por peso de prioridad y fecha, filtra, pagina y restringe SOPORTE a sus asignadas', async () => {
    const srvAdmin = crearSolicitudesMock(SIN_LATENCIA);
    const todas = await srvAdmin.listar();
    expect(todas.length).toBe(SOLICITUDES_DEMO.length);

    // Orden: ALTA antes que MEDIA antes que BAJA
    const peso = { ALTA: 3, MEDIA: 2, BAJA: 1 } as const;
    for (let i = 1; i < todas.length; i++) {
      expect(peso[todas[i - 1].prioridad]).toBeGreaterThanOrEqual(peso[todas[i].prioridad]);
    }

    const nuevas = await srvAdmin.listar({ estado: 'NUEVA' });
    expect(nuevas.length).toBeGreaterThan(0);
    expect(nuevas.every((s) => s.estado === 'NUEVA')).toBe(true);

    const pag2 = await srvAdmin.listar({ limite: 3, desplazamiento: 3 });
    expect(pag2).toHaveLength(3);
    expect(pag2[0].id).toBe(todas[3].id);

    // Mutar la respuesta no altera el estado interno
    todas[0].asunto = 'Alterado';
    expect((await srvAdmin.listar())[0].asunto).not.toBe('Alterado');

    const srvSoporte = crearSolicitudesMock({
      ...SIN_LATENCIA,
      actor: { idUsuario: 2, nombre: 'Soporte Demo', rol: 'SOPORTE' },
    });
    const asignadasSoporte = await srvSoporte.listar();
    expect(asignadasSoporte.length).toBeGreaterThan(0);
    expect(asignadasSoporte.every((s) => s.idResponsable === 2)).toBe(true);

    const ajena = todas.find((s) => s.idResponsable !== 2)!;
    await expect(srvSoporte.detalle(ajena.id)).rejects.toMatchObject({ estado: 403, tipo: 'PROHIBIDO' });
    await expect(srvSoporte.detalle(999_999)).rejects.toMatchObject({ estado: 404, tipo: 'NO_ENCONTRADO' });
  });

  it('T2 (asignar): pasa NUEVA→ASIGNADA, deja historial, libera asignación previa al reasignar, 409/403/422/404', async () => {
    const srv = crearSolicitudesMock(SIN_LATENCIA);
    const antes = await srv.detalle(22);
    expect(antes.estado).toBe('NUEVA');
    expect(antes.destinos).toEqual([]);

    const r1 = await srv.asignar(22, { idResponsable: 2, versionEsperada: antes.version });
    expect(r1).toMatchObject({ sinCambios: false, estado: 'ASIGNADA', version: antes.version + 1 });

    // Mismo responsable → sinCambios: true, sin subir versión
    const idem = await srv.asignar(22, { idResponsable: 2, versionEsperada: r1.version });
    expect(idem).toEqual({ sinCambios: true, version: r1.version });

    // Reasignar a Camila (id 3) libera la asignación anterior
    const r2 = await srv.asignar(22, { idResponsable: 3, versionEsperada: r1.version });
    expect(r2).toMatchObject({ sinCambios: false, estado: 'ASIGNADA', version: r1.version + 1 });

    const despues = await srv.detalle(22);
    expect(despues.idResponsable).toBe(3);
    expect(despues.responsable).toBe('Camila Torres');
    expect(despues.destinos).toEqual(['EN_PROCESO', 'NUEVA']);
    expect(despues.asignaciones).toHaveLength(2);
    expect(despues.asignaciones[0].liberadaEn).not.toBeNull();
    expect(despues.asignaciones[1].liberadaEn).toBeNull();
    expect(despues.historial.some((h) => h.anterior === 'NUEVA' && h.nuevo === 'ASIGNADA')).toBe(true);

    // 409 versión vieja, 422 usuario inactivo/inexistente, 404 solicitud inexistente, 403 SOPORTE
    await expect(srv.asignar(22, { idResponsable: 2, versionEsperada: 1 })).rejects.toMatchObject({ estado: 409 });
    await expect(srv.asignar(22, { idResponsable: 4, versionEsperada: r2.version })).rejects.toMatchObject({ estado: 422 });
    await expect(srv.asignar(999_999, { idResponsable: 2, versionEsperada: 1 })).rejects.toMatchObject({ estado: 404 });

    const srvSoporte = crearSolicitudesMock({
      ...SIN_LATENCIA,
      actor: { idUsuario: 3, nombre: 'Camila Torres', rol: 'SOPORTE' },
    });
    await expect(srvSoporte.asignar(22, { idResponsable: 2, versionEsperada: 1 })).rejects.toMatchObject({ estado: 403 });
  });

  it('T3 (cambiarEstado): respeta transiciones, impide ASIGNADA manual, libera en NUEVA/CERRADA, 409 y 403', async () => {
    const srv = crearSolicitudesMock(SIN_LATENCIA);
    // Solicitud 22 está NUEVA: no puede saltar a EN_PROCESO ni a ASIGNADA manual ni CERRADA
    await expect(srv.cambiarEstado(22, { nuevoEstado: 'EN_PROCESO', versionEsperada: 1 })).rejects.toMatchObject({
      estado: 422,
    });
    await expect(srv.cambiarEstado(22, { nuevoEstado: 'ASIGNADA', versionEsperada: 1 })).rejects.toMatchObject({
      estado: 422,
    });

    // Asignar a Soporte Demo (id 2) → ASIGNADA → EN_PROCESO → RESUELTA → CERRADA
    const a1 = await srv.asignar(22, { idResponsable: 2, versionEsperada: 1 });
    const e1 = await srv.cambiarEstado(22, {
      nuevoEstado: 'EN_PROCESO',
      versionEsperada: a1.version,
      comentario: 'Atendiendo fuga',
    });
    expect(e1).toEqual({ idSolicitud: 22, estado: 'EN_PROCESO', version: a1.version + 1 });
    expect((await srv.detalle(22)).primeraRespuesta).not.toBeNull();

    // 409 si envía versión anterior
    await expect(srv.cambiarEstado(22, { nuevoEstado: 'RESUELTA', versionEsperada: a1.version })).rejects.toMatchObject({
      estado: 409,
    });

    const e2 = await srv.cambiarEstado(22, { nuevoEstado: 'RESUELTA', versionEsperada: e1.version });
    const detResuelta = await srv.detalle(22);
    expect(detResuelta.destinos).toEqual(['CERRADA', 'EN_PROCESO']);

    const e3 = await srv.cambiarEstado(22, { nuevoEstado: 'CERRADA', versionEsperada: e2.version });
    const detCerrada = await srv.detalle(22);
    expect(detCerrada.fechaCierre).not.toBeNull();
    expect(detCerrada.destinos).toEqual([]);
    expect(detCerrada.idResponsable).toBeNull();
    expect(detCerrada.asignaciones[0].liberadaEn).not.toBeNull();
    expect(e3.version).toBe(detCerrada.version);

    // SOPORTE no puede cambiar estado de solicitud no asignada a él (403)
    const srvOtroSoporte = crearSolicitudesMock({
      ...SIN_LATENCIA,
      actor: { idUsuario: 3, nombre: 'Camila Torres', rol: 'SOPORTE' },
    });
    const det20 = await srv.detalle(20);
    await expect(
      srvOtroSoporte.cambiarEstado(20, { nuevoEstado: 'EN_PROCESO', versionEsperada: det20.version }),
    ).rejects.toMatchObject({ estado: 403 });
  });

  it('T4 (reclasificar) y T7→T4 (aceptarSugerencia): actualizan categoría/prioridad/SLA e historial, 409, 403, 422', async () => {
    const srv = crearSolicitudesMock(SIN_LATENCIA);
    const det21 = await srv.detalle(21);
    const r = await srv.reclasificar(21, {
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      versionEsperada: det21.version,
      comentario: 'Ajuste por riesgo',
    });
    expect(r).toMatchObject({
      idSolicitud: 21,
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      version: det21.version + 1,
      sinCambios: false,
    });
    const det21Despues = await srv.detalle(21);
    expect(det21Despues.slaHoras).toBe(4);
    expect(det21Despues.historial.at(-1)?.comentario).toContain('Reclasificada:');

    // Sin cambios no sube versión
    const rSinCambios = await srv.reclasificar(21, {
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      versionEsperada: r.version,
    });
    expect(rSinCambios).toMatchObject({ sinCambios: true, version: r.version });

    // Aceptar sugerencia en solicitud con sugerencia LISTA distinta de su clasificación actual
    const conSug = SOLICITUDES_DEMO.find(
      (s) =>
        s.estado !== 'CERRADA' &&
        s.sugerencia?.estado === 'LISTA' &&
        (s.sugerencia.categoria !== s.categoria || s.sugerencia.prioridad !== s.prioridad),
    )!;
    const detSug = await srv.detalle(conSug.id);
    const acep = await srv.aceptarSugerencia(conSug.id, { versionEsperada: detSug.version, comentario: 'IA correcta' });
    expect(acep.sinCambios).toBe(false);
    expect(acep.version).toBe(detSug.version + 1);
    const detSugDespues = await srv.detalle(conSug.id);
    expect(detSugDespues.historial.at(-1)?.comentario).toContain('Sugerencia IA aceptada:');

    // 409 versión vieja, 422 sin sugerencia LISTA (solicitud 20), 403 SOPORTE
    const det20 = await srv.detalle(20);
    await expect(srv.reclasificar(21, { prioridad: 'MEDIA', versionEsperada: 1 })).rejects.toMatchObject({ estado: 409 });
    await expect(srv.aceptarSugerencia(20, { versionEsperada: det20.version })).rejects.toMatchObject({ estado: 422 });

    const srvSoporte = crearSolicitudesMock({
      ...SIN_LATENCIA,
      actor: { idUsuario: 2, nombre: 'Soporte Demo', rol: 'SOPORTE' },
    });
    await expect(srvSoporte.reclasificar(20, { prioridad: 'ALTA', versionEsperada: det20.version })).rejects.toMatchObject({
      estado: 403,
    });
    await expect(srvSoporte.aceptarSugerencia(20, { versionEsperada: det20.version })).rejects.toMatchObject({
      estado: 403,
    });
  });

  it('sincroniza actorDesdeSesionMock con authMock (SOPORTE queda restringido a sus asignadas y salir() limpia sesión)', async () => {
    setSesionMock(null);
    const auth = crearAuthMock(SIN_LATENCIA);
    const srv = crearSolicitudesMock({ ...SIN_LATENCIA, actor: () => actorDesdeSesionMock() });

    try {
      // Sin sesión cae al respaldo ADMIN
      expect(getSesionMock()).toBeNull();
      expect(actorDesdeSesionMock()).toMatchObject({ idUsuario: 1, rol: 'ADMIN' });
      expect((await srv.listar()).length).toBe(SOLICITUDES_DEMO.length);

      // Inicia sesión como soporte@demo.mailflow.test -> idUsuario 2, rol SOPORTE
      await auth.solicitarCodigo({ conjuntoId: 'cj-parques', correo: 'soporte@demo.mailflow.test' });
      await auth.verificarCodigo({ conjuntoId: 'cj-parques', correo: 'soporte@demo.mailflow.test', codigo: CODIGO_DEMO });
      expect(getSesionMock()?.usuario.correo).toBe('soporte@demo.mailflow.test');
      expect(actorDesdeSesionMock()).toEqual({ idUsuario: 2, nombre: 'Soporte Demo', rol: 'SOPORTE' });

      const deSoporte = await srv.listar();
      expect(deSoporte.length).toBeGreaterThan(0);
      expect(deSoporte.every((s) => s.idResponsable === 2)).toBe(true);
      await expect(srv.detalle(22)).rejects.toMatchObject({ estado: 403, tipo: 'PROHIBIDO' });
      await expect(srv.detalle(20)).resolves.toMatchObject({ id: 20, idResponsable: 2 });

      // Al salir se limpia sesionMockEstado
      await auth.salir();
      expect(getSesionMock()).toBeNull();
      expect(actorDesdeSesionMock()).toMatchObject({ idUsuario: 1, rol: 'ADMIN' });
    } finally {
      setSesionMock(null);
    }
  });
});
