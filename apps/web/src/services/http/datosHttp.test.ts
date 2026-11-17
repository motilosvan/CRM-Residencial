import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../contratos';
import { respuesta, simularFetch } from './ayudas.test-util';
import { crearBuzonHttp } from './buzonHttp';
import { crearCorreosHttp } from './correosHttp';
import { crearResidentesHttp } from './residentesHttp';
import { crearResumenHttp } from './resumenHttp';
import { crearSolicitudesHttp } from './solicitudesHttp';
import { crearUsuariosHttp } from './usuariosHttp';
import { crearValidacionHttp } from './validacionHttp';

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

  it('guardar: PUT /api/buzon envía cuerpo y valida EstadoGateway; 422 / 409 → ErrorApi', async () => {
    const entrada = {
      correo: 'mesa@demo.mailflow.test',
      contrasena: 'abcd efgh ijkl mnop',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      buzon: 'INBOX',
      diasIniciales: 7,
      marcarLeido: false,
      versionEsperada: 1,
    };
    const conectado = { ...conError, buzon: { ...conError.buzon, ultimoError: null, version: 2 } };
    const f = simularFetch(async () => respuesta(200, conectado));
    expect(await crearBuzonHttp().guardar(entrada)).toEqual(conectado);
    expect(f.mock.calls[0][0]).toBe('/api/buzon');
    expect(f.mock.calls[0][1]?.method).toBe('PUT');
    expect(cuerpoDe(f)).toEqual(entrada);

    simularFetch(async () => respuesta(422, { error: 'El servidor de correo rechazó el inicio de sesión.' }));
    await expect(crearBuzonHttp().guardar(entrada)).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
      mensaje: 'El servidor de correo rechazó el inicio de sesión.',
    });

    simularFetch(async () => respuesta(409, { error: 'El buzón cambió (versión 2, se esperaba 1). Recárguelo.' }));
    await expect(crearBuzonHttp().guardar(entrada)).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });
  });

  it('desconectar: POST /api/buzon/desconectar con versionEsperada; 409 / 404 → ErrorApi', async () => {
    const desconectado = {
      ...conError,
      conectado: false,
      buzon: { ...conError.buzon, activo: false, version: 3 },
    };
    const f = simularFetch(async () => respuesta(200, desconectado));
    expect(await crearBuzonHttp().desconectar(2)).toEqual(desconectado);
    expect(f.mock.calls[0][0]).toBe('/api/buzon/desconectar');
    expect(f.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f)).toEqual({ versionEsperada: 2 });

    const fSinVersion = simularFetch(async () => respuesta(200, desconectado));
    await crearBuzonHttp().desconectar();
    expect(cuerpoDe(fSinVersion)).toEqual({});

    simularFetch(async () => respuesta(409, { error: 'El buzón cambió. Recárguelo.' }));
    await expect(crearBuzonHttp().desconectar(1)).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });

    simularFetch(async () => respuesta(404, { error: 'El conjunto no tiene un buzón conectado' }));
    await expect(crearBuzonHttp().desconectar()).rejects.toMatchObject({ estado: 404, tipo: 'NO_ENCONTRADO' });
  });

  it('sincronizar: POST /api/buzon/sincronizar valida los 5 contadores; 409 / 422 / forma inválida', async () => {
    const resultado = { revisados: 4, nuevos: 2, duplicados: 2, respaldos: 0, pendientes: false };
    const f = simularFetch(async () => respuesta(200, resultado));
    expect(await crearBuzonHttp().sincronizar()).toEqual(resultado);
    expect(f.mock.calls[0][0]).toBe('/api/buzon/sincronizar');
    expect(f.mock.calls[0][1]?.method).toBe('POST');

    simularFetch(async () => respuesta(409, { error: 'Ya hay una sincronización en curso para este conjunto' }));
    await expect(crearBuzonHttp().sincronizar()).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });

    simularFetch(async () => respuesta(422, { error: 'El conjunto no tiene un buzón conectado' }));
    await expect(crearBuzonHttp().sincronizar()).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });

    simularFetch(async () => respuesta(200, { revisados: 'no' }));
    await expect(crearBuzonHttp().sincronizar()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });
  });
});

describe('correosHttp', () => {
  const filaBase = {
    id: 10,
    remitente: 'residente@demo.mailflow.test',
    asunto: 'Fuga de agua en parqueadero',
    fechaRecepcion: '2026-11-16T10:00:00.000Z',
    idResidente: 4,
    residente: 'Elena Vargas',
    unidad: 'T2-401',
    idSolicitud: 14,
    codigo: 'SOL-000014',
    estado: 'NUEVA' as const,
    categoria: 'MANTENIMIENTO',
    prioridad: 'ALTA',
    sugerenciaEstado: 'LISTA' as const,
    sugerenciaCategoria: 'MANTENIMIENTO',
  };

  it('listar: GET /api/correos sin filtros y con q, limite, desplazamiento y signal', async () => {
    const listaValida = { total: 1, correos: [{ ...filaBase, extracto: 'Hay una fuga desde ayer.' }] };
    const ctl = new AbortController();
    const f1 = simularFetch(async () => respuesta(200, listaValida));
    expect(await crearCorreosHttp().listar(undefined, ctl.signal)).toEqual(listaValida);
    expect(f1).toHaveBeenCalledWith('/api/correos', expect.objectContaining({ credentials: 'same-origin', signal: ctl.signal }));

    const f2 = simularFetch(async () => respuesta(200, { total: 0, correos: [] }));
    await crearCorreosHttp().listar({ q: 'fuga', limite: 10, desplazamiento: 20 });
    expect(f2.mock.calls[0][0]).toBe('/api/correos?q=fuga&limite=10&desplazamiento=20');
  });

  it('listar: forma inválida → RED; 401/422 → ErrorApi', async () => {
    simularFetch(async () => respuesta(200, { total: 'uno', correos: [] }));
    await expect(crearCorreosHttp().listar()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    simularFetch(async () => respuesta(422, { error: 'Parámetros inválidos' }));
    await expect(crearCorreosHttp().listar({ limite: 0 })).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });

    simularFetch(async () => respuesta(401, { error: 'Sesión no iniciada' }));
    await expect(crearCorreosHttp().listar()).rejects.toMatchObject({ estado: 401, tipo: 'NO_AUTENTICADO' });
  });

  it('detalle: GET /api/correos/:id con y sin sugerencia; 404 y forma inválida', async () => {
    const detalleConSugerencia = {
      ...filaBase,
      cuerpo: 'Hola, soy Elena Vargas de T2-401. Mi cel 3001234567.',
      cuerpoEnmascarado: 'Hola, soy [NOMBRE_PROTEGIDO] de [UNIDAD_PROTEGIDA]. Mi cel [TEL_PROTEGIDO].',
      sugerencia: {
        estado: 'LISTA' as const,
        categoria: 'MANTENIMIENTO',
        prioridad: 'ALTA',
        resumen: 'Fuga de agua reportada en parqueadero.',
        justificacion: 'Menciona fuga activa en zona común.',
        proveedor: 'openrouter',
        modelo: 'gpt-4o-mini',
        fechaActualizacion: '2026-11-16T10:02:00.000Z',
      },
    };
    const ctl = new AbortController();
    const f = simularFetch(async () => respuesta(200, detalleConSugerencia));
    expect(await crearCorreosHttp().detalle(10, ctl.signal)).toEqual(detalleConSugerencia);
    expect(f).toHaveBeenCalledWith('/api/correos/10', expect.objectContaining({ signal: ctl.signal }));

    const detalleSinSugerencia = { ...detalleConSugerencia, sugerenciaEstado: null, sugerenciaCategoria: null, sugerencia: null };
    simularFetch(async () => respuesta(200, detalleSinSugerencia));
    expect(await crearCorreosHttp().detalle(10)).toEqual(detalleSinSugerencia);

    simularFetch(async () => respuesta(404, { error: 'El correo 999 no existe' }));
    await expect(crearCorreosHttp().detalle(999)).rejects.toMatchObject({ estado: 404, tipo: 'NO_ENCONTRADO' });

    simularFetch(async () => respuesta(200, { ...filaBase, cuerpo: 'solo' }));
    await expect(crearCorreosHttp().detalle(10)).rejects.toMatchObject({ tipo: 'RED', estado: 0 });
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

describe('solicitudesHttp', () => {
  const filaBase = {
    id: 22,
    codigo: 'SOL-000022',
    asunto: 'Fuga de agua en sótano',
    remitente: 'elena.vargas@demo.mailflow.test',
    estado: 'NUEVA' as const,
    categoria: 'MANTENIMIENTO' as const,
    prioridad: 'ALTA' as const,
    slaHoras: 4,
    version: 1,
    fechaCreacion: '2026-11-16T15:10:00.000Z',
    primeraRespuesta: null,
    fechaCierre: null,
    responsable: null,
    idResponsable: null,
  };

  const detalleBase = {
    ...filaBase,
    cuerpo: 'Hay una fuga de agua en el sótano 1.',
    messageId: '<msg-22@demo.mailflow.test>',
    historial: [
      {
        anterior: null,
        nuevo: 'NUEVA' as const,
        usuario: null,
        comentario: 'Creada automáticamente desde correo',
        fecha: '2026-11-16T15:10:00.000Z',
      },
    ],
    asignaciones: [],
    destinos: [],
    sugerencia: {
      estado: 'LISTA' as const,
      categoria: 'MANTENIMIENTO',
      prioridad: 'ALTA',
      resumen: 'Fuga de agua en sótano.',
      justificacion: 'Fuga reportada en zona común.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-16T15:11:00.000Z',
    },
  };

  it('listar: GET /api/solicitudes sin filtros y con filtros + signal', async () => {
    const ctl = new AbortController();
    const f1 = simularFetch(async () => respuesta(200, [filaBase]));
    expect(await crearSolicitudesHttp().listar(undefined, ctl.signal)).toEqual([filaBase]);
    expect(f1).toHaveBeenCalledWith(
      '/api/solicitudes',
      expect.objectContaining({ credentials: 'same-origin', signal: ctl.signal }),
    );

    const f2 = simularFetch(async () => respuesta(200, []));
    await crearSolicitudesHttp().listar({
      estado: 'EN_PROCESO',
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      idResponsable: 2,
      limite: 20,
      desplazamiento: 40,
    });
    expect(f2.mock.calls[0][0]).toBe(
      '/api/solicitudes?estado=EN_PROCESO&categoria=SEGURIDAD&prioridad=ALTA&idResponsable=2&limite=20&desplazamiento=40',
    );
  });

  it('listar: forma inválida → RED; 401/422 → ErrorApi', async () => {
    simularFetch(async () => respuesta(200, [{ id: 'mal' }]));
    await expect(crearSolicitudesHttp().listar()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    simularFetch(async () => respuesta(422, { error: 'Filtro inválido' }));
    await expect(crearSolicitudesHttp().listar()).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });

    simularFetch(async () => respuesta(401, { error: 'Sesión no iniciada' }));
    await expect(crearSolicitudesHttp().listar()).rejects.toMatchObject({ estado: 401, tipo: 'NO_AUTENTICADO' });
  });

  it('detalle: GET /api/solicitudes/:id con y sin sugerencia; 403/404 y forma inválida', async () => {
    const ctl = new AbortController();
    const f = simularFetch(async () => respuesta(200, detalleBase));
    expect(await crearSolicitudesHttp().detalle(22, ctl.signal)).toEqual(detalleBase);
    expect(f).toHaveBeenCalledWith('/api/solicitudes/22', expect.objectContaining({ signal: ctl.signal }));

    const sinSugerencia = { ...detalleBase, sugerencia: null };
    simularFetch(async () => respuesta(200, sinSugerencia));
    expect(await crearSolicitudesHttp().detalle(22)).toEqual(sinSugerencia);

    simularFetch(async () => respuesta(403, { error: 'Solo puedes consultar tus solicitudes asignadas' }));
    await expect(crearSolicitudesHttp().detalle(22)).rejects.toMatchObject({ estado: 403, tipo: 'PROHIBIDO' });

    simularFetch(async () => respuesta(404, { error: 'La solicitud 999 no existe' }));
    await expect(crearSolicitudesHttp().detalle(999)).rejects.toMatchObject({ estado: 404, tipo: 'NO_ENCONTRADO' });

    simularFetch(async () => respuesta(200, { ...filaBase, destinos: ['INVALIDO'] }));
    await expect(crearSolicitudesHttp().detalle(22)).rejects.toMatchObject({ tipo: 'RED', estado: 0 });
  });

  it('asignar: POST /api/solicitudes/:id/asignar con cambio y sinCambios; 409/403/422', async () => {
    const okCambio = { sinCambios: false as const, version: 2, estado: 'ASIGNADA' as const, idAsignacion: 10 };
    const f1 = simularFetch(async () => respuesta(200, okCambio));
    expect(await crearSolicitudesHttp().asignar(22, { idResponsable: 2, versionEsperada: 1 })).toEqual(okCambio);
    expect(f1.mock.calls[0][0]).toBe('/api/solicitudes/22/asignar');
    expect(f1.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f1)).toEqual({ idResponsable: 2, versionEsperada: 1 });

    const okSinCambios = { sinCambios: true as const, version: 2 };
    simularFetch(async () => respuesta(200, okSinCambios));
    expect(await crearSolicitudesHttp().asignar(22, { idResponsable: 2, versionEsperada: 2 })).toEqual(okSinCambios);

    simularFetch(async () => respuesta(409, { error: 'La solicitud 22 cambió (versión 2, se esperaba 1). Recárguela.' }));
    await expect(crearSolicitudesHttp().asignar(22, { idResponsable: 2, versionEsperada: 1 })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    simularFetch(async () => respuesta(403, { error: 'Solo un administrador puede asignar solicitudes' }));
    await expect(crearSolicitudesHttp().asignar(22, { idResponsable: 2, versionEsperada: 2 })).rejects.toMatchObject({
      estado: 403,
      tipo: 'PROHIBIDO',
    });

    simularFetch(async () => respuesta(422, { error: 'No se puede asignar una solicitud en estado CERRADA' }));
    await expect(crearSolicitudesHttp().asignar(22, { idResponsable: 2, versionEsperada: 2 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });
  });

  it('cambiarEstado: POST /api/solicitudes/:id/estado envía nuevoEstado, versionEsperada y comentario; 409/422/403', async () => {
    const ok = { idSolicitud: 22, estado: 'EN_PROCESO' as const, version: 3 };
    const f = simularFetch(async () => respuesta(200, ok));
    expect(
      await crearSolicitudesHttp().cambiarEstado(22, {
        nuevoEstado: 'EN_PROCESO',
        versionEsperada: 2,
        comentario: 'En revisión',
      }),
    ).toEqual(ok);
    expect(f.mock.calls[0][0]).toBe('/api/solicitudes/22/estado');
    expect(f.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f)).toEqual({ nuevoEstado: 'EN_PROCESO', versionEsperada: 2, comentario: 'En revisión' });

    simularFetch(async () => respuesta(409, { error: 'La solicitud 22 cambió. Recárguela.' }));
    await expect(
      crearSolicitudesHttp().cambiarEstado(22, { nuevoEstado: 'RESUELTA', versionEsperada: 2 }),
    ).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });

    simularFetch(async () => respuesta(422, { error: 'Transición inválida de NUEVA a CERRADA' }));
    await expect(
      crearSolicitudesHttp().cambiarEstado(22, { nuevoEstado: 'CERRADA', versionEsperada: 1 }),
    ).rejects.toMatchObject({ estado: 422, tipo: 'INVALIDO' });
  });

  it('reclasificar: POST /api/solicitudes/:id/reclasificar y aceptarSugerencia: POST /api/solicitudes/:id/aceptar-sugerencia', async () => {
    const okReclas = {
      idSolicitud: 22,
      categoria: 'SEGURIDAD' as const,
      prioridad: 'ALTA' as const,
      version: 2,
      sinCambios: false,
    };
    const f1 = simularFetch(async () => respuesta(200, okReclas));
    expect(
      await crearSolicitudesHttp().reclasificar(22, {
        categoria: 'SEGURIDAD',
        prioridad: 'ALTA',
        versionEsperada: 1,
        comentario: 'Ajuste manual',
      }),
    ).toEqual(okReclas);
    expect(f1.mock.calls[0][0]).toBe('/api/solicitudes/22/reclasificar');
    expect(f1.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f1)).toEqual({
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      versionEsperada: 1,
      comentario: 'Ajuste manual',
    });

    const f2 = simularFetch(async () => respuesta(200, { ...okReclas, version: 3 }));
    expect(
      await crearSolicitudesHttp().aceptarSugerencia(22, { versionEsperada: 2, comentario: 'Confirmada' }),
    ).toEqual({ ...okReclas, version: 3 });
    expect(f2.mock.calls[0][0]).toBe('/api/solicitudes/22/aceptar-sugerencia');
    expect(f2.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f2)).toEqual({ versionEsperada: 2, comentario: 'Confirmada' });

    simularFetch(async () => respuesta(409, { error: 'La solicitud cambió. Recárguela.' }));
    await expect(crearSolicitudesHttp().aceptarSugerencia(22, { versionEsperada: 1 })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    simularFetch(async () => respuesta(422, { error: 'No hay una sugerencia lista para aceptar en esta solicitud' }));
    await expect(crearSolicitudesHttp().aceptarSugerencia(22, { versionEsperada: 2 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });
  });
});

describe('residentesHttp', () => {
  const residenteBase = {
    id: 101,
    nombre: 'Elena Vargas',
    unidad: 'T2-401',
    correo: 'elena.vargas@demo.mailflow.test',
    telefono: '3004567890',
    activo: true,
    version: 1,
    totalSolicitudes: 2,
  };

  it('listar: GET /api/residentes sin filtros, con q y soloActivos, pasa signal y valida forma', async () => {
    const ctl = new AbortController();
    const f1 = simularFetch(async () => respuesta(200, [residenteBase]));
    expect(await crearResidentesHttp().listar(undefined, ctl.signal)).toEqual([residenteBase]);
    expect(f1).toHaveBeenCalledWith(
      '/api/residentes',
      expect.objectContaining({ credentials: 'same-origin', signal: ctl.signal }),
    );

    const f2 = simularFetch(async () => respuesta(200, [residenteBase]));
    await crearResidentesHttp().listar({ q: 'elena', soloActivos: true });
    expect(f2.mock.calls[0][0]).toBe('/api/residentes?q=elena&soloActivos=true');

    const f3 = simularFetch(async () => respuesta(200, []));
    await crearResidentesHttp().listar({ soloActivos: false });
    expect(f3.mock.calls[0][0]).toBe('/api/residentes?soloActivos=false');

    simularFetch(async () => respuesta(200, [{ id: 'mal' }]));
    await expect(crearResidentesHttp().listar()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    simularFetch(async () => respuesta(403, { error: 'Solo un administrador puede consultar los residentes' }));
    await expect(crearResidentesHttp().listar()).rejects.toMatchObject({ estado: 403, tipo: 'PROHIBIDO' });
  });

  it('crear: POST /api/residentes devuelve 201 ResidenteConjunto; 409 duplicado y 422', async () => {
    const entrada = {
      nombre: 'Elena Vargas',
      unidad: 'T2-401',
      correo: 'elena.vargas@demo.mailflow.test',
      telefono: '3004567890',
    };
    const f = simularFetch(async () => respuesta(201, residenteBase));
    expect(await crearResidentesHttp().crear(entrada)).toEqual(residenteBase);
    expect(f.mock.calls[0][0]).toBe('/api/residentes');
    expect(f.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f)).toEqual(entrada);

    simularFetch(async () => respuesta(409, { error: 'Ya existe un residente con ese correo en el conjunto' }));
    await expect(crearResidentesHttp().crear(entrada)).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
      mensaje: 'Ya existe un residente con ese correo en el conjunto',
    });

    simularFetch(async () => respuesta(422, { error: 'Datos inválidos' }));
    await expect(crearResidentesHttp().crear({ nombre: '', unidad: '101' })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });
  });

  it('actualizar: PATCH /api/residentes/:id envía versionEsperada; 409 / 404 / 422', async () => {
    const actualizado = { ...residenteBase, unidad: 'T2-402', version: 2 };
    const f = simularFetch(async () => respuesta(200, actualizado));
    expect(await crearResidentesHttp().actualizar(101, { unidad: 'T2-402', versionEsperada: 1 })).toEqual(actualizado);
    expect(f.mock.calls[0][0]).toBe('/api/residentes/101');
    expect(f.mock.calls[0][1]?.method).toBe('PATCH');
    expect(cuerpoDe(f)).toEqual({ unidad: 'T2-402', versionEsperada: 1 });

    simularFetch(async () => respuesta(409, { error: 'El residente cambió (versión 2, se esperaba 1). Recárguelo.' }));
    await expect(crearResidentesHttp().actualizar(101, { activo: false, versionEsperada: 1 })).rejects.toMatchObject({
      estado: 409,
      tipo: 'CONFLICTO',
    });

    simularFetch(async () => respuesta(404, { error: 'El residente no existe en el conjunto' }));
    await expect(crearResidentesHttp().actualizar(999, { activo: false, versionEsperada: 1 })).rejects.toMatchObject({
      estado: 404,
      tipo: 'NO_ENCONTRADO',
    });

    simularFetch(async () => respuesta(422, { error: 'Datos inválidos' }));
    await expect(crearResidentesHttp().actualizar(101, { correo: 'mal', versionEsperada: 2 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });
  });

  it('vincularCorreo: POST /api/correos/:id/vincular-residente con idResidente o nuevo residente; 409/422/404', async () => {
    const detalleVinculado = {
      id: 2,
      remitente: 'visitante.ext@demo.mailflow.test',
      asunto: 'Consulta de trasteo',
      fechaRecepcion: '2026-11-16T13:45:00.000Z',
      idResidente: 101,
      residente: 'Elena Vargas',
      unidad: 'T2-401',
      idSolicitud: 21,
      codigo: 'SOL-000021',
      estado: 'NUEVA' as const,
      categoria: 'ADMINISTRATIVO',
      prioridad: 'MEDIA',
      sugerenciaEstado: null,
      sugerenciaCategoria: null,
      cuerpo: 'Hola',
      cuerpoEnmascarado: 'Hola',
      sugerencia: null,
    };

    const f1 = simularFetch(async () => respuesta(200, detalleVinculado));
    expect(await crearResidentesHttp().vincularCorreo(2, { idResidente: 101 })).toEqual(detalleVinculado);
    expect(f1.mock.calls[0][0]).toBe('/api/correos/2/vincular-residente');
    expect(f1.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f1)).toEqual({ idResidente: 101 });

    const f2 = simularFetch(async () => respuesta(200, detalleVinculado));
    await crearResidentesHttp().vincularCorreo(2, {
      residente: { nombre: 'Luis Vega', unidad: 'T1-101', telefono: '3001112233', usarCorreoRemitente: true },
    });
    expect(cuerpoDe(f2)).toEqual({
      residente: { nombre: 'Luis Vega', unidad: 'T1-101', telefono: '3001112233', usarCorreoRemitente: true },
    });

    simularFetch(async () => respuesta(422, { error: 'No se puede vincular un correo a un residente inactivo' }));
    await expect(crearResidentesHttp().vincularCorreo(2, { idResidente: 111 })).rejects.toMatchObject({
      estado: 422,
      tipo: 'INVALIDO',
    });

    simularFetch(async () => respuesta(409, { error: 'Ya existe un residente con ese correo en el conjunto' }));
    await expect(
      crearResidentesHttp().vincularCorreo(2, { residente: { nombre: 'Dup', unidad: '101' } }),
    ).rejects.toMatchObject({ estado: 409, tipo: 'CONFLICTO' });
  });
});

describe('validacionHttp', () => {
  it('obtener: GET /api/validacion pasa signal y valida sugerencias + remitentesSinResidente', async () => {
    const cola = {
      sugerencias: [
        {
          idSolicitud: 21,
          codigo: 'SOL-000021',
          asunto: 'Solicitud de información para ingreso de trasteo',
          remitente: 'visitante.ext@demo.mailflow.test',
          fechaCreacion: '2026-11-16T13:45:00.000Z',
          estado: 'NUEVA' as const,
          categoriaActual: 'SIN_CLASIFICAR' as const,
          prioridadActual: 'MEDIA' as const,
          version: 1,
          sugerencia: {
            categoria: 'ADMINISTRATIVO' as const,
            prioridad: 'BAJA' as const,
            resumen: 'Consulta sobre horarios y requisitos de portería para mudanza.',
            justificacion: 'Trámite administrativo de mudanza sin urgencia inmediata.',
            proveedor: 'openrouter',
            modelo: 'gpt-4o-mini',
            fechaActualizacion: '2026-11-16T13:46:00.000Z',
          },
        },
      ],
      remitentesSinResidente: [
        {
          id: 2,
          remitente: 'visitante.ext@demo.mailflow.test',
          asunto: 'Solicitud de información para ingreso de trasteo',
          fechaRecepcion: '2026-11-16T13:45:00.000Z',
          idResidente: null,
          residente: null,
          unidad: null,
          idSolicitud: 21,
          codigo: 'SOL-000021',
          estado: 'NUEVA' as const,
          categoria: 'SIN_CLASIFICAR',
          prioridad: 'MEDIA',
          sugerenciaEstado: 'LISTA' as const,
          sugerenciaCategoria: 'ADMINISTRATIVO',
          extracto: 'Cordial saludo...',
        },
      ],
    };

    const ctl = new AbortController();
    const f = simularFetch(async () => respuesta(200, cola));
    expect(await crearValidacionHttp().obtener(ctl.signal)).toEqual(cola);
    expect(f).toHaveBeenCalledWith(
      '/api/validacion',
      expect.objectContaining({ credentials: 'same-origin', signal: ctl.signal }),
    );

    simularFetch(async () => respuesta(200, { sugerencias: 'mal' }));
    await expect(crearValidacionHttp().obtener()).rejects.toMatchObject({ tipo: 'RED', estado: 0 });

    simularFetch(async () => respuesta(403, { error: 'Solo un administrador puede consultar la cola de validación' }));
    await expect(crearValidacionHttp().obtener()).rejects.toMatchObject({ estado: 403, tipo: 'PROHIBIDO' });
  });
});
