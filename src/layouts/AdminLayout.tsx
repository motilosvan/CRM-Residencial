import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Mail,
  Sparkles,
  FileText,
  Users,
  UserCheck,
  Sliders,
  Download,
  History,
  FlaskConical,
  Lock,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Forbidden403Page } from '../features/auth/Forbidden403Page';

export function AdminProtectedLayout({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { currentUser, darkMode, toggleDarkMode, loginAs, solicitudes } = useAppStore();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const urgentesSinValidar = solicitudes.filter(
    (s) => s.estado === 'Pendiente de validación' && s.prioridad === 'Alta'
  ).length;

  const menu = [
    { to: '/app/dashboard', label: 'Dashboard', icon: BarChart3, adminOnly: false },
    { to: '/app/bandeja', label: 'Bandeja Gmail', icon: Mail, adminOnly: false },
    { to: '/app/validacion', label: 'Cola Validación IA', icon: Sparkles, adminOnly: true },
    { to: '/app/solicitudes', label: 'Solicitudes', icon: FileText, adminOnly: false },
    { to: '/app/residentes', label: 'Residentes', icon: Users, adminOnly: true },
    { to: '/app/usuarios', label: 'Usuarios y Roles', icon: UserCheck, adminOnly: true },
    { to: '/app/catalogos', label: 'Catálogos y Umbral', icon: Sliders, adminOnly: true },
    { to: '/app/reportes', label: 'Reportes', icon: Download, adminOnly: true },
    { to: '/app/auditoria', label: 'Auditoría', icon: History, adminOnly: true },
    { to: '/app/laboratorio-ia', label: 'Laboratorio IA', icon: FlaskConical, adminOnly: false },
  ];

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-[#F7F6F0] dark:bg-slate-950 text-[#292D29] dark:text-slate-100 flex">
        <aside
          className={`${
            collapsed ? 'w-20' : 'w-64'
          } bg-[#355E3B] text-[#F7F6F0] flex flex-col shrink-0 transition-all duration-200`}
        >
          <div className="p-4 border-b border-blue-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#789653] font-bold flex items-center justify-center shrink-0">
                PO
              </div>
              {!collapsed && (
                <div>
                  <span className="font-bold text-sm block leading-none">SOC-CRM Admin</span>
                  <span className="text-[11px] text-blue-200">Parques del Occidente</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setCollapsed((p) => !p)}
              className="p-1 rounded-lg hover:bg-white/10"
              aria-label="Colapsar menú"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          <nav className="p-3 space-y-1 flex-1">
            {menu.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                    active ? 'bg-[#D6A64F] text-[#292D29] font-bold' : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    {!collapsed && item.label}
                  </span>
                  {!collapsed && item.adminOnly && currentUser.rol === 'Soporte' && (
                    <Lock className="w-3.5 h-3.5 opacity-60" />
                  )}
                </Link>
              );
            })}
          </nav>

          {!collapsed && (
            <div className="p-4 border-t border-blue-800 space-y-2 text-xs">
              <div className="text-blue-200">Cambiar rol en vivo (Demo):</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => loginAs('usr-admin-1')}
                  className={`py-1.5 rounded-lg font-semibold ${
                    currentUser.rol === 'Administrador' ? 'bg-[#789653] text-[#F7F6F0]' : 'bg-white/10'
                  }`}
                >
                  Admin
                </button>
                <button
                  onClick={() => loginAs('usr-sop-1')}
                  className={`py-1.5 rounded-lg font-semibold ${
                    currentUser.rol === 'Soporte' ? 'bg-[#D6A64F] text-slate-950' : 'bg-white/10'
                  }`}
                >
                  Soporte
                </button>
              </div>
              <Link to="/" className="block text-center text-blue-200 hover:underline pt-2">
                ← Ir al Sitio Público
              </Link>
            </div>
          )}
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 bg-[#F7F6F0] dark:bg-slate-900 border-b border-[#D5DDD0] dark:border-slate-800 px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#5C645C]">
                Panel / <strong className="text-[#355E3B] dark:text-[#F7F6F0]">{location.pathname.replace('/app/', '')}</strong>
              </span>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-red-100 text-red-800">
                🔔 {urgentesSinValidar} urgentes sin validar
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={toggleDarkMode} className="p-2 rounded-xl border border-[#D5DDD0]" aria-label="Cambiar tema">
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <div className="text-right">
                <div className="text-xs font-bold">{currentUser.nombre}</div>
                <div className="text-[11px] text-[#789653] font-semibold">Rol: {currentUser.rol}</div>
              </div>
            </div>
          </header>

          <main className="p-6 flex-1 overflow-y-auto">
            {adminOnly && currentUser.rol !== 'Administrador' ? <Forbidden403Page /> : children}
          </main>
        </div>
      </div>
    </div>
  );
}
