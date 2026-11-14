import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService, ConjuntosService } from '@/services/contratos';
import { CODIGO_DEMO } from '@/services/mock/datos';
import { crearAuthMock } from '@/services/mock/authMock';
import { crearConjuntosMock } from '@/services/mock/conjuntosMock';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };
let authReal: AuthService;
let conjuntosReal: ConjuntosService;
const solicitarCodigo = vi.fn((p: Parameters<AuthService['solicitarCodigo']>[0]) => authReal.solicitarCodigo(p));
const verificarCodigo = vi.fn((p: Parameters<AuthService['verificarCodigo']>[0]) => authReal.verificarCodigo(p));
const listar = vi.fn((s?: AbortSignal) => conjuntosReal.listar(s));

vi.mock('@/services', () => ({
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
  return { router, user: userEvent.setup() };
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function elegirConjunto(user: Usuario, nombre: string) {
  const combo = await screen.findByRole('combobox', { name: /conjunto/i });
  await waitFor(() => expect(combo).toBeEnabled());
  await user.click(combo);
  await user.click(await screen.findByRole('option', { name: nombre }));
}

async function pasarAlPaso2(user: Usuario, correo = CORREO) {
  await elegirConjunto(user, 'Parques del Occidente');
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
    solicitarCodigo.mockRejectedValueOnce(new (await import('@/services/contratos')).ErrorAuth('RED'));
    const { user } = montar();
    await elegirConjunto(user, 'Parques del Occidente');
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
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/app\/parques-occidente/));
    expect(verificarCodigo).toHaveBeenCalledTimes(1);
    expect(verificarCodigo.mock.calls[0][0].codigo).toBe(CODIGO_DEMO);
    expect(useSesion.getState().sesion?.usuario.correo).toBe(CORREO);
    expect(usePreferencias.getState().ultimoConjuntoSlug).toBe('parques-occidente');
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
    expect(combo).toHaveTextContent('Parques del Occidente');
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
