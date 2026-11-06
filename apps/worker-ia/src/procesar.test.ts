import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ingestarCorreo } from '../../api/src/modules/ingesta.js';
import { setupTestDb, type TestDb } from '../../api/test/helpers/testDb.js';
import { LIMITE_TEXTO, procesarPendientes } from './procesar.js';
import { ErrorConfiguracionIA, ErrorCuota, ErrorRespuestaIA, ErrorTemporalIA, type EntradaIA, type ProveedorIA } from './proveedor.js';

let db: TestDb;
let n = 0;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_ia');
  await db.q(`INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES (N'Ana Pérez', 'T1-101', 'ana@mail.com')`);
});
afterAll(async () => db.close());
beforeEach(async () => {
  await db.q('DELETE FROM SUGERENCIAS_IA');
  await db.q(`INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, proveedor, modelo) SELECT idSolicitud, 'FALLIDA', 'p', 'm' FROM SOLICITUDES`);
});

async function correo(asunto = 'Fuga en el baño', cuerpo = 'Hay agua', remitente = 'ana@mail.com'): Promise<number> {
  const r = await ingestarCorreo(db.pool, { messageId: `<ia-${++n}@mail>`, remitente, asunto, cuerpo });
  if (r.duplicado) throw new Error('inesperado');
  return r.idSolicitud;
}

/** Proveedor falso: registra lo que recibe y responde según el guion dado. */
function proveedor(guion: (e: EntradaIA, intento: number) => void = () => {}) {
  const recibidos: EntradaIA[] = [];
  const p: ProveedorIA = {
    nombre: 'falso',
    modelo: 'modelo/pedido',
    async sugerir(e) {
      recibidos.push(e);
      guion(e, recibidos.length);
      return { categoria: 'MANTENIMIENTO', prioridad: 'MEDIA', resumen: 'Resumen', justificacion: 'Motivo', modelo: 'modelo/real' };
    },
  };
  return { p, recibidos };
}

const opciones = { maxPorCiclo: 5, maxIntentos: 2, esperaReintentoMin: 30 };
const estadoDe = (id: number) =>
  db.q<{ estado: string; intentos: number; modelo: string }>(`SELECT estado, intentos, modelo FROM SUGERENCIAS_IA WHERE idSolicitud = ${id}`).then((r) => r[0]);

describe('Worker IA · procesarPendientes', () => {
  it('guarda la sugerencia con el modelo que respondió', async () => {
    const id = await correo();
    const { p } = proveedor();
    expect(await procesarPendientes(db.pool, p, opciones)).toEqual({ revisadas: 1, sugeridas: 1, fallidas: 0, pausa: null });
    expect(await estadoDe(id)).toMatchObject({ estado: 'LISTA', modelo: 'modelo/real' });
    expect((await procesarPendientes(db.pool, p, opciones)).revisadas).toBe(0); // no gasta cuota dos veces
  });

  it('el proveedor nunca recibe los datos personales del correo', async () => {
    await correo(
      'Fuga en el apto 504, soy Ana Pérez',
      `Hola, soy Ana Pérez, cédula CC 1.023.456.789, celular 310 555 1234, correo ana@mail.com.
Vivo en la Calle 10 # 20-30, Torre 2 Apto 504 y mi placa es ABC123.
La tubería del baño tiene una fuga.

Gracias,
Ana Pérez`,
    );
    const { p, recibidos } = proveedor();
    await procesarPendientes(db.pool, p, opciones);
    const enviado = `${recibidos[0]!.asunto}\n${recibidos[0]!.cuerpo}`;
    for (const dato of ['Ana', 'Pérez', '1.023', '456.789', '.789', '310 555', 'ana@mail', 'Calle 10', '504', 'ABC123']) {
      expect(enviado).not.toContain(dato);
    }
    expect(enviado).toContain('tubería del baño tiene una fuga');
  });

  it('oculta el nombre del residente vinculado aunque el correo lo mencione sin presentarse', async () => {
    await correo('Consulta', 'Pregunta de la señora Ana sobre la fuga');
    const { p, recibidos } = proveedor();
    await procesarPendientes(db.pool, p, opciones);
    expect(recibidos[0]!.cuerpo).toBe('Pregunta de la señora [NOMBRE_PROTEGIDO] sobre la fuga');
  });

  it('recorta el texto enviado', async () => {
    await correo('Largo', 'palabra '.repeat(5000));
    const { p, recibidos } = proveedor();
    await procesarPendientes(db.pool, p, opciones);
    expect(recibidos[0]!.cuerpo.length).toBe(LIMITE_TEXTO);
  });

  it('respeta maxPorCiclo y continúa en el ciclo siguiente', async () => {
    await correo();
    await correo();
    await correo();
    const { p } = proveedor();
    expect((await procesarPendientes(db.pool, p, { ...opciones, maxPorCiclo: 2 })).sugeridas).toBe(2);
    expect((await procesarPendientes(db.pool, p, { ...opciones, maxPorCiclo: 2 })).sugeridas).toBe(1);
  });

  it('espera entre llamadas para no provocar límites de ráfaga, pero no antes de la primera', async () => {
    await correo();
    await correo();
    const tiempos: number[] = [];
    const { p } = proveedor(() => {
      tiempos.push(Date.now());
    });
    await procesarPendientes(db.pool, p, { ...opciones, pausaEntreLlamadasMs: 60 });
    expect(tiempos).toHaveLength(2);
    expect(tiempos[1]! - tiempos[0]!).toBeGreaterThanOrEqual(50);
  });

  it('una respuesta inválida cuenta contra ese correo y el ciclo sigue con los demás', async () => {
    const malo = await correo('Malo');
    const bueno = await correo('Bueno');
    const { p } = proveedor((e) => {
      if (e.asunto === 'Malo') throw new ErrorRespuestaIA('El modelo no devolvió JSON válido');
    });
    expect(await procesarPendientes(db.pool, p, opciones)).toMatchObject({ revisadas: 2, sugeridas: 1, fallidas: 1 });
    expect(await estadoDe(malo)).toMatchObject({ estado: 'EN_REINTENTO', intentos: 1 });
    expect(await estadoDe(bueno)).toMatchObject({ estado: 'LISTA' });

    await db.q(`UPDATE SUGERENCIAS_IA SET proximoIntento = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE idSolicitud = ${malo}`);
    await procesarPendientes(db.pool, p, opciones);
    expect(await estadoDe(malo)).toMatchObject({ estado: 'FALLIDA', intentos: 2 });
    expect((await procesarPendientes(db.pool, p, opciones)).revisadas).toBe(0);
  });

  it('agotar la cuota detiene el ciclo sin descontarle intentos a ningún correo', async () => {
    const a = await correo();
    const b = await correo();
    const reanudar = new Date(Date.now() + 60_000);
    let sinCuota = true;
    const { p, recibidos } = proveedor(() => {
      if (sinCuota) throw new ErrorCuota('Cuota agotada', reanudar);
    });
    expect(await procesarPendientes(db.pool, p, opciones)).toEqual({
      revisadas: 0, sugeridas: 0, fallidas: 0, pausa: { hasta: reanudar, motivo: 'Cuota agotada' },
    });
    expect(recibidos).toHaveLength(1); // no insiste con el siguiente
    expect(await estadoDe(a)).toBeUndefined();
    expect(await estadoDe(b)).toBeUndefined();

    sinCuota = false;
    expect((await procesarPendientes(db.pool, p, opciones)).sugeridas).toBe(2);
  });

  it.each([
    ['temporal', new ErrorTemporalIA('HTTP 503')],
    ['de configuración', new ErrorConfiguracionIA('Llave inválida')],
  ])('un fallo %s detiene el ciclo y no cuenta contra el correo', async (_caso, error) => {
    const id = await correo();
    const { p } = proveedor(() => {
      throw error;
    });
    await expect(procesarPendientes(db.pool, p, opciones)).rejects.toBe(error);
    expect(await estadoDe(id)).toBeUndefined();
  });

  it('pase lo que pase con la IA, la solicitud conserva su clasificación por reglas', async () => {
    const id = await correo('Robo en el parqueadero', 'Forzaron mi carro');
    const antes = await db.q(`SELECT idEstado, idCategoria, idPrioridad, version FROM SOLICITUDES WHERE idSolicitud = ${id}`);
    const { p } = proveedor(() => {
      throw new ErrorRespuestaIA('Respuesta inválida');
    });
    await procesarPendientes(db.pool, p, { ...opciones, maxIntentos: 1 });
    expect(await estadoDe(id)).toMatchObject({ estado: 'FALLIDA' });
    expect(await db.q(`SELECT idEstado, idCategoria, idPrioridad, version FROM SOLICITUDES WHERE idSolicitud = ${id}`)).toEqual(antes);
  });
});
