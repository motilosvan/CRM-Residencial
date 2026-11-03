import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CategoryBadge } from '../../components/ui/Badges';

export function CatalogsPage() {
  const {
    umbralConfianza,
    setUmbralConfianza,
    categoriasCatalogo,
    estadosCatalogo,
    palabrasClaveUrgencia,
    agregarPalabraUrgencia,
    eliminarPalabraUrgencia,
    solicitudes,
  } = useAppStore();
  const [nuevaPalabra, setNuevaPalabra] = useState('');

  const afectadasPorUmbral = solicitudes.filter(
    (s) => s.sugerencia.confianza < umbralConfianza
  ).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
        Catálogos y Configuración del Umbral de IA (RF15)
      </h1>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Umbral de Confianza del Modelo IA</h2>
            <p className="text-xs text-[#5C645C]">
              Si la confianza de Gemini es menor a este valor, se activa automáticamente el respaldo por reglas y se marca como "Pendiente de revisión".
            </p>
          </div>
          <span className="text-2xl font-bold text-[#355E3B]">
            {umbralConfianza.toFixed(2)} ({Math.round(umbralConfianza * 100)}%)
          </span>
        </div>

        <input
          type="range"
          min={0.4}
          max={0.95}
          step={0.05}
          value={umbralConfianza}
          onChange={(e) => setUmbralConfianza(Number(e.target.value))}
          className="w-full accent-[#355E3B]"
        />

        <div className="p-3 rounded-xl bg-blue-50 text-xs text-[#355E3B]">
          <strong>Vista previa del efecto en tiempo real:</strong> Con el umbral en{' '}
          <strong>{Math.round(umbralConfianza * 100)}%</strong>,{' '}
          <strong>{afectadasPorUmbral} de las {solicitudes.length} solicitudes</strong> pasan al clasificador de respaldo por reglas.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] space-y-3">
          <h2 className="font-bold text-base">Catálogo de Categorías Oficiales</h2>
          <div className="flex flex-wrap gap-2">
            {categoriasCatalogo.map((c) => (
              <CategoryBadge key={c} categoria={c} />
            ))}
          </div>
        </div>
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] space-y-3">
          <h2 className="font-bold text-base">Ciclo Oficial de Estados</h2>
          <div className="flex flex-wrap gap-2">
            {estadosCatalogo.map((est, i) => (
              <span key={est} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 font-semibold">
                {i + 1}. {est}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] space-y-4">
        <h2 className="font-bold text-base">
          Diccionario de Palabras Clave de Urgencia ({palabrasClaveUrgencia.length})
        </h2>
        <div className="flex gap-2">
          <input
            value={nuevaPalabra}
            onChange={(e) => setNuevaPalabra(e.target.value)}
            placeholder="Agregar palabra clave (ej. derrumbe)..."
            className="px-3 py-2 rounded-xl border text-xs flex-1"
          />
          <button
            onClick={() => {
              agregarPalabraUrgencia(nuevaPalabra);
              setNuevaPalabra('');
            }}
            className="bg-[#355E3B] text-[#F7F6F0] px-4 py-2 rounded-xl text-xs font-semibold"
          >
            Agregar Chip
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {palabrasClaveUrgencia.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-800 border border-red-200 text-xs font-medium"
            >
              {kw}
              <button onClick={() => eliminarPalabraUrgencia(kw)} className="hover:text-red-950">
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
