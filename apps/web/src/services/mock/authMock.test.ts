import { ErrorAuth } from '../contratos';
import { crearAuthMock, CODIGO_DEMO } from './authMock';
import { crearConjuntosMock } from './conjuntosMock';

const MIN = 60_000;
const ADMIN = 'admin@demo.mailflow.test';
const SOPORTE = 'soporte@demo.mailflow.test';
const DESCONOCIDO = 'nadie@demo.mailflow.test';

function preparar() {
  let t = 1_000_000;
  const auth = crearAuthMock({ latenciaMs: [0, 0], ahora: () => t });
  return { auth, avanzar: (ms: number) => (t += ms), ahora: () => t };
}

async function error(p: Promise<unknown>): Promise<ErrorAuth> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorAuth);
    return e as ErrorAuth;
  }
  throw new Error('Debía rechazar');
}

const pedido = (correo: string, conjuntoId = 'cj-parques') => ({ conjuntoId, correo });

describe('acceso por código', () => {
  it('registrado + código demo devuelve la sesión', async () => {
    const { auth, ahora } = preparar();
    await auth.solicitarCodigo(pedido(ADMIN));
    const s = await auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO });
    expect(s.conjuntoActivo.slug).toBe('parques-occidente');
    expect(s.conjuntos).toHaveLength(2);
    expect(s.usuario.rol).toBe('ADMIN');
    expect(s.ultimaActividad).toBe(ahora());
  });

  it('el conjunto activo es el pedido y el soporte tiene uno solo', async () => {
    const { auth } = preparar();
    await auth.solicitarCodigo(pedido(ADMIN, 'cj-nogal'));
    const s = await auth.verificarCodigo({ ...pedido(ADMIN, 'cj-nogal'), codigo: CODIGO_DEMO });
    expect(s.conjuntoActivo.slug).toBe('altos-del-nogal');
    await auth.solicitarCodigo(pedido(SOPORTE));
    const s2 = await auth.verificarCodigo({ ...pedido(SOPORTE), codigo: CODIGO_DEMO });
    expect(s2.conjuntos).toHaveLength(1);
  });

  it('normaliza el correo y quita espacios del código', async () => {
    const { auth } = preparar();
    await auth.solicitarCodigo(pedido(`  ${ADMIN.toUpperCase()} `));
    const s = await auth.verificarCodigo({ ...pedido(ADMIN), codigo: ' 123 456 ' });
    expect(s.usuario.correo).toBe(ADMIN);
  });

  it('un código usado no se reutiliza', async () => {
    const { auth } = preparar();
    await auth.solicitarCodigo(pedido(ADMIN));
    await auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO });
    const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO }));
    expect(e.codigo).toBe('CODIGO_INCORRECTO');
  });

  it('código vencido tras 10 min + 1 ms', async () => {
    const { auth, avanzar } = preparar();
    await auth.solicitarCodigo(pedido(ADMIN));
    avanzar(10 * MIN + 1);
    const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO }));
    expect(e.codigo).toBe('CODIGO_VENCIDO');
  });

  it('reenvío antes de 60 s rechaza; después reinicia el vencimiento', async () => {
    const { auth, avanzar, ahora } = preparar();
    const a = await auth.solicitarCodigo(pedido(ADMIN));
    expect(a.reenvioDisponibleEn).toBe(ahora() + MIN);
    avanzar(59_999);
    expect((await error(auth.solicitarCodigo(pedido(ADMIN)))).codigo).toBe('REENVIO_PRONTO');
    avanzar(1);
    const b = await auth.solicitarCodigo(pedido(ADMIN));
    expect(b.venceEn).toBe(ahora() + 10 * MIN);
  });

  it('cadena vacía rechaza sin gastar intento', async () => {
    const { auth } = preparar();
    await auth.solicitarCodigo(pedido(ADMIN));
    const v = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: '  ' }));
    expect(v.codigo).toBe('CODIGO_INCORRECTO');
    expect(v.intentosRestantes).toBe(5);
    const w = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: '000000' }));
    expect(w.intentosRestantes).toBe(4);
  });

  it('valores que no son 6 dígitos cuentan como incorrectos', async () => {
    const { auth } = preparar();
    await auth.solicitarCodigo(pedido(ADMIN));
    const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: 'abcdef' }));
    expect(e.codigo).toBe('CODIGO_INCORRECTO');
    expect(e.intentosRestantes).toBe(4);
  });

  describe('bloqueo por intentos', () => {
    it('intentos 4,3,2,1 y quinto BLOQUEADO; sigue bloqueado con el código bueno hasta 15 min', async () => {
      const { auth, avanzar, ahora } = preparar();
      await auth.solicitarCodigo(pedido(ADMIN));
      const restantes: (number | undefined)[] = [];
      for (let i = 0; i < 4; i++) {
        const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: '000000' }));
        expect(e.codigo).toBe('CODIGO_INCORRECTO');
        restantes.push(e.intentosRestantes);
      }
      expect(restantes).toEqual([4, 3, 2, 1]);
      const quinto = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: '000000' }));
      expect(quinto.codigo).toBe('BLOQUEADO');
      expect(quinto.intentosRestantes).toBe(0);
      const hasta = ahora() + 15 * MIN;
      expect(quinto.desbloqueoEn).toBe(hasta);

      avanzar(15 * MIN - 1);
      const aun = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO }));
      expect(aun.codigo).toBe('BLOQUEADO');
      expect(aun.desbloqueoEn).toBe(hasta);

      avanzar(1);
      // Pasado el bloqueo hace falta un código nuevo.
      const sinCodigo = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO }));
      expect(sinCodigo.codigo).toBe('CODIGO_INCORRECTO');
    });

    it('tras el bloqueo, pedir código nuevo permite entrar', async () => {
      const { auth, avanzar } = preparar();
      await auth.solicitarCodigo(pedido(ADMIN));
      for (let i = 0; i < 5; i++) await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: '000000' }));
      avanzar(15 * MIN);
      await auth.solicitarCodigo(pedido(ADMIN));
      const s = await auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO });
      expect(s.usuario.correo).toBe(ADMIN);
    });
  });

  describe('no revela si el correo existe', () => {
    const NO_REGISTRADOS = [
      ['correo desconocido', DESCONOCIDO, 'cj-parques'],
      ['correo de otro conjunto', SOPORTE, 'cj-nogal'],
    ] as const;

    it.each(NO_REGISTRADOS)('solicitarCodigo: %s responde igual que uno registrado', async (_n, correo, conjuntoId) => {
      const real = preparar();
      const falso = preparar();
      const a = await real.auth.solicitarCodigo(pedido(ADMIN));
      const b = await falso.auth.solicitarCodigo(pedido(correo, conjuntoId));
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      expect(b).toEqual(a);
      real.avanzar(30_000);
      falso.avanzar(30_000);
      const ea = await error(real.auth.solicitarCodigo(pedido(ADMIN)));
      const eb = await error(falso.auth.solicitarCodigo(pedido(correo, conjuntoId)));
      expect(eb.codigo).toBe(ea.codigo);
      expect(eb.codigo).toBe('REENVIO_PRONTO');
    });

    it.each(NO_REGISTRADOS)('verificarCodigo: %s cuenta intentos y bloquea igual', async (_n, correo, conjuntoId) => {
      const real = preparar();
      const falso = preparar();
      await real.auth.solicitarCodigo(pedido(ADMIN));
      await falso.auth.solicitarCodigo(pedido(correo, conjuntoId));
      // Con el código demo: el registrado entra, el otro responde como incorrecto con 4 restantes.
      const e0 = await error(falso.auth.verificarCodigo({ ...pedido(correo, conjuntoId), codigo: CODIGO_DEMO }));
      expect(e0.codigo).toBe('CODIGO_INCORRECTO');
      expect(e0.intentosRestantes).toBe(4);
      // Mismo conteo y bloqueo que un registrado que se equivoca.
      const resultadosReal: unknown[] = [];
      const resultadosFalso: unknown[] = [];
      await real.auth.verificarCodigo({ ...pedido(ADMIN), codigo: '000000' }).catch((e: ErrorAuth) => {
        resultadosReal.push([e.codigo, e.intentosRestantes]);
      });
      resultadosFalso.push([e0.codigo, e0.intentosRestantes]);
      expect(resultadosFalso).toEqual(resultadosReal);
      let ultimo!: ErrorAuth;
      let ultimoReal!: ErrorAuth;
      for (let i = 0; i < 4; i++) {
        ultimo = await error(falso.auth.verificarCodigo({ ...pedido(correo, conjuntoId), codigo: '000000' }));
        ultimoReal = await error(real.auth.verificarCodigo({ ...pedido(ADMIN), codigo: '000000' }));
      }
      expect(ultimo.codigo).toBe('BLOQUEADO');
      expect(ultimo.codigo).toBe(ultimoReal.codigo);
      expect(ultimo.desbloqueoEn).toBe(ultimoReal.desbloqueoEn);
      expect(ultimo.intentosRestantes).toBe(0);
    });

    it('vencimiento idéntico para correo desconocido', async () => {
      const { auth, avanzar } = preparar();
      await auth.solicitarCodigo(pedido(DESCONOCIDO));
      avanzar(10 * MIN + 1);
      const e = await error(auth.verificarCodigo({ ...pedido(DESCONOCIDO), codigo: CODIGO_DEMO }));
      expect(e.codigo).toBe('CODIGO_VENCIDO');
    });
  });

  it('tasaError: 1 rechaza con RED', async () => {
    const auth = crearAuthMock({ latenciaMs: [0, 0], tasaError: 1 });
    expect((await error(auth.solicitarCodigo(pedido(ADMIN)))).codigo).toBe('RED');
    expect((await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO }))).codigo).toBe('RED');
  });
});

describe('listado de conjuntos', () => {
  it('devuelve los tres conjuntos de demo, uno sin paleta ni logo', async () => {
    const lista = await crearConjuntosMock({ latenciaMs: [0, 0] }).listar();
    expect(lista).toHaveLength(3);
    expect(lista.some((c) => !c.paleta && !c.logoUrl)).toBe(true);
    expect(lista.find((c) => c.slug === 'parques-occidente')?.paleta?.primario).toBe('#355E3B');
  });

  it('sinConjuntos: true resuelve []', async () => {
    await expect(crearConjuntosMock({ latenciaMs: [0, 0], sinConjuntos: true }).listar()).resolves.toEqual([]);
  });

  it('tasaError: 1 rechaza con error de red', async () => {
    const e = await error(crearConjuntosMock({ latenciaMs: [0, 0], tasaError: 1 }).listar());
    expect(e.codigo).toBe('RED');
  });

  it('respeta el AbortSignal', async () => {
    const c = new AbortController();
    const p = crearConjuntosMock({ latenciaMs: [50, 50] }).listar(c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
