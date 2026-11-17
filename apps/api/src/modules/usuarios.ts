import sql from 'mssql';
import { z } from 'zod';
import { withTx, type Tx } from '../db/withTx.js';
import { ConflictError, NotFound, ValidationError } from '../errors.js';
import { registrarAuditoria } from './auditoria.js';
import { exigirRol } from './autorizacion.js';
import type { UsuarioConjunto } from './consultas.js';
import { validar, type Actor, type Rol } from './solicitudes.js';

/**
 * Escritura del personal de un conjunto (USUARIOS + USUARIO_CONJUNTOS). Solo ADMIN con membresía activa,
 * comprobado en la BD dentro de la transacción. Un usuario puede pertenecer a varios conjuntos: aquí solo
 * se gestiona su membresía en el conjunto del actor. Sin DELETE: «quitar» es desactivar la membresía.
 * La auditoría usa entidad `USUARIO` con `idEntidad = idUsuario`, como la semilla, y nunca guarda correos
 * ni nombres.
 */

const ActorSchema = z.object({
  idUsuario: z.number().int().positive(),
  idConjunto: z.number().int().positive(),
});

const RolSchema = z.enum(['ADMIN', 'SOPORTE']);

export const EntradaUsuarioSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  correo: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  rol: RolSchema,
});
export type EntradaUsuario = z.input<typeof EntradaUsuarioSchema>;

export const CambioMembresiaSchema = z
  .object({
    rol: RolSchema.optional(),
    activo: z.boolean().optional(),
    versionEsperada: z.number().int().positive(),
  })
  .refine((c) => c.rol !== undefined || c.activo !== undefined, { message: 'indica rol o activo' });
export type CambioMembresia = z.input<typeof CambioMembresiaSchema>;

const IdUsuarioSchema = z.number().int().positive();

/**
 * Punto de serialización de las escrituras de personal de un conjunto. Va ANTES de `exigirRol` para que la
 * autorización del actor se lea ya serializada (un ADMIN que otra transacción está desactivando no puede
 * pasar la comprobación, esperar el candado y completar su cambio). Orden de bloqueo fijo:
 * CONJUNTOS -> USUARIOS -> USUARIO_CONJUNTOS.
 */
async function bloquearConjunto(tx: Tx, idConjunto: number): Promise<void> {
  await tx
    .request()
    .input('c', sql.Int, idConjunto)
    .query('SELECT idConjunto FROM CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE idConjunto = @c');
}

/** Membresía del usuario en el conjunto, sin filtrar por estado (el listado oculta las inactivas). */
async function leerMembresia(tx: Tx, idConjunto: number, idUsuario: number): Promise<UsuarioConjunto> {
  const r = await tx
    .request()
    .input('u', sql.Int, idUsuario)
    .input('c', sql.Int, idConjunto)
    .query<UsuarioConjunto>(
      `SELECT u.idUsuario AS id, u.nombre, u.correo, m.rol, m.activo, m.version, u.activo AS cuentaActiva
         FROM USUARIO_CONJUNTOS m
         JOIN USUARIOS u ON u.idUsuario = m.idUsuario
        WHERE m.idUsuario = @u AND m.idConjunto = @c`,
    );
  return r.recordset[0]!;
}

const auditar = (tx: Tx, actor: Actor, idUsuario: number, accion: 'CREAR' | 'ACTIVAR' | 'DESACTIVAR' | 'CAMBIAR_ROL', detalle: string) =>
  registrarAuditoria(tx, { idConjunto: actor.idConjunto, idUsuario: actor.idUsuario, entidad: 'USUARIO', idEntidad: idUsuario, accion, detalle });

/**
 * Agrega a una persona al personal del conjunto del actor. Si el correo ya es un usuario (quizá de otro
 * conjunto) se reutiliza SIN cambiarle el nombre y, si está deshabilitado en general (`USUARIOS.activo = 0`), se rechaza con 422. Una
 * membresía inactiva se reactiva con el rol pedido; una activa da 409.
 */
export async function guardarUsuarioConjunto(pool: sql.ConnectionPool, actor: Actor, entrada: EntradaUsuario): Promise<UsuarioConjunto> {
  const a = validar(ActorSchema, actor);
  const e = validar(EntradaUsuarioSchema, entrada);
  return withTx(pool, async (tx) => {
    await bloquearConjunto(tx, a.idConjunto);
    await exigirRol(tx, actor, ['ADMIN'], 'administrar el personal del conjunto');

    const existente = (
      await tx
        .request()
        .input('correo', sql.NVarChar(320), e.correo)
        .query<{ idUsuario: number; activo: boolean }>(
          'SELECT idUsuario, activo FROM USUARIOS WITH (UPDLOCK, HOLDLOCK) WHERE correo = @correo',
        )
    ).recordset[0];

    let idUsuario: number;
    if (!existente) {
      idUsuario = (
        await tx
          .request()
          .input('nombre', sql.NVarChar(100), e.nombre)
          .input('rol', sql.VarChar(30), e.rol)
          .input('correo', sql.NVarChar(320), e.correo)
          .query<{ id: number }>(
            'INSERT INTO USUARIOS (nombre, rol, correo, activo) OUTPUT inserted.idUsuario AS id VALUES (@nombre, @rol, @correo, 1)',
          )
      ).recordset[0]!.id;
    } else {
      idUsuario = existente.idUsuario;
      // USUARIOS.activo = 0 es un bloqueo deliberado fuera de banda (ninguna ruta lo escribe): un ADMIN de
      // un conjunto no puede levantarlo. La semilla es la vía de recuperación.
      if (!existente.activo) {
        throw new ValidationError('Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto');
      }
    }

    const membresia = (
      await tx
        .request()
        .input('u', sql.Int, idUsuario)
        .input('c', sql.Int, a.idConjunto)
        .query<{ rol: Rol; activo: boolean }>(
          'SELECT rol, activo FROM USUARIO_CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE idUsuario = @u AND idConjunto = @c',
        )
    ).recordset[0];

    const req = tx.request().input('u', sql.Int, idUsuario).input('c', sql.Int, a.idConjunto).input('rol', sql.VarChar(30), e.rol);
    if (!membresia) {
      await req.query('INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol, activo) VALUES (@u, @c, @rol, 1)');
      await auditar(tx, actor, idUsuario, 'CREAR', `${existente ? 'Membresía creada' : 'Usuario creado'} con rol ${e.rol}`);
    } else if (membresia.activo) {
      throw new ConflictError('Ese usuario ya pertenece al conjunto');
    } else {
      await req.query(
        `UPDATE USUARIO_CONJUNTOS SET rol = @rol, activo = 1, version = version + 1
          WHERE idUsuario = @u AND idConjunto = @c`,
      );
      await auditar(tx, actor, idUsuario, 'ACTIVAR', `Membresía reactivada con rol ${e.rol}`);
    }
    return leerMembresia(tx, a.idConjunto, idUsuario);
  });
}

/**
 * Cambia el rol y/o el estado de una membresía del conjunto del actor, con control de versión. No deja al
 * conjunto sin ADMIN: se serializa con un UPDLOCK sobre la fila del conjunto (así dos administradores que se
 * degradan a la vez no se bloquean entre sí ni dejan el conjunto vacío; el segundo recibe 422) y se cuenta
 * con UPDLOCK/HOLDLOCK sobre las membresías ADMIN. Desactivar a quien tiene solicitudes asignadas se permite:
 * la BD no lo impide y las asignaciones quedan como están.
 */
export async function actualizarMembresiaUsuario(
  pool: sql.ConnectionPool,
  actor: Actor,
  idUsuario: number,
  cambio: CambioMembresia,
): Promise<UsuarioConjunto> {
  const a = validar(ActorSchema, actor);
  const id = validar(IdUsuarioSchema, idUsuario);
  const c = validar(CambioMembresiaSchema, cambio);
  return withTx(pool, async (tx) => {
    await bloquearConjunto(tx, a.idConjunto);
    await exigirRol(tx, actor, ['ADMIN'], 'administrar el personal del conjunto');

    const actual = (
      await tx
        .request()
        .input('u', sql.Int, id)
        .input('c', sql.Int, a.idConjunto)
        .query<{ rol: Rol; activo: boolean; version: number }>(
          'SELECT rol, activo, version FROM USUARIO_CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE idUsuario = @u AND idConjunto = @c',
        )
    ).recordset[0];
    if (!actual) throw new NotFound('El usuario no pertenece al conjunto');
    if (actual.version !== c.versionEsperada) {
      throw new ConflictError(`La membresía cambió (versión ${actual.version}, se esperaba ${c.versionEsperada}). Recárguela.`);
    }

    const rol = c.rol ?? actual.rol;
    const activo = c.activo ?? actual.activo;
    const cambiaRol = rol !== actual.rol;
    const cambiaActivo = activo !== actual.activo;
    if (!cambiaRol && !cambiaActivo) return leerMembresia(tx, a.idConjunto, id);

    // El UPDLOCK/HOLDLOCK del conteo es defensa en profundidad: el punto de serialización real es el
    // candado de CONJUNTOS tomado al inicio.
    if (actual.rol === 'ADMIN' && actual.activo && (rol !== 'ADMIN' || !activo)) {
      const otros = (
        await tx
          .request()
          .input('u', sql.Int, id)
          .input('c', sql.Int, a.idConjunto)
          .query<{ n: number }>(
            `SELECT COUNT(*) AS n
               FROM USUARIO_CONJUNTOS m WITH (UPDLOCK, HOLDLOCK)
               JOIN USUARIOS u ON u.idUsuario = m.idUsuario
              WHERE m.idConjunto = @c AND m.rol = 'ADMIN' AND m.activo = 1 AND u.activo = 1 AND m.idUsuario <> @u`,
          )
      ).recordset[0]!.n;
      if (otros === 0) throw new ValidationError('El conjunto debe conservar al menos un administrador activo');
    }

    await tx
      .request()
      .input('u', sql.Int, id)
      .input('c', sql.Int, a.idConjunto)
      .input('rol', sql.VarChar(30), rol)
      .input('activo', sql.Bit, activo)
      .query(
        `UPDATE USUARIO_CONJUNTOS SET rol = @rol, activo = @activo, version = version + 1
          WHERE idUsuario = @u AND idConjunto = @c`,
      );
    if (cambiaRol) await auditar(tx, actor, id, 'CAMBIAR_ROL', `rol ${actual.rol} → ${rol}`);
    if (cambiaActivo) await auditar(tx, actor, id, activo ? 'ACTIVAR' : 'DESACTIVAR', activo ? 'Membresía reactivada' : 'Membresía desactivada');
    return leerMembresia(tx, a.idConjunto, id);
  });
}
