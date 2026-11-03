import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, List, LayoutGrid, FilterX } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { EstadoSolicitud } from '../../types/domain';
import { CategoryBadge, PriorityBadge } from '../../components/ui/Badges';

export function RequestsPage() {
  const { solicitudes, usuarios, currentUser, cambiarEstadoSolicitud } = useAppStore();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('TODAS');
  const [prioFilter, setPrioFilter] = useState<string>('TODAS');
  const [estFilter, setEstFilter] = useState<string>('TODOS');
  const [vistaRapida, setVistaRapida] = useState<'TODAS' | 'MIS' | 'URGENTES' | 'SIN_ASIGNAR'>('TODAS');
  const [modoVista, setModoVista] = useState<'TABLA' | 'KANBAN'>('TABLA');

  const filtradas = useMemo(() => {
    return solicitudes.filter((s) => {
      if (vistaRapida === 'MIS' && s.responsableId !== currentUser?.id) return false;
      if (vistaRapida === 'URGENTES' && s.prioridad !== 'Alta') return false;
      if (vistaRapida === 'SIN_ASIGNAR' && s.responsableId !== null) return false;
      if (catFilter !== 'TODAS' && s.categoria !== catFilter) return false;
      if (prioFilter !== 'TODAS' && s.prioridad !== prioFilter) return false;
      if (estFilter !== 'TODOS' && s.estado !== estFilter) return false;
      if (
        search &&
        !`${s.radicado} ${s.asunto} ${s.remitenteNombre}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [solicitudes, currentUser, vistaRapida, catFilter, prioFilter, estFilter, search]);

  const estadosKanban: EstadoSolicitud[] = [
    'Pendiente de validación',
    'Validada',
    'Asignada',
    'En proceso',
    'Resuelta',
    'Cerrada',
  ];

  const limpiarFiltros = () => {
    setSearch('');
    setCatFilter('TODAS');
    setPrioFilter('TODAS');
    setEstFilter('TODOS');
    setVistaRapida('TODAS');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
            Gestión de Solicitudes ({filtradas.length})
          </h1>
          <p className="text-sm text-[#5C645C]">
            Ninguna solicitud puede asignarse mientras permanezca en estado "Pendiente de validación".
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-[#F7F6F0] dark:bg-slate-800 p-1 border border-[#D5DDD0]">
          <button
            onClick={() => setModoVista('TABLA')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              modoVista === 'TABLA' ? 'bg-[#355E3B] text-[#F7F6F0]' : ''
            }`}
          >
            <List className="w-3.5 h-3.5" /> Tabla
          </button>
          <button
            onClick={() => setModoVista('KANBAN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              modoVista === 'KANBAN' ? 'bg-[#355E3B] text-[#F7F6F0]' : ''
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Kanban
          </button>
        </div>
      </div>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'TODAS', label: 'Todas las solicitudes' },
            { id: 'MIS', label: 'Mis solicitudes asignadas' },
            { id: 'URGENTES', label: '🔥 Solo Urgentes (Alta)' },
            { id: 'SIN_ASIGNAR', label: 'Sin responsable asignado' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setVistaRapida(tab.id as typeof vistaRapida)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                vistaRapida === tab.id
                  ? 'bg-[#355E3B] text-[#F7F6F0]'
                  : 'bg-slate-100 dark:bg-slate-700 text-[#5C645C]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar radicado, asunto, residente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D5DDD0] text-xs"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="p-2 rounded-xl border border-[#D5DDD0] text-xs"
          >
            <option value="TODAS">Todas las categorías</option>
            <option value="Mantenimiento">Mantenimiento</option>
            <option value="Administrativo">Administrativo</option>
            <option value="Facturación">Facturación</option>
            <option value="Seguridad">Seguridad</option>
          </select>
          <select
            value={prioFilter}
            onChange={(e) => setPrioFilter(e.target.value)}
            className="p-2 rounded-xl border border-[#D5DDD0] text-xs"
          >
            <option value="TODAS">Todas las prioridades</option>
            <option value="Alta">Prioridad Alta</option>
            <option value="Media">Prioridad Media</option>
            <option value="Baja">Prioridad Baja</option>
          </select>
          <select
            value={estFilter}
            onChange={(e) => setEstFilter(e.target.value)}
            className="p-2 rounded-xl border border-[#D5DDD0] text-xs"
          >
            <option value="TODOS">Todos los estados</option>
            {estadosKanban.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-12 rounded-2xl border border-[#D5DDD0] text-center space-y-3">
          <FilterX className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="font-bold text-base">Sin resultados para los filtros aplicados</h3>
          <p className="text-xs text-[#5C645C]">Intenta ajustar los criterios de búsqueda o restablecer los filtros.</p>
          <button
            onClick={limpiarFiltros}
            className="bg-[#355E3B] text-[#F7F6F0] px-4 py-2 rounded-xl text-xs font-semibold"
          >
            Limpiar todos los filtros
          </button>
        </div>
      ) : modoVista === 'TABLA' ? (
        <div className="bg-[#F7F6F0] dark:bg-slate-800 rounded-2xl border border-[#D5DDD0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-[#5C645C]">
                <tr>
                  <th className="p-3.5">Radicado</th>
                  <th className="p-3.5">Asunto y Residente</th>
                  <th className="p-3.5">Categoría / Prioridad</th>
                  <th className="p-3.5">Estado</th>
                  <th className="p-3.5">Responsable</th>
                  <th className="p-3.5">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5DDD0] dark:divide-slate-700">
                {filtradas.slice(0, 30).map((sol) => {
                  const resp = usuarios.find((u) => u.id === sol.responsableId);
                  const noValidada = sol.estado === 'Pendiente de validación';
                  return (
                    <tr
                      key={sol.id}
                      className={
                        sol.prioridad === 'Alta' && sol.estado !== 'Cerrada'
                          ? 'bg-red-50/40 dark:bg-red-950/10'
                          : ''
                      }
                    >
                      <td className="p-3.5 font-mono text-xs font-bold text-[#355E3B]">
                        {sol.radicado}
                        {sol.pendienteRevision && (
                          <span className="block text-[10px] text-amber-700 font-sans">
                            ⚠ Pendiente revisión (Reglas)
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold line-clamp-1">{sol.asunto}</div>
                        <div className="text-xs text-[#5C645C]">{sol.remitenteNombre}</div>
                      </td>
                      <td className="p-3.5 space-x-1.5">
                        <CategoryBadge categoria={sol.categoria} />
                        <PriorityBadge prioridad={sol.prioridad} />
                      </td>
                      <td className="p-3.5">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700">
                          {sol.estado}
                        </span>
                      </td>
                      <td className="p-3.5 text-xs">
                        {resp ? resp.nombre : <span className="text-slate-400">Sin asignar</span>}
                      </td>
                      <td className="p-3.5 flex items-center gap-2">
                        <Link
                          to={`/app/solicitudes/${sol.id}`}
                          className="text-xs bg-[#355E3B] text-[#F7F6F0] px-3 py-1.5 rounded-lg font-medium"
                        >
                          Detalle
                        </Link>
                        {noValidada && (
                          <button
                            disabled
                            title="Debe ser validada primero por el Administrador en la Cola de IA antes de asignar"
                            className="text-xs bg-slate-200 text-slate-500 px-2.5 py-1.5 rounded-lg cursor-not-allowed"
                          >
                            Asignar 🔒
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {estadosKanban.map((colEstado) => {
            const items = filtradas.filter((s) => s.estado === colEstado);
            return (
              <div key={colEstado} className="bg-slate-100 dark:bg-slate-800/80 p-3 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase text-[#355E3B] dark:text-blue-300">
                    {colEstado}
                  </h3>
                  <span className="text-xs font-bold bg-[#F7F6F0] dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {items.slice(0, 12).map((card) => (
                    <div
                      key={card.id}
                      className="bg-[#F7F6F0] dark:bg-slate-900 p-3 rounded-xl border border-[#D5DDD0] shadow-sm space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[11px] font-bold">{card.radicado}</span>
                        <PriorityBadge prioridad={card.prioridad} />
                      </div>
                      <p className="text-xs font-semibold line-clamp-2">{card.asunto}</p>
                      <div className="flex justify-between items-center pt-1">
                        <Link
                          to={`/app/solicitudes/${card.id}`}
                          className="text-[11px] text-[#355E3B] font-semibold hover:underline"
                        >
                          Abrir
                        </Link>
                        {card.estado !== 'Pendiente de validación' && card.estado !== 'Cerrada' && (
                          <button
                            onClick={() =>
                              cambiarEstadoSolicitud(
                                card.id,
                                card.estado === 'Validada'
                                  ? 'En proceso'
                                  : card.estado === 'Asignada'
                                  ? 'En proceso'
                                  : 'Resuelta',
                                'Avance rápido desde tablero Kanban'
                              )
                            }
                            className="text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-semibold"
                          >
                            Avanzar →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
