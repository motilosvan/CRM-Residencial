import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorAuth, type AuthService, type ConjuntosService } from '@/services/contratos';
import { CODIGO_DEMO } from '@/services/mock/datos';
import { crearAuthMock } from '@/services/mock/authMock';
import { crearConjuntosMock } from '@/services/mock/conjuntosMock';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };
let authReal: AuthService;
let conjuntosReal: ConjuntosService;
const solicitarCodigo = vi.fn((p: Parameters<AuthService['solicitarCodigo']>[0]) => authReal.solicitarCodigo(p));
const verificarCodigo = vi.fn((p: Parameters<AuthService['verificarCodigo']>[0]) => authReal.verificarCodigo(p));
const listar = vi.fn((s?: AbortSignal) => conjuntosReal.listar(s));

vi.mock('@/services', async () => ({
  CODIGO_DEMO: (await import('@/services/mock/datos')).CODIGO_DEMO,
  authService: {
    solicitarCodigo: (p: Parameters<AuthService['solicitarCodigo']>[0]) => solicitarCodigo(p),
    verificarCodigo: (p: Parameters<AuthService['verificarCodigo']>[0]) => verificarCodigo(p),
  },
  conjuntosService: { listar: (s?: AbortSignal) => listar(s) },
}));

import { rutas } from '@/router';
import { usePreferencias } from '@/store/preferencias';
import { useSesion } from '@/store/sesion';

const NEUTRO = 'Si el correo está registrado en este conjunto, recibirás un código';
const CORREO = 'admin@demo.mailflow.test';

beforeAll(() => {
  // cmdk (lista del selector) usa APIs que jsdom no implementa.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  // input-otp consulta la posición del puntero para su resaltado.
  document.elementFromPoint = () => null;
});

beforeEach(() => {
  authReal = crearAuthMock({ ...SIN_LATENCIA, ahora: () => Date.now() });
  conjuntosReal = crearConjuntosMock(SIN_LATENCIA);
  solicitarCodigo.mockClear();
  verificarCodigo.mockClear();
  listar.mockClear();
  useSesion.setState({ sesion: null, motivoCierre: null });
  usePreferencias.setState({ ultimoConjuntoSlug: null });
});

afterEach(() => {
  vi.useRealTimers();
});

function montar(ruta = '/login') {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, qc, user: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function elegirConjunto(user: Usuario, nombre: string) {
  const combo = await screen.findByRole('combobox', { name: /conjunto/i });
  await waitFor(() => expect(combo).toBeEnabled());
  await user.click(combo);
  await user.click(await screen.findByRole('option', { name: nombre }));
}

async function pasarAlPaso2(user: Usuario, correo = CORREO) {
  await elegirConjunto(user, 'Parque Central de Occidente');
  await user.type(screen.getByLabelText(/correo/i), correo);
  await user.click(screen.getByRole('button', { name: /enviar código/i }));
  await screen.findByText(NEUTRO);
}

function campoCodigo() {
  return screen.getByLabelText(/código de 6 dígitos/i);
}

describe('LoginPage · paso 1', () => {
  it('valida conjunto y correo obligatorios', async () => {
    const { user } = montar();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conjunto/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /enviar código/i }));
    expect(await screen.findByText('Elige tu conjunto', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Escribe tu correo')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/correo/i), 'no-es-correo');
    await user.click(screen.getByRole('button', { name: /enviar código/i }));
    expect(await screen.findByText('Escribe un correo válido')).toBeInTheDocument();
    expect(solicitarCodigo).not.toHaveBeenCalled();
  });

  it.each([CORREO, 'desconocido@demo.mailflow.test'])('con %s muestra el mensaje neutro y pasa al paso 2', async (correo) => {
    const { user } = montar();
    await pasarAlPaso2(user, correo);
    expect(solicitarCodigo).toHaveBeenCalledTimes(1);
    expect(campoCodigo()).toBeInTheDocument();
    expect(screen.getByText(/paso 2 de 2/i)).toBeInTheDocument();
  });

  it('sin conjuntos: aviso, selector deshabilitado y ayuda visible', async () => {
    conjuntosReal = crearConjuntosMock({ ...SIN_LATENCIA, sinConjuntos: true });
    montar();
    expect(await screen.findByText('Aún no hay conjuntos habilitados')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /conjunto/i })).toBeDisabled();
    expect(screen.getByText(/¿No encuentras tu conjunto\? Comunícate con tu administración/)).toBeInTheDocument();
  });

  it('error de carga ofrece Reintentar y se recupera', async () => {
    listar.mockRejectedValueOnce(new Error('RED'));
    const { user } = montar();
    await user.click(await screen.findByRole('button', { name: /reintentar/i }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conjunto/i })).toBeEnabled());
    expect(screen.getByText(/¿No encuentras tu conjunto\?/)).toBeInTheDocument();
  });

  it('preselecciona el último conjunto usado', async () => {
    usePreferencias.setState({ ultimoConjuntoSlug: 'altos-del-nogal' });
    montar();
    const combo = await screen.findByRole('combobox', { name: /conjunto/i });
    await waitFor(() => expect(combo).toHaveTextContent('Altos del Nogal'));
  });

  it('muestra el aviso de inactividad con ?motivo=inactividad', async () => {
    montar('/login?motivo=inactividad');
    expect(await screen.findByText('Tu sesión se cerró por inactividad')).toBeInTheDocument();
  });

  it('sin el parámetro no muestra el aviso de inactividad', async () => {
    montar();
    await screen.findByRole('combobox', { name: /conjunto/i });
    expect(screen.queryByText('Tu sesión se cerró por inactividad')).not.toBeInTheDocument();
  });

  it('un fallo de red al pedir el código avisa y se queda en el paso 1', async () => {
    solicitarCodigo.mockRejectedValueOnce(new ErrorAuth('RED'));
    const { user } = montar();
    await elegirConjunto(user, 'Parque Central de Occidente');
    await user.type(screen.getByLabelText(/correo/i), CORREO);
    await user.click(screen.getByRole('button', { name: /enviar código/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos enviar el código/i);
    expect(screen.queryByText(NEUTRO)).not.toBeInTheDocument();
  });
});

describe('LoginPage · paso 2', () => {
  it('pegar " 123 456 " normaliza, entra y navega al panel', async () => {
    const { user, router } = montar();
    await pasarAlPaso2(user);
    await user.click(campoCodigo());
    await user.paste(` ${CODIGO_DEMO.slice(0, 3)} ${CODIGO_DEMO.slice(3)} `);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/app\/parque-central-occidente/));
    expect(verificarCodigo).toHaveBeenCalledTimes(1);
    expect(verificarCodigo.mock.calls[0][0].codigo).toBe(CODIGO_DEMO);
    expect(useSesion.getState().sesion?.usuario.correo).toBe(CORREO);
    expect(usePreferencias.getState().ultimoConjuntoSlug).toBe('parque-central-occidente');
  });

  it('código erróneo muestra los intentos restantes', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.type(campoCodigo(), '000000');
    expect(await screen.findByText(/te quedan 4 intentos/i)).toBeInTheDocument();
    await user.type(campoCodigo(), '000000');
    expect(await screen.findByText(/te quedan 3 intentos/i)).toBeInTheDocument();
  });

  it('al bloquearse deshabilita el campo e indica cuándo reintentar', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    for (let i = 0; i < 5; i++) {
      await waitFor(() => expect(campoCodigo()).toBeEnabled());
      await user.type(campoCodigo(), '000000');
      await waitFor(() => expect(verificarCodigo).toHaveBeenCalledTimes(i + 1));
    }
    expect(await screen.findByText(/volver a intentarlo a las/i)).toBeInTheDocument();
    expect(campoCodigo()).toBeDisabled();
    expect(useSesion.getState().sesion).toBeNull();
    // Con el acceso bloqueado no se ofrece reenviar ni se muestra la cuenta regresiva.
    expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/reenviar código en/i)).not.toBeInTheDocument();
  });

  it('"Reenviar" queda deshabilitado con cuenta regresiva de 60 s y luego se habilita', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    const reenviar = screen.getByRole('button', { name: /reenviar código/i });
    expect(reenviar).toBeDisabled();
    expect(reenviar).toHaveTextContent(/\b(60|59) s\b/);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    // El contador se refresca cada segundo con el intervalo real.
    await waitFor(() => expect(screen.getByRole('button', { name: /^reenviar código$/i })).toBeEnabled(), { timeout: 3000 });
  });

  it('código vencido ofrece reenviar y el reenvío reinicia la cuenta', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1000);
    await user.type(campoCodigo(), CODIGO_DEMO);
    expect(await screen.findByText(/el código venció/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /^reenviar código$/i })).toBeEnabled(), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: /^reenviar código$/i }));
    await waitFor(() => expect(solicitarCodigo).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: /reenviar código en \d+ s/i })).toBeDisabled();
    expect(screen.queryByText(/el código venció/i)).not.toBeInTheDocument();
  });

  it('"Cambiar correo" vuelve al paso 1 conservando el conjunto', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.click(screen.getByRole('button', { name: /cambiar correo/i }));
    const combo = await screen.findByRole('combobox', { name: /conjunto/i });
    expect(combo).toHaveTextContent('Parque Central de Occidente');
    expect(screen.getByLabelText(/correo/i)).toHaveValue(CORREO);
  });

  it('doble clic en verificar produce una sola llamada', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    verificarCodigo.mockImplementationOnce(
      (p) => new Promise((resolver, rechazar) => setTimeout(() => authReal.verificarCodigo(p).then(resolver, rechazar), 150)),
    );
    await user.type(campoCodigo(), '000000');
    const boton = screen.getByRole('button', { name: /verific/i });
    await user.dblClick(boton);
    await waitFor(() => expect(screen.getByText(/te quedan 4 intentos/i)).toBeInTheDocument());
    expect(verificarCodigo).toHaveBeenCalledTimes(1);
  });

  it('el foco queda en el campo del código al llegar al paso 2', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await waitFor(() => expect(campoCodigo()).toHaveFocus());
  });

  it('muestra el código de demostración en desarrollo', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    expect(import.meta.env.DEV).toBe(true);
    expect(screen.getByText(`Código de demostración: ${CODIGO_DEMO}`)).toBeInTheDocument();
  });

  it('no muestra el código de demostración fuera de desarrollo', async () => {
    vi.stubEnv('DEV', false);
    try {
      const { user } = montar();
      await pasarAlPaso2(user);
      expect(screen.queryByText(/código de demostración/i)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

async function bloquear(user: Usuario) {
  for (let i = 0; i < 5; i++) {
    await waitFor(() => expect(campoCodigo()).toBeEnabled());
    await user.type(campoCodigo(), '000000');
    await waitFor(() => expect(verificarCodigo).toHaveBeenCalledTimes(i + 1));
  }
  await screen.findByText(/volver a intentarlo a las/i);
}

const CORREO_DESCONOCIDO = 'desconocido@demo.mailflow.test';

describe('LoginPage · foco de revisión (ronda 1)', () => {
  it.each([CORREO, CORREO_DESCONOCIDO])('paso 1 con REENVIO_PRONTO (%s): vuelve con "Cambiar correo", reenvía y sigue sin error', async (correo) => {
    const { user } = montar();
    await pasarAlPaso2(user, correo);
    await user.click(screen.getByRole('button', { name: /cambiar correo/i }));
    await user.click(await screen.findByRole('button', { name: /enviar código/i }));
    await screen.findByText(NEUTRO);
    expect(solicitarCodigo).toHaveBeenCalledTimes(2);
    await expect(solicitarCodigo.mock.results[1].value).rejects.toMatchObject({ codigo: 'REENVIO_PRONTO' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reenviar código en \d+ s/i })).toBeDisabled();
  });

  it('paso 1 con BLOQUEADO: mismo resultado visible con correo registrado y no registrado', async () => {
    const vistos: string[] = [];
    for (const correo of [CORREO, CORREO_DESCONOCIDO]) {
      authReal = crearAuthMock({ ...SIN_LATENCIA, ahora: () => Date.now() });
      verificarCodigo.mockClear();
      const { user } = montar();
      await pasarAlPaso2(user, correo);
      await bloquear(user);
      await user.click(screen.getByRole('button', { name: /cambiar correo/i }));
      await user.click(await screen.findByRole('button', { name: /enviar código/i }));
      await screen.findByText(NEUTRO);
      expect(campoCodigo()).toBeDisabled();
      expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument();
      const alerta = screen.getByRole('alert').textContent ?? '';
      expect(alerta).toMatch(/volver a intentarlo a las/i);
      vistos.push(alerta);
      cleanup();
    }
    expect(vistos[0]).toBe(vistos[1]);
  });

  it('tiempos visibles iguales con correo registrado y no registrado', async () => {
    const datos: { contador: number; vigencia: number }[] = [];
    for (const correo of [CORREO, CORREO_DESCONOCIDO]) {
      authReal = crearAuthMock({ ...SIN_LATENCIA, ahora: () => Date.now() });
      solicitarCodigo.mockClear();
      const { user } = montar();
      await pasarAlPaso2(user, correo);
      const boton = screen.getByRole('button', { name: /reenviar código en \d+ s/i });
      const contador = Number(/(\d+) s/.exec(boton.textContent ?? '')?.[1]);
      const envio = await solicitarCodigo.mock.results[0].value;
      datos.push({
        contador,
        vigencia: envio.venceEn - envio.reenvioDisponibleEn,
      });
      cleanup();
    }
    expect(datos[0].contador).toBeGreaterThanOrEqual(59);
    expect(datos[1].contador).toBeGreaterThanOrEqual(59);
    expect(datos[0].vigencia).toBe(datos[1].vigencia);
    expect(datos[0].vigencia).toBe(10 * 60_000 - 60_000);
  });

  it('entrada no numérica: "12ab34" deja solo dígitos y no llama al servicio', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.type(campoCodigo(), '12ab34');
    expect(campoCodigo()).toHaveValue('1234');
    expect(verificarCodigo).not.toHaveBeenCalled();
  });

  it('entrada no numérica: solo letras no escribe nada ni gasta intentos', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.type(campoCodigo(), 'abcdef');
    expect(campoCodigo()).toHaveValue('');
    expect(verificarCodigo).not.toHaveBeenCalled();
    expect(screen.queryByText(/te quedan/i)).not.toBeInTheDocument();
  });

  it('pegar texto con letras mezcladas no gasta intentos', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.click(campoCodigo());
    await user.paste('ab 12-34 cd');
    expect(campoCodigo()).toHaveValue('1234');
    expect(verificarCodigo).not.toHaveBeenCalled();
  });

  it('paso 1: doble clic en "Enviar código" hace una sola llamada', async () => {
    solicitarCodigo.mockImplementationOnce(
      (p) => new Promise((resolver, rechazar) => setTimeout(() => authReal.solicitarCodigo(p).then(resolver, rechazar), 150)),
    );
    const { user } = montar();
    await elegirConjunto(user, 'Parque Central de Occidente');
    await user.type(screen.getByLabelText(/correo/i), CORREO);
    await user.dblClick(screen.getByRole('button', { name: /enviar código/i }));
    await screen.findByText(NEUTRO);
    expect(solicitarCodigo).toHaveBeenCalledTimes(1);
  });

  it('paso 1: doble Enter hace una sola llamada', async () => {
    solicitarCodigo.mockImplementationOnce(
      (p) => new Promise((resolver, rechazar) => setTimeout(() => authReal.solicitarCodigo(p).then(resolver, rechazar), 150)),
    );
    const { user } = montar();
    await elegirConjunto(user, 'Parque Central de Occidente');
    await user.type(screen.getByLabelText(/correo/i), `${CORREO}{Enter}{Enter}`);
    await screen.findByText(NEUTRO);
    expect(solicitarCodigo).toHaveBeenCalledTimes(1);
  });

  it('paso 1: dos envíos simultáneos del formulario hacen una sola llamada', async () => {
    solicitarCodigo.mockImplementationOnce(
      (p) => new Promise((resolver, rechazar) => setTimeout(() => authReal.solicitarCodigo(p).then(resolver, rechazar), 150)),
    );
    const { user } = montar();
    await elegirConjunto(user, 'Parque Central de Occidente');
    await user.type(screen.getByLabelText(/correo/i), CORREO);
    const form = screen.getByRole('button', { name: /enviar código/i }).closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText(NEUTRO);
    expect(solicitarCodigo).toHaveBeenCalledTimes(1);
  });

  it('paso 2: dos envíos simultáneos (autoenvío + formulario) hacen una sola llamada', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    verificarCodigo.mockImplementationOnce(
      (p) => new Promise((resolver, rechazar) => setTimeout(() => authReal.verificarCodigo(p).then(resolver, rechazar), 150)),
    );
    await user.type(campoCodigo(), '000000'); // onComplete: primer envío, en vuelo
    const form = screen.getByRole('button', { name: /verific/i }).closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByText(/te quedan 4 intentos/i);
    expect(verificarCodigo).toHaveBeenCalledTimes(1);
  });

  it('"Reenviar" ignora REENVIO_PRONTO en silencio: sin error ni intentos gastados', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    const boton = await screen.findByRole('button', { name: /^reenviar código$/i }, { timeout: 3000 });
    await waitFor(() => expect(boton).toBeEnabled(), { timeout: 3000 });
    solicitarCodigo.mockRejectedValueOnce(new ErrorAuth('REENVIO_PRONTO'));
    await user.click(boton);
    await waitFor(() => expect(solicitarCodigo).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: /reenviar/i })).toBeDisabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/no pudimos enviar/i)).not.toBeInTheDocument();
    expect(verificarCodigo).not.toHaveBeenCalled();
    expect(campoCodigo()).toBeEnabled();
  });

  it('"Reenviar" con fallo de red sí avisa', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    const boton = await screen.findByRole('button', { name: /^reenviar código$/i }, { timeout: 3000 });
    solicitarCodigo.mockRejectedValueOnce(new ErrorAuth('RED'));
    await user.click(boton);
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos enviar un código nuevo/i);
  });
});

describe('LoginPage · estructura', () => {
  it('tiene un solo h1 y un enlace para volver al inicio', async () => {
    montar();
    await screen.findByRole('combobox', { name: /conjunto/i });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const enlace = screen.getByRole('link', { name: /volver al inicio/i });
    expect(enlace).toHaveAttribute('href', '/');
    expect(within(document.body).getByText(/ley 1581/i)).toBeInTheDocument();
  });
});

describe('LoginPage · ola final', () => {
  it('B8: el marcador del correo usa un dominio de ejemplo', async () => {
    montar();
    expect(await screen.findByPlaceholderText('nombre@ejemplo.com')).toBeInTheDocument();
  });

  it('B2: /login con sesión viva redirige al panel del conjunto activo', async () => {
    const sesion = await authReal.verificarCodigo({ conjuntoId: 'cj-parques', correo: CORREO, codigo: CODIGO_DEMO }).catch(async () => {
      await authReal.solicitarCodigo({ conjuntoId: 'cj-parques', correo: CORREO });
      return authReal.verificarCodigo({ conjuntoId: 'cj-parques', correo: CORREO, codigo: CODIGO_DEMO });
    });
    useSesion.getState().iniciar(sesion);
    const { router } = montar('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/parque-central-occidente'));
  });

  it('A2: al llegar la hora de desbloqueo se limpia el error y se ofrece pedir un código nuevo', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await bloquear(user);
    await user.click(screen.getByRole('button', { name: /cambiar correo/i }));
    const enviar = await screen.findByRole('button', { name: /enviar código/i });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    fireEvent.click(enviar);
    await screen.findByText(/volver a intentarlo a las/i);
    expect(screen.queryByRole('button', { name: /pedir un código nuevo/i })).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000 + 1000);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const pedir = screen.getByRole('button', { name: /pedir un código nuevo/i });
    expect(pedir).toBeEnabled();
    expect(campoCodigo()).toBeDisabled();
    fireEvent.click(pedir);
    await waitFor(() => expect(solicitarCodigo).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(campoCodigo()).toBeEnabled());
    expect(screen.queryByRole('button', { name: /pedir un código nuevo/i })).not.toBeInTheDocument();
  });

  it('A2: desmontar limpia el temporizador de desbloqueo', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await bloquear(user);
    await user.click(screen.getByRole('button', { name: /cambiar correo/i }));
    const enviar = await screen.findByRole('button', { name: /enviar código/i });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    fireEvent.click(enviar);
    await screen.findByText(/volver a intentarlo a las/i);
    const conPaso = vi.getTimerCount();
    cleanup();
    expect(vi.getTimerCount()).toBeLessThan(conPaso);
  });

  it('B3: "Cambiar correo" queda deshabilitado mientras se verifica', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    let liberar: () => void = () => {};
    verificarCodigo.mockImplementationOnce(
      (p) => new Promise((resolver, rechazar) => { liberar = () => authReal.verificarCodigo(p).then(resolver, rechazar); }),
    );
    await user.type(campoCodigo(), '000000');
    await waitFor(() => expect(screen.getByRole('button', { name: /cambiar correo/i })).toBeDisabled());
    liberar();
    await waitFor(() => expect(screen.getByRole('button', { name: /cambiar correo/i })).toBeEnabled());
  });

  it('B7: el error del código se enlaza al campo con aria-describedby', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.type(campoCodigo(), '000000');
    const alerta = await screen.findByRole('alert');
    expect(alerta.id).not.toBe('');
    expect(campoCodigo().getAttribute('aria-describedby') ?? '').toContain(alerta.id);
  });

  it('C2: tras un código erróneo el foco vuelve al campo, queda vacío y hay un solo mensaje', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.type(campoCodigo(), '000000');
    expect(await screen.findByText(/te quedan 4 intentos/i)).toBeInTheDocument();
    await waitFor(() => expect(campoCodigo()).toHaveFocus());
    expect(campoCodigo()).toHaveValue('');
    expect(screen.queryByText(/escribe los 6 dígitos/i)).not.toBeInTheDocument();
  });

  it('C2: enviar el campo vacío tras un error muestra solo el mensaje de validación', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await user.type(campoCodigo(), '000000');
    await screen.findByText(/te quedan 4 intentos/i);
    await user.click(screen.getByRole('button', { name: /verificar código/i }));
    expect(screen.queryByText(/te quedan 4 intentos/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/escribe los 6 dígitos|código incorrecto/i)).toHaveLength(1);
    expect(screen.getByText(/escribe los 6 dígitos/i)).toBeInTheDocument();
  });

  it('B1: un fallo al refrescar no tapa el selector si ya hay conjuntos cargados', async () => {
    const { qc } = montar();
    await screen.findByRole('combobox', { name: /conjunto/i });
    listar.mockRejectedValueOnce(new Error('sin red'));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['conjuntos'] });
    });
    expect(qc.getQueryState(['conjuntos'])?.status).toBe('error');
    // TanStack notifica a los componentes en el siguiente tick: sin esperar, la ausencia sería trivial.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByText(/no pudimos cargar los conjuntos/i)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /conjunto/i })).toBeInTheDocument();
  });

  it('C6: la hora de desbloqueo no se parte en líneas (espacios de no separación)', async () => {
    const { user } = montar();
    await pasarAlPaso2(user);
    await bloquear(user);
    const aviso = screen.getByRole('alert').textContent ?? '';
    const hora = /a las (.+)$/.exec(aviso)?.[1] ?? '';
    expect(hora).toMatch(/\d/);
    expect(hora).not.toMatch(/ /);
  });
});
