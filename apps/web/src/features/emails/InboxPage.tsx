import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw, Search } from 'lucide-react';
import { CategoryBadge, PriorityBadge } from '../../components/ui/Badges';
import { categoriaPanel, etiquetaEstado, fechaHora, haceCuanto, prioridadPanel } from '../../lib/etiquetas';
import { maskPII } from '../../lib/piiMasker';
import { api, ErrorApi, type CorreoBuzon, type DetalleCorreo, type EstadoGateway } from '../../services/api';

const POR_PAGINA = 50;
const REFRESCO_MS = 30_000;

/**
 * Buzón unificado: los correos que el Email Gateway leyó de Gmail (y cualquier otra fuente de ingesta),
 * tal como quedaron en la BD, con el residente vinculado y la solicitud que generaron.
 * Datos reales vía la API (`npm run api`); se refresca solo cada 30 s.
 */
export function InboxPage() {
  const [pagina, setPagina] = useState<{ total: number; correos: CorreoBuzon[] } | null>(null);
  const [gateway, setGateway] = useState<EstadoGateway | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleCorreo | null>(null);
  const peticion = useRef<AbortController | null>(null);

  const cargar = useCallback(async () => {
    peticion.current?.abort();
    const ctrl = new AbortController();
    peticion.current = ctrl;
    setCargando(true);
    try {
      const [p, g] = await Promise.all([
        api.correos({ q: q || undefined, limite: POR_PAGINA, desplazamiento: desde }, ctrl.signal),
        api.estadoGateway(ctrl.signal),
      ]);
      setPagina(p);
      setGateway(g);
      setError(null);
      setSeleccion((actual) => actual ?? p.correos[0]?.id ?? null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof ErrorApi ? e : new ErrorApi(0, String(e)));
    } finally {
      if (peticion.current === ctrl) setCargando(false);
    }
  }, [q, desde]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => void cargar(), REFRESCO_MS);
    return () => {
      clearInterval(t);
      peticion.current?.abort();
    };
  }, [cargar]);

  // La búsqueda se aplica 300 ms después de dejar de escribir y vuelve a la primera página.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(busqueda.trim());
      setDesde(0);
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    if (seleccion === null) {
      setDetalle(null);
      return;
    }
    const ctrl = new AbortController();
    api.correo(seleccion, ctrl.signal).then(setDetalle).catch((e: Error) => {
      if (e.name !== 'AbortError') setDetalle(null);
    });
    return () => ctrl.abort();
  }, [seleccion]);

  const total = pagina?.total ?? 0;
  const cuenta = gateway?.cuentas[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">Buzón unificado (Gmail Gateway)</h1>
          <p className="text-sm text-[#5C645C]">
            {cuenta ? (
              <>
                Cuenta: <strong>{gateway!.cuentas.map((c) => c.cuenta).join(', ')}</strong> · última lectura{' '}
                {haceCuanto(cuenta.actualizadoEn)} · {gateway!.totalCorreos} correos en total
              </>
            ) : gateway ? (
              <>El gateway aún no ha leído ninguna cuenta. Ejecútelo con <code>npm run gateway</code>.</>
            ) : (
              'Conectando con la API…'
            )}
          </p>
        </div>
        <button
          onClick={() => void cargar()}
          disabled={cargando}
          className="bg-[#789653] hover:bg-emerald-700 text-[#F7F6F0] font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-sm flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error.sinConexion ? (
            <span>
              No se pudo conectar con la API. En la raíz del proyecto ejecute <code>npm run api</code> (y{' '}
              <code>npm run gateway</code> para leer Gmail).
            </span>
          ) : (
            <span>La API respondió con un error: {error.message}</span>
          )}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#5C645C]" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por asunto, remitente o residente"
          maxLength={200}
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D5DDD0] dark:border-slate-700 bg-[#F7F6F0] dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#789653]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#F7F6F0] dark:bg-slate-800 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 overflow-hidden">
          {pagina && pagina.correos.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#5C645C] space-y-2">
              <Inbox className="w-8 h-8 mx-auto opacity-60" />
              <p>{q ? 'Ningún correo coincide con la búsqueda.' : 'Aún no hay correos en el buzón.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[580px]">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-[#5C645C] sticky top-0">
                  <tr>
                    <th className="p-3.5">Remitente / Vinculación</th>
                    <th className="p-3.5">Asunto</th>
                    <th className="p-3.5">Solicitud</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5DDD0] dark:divide-slate-700">
                  {(pagina?.correos ?? []).map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSeleccion(c.id)}
                      className={`cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-700/50 ${
                        seleccion === c.id ? 'bg-blue-50 dark:bg-slate-700' : ''
                      }`}
                    >
                      <td className="p-3.5 align-top">
                        <div className="font-semibold text-[#292D29] dark:text-[#F7F6F0]">{c.residente ?? c.remitente}</div>
                        {c.residente && <div className="text-xs text-[#5C645C]">{c.remitente} · {c.unidad}</div>}
                        {!c.idResidente && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[11px] font-semibold">
                            Remitente no registrado
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 align-top">
                        <p className="font-medium line-clamp-1">{c.asunto || '(sin asunto)'}</p>
                        <p className="text-xs text-[#5C645C] line-clamp-1">{c.extracto}</p>
                        <span className="text-xs text-[#5C645C]">{fechaHora(c.fechaRecepcion)}</span>
                      </td>
                      <td className="p-3.5 align-top space-y-1">
                        <div className="font-mono text-xs font-bold text-[#355E3B]">{c.codigo ?? '—'}</div>
                        <div className="text-xs">{etiquetaEstado(c.estado)}</div>
                        <EtiquetaCategoria categoria={c.categoria} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > POR_PAGINA && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#D5DDD0] dark:border-slate-700 text-xs text-[#5C645C]">
              <span>
                {desde + 1}–{Math.min(desde + POR_PAGINA, total)} de {total}
              </span>
              <div className="flex gap-1">
                <button
                  aria-label="Página anterior"
                  disabled={desde === 0}
                  onClick={() => setDesde((d) => Math.max(0, d - POR_PAGINA))}
                  className="p-1.5 rounded-lg hover:bg-black/5 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  aria-label="Página siguiente"
                  disabled={desde + POR_PAGINA >= total}
                  onClick={() => setDesde((d) => d + POR_PAGINA)}
                  className="p-1.5 rounded-lg hover:bg-black/5 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {detalle && <PanelDetalle correo={detalle} />}
      </div>
    </div>
  );
}

function EtiquetaCategoria({ categoria }: { categoria: string | null }) {
  const c = categoriaPanel(categoria);
  if (c) return <CategoryBadge categoria={c} />;
  if (!categoria) return null;
  return (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">Sin clasificar</span>
  );
}

function PanelDetalle({ correo }: { correo: DetalleCorreo }) {
  const prioridad = prioridadPanel(correo.prioridad);
  const enmascarado = maskPII(correo.cuerpo).maskedText;
  return (
    <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 space-y-4 self-start">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-[#355E3B]">{correo.codigo ?? 'Sin solicitud'}</span>
        <span className="text-xs text-[#5C645C]">{fechaHora(correo.fechaRecepcion)}</span>
      </div>
      <h2 className="font-bold text-base break-words">{correo.asunto || '(sin asunto)'}</h2>
      <div className="text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded-xl space-y-1">
        <div>
          <strong>De:</strong> {correo.remitente}
        </div>
        <div>
          <strong>Residente:</strong> {correo.residente ? `${correo.residente} (${correo.unidad})` : 'No registrado'}
        </div>
        <div>
          <strong>Estado:</strong> {etiquetaEstado(correo.estado)}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <EtiquetaCategoria categoria={correo.categoria} />
          {prioridad && <PriorityBadge prioridad={prioridad} />}
        </div>
      </div>
      <div>
        <span className="text-xs font-bold uppercase text-[#5C645C] block mb-1">Cuerpo original recibido:</span>
        <pre className="text-xs whitespace-pre-wrap break-words max-h-72 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-[#D5DDD0] dark:border-slate-700 font-sans">
          {correo.cuerpo || '(vacío)'}
        </pre>
      </div>
      <div>
        <span className="text-xs font-bold uppercase text-[#789653] block mb-1">
          Vista previa enmascarada (Ley 1581):
        </span>
        <pre className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 font-sans">
          {enmascarado || '(vacío)'}
        </pre>
      </div>
    </div>
  );
}
