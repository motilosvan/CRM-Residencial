import React, { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Mail, Send } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { EstadoSolicitud } from '../../types/domain';
import { CategoryBadge, PriorityBadge } from '../../components/ui/Badges';

export function RequestDetailPage() {
  const { id } = useParams();
  const {
    solicitudes,
    usuarios,
    currentUser,
    asignarResponsable,
    cambiarEstadoSolicitud,
    enviarRespuestaResidente,
  } = useAppStore();

  const sol = solicitudes.find((s) => s.id === id) ?? solicitudes[0];
  const [nuevoEstado, setNuevoEstado] = useState<EstadoSolicitud>(sol.estado);
  const [observacion, setObservacion] = useState('');
  const [cuerpoCorreo, setCuerpoCorreo] = useState(
    `Cordial saludo ${sol.remitenteNombre},\n\nLa Administración del Conjunto Residencial Parques del Occidente le informa que su solicitud con radicado ${sol.radicado} se encuentra en atención por nuestro equipo.\n\nAtentamente,\nAdministración Parques del Occidente`
  );
  const [msgExito, setMsgExito] = useState('');

  const cargaPorResponsable = useMemo(() => {
    const map: Record<string, number> = {};
    solicitudes.forEach((s) => {
      if (s.responsableId && s.estado !== 'Cerrada' && s.estado !== 'Resuelta') {
        map[s.responsableId] = (map[s.responsableId] || 0) + 1;
      }
    });
    return map;
  }, [solicitudes]);

  const noValidada = sol.estado === 'Pendiente de validación';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/app/solicitudes" className="text-xs text-[#355E3B] font-semibold hover:underline">
            ← Volver al listado de solicitudes
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">{sol.radicado}</h1>
            <CategoryBadge categoria={sol.categoria} />
            <PriorityBadge prioridad={sol.prioridad} />
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-200 dark:bg-slate-700">
              {sol.estado}
            </span>
          </div>
        </div>
        <div className="text-xs bg-[#F7F6F0] dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-[#D5DDD0]">
          SLA Objetivo: <strong>{sol.slaHoras} horas</strong> · Origen clasificación:{' '}
          <strong>{sol.sugerencia.origen} ({Math.round(sol.sugerencia.confianza * 100)}%)</strong>
        </div>
      </div>

      {msgExito && (
        <div className="bg-emerald-100 border border-emerald-300 text-emerald-950 px-4 py-2.5 rounded-xl text-xs font-semibold">
          ✓ {msgExito}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] space-y-3">
            <h2 className="font-bold text-lg">{sol.asunto}</h2>
            <p className="text-xs text-[#5C645C]">
              Remitente: <strong>{sol.remitenteNombre}</strong> ({sol.remitenteCorreo})
            </p>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm whitespace-pre-wrap">
              {sol.cuerpoOriginal}
            </div>
          </div>

          <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#355E3B]" /> Responder al Residente por Correo
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setCuerpoCorreo(
                      `Estimado(a) ${sol.remitenteNombre},\n\nNuestro personal técnico ya realizó la inspección y solución de su solicitud ${sol.radicado}. Damos por resuelto el caso.\n\nCordialmente,\nAdministración Parques del Occidente`
                    )
                  }
                  className="text-xs bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg"
                >
                  Plantilla: Caso Resuelto
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={cuerpoCorreo}
              onChange={(e) => setCuerpoCorreo(e.target.value)}
              className="w-full p-3 rounded-xl border border-[#D5DDD0] text-sm"
            />
            <button
              onClick={() => {
                enviarRespuestaResidente(sol.id, cuerpoCorreo);
                setMsgExito('Respuesta enviada al correo del residente y registrada en la línea de tiempo.');
              }}
              className="bg-[#355E3B] hover:bg-[#284A2E] text-[#F7F6F0] font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" /> Enviar correo al residente
            </button>
          </div>

          <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0]">
            <h3 className="font-bold text-base mb-4">Línea de Tiempo y Trazabilidad Completa</h3>
            <div className="space-y-4 border-l-2 border-[#355E3B] pl-4">
              {sol.historial.map((evt) => (
                <div key={evt.id} className="text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#355E3B] dark:text-blue-300">{evt.actor}</span>
                    <span className="text-[#5C645C]">{new Date(evt.fecha).toLocaleString('es-CO')}</span>
                  </div>
                  <p className="text-[#292D29] dark:text-slate-200">{evt.descripcion}</p>
                  {evt.valorAnterior && evt.valorNuevo && (
                    <div className="inline-block bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded text-[11px]">
                      {evt.valorAnterior} → <strong>{evt.valorNuevo}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] space-y-3">
            <h3 className="font-bold text-base">Asignación de Responsable</h3>
            {noValidada ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900">
                🔒 Esta solicitud aún no ha sido validada por el Administrador. Valídala primero en la Cola de IA.
              </div>
            ) : currentUser?.rol !== 'Administrador' ? (
              <div className="p-3 rounded-xl bg-slate-100 text-xs text-[#5C645C]">
                Solo el rol <strong>Administrador</strong> puede reasignar responsables.
              </div>
            ) : (
              <div className="space-y-2">
                {usuarios
                  .filter((u) => u.rol === 'Soporte')
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        asignarResponsable(sol.id, u.id);
                        setMsgExito(`Responsable asignado: ${u.nombre}`);
                      }}
                      className={`w-full p-2.5 rounded-xl border text-left text-xs flex items-center justify-between ${
                        sol.responsableId === u.id
                          ? 'border-[#789653] bg-[#E8EDE5] font-bold'
                          : 'border-[#D5DDD0]'
                      }`}
                    >
                      <div>
                        <div>{u.nombre}</div>
                        <div className="text-[11px] text-[#5C645C]">{u.cargo}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#F7F6F0] text-[11px]">
                        {cargaPorResponsable[u.id] || 0} activas
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] space-y-3">
            <h3 className="font-bold text-base">Actualizar Estado Operativo</h3>
            <select
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value as EstadoSolicitud)}
              disabled={noValidada}
              className="w-full p-2.5 rounded-xl border border-[#D5DDD0] text-sm"
            >
              <option value="Validada">Validada</option>
              <option value="Asignada">Asignada</option>
              <option value="En proceso">En proceso</option>
              <option value="Resuelta">Resuelta</option>
              <option value="Cerrada">Cerrada</option>
            </select>
            <textarea
              rows={3}
              placeholder="Observación técnica o administrativa obligatoria para auditoría..."
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#D5DDD0] text-xs"
            />
            <button
              disabled={noValidada}
              onClick={() => {
                cambiarEstadoSolicitud(sol.id, nuevoEstado, observacion);
                setObservacion('');
                setMsgExito(`Estado actualizado a ${nuevoEstado}.`);
              }}
              className="w-full bg-[#789653] hover:bg-emerald-700 text-[#F7F6F0] font-semibold py-2.5 rounded-xl text-xs disabled:opacity-40"
            >
              Guardar Cambio de Estado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
