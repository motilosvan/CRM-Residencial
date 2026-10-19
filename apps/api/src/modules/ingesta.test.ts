import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ingestarCorreo, REMITENTE_DESCONOCIDO, truncarUtf16 } from './ingesta.js';

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_ing');
  await db.q(`INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES ('Ana', 'T1-101', 'ana@mail.com')`);
});
afterAll(async () => db.close());

const conteos = () =>
  db.q<{ correos: number; solicitudes: number; historial: number }>(
    `SELECT (SELECT COUNT(*) FROM CORREOS) AS correos, (SELECT COUNT(*) FROM SOLICITUDES) AS solicitudes,
            (SELECT COUNT(*) FROM HISTORIAL_ESTADOS) AS historial`,
  ).then((r) => r[0]!);

describe('T1 · ingestarCorreo', () => {
  it('crea correo + solicitud NUEVA + historial inicial, clasificada y priorizada', async () => {
    const r = await ingestarCorreo(db.pool, {
      messageId: '<t1-a@mail>',
      remitente: 'Ana@Mail.com',
      asunto: 'Robo en el parqueadero',
      cuerpo: 'Forzaron mi carro, revisen las cámaras.',
    });
    expect(r.duplicado).toBe(false);
    if (r.duplicado) return;
    expect(r.categoria).toBe('SEGURIDAD');
    expect(r.prioridad).toBe('ALTA');
    expect(r.idResidente).toBe(1); // remitente normalizado a minúsculas y vinculado al residente

    const fila = await db.q<{ estado: string; categoria: string; prioridad: string; version: number; hist: number }>(
      `SELECT e.nombre AS estado, c.nombre AS categoria, p.nombre AS prioridad, s.version,
              (SELECT COUNT(*) FROM HISTORIAL_ESTADOS h WHERE h.idSolicitud = s.idSolicitud AND h.idEstadoAnterior IS NULL) AS hist
         FROM SOLICITUDES s JOIN ESTADOS e ON e.idEstado = s.idEstado JOIN CATEGORIAS c ON c.idCategoria = s.idCategoria
         JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad WHERE s.idSolicitud = ${r.idSolicitud}`,
    );
    expect(fila[0]).toEqual({ estado: 'NUEVA', categoria: 'SEGURIDAD', prioridad: 'ALTA', version: 1, hist: 1 });
  });

  it('remitente desconocido: se guarda con idResidente NULL, no se pierde', async () => {
    const r = await ingestarCorreo(db.pool, { messageId: '<t1-b@mail>', remitente: 'extrano@otro.com', asunto: 'Hola', cuerpo: '' });
    expect(r.duplicado).toBe(false);
    if (!r.duplicado) {
      expect(r.idResidente).toBeNull();
      expect(r.categoria).toBe('SIN_CLASIFICAR');
    }
  });

  it('reprocesar el mismo messageId es un no-op', async () => {
    const antes = await conteos();
    const r = await ingestarCorreo(db.pool, { messageId: '<t1-a@mail>', remitente: 'ana@mail.com', asunto: 'otro asunto', cuerpo: '' });
    expect(r).toEqual({ duplicado: true });
    expect(await conteos()).toEqual(antes);
  });

  it('50 ingestas simultáneas del mismo messageId → 1 correo, 1 solicitud, 1 historial', async () => {
    const antes = await conteos();
    const resultados = await Promise.all(
      Array.from({ length: 50 }, () =>
        ingestarCorreo(db.pool, { messageId: '<t1-race@mail>', remitente: 'ana@mail.com', asunto: 'Fuga de agua', cuerpo: 'en el baño' }),
      ),
    );
    expect(resultados.filter((r) => !r.duplicado)).toHaveLength(1);
    expect(resultados.filter((r) => r.duplicado)).toHaveLength(49);
    const despues = await conteos();
    expect(despues.correos - antes.correos).toBe(1);
    expect(despues.solicitudes - antes.solicitudes).toBe(1);
    expect(despues.historial - antes.historial).toBe(1);
  });

  it('50 correos distintos en paralelo → 50 solicitudes completas', async () => {
    const antes = await conteos();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        ingestarCorreo(db.pool, { messageId: `<t1-par-${i}@mail>`, remitente: 'ana@mail.com', asunto: `Consulta ${i}`, cuerpo: 'cobro de cuota' }),
      ),
    );
    const despues = await conteos();
    expect(despues.correos - antes.correos).toBe(50);
    expect(despues.solicitudes - antes.solicitudes).toBe(50);
    expect(despues.historial - antes.historial).toBe(50);
  });

  it('T6: el checkpoint avanza con el correo, nunca retrocede y también avanza en duplicados', async () => {
    const cp = (uid: number) => ({ cuenta: 'conjunto@gmail.com', uidValidity: 7, uid });
    await ingestarCorreo(db.pool, { messageId: '<cp-1>', remitente: 'ana@mail.com', asunto: 'x', checkpoint: cp(10) });
    await ingestarCorreo(db.pool, { messageId: '<cp-2>', remitente: 'ana@mail.com', asunto: 'x', checkpoint: cp(5) });
    expect(Number((await db.q<{ ultimoUid: string }>(`SELECT ultimoUid FROM GATEWAY_CHECKPOINT`))[0]?.ultimoUid)).toBe(10);
    await ingestarCorreo(db.pool, { messageId: '<cp-1>', remitente: 'ana@mail.com', asunto: 'x', checkpoint: cp(12) }); // duplicado
    expect(Number((await db.q<{ ultimoUid: string }>(`SELECT ultimoUid FROM GATEWAY_CHECKPOINT`))[0]?.ultimoUid)).toBe(12);
  });

  it('lo único obligatorio es el messageId', async () => {
    await expect(ingestarCorreo(db.pool, { messageId: '', remitente: 'a@b.com' })).rejects.toThrow();
    await expect(ingestarCorreo(db.pool, { messageId: '   ', remitente: 'a@b.com' })).rejects.toThrow();
  });

  it('regla 8: un remitente inválido o enorme no descarta el correo, se guarda como desconocido', async () => {
    const malos = ['sin-arroba', '', 'a b@c.com', `${'x'.repeat(330)}@largo.com`];
    for (const [i, remitente] of malos.entries()) {
      const r = await ingestarCorreo(db.pool, { messageId: `<rem-${i}>`, remitente, asunto: 'Hola' });
      expect(r.duplicado).toBe(false);
    }
    const filas = await db.q<{ remitente: string }>(`SELECT remitente FROM CORREOS WHERE messageId LIKE '<rem-%'`);
    expect(filas.map((f) => f.remitente)).toEqual(Array(malos.length).fill(REMITENTE_DESCONOCIDO));
    // y una dirección larga pero válida (RFC permite hasta 254) se conserva
    const larga = `${'n'.repeat(110)}@conjunto-residencial.example.com`;
    await ingestarCorreo(db.pool, { messageId: '<rem-largo-ok>', remitente: larga });
    expect((await db.q<{ remitente: string }>(`SELECT remitente FROM CORREOS WHERE messageId = '<rem-largo-ok>'`))[0]?.remitente).toBe(larga);
  });

  it('un asunto largo se recorta a 500 unidades sin partir un emoji', async () => {
    const asunto = 'a'.repeat(499) + '🚰' + 'b'.repeat(50); // el emoji ocupa las posiciones 499-500
    const r = await ingestarCorreo(db.pool, { messageId: '<largo>', remitente: 'ana@mail.com', asunto });
    expect(r.duplicado).toBe(false);
    const fila = await db.q<{ asunto: string }>(`SELECT asunto FROM CORREOS WHERE messageId = '<largo>'`);
    expect(fila[0]?.asunto).toBe('a'.repeat(499)); // el emoji no cabe entero y se descarta, sin dejar medio carácter
    expect(truncarUtf16('x🚰', 2)).toBe('x');
  });

  it('conserva emojis y caracteres no latinos del correo (antes se guardaban como "?")', async () => {
    await ingestarCorreo(db.pool, { messageId: '<unicode>', remitente: 'ana@mail.com', asunto: 'Fuga 🚰 en 公寓', cuerpo: 'Señor 😀 ąę ж' });
    const f = await db.q<{ asunto: string; cuerpo: string }>(`SELECT asunto, cuerpo FROM CORREOS WHERE messageId = '<unicode>'`);
    expect(f[0]).toEqual({ asunto: 'Fuga 🚰 en 公寓', cuerpo: 'Señor 😀 ąę ж' });
  });

  it('Message-ID distintos solo en mayúsculas son correos distintos (no se descarta ninguno)', async () => {
    const a = await ingestarCorreo(db.pool, { messageId: '<Mx7Q@gmail>', remitente: 'ana@mail.com' });
    const b = await ingestarCorreo(db.pool, { messageId: '<mx7q@gmail>', remitente: 'ana@mail.com' });
    expect(a.duplicado).toBe(false);
    expect(b.duplicado).toBe(false);
  });

  it('un Message-ID más largo que la columna se guarda como hash estable y sigue siendo idempotente', async () => {
    const largo = `<${'z'.repeat(400)}@gmail.com>`;
    expect((await ingestarCorreo(db.pool, { messageId: largo, remitente: 'ana@mail.com' })).duplicado).toBe(false);
    expect(await ingestarCorreo(db.pool, { messageId: largo, remitente: 'ana@mail.com' })).toEqual({ duplicado: true });
  });

  it('T6: si cambia UIDVALIDITY el checkpoint se reinicia (si no, se saltarían los correos del buzón nuevo)', async () => {
    const cuenta = 'reinicio@gmail.com';
    await ingestarCorreo(db.pool, { messageId: '<uv-1>', remitente: 'ana@mail.com', checkpoint: { cuenta, uidValidity: 100, uid: 5000 } });
    await ingestarCorreo(db.pool, { messageId: '<uv-2>', remitente: 'ana@mail.com', checkpoint: { cuenta, uidValidity: 200, uid: 3 } });
    const cp = await db.q<{ uidValidity: string; ultimoUid: string }>(`SELECT uidValidity, ultimoUid FROM GATEWAY_CHECKPOINT WHERE cuenta = '${cuenta}'`);
    expect({ v: Number(cp[0]?.uidValidity), u: Number(cp[0]?.ultimoUid) }).toEqual({ v: 200, u: 3 });
  });

  it('T6: ingestas simultáneas de una cuenta nueva no chocan al crear el checkpoint (15 rondas × 8)', async () => {
    // La carrera (dos INSERT del mismo checkpoint) es probabilística: se repite para detectarla con certeza.
    // Barrera en el paso "historial": las 8 llegan juntas al upsert del checkpoint.
    for (let ronda = 0; ronda < 15; ronda++) {
      const cuenta = `nueva-${ronda}@gmail.com`;
      let llegados = 0;
      let liberar!: () => void;
      const juntos = new Promise<void>((r) => (liberar = r));
      const hooks = {
        despuesDe: async (p: string) => {
          if (p !== 'historial') return;
          if (++llegados === 8) liberar();
          await juntos;
        },
      };
      const res = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          ingestarCorreo(db.pool, { messageId: `<cp-race-${ronda}-${i}>`, remitente: 'ana@mail.com', checkpoint: { cuenta, uidValidity: 9, uid: i + 1 } }, hooks),
        ),
      );
      expect(res.filter((r) => r.status === 'rejected'), `ronda ${ronda}`).toEqual([]);
      const cp = await db.q<{ ultimoUid: string }>(`SELECT ultimoUid FROM GATEWAY_CHECKPOINT WHERE cuenta = '${cuenta}'`);
      expect(Number(cp[0]?.ultimoUid)).toBe(8);
    }
  });
});
