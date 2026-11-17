import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../contratos';
import { CODIGO_DEMO, crearAuthMock } from './authMock';
import { crearBuzonMock } from './buzonMock';
import { crearCatalogosMock } from './catalogosMock';
import { crearConjuntosMock } from './conjuntosMock';
import { crearCorreosMock } from './correosMock';
import { CATALOGOS_DEMO, CORREOS_DEMO, RESIDENTES_DEMO, SOLICITUDES_DEMO } from './datos';
import { crearEstadoPanelMock } from './estadoCompartido';
import { crearIdentidadMock } from './identidadMock';
import { crearResidentesMock } from './residentesMock';
import { crearResumenMock } from './resumenMock';
import { getSesionMock, setSesionMock } from './sesionMockEstado';
import { actorDesdeSesionMock, crearSolicitudesMock } from './solicitudesMock';
import { crearUsuariosMock } from './usuariosMock';
import { crearValidacionMock } from './validacionMock';

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

describe('residentesMock y validacionMock', () => {
  it('RESIDENTES_DEMO cumple Ley 1581 (@demo.mailflow.test), coherencia con CORREOS_DEMO y sugerencias pendientes ricas', () => {
    expect(RESIDENTES_DEMO.length).toBeGreaterThanOrEqual(4);
    for (const r of RESIDENTES_DEMO) {
      if (r.correo !== null) {
        expect(r.correo).toMatch(/@demo\.mailflow\.test$/);
      }
    }
    expect(RESIDENTES_DEMO.some((r) => !r.activo)).toBe(true);
    expect(RESIDENTES_DEMO.some((r) => r.correo === null)).toBe(true);

    // Al menos 1 correo sin residente vinculado
    expect(CORREOS_DEMO.some((c) => c.idResidente === null)).toBe(true);

    // Coherencia entre CORREOS_DEMO con idResidente y RESIDENTES_DEMO
    for (const c of CORREOS_DEMO.filter((x) => x.idResidente !== null)) {
      const res = RESIDENTES_DEMO.find((r) => r.id === c.idResidente);
      expect(res).toBeDefined();
      expect(res?.nombre).toBe(c.residente);
      expect(res?.unidad).toBe(c.unidad);
    }

    // Al menos 2 solicitudes con sugerencia LISTA cuya clasificación difiere de la actual
    const pendientes = SOLICITUDES_DEMO.filter(
      (s) =>
        s.estado !== 'CERRADA' &&
        s.sugerencia?.estado === 'LISTA' &&
        (s.sugerencia.categoria !== s.categoria || s.sugerencia.prioridad !== s.prioridad),
    );
    expect(pendientes.length).toBeGreaterThanOrEqual(2);
  });

  it('residentesMock: listar filtra por q y soloActivos, ordena por unidad/nombre; crear normaliza, vincula y rechaza 409/422', async () => {
    const estado = crearEstadoPanelMock();
    const srv = crearResidentesMock({ ...SIN_LATENCIA, estado });

    const todos = await srv.listar();
    expect(todos.length).toBe(RESIDENTES_DEMO.length);
    const activos = await srv.listar({ soloActivos: true });
    expect(activos.every((r) => r.activo)).toBe(true);
    expect(activos.length).toBeLessThan(todos.length);

    const porCorreo = await srv.listar({ q: 'elena.vargas' });
    expect(porCorreo.some((r) => r.nombre === 'Elena Vargas')).toBe(true);

    // Duplicado por correo (insensible a mayúsculas) -> 409
    await expect(
      srv.crear({ nombre: 'Dup', unidad: 'T1-999', correo: 'ELENA.VARGAS@DEMO.MAILFLOW.TEST' }),
    ).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });

    // Datos inválidos -> 422
    await expect(srv.crear({ nombre: '', unidad: 'T1-101' })).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });

    // Crear residente con el correo del correo huérfano #2 (visitante.ext@demo.mailflow.test) vincula automáticamente
    const nuevo = await srv.crear({
      nombre: '  Visitante Nuevo ',
      unidad: ' T3-105 ',
      correo: ' VISITANTE.EXT@DEMO.MAILFLOW.TEST ',
      telefono: ' 3009998877 ',
    });
    expect(nuevo).toMatchObject({
      nombre: 'Visitante Nuevo',
      unidad: 'T3-105',
      correo: 'visitante.ext@demo.mailflow.test',
      telefono: '3009998877',
      activo: true,
      version: 1,
      totalSolicitudes: 1,
    });
  });

  it('residentesMock: actualizar sube versión, no-op no sube versión, rechaza 409 versión/correo y 404', async () => {
    const srv = crearResidentesMock(SIN_LATENCIA);
    const lista = await srv.listar();
    const elena = lista.find((r) => r.nombre === 'Elena Vargas')!;

    // Sin cambios -> mantiene versión
    const sinCambios = await srv.actualizar(elena.id, { nombre: elena.nombre, versionEsperada: elena.version });
    expect(sinCambios.version).toBe(elena.version);

    // Cambio real -> sube versión
    const editada = await srv.actualizar(elena.id, { unidad: 'T2-401A', versionEsperada: elena.version });
    expect(editada).toMatchObject({ unidad: 'T2-401A', version: elena.version + 1 });

    // Versión vieja -> 409
    await expect(srv.actualizar(elena.id, { activo: false, versionEsperada: elena.version })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    // Correo de otro residente -> 409
    const jorge = lista.find((r) => r.nombre === 'Jorge Salazar')!;
    await expect(
      srv.actualizar(elena.id, { correo: jorge.correo, versionEsperada: editada.version }),
    ).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });

    // Inexistente -> 404
    await expect(srv.actualizar(999_999, { activo: false, versionEsperada: 1 })).rejects.toMatchObject({
      estado: 404,
      tipo: 'NO_ENCONTRADO',
    });
  });

  it('residentesMock.vincularCorreo y validacionMock: actualización cruzada en memoria, 422 residente inactivo y 409 duplicado', async () => {
    const estado = crearEstadoPanelMock();
    const correosSrv = crearCorreosMock({ ...SIN_LATENCIA, estado });
    const solicitudesSrv = crearSolicitudesMock({ ...SIN_LATENCIA, estado });
    const residentesSrv = crearResidentesMock({ ...SIN_LATENCIA, estado });
    const validacionSrv = crearValidacionMock({ ...SIN_LATENCIA, estado });

    const colaInicial = await validacionSrv.obtener();
    expect(colaInicial.sugerencias.length).toBeGreaterThanOrEqual(2);
    expect(colaInicial.remitentesSinResidente.length).toBeGreaterThanOrEqual(2);

    // 1) Aceptar sugerencia IA -> sale de validacion.obtener().sugerencias
    const sug1 = colaInicial.sugerencias[0];
    await solicitudesSrv.aceptarSugerencia(sug1.idSolicitud, { versionEsperada: sug1.version });
    const trasAceptar = await validacionSrv.obtener();
    expect(trasAceptar.sugerencias.some((s) => s.idSolicitud === sug1.idSolicitud)).toBe(false);

    // 2) Reclasificar otra sugerencia -> sale de validacion.obtener().sugerencias
    if (trasAceptar.sugerencias.length > 0) {
      const sug2 = trasAceptar.sugerencias[0];
      await solicitudesSrv.reclasificar(sug2.idSolicitud, {
        categoria: sug2.sugerencia.categoria,
        prioridad: sug2.sugerencia.prioridad,
        versionEsperada: sug2.version,
      });
      const trasReclas = await validacionSrv.obtener();
      expect(trasReclas.sugerencias.some((s) => s.idSolicitud === sug2.idSolicitud)).toBe(false);
    }

    // 3) Vincular correo huérfano a residente inactivo -> 422
    const correoHuerfano = colaInicial.remitentesSinResidente[0];
    const inactivo = (await residentesSrv.listar()).find((r) => !r.activo)!;
    await expect(
      residentesSrv.vincularCorreo(correoHuerfano.id, { idResidente: inactivo.id }),
    ).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });

    // 4) Vincular correo huérfano a residente existente activo -> sale de remitentesSinResidente y actualiza correos/residente
    const elena = (await residentesSrv.listar({ soloActivos: true })).find((r) => r.nombre === 'Elena Vargas')!;
    const vinculado = await residentesSrv.vincularCorreo(correoHuerfano.id, { idResidente: elena.id });
    expect(vinculado).toMatchObject({ id: correoHuerfano.id, idResidente: elena.id, residente: 'Elena Vargas' });

    const detalleCorreo = await correosSrv.detalle(correoHuerfano.id);
    expect(detalleCorreo.idResidente).toBe(elena.id);
    const elenaDespues = (await residentesSrv.listar()).find((r) => r.id === elena.id)!;
    expect(elenaDespues.totalSolicitudes).toBe(elena.totalSolicitudes + (correoHuerfano.idSolicitud ? 1 : 0));
    expect((await validacionSrv.obtener()).remitentesSinResidente.some((c) => c.id === correoHuerfano.id)).toBe(false);

    // Re-vincular idempotentemente mismo idResidente funciona; con otro idResidente o nuevo residente da 409
    await expect(residentesSrv.vincularCorreo(correoHuerfano.id, { idResidente: elena.id })).resolves.toMatchObject({
      id: correoHuerfano.id,
      idResidente: elena.id,
    });
    const jorge = (await residentesSrv.listar({ soloActivos: true })).find((r) => r.nombre === 'Jorge Salazar')!;
    await expect(residentesSrv.vincularCorreo(correoHuerfano.id, { idResidente: jorge.id })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    // 5) Vincular segundo correo huérfano creando residente nuevo (y error 409 si se intenta crear otro con correo duplicado)
    const segundoHuerfano = (await validacionSrv.obtener()).remitentesSinResidente[0];
    const detCreado = await residentesSrv.vincularCorreo(segundoHuerfano.id, {
      residente: { nombre: 'Vecino Registrado', unidad: 'T3-404', telefono: '3105556677', usarCorreoRemitente: true },
    });
    expect(detCreado).toMatchObject({ id: segundoHuerfano.id, residente: 'Vecino Registrado', unidad: 'T3-404' });
    expect((await validacionSrv.obtener()).remitentesSinResidente.some((c) => c.id === segundoHuerfano.id)).toBe(false);

    // Crear un residente con ese mismo correo ya existente -> 409
    await expect(
      residentesSrv.crear({ nombre: 'Otro', unidad: 'T1-101', correo: segundoHuerfano.remitente }),
    ).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });
  });
});

describe('identidadMock y catalogosMock', () => {
  it('identidadMock: obtener devuelve copia con version; actualizar incrementa version, normaliza y maneja no-op, 409 y 422', async () => {
    const estado = crearEstadoPanelMock();
    const srv = crearIdentidadMock({ ...SIN_LATENCIA, estado, conjuntoId: 'cj-parques' });

    const inicial = await srv.obtener();
    expect(inicial).toMatchObject({
      id: 'cj-parques',
      slug: 'parque-central-occidente',
      nombre: 'Parque Central de Occidente',
      version: 1,
    });
    inicial.nombre = 'Mutado';
    expect((await srv.obtener()).nombre).toBe('Parque Central de Occidente');

    // No-op no sube versión
    const sinCambios = await srv.actualizar({ nombre: 'Parque Central de Occidente', versionEsperada: 1 });
    expect(sinCambios.version).toBe(1);

    // Actualiza nombre, logo relativo y paleta en minúsculas -> normaliza a MAYÚSCULAS y sube versión
    const actualizado = await srv.actualizar({
      nombre: '  Parque Central Sur  ',
      logoUrl: ' /logos/parque.svg ',
      colorPrimario: '#1e3a5f',
      colorAcento: '#e0a458',
      colorSecundario: '#2b4c7e',
      versionEsperada: 1,
    });
    expect(actualizado).toEqual({
      id: 'cj-parques',
      slug: 'parque-central-occidente',
      nombre: 'Parque Central Sur',
      logoUrl: '/logos/parque.svg',
      paleta: { primario: '#1E3A5F', acento: '#E0A458', secundario: '#2B4C7E' },
      version: 2,
    });

    // Versión desactualizada -> 409
    await expect(srv.actualizar({ nombre: 'Vieja', versionEsperada: 1 })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    // Paleta incompleta -> 422
    await expect(srv.actualizar({ colorPrimario: null, versionEsperada: 2 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });
    await expect(srv.actualizar({ colorAcento: null, versionEsperada: 2 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });

    // Logo inválido -> 422
    for (const mala of ['javascript:alert(1)', 'data:image/png;base64,xx', '//evil.test/a.png', '/\\evil', 'logo.png']) {
      await expect(srv.actualizar({ logoUrl: mala, versionEsperada: 2 })).rejects.toMatchObject({
        estado: 422,
        tipo: 'INVALIDO',
      });
    }

    // Color inválido -> 422
    await expect(
      srv.actualizar({ colorPrimario: '#123', colorAcento: '#E0A458', versionEsperada: 2 }),
    ).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });

    // Restablecer paleta (primario y acento null) limpia también secundario y quita logoUrl con ''
    const restablecido = await srv.actualizar({
      logoUrl: '   ',
      colorPrimario: null,
      colorAcento: null,
      colorSecundario: '#112233',
      versionEsperada: 2,
    });
    expect(restablecido.logoUrl).toBeUndefined();
    expect(restablecido.paleta).toBeUndefined();
    expect(restablecido.version).toBe(3);

    // Poner solo un color desde null -> 422
    await expect(srv.actualizar({ colorPrimario: '#1E3A5F', versionEsperada: 3 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });
  });

  it('identidadMock comparte estado con conjuntosMock y authMock al actualizar y recargar sesión', async () => {
    setSesionMock(null);
    const estado = crearEstadoPanelMock();
    const conjuntosSrv = crearConjuntosMock({ ...SIN_LATENCIA, estado });
    const authSrv = crearAuthMock({ ...SIN_LATENCIA, estado, ahora: () => Date.now() });
    const identidadSrv = crearIdentidadMock({ ...SIN_LATENCIA, estado });

    try {
      await authSrv.solicitarCodigo({ conjuntoId: 'cj-parques', correo: 'admin@demo.mailflow.test' });
      await authSrv.verificarCodigo({
        conjuntoId: 'cj-parques',
        correo: 'admin@demo.mailflow.test',
        codigo: CODIGO_DEMO,
      });

      const upd = await identidadSrv.actualizar({
        nombre: 'Parque Renovado',
        logoUrl: 'https://cdn.demo.mailflow.test/parque.png',
        colorPrimario: '#1E3A5F',
        colorAcento: '#E0A458',
        colorSecundario: null,
        versionEsperada: 1,
      });
      expect(upd.nombre).toBe('Parque Renovado');

      const lista = await conjuntosSrv.listar();
      expect(lista.find((c) => c.id === 'cj-parques')).toEqual({
        id: 'cj-parques',
        slug: 'parque-central-occidente',
        nombre: 'Parque Renovado',
        logoUrl: 'https://cdn.demo.mailflow.test/parque.png',
        paleta: { primario: '#1E3A5F', acento: '#E0A458' },
      });

      const recargada = await authSrv.sesion();
      expect(recargada?.conjuntoActivo).toMatchObject({
        id: 'cj-parques',
        nombre: 'Parque Renovado',
        logoUrl: 'https://cdn.demo.mailflow.test/parque.png',
        paleta: { primario: '#1E3A5F', acento: '#E0A458' },
      });

      await authSrv.cambiarConjunto('cj-nogal');
      const devuelta = await authSrv.cambiarConjunto('cj-parques');
      expect(devuelta.conjuntoActivo.nombre).toBe('Parque Renovado');
    } finally {
      setSesionMock(null);
    }
  });

  it('catalogosMock devuelve las 5 categorías, 3 prioridades con SLA, urgencias, 5 estados y 6 transiciones', async () => {
    const srv = crearCatalogosMock(SIN_LATENCIA);
    const cat = await srv.obtener();

    expect(cat.categorias.map((c) => c.nombre)).toEqual([
      'SEGURIDAD',
      'MANTENIMIENTO',
      'FACTURACION',
      'ADMINISTRATIVO',
      'SIN_CLASIFICAR',
    ]);
    expect(cat.categorias.find((c) => c.nombre === 'SEGURIDAD')).toMatchObject({
      prioridadBase: 'ALTA',
    });
    expect(cat.categorias.find((c) => c.nombre === 'SEGURIDAD')!.palabrasClave.length).toBeGreaterThan(10);
    expect(cat.categorias.find((c) => c.nombre === 'SIN_CLASIFICAR')!.palabrasClave).toEqual([]);

    expect(cat.prioridades).toEqual([
      { id: 1, nombre: 'ALTA', peso: 3, slaHoras: 4 },
      { id: 2, nombre: 'MEDIA', peso: 2, slaHoras: 24 },
      { id: 3, nombre: 'BAJA', peso: 1, slaHoras: 72 },
    ]);
    expect(cat.palabrasClaveUrgencia.length).toBeGreaterThan(10);
    expect(cat.estados.map((e) => e.nombre)).toEqual(['NUEVA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA']);
    expect(cat.estados.filter((e) => e.esFinal).map((e) => e.nombre)).toEqual(['CERRADA']);
    expect(cat.transiciones).toEqual(CATALOGOS_DEMO.transiciones);
    expect(cat.transiciones).toHaveLength(6);

    cat.categorias[0].nombre = 'OTRA' as never;
    expect((await srv.obtener()).categorias[0].nombre).toBe('SEGURIDAD');

    const roto = crearCatalogosMock({ ...SIN_LATENCIA, tasaError: 1 });
    await expect(roto.obtener()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    const ctl = new AbortController();
    const promesa = crearCatalogosMock({ latenciaMs: [50, 50] }).obtener(ctl.signal);
    ctl.abort();
    await expect(promesa).rejects.toMatchObject({ name: 'AbortError' });
  });
});
