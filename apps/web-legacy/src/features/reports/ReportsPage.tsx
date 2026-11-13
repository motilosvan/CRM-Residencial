import React from 'react';
import { Download, Printer } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function ReportsPage() {
  const { solicitudes } = useAppStore();

  const exportarCSV = () => {
    const headers = ['Radicado', 'Fecha', 'Remitente', 'Categoria', 'Prioridad', 'Estado', 'Origen_IA_Reglas', 'Confianza'];
    const rows = solicitudes.map((s) => [
      s.radicado,
      s.fechaRecepcion.slice(0, 10),
      `"${s.remitenteNombre}"`,
      s.categoria,
      s.prioridad,
      s.estado,
      s.sugerencia.origen,
      s.sugerencia.confianza,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-soc-crm-parques-occidente.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
            Reportes Ejecutivos de Gestión (RF16)
          </h1>
          <p className="text-sm text-[#5C645C]">
            Consolidado exportable a CSV real y formato de impresión PDF para el Consejo de Administración.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportarCSV}
            className="bg-[#789653] text-[#F7F6F0] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="bg-[#355E3B] text-[#F7F6F0] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Exportar / Imprimir PDF
          </button>
        </div>
      </div>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 rounded-2xl border border-[#D5DDD0] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 uppercase text-[#5C645C]">
            <tr>
              <th className="p-3">Radicado</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Categoría</th>
              <th className="p-3">Prioridad</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Origen Clasificación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D5DDD0]">
            {solicitudes.slice(0, 30).map((s) => (
              <tr key={s.id}>
                <td className="p-3 font-mono font-bold">{s.radicado}</td>
                <td className="p-3">{s.fechaRecepcion.slice(0, 10)}</td>
                <td className="p-3">{s.categoria}</td>
                <td className="p-3">{s.prioridad}</td>
                <td className="p-3">{s.estado}</td>
                <td className="p-3">{s.sugerencia.origen} ({Math.round(s.sugerencia.confianza * 100)}%)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
