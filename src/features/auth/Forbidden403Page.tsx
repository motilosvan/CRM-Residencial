import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export function Forbidden403Page() {
  return (
    <div className="bg-[#F7F6F0] dark:bg-slate-800 p-12 rounded-2xl border border-red-200 text-center max-w-lg mx-auto my-12">
      <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3" />
      <h1 className="text-2xl font-bold text-[#292D29] dark:text-[#F7F6F0]">
        Error 403 · Acceso Restringido por Rol
      </h1>
      <p className="text-sm text-[#5C645C] mt-2">
        Tu perfil actual (<strong>Encargado de Soporte</strong>) no tiene permisos para validar sugerencias de IA, asignar responsables ni administrar catálogos, reportes o usuarios.
      </p>
      <Link
        to="/app/solicitudes"
        className="mt-5 inline-block bg-[#355E3B] text-[#F7F6F0] px-4 py-2 rounded-xl text-xs font-semibold"
      >
        Ir a Mis Solicitudes Asignadas
      </Link>
    </div>
  );
}
