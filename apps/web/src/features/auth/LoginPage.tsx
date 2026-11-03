import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { loginSchema } from '../../lib/schemas';

export function LoginPage() {
  const { loginAs } = useAppStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('administracion@parquesoccidente.demo');
  const [password, setPassword] = useState('Admin2025*');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleQuickLogin = (userId: string) => {
    setLoading(true);
    setTimeout(() => {
      loginAs(userId);
      setLoading(false);
      navigate('/app/dashboard');
    }, 350);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({
      correo: email,
      password,
      recordarSesion: remember,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setError('');
    if (email.toLowerCase().startsWith('admin')) {
      handleQuickLogin('usr-admin-1');
    } else {
      handleQuickLogin('usr-sop-1');
    }
  };

  return (
    <div className="min-h-screen bg-[#355E3B] flex items-center justify-center p-4">
      <div className="bg-[#F7F6F0] rounded-2xl max-w-md w-full p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#789653] text-[#F7F6F0] font-bold flex items-center justify-center">
            PO
          </div>
          <div>
            <h1 className="font-bold text-lg text-[#292D29]">SOC-CRM Residencial</h1>
            <p className="text-xs text-[#5C645C]">Acceso exclusivo para Administración y Soporte</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-[#355E3B] mb-5">
          <strong>Nota de negocio:</strong> Los residentes no requieren cuenta ni tienen acceso a este panel; sus solicitudes ingresan automáticamente por correo.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#292D29] mb-1">Correo Institucional</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5DDD0] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#292D29] mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5DDD0] text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#5C645C]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded"
            />
            Recordar sesión en este equipo
          </label>
          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#355E3B] hover:bg-[#284A2E] text-[#F7F6F0] font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
          >
            {loading ? 'Verificando credenciales...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#D5DDD0]">
          <span className="block text-xs font-semibold text-[#5C645C] mb-2">
            Botones de Acceso Rápido (Demo Evaluador):
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => handleQuickLogin('usr-admin-1')}
              className="bg-[#E8EDE5] hover:bg-emerald-200 text-[#789653] font-semibold py-2 px-3 rounded-xl text-xs"
            >
              Entrar como Administrador
            </button>
            <button
              onClick={() => handleQuickLogin('usr-sop-1')}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold py-2 px-3 rounded-xl text-xs"
            >
              Entrar como Soporte
            </button>
          </div>
        </div>

        <Link to="/" className="block text-center text-xs text-[#5C645C] hover:underline mt-5">
          ← Volver al sitio público del conjunto
        </Link>
      </div>
    </div>
  );
}
