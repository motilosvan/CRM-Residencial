import { randomBytes } from 'node:crypto';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, runSql, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { crearPool } from '../db/pool.js';
import { asegurarUsuarioApp } from '../db/usuarioApp.js';
import { ConflictError, Forbidden, ValidationError } from '../errors.js';
import {
  actualizarIdentidadConjunto,
  idConjuntoPorSlug,
  listarConjuntos,
  obtenerIdentidadConjunto,
} from './conjuntos.js';
import type { Actor } from './solicitudes.js';

let db: TestDb;
let n = 0;

interface ConjuntoTest {
  id: number;
  slug: string;
  admin: Actor;
  soporte: Actor;
}

async function nuevoConjunto(paleta?: { p?: string; a?: string; s?: string }): Promise<ConjuntoTest> {
  const slug = `conj-${++n}`;
  const id = (
    await db.pool
      .request()
      .input('slug', sql.VarChar(80), slug)
      .input('nombre', sql.NVarChar(120), `Conjunto ${n}`)
      .input('p', sql.Char(7), paleta?.p ?? null)
      .input('a', sql.Char(7), paleta?.a ?? null)
      .input('s', sql.Char(7), paleta?.s ?? null)
      .query<{ id: number }>(
        `INSERT INTO dbo.CONJUNTOS (slug, nombre, colorPrimario, colorAcento, colorSecundario)
         OUTPUT inserted.idConjunto AS id
         VALUES (@slug, @nombre, @p, @a, @s)`,
      )
  ).recordset[0]!.id;
  const idAdmin = await crearUsuario(db, { nombre: `Admin ${n}`, correo: `admin-c-${n}@demo.mailflow.test`, rol: 'ADMIN', slug });
  const idSoporte = await crearUsuario(db, { nombre: `Soporte ${n}`, correo: `sop-c-${n}@demo.mailflow.test`, rol: 'SOPORTE', slug });
  return {
    id,
    slug,
    admin: { idUsuario: idAdmin, rol: 'ADMIN', idConjunto: id },
    soporte: { idUsuario: idSoporte, rol: 'SOPORTE', idConjunto: id },
  };
}

async function auditoriaConjunto(idConjunto: number) {
  const r = await db.pool
    .request()
    .input('c', sql.Int, idConjunto)
    .query<{ idUsuario: number | null; entidad: string; idEntidad: number; accion: string; detalle: string | null }>(
      `SELECT idUsuario, entidad, idEntidad, accion, detalle
         FROM dbo.AUDITORIA_ADMIN
        WHERE idConjunto = @c AND entidad = 'CONJUNTO'
        ORDER BY idAuditoria`,
    );
  return r.recordset;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_conj');
});
afterAll(async () => {
  await db?.close();
});

describe('identidad del conjunto (obtenerIdentidadConjunto / actualizarIdentidadConjunto)', () => {
  it('mantiene listarConjuntos e idConjuntoPorSlug', async () => {
    const lista = await listarConjuntos(db.pool);
    expect(lista.length).toBeGreaterThanOrEqual(1);
    const idInicial = await idConjuntoPorSlug(db.pool, 'parque-central-occidente');
    expect(idInicial).toBeGreaterThan(0);
  });

  it('obtenerIdentidadConjunto exige ADMIN del conjunto y devuelve ConjuntoIdentidad con version', async () => {
    const a = await nuevoConjunto({ p: '#355E3B', a: '#D6A64F', s: '#789653' });
    const b = await nuevoConjunto();

    const idA = await obtenerIdentidadConjunto(db.pool, a.admin);
    expect(idA).toEqual({
      id: String(a.id),
      slug: a.slug,
      nombre: `Conjunto ${a.slug.split('-')[1]}`,
      paleta: { primario: '#355E3B', acento: '#D6A64F', secundario: '#789653' },
      version: 1,
    });

    await expect(obtenerIdentidadConjunto(db.pool, a.soporte)).rejects.toBeInstanceOf(Forbidden);
    await expect(obtenerIdentidadConjunto(db.pool, { ...a.soporte, rol: 'ADMIN' })).rejects.toBeInstanceOf(Forbidden);
    await expect(obtenerIdentidadConjunto(db.pool, { ...b.admin, idConjunto: a.id })).rejects.toBeInstanceOf(Forbidden);
  });

  it('actualiza nombre, logoUrl y colores normalizados a MAYÚSCULAS; audita y sube version', async () => {
    const c = await nuevoConjunto();
    const res = await actualizarIdentidadConjunto(db.pool, c.admin, {
      nombre: '  Torres del Bosque  ',
      logoUrl: '  https://cdn.demo.mailflow.test/logo.png  ',
      colorPrimario: ' #1e3a5f ',
      colorAcento: '#e0a458',
      colorSecundario: '#2b4c7e',
      versionEsperada: 1,
    });
    expect(res).toEqual({
      id: String(c.id),
      slug: c.slug,
      nombre: 'Torres del Bosque',
      logoUrl: 'https://cdn.demo.mailflow.test/logo.png',
      paleta: { primario: '#1E3A5F', acento: '#E0A458', secundario: '#2B4C7E' },
      version: 2,
    });

    const aud = await auditoriaConjunto(c.id);
    expect(aud).toHaveLength(1);
    expect(aud[0]).toMatchObject({ idUsuario: c.admin.idUsuario, entidad: 'CONJUNTO', idEntidad: c.id, accion: 'ACTUALIZAR' });

    // Acepta ruta relativa simple y limpia logoUrl vacío a null
    const res2 = await actualizarIdentidadConjunto(db.pool, c.admin, { logoUrl: '/logos/bosque.svg', versionEsperada: 2 });
    expect(res2).toMatchObject({ logoUrl: '/logos/bosque.svg', version: 3 });

    const res3 = await actualizarIdentidadConjunto(db.pool, c.admin, { logoUrl: '   ', versionEsperada: 3 });
    expect(res3.logoUrl).toBeUndefined();
    expect(res3.version).toBe(4);
  });

  it('sin cambios efectivos no incrementa version ni audita; versionEsperada vieja → 409', async () => {
    const c = await nuevoConjunto({ p: '#1E3A5F', a: '#E0A458' });
    const actual = await obtenerIdentidadConjunto(db.pool, c.admin);

    const sinCambios = await actualizarIdentidadConjunto(db.pool, c.admin, {
      nombre: actual.nombre,
      colorPrimario: '#1e3a5f',
      versionEsperada: 1,
    });
    expect(sinCambios).toEqual(actual);
    expect(await auditoriaConjunto(c.id)).toHaveLength(0);

    // Omitir versionEsperada → 422 ValidationError
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { nombre: 'Sin Versión' } as never)).rejects.toBeInstanceOf(
      ValidationError,
    );

    // Con versión desactualizada → 409
    await expect(
      actualizarIdentidadConjunto(db.pool, c.admin, { nombre: 'Vieja', versionEsperada: 99 }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Concurrencia: dos actualizaciones paralelas con la misma versionEsperada → 1 éxito, 1 ConflictError
    const rConc = await Promise.allSettled([
      actualizarIdentidadConjunto(db.pool, c.admin, { nombre: 'Paralelo A', versionEsperada: 1 }),
      actualizarIdentidadConjunto(db.pool, c.admin, { nombre: 'Paralelo B', versionEsperada: 1 }),
    ]);
    expect(rConc.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = rConc.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazo?.reason).toBeInstanceOf(ConflictError);
    expect((await obtenerIdentidadConjunto(db.pool, c.admin)).version).toBe(2);
  });

  it('valida reglas de paleta (primario+acento juntos, limpiar ambos fuerza secundario=null) y URLs seguras (422)', async () => {
    const c = await nuevoConjunto({ p: '#1E3A5F', a: '#E0A458', s: '#355E3B' });

    // Quitar solo uno → 422
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { colorPrimario: null, versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { colorAcento: null, versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);

    // Limpiar ambos → fuerza colorSecundario = null incluso si había secundario o si viene en payload
    const limpia = await actualizarIdentidadConjunto(db.pool, c.admin, {
      colorPrimario: null,
      colorAcento: null,
      colorSecundario: '#112233',
      versionEsperada: 1,
    });
    expect(limpia.paleta).toBeUndefined();
    const filaBd = await db.pool
      .request()
      .input('c', sql.Int, c.id)
      .query<{ colorPrimario: string | null; colorAcento: string | null; colorSecundario: string | null }>(
        'SELECT colorPrimario, colorAcento, colorSecundario FROM dbo.CONJUNTOS WHERE idConjunto = @c',
      );
    expect(filaBd.recordset[0]).toEqual({ colorPrimario: null, colorAcento: null, colorSecundario: null });

    // Poner solo uno desde null → 422
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { colorPrimario: '#1E3A5F', versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { colorAcento: '#E0A458', versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);

    // Colores inválidos → 422
    for (const malo of ['#fff', '1E3A5F', '#12345G', '#1234567', '']) {
      await expect(
        actualizarIdentidadConjunto(db.pool, c.admin, { colorPrimario: malo, colorAcento: '#E0A458', versionEsperada: 2 }),
      ).rejects.toBeInstanceOf(ValidationError);
    }

    // URLs peligrosas o inválidas → 422
    for (const urlMala of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:image/svg+xml,<svg/>',
      'vbscript:msgbox(1)',
      'ftp://files.example/logo.png',
      '//evil.example/logo.png',
      '/\\evil.example/logo.png',
      'logo.png',
      `https://example.com/${'a'.repeat(490)}`,
    ]) {
      await expect(actualizarIdentidadConjunto(db.pool, c.admin, { logoUrl: urlMala, versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);
    }

    // Nombre inválido o petición sin campos → 422
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { nombre: '   ', versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { nombre: 'x'.repeat(121), versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarIdentidadConjunto(db.pool, c.admin, { versionEsperada: 2 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('funciona con los permisos mínimos del rol crm_app (sin tocar slug)', async () => {
    const c = await nuevoConjunto();
    const login = `soc_conj_${randomBytes(4).toString('hex')}`;
    const password = `Aa1-${randomBytes(18).toString('base64url')}`;
    await asegurarUsuarioApp(db.config, db.config.database, login, password);
    const appPool = await crearPool({ ...db.config, user: login, password }, { max: 5 });
    try {
      const actual = await obtenerIdentidadConjunto(appPool, c.admin);
      expect(actual.version).toBe(1);
      const upd = await actualizarIdentidadConjunto(appPool, c.admin, {
        nombre: 'Nombre por crm_app',
        logoUrl: 'http://localhost:5173/logo.png',
        colorPrimario: '#1e3a5f',
        colorAcento: '#e0a458',
        versionEsperada: 1,
      });
      expect(upd).toMatchObject({ nombre: 'Nombre por crm_app', slug: c.slug, version: 2 });
    } finally {
      await appPool.close();
      await runSql({ ...db.config, database: 'master' }, `IF SUSER_ID('${login}') IS NOT NULL DROP LOGIN [${login}]`);
    }
  });
});
