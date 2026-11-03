import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, AlertTriangle } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useAppStore } from '../../store/useAppStore';
import { computeKpis } from '../../lib/kpiCalculator';
import { CategoriaSolicitud } from '../../types/domain';
import { CATEGORY_COLORS, CategoryBadge, PriorityBadge } from '../../components/ui/Badges';

export function DashboardPage() {
  const { solicitudes, usuarios } = useAppStore();
  const [periodoDias, setPeriodoDias] = useState<number>(60);

  const solicitudesFiltradas = useMemo(() => {
    const limite = new Date(2025, 4, 15).getTime() - periodoDias * 86400000;
    return solicitudes.filter((s) => new Date(s.fechaRecepcion).getTime() >= limite);
  }, [solicitudes, periodoDias]);

  const kpis = useMemo(() => computeKpis(solicitudesFiltradas), [solicitudesFiltradas]);

  const dataPorCategoria = useMemo(() => {
    const counts: Record<CategoriaSolicitud, number> = {
      Mantenimiento: 0,
      Administrativo: 0,
      Facturación: 0,
      Seguridad: 0,
    };
    solicitudesFiltradas.forEach((s) => {
      counts[s.categoria] += 1;
    });
    return (Object.keys(counts) as CategoriaSolicitud[]).map((name) => ({
      name,
      value: counts[name],
      color: CATEGORY_COLORS[name],
    }));
  }, [solicitudesFiltradas]);

  const dataPorEstado = useMemo(() => {
    const map: Record<string, number> = {};
    solicitudesFiltradas.forEach((s) => {
      map[s.estado] = (map[s.estado] || 0) + 1;
    });
    return Object.entries(map).map(([estado, total]) => ({ estado, total }));
  }, [solicitudesFiltradas]);

  const tendenciaData = useMemo(() => {
    const grouped: Record<string, number> = {};
    solicitudesFiltradas.forEach((sol) => {
      const fechaCorta = sol.fechaRecepcion.slice(5, 10);
      grouped[fechaCorta] = (grouped[fechaCorta] || 0) + 1;
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([fecha, recibidas]) => ({ fecha, recibidas }));
  }, [solicitudesFiltradas]);

  const cargaResponsablesData = useMemo(() => {
    return usuarios
      .filter((u) => u.rol === 'Soporte')
      .map((u) => {
        const asignadas = solicitudesFiltradas.filter(
          (s) => s.responsableId === u.id && s.estado !== 'Cerrada'
        ).length;
        return {
          responsable: u.nombre.split(' ').slice(0, 2).join(' '),
          asignadas,
        };
      });
  }, [solicitudesFiltradas, usuarios]);

  const urgentesAbiertasList = useMemo(
    () =>
      solicitudesFiltradas
        .filter((s) => s.prioridad === 'Alta' && s.estado !== 'Resuelta' && s.estado !== 'Cerrada')
        .slice(0, 6),
    [solicitudesFiltradas]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
            Dashboard de Gestión Operativa y CRM
          </h1>
          <p className="text-sm text-[#5C645C]">
            Indicadores calculados sobre {solicitudesFiltradas.length} solicitudes en el periodo seleccionado.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={periodoDias}
            onChange={(e) => setPeriodoDias(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-[#D5DDD0] text-xs font-semibold bg-[#F7F6F0] dark:bg-slate-800"
          >
            <option value={15}>Últimos 15 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={60}>Últimos 60 días</option>
          </select>
          <Link
            to="/app/validacion"
            className="bg-[#D6A64F] hover:bg-[#C2923A] text-[#292D29] font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Cola de Validación IA ({kpis.pendientesValidar})
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: 'Pendientes de Validar', val: kpis.pendientesValidar, color: 'text-amber-600' },
          { label: 'Urgentes Abiertas', val: kpis.urgentesAbiertas, color: 'text-red-600' },
          { label: 'Tiempo Prom. Respuesta', val: `${kpis.tiempoPromedioRespuestaHoras} h`, color: 'text-[#355E3B]' },
          { label: 'Resueltas / Cerradas', val: kpis.resueltasMes, color: 'text-[#789653]' },
          { label: '% IA Aprobadas sin Cambio', val: `${kpis.porcentajeAprobadasSinCambios}%`, color: 'text-purple-600' },
          { label: '% Prioridad Alta', val: `${kpis.porcentajeUrgentesAlta}%`, color: 'text-rose-600' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 shadow-sm">
            <span className="text-xs text-[#5C645C] dark:text-slate-400 block">{kpi.label}</span>
            <span className={`text-2xl font-bold mt-1 block ${kpi.color}`}>{kpi.val}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] dark:border-slate-700">
          <h2 className="font-bold text-base mb-4">Solicitudes por Categoría (Dona)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dataPorCategoria} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} label>
                  {dataPorCategoria.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] dark:border-slate-700">
          <h2 className="font-bold text-base mb-4">Solicitudes por Estado (Barras)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataPorEstado}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="estado" tick={{ fontSize: 11 }} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="total" fill="#355E3B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] dark:border-slate-700">
          <h2 className="font-bold text-base mb-4">Tendencia Diaria/Semanal (Línea)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendenciaData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Line type="monotone" dataKey="recibidas" stroke="#789653" strokeWidth={3} dot={{ r: 4, fill: '#355E3B' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] dark:border-slate-700">
          <h2 className="font-bold text-base mb-4">Carga por Responsable (Barras Horizontales)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cargaResponsablesData} layout="vertical" margin={{ left: 25 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="responsable" tick={{ fontSize: 11 }} width={110} />
                <RechartsTooltip />
                <Bar dataKey="asignadas" fill="#D6A64F" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] dark:border-slate-700">
        <h2 className="font-bold text-base mb-3 flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-5 h-5" /> Urgentes que Requieren Atención
        </h2>
        <div className="divide-y divide-[#D5DDD0] dark:divide-slate-700">
          {urgentesAbiertasList.map((sol) => {
            const resp = usuarios.find((u) => u.id === sol.responsableId);
            return (
              <div key={sol.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#355E3B] dark:text-blue-300">{sol.radicado}</span>
                    <CategoryBadge categoria={sol.categoria} />
                    <PriorityBadge prioridad={sol.prioridad} />
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{sol.estado}</span>
                  </div>
                  <p className="text-sm font-semibold mt-1">{sol.asunto}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#5C645C]">
                    Responsable: <strong>{resp ? resp.nombre : 'Sin asignar'}</strong>
                  </span>
                  <Link
                    to={`/app/solicitudes/${sol.id}`}
                    className="text-xs bg-[#355E3B] text-[#F7F6F0] px-3 py-1.5 rounded-lg font-medium"
                  >
                    Gestionar
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
