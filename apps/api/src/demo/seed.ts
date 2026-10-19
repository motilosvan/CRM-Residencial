import sql from 'mssql';
import { CORREOS_EJEMPLO } from '../../test/fixtures/correos.js';
import { withTx } from '../db/withTx.js';
import { asignar } from '../modules/asignaciones.js';
import { ingestarCorreo } from '../modules/ingesta.js';
import { cambiarEstado } from '../modules/solicitudes.js';

const RESIDENTES = [
  ['Ana Torres', 'T1-101', 'ana.torres@mail.com'],
  ['Carlos Ruiz', 'T1-204', 'carlos.ruiz@mail.com'],
  ['María Gómez', 'T2-302', 'maria.gomez@mail.com'],
  ['Luis Peña', 'T2-405', 'luis.pena@mail.com'],
  ['Sofía Díaz', 'T3-110', 'sofia.diaz@mail.com'],
  ['Jorge Mora', 'T3-503', 'jorge.mora@mail.com'],
] as const;

const USUARIOS = [
  ['Administrador', 'ADMIN', 'admin@conjunto.com'],
  ['Laura (Soporte)', 'SOPORTE', 'laura@conjunto.com'],
  ['Pedro (Soporte)', 'SOPORTE', 'pedro@conjunto.com'],
] as const;

/** Marcador de "ya sembrado": el administrador de demostración. */
const MARCADOR = 'admin@conjunto.com';

export async function idAdminDemo(pool: sql.ConnectionPool): Promise<number> {
  const r = await pool.request().input('c', sql.NVarChar(320), MARCADOR).query<{ id: number }>(
    'SELECT idUsuario AS id FROM USUARIOS WHERE correo = @c',
  );
  if (!r.recordset[0]) throw new Error('Falta el usuario administrador de demostración');
  return r.recordset[0].id;
}

/**
 * Datos de demostración. Idempotente por marcador. Residentes y usuarios se crean en UNA transacción
 * (un fallo no deja la siembra a medias); el resto pasa por las transacciones reales T1–T3.
 */
export async function sembrarDemo(pool: sql.ConnectionPool): Promise<boolean> {
  const ya = await pool.request().input('c', sql.NVarChar(320), MARCADOR)
    .query('SELECT 1 AS x FROM USUARIOS WHERE correo = @c');
  if (ya.recordset.length > 0) return false;

  const ids = await withTx(pool, async (tx) => {
    for (const [nombre, unidad, correo] of RESIDENTES) {
      await tx.request().input('n', sql.NVarChar(100), nombre).input('u', sql.VarChar(20), unidad).input('c', sql.NVarChar(320), correo)
        .query('INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES (@n, @u, @c)');
    }
    const out: number[] = [];
    for (const [nombre, rol, correo] of USUARIOS) {
      const r = await tx.request().input('n', sql.NVarChar(100), nombre).input('r', sql.VarChar(30), rol).input('c', sql.NVarChar(320), correo)
        .query<{ id: number }>('INSERT INTO USUARIOS (nombre, rol, correo, activo) OUTPUT inserted.idUsuario AS id VALUES (@n, @r, @c, 1)');
      out.push(r.recordset[0]!.id);
    }
    return out;
  });
  const [admin, laura, pedro] = ids as [number, number, number];

  const solicitudes: number[] = [];
  for (const [i, c] of CORREOS_EJEMPLO.entries()) {
    const r = await ingestarCorreo(pool, {
      messageId: `<demo-${i}@conjunto>`,
      remitente: RESIDENTES[i % RESIDENTES.length]![2],
      asunto: c.asunto,
      cuerpo: c.cuerpo,
      recibidoEn: new Date(Date.now() - (CORREOS_EJEMPLO.length - i) * 3_600_000),
    });
    if (!r.duplicado) solicitudes.push(r.idSolicitud);
  }

  // Avanza algunas solicitudes para que haya de todos los estados.
  for (const [k, id] of solicitudes.slice(0, 18).entries()) {
    const resp = k % 2 === 0 ? laura : pedro;
    let v = (await asignar(pool, { idSolicitud: id, idResponsable: resp, idAsignador: admin, versionEsperada: 1 })).version;
    const paso = async (estado: 'EN_PROCESO' | 'RESUELTA' | 'CERRADA', usr: number) => {
      v = (await cambiarEstado(pool, { idSolicitud: id, nuevoEstado: estado, idUsuario: usr, versionEsperada: v })).version;
    };
    if (k < 14) await paso('EN_PROCESO', resp);
    if (k < 9) await paso('RESUELTA', resp);
    if (k < 5) await paso('CERRADA', admin);
  }
  return true;
}
