import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Sesion } from '@/types/conjunto';
import {
  AVISO_MS,
  LIMITE_INACTIVIDAD_MS,
  estadoInactividad,
  useSesion,
} from './sesion';
import { usePreferencias } from './preferencias';
import { authService } from '@/services';
import { ErrorAuth } from '@/services/contratos';

const AHORA = new Date('2026-01-10T12:00:00Z').getTime();

function crearSesion(ultimaActividad = AHORA): Sesion {
  const a = { id: 'c1', slug: 'alamos', nombre: 'Álamos' };
  const b = { id: 'c2', slug: 'robles', nombre: 'Robles' };
  return {
    usuario: { id: 'u1', nombre: 'Ana', correo: 'ana@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: a,
    conjuntos: [a, b],
    ultimaActividad,
  };
}

function reiniciar() {
  localStorage.clear();
  useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: null, ultimaActividad: null, errorCambio: null, generacion: 0 });
  usePreferencias.setState({ ultimoConjuntoSlug: null });
}

describe('estadoInactividad', () => {
  it('no vence ni avisa con actividad reciente', () => {
    expect(estadoInactividad(AHORA, AHORA + 1000)).toEqual({
      vencida: false,
      avisar: false,
      msRestantes: LIMITE_INACTIVIDAD_MS - 1000,
    });
  });
  it('avisa desde 1 min antes del límite', () => {
    const e = estadoInactividad(AHORA, AHORA + LIMITE_INACTIVIDAD_MS - AVISO_MS);
    expect(e.avisar).toBe(true);
    expect(e.vencida).toBe(false);
    expect(e.msRestantes).toBe(AVISO_MS);
  });
  it('vence exactamente en el límite, con msRestantes en 0', () => {
    const e = estadoInactividad(AHORA, AHORA + LIMITE_INACTIVIDAD_MS);
    expect(e).toEqual({ vencida: true, avisar: false, msRestantes: 0 });
  });
});

describe('useSesion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    reiniciar();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    reiniciar();
  });

  it('empieza en estado cargando', () => {
    expect(useSesion.getInitialState().estado).toBe('cargando');
  });

  it('iniciar guarda la sesión con la hora actual, limpia el motivo y deja el estado lista', () => {
    useSesion.setState({ motivoCierre: 'manual', estado: 'cargando' });
    useSesion.getState().iniciar(crearSesion(1));
    const { sesion, motivoCierre, estado, ultimaActividad } = useSesion.getState();
    expect(sesion?.ultimaActividad).toBe(AHORA);
    expect(ultimaActividad).toBe(AHORA);
    expect(motivoCierre).toBeNull();
    expect(estado).toBe('lista');
  });

  it('cerrar vacía la sesión, guarda el motivo y conserva el último conjunto', () => {
    usePreferencias.getState().recordarConjunto('alamos');
    useSesion.getState().iniciar(crearSesion());
    useSesion.getState().cerrar('manual');
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().ultimaActividad).toBeNull();
    expect(useSesion.getState().motivoCierre).toBe('manual');
    expect(usePreferencias.getState().ultimoConjuntoSlug).toBe('alamos');
  });

  it('salir limpia el store al instante y llama a authService.salir', () => {
    const salir = vi.spyOn(authService, 'salir').mockResolvedValue();
    useSesion.getState().iniciar(crearSesion());
    useSesion.getState().salir('manual');
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().motivoCierre).toBe('manual');
    expect(salir).toHaveBeenCalledTimes(1);
  });

  it('salir no falla ni muestra error si authService.salir rechaza', async () => {
    const salir = vi.spyOn(authService, 'salir').mockRejectedValue(new ErrorAuth('RED'));
    useSesion.getState().iniciar(crearSesion());
    useSesion.getState().salir('inactividad');
    await vi.advanceTimersByTimeAsync(10);
    expect(salir).toHaveBeenCalledTimes(1);
    // Un rechazo sin capturar haría fallar la ejecución de vitest.
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().motivoCierre).toBe('inactividad');
  });

  describe('cambiarConjunto', () => {
    it('con slug propio llama al servicio con el id y guarda la sesión devuelta', async () => {
      const base = crearSesion();
      const devuelta: Sesion = { ...base, conjuntoActivo: base.conjuntos[1] };
      const cambiar = vi.spyOn(authService, 'cambiarConjunto').mockResolvedValue(devuelta);
      useSesion.getState().iniciar(base);
      vi.setSystemTime(AHORA + 5000);
      await expect(useSesion.getState().cambiarConjunto('robles')).resolves.toBe(true);
      expect(cambiar).toHaveBeenCalledWith('c2');
      const s = useSesion.getState().sesion!;
      expect(s.conjuntoActivo.slug).toBe('robles');
      expect(s.ultimaActividad).toBe(AHORA + 5000);
      expect(useSesion.getState().errorCambio).toBeNull();
    });

    it('con slug ajeno devuelve false y no llama al servicio', async () => {
      const cambiar = vi.spyOn(authService, 'cambiarConjunto');
      useSesion.getState().iniciar(crearSesion());
      const antes = useSesion.getState().sesion;
      await expect(useSesion.getState().cambiarConjunto('ajeno')).resolves.toBe(false);
      expect(cambiar).not.toHaveBeenCalled();
      expect(useSesion.getState().sesion).toEqual(antes);
    });

    it('sin sesión devuelve false', async () => {
      await expect(useSesion.getState().cambiarConjunto('alamos')).resolves.toBe(false);
    });

    it.each(['SIN_MEMBRESIA', 'RED'] as const)('si el servicio rechaza con %s devuelve false y deja el código', async (codigo) => {
      vi.spyOn(authService, 'cambiarConjunto').mockRejectedValue(new ErrorAuth(codigo));
      useSesion.getState().iniciar(crearSesion());
      const antes = useSesion.getState().sesion;
      await expect(useSesion.getState().cambiarConjunto('robles')).resolves.toBe(false);
      expect(useSesion.getState().errorCambio).toEqual({ slug: 'robles', codigo });
      expect(useSesion.getState().sesion).toEqual(antes);
    });
  });

  it('registrarActividad actualiza la marca; sin sesión no hace nada', () => {
    useSesion.getState().registrarActividad(123);
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().ultimaActividad).toBeNull();
    useSesion.getState().iniciar(crearSesion());
    useSesion.getState().registrarActividad(AHORA + 9000);
    expect(useSesion.getState().sesion?.ultimaActividad).toBe(AHORA + 9000);
    expect(useSesion.getState().ultimaActividad).toBe(AHORA + 9000);
  });

  it('persiste solo ultimaActividad y motivoCierre, sin ningún dato personal', () => {
    useSesion.getState().iniciar(crearSesion());
    const crudo = localStorage.getItem('mailflow.sesion')!;
    const guardado = JSON.parse(crudo);
    expect(Object.keys(guardado.state).sort()).toEqual(['motivoCierre', 'ultimaActividad']);
    expect(guardado.state.ultimaActividad).toBe(AHORA);
    expect(crudo).not.toMatch(/ana@|demo\.mailflow|Ana|Álamos|alamos/);
  });

  describe('rehidratar', () => {
    it('con sesión del servidor la deja en el store y pasa a lista', async () => {
      vi.spyOn(authService, 'sesion').mockResolvedValue(crearSesion(1));
      useSesion.setState({ estado: 'cargando' });
      await useSesion.getState().rehidratar();
      const { sesion, estado, motivoCierre } = useSesion.getState();
      expect(sesion?.usuario.correo).toBe('ana@demo.mailflow.test');
      expect(sesion?.ultimaActividad).toBe(AHORA);
      expect(estado).toBe('lista');
      expect(motivoCierre).toBeNull();
    });

    it('con null deja sesion en null y pasa a lista', async () => {
      vi.spyOn(authService, 'sesion').mockResolvedValue(null);
      useSesion.setState({ estado: 'cargando' });
      await useSesion.getState().rehidratar();
      expect(useSesion.getState().sesion).toBeNull();
      expect(useSesion.getState().estado).toBe('lista');
    });

    it('si el servicio lanza, queda sin sesión y en lista', async () => {
      vi.spyOn(authService, 'sesion').mockRejectedValue(new ErrorAuth('RED'));
      useSesion.setState({ estado: 'cargando' });
      await expect(useSesion.getState().rehidratar()).resolves.toBeUndefined();
      expect(useSesion.getState().sesion).toBeNull();
      expect(useSesion.getState().estado).toBe('lista');
    });

    it('null con ultimaActividad vencida (30 min o más) deja motivo inactividad', async () => {
      vi.spyOn(authService, 'sesion').mockResolvedValue(null);
      useSesion.setState({ estado: 'cargando', ultimaActividad: AHORA - LIMITE_INACTIVIDAD_MS });
      await useSesion.getState().rehidratar();
      expect(useSesion.getState().motivoCierre).toBe('inactividad');
    });

    it('null con ultimaActividad reciente conserva el motivo persistido', async () => {
      vi.spyOn(authService, 'sesion').mockResolvedValue(null);
      useSesion.setState({ estado: 'cargando', ultimaActividad: AHORA - 5 * 60_000, motivoCierre: 'manual' });
      await useSesion.getState().rehidratar();
      expect(useSesion.getState().motivoCierre).toBe('manual');
    });
  });

  describe('respuestas tardías', () => {
    function diferida<T>() {
      let resolver!: (v: T) => void;
      let rechazar!: (e: unknown) => void;
      const promesa = new Promise<T>((res, rej) => {
        resolver = res;
        rechazar = rej;
      });
      return { promesa, resolver, rechazar };
    }

    it('iniciar durante un rehidratar en vuelo que resuelve null conserva la sesión', async () => {
      const d = diferida<Sesion | null>();
      vi.spyOn(authService, 'sesion').mockReturnValue(d.promesa);
      useSesion.setState({ estado: 'cargando' });
      const pendiente = useSesion.getState().rehidratar();
      useSesion.getState().iniciar(crearSesion());
      d.resolver(null);
      await pendiente;
      expect(useSesion.getState().sesion).not.toBeNull();
      expect(useSesion.getState().estado).toBe('lista');
      expect(useSesion.getState().motivoCierre).toBeNull();
    });

    it('cerrar durante un cambio de conjunto en vuelo no resucita la sesión', async () => {
      const base = crearSesion();
      const d = diferida<Sesion>();
      vi.spyOn(authService, 'cambiarConjunto').mockReturnValue(d.promesa);
      vi.spyOn(authService, 'salir').mockResolvedValue();
      useSesion.getState().iniciar(base);
      const pendiente = useSesion.getState().cambiarConjunto('robles');
      useSesion.getState().salir('manual');
      d.resolver({ ...base, conjuntoActivo: base.conjuntos[1] });
      await expect(pendiente).resolves.toBe(false);
      expect(useSesion.getState().sesion).toBeNull();
      expect(useSesion.getState().errorCambio).toBeNull();
    });

    it('un error tardío de un cambio cerrado no escribe errorCambio', async () => {
      const d = diferida<Sesion>();
      vi.spyOn(authService, 'cambiarConjunto').mockReturnValue(d.promesa);
      useSesion.getState().iniciar(crearSesion());
      const pendiente = useSesion.getState().cambiarConjunto('robles');
      useSesion.getState().cerrar('manual');
      d.rechazar(new ErrorAuth('SIN_MEMBRESIA'));
      await expect(pendiente).resolves.toBe(false);
      expect(useSesion.getState().errorCambio).toBeNull();
    });

    it('dos cambios A y B: si A resuelve después de B queda B', async () => {
      const base = crearSesion();
      const c3 = { id: 'c3', slug: 'pinos', nombre: 'Pinos' };
      const sesion3 = { ...base, conjuntos: [...base.conjuntos, c3] };
      const a = diferida<Sesion>();
      const b = diferida<Sesion>();
      const cambiar = vi.spyOn(authService, 'cambiarConjunto');
      cambiar.mockReturnValueOnce(a.promesa).mockReturnValueOnce(b.promesa);
      useSesion.getState().iniciar(sesion3);
      const pA = useSesion.getState().cambiarConjunto('robles');
      const pB = useSesion.getState().cambiarConjunto('pinos');
      b.resolver({ ...sesion3, conjuntoActivo: c3 });
      await expect(pB).resolves.toBe(true);
      a.resolver({ ...sesion3, conjuntoActivo: sesion3.conjuntos[1] });
      await expect(pA).resolves.toBe(false);
      expect(useSesion.getState().sesion?.conjuntoActivo.slug).toBe('pinos');
    });

    it('iniciar y cerrar limpian errorCambio', () => {
      useSesion.setState({ errorCambio: { slug: 'x', codigo: 'RED' } });
      useSesion.getState().iniciar(crearSesion());
      expect(useSesion.getState().errorCambio).toBeNull();
      useSesion.setState({ errorCambio: { slug: 'x', codigo: 'RED' } });
      useSesion.getState().cerrar('manual');
      expect(useSesion.getState().errorCambio).toBeNull();
    });
  });

  describe('rehidratar solapado (StrictMode)', () => {
    it('dos llamadas seguidas consultan al servidor una vez y no adelantan lista', async () => {
      let resolver!: (v: Sesion | null) => void;
      const sesion = vi.spyOn(authService, 'sesion').mockReturnValue(new Promise((r) => (resolver = r)));
      useSesion.setState({ estado: 'cargando' });
      const p1 = useSesion.getState().rehidratar();
      const p2 = useSesion.getState().rehidratar();
      expect(sesion).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(useSesion.getState().estado).toBe('cargando');
      resolver(crearSesion());
      await Promise.all([p1, p2]);
      expect(useSesion.getState().sesion).not.toBeNull();
      expect(useSesion.getState().estado).toBe('lista');
    });

    it('tras terminar una rehidratación, una llamada nueva vuelve a consultar', async () => {
      const sesion = vi.spyOn(authService, 'sesion').mockResolvedValue(null);
      await useSesion.getState().rehidratar();
      await useSesion.getState().rehidratar();
      expect(sesion).toHaveBeenCalledTimes(2);
    });
  });

  describe('lectura de lo persistido', () => {
    function guardar(state: unknown) {
      localStorage.setItem('mailflow.sesion', JSON.stringify({ state, version: 0 }));
    }

    it('carga ultimaActividad y motivoCierre válidos', async () => {
      guardar({ ultimaActividad: AHORA - 1000, motivoCierre: 'inactividad' });
      await useSesion.persist.rehydrate();
      expect(useSesion.getState().ultimaActividad).toBe(AHORA - 1000);
      expect(useSesion.getState().motivoCierre).toBe('inactividad');
    });

    it('JSON inválido: valores vacíos y sin lanzar', async () => {
      localStorage.setItem('mailflow.sesion', '{no es json');
      await expect(useSesion.persist.rehydrate()).resolves.not.toThrow();
      expect(useSesion.getState().ultimaActividad).toBeNull();
      expect(useSesion.getState().motivoCierre).toBeNull();
    });

    it('valores corruptos se descartan', async () => {
      guardar({ ultimaActividad: 'ayer', motivoCierre: 'otro' });
      await useSesion.persist.rehydrate();
      expect(useSesion.getState().ultimaActividad).toBeNull();
      expect(useSesion.getState().motivoCierre).toBeNull();
    });

    it('rehidratar desde el almacenamiento no toca la sesión en memoria ni el estado', async () => {
      useSesion.getState().iniciar(crearSesion());
      guardar({ ultimaActividad: null, motivoCierre: 'manual' });
      await useSesion.persist.rehydrate();
      expect(useSesion.getState().sesion).not.toBeNull();
      expect(useSesion.getState().estado).toBe('lista');
    });
  });

  describe('actualizarConjunto', () => {
    it('actualiza conjuntoActivo y la entrada en conjuntos sin incrementar generacion ni cerrar sesión', () => {
      const base = crearSesion();
      useSesion.getState().iniciar(base);
      const genAntes = useSesion.getState().generacion;
      const actAntes = useSesion.getState().sesion?.ultimaActividad;

      const actualizado = {
        id: 'c1',
        slug: 'alamos',
        nombre: 'Álamos Renovado',
        logoUrl: '/logos/alamos.png',
        paleta: { primario: '#1E3A5F', acento: '#E0A458' },
      };
      useSesion.getState().actualizarConjunto(actualizado);

      const estado = useSesion.getState();
      expect(estado.generacion).toBe(genAntes);
      expect(estado.estado).toBe('lista');
      expect(estado.motivoCierre).toBeNull();
      expect(estado.sesion?.ultimaActividad).toBe(actAntes);
      expect(estado.sesion?.conjuntoActivo).toEqual(actualizado);
      expect(estado.sesion?.conjuntos[0]).toEqual(actualizado);
      expect(estado.sesion?.conjuntos[1]).toEqual(base.conjuntos[1]);

      // Limpiar logoUrl y paleta también los borra en conjuntoActivo y conjuntos
      const limpio = { id: 'c1', slug: 'alamos', nombre: 'Álamos Sin Paleta' };
      useSesion.getState().actualizarConjunto(limpio);
      expect(useSesion.getState().sesion?.conjuntoActivo).toEqual(limpio);
      expect(useSesion.getState().sesion?.conjuntos[0]).toEqual(limpio);
    });

    it('si el conjunto actualizado no es el activo solo actualiza su entrada en conjuntos; sin sesión es no-op', () => {
      useSesion.getState().actualizarConjunto({ id: 'c1', slug: 'alamos', nombre: 'Nada' });
      expect(useSesion.getState().sesion).toBeNull();

      const base = crearSesion();
      useSesion.getState().iniciar(base);
      const otroActualizado = { id: 'c2', slug: 'robles', nombre: 'Robles Nuevo' };
      useSesion.getState().actualizarConjunto(otroActualizado);

      expect(useSesion.getState().sesion?.conjuntoActivo).toEqual(base.conjuntoActivo);
      expect(useSesion.getState().sesion?.conjuntos[1]).toEqual(otroActualizado);
    });
  });
});
