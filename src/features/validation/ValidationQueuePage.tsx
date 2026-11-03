import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, Check, CheckCircle2, Cpu } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { CategoriaSolicitud, PrioridadSolicitud } from '../../types/domain';
import { CategoryBadge, PriorityBadge } from '../../components/ui/Badges';

export function ValidationQueuePage() {
  const {
    solicitudes,
    umbralConfianza,
    validarSugerencia,
    validarMasivamenteAltaConfianza,
  } = useAppStore();

  const pendientes = useMemo(
    () => solicitudes.filter((s) => s.estado === 'Pendiente de validación'),
    [solicitudes]
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [verEnmascarado, setVerEnmascarado] = useState(true);
  const [catEdit, setCatEdit] = useState<CategoriaSolicitud>('Mantenimiento');
  const [prioEdit, setPrioEdit] = useState<PrioridadSolicitud>('Alta');
  const [feedback, setFeedback] = useState('');

  const actual = pendientes[selectedIndex] ?? pendientes[0];

  useEffect(() => {
    if (actual) {
      setCatEdit(actual.sugerencia.categoria);
      setPrioEdit(actual.sugerencia.prioridad);
      setModoEdicion(false);
    }
  }, [actual]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!actual || ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        validarSugerencia(actual.id, actual.sugerencia.categoria, actual.sugerencia.prioridad);
        setFeedback(`Solicitud ${actual.radicado} aprobada sin cambios.`);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setModoEdicion((prev) => !prev);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, pendientes.length - 1)));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actual, pendientes.length, validarSugerencia]);

  const handleBulkApprove = () => {
    const count = validarMasivamenteAltaConfianza();
    setFeedback(`Se aprobaron masivamente ${count} sugerencias con confianza superior al umbral (${Math.round(umbralConfianza * 100)}%).`);
    setSelectedIndex(0);
  };

  if (!actual) {
    return (
      <div className="bg-[#F7F6F0] dark:bg-slate-800 p-12 rounded-2xl text-center border border-[#D5DDD0]">
        <CheckCircle2 className="w-12 h-12 text-[#789653] mx-auto mb-3" />
        <h2 className="text-xl font-bold">¡Cola de validación al día!</h2>
        <p className="text-sm text-[#5C645C] mt-1">
          Todas las sugerencias de IA han sido validadas por la Administración.
        </p>
      </div>
    );
  }

  const superaUmbral = actual.sugerencia.confianza >= umbralConfianza;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0] flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#D6A64F]" />
            Cola de Validación Humana de IA ({pendientes.length} pendientes)
          </h1>
          <p className="text-xs text-[#5C645C]">
            Atajos de teclado: <kbd className="px-1.5 py-0.5 bg-slate-200 rounded">A</kbd> Aprobar ·{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded">M</kbd> Modificar ·{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded">↑/↓</kbd> Navegar · Umbral activo:{' '}
            <strong>{Math.round(umbralConfianza * 100)}%</strong>
          </p>
        </div>

        <button
          onClick={handleBulkApprove}
          className="bg-[#355E3B] hover:bg-[#284A2E] text-[#F7F6F0] text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2"
        >
          <Check className="w-4 h-4" />
          Validación Masiva (Alta Confianza ≥ {Math.round(umbralConfianza * 100)}%)
        </button>
      </div>

      {feedback && (
        <div className="bg-emerald-100 border border-emerald-300 text-emerald-950 px-4 py-2 rounded-xl text-xs font-semibold">
          ✓ {feedback}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {pendientes.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => setSelectedIndex(idx)}
            className={`px-3 py-2 rounded-xl border text-left shrink-0 transition ${
              idx === selectedIndex
                ? 'bg-[#355E3B] text-[#F7F6F0] border-[#355E3B]'
                : 'bg-[#F7F6F0] dark:bg-slate-800 border-[#D5DDD0] text-xs'
            }`}
          >
            <div className="font-mono text-[11px] font-bold flex items-center gap-1.5">
              {item.radicado}
              {item.sugerencia.origen === 'Reglas' && (
                <span className="bg-amber-400 text-slate-950 px-1.5 rounded text-[10px]">Reglas</span>
              )}
            </div>
            <div className="text-xs truncate max-w-[160px]">{item.asunto}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-[#355E3B]">{actual.radicado}</span>
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
                Texto Enmascarado (PII)
              </button>
            </div>
          </div>

          <h2 className="text-lg font-bold">{actual.asunto}</h2>
          <div className="text-xs text-[#5C645C] space-y-1">
            <div><strong>Remitente:</strong> {actual.remitenteNombre} ({actual.remitenteCorreo})</div>
            <div><strong>Fecha recepción:</strong> {new Date(actual.fechaRecepcion).toLocaleString('es-CO')}</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-[#D5DDD0] dark:border-slate-700">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C645C] block mb-2">
              {verEnmascarado
                ? '🔒 Vista protegida enviada al modelo LLM (Datos personales ocultos)'
                : '📄 Correo íntegro original recibido en Gmail'}
            </span>
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {verEnmascarado ? actual.cuerpoEnmascarado : actual.cuerpoOriginal}
            </pre>
          </div>
        </div>

        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-6 rounded-2xl border border-[#D5DDD0] dark:border-slate-700 space-y-5">
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                actual.sugerencia.origen === 'IA'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Origen: {actual.sugerencia.origen === 'IA' ? 'Modelo IA Gemini' : 'Respaldo por Reglas (Pendiente de revisión)'}
            </span>

            <span className="text-xs font-semibold">
              Confianza: <strong>{Math.round(actual.sugerencia.confianza * 100)}%</strong>
            </span>
          </div>

          <div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  superaUmbral ? 'bg-[#789653]' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.round(actual.sugerencia.confianza * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-[#5C645C] mt-1">
              {superaUmbral
                ? `Supera el umbral configurado (${Math.round(umbralConfianza * 100)}%).`
                : `Inferior al umbral (${Math.round(umbralConfianza * 100)}%) — Activado clasificador por palabras clave.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl">
            <div>
              <span className="text-xs text-[#5C645C] block mb-1">Categoría Sugerida</span>
              <CategoryBadge categoria={actual.sugerencia.categoria} />
            </div>
            <div>
              <span className="text-xs text-[#5C645C] block mb-1">Prioridad Sugerida</span>
              <PriorityBadge prioridad={actual.sugerencia.prioridad} />
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-[#5C645C] uppercase block mb-1">
              Resumen Ejecutivo Generado (1-2 líneas):
            </span>
            <p className="text-sm font-medium bg-blue-50/60 dark:bg-slate-900 p-3 rounded-xl border border-blue-200 dark:border-slate-700">
              {actual.sugerencia.resumen}
            </p>
          </div>

          <div>
            <span className="text-xs font-bold text-[#5C645C] uppercase block mb-1">
              Justificación del Motor:
            </span>
            <p className="text-xs text-[#5C645C]">{actual.sugerencia.justificacion}</p>
          </div>

          {modoEdicion && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-slate-900 border border-amber-300 space-y-3">
              <h3 className="text-xs font-bold uppercase text-amber-900">
                Corregir clasificación antes de validar
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold block mb-1">Categoría Definitiva</label>
                  <select
                    value={catEdit}
                    onChange={(e) => setCatEdit(e.target.value as CategoriaSolicitud)}
                    className="w-full p-2 rounded-lg border text-sm bg-[#F7F6F0] dark:bg-slate-800"
                  >
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Facturación">Facturación</option>
                    <option value="Seguridad">Seguridad</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Prioridad Definitiva</label>
                  <select
                    value={prioEdit}
                    onChange={(e) => setPrioEdit(e.target.value as PrioridadSolicitud)}
                    className="w-full p-2 rounded-lg border text-sm bg-[#F7F6F0] dark:bg-slate-800"
                  >
                    <option value="Alta">Alta</option>
                    <option value="Media">Media</option>
                    <option value="Baja">Baja</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            {!modoEdicion ? (
              <>
                <button
                  onClick={() => {
                    validarSugerencia(actual.id, actual.sugerencia.categoria, actual.sugerencia.prioridad);
                    setFeedback(`Solicitud ${actual.radicado} validada exitosamente.`);
                  }}
                  className="flex-1 bg-[#789653] hover:bg-emerald-700 text-[#F7F6F0] font-semibold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" /> Aprobar sugerencia (A)
                </button>
                <button
                  onClick={() => setModoEdicion(true)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold py-2.5 px-4 rounded-xl text-sm"
                >
                  Modificar y aprobar (M)
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    validarSugerencia(actual.id, catEdit, prioEdit);
                    setFeedback(`Solicitud ${actual.radicado} modificada y validada.`);
                  }}
                  className="flex-1 bg-[#355E3B] text-[#F7F6F0] font-semibold py-2.5 px-4 rounded-xl text-sm"
                >
                  Confirmar cambios y validar
                </button>
                <button
                  onClick={() => setModoEdicion(false)}
                  className="px-4 py-2.5 rounded-xl border text-sm"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
