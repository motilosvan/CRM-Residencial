import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ESTADOS, puedeTransicionar } from '../domain/estados.js';
import { setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ConflictError, NotFound, TransicionInvalida, ValidationError } from '../errors.js';
import { asignar } from './asignaciones.js';
import { ingestarCorreo } from './ingesta.js';
import { cambiarEstado, reclasificar } from './solicitudes.js';

let db: TestDb;
const ADMIN = 1;
const SOPORTE_A = 2;
const SOPORTE_B = 3;
const INACTIVO = 4;
let contador = 0;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_tx2');
  await db.q(`
    INSERT INTO USUARIOS (nombre, rol, correo, activo) VALUES
      ('Admin', 'ADMIN', 'admin@c.com', 1), ('Soporte A', 'SOPORTE', 'a@c.com', 1),
      ('Soporte B', 'SOPORTE', 'b@c.com', 1), ('Inactivo', 'SOPORTE', 'i@c.com', 0);
  `);
});
afterAll(async () => db.close());

/** Crea una solicitud NUEVA pasando por T1. */
async function nueva(asunto = 'Fuga de agua', cuerpo = 'en el baño'): Promise<number> {
  const r = await ingestarCorreo(db.pool, { messageId: `<tx-${++contador}@t>`, remitente: 'ana@mail.com', asunto, cuerpo });
  if (r.duplicado) throw new Error('no debería ser duplicado');
  return r.idSolicitud;
}

/** Asigna usando la versión vigente (como haría un cliente que acaba de recargar la solicitud). */
async function asignarActual(id: number, responsable: number) {
  const v = (await db.q<{ version: number }>(`SELECT version FROM SOLICITUDES WHERE idSolicitud = ${id}`))[0]?.version ?? 1;
  return asignar(db.pool, { idSolicitud: id, idResponsable: responsable, idAsignador: ADMIN, versionEsperada: v });
}

const estadoDe = (id: number) =>
  db.q<{ estado: string; version: number; primeraRespuesta: Date | null; fechaCierre: Date | null }>(
    `SELECT e.nombre AS estado, s.version, s.primeraRespuesta, s.fechaCierre
       FROM SOLICITUDES s JOIN ESTADOS e ON e.idEstado = s.idEstado WHERE s.idSolicitud = ${id}`,
  ).then((r) => r[0]!);
const vigentes = (id: number) =>
  db.q<{ idUsuario: number }>(`SELECT idUsuario FROM ASIGNACIONES WHERE idSolicitud = ${id} AND liberadaEn IS NULL`);
const historial = (id: number) =>
  db.q<{ a: string | null; n: string; comentario: string | null }>(
    `SELECT ea.nombre AS a, en.nombre AS n, h.comentario FROM HISTORIAL_ESTADOS h
       LEFT JOIN ESTADOS ea ON ea.idEstado = h.idEstadoAnterior JOIN ESTADOS en ON en.idEstado = h.idEstadoNuevo
      WHERE h.idSolicitud = ${id} ORDER BY h.idHistorial`,
  );

/** Foto completa de las tablas que tocan las transacciones, para comparar antes/después de un rollback. */
async function foto() {
  const t = (tabla: string, orden: string) => db.q(`SELECT * FROM ${tabla} ORDER BY ${orden}`);
  return JSON.stringify([
    await t('CORREOS', 'idCorreo'),
    await t('SOLICITUDES', 'idSolicitud'),
    await t('ASIGNACIONES', 'idAsignacion'),
    await t('HISTORIAL_ESTADOS', 'idHistorial'),
    await t('GATEWAY_CHECKPOINT', 'cuenta'),
  ]);
}

describe('T2 · asignar', () => {
  it('NUEVA → ASIGNADA con una asignación vigente, historial y versión +1', async () => {
    const id = await nueva();
    const r = await asignarActual(id, SOPORTE_A);
    expect(r).toMatchObject({ sinCambios: false, version: 2, estado: 'ASIGNADA' });
    expect(await estadoDe(id)).toMatchObject({ estado: 'ASIGNADA', version: 2 });
    expect((await vigentes(id)).map((v) => v.idUsuario)).toEqual([SOPORTE_A]);
    expect((await historial(id)).map((h) => `${h.a}>${h.n}`)).toEqual(['null>NUEVA', 'NUEVA>ASIGNADA']);
  });

  it('asignar al mismo responsable es un no-op', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    const r = await asignarActual(id, SOPORTE_A);
    expect(r).toEqual({ sinCambios: true, version: 2 });
    expect(await db.q(`SELECT * FROM ASIGNACIONES WHERE idSolicitud = ${id}`)).toHaveLength(1);
  });

  it('reasignar libera la anterior, conserva el historial de asignaciones y mantiene una sola vigente', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    await asignarActual(id, SOPORTE_B);
    expect((await vigentes(id)).map((v) => v.idUsuario)).toEqual([SOPORTE_B]);
    expect(await db.q(`SELECT * FROM ASIGNACIONES WHERE idSolicitud = ${id}`)).toHaveLength(2);
    expect((await estadoDe(id)).estado).toBe('ASIGNADA'); // reasignar no cambia el estado
    // pero sí queda en la bitácora, con quién es el nuevo responsable
    expect((await historial(id)).at(-1)).toMatchObject({ a: 'ASIGNADA', n: 'ASIGNADA', comentario: 'Reasignada a Soporte B' });
  });

  it('exige versionEsperada: sin ella la operación se rechaza (no se puede pisar a ciegas)', async () => {
    const id = await nueva();
    await expect(
      asignar(db.pool, { idSolicitud: id, idResponsable: SOPORTE_A, idAsignador: ADMIN } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza responsable inexistente o inactivo, y solicitud inexistente', async () => {
    const id = await nueva();
    await expect(asignarActual(id, 999)).rejects.toBeInstanceOf(ValidationError);
    await expect(asignarActual(id, INACTIVO)).rejects.toBeInstanceOf(ValidationError);
    await expect(asignarActual(99999, SOPORTE_A)).rejects.toBeInstanceOf(NotFound);
    expect((await estadoDe(id)).estado).toBe('NUEVA');
  });

  it('rechaza una versión desactualizada', async () => {
    const id = await nueva();
    await expect(
      asignar(db.pool, { idSolicitud: id, idResponsable: SOPORTE_A, idAsignador: ADMIN, versionEsperada: 7 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('20 asignaciones simultáneas con la misma versión → exactamente 1 gana, 19 reciben conflicto, 1 vigente', async () => {
    const id = await nueva();
    const res = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        asignar(db.pool, { idSolicitud: id, idResponsable: i % 2 === 0 ? SOPORTE_A : SOPORTE_B, idAsignador: ADMIN, versionEsperada: 1 }),
      ),
    );
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazos = res.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazos.every((r) => r.reason instanceof ConflictError)).toBe(true);
    expect(await vigentes(id)).toHaveLength(1);
    expect(await db.q(`SELECT * FROM ASIGNACIONES WHERE idSolicitud = ${id}`)).toHaveLength(1);
    expect((await estadoDe(id)).version).toBe(2);
  });

  it('20 reasignaciones encadenadas en paralelo (cada una con la versión que lee) → nunca 2 vigentes', async () => {
    const id = await nueva();
    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        for (let intento = 0; intento < 50; intento++) {
          try {
            return await asignarActual(id, i % 2 === 0 ? SOPORTE_A : SOPORTE_B);
          } catch (e) {
            if (!(e instanceof ConflictError)) throw e; // reintenta como haría un cliente al recargar
          }
        }
        throw new Error('demasiados conflictos');
      }),
    );
    expect(await vigentes(id)).toHaveLength(1);
    const filas = await db.q(`SELECT * FROM ASIGNACIONES WHERE idSolicitud = ${id}`);
    expect((await estadoDe(id)).version).toBe(1 + filas.length); // cada cambio real sube la versión una vez
  });

  it('no asigna solicitudes RESUELTA o CERRADA', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 2 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'RESUELTA', idUsuario: SOPORTE_A, versionEsperada: 3 });
    await expect(asignarActual(id, SOPORTE_B)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('T3 · cambiarEstado', () => {
  it('ciclo completo NUEVA → ASIGNADA → EN_PROCESO → RESUELTA → CERRADA con historial y métricas', async () => {
    const id = await nueva();
    expect((await estadoDe(id)).primeraRespuesta).toBeNull();
    await asignarActual(id, SOPORTE_A);

    const r1 = await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 2, comentario: 'Voy en camino' });
    expect(r1).toEqual({ idSolicitud: id, estado: 'EN_PROCESO', version: 3 });
    const e1 = await estadoDe(id);
    expect(e1.primeraRespuesta).not.toBeNull();
    expect(e1.fechaCierre).toBeNull();

    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'RESUELTA', idUsuario: SOPORTE_A, versionEsperada: 3 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'CERRADA', idUsuario: ADMIN, versionEsperada: 4 });
    const fin = await estadoDe(id);
    expect(fin).toMatchObject({ estado: 'CERRADA', version: 5 });
    expect(fin.fechaCierre).not.toBeNull();
    expect(fin.primeraRespuesta).toEqual(e1.primeraRespuesta); // la primera respuesta no se pisa

    expect((await historial(id)).map((h) => `${h.a}>${h.n}`)).toEqual([
      'null>NUEVA', 'NUEVA>ASIGNADA', 'ASIGNADA>EN_PROCESO', 'EN_PROCESO>RESUELTA', 'RESUELTA>CERRADA',
    ]);
    expect((await historial(id))[2]?.comentario).toBe('Voy en camino');
  });

  it('rechaza saltos inválidos, estados inexistentes y salir de CERRADA', async () => {
    const id = await nueva();
    await expect(cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'CERRADA', idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(TransicionInvalida);
    await expect(cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(TransicionInvalida);
    await expect(cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'INVENTADO', idUsuario: ADMIN, versionEsperada: 1 } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(cambiarEstado(db.pool, { idSolicitud: 99999, nuevoEstado: 'ASIGNADA', idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(NotFound);
    expect(await estadoDe(id)).toMatchObject({ estado: 'NUEVA', version: 1 });
    expect(await historial(id)).toHaveLength(1);
  });

  it('NUEVA → ASIGNADA solo se hace con asignar(): nunca una solicitud ASIGNADA sin responsable', async () => {
    const id = await nueva();
    await expect(cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'ASIGNADA', idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(TransicionInvalida);
    expect((await estadoDe(id)).estado).toBe('NUEVA');
  });

  it('desasignar (ASIGNADA → NUEVA) libera la asignación vigente', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'NUEVA', idUsuario: ADMIN, versionEsperada: 2 });
    expect(await vigentes(id)).toHaveLength(0);
    expect((await estadoDe(id)).estado).toBe('NUEVA');
    // y se puede volver a asignar
    await asignarActual(id, SOPORTE_B);
    expect((await vigentes(id)).map((v) => v.idUsuario)).toEqual([SOPORTE_B]);
  });

  it('reabrir: RESUELTA → EN_PROCESO', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 2 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'RESUELTA', idUsuario: SOPORTE_A, versionEsperada: 3 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: ADMIN, versionEsperada: 4, comentario: 'El vecino reporta que sigue' });
    expect((await estadoDe(id)).estado).toBe('EN_PROCESO');
  });

  it('una versión desactualizada recibe ConflictError y no cambia nada', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    await expect(
      cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await estadoDe(id)).toMatchObject({ estado: 'ASIGNADA', version: 2 });
  });

  it('10 cambios simultáneos con la misma versión → exactamente 1 gana y 9 reciben ConflictError', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    const res = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        cambiarEstado(db.pool, {
          idSolicitud: id,
          nuevoEstado: i % 2 === 0 ? 'EN_PROCESO' : 'NUEVA',
          idUsuario: i % 2 === 0 ? SOPORTE_A : ADMIN,
          versionEsperada: 2,
        }),
      ),
    );
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazos = res.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazos).toHaveLength(9);
    expect(rechazos.every((r) => r.reason instanceof ConflictError)).toBe(true);
    expect((await estadoDe(id)).version).toBe(3);
    expect(await historial(id)).toHaveLength(3); // NUEVA, ASIGNADA y el único cambio ganador
  });

  it('auditoría: "asignada" o "NUEVA " no burlan las reglas (antes dejaban ASIGNADA sin responsable)', async () => {
    const id = await nueva();
    for (const truco of ['asignada', 'ASIGNADA ', 'Asignada']) {
      await expect(
        cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: truco, idUsuario: ADMIN, versionEsperada: 1 } as never),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await estadoDe(id)).toMatchObject({ estado: 'NUEVA', version: 1 });

    await asignarActual(id, SOPORTE_A);
    await expect(
      cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'nueva', idUsuario: ADMIN, versionEsperada: 2 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await vigentes(id)).map((v) => v.idUsuario)).toEqual([SOPORTE_A]);
  });

  it('cerrar libera la asignación vigente (la carga del responsable baja) y deja fechaCierre', async () => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 2 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'RESUELTA', idUsuario: SOPORTE_A, versionEsperada: 3 });
    expect(await vigentes(id)).toHaveLength(1);
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'CERRADA', idUsuario: ADMIN, versionEsperada: 4 });
    expect(await vigentes(id)).toHaveLength(0);
    expect(await db.q(`SELECT * FROM ASIGNACIONES WHERE idSolicitud = ${id}`)).toHaveLength(1); // se conserva como historia
  });

  it('valida la entrada: ids no enteros, usuario inexistente o inactivo → ValidationError sin tocar la BD', async () => {
    const id = await nueva();
    await expect(cambiarEstado(db.pool, { idSolicitud: id + 0.5, nuevoEstado: 'NUEVA', idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(cambiarEstado(db.pool, { idSolicitud: Number.NaN, nuevoEstado: 'NUEVA', idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await asignarActual(id, SOPORTE_A);
    await expect(cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: 999, versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: INACTIVO, versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 2, comentario: 'x'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    expect(await estadoDe(id)).toMatchObject({ estado: 'ASIGNADA', version: 2 });
  });

  it('la máquina de estados de dominio coincide con la tabla TRANSICIONES_ESTADO', async () => {
    const filas = await db.q<{ o: string; d: string }>(
      `SELECT o.nombre AS o, d.nombre AS d FROM TRANSICIONES_ESTADO t
         JOIN ESTADOS o ON o.idEstado = t.idEstadoOrigen JOIN ESTADOS d ON d.idEstado = t.idEstadoDestino`,
    );
    const enBd = new Set(filas.map((f) => `${f.o}>${f.d}`));
    const enDominio = new Set(ESTADOS.flatMap((o) => ESTADOS.filter((d) => puedeTransicionar(o, d)).map((d) => `${o}>${d}`)));
    expect(enBd).toEqual(enDominio);
  });
});

describe('T4 · reclasificar', () => {
  it('cambia categoría y prioridad, sube la versión y deja historial con el detalle', async () => {
    const id = await nueva('Hola', ''); // SIN_CLASIFICAR / MEDIA
    const r = await reclasificar(db.pool, { idSolicitud: id, categoria: 'SEGURIDAD', prioridad: 'ALTA', idUsuario: ADMIN, versionEsperada: 1, comentario: 'Era un robo' });
    expect(r).toEqual({ idSolicitud: id, categoria: 'SEGURIDAD', prioridad: 'ALTA', version: 2, sinCambios: false });
    const h = await historial(id);
    expect(h.at(-1)?.comentario).toBe('Reclasificada: categoría SIN_CLASIFICAR → SEGURIDAD; prioridad MEDIA → ALTA. Era un robo');
    expect(h.at(-1)).toMatchObject({ a: 'NUEVA', n: 'NUEVA' }); // no cambia el estado
  });

  it('reclasificar sin cambios no sube la versión ni ensucia el historial (evita 409 espurios)', async () => {
    const id = await nueva(); // MANTENIMIENTO / MEDIA
    const antes = await historial(id);
    const r = await reclasificar(db.pool, { idSolicitud: id, categoria: 'MANTENIMIENTO', prioridad: 'MEDIA', idUsuario: ADMIN, versionEsperada: 1 });
    expect(r).toMatchObject({ sinCambios: true, version: 1 });
    expect((await estadoDe(id)).version).toBe(1);
    expect(await historial(id)).toEqual(antes);
  });

  it('puede cambiar solo la prioridad', async () => {
    const id = await nueva();
    const r = await reclasificar(db.pool, { idSolicitud: id, prioridad: 'BAJA', idUsuario: ADMIN, versionEsperada: 1 });
    expect(r.prioridad).toBe('BAJA');
    expect(r.categoria).toBe('MANTENIMIENTO');
  });

  it('rechaza versión vieja, petición vacía, solicitud CERRADA e inexistente', async () => {
    const id = await nueva();
    await expect(reclasificar(db.pool, { idSolicitud: id, prioridad: 'BAJA', idUsuario: ADMIN, versionEsperada: 9 })).rejects.toBeInstanceOf(ConflictError);
    await expect(reclasificar(db.pool, { idSolicitud: id, idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(reclasificar(db.pool, { idSolicitud: 99999, prioridad: 'BAJA', idUsuario: ADMIN, versionEsperada: 1 })).rejects.toBeInstanceOf(NotFound);

    await asignarActual(id, SOPORTE_A);
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 2 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'RESUELTA', idUsuario: SOPORTE_A, versionEsperada: 3 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'CERRADA', idUsuario: ADMIN, versionEsperada: 4 });
    await expect(reclasificar(db.pool, { idSolicitud: id, prioridad: 'ALTA', idUsuario: ADMIN, versionEsperada: 5 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('S2-06 · atomicidad: un fallo a mitad de cualquier transacción no deja cambios parciales', () => {
  const falla = (en: string) => ({
    despuesDe: (p: string) => {
      if (p === en) throw new Error(`fallo inyectado tras "${p}"`);
    },
  });

  it.each(['correo', 'solicitud', 'historial', 'checkpoint'])('T1 ingesta: fallo tras "%s" → rollback total', async (punto) => {
    const antes = await foto();
    await expect(
      ingestarCorreo(
        db.pool,
        { messageId: `<atom-${punto}>`, remitente: 'ana@mail.com', asunto: 'Robo', cuerpo: 'x', checkpoint: { cuenta: 'atom@gmail.com', uidValidity: 1, uid: 99 } },
        falla(punto),
      ),
    ).rejects.toThrow(/fallo inyectado/);
    expect(await foto()).toBe(antes); // ni correo, ni solicitud, ni historial, ni checkpoint
  });

  it('tras un fallo, reintentar el mismo correo funciona (no quedó "a medias")', async () => {
    const r = await ingestarCorreo(db.pool, { messageId: '<atom-correo>', remitente: 'ana@mail.com', asunto: 'Robo', cuerpo: 'x' });
    expect(r.duplicado).toBe(false);
  });

  it.each(['liberar', 'asignacion', 'historial', 'update'])('T2 asignar: fallo tras "%s" → rollback total', async (punto) => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    const id2 = await nueva(); // una NUEVA, para ejercitar también el cambio de estado
    for (const sol of [id, id2]) {
      const antes = await foto();
      await expect(asignar(db.pool, { idSolicitud: sol, idResponsable: SOPORTE_B, idAsignador: ADMIN, versionEsperada: (await estadoDe(sol)).version }, falla(punto))).rejects.toThrow(/fallo inyectado/);
      expect(await foto()).toBe(antes);
    }
  });

  it.each(['liberar', 'update', 'historial'])('T3 cambiar estado: fallo tras "%s" → rollback total', async (punto) => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    const antes = await foto();
    for (const nuevoEstado of ['EN_PROCESO', 'NUEVA'] as const) {
      await expect(
        cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado, idUsuario: ADMIN, versionEsperada: 2 }, falla(punto)),
      ).rejects.toThrow(/fallo inyectado/);
      expect(await foto()).toBe(antes);
    }
  });

  it.each(['liberar', 'update', 'historial'])('T3 cerrar (libera la asignación): fallo tras "%s" → rollback total', async (punto) => {
    const id = await nueva();
    await asignarActual(id, SOPORTE_A);
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'EN_PROCESO', idUsuario: SOPORTE_A, versionEsperada: 2 });
    await cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'RESUELTA', idUsuario: SOPORTE_A, versionEsperada: 3 });
    const antes = await foto();
    await expect(
      cambiarEstado(db.pool, { idSolicitud: id, nuevoEstado: 'CERRADA', idUsuario: ADMIN, versionEsperada: 4 }, falla(punto)),
    ).rejects.toThrow(/fallo inyectado/);
    expect(await foto()).toBe(antes);
    expect(await vigentes(id)).toHaveLength(1); // la asignación sigue vigente: el cierre no se hizo
  });

  it.each(['update', 'historial'])('T4 reclasificar: fallo tras "%s" → rollback total', async (punto) => {
    const id = await nueva();
    const antes = await foto();
    await expect(
      reclasificar(db.pool, { idSolicitud: id, categoria: 'SEGURIDAD', prioridad: 'ALTA', idUsuario: ADMIN, versionEsperada: 1 }, falla(punto)),
    ).rejects.toThrow(/fallo inyectado/);
    expect(await foto()).toBe(antes);
  });
});
