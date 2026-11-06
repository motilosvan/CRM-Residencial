import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ValidationError } from '../errors.js';
import { asignar } from './asignaciones.js';
import { detalleCorreo, listarCorreos, solicitudesParaSugerir } from './consultas.js';
import { ingestarCorreo } from './ingesta.js';
import { registrarFalloSugerencia, registrarSugerencia } from './sugerencias.js';

let db: TestDb;
let n = 0;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_sug');
  await db.q(`INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES (N'Ana Pérez', 'T1-101', 'ana@mail.com')`);
});
afterAll(async () => db.close());
beforeEach(async () => {
  await db.q('DELETE FROM SUGERENCIAS_IA');
});

async function nuevaSolicitud(asunto = 'Fuga en el baño', cuerpo = 'Hay agua'): Promise<number> {
  const r = await ingestarCorreo(db.pool, { messageId: `<sug-${++n}@mail>`, remitente: 'ana@mail.com', asunto, cuerpo });
  if (r.duplicado) throw new Error('inesperado');
  return r.idSolicitud;
}

const base = { proveedor: 'openrouter', modelo: 'modelo/prueba:free' };
const sugerencia = (idSolicitud: number) => ({
  ...base, idSolicitud, categoria: 'MANTENIMIENTO' as const, prioridad: 'MEDIA' as const,
  resumen: 'Fuga de agua en el baño', justificacion: 'Menciona una fuga',
});
const fallo = (idSolicitud: number, maxIntentos = 3) => ({ ...base, idSolicitud, causa: 'JSON inválido', maxIntentos, esperaMinutos: 30 });
const fila = (id: number) =>
  db.q<{ estado: string; intentos: number; ultimoError: string | null; reintentoFuturo: number }>(
    `SELECT estado, intentos, ultimoError,
            CASE WHEN proximoIntento > SYSUTCDATETIME() THEN 1 ELSE 0 END AS reintentoFuturo
       FROM SUGERENCIAS_IA WHERE idSolicitud = ${id}`,
  ).then((r) => r[0]);
const pendientes = async () => (await solicitudesParaSugerir(db.pool, 100)).map((s) => s.idSolicitud);

describe('T7 · registrarSugerencia', () => {
  it('guarda la sugerencia sin tocar la solicitud: su estado, categoría y version no cambian', async () => {
    const id = await nuevaSolicitud();
    const antes = await db.q(`SELECT idEstado, idCategoria, idPrioridad, version FROM SOLICITUDES WHERE idSolicitud = ${id}`);
    await registrarSugerencia(db.pool, { ...sugerencia(id), categoria: 'FACTURACION', prioridad: 'BAJA' });

    expect(await db.q(`SELECT idEstado, idCategoria, idPrioridad, version FROM SOLICITUDES WHERE idSolicitud = ${id}`)).toEqual(antes);
    const h = await db.q(`SELECT COUNT(*) AS n FROM HISTORIAL_ESTADOS WHERE idSolicitud = ${id}`);
    expect(h[0]).toEqual({ n: 1 }); // solo el historial inicial de T1
    expect(await fila(id)).toMatchObject({ estado: 'LISTA', intentos: 0 });
  });

  it('es idempotente: una sugerencia LISTA no se reemplaza ni se duplica', async () => {
    const id = await nuevaSolicitud();
    await registrarSugerencia(db.pool, sugerencia(id));
    await registrarSugerencia(db.pool, { ...sugerencia(id), resumen: 'Otro resumen' });
    const r = await db.q<{ n: number; resumen: string }>(
      `SELECT COUNT(*) AS n, MAX(resumen) AS resumen FROM SUGERENCIAS_IA WHERE idSolicitud = ${id}`,
    );
    expect(r[0]).toEqual({ n: 1, resumen: 'Fuga de agua en el baño' });
  });

  it('dos registros simultáneos de la misma solicitud dejan una sola fila', async () => {
    const id = await nuevaSolicitud();
    await Promise.all(Array.from({ length: 8 }, () => registrarSugerencia(db.pool, sugerencia(id))));
    expect(await db.q(`SELECT COUNT(*) AS n FROM SUGERENCIAS_IA WHERE idSolicitud = ${id}`)).toEqual([{ n: 1 }]);
  });

  it('seguridad nunca queda en BAJA aunque el modelo lo sugiera', async () => {
    const id = await nuevaSolicitud();
    await registrarSugerencia(db.pool, { ...sugerencia(id), categoria: 'SEGURIDAD', prioridad: 'BAJA' });
    const r = await db.q(
      `SELECT p.nombre AS prioridad FROM SUGERENCIAS_IA g JOIN PRIORIDADES p ON p.idPrioridad = g.idPrioridad WHERE g.idSolicitud = ${id}`,
    );
    expect(r).toEqual([{ prioridad: 'ALTA' }]);
  });

  it('rechaza categorías inventadas y un resumen vacío; recorta los textos largos', async () => {
    const id = await nuevaSolicitud();
    await expect(registrarSugerencia(db.pool, { ...sugerencia(id), categoria: 'INVENTADA' as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(registrarSugerencia(db.pool, { ...sugerencia(id), resumen: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await registrarSugerencia(db.pool, { ...sugerencia(id), resumen: 'x'.repeat(900) });
    expect(await db.q(`SELECT LEN(resumen) AS n FROM SUGERENCIAS_IA WHERE idSolicitud = ${id}`)).toEqual([{ n: 500 }]);
  });

  it('la BD rechaza una sugerencia LISTA incompleta, una duplicada y un estado desconocido', async () => {
    const id = await nuevaSolicitud();
    const insertar = (estado: string, resumen: string) =>
      db.q(`INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, proveedor, modelo, resumen, proximoIntento)
            VALUES (${id}, '${estado}', 'p', 'm', ${resumen}, SYSUTCDATETIME())`);
    await expect(insertar('LISTA', 'NULL')).rejects.toThrow(/CK_SugerenciasIA_lista/);
    await expect(insertar('lista', 'NULL')).rejects.toThrow(/CK_SugerenciasIA_estado/); // nombres exactos
    await expect(db.q(`INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, proveedor, modelo) VALUES (${id}, 'EN_REINTENTO', 'p', 'm')`))
      .rejects.toThrow(/CK_SugerenciasIA_reintento/);
    await insertar('FALLIDA', 'NULL');
    await expect(insertar('FALLIDA', 'NULL')).rejects.toThrow(/UX_SugerenciasIA_idSolicitud/);
  });
});

describe('T7 · registrarFalloSugerencia', () => {
  it('programa reintentos y, al agotar los intentos, deja FALLIDA', async () => {
    const id = await nuevaSolicitud();
    await registrarFalloSugerencia(db.pool, fallo(id));
    expect(await fila(id)).toEqual({ estado: 'EN_REINTENTO', intentos: 1, ultimoError: 'JSON inválido', reintentoFuturo: 1 });
    await registrarFalloSugerencia(db.pool, fallo(id));
    await registrarFalloSugerencia(db.pool, fallo(id));
    expect(await fila(id)).toEqual({ estado: 'FALLIDA', intentos: 3, ultimoError: 'JSON inválido', reintentoFuturo: 0 });
  });

  it('con maxIntentos=1 el primer fallo ya es definitivo', async () => {
    const id = await nuevaSolicitud();
    await registrarFalloSugerencia(db.pool, fallo(id, 1));
    expect(await fila(id)).toMatchObject({ estado: 'FALLIDA', intentos: 1 });
  });

  it('un reintento exitoso limpia el error; un fallo tardío no borra una sugerencia LISTA', async () => {
    const id = await nuevaSolicitud();
    await registrarFalloSugerencia(db.pool, fallo(id));
    await registrarSugerencia(db.pool, sugerencia(id));
    expect(await fila(id)).toMatchObject({ estado: 'LISTA', ultimoError: null, reintentoFuturo: 0 });
    await registrarFalloSugerencia(db.pool, fallo(id));
    expect(await fila(id)).toMatchObject({ estado: 'LISTA', ultimoError: null });
  });
});

describe('solicitudesParaSugerir', () => {
  it('devuelve las NUEVAS sin sugerencia, las más antiguas primero', async () => {
    await db.q('INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, proveedor, modelo) SELECT idSolicitud, \'FALLIDA\', \'p\', \'m\' FROM SOLICITUDES');
    const a = await nuevaSolicitud();
    const b = await nuevaSolicitud();
    expect(await pendientes()).toEqual([a, b]);
    expect((await solicitudesParaSugerir(db.pool, 1)).map((s) => s.idSolicitud)).toEqual([a]);
  });

  it('excluye LISTA, FALLIDA y los reintentos que aún no vencen; incluye los vencidos', async () => {
    await db.q('INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, proveedor, modelo) SELECT idSolicitud, \'FALLIDA\', \'p\', \'m\' FROM SOLICITUDES');
    const lista = await nuevaSolicitud();
    const fallida = await nuevaSolicitud();
    const reintento = await nuevaSolicitud();
    await registrarSugerencia(db.pool, sugerencia(lista));
    await registrarFalloSugerencia(db.pool, fallo(fallida, 1));
    await registrarFalloSugerencia(db.pool, fallo(reintento));
    expect(await pendientes()).toEqual([]);

    await db.q(`UPDATE SUGERENCIAS_IA SET proximoIntento = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE idSolicitud = ${reintento}`);
    expect(await pendientes()).toEqual([reintento]);
  });

  it('una solicitud que ya no está NUEVA no gasta cuota de IA', async () => {
    await db.q('INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, proveedor, modelo) SELECT idSolicitud, \'FALLIDA\', \'p\', \'m\' FROM SOLICITUDES');
    const id = await nuevaSolicitud();
    const usuarios = await db.q<{ id: number }>(
      `INSERT INTO USUARIOS (nombre, rol, correo, activo) OUTPUT inserted.idUsuario AS id
       VALUES ('Admin', 'ADMIN', 'admin@x.co', 1), ('Soporte', 'SOPORTE', 'soporte@x.co', 1)`,
    );
    await asignar(db.pool, { idSolicitud: id, idResponsable: usuarios[1]!.id, idAsignador: usuarios[0]!.id, versionEsperada: 1 });
    expect(await pendientes()).toEqual([]);
  });
});

describe('Buzón con sugerencias', () => {
  it('detalleCorreo trae el cuerpo enmascarado y la sugerencia; listarCorreos, su estado y categoría', async () => {
    const id = await nuevaSolicitud('Gotera', 'Soy Ana Pérez, mi celular es 310 555 1234');
    await registrarSugerencia(db.pool, sugerencia(id));
    const { correos } = await listarCorreos(db.pool, { q: 'Gotera' });
    expect(correos[0]).toMatchObject({ sugerenciaEstado: 'LISTA', sugerenciaCategoria: 'MANTENIMIENTO' });

    const d = await detalleCorreo(db.pool, correos[0]!.id);
    expect(d.cuerpo).toContain('310 555 1234'); // el original no se altera
    expect(d.cuerpoEnmascarado).toBe('Soy [NOMBRE_PROTEGIDO], mi celular es [TEL_PROTEGIDO]');
    expect(d.sugerencia).toMatchObject({ estado: 'LISTA', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA', modelo: base.modelo });
  });

  it('sin sugerencia, los campos quedan en null', async () => {
    await nuevaSolicitud('Sin sugerencia');
    const { correos } = await listarCorreos(db.pool, { q: 'Sin sugerencia' });
    expect(correos[0]).toMatchObject({ sugerenciaEstado: null, sugerenciaCategoria: null });
    expect((await detalleCorreo(db.pool, correos[0]!.id)).sugerencia).toBeNull();
  });
});
