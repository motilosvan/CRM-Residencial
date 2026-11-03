import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export function NotFound404Page() {
  return (
    <div className="min-h-screen bg-[#F7F6F0] dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-[#F7F6F0] dark:bg-slate-800 p-10 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 max-w-md w-full text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-[#789653]">
          Error 404 · Ruta no existente
        </span>
        <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0] mt-1">
          Página no encontrada
        </h1>
        <p className="text-sm text-[#5C645C] mt-2">
          La dirección que intentas consultar no existe dentro del sistema SOC-CRM del Conjunto Residencial Parques del Occidente.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="px-4 py-2.5 rounded-xl border border-[#D5DDD0] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Ir al Sitio Público
          </Link>
          <Link
            to="/app/dashboard"
            className="px-4 py-2.5 rounded-xl bg-[#355E3B] text-[#F7F6F0] text-xs font-semibold"
          >
            Ir al Panel Administrativo
          </Link>
        </div>
      </div>
    </div>
  );
}
