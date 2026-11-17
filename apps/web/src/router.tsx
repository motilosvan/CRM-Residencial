import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import BandejaPage from '@/features/app/BandejaPage';
import CatalogosPage from '@/features/app/CatalogosPage';
import GuardaConjunto from '@/features/app/GuardaConjunto';
import GuardaRol from '@/features/app/GuardaRol';
import IdentidadPage from '@/features/app/IdentidadPage';
import InicioPage from '@/features/app/InicioPage';
import ProximamentePage from '@/features/app/ProximamentePage';
import ResidentesPage from '@/features/app/ResidentesPage';
import SolicitudesPage from '@/features/app/SolicitudesPage';
import UsuariosPage from '@/features/app/UsuariosPage';
import ValidacionPage from '@/features/app/ValidacionPage';
import LoginPage from '@/features/auth/LoginPage';
import Pagina403 from '@/features/errores/Pagina403';
import Pagina404 from '@/features/errores/Pagina404';
import LandingPage from '@/features/landing/LandingPage';

const SECCIONES_PROXIMAS = [
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
      { path: 'bandeja', element: <BandejaPage /> },
      { path: 'solicitudes', element: <SolicitudesPage /> },
      {
        path: 'validacion',
        element: (
          <GuardaRol roles={['ADMIN']}>
            <ValidacionPage />
          </GuardaRol>
        ),
      },
      {
        path: 'residentes',
        element: (
          <GuardaRol roles={['ADMIN']}>
            <ResidentesPage />
          </GuardaRol>
        ),
      },
      {
        path: 'usuarios',
        element: (
          <GuardaRol roles={['ADMIN']}>
            <UsuariosPage />
          </GuardaRol>
        ),
      },
      {
        path: 'catalogos',
        element: (
          <GuardaRol roles={['ADMIN']}>
            <CatalogosPage />
          </GuardaRol>
        ),
      },
      {
        path: 'identidad',
        element: (
          <GuardaRol roles={['ADMIN']}>
            <IdentidadPage />
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
