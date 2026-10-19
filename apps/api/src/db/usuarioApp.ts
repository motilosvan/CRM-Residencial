import sql from 'mssql';
import { NOMBRE_BD_VALIDO, type DbConfig } from '../config.js';
import { crearPool } from './pool.js';

const NOMBRE_LOGIN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/**
 * Crea (o sincroniza) el login de la aplicación y lo agrega al rol crm_app de `database`.
 * Se ejecuta con la identidad del migrador. Idempotente. La contraseña viaja como parámetro y se
 * escapa con QUOTENAME(…, ''''); el nombre del login pasa por una lista blanca estricta.
 */
export async function asegurarUsuarioApp(migrador: DbConfig, database: string, login: string, password: string): Promise<void> {
  if (!NOMBRE_LOGIN.test(login)) throw new Error(`Nombre de login inválido: ${login}`);
  if (!NOMBRE_BD_VALIDO.test(database)) throw new Error(`Nombre de BD inválido: ${database}`);
  if (login.toLowerCase() === migrador.user.toLowerCase()) return; // misma identidad: nada que hacer

  const master = await crearPool(migrador, { database: 'master', max: 1 });
  try {
    await master
      .request()
      .input('login', sql.NVarChar(128), login)
      .input('pwd', sql.NVarChar(128), password)
      .query(
        `DECLARE @s NVARCHAR(600);
         IF SUSER_ID(@login) IS NULL
           SET @s = N'CREATE LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + QUOTENAME(@pwd, '''') + N', CHECK_POLICY = ON';
         ELSE
           SET @s = N'ALTER LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + QUOTENAME(@pwd, '''');
         EXEC (@s);`,
      );
  } finally {
    await master.close();
  }

  const db = await crearPool(migrador, { database, max: 1 });
  try {
    await db
      .request()
      .input('login', sql.NVarChar(128), login)
      .query(
        `DECLARE @s NVARCHAR(600);
         IF USER_ID(@login) IS NULL
         BEGIN
           SET @s = N'CREATE USER ' + QUOTENAME(@login) + N' FOR LOGIN ' + QUOTENAME(@login);
           EXEC (@s);
         END;
         IF ISNULL(IS_ROLEMEMBER('crm_app', @login), 0) <> 1
         BEGIN
           SET @s = N'ALTER ROLE crm_app ADD MEMBER ' + QUOTENAME(@login);
           EXEC (@s);
         END;`,
      );
  } finally {
    await db.close();
  }
}
