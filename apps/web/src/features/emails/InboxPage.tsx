import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function InboxPage() {
  const { solicitudes, sincronizarGmail } = useAppStore();
  const [syncing, setSyncing] = useState(false);
  const [selectedMail, setSelectedMail] = useState(solicitudes[0]);
  const [toastMsg, setToastMsg] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    const nueva = await sincronizarGmail();
    setSyncing(false);
    setSelectedMail(nueva);
    setToastMsg(`Nuevo correo sincronizado y preprocesado: ${nueva.radicado}`);
    setTimeout(() => setToastMsg(''), 4000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
            Bandeja de Correos Entrantes (Gmail Gateway)
          </h1>
          <p className="text-sm text-[#5C645C]">
            Cuenta vinculada: administracion@parquesoccidente.demo · Vinculación automática de residentes.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-[#789653] hover:bg-emerald-700 text-[#F7F6F0] font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando con Gmail...' : 'Sincronizar Gmail'}
        </button>
      </div>

      {toastMsg && (
        <div className="bg-emerald-100 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-sm font-medium">
          ✓ {toastMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#F7F6F0] dark:bg-slate-800 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto max-h-[580px]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-[#5C645C] sticky top-0">
                <tr>
                  <th className="p-3.5">Remitente / Vinculación</th>
                  <th className="p-3.5">Asunto</th>
                  <th className="p-3.5">Procesamiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5DDD0] dark:divide-slate-700">
                {solicitudes.slice(0, 25).map((sol) => (
                  <tr
                    key={sol.id}
                    onClick={() => setSelectedMail(sol)}
                    className={`cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-700/50 ${
                      selectedMail?.id === sol.id ? 'bg-blue-50 dark:bg-slate-700' : ''
                    }`}
                  >
                    <td className="p-3.5">
                      <div className="font-semibold text-[#292D29] dark:text-[#F7F6F0]">{sol.remitenteNombre}</div>
                      <div className="text-xs text-[#5C645C]">{sol.remitenteCorreo}</div>
                      {!sol.residenteId && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[11px] font-semibold">
                          Remitente no registrado
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <p className="font-medium line-clamp-1">{sol.asunto}</p>
                      <span className="text-xs text-[#5C645C]">{new Date(sol.fechaRecepcion).toLocaleDateString('es-CO')}</span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          sol.estadoProcesamientoCorreo === 'Procesado IA'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {sol.estadoProcesamientoCorreo}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedMail && (
          <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#355E3B]">{selectedMail.radicado}</span>
              <Link
                to={`/app/solicitudes/${selectedMail.id}`}
                className="text-xs text-[#355E3B] font-semibold hover:underline"
              >
                Abrir expediente completo →
              </Link>
            </div>
            <h2 className="font-bold text-base">{selectedMail.asunto}</h2>
            <div className="text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded-xl space-y-1">
              <div><strong>De:</strong> {selectedMail.remitenteNombre} ({selectedMail.remitenteCorreo})</div>
              <div><strong>Estado Solicitud:</strong> {selectedMail.estado}</div>
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-[#5C645C] block mb-1">
                Cuerpo Original Recibido:
              </span>
              <pre className="text-xs whitespace-pre-wrap bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-[#D5DDD0] dark:border-slate-700 font-sans">
                {selectedMail.cuerpoOriginal}
              </pre>
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-[#789653] block mb-1">
                Vista Previa Enmascarada Enviada a la IA (Ley 1581):
              </span>
              <pre className="text-xs whitespace-pre-wrap bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 font-sans">
                {selectedMail.cuerpoEnmascarado}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
