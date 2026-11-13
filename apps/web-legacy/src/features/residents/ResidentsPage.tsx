import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Eye } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Residente } from '../../types/domain';

export function ResidentsPage() {
  const { residentes, solicitudes, guardarResidente, toggleEstadoResidente } = useAppStore();
  const [nombre, setNombre] = useState('');
  const [torre, setTorre] = useState('Torre 1');
  const [apartamento, setApartamento] = useState('101');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [selectedResidente, setSelectedResidente] = useState<Residente | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !correo) return;
    guardarResidente({ nombre, torre, apartamento, correo, telefono, activo: true });
    setNombre('');
    setCorreo('');
    setTelefono('');
  };

  const historialResidente = selectedResidente
    ? solicitudes.filter((s) => s.residenteId === selectedResidente.id)
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
        Directorio de Residentes ({residentes.length})
      </h1>

      <form onSubmit={handleAdd} className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0] grid grid-cols-1 sm:grid-cols-6 gap-3">
        <input
          placeholder="Nombre completo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="p-2 rounded-xl border text-xs sm:col-span-2"
        />
        <input
          placeholder="Torre (ej. Torre 2)"
          value={torre}
          onChange={(e) => setTorre(e.target.value)}
          className="p-2 rounded-xl border text-xs"
        />
        <input
          placeholder="Apto (ej. 302)"
          value={apartamento}
          onChange={(e) => setApartamento(e.target.value)}
          className="p-2 rounded-xl border text-xs"
        />
        <input
          placeholder="correo@ejemplo.com"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className="p-2 rounded-xl border text-xs"
        />
        <button type="submit" className="bg-[#355E3B] text-[#F7F6F0] rounded-xl text-xs font-semibold px-3 py-2">
          + Registrar Residente
        </button>
      </form>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 rounded-2xl border border-[#D5DDD0] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[#5C645C]">
            <tr>
              <th className="p-3">Nombre</th>
              <th className="p-3">Unidad</th>
              <th className="p-3">Correo / Teléfono</th>
              <th className="p-3">Historial</th>
              <th className="p-3">Estado (Desactivar, no eliminar)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D5DDD0]">
            {residentes.map((r) => {
              const count = solicitudes.filter((s) => s.residenteId === r.id).length;
              return (
                <tr key={r.id}>
                  <td className="p-3 font-semibold">{r.nombre}</td>
                  <td className="p-3 text-xs">{r.torre} - Apto {r.apartamento}</td>
                  <td className="p-3 text-xs">{r.correo} · {r.telefono}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setSelectedResidente(r)}
                      className="text-xs font-semibold text-[#355E3B] hover:underline inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver {count} solicitudes
                    </button>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => toggleEstadoResidente(r.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        r.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {r.activo ? 'Activo (Clic para desactivar)' : 'Inactivo'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedResidente && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#F7F6F0] dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg text-[#355E3B]">
                Historial de Solicitudes · {selectedResidente.nombre}
              </h3>
              <button onClick={() => setSelectedResidente(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#5C645C]">
              {selectedResidente.torre} Apto {selectedResidente.apartamento} · {selectedResidente.correo}
            </p>
            <div className="divide-y divide-[#D5DDD0] max-h-72 overflow-y-auto">
              {historialResidente.length === 0 ? (
                <p className="text-xs text-[#5C645C] py-4">Sin solicitudes registradas.</p>
              ) : (
                historialResidente.map((s) => (
                  <div key={s.id} className="py-2.5 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-mono font-bold text-[#355E3B]">{s.radicado}</span>
                      <p className="font-medium">{s.asunto}</p>
                    </div>
                    <Link
                      to={`/app/solicitudes/${s.id}`}
                      className="text-[#789653] font-semibold hover:underline"
                    >
                      Abrir →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
