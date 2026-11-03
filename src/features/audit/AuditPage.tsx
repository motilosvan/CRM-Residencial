import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

export function AuditPage() {
  const { solicitudes } = useAppStore();
  const [actorFilter, setActorFilter] = useState('');

  const eventos = useMemo(
    () =>
      solicitudes
        .flatMap((s) => s.historial.map((h) => ({ ...h, radicado: s.radicado })))
        .filter((ev) =>
          actorFilter
            ? ev.actor.toLowerCase().includes(actorFilter.toLowerCase()) ||
              ev.radicado.toLowerCase().includes(actorFilter.toLowerCase())
            : true
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [solicitudes, actorFilter]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
          Auditoría y Trazabilidad Global (RNF08)
        </h1>
        <input
          placeholder="Filtrar por usuario, motor IA o radicado..."
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-[#D5DDD0] text-xs w-72"
        />
      </div>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 rounded-2xl border border-[#D5DDD0] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 uppercase text-[#5C645C]">
            <tr>
              <th className="p-3">Fecha y Hora</th>
              <th className="p-3">Radicado</th>
              <th className="p-3">Usuario / Componente</th>
              <th className="p-3">Acción</th>
              <th className="p-3">Valor Anterior → Valor Nuevo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D5DDD0]">
            {eventos.slice(0, 40).map((ev) => (
              <tr key={ev.id}>
                <td className="p-3">{new Date(ev.fecha).toLocaleString('es-CO')}</td>
                <td className="p-3 font-mono font-bold text-[#355E3B]">{ev.radicado}</td>
                <td className="p-3 font-semibold">{ev.actor}</td>
                <td className="p-3">{ev.descripcion}</td>
                <td className="p-3">
                  {ev.valorAnterior ? (
                    <span className="bg-slate-100 px-2 py-0.5 rounded">
                      {ev.valorAnterior} → <strong>{ev.valorNuevo}</strong>
                    </span>
                  ) : (
                    'Registro inicial'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
