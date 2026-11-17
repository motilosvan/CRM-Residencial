import sql from 'mssql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cifrarContrasena,
  ErrorConexionBuzon,
  type BuzonActivo,
  type ResultadoSincronizacionBuzon,
} from '../../api/src/modules/buzones.js';
import { setupTestDb, type TestDb } from '../../api/test/helpers/testDb.js';
import { cicloBuzones } from './ciclo.js';
import { ErrorSincronizacion } from './sincronizar.js';

const SECRETO = 'secreto-de-pruebas-con-más-de-32-caracteres';
let db: TestDb;
let n = 0;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_gwciclo');
});
afterAll(async () => db.close());
// Cada prueba parte sin buzones activos, aunque la anterior haya fallado a medias.
beforeEach(async () => {
  await db.q('UPDATE dbo.BUZONES_CONJUNTO SET activo = 0');
});

const correoDe = (id: number) => `ciclo-${id}@demo.mailflow.test`;

/** Conjunto nuevo con su buzón activo (la contraseña, cifrada con SECRETO salvo que se indique otro). */
async function conjuntoConBuzon(secreto = SECRETO): Promise<number> {
  const slug = `ciclo-${++n}`;
  const id = (
    await db.pool
      .request()
      .input('slug', sql.VarChar(80), slug)
      .input('nombre', sql.NVarChar(120), `Ciclo ${n}`)
      .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)')
  ).recordset[0]!.id;
  await db.pool
    .request()
    .input('c', sql.Int, id)
    .input('correo', sql.NVarChar(320), correoDe(id))
    .input('cifrada', sql.VarBinary(512), cifrarContrasena(secreto, 'clave'))
    .query('INSERT INTO dbo.BUZONES_CONJUNTO (idConjunto, correo, contrasenaCifrada) VALUES (@c, @correo, @cifrada)');
  return id;
}

const fila = async (id: number) =>
  (
    await db.pool
      .request()
      .input('c', sql.Int, id)
      .query<{ ultimoError: string | null; ultimaSincronizacion: Date | null; version: number }>(
        'SELECT ultimoError, ultimaSincronizacion, version FROM dbo.BUZONES_CONJUNTO WHERE idConjunto = @c',
      )
  ).recordset[0]!;

const RES: ResultadoSincronizacionBuzon = { revisados: 2, nuevos: 2, duplicados: 0, respaldos: 0, pendientes: false };

describe('Gateway · cicloBuzones (varios buzones)', () => {
  it('sin buzones activos no sincroniza nada', async () => {
    const r = await cicloBuzones(db.pool, {
      secreto: SECRETO,
      ejecutarSincronizacion: async () => {
        throw new Error('no debería llamarse');
      },
    }, { log: () => {} });
    expect(r).toEqual({ buzones: 0, fallidos: 0, pendientes: false });
  });

  it('el primero falla por autenticación, el segundo se sincroniza; cada resultado queda registrado', async () => {
    const malo = await conjuntoConBuzon();
    const bueno = await conjuntoConBuzon();
    const llamados: BuzonActivo[] = [];
    const lineas: string[] = [];
    const r = await cicloBuzones(
      db.pool,
      {
        secreto: SECRETO,
        ejecutarSincronizacion: async (_p, b) => {
          llamados.push(b);
          if (b.idConjunto === malo) throw new ErrorConexionBuzon('AUTENTICACION');
          return { ...RES, pendientes: true };
        },
      },
      { log: (m) => lineas.push(m) },
    );
    expect(llamados.map((b) => b.idConjunto)).toEqual([malo, bueno]);
    expect(llamados[1]).toMatchObject({ usuario: correoDe(bueno), contrasena: 'clave', buzon: 'INBOX', diasIniciales: 7 });
    expect(r).toEqual({ buzones: 2, fallidos: 1, pendientes: true });

    const fMalo = await fila(malo);
    expect(fMalo.ultimoError).toBe('AUTENTICACION');
    expect(fMalo.ultimaSincronizacion).toBeInstanceOf(Date);
    const fBueno = await fila(bueno);
    expect(fBueno.ultimoError).toBeNull();
    expect(fBueno.ultimaSincronizacion).toBeInstanceOf(Date);
    expect([fMalo.version, fBueno.version]).toEqual([1, 1]);

    // El log identifica por conjunto y nunca muestra la dirección del buzón ni la contraseña.
    expect(lineas.some((l) => l.includes(`conjunto ${malo}`))).toBe(true);
    expect(lineas.some((l) => l.includes(`conjunto ${bueno}`))).toBe(true);
    for (const l of lineas) {
      expect(l).not.toContain('@');
      expect(l).not.toContain('clave');
    }
  });

  it('un error que no es de conexión no detiene a los demás: queda INTERNO y el log no lleva su mensaje', async () => {
    const roto = await conjuntoConBuzon();
    const sano = await conjuntoConBuzon();
    const lineas: string[] = [];
    const r = await cicloBuzones(
      db.pool,
      {
        secreto: SECRETO,
        ejecutarSincronizacion: async (_p, b) => {
          if (b.idConjunto === roto) {
            throw new ErrorSincronizacion(4, Object.assign(new Error('Violation with datos-del-correo'), { name: 'RequestError', number: 547 }));
          }
          return RES;
        },
      },
      { log: (m) => lineas.push(m) },
    );
    expect(r).toEqual({ buzones: 2, fallidos: 1, pendientes: false });
    expect((await fila(sano)).ultimoError).toBeNull();
    expect((await fila(roto)).ultimoError).toBe('INTERNO');
    expect(lineas.join('\n')).toMatch(/RequestError 547/);
    expect(lineas.join('\n')).not.toContain('datos-del-correo');
  });

  it('un buzón indescifrable queda con CLAVE y se omite (los demás siguen)', async () => {
    const otraClave = await conjuntoConBuzon('otro-secreto-distinto-con-más-de-32-caracteres');
    const llamados: number[] = [];
    const r = await cicloBuzones(
      db.pool,
      {
        secreto: SECRETO,
        ejecutarSincronizacion: async (_p, b) => {
          llamados.push(b.idConjunto);
          return RES;
        },
      },
      { log: () => {} },
    );
    expect(llamados).toEqual([]);
    expect(r).toEqual({ buzones: 0, fallidos: 0, pendientes: false });
    expect((await fila(otraClave)).ultimoError).toBe('CLAVE');
  });
});
