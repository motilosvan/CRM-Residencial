import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { asegurarUsuariosIniciales } from './semilla.js';

let db: TestDb;
let conjunto: number;

interface Fila { correo: string; rolMembresia: string | null; activoMembresia: boolean | null; n: number }

async function filas(): Promise<Fila[]> {
  return db.q<Fila>(
    `SELECT u.correo, m.rol AS rolMembresia, m.activo AS activoMembresia, COUNT(*) OVER (PARTITION BY u.correo) AS n
       FROM dbo.USUARIOS u
       LEFT JOIN dbo.USUARIO_CONJUNTOS m ON m.idUsuario = u.idUsuario AND m.idConjunto = ${conjunto}
      ORDER BY u.correo`,
  );
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_sem');
  conjunto = await idConjuntoInicial(db);
});
afterAll(async () => db.close());

describe('asegurarUsuariosIniciales', () => {
  it('demo: false crea solo el admin inicial, y dos ejecuciones dejan una fila por usuario y membresía', async () => {
    await asegurarUsuariosIniciales(db.pool, { adminCorreo: 'Jefe@Mail.com', demo: false });
    await asegurarUsuariosIniciales(db.pool, { adminCorreo: 'jefe@mail.com', demo: false });
    expect(await filas()).toEqual([{ correo: 'jefe@mail.com', rolMembresia: 'ADMIN', activoMembresia: true, n: 1 }]);
  });

  it('sin adminCorreo ni demo no crea nada nuevo', async () => {
    await asegurarUsuariosIniciales(db.pool, { adminCorreo: null, demo: false });
    expect((await filas()).map((f) => f.correo)).toEqual(['jefe@mail.com']);
  });

  it('con demo crea admin y soporte de demostración, idempotente', async () => {
    await asegurarUsuariosIniciales(db.pool, { adminCorreo: null, demo: true });
    await asegurarUsuariosIniciales(db.pool, { adminCorreo: null, demo: true });
    expect(await filas()).toEqual([
      { correo: 'admin@demo.mailflow.test', rolMembresia: 'ADMIN', activoMembresia: true, n: 1 },
      { correo: 'jefe@mail.com', rolMembresia: 'ADMIN', activoMembresia: true, n: 1 },
      { correo: 'soporte@demo.mailflow.test', rolMembresia: 'SOPORTE', activoMembresia: true, n: 1 },
    ]);
  });

  it('un usuario existente sin membresía la recibe, sin duplicar el usuario', async () => {
    const id = await crearUsuario(db, { nombre: 'Sin Membresia', correo: 'sinmem@mail.com', rol: 'ADMIN' });
    await db.q(`DELETE FROM dbo.USUARIO_CONJUNTOS WHERE idUsuario = ${id}`);
    await asegurarUsuariosIniciales(db.pool, { adminCorreo: 'sinmem@mail.com', demo: false });
    const f = (await filas()).filter((x) => x.correo === 'sinmem@mail.com');
    expect(f).toEqual([{ correo: 'sinmem@mail.com', rolMembresia: 'ADMIN', activoMembresia: true, n: 1 }]);
  });

  it('reactiva al admin inicial si su membresía estaba inactiva', async () => {
    await db.q(`UPDATE dbo.USUARIO_CONJUNTOS SET activo = 0 WHERE idUsuario = (SELECT idUsuario FROM dbo.USUARIOS WHERE correo = 'jefe@mail.com')`);
    await asegurarUsuariosIniciales(db.pool, { adminCorreo: 'jefe@mail.com', demo: false });
    expect((await filas()).find((x) => x.correo === 'jefe@mail.com')?.activoMembresia).toBe(true);
  });
});
