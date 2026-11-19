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
    expect(s.conjuntoActivo.slug).toBe('parque-central-occidente');
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

  describe('límite de intentos por pareja (conjunto, correo)', () => {
    const MAL = '000000';

    it('pedir un código nuevo no reinicia los intentos fallidos', async () => {
      const { auth, avanzar } = preparar();
      await auth.solicitarCodigo(pedido(ADMIN));
      for (let i = 0; i < 4; i++) await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }));
      avanzar(MIN);
      await auth.solicitarCodigo(pedido(ADMIN));
      const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }));
      expect(e.codigo).toBe('BLOQUEADO');
    });

    it('con 4 fallos y código nuevo, el código bueno entra y reinicia el contador', async () => {
      const { auth, avanzar } = preparar();
      await auth.solicitarCodigo(pedido(ADMIN));
      for (let i = 0; i < 4; i++) await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }));
      avanzar(MIN);
      await auth.solicitarCodigo(pedido(ADMIN));
      await auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO });
      avanzar(MIN);
      await auth.solicitarCodigo(pedido(ADMIN));
      const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }));
      expect(e.intentosRestantes).toBe(4);
    });

    it('código vencido no gasta intento', async () => {
      const { auth, avanzar } = preparar();
      await auth.solicitarCodigo(pedido(ADMIN));
      await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }));
      avanzar(10 * MIN + 1);
      expect((await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }))).codigo).toBe('CODIGO_VENCIDO');
      expect((await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }))).codigo).toBe('CODIGO_VENCIDO');
      await auth.solicitarCodigo(pedido(ADMIN));
      const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: MAL }));
      expect(e.intentosRestantes).toBe(3);
    });

    it('verificar sin código pedido gasta intento', async () => {
      const { auth } = preparar();
      const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO }));
      expect([e.codigo, e.intentosRestantes]).toEqual(['CODIGO_INCORRECTO', 4]);
    });

    it('verificar con código ya usado gasta intento', async () => {
      const { auth } = preparar();
      await auth.solicitarCodigo(pedido(ADMIN));
      await auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO });
      const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo: CODIGO_DEMO }));
      expect([e.codigo, e.intentosRestantes]).toEqual(['CODIGO_INCORRECTO', 4]);
    });

    it.each(['12345', '1234567'])('%s cuenta como incorrecto', async (codigo) => {
      const { auth } = preparar();
      await auth.solicitarCodigo(pedido(ADMIN));
      const e = await error(auth.verificarCodigo({ ...pedido(ADMIN), codigo }));
      expect([e.codigo, e.intentosRestantes]).toEqual(['CODIGO_INCORRECTO', 4]);
    });

    it('solicitarCodigo durante el bloqueo rechaza BLOQUEADO con desbloqueoEn', async () => {
      for (const [correo, conjuntoId] of [
        [ADMIN, 'cj-parques'],
        [DESCONOCIDO, 'cj-parques'],
        [SOPORTE, 'cj-nogal'],
      ] as const) {
        const { auth, ahora } = preparar();
        await auth.solicitarCodigo(pedido(correo, conjuntoId));
        for (let i = 0; i < 5; i++) await error(auth.verificarCodigo({ ...pedido(correo, conjuntoId), codigo: MAL }));
        const e = await error(auth.solicitarCodigo(pedido(correo, conjuntoId)));
        expect(e.codigo).toBe('BLOQUEADO');
        expect(e.desbloqueoEn).toBe(ahora() + 15 * MIN);
      }
    });
  });

  describe('no revela si el correo existe: trazas idénticas y con valores esperados', () => {
    type Auth = ReturnType<typeof crearAuthMock>;
    type Pedido = { conjuntoId: string; correo: string };
    type Paso = { espera: number } | { llama: (auth: Auth, p: Pedido) => Promise<unknown> };
    /** Resultado esperado: tiempos relativos al inicio de la secuencia. */
    type Esperado =
      | 'espera'
      | { ok: { venceEn: number; reenvioDisponibleEn: number } }
      | { codigo: string; intentosRestantes?: number; desbloqueoEn?: number };

    const sol: Paso = { llama: (a, p) => a.solicitarCodigo(p) };
    const ver = (codigo: string): Paso => ({ llama: (a, p) => a.verificarCodigo({ ...p, codigo }) });
    const esperar = (ms: number): Paso => ({ espera: ms });

    const OK = (venceEn: number, reenvioDisponibleEn: number): Esperado => ({ ok: { venceEn, reenvioDisponibleEn } });
    const INC = (intentosRestantes: number): Esperado => ({ codigo: 'CODIGO_INCORRECTO', intentosRestantes });
    const BLOQ = (desbloqueoEn: number): Esperado => ({ codigo: 'BLOQUEADO', intentosRestantes: 0, desbloqueoEn });
    const VENCIDO: Esperado = { codigo: 'CODIGO_VENCIDO' };
    const PRONTO: Esperado = { codigo: 'REENVIO_PRONTO' };

    /** Ejecuta los pasos y devuelve lo observado. Solo captura `ErrorAuth`; cualquier otro error falla la prueba. */
    async function traza(pasos: Paso[], p: Pedido): Promise<Esperado[]> {
      const { auth, avanzar, ahora } = preparar();
      const t0 = ahora();
      const salida: Esperado[] = [];
      for (const paso of pasos) {
        if ('espera' in paso) {
          avanzar(paso.espera);
          salida.push('espera');
          continue;
        }
        try {
          const r = (await paso.llama(auth, p)) as { venceEn: number; reenvioDisponibleEn: number };
          expect(Object.keys(r).sort()).toEqual(['reenvioDisponibleEn', 'venceEn']);
          salida.push(OK(r.venceEn - t0, r.reenvioDisponibleEn - t0));
        } catch (e) {
          if (!(e instanceof ErrorAuth)) throw e;
          const obs: { codigo: string; intentosRestantes?: number; desbloqueoEn?: number } = { codigo: e.codigo };
          if (e.intentosRestantes !== undefined) obs.intentosRestantes = e.intentosRestantes;
          if (e.desbloqueoEn !== undefined) obs.desbloqueoEn = e.desbloqueoEn - t0;
          salida.push(obs);
        }
      }
      return salida;
    }

    const MAL = '000000';
    const s = 1000;
    const casos: [string, Paso[], Esperado[]][] = [
      ['verificar sin pedir código', [ver(MAL), ver(MAL)], [INC(4), INC(3)]],
      [
        "cadena vacía ('' y ' ') no gasta intento",
        [sol, ver(''), ver(' '), ver(MAL)],
        [OK(10 * MIN, MIN), INC(5), INC(5), INC(4)],
      ],
      [
        'reenvío antes de 60 s y después',
        [sol, esperar(30 * s), sol, esperar(30 * s), sol],
        [OK(10 * MIN, MIN), 'espera', PRONTO, 'espera', OK(MIN + 10 * MIN, 2 * MIN)],
      ],
      [
        'código vencido',
        [sol, ver(MAL), esperar(10 * MIN + 1), ver(MAL), ver(MAL), sol, ver(MAL)],
        [OK(10 * MIN, MIN), INC(4), 'espera', VENCIDO, VENCIDO, OK(20 * MIN + 1, 11 * MIN + 1), INC(3)],
      ],
      [
        '5 fallos, bloqueo, solicitar bloqueado y desbloqueo',
        [sol, ver(MAL), ver(MAL), ver(MAL), ver(MAL), ver(MAL), ver(MAL), sol, esperar(15 * MIN), ver(MAL), sol, ver(MAL)],
        [
          OK(10 * MIN, MIN), INC(4), INC(3), INC(2), INC(1), BLOQ(15 * MIN), BLOQ(15 * MIN), BLOQ(15 * MIN),
          'espera', INC(4), OK(25 * MIN, 16 * MIN), INC(3),
        ],
      ],
      [
        'intentos que sobreviven al código nuevo',
        [sol, ver(MAL), ver(MAL), ver(MAL), ver(MAL), esperar(MIN), sol, ver(MAL)],
        [OK(10 * MIN, MIN), INC(4), INC(3), INC(2), INC(1), 'espera', OK(11 * MIN, 2 * MIN), BLOQ(16 * MIN)],
      ],
    ];
    // El código demo solo entra con el correo registrado, así que se compara aparte (siguiente prueba).
    const identidades: [string, string, string][] = [
      ['registrado', ADMIN, 'cj-parques'],
      ['correo desconocido', DESCONOCIDO, 'cj-parques'],
      ['correo registrado en otro conjunto', SOPORTE, 'cj-nogal'],
    ];

    describe.each(casos)('%s', (_n, pasos, esperado) => {
      it.each(identidades)('%s', async (_i, correo, conjuntoId) => {
        expect(esperado).toHaveLength(pasos.length);
        expect(await traza(pasos, pedido(correo, conjuntoId))).toEqual(esperado);
      });
    });

    it('el código demo con un no registrado responde como incorrecto con el mismo conteo', async () => {
      for (const [, correo, conjuntoId] of identidades.slice(1)) {
        const t = await traza([sol, ver(CODIGO_DEMO), ver(CODIGO_DEMO)], pedido(correo, conjuntoId));
        expect(t).toEqual([OK(10 * MIN, MIN), INC(4), INC(3)]);
      }
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
    expect(lista.find((c) => c.slug === 'parque-central-occidente')?.paleta?.primario).toBe('#355E3B');
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

describe('sesión, cambio de conjunto y salida', () => {
  async function entrar(auth: ReturnType<typeof preparar>['auth'], correo = ADMIN) {
    await auth.solicitarCodigo(pedido(correo));
    return auth.verificarCodigo({ ...pedido(correo), codigo: CODIGO_DEMO });
  }

  it('sesion() es null sin acceso y devuelve la última sesión verificada', async () => {
    const { auth } = preparar();
    expect(await auth.sesion()).toBeNull();
    const s = await entrar(auth);
    expect(await auth.sesion()).toEqual(s);
  });

  it('salir() borra la sesión', async () => {
    const { auth } = preparar();
    await entrar(auth);
    await auth.salir();
    expect(await auth.sesion()).toBeNull();
  });

  it('cambiarConjunto cambia el activo y actualiza la sesión', async () => {
    const { auth } = preparar();
    await entrar(auth);
    const s = await auth.cambiarConjunto('cj-nogal');
    expect(s.conjuntoActivo.id).toBe('cj-nogal');
    expect((await auth.sesion())?.conjuntoActivo.id).toBe('cj-nogal');
  });

  it('cambiarConjunto exige pertenencia (SIN_MEMBRESIA) y sesión', async () => {
    const { auth } = preparar();
    await expect(auth.cambiarConjunto('cj-nogal')).rejects.toMatchObject({ codigo: 'RED' });
    await entrar(auth, SOPORTE);
    const e = await error(auth.cambiarConjunto('cj-nogal'));
    expect(e.codigo).toBe('SIN_MEMBRESIA');
  });
});
