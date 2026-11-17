import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Cpu, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { PriorityBadge } from '../../components/ui/Badges';
import { fechaHora, prioridadPanel } from '../../lib/etiquetas';
import { api, ErrorApi, type DetalleCorreo, type PaginaSugerencias, type SugerenciaPendiente } from '../../services/api';
import { EtiquetaCategoria } from '../emails/InboxPage';

const REFRESCO_MS = 30_000;

/**
 * Cola de validación: las sugerencias reales del worker de IA que esperan revisión humana, frente a la
 * clasificación por reglas que hoy tiene cada solicitud. De momento es de consulta: aprobar cambia la
 * solicitud (T4) y debe quedar a nombre de quien lo hizo, así que necesita el login (S4-01).
 */
export function ValidationQueuePage() {
  const [pagina, setPagina] = useState<PaginaSugerencias | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleCorreo | null>(null);
  const [verEnmascarado, setVerEnmascarado] = useState(true);
  const peticion = useRef<AbortController | null>(null);

  const cargar = useCallback(async () => {
    peticion.current?.abort();
    const ctrl = new AbortController();
    peticion.current = ctrl;
    setCargando(true);
    try {
      setPagina(await api.sugerencias(ctrl.signal));
      setError(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof ErrorApi ? e : new ErrorApi(0, String(e)));
    } finally {
      if (peticion.current === ctrl) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => void cargar(), REFRESCO_MS);
    return () => {
      clearInterval(t);
      peticion.current?.abort();
    };
  }, [cargar]);

  const pendientes = pagina?.sugerencias ?? [];
  const actual = pendientes.find((s) => s.id === seleccion) ?? pendientes[0];
  const idActual = actual?.id;

  useEffect(() => {
    if (idActual === undefined) {
      setDetalle(null);
      return;
    }
    const ctrl = new AbortController();
    api.correo(idActual, ctrl.signal).then(setDetalle).catch((e: Error) => {
      if (e.name !== 'AbortError') setDetalle(null);
    });
    return () => ctrl.abort();
  }, [idActual]);

  useEffect(() => {
    const mover = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!delta || !pendientes.length) return;
      e.preventDefault();
      const indice = pendientes.findIndex((s) => s.id === idActual);
      const siguiente = pendientes[Math.min(pendientes.length - 1, Math.max(0, indice + delta))];
      if (siguiente) setSeleccion(siguiente.id);
    };
    window.addEventListener('keydown', mover);
    return () => window.removeEventListener('keydown', mover);
  }, [pendientes, idActual]);

  const avisoError = error && (
    <div className="bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-sm flex gap-2 items-start">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      {error.sinConexion ? (
        <span>
          No se pudo conectar con la API. En la raíz del proyecto ejecute <code>npm run api</code>.
        </span>
      ) : error.status === 404 ? (
        <span>
          La API en ejecución es una versión anterior. Reiníciela con <code>npm run api</code>.
        </span>
      ) : (
        <span>La API respondió con un error: {error.message}</span>
      )}
    </div>
  );

  if (!actual) {
    return (
      <div className="space-y-4">
        {avisoError}
        {!error && pagina && (
          <div className="bg-[#F7F6F0] dark:bg-slate-800 p-12 rounded-2xl text-center border border-[#D5DDD0]">
            <CheckCircle2 className="w-12 h-12 text-[#789653] mx-auto mb-3" />
            <h2 className="text-xl font-bold">No hay sugerencias pendientes</h2>
            <p className="text-sm text-[#5C645C] mt-1">
              Aquí aparecen los correos nuevos que el modelo de IA ya analizó. Si esperaba alguno, revise que{' '}
              <code>npm run gateway</code> y <code>npm run ia</code> estén corriendo.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0] flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#D6A64F]" />
            Cola de Validación Humana de IA ({pagina?.total ?? 0} pendientes)
          </h1>
          <p className="text-xs text-[#5C645C]">
            Más urgentes primero · <kbd className="px-1.5 py-0.5 bg-slate-200 rounded">↑/↓</kbd> Navegar
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

      {avisoError}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {pendientes.map((item) => (
          <button
            key={item.id}
            onClick={() => setSeleccion(item.id)}
            className={`px-3 py-2 rounded-xl border text-left shrink-0 transition ${
              item.id === actual.id
                ? 'bg-[#355E3B] text-[#F7F6F0] border-[#355E3B]'
                : 'bg-[#F7F6F0] dark:bg-slate-800 border-[#D5DDD0] text-xs'
            }`}
          >
            <div className="font-mono text-[11px] font-bold">{item.codigo}</div>
            <div className="text-xs truncate max-w-[160px]">{item.asunto || '(sin asunto)'}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-[#355E3B]">{actual.codigo}</span>
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 text-xs">
              <button
                onClick={() => setVerEnmascarado(false)}
                className={`px-3 py-1 rounded-lg font-medium ${!verEnmascarado ? 'bg-[#F7F6F0] shadow text-[#355E3B]' : ''}`}
              >
                Texto Original
              </button>
              <button
                onClick={() => setVerEnmascarado(true)}
                className={`px-3 py-1 rounded-lg font-medium ${verEnmascarado ? 'bg-[#789653] text-[#F7F6F0] shadow' : ''}`}
              >
                Texto Enmascarado
              </button>
            </div>
          </div>

          <h2 className="text-lg font-bold break-words">{actual.asunto || '(sin asunto)'}</h2>
          <div className="text-xs text-[#5C645C] space-y-1">
            <div>
              <strong>Remitente:</strong> {actual.remitente}
            </div>
            <div>
              <strong>Residente:</strong> {actual.residente ? `${actual.residente} (${actual.unidad})` : 'No registrado'}
            </div>
            <div>
              <strong>Fecha recepción:</strong> {fechaHora(actual.fechaRecepcion)}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-[#D5DDD0] dark:border-slate-700">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C645C] block mb-2">
              {verEnmascarado ? 'Texto que recibió el modelo de IA' : 'Correo original recibido en Gmail'}
            </span>
            <pre className="text-sm whitespace-pre-wrap break-words font-sans leading-relaxed max-h-96 overflow-y-auto">
              {detalle?.id === actual.id
                ? (verEnmascarado ? detalle.cuerpoEnmascarado : detalle.cuerpo) || '(vacío)'
                : 'Cargando…'}
            </pre>
          </div>
        </div>

        <PanelSugerencia sugerencia={actual} />
      </div>
    </div>
  );
}

function Clasificacion({ titulo, categoria, prioridad }: { titulo: string; categoria: string; prioridad: string }) {
  const p = prioridadPanel(prioridad);
  return (
    <div className="flex-1 min-w-[140px]">
      <span className="text-xs text-[#5C645C] block mb-1.5">{titulo}</span>
      <div className="flex flex-wrap gap-1.5">
        <EtiquetaCategoria categoria={categoria} />
        {p && <PriorityBadge prioridad={p} />}
      </div>
    </div>
  );
}

function PanelSugerencia({ sugerencia: s }: { sugerencia: SugerenciaPendiente }) {
  const coincide = s.categoria === s.categoriaSugerida && s.prioridad === s.prioridadSugerida;
  return (
    <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 space-y-5 self-start">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 break-all">
        <Cpu className="w-3.5 h-3.5 shrink-0" />
        Modelo: {s.modelo}
      </span>

      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Clasificacion titulo="Clasificación actual (reglas)" categoria={s.categoria} prioridad={s.prioridad} />
          <ArrowRight className="w-4 h-4 text-[#5C645C] shrink-0" />
          <Clasificacion titulo="Sugerencia de la IA" categoria={s.categoriaSugerida} prioridad={s.prioridadSugerida} />
        </div>
        <p className="text-[11px] text-[#5C645C]">
          {coincide ? 'La IA coincide con las reglas.' : 'La IA propone un cambio: la solicitud sigue con la clasificación actual.'}
        </p>
      </div>

      <div>
        <span className="text-xs font-bold text-[#5C645C] uppercase block mb-1">Resumen generado:</span>
        <p className="text-sm font-medium bg-blue-50/60 dark:bg-slate-900 p-3 rounded-xl border border-blue-200 dark:border-slate-700 break-words">
          {s.resumen}
        </p>
      </div>

      {s.justificacion && (
        <div>
          <span className="text-xs font-bold text-[#5C645C] uppercase block mb-1">Justificación del modelo:</span>
          <p className="text-xs text-[#5C645C] break-words">{s.justificacion}</p>
        </div>
      )}

      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap gap-3">
          <button
            disabled
            className="flex-1 bg-[#789653] text-[#F7F6F0] font-semibold py-2.5 px-4 rounded-xl text-sm opacity-50 cursor-not-allowed"
          >
            Aprobar sugerencia
          </button>
          <button
            disabled
            className="flex-1 bg-amber-500 text-slate-950 font-semibold py-2.5 px-4 rounded-xl text-sm opacity-50 cursor-not-allowed"
          >
            Modificar y aprobar
          </button>
        </div>
        <p className="text-[11px] text-[#5C645C] flex items-start gap-1.5">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" />
          Aprobar se habilitará con el inicio de sesión: el cambio debe quedar a nombre de quien lo hizo.
        </p>
      </div>
    </div>
  );
}
