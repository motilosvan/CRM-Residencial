import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import GuardaConjunto from '@/features/app/GuardaConjunto';
import GuardaRol from '@/features/app/GuardaRol';
import InicioPage from '@/features/app/InicioPage';
import ProximamentePage from '@/features/app/ProximamentePage';
import UsuariosPage from '@/features/app/UsuariosPage';
import LoginPage from '@/features/auth/LoginPage';
import Pagina403 from '@/features/errores/Pagina403';
import Pagina404 from '@/features/errores/Pagina404';
import LandingPage from '@/features/landing/LandingPage';

const SECCIONES_PROXIMAS = [
  'bandeja',
  'solicitudes',
  'validacion',
  'residentes',
  'catalogos',
  'identidad',
  'reportes',
  'auditoria',
  'laboratorio-ia',
];

export const rutas: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/app/:conjunto',
    element: <GuardaConjunto />,
    children: [
      { index: true, element: <Navigate replace to="inicio" /> },
      { path: 'inicio', element: <InicioPage /> },
      {
        path: 'usuarios',
        element: (
          <GuardaRol roles={['ADMIN']}>
            <UsuariosPage />
          </GuardaRol>
        ),
      },
      ...SECCIONES_PROXIMAS.map((ruta) => ({ path: ruta, element: <ProximamentePage /> })),
    ],
  },
  { path: '/403', element: <Pagina403 /> },
  { path: '*', element: <Pagina404 /> },
];

export const router = createBrowserRouter(rutas);
