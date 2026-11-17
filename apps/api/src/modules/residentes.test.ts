import { randomBytes } from 'node:crypto';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, runSql, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { crearPool } from '../db/pool.js';
import { asegurarUsuarioApp } from '../db/usuarioApp.js';
import { ConflictError, Forbidden, NotFound, ValidationError } from '../errors.js';
import { colaValidacion } from './consultas.js';
import { ingestarCorreo, REMITENTE_DESCONOCIDO } from './ingesta.js';
import {
  actualizarResidenteConjunto,
  crearResidenteConjunto,
  listarResidentesConjunto,
  vincularCorreoResidente,
} from './residentes.js';
import type { Actor } from './solicitudes.js';

let db: TestDb;
let n = 0;

interface Conjunto {
  id: number;
  slug: string;
  admin: Actor;
  soporte: Actor;
}

async function nuevoConjunto(): Promise<Conjunto> {
  const slug = `res-${++n}`;
  const id = (
    await db.pool
      .request()
      .input('slug', sql.VarChar(80), slug)
      .input('nombre', sql.NVarChar(120), `Conjunto ${n}`)
      .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)')
  ).recordset[0]!.id;
  const idAdmin = await crearUsuario(db, { nombre: `Admin ${n}`, correo: `admin-res-${n}@demo.mailflow.test`, rol: 'ADMIN', slug });
  const idSoporte = await crearUsuario(db, { nombre: `Soporte ${n}`, correo: `soporte-res-${n}@demo.mailflow.test`, rol: 'SOPORTE', slug });
  return {
    id,
    slug,
    admin: { idUsuario: idAdmin, rol: 'ADMIN', idConjunto: id },
    soporte: { idUsuario: idSoporte, rol: 'SOPORTE', idConjunto: id },
  };
}

async function auditoriaResidente(idConjunto: number, idResidente?: number) {
  const r = await db.pool
    .request()
    .input('c', sql.Int, idConjunto)
    .input('id', sql.Int, idResidente ?? null)
    .query<{ idUsuario: number | null; entidad: string; idEntidad: number; accion: string; detalle: string | null }>(
      `SELECT idUsuario, entidad, idEntidad, accion, detalle
         FROM dbo.AUDITORIA_ADMIN
        WHERE idConjunto = @c AND entidad = 'RESIDENTE' AND (@id IS NULL OR idEntidad = @id)
        ORDER BY idAuditoria`,
    );
  return r.recordset;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_res');
});
afterAll(async () => {
  await db?.close();
});

describe('crearResidenteConjunto', () => {
  it('crea residente normalizado, audita sin datos personales y permite múltiples sin correo', async () => {
    const c = await nuevoConjunto();
    const r1 = await crearResidenteConjunto(db.pool, c.admin, {
      nombre: '  Ana María Gómez ',
      unidad: '  T1-101 ',
      correo: '  ANA.Gomez@Demo.Mailflow.Test  ',
      telefono: '  300 555 0101 ',
    });
    expect(r1).toEqual({
      id: expect.any(Number),
      nombre: 'Ana María Gómez',
      unidad: 'T1-101',
      correo: 'ana.gomez@demo.mailflow.test',
      telefono: '300 555 0101',
      activo: true,
      version: 1,
      totalSolicitudes: 0,
    });

    const r2 = await crearResidenteConjunto(db.pool, c.admin, { nombre: 'Luis Vega', unidad: 'T1-102', correo: '', telefono: '   ' });
    const r3 = await crearResidenteConjunto(db.pool, c.admin, { nombre: 'Eva Sol', unidad: 'T1-103' });
    expect(r2).toMatchObject({ correo: null, telefono: null, activo: true, version: 1 });
    expect(r3).toMatchObject({ correo: null, telefono: null, activo: true, version: 1 });

    const aud = await auditoriaResidente(c.id, r1.id);
    expect(aud).toHaveLength(1);
    expect(aud[0]).toMatchObject({ idUsuario: c.admin.idUsuario, entidad: 'RESIDENTE', idEntidad: r1.id, accion: 'CREAR' });
    const texto = JSON.stringify(aud);
    expect(texto).not.toMatch(/Ana|Gómez|ana\.gomez|demo\.mailflow|300 555|T1-101/i);
  });

  it('vincula automáticamente correos huérfanos del mismo conjunto y remitente; no toca otros conjuntos', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const correo = `huerfano-${n}@demo.mailflow.test`;

    const i1 = await ingestarCorreo(db.pool, { messageId: `<res-h1-${n}>`, remitente: correo, asunto: 'Fuga', idConjunto: a.id });
    const i2 = await ingestarCorreo(db.pool, { messageId: `<res-h2-${n}>`, remitente: ` ${correo.toUpperCase()} `, asunto: 'Cuota', idConjunto: a.id });
    const iB = await ingestarCorreo(db.pool, { messageId: `<res-hb-${n}>`, remitente: correo, asunto: 'Otro conjunto', idConjunto: b.id });
    if (i1.duplicado || i2.duplicado || iB.duplicado) throw new Error('duplicado inesperado');
    expect(i1.idResidente).toBeNull();
    expect(i2.idResidente).toBeNull();

    const creado = await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Clara Ruiz', unidad: 'T2-204', correo });
    expect(creado.totalSolicitudes).toBe(2);

    const corrA = await db.pool
      .request()
      .input('c', sql.Int, a.id)
      .query<{ idResidente: number | null }>('SELECT idResidente FROM dbo.CORREOS WHERE idConjunto = @c ORDER BY idCorreo');
    expect(corrA.recordset.map((x) => x.idResidente)).toEqual([creado.id, creado.id]);

    const corrB = await db.pool
      .request()
      .input('id', sql.Int, iB.idCorreo)
      .query<{ idResidente: number | null }>('SELECT idResidente FROM dbo.CORREOS WHERE idCorreo = @id');
    expect(corrB.recordset[0]!.idResidente).toBeNull();
  });

  it('409 si el correo ya existe en el conjunto; permite el mismo correo en otro conjunto', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const correo = `dup-${n}@demo.mailflow.test`;
    await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Uno', unidad: 'A-1', correo });

    await expect(
      crearResidenteConjunto(db.pool, a.admin, { nombre: 'Dos', unidad: 'A-2', correo: correo.toUpperCase() }),
    ).rejects.toThrow(new ConflictError('Ya existe un residente con ese correo en el conjunto'));

    const enB = await crearResidenteConjunto(db.pool, b.admin, { nombre: 'En B', unidad: 'B-1', correo });
    expect(enB.correo).toBe(correo);
  });

  it('dos altas concurrentes del mismo correo → una gana y la otra recibe 409', async () => {
    const c = await nuevoConjunto();
    const entrada = { nombre: 'Carrera', unidad: 'C-1', correo: `race-res-${n}@demo.mailflow.test` };
    const res = await Promise.allSettled([
      crearResidenteConjunto(db.pool, c.admin, entrada),
      crearResidenteConjunto(db.pool, c.admin, entrada),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const err = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(err?.reason).toBeInstanceOf(ConflictError);
  });

  it('exige ADMIN del conjunto (403) y valida entradas (422)', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const valida = { nombre: 'Ok', unidad: '101' };

    await expect(crearResidenteConjunto(db.pool, a.soporte, valida)).rejects.toBeInstanceOf(Forbidden);
    await expect(crearResidenteConjunto(db.pool, { ...a.soporte, rol: 'ADMIN' }, valida)).rejects.toBeInstanceOf(Forbidden);
    await expect(crearResidenteConjunto(db.pool, { ...b.admin, idConjunto: a.id }, valida)).rejects.toBeInstanceOf(Forbidden);

    await expect(crearResidenteConjunto(db.pool, a.admin, { nombre: '   ', unidad: '101' })).rejects.toBeInstanceOf(ValidationError);
    await expect(crearResidenteConjunto(db.pool, a.admin, { nombre: 'x'.repeat(101), unidad: '101' })).rejects.toBeInstanceOf(ValidationError);
    await expect(crearResidenteConjunto(db.pool, a.admin, { nombre: 'Ok', unidad: '  ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(crearResidenteConjunto(db.pool, a.admin, { nombre: 'Ok', unidad: 'u'.repeat(21) })).rejects.toBeInstanceOf(ValidationError);
    await expect(crearResidenteConjunto(db.pool, a.admin, { ...valida, correo: 'sin-arroba' })).rejects.toBeInstanceOf(ValidationError);
    await expect(crearResidenteConjunto(db.pool, a.admin, { ...valida, telefono: '1'.repeat(21) })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('listarResidentesConjunto', () => {
  it('ordena por unidad/nombre/id, filtra por conjunto, ?q= (escapando LIKE) y ?soloActivos', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();

    const rB1 = await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Carlos 100%', unidad: 'T1-202', correo: `c100-${n}@demo.mailflow.test` });
    const rA1 = await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Beatriz_Sol', unidad: 'T1-101', correo: `bea-${n}@demo.mailflow.test` });
    const rInact = await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Zulema [Inact]', unidad: 'T1-101', correo: `zul-${n}@demo.mailflow.test` });
    await actualizarResidenteConjunto(db.pool, a.admin, rInact.id, { activo: false, versionEsperada: rInact.version });

    // Residente coincidente en B no debe aparecer en A
    await crearResidenteConjunto(db.pool, b.admin, { nombre: 'Carlos 100%', unidad: 'T1-202', correo: `c100-${n}@demo.mailflow.test` });

    // Solicitud para rA1
    await ingestarCorreo(db.pool, { messageId: `<list-r-${n}>`, remitente: rA1.correo!, asunto: 'Luz', idConjunto: a.id });

    const todos = await listarResidentesConjunto(db.pool, a.admin);
    expect(todos.map((x) => x.id)).toEqual([rA1.id, rInact.id, rB1.id]);
    expect(todos[0]).toMatchObject({ totalSolicitudes: 1, activo: true });
    expect(todos[1]).toMatchObject({ totalSolicitudes: 0, activo: false });

    const activos = await listarResidentesConjunto(db.pool, a.admin, { soloActivos: true });
    expect(activos.map((x) => x.id)).toEqual([rA1.id, rB1.id]);

    expect((await listarResidentesConjunto(db.pool, a.admin, { q: '100%' })).map((x) => x.id)).toEqual([rB1.id]);
    expect((await listarResidentesConjunto(db.pool, a.admin, { q: '_' })).map((x) => x.id)).toEqual([rA1.id]);
    expect((await listarResidentesConjunto(db.pool, a.admin, { q: '[' })).map((x) => x.id)).toEqual([rInact.id]);
    expect((await listarResidentesConjunto(db.pool, a.admin, { q: 'T1-202' })).map((x) => x.id)).toEqual([rB1.id]);
    expect((await listarResidentesConjunto(db.pool, a.admin, { q: `bea-${n}` })).map((x) => x.id)).toEqual([rA1.id]);

    await expect(listarResidentesConjunto(db.pool, a.soporte)).rejects.toBeInstanceOf(Forbidden);
    await expect(listarResidentesConjunto(db.pool, a.admin, { q: 'x'.repeat(201) })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('actualizarResidenteConjunto', () => {
  it('actualiza datos, maneja sin cambios, controla versionEsperada (409), 404 ajeno y audita sin datos personales', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const r = await crearResidenteConjunto(db.pool, a.admin, {
      nombre: 'Pedro López',
      unidad: 'T3-301',
      correo: `pedro-${n}@demo.mailflow.test`,
      telefono: '3110001122',
    });

    // Sin cambios efectivos → no sube version ni audita
    const audAntes = await auditoriaResidente(a.id, r.id);
    const sinCambio = await actualizarResidenteConjunto(db.pool, a.admin, r.id, {
      nombre: ' Pedro López ',
      correo: `PEDRO-${n}@demo.mailflow.test`,
      versionEsperada: 1,
    });
    expect(sinCambio).toEqual(r);
    expect(await auditoriaResidente(a.id, r.id)).toEqual(audAntes);

    // Actualización con limpieza de teléfono y cambio de unidad
    const upd = await actualizarResidenteConjunto(db.pool, a.admin, r.id, {
      nombre: 'Pedro L. Díaz',
      unidad: 'T3-302',
      telefono: '',
      versionEsperada: 1,
    });
    expect(upd).toMatchObject({ nombre: 'Pedro L. Díaz', unidad: 'T3-302', telefono: null, version: 2 });

    // Versión vieja → 409
    await expect(
      actualizarResidenteConjunto(db.pool, a.admin, r.id, { nombre: 'Viejo', versionEsperada: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Otro conjunto o inexistente → 404
    const rB = await crearResidenteConjunto(db.pool, b.admin, { nombre: 'Otro', unidad: 'B-1' });
    await expect(actualizarResidenteConjunto(db.pool, a.admin, rB.id, { nombre: 'Hack', versionEsperada: 1 })).rejects.toBeInstanceOf(NotFound);
    await expect(actualizarResidenteConjunto(db.pool, a.admin, 999_999_999, { nombre: 'No', versionEsperada: 1 })).rejects.toBeInstanceOf(NotFound);

    // Desactivar y reactivar junto con cambio de correo vincula huérfanos solo cuando queda activo
    const correoNuevo = `pedro.nuevo-${n}@demo.mailflow.test`;
    const iOff = await ingestarCorreo(db.pool, { messageId: `<upd-off-${n}>`, remitente: correoNuevo, asunto: 'A', idConjunto: a.id });
    if (iOff.duplicado) throw new Error('duplicado inesperado');

    const off = await actualizarResidenteConjunto(db.pool, a.admin, r.id, { activo: false, correo: correoNuevo, versionEsperada: 2 });
    expect(off).toMatchObject({ activo: false, correo: correoNuevo, version: 3, totalSolicitudes: 0 });

    const on = await actualizarResidenteConjunto(db.pool, a.admin, r.id, { activo: true, versionEsperada: 3 });
    expect(on).toMatchObject({ activo: true, version: 4, totalSolicitudes: 1 });

    const aud = await auditoriaResidente(a.id, r.id);
    expect(aud.map((x) => x.accion)).toEqual(['CREAR', 'ACTUALIZAR', 'ACTUALIZAR', 'DESACTIVAR', 'ACTIVAR']);
    const texto = JSON.stringify(aud);
    expect(texto).not.toMatch(/Pedro|Díaz|pedro|3110001122|T3-30/i);
  });

  it('409 si intenta usar el correo de otro residente del mismo conjunto; 422 si falta campo o versionEsperada', async () => {
    const c = await nuevoConjunto();
    const r1 = await crearResidenteConjunto(db.pool, c.admin, { nombre: 'Uno', unidad: '1', correo: `u1-${n}@demo.mailflow.test` });
    const r2 = await crearResidenteConjunto(db.pool, c.admin, { nombre: 'Dos', unidad: '2', correo: `u2-${n}@demo.mailflow.test` });

    await expect(
      actualizarResidenteConjunto(db.pool, c.admin, r2.id, { correo: r1.correo, versionEsperada: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(actualizarResidenteConjunto(db.pool, c.admin, r2.id, { versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarResidenteConjunto(db.pool, c.admin, r2.id, { nombre: 'X' } as never)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('vincularCorreoResidente', () => {
  it('vincula un correo huérfano a un residente existente y enmascara su nombre en detalleCorreo', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const rA = await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Marta Silva', unidad: 'T4-401' });
    const rInactivo = await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Inactivo', unidad: 'T4-402' });
    await actualizarResidenteConjunto(db.pool, a.admin, rInactivo.id, { activo: false, versionEsperada: 1 });
    const rB = await crearResidenteConjunto(db.pool, b.admin, { nombre: 'En B', unidad: 'B-1' });

    const ingA = await ingestarCorreo(db.pool, {
      messageId: `<vinc-1-${n}>`,
      remitente: `marta.alt-${n}@demo.mailflow.test`,
      asunto: 'Gotera',
      cuerpo: 'Hola soy Marta Silva del apto 401',
      idConjunto: a.id,
    });
    const ingB = await ingestarCorreo(db.pool, { messageId: `<vinc-b-${n}>`, remitente: `x-${n}@demo.mailflow.test`, asunto: 'X', idConjunto: b.id });
    if (ingA.duplicado || ingB.duplicado) throw new Error('duplicado inesperado');

    // Validaciones 422 / 404 / 403
    await expect(vincularCorreoResidente(db.pool, a.soporte, ingA.idCorreo, { idResidente: rA.id })).rejects.toBeInstanceOf(Forbidden);
    await expect(vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(
      vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, { idResidente: rA.id, residente: { nombre: 'X', unidad: '1' } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(vincularCorreoResidente(db.pool, a.admin, ingB.idCorreo, { idResidente: rA.id })).rejects.toBeInstanceOf(NotFound);
    await expect(vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, { idResidente: rB.id })).rejects.toBeInstanceOf(NotFound);
    await expect(vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, { idResidente: rInactivo.id })).rejects.toBeInstanceOf(ValidationError);

    const det = await vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, { idResidente: rA.id });
    expect(det).toMatchObject({ id: ingA.idCorreo, idResidente: rA.id, residente: 'Marta Silva', unidad: 'T4-401' });
    expect(det.cuerpoEnmascarado).toContain('[NOMBRE_PROTEGIDO]');

    const aud = await auditoriaResidente(a.id, rA.id);
    expect(aud.map((x) => x.accion)).toEqual(['CREAR', 'VINCULAR']);
    expect(JSON.stringify(aud)).not.toMatch(/Marta|Silva|marta\.alt|T4-401/i);

    // Idempotencia con el mismo idResidente: no vuelve a auditar VINCULAR
    const detIdemp = await vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, { idResidente: rA.id });
    expect(detIdemp.idResidente).toBe(rA.id);
    expect(await auditoriaResidente(a.id, rA.id)).toHaveLength(2);

    // Si ya está vinculado a rA, intentar vincular a otro residente o crear nuevo → 409 ConflictError
    const rOtro = await crearResidenteConjunto(db.pool, a.admin, { nombre: 'Otro Res', unidad: 'T4-403' });
    await expect(
      vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, { idResidente: rOtro.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      vincularCorreoResidente(db.pool, a.admin, ingA.idCorreo, { residente: { nombre: 'Nuevo', unidad: 'T4-404' } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('carrera con usarCorreoRemitente=false, REMITENTE_DESCONOCIDO con usarCorreoRemitente=true (422) e ingesta ignora residente inactivo', async () => {
    const c = await nuevoConjunto();

    // Carrera: dos llamadas paralelas creando residente con usarCorreoRemitente: false sobre el mismo correo
    const ingCarrera = await ingestarCorreo(db.pool, {
      messageId: `<vc-race-${n}>`,
      remitente: `race-vinc-${n}@demo.mailflow.test`,
      asunto: 'Carrera',
      idConjunto: c.id,
    });
    if (ingCarrera.duplicado) throw new Error('duplicado inesperado');
    const rCarrera = await Promise.allSettled([
      vincularCorreoResidente(db.pool, c.admin, ingCarrera.idCorreo, {
        residente: { nombre: 'Primero', unidad: 'T6-601', usarCorreoRemitente: false },
      }),
      vincularCorreoResidente(db.pool, c.admin, ingCarrera.idCorreo, {
        residente: { nombre: 'Segundo', unidad: 'T6-602', usarCorreoRemitente: false },
      }),
    ]);
    expect(rCarrera.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const errCarrera = rCarrera.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(errCarrera?.reason).toBeInstanceOf(ConflictError);
    expect((await listarResidentesConjunto(db.pool, c.admin)).filter((x) => x.unidad.startsWith('T6-'))).toHaveLength(1);

    // REMITENTE_DESCONOCIDO con usarCorreoRemitente=true → 422 ValidationError
    const ingDesc = await ingestarCorreo(db.pool, {
      messageId: `<vc-desc-${n}>`,
      remitente: 'invalido-sin-arroba',
      asunto: 'Desconocido',
      idConjunto: c.id,
    });
    if (ingDesc.duplicado) throw new Error('duplicado inesperado');
    expect((await db.pool.request().input('id', sql.Int, ingDesc.idCorreo).query<{ remitente: string }>('SELECT remitente FROM dbo.CORREOS WHERE idCorreo = @id')).recordset[0]!.remitente).toBe(REMITENTE_DESCONOCIDO);
    await expect(
      vincularCorreoResidente(db.pool, c.admin, ingDesc.idCorreo, {
        residente: { nombre: 'Sin Correo', unidad: 'T6-603', usarCorreoRemitente: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Residente desactivado: nuevos correos con su email entran con idResidente = NULL y aparecen en colaValidacion
    const correoInact = `desact-ing-${n}@demo.mailflow.test`;
    const resAct = await crearResidenteConjunto(db.pool, c.admin, { nombre: 'Baja Temporal', unidad: 'T6-604', correo: correoInact });
    await actualizarResidenteConjunto(db.pool, c.admin, resAct.id, { activo: false, versionEsperada: resAct.version });
    const ingInact = await ingestarCorreo(db.pool, {
      messageId: `<vc-inact-${n}>`,
      remitente: correoInact,
      asunto: 'Correo tras desactivar',
      idConjunto: c.id,
    });
    if (ingInact.duplicado) throw new Error('duplicado inesperado');
    expect(ingInact.idResidente).toBeNull();
    const cola = await colaValidacion(db.pool, c.id);
    expect(cola.remitentesSinResidente.map((x) => x.id)).toContain(ingInact.idCorreo);
  });

  it('crea residente desde el correo usando su remitente (y vincula otros huérfanos del mismo remitente) o sin correo con usarCorreoRemitente=false', async () => {
    const c = await nuevoConjunto();
    const remitente = `nuevo-vecino-${n}@demo.mailflow.test`;
    const c1 = await ingestarCorreo(db.pool, { messageId: `<vc-1-${n}>`, remitente, asunto: 'Uno', idConjunto: c.id });
    const c2 = await ingestarCorreo(db.pool, { messageId: `<vc-2-${n}>`, remitente, asunto: 'Dos', idConjunto: c.id });
    if (c1.duplicado || c2.duplicado) throw new Error('duplicado inesperado');

    const det1 = await vincularCorreoResidente(db.pool, c.admin, c1.idCorreo, {
      residente: { nombre: 'Jorge Pardo', unidad: 'T5-501', telefono: '3201112233' },
    });
    expect(det1).toMatchObject({ id: c1.idCorreo, residente: 'Jorge Pardo', unidad: 'T5-501' });
    expect(det1.idResidente).not.toBeNull();

    // c2 también quedó vinculado por compartir remitente
    const c2Row = await db.pool
      .request()
      .input('id', sql.Int, c2.idCorreo)
      .query<{ idResidente: number | null }>('SELECT idResidente FROM dbo.CORREOS WHERE idCorreo = @id');
    expect(c2Row.recordset[0]!.idResidente).toBe(det1.idResidente);

    const aud = await auditoriaResidente(c.id, det1.idResidente!);
    expect(aud.map((x) => x.accion)).toEqual(['CREAR', 'VINCULAR']);
    expect(JSON.stringify(aud)).not.toMatch(/Jorge|Pardo|nuevo-vecino|3201112233|T5-501/i);

    // Otro remitente: usarCorreoRemitente=false crea residente sin correo y no vincula otros correos de ese remitente
    const remAlt = `compartido-alt-${n}@demo.mailflow.test`;
    const c3 = await ingestarCorreo(db.pool, { messageId: `<vc-3-${n}>`, remitente: remAlt, asunto: 'Tres', idConjunto: c.id });
    const c4 = await ingestarCorreo(db.pool, { messageId: `<vc-4-${n}>`, remitente: remAlt, asunto: 'Cuatro', idConjunto: c.id });
    if (c3.duplicado || c4.duplicado) throw new Error('duplicado inesperado');

    const det3 = await vincularCorreoResidente(db.pool, c.admin, c3.idCorreo, {
      residente: { nombre: 'Hija Residente', unidad: 'T5-502', usarCorreoRemitente: false },
    });
    expect(det3).toMatchObject({ id: c3.idCorreo, residente: 'Hija Residente', unidad: 'T5-502' });
    const c4Row = await db.pool
      .request()
      .input('id', sql.Int, c4.idCorreo)
      .query<{ idResidente: number | null }>('SELECT idResidente FROM dbo.CORREOS WHERE idCorreo = @id');
    expect(c4Row.recordset[0]!.idResidente).toBeNull();

    // Si ya existe residente con ese remitente y usarCorreoRemitente !== false → 409
    const c5 = await ingestarCorreo(db.pool, { messageId: `<vc-5-${n}>`, remitente, asunto: 'Cinco', idConjunto: c.id });
    if (c5.duplicado) throw new Error('duplicado inesperado');
    await db.pool.request().input('id', sql.Int, c5.idCorreo).query('UPDATE dbo.CORREOS SET idResidente = NULL WHERE idCorreo = @id');
    await expect(
      vincularCorreoResidente(db.pool, c.admin, c5.idCorreo, { residente: { nombre: 'Dup', unidad: 'T5-503' } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('permisos crm_app en RESIDENTES, CORREOS y AUDITORIA_ADMIN', () => {
  it('todas las operaciones de residentes funcionan con el login mínimo crm_app', async () => {
    const c = await nuevoConjunto();
    const ing = await ingestarCorreo(db.pool, {
      messageId: `<crm-res-${n}>`,
      remitente: `crm-res-${n}@demo.mailflow.test`,
      asunto: 'Prueba permisos',
      idConjunto: c.id,
    });
    if (ing.duplicado) throw new Error('duplicado inesperado');

    const login = `soc_res_${randomBytes(4).toString('hex')}`;
    const password = `Aa1-${randomBytes(18).toString('base64url')}`;
    await asegurarUsuarioApp(db.config, db.config.database, login, password);
    const appPool = await crearPool({ ...db.config, user: login, password }, { max: 5 });
    try {
      const r = await crearResidenteConjunto(appPool, c.admin, { nombre: 'App Res', unidad: 'T9-901' });
      const u = await actualizarResidenteConjunto(appPool, c.admin, r.id, { telefono: '3001234567', versionEsperada: 1 });
      expect(u.version).toBe(2);
      const det = await vincularCorreoResidente(appPool, c.admin, ing.idCorreo, { idResidente: r.id });
      expect(det.idResidente).toBe(r.id);
      const lista = await listarResidentesConjunto(appPool, c.admin);
      expect(lista.find((x) => x.id === r.id)).toMatchObject({ totalSolicitudes: 1 });
    } finally {
      await appPool.close();
      await runSql({ ...db.config, database: 'master' }, `IF SUSER_ID('${login}') IS NOT NULL DROP LOGIN [${login}]`);
    }
  });
});
