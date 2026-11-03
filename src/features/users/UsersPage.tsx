import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { RolUsuario } from '../../types/domain';

export function UsersPage() {
  const { usuarios, guardarUsuario, toggleEstadoUsuario } = useAppStore();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [cargo, setCargo] = useState('');
  const [rol, setRol] = useState<RolUsuario>('Soporte');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !correo) return;
    const initials = nombre
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    guardarUsuario({ nombre, correo, cargo: cargo || 'Auxiliar de Soporte', rol, activo: true, avatar: initials });
    setNombre('');
    setCorreo('');
    setCargo('');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
        Usuarios del Sistema y Control de Roles (RBAC)
      </h1>

      <form onSubmit={handleAdd} className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0] grid grid-cols-1 sm:grid-cols-5 gap-3">
        <input
          placeholder="Nombre del funcionario"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="p-2 rounded-xl border text-xs"
        />
        <input
          placeholder="correo@parquesoccidente.demo"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className="p-2 rounded-xl border text-xs"
        />
        <input
          placeholder="Cargo (ej. Supervisor)"
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          className="p-2 rounded-xl border text-xs"
        />
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value as RolUsuario)}
          className="p-2 rounded-xl border text-xs"
        >
          <option value="Soporte">Rol: Encargado de Soporte</option>
          <option value="Administrador">Rol: Administrador</option>
        </select>
        <button type="submit" className="bg-[#355E3B] text-[#F7F6F0] rounded-xl text-xs font-semibold px-3 py-2">
          + Crear Usuario
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {usuarios.map((u) => (
          <div key={u.id} className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#355E3B] text-[#F7F6F0] font-bold flex items-center justify-center">
                {u.avatar}
              </div>
              <div>
                <h3 className="font-bold text-sm">{u.nombre}</h3>
                <p className="text-xs text-[#5C645C]">{u.cargo}</p>
              </div>
            </div>
            <div className="text-xs space-y-1">
              <div><strong>Correo:</strong> {u.correo}</div>
              <div><strong>Rol:</strong> <span className="font-bold text-[#355E3B]">{u.rol}</span></div>
              <div><strong>Última sesión:</strong> {new Date(u.ultimaSesion).toLocaleString('es-CO')}</div>
            </div>
            <button
              onClick={() => toggleEstadoUsuario(u.id)}
              className={`w-full py-1.5 rounded-xl text-xs font-semibold ${
                u.activo ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800'
              }`}
            >
              {u.activo ? 'Usuario Activo (Desactivar)' : 'Usuario Inactivo'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
