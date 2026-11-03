import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { maskPII } from '../../lib/piiMasker';
import { classifyByKeywords } from '../../lib/keywordClassifier';

export function AiLabPage() {
  const { palabrasClaveUrgencia, umbralConfianza, crearSolicitudDesdeLaboratorio } = useAppStore();
  const [textoPrueba, setTextoPrueba] = useState(
    'Urgente administración: hay una fuga de agua y cortocircuito en el sótano de la Torre 4. Mi celular es 311 456 7890 y mi cédula CC 79.654.321. Correo: residente.torre4@gmail.com'
  );
  const [simularCaida, setSimularCaida] = useState(false);
  const [creadaMsg, setCreadaMsg] = useState('');

  const piiResult = useMemo(() => maskPII(textoPrueba), [textoPrueba]);
  const rulesResult = useMemo(
    () => classifyByKeywords(piiResult.maskedText, palabrasClaveUrgencia),
    [piiResult.maskedText, palabrasClaveUrgencia]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#355E3B] dark:text-[#F7F6F0]">
            Laboratorio Interactivo del Pipeline IA y Contingencia
          </h1>
          <p className="text-sm text-[#5C645C]">
            Inspecciona las 6 etapas desde la recepción del correo hasta el respaldo automático por reglas.
          </p>
        </div>

        <button
          onClick={() => setSimularCaida((prev) => !prev)}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            simularCaida
              ? 'bg-red-600 text-[#F7F6F0]'
              : 'bg-amber-100 text-amber-900 border border-amber-300'
          }`}
        >
          {simularCaida ? '⚡ Caída de IA ACTIVADA (Usando Reglas)' : 'Simular Caída de la IA'}
        </button>
      </div>

      <div className="bg-[#F7F6F0] dark:bg-slate-800 p-5 rounded-2xl border border-[#D5DDD0] space-y-3">
        <label className="text-xs font-bold uppercase text-[#5C645C] block">
          Correo de Entrada para la Prueba:
        </label>
        <textarea
          rows={3}
          value={textoPrueba}
          onChange={(e) => setTextoPrueba(e.target.value)}
          className="w-full p-3 rounded-xl border text-sm"
        />
        <button
          onClick={() => {
            const nueva = crearSolicitudDesdeLaboratorio(
              'residente.prueba@example.com',
              'Caso generado desde Laboratorio IA',
              textoPrueba,
              simularCaida
            );
            setCreadaMsg(`Solicitud ${nueva.radicado} enviada a la Cola de Validación con origen: ${nueva.sugerencia.origen}.`);
          }}
          className="bg-[#355E3B] text-[#F7F6F0] px-4 py-2 rounded-xl text-xs font-semibold"
        >
          Enviar a la Cola de Validación Real
        </button>
        {creadaMsg && <p className="text-xs text-[#789653] font-bold mt-2">✓ {creadaMsg}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0]">
          <span className="text-xs font-bold text-[#355E3B]">PASO 1 · RECEPCIÓN</span>
          <p className="text-xs text-[#5C645C] mt-1">Lectura vía Gmail API y limpieza de firmas/citas.</p>
        </div>
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0]">
          <span className="text-xs font-bold text-[#789653]">PASO 2 · ENMASCARADO PII</span>
          <p className="text-xs font-mono mt-1 bg-emerald-50 p-2 rounded">{piiResult.maskedText}</p>
        </div>
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0]">
          <span className="text-xs font-bold text-[#355E3B]">PASO 3 · CONSULTA AL SERVICIO IA</span>
          <p className="text-xs mt-1">
            {simularCaida
              ? '❌ Timeout / Error 503 simulado en proveedor LLM.'
              : '✅ Respuesta JSON recibida en 410 ms (Confianza: 91%).'}
          </p>
        </div>
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0]">
          <span className="text-xs font-bold text-[#355E3B]">PASO 4 · VALIDACIÓN TÉCNICA</span>
          <p className="text-xs mt-1">
            Umbral activo: {Math.round(umbralConfianza * 100)}%.{' '}
            {simularCaida ? 'Falla validación -> Pasa al Paso 5.' : 'Supera umbral.'}
          </p>
        </div>
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0]">
          <span className="text-xs font-bold text-amber-600">PASO 5 · CONTINGENCIA POR REGLAS</span>
          <p className="text-xs mt-1">
            Resultado léxico: <strong>{rulesResult.categoria}</strong> / Prioridad{' '}
            <strong>{rulesResult.prioridad}</strong>.
          </p>
        </div>
        <div className="bg-[#F7F6F0] dark:bg-slate-800 p-4 rounded-2xl border border-[#D5DDD0]">
          <span className="text-xs font-bold text-purple-700">PASO 6 · PENDIENTE DE VALIDACIÓN</span>
          <p className="text-xs mt-1">
            Origen etiquetado como <strong>{simularCaida ? 'Reglas' : 'IA'}</strong>. Esperando aprobación del Administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
