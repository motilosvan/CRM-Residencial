import { create } from 'zustand';
import {
  CategoriaSolicitud,
  EstadoSolicitud,
  EventoHistorial,
  PrioridadSolicitud,
  Residente,
  Solicitud,
  UsuarioSistema,
} from '../types/domain';
import { RESIDENTES_SEED, SOLICITUDES_SEED, USUARIOS_SEED } from '../data/seed';
import { DEFAULT_URGENCY_KEYWORDS, classifyByKeywords } from '../lib/keywordClassifier';
import { maskPII } from '../lib/piiMasker';

interface AppState {
  currentUser: UsuarioSistema | null;
  darkMode: boolean;
  umbralConfianza: number;
  categoriasCatalogo: CategoriaSolicitud[];
  estadosCatalogo: EstadoSolicitud[];
  palabrasClaveUrgencia: string[];
  solicitudes: Solicitud[];
  residentes: Residente[];
  usuarios: UsuarioSistema[];

  loginAs: (userId: string) => void;
  logout: () => void;
  toggleDarkMode: () => void;
  setUmbralConfianza: (nuevoUmbral: number) => void;

  sincronizarGmail: () => Promise<Solicitud>;
  validarSugerencia: (
    solicitudId: string,
    categoriaFinal: CategoriaSolicitud,
    prioridadFinal: PrioridadSolicitud
  ) => void;
  validarMasivamenteAltaConfianza: () => number;
  asignarResponsable: (solicitudId: string, responsableId: string) => void;
  cambiarEstadoSolicitud: (
    solicitudId: string,
    nuevoEstado: EstadoSolicitud,
    observacion: string
  ) => void;
  enviarRespuestaResidente: (solicitudId: string, cuerpoRespuesta: string) => void;
  guardarResidente: (residente: Omit<Residente, 'id' | 'fechaRegistro'>, id?: string) => void;
  toggleEstadoResidente: (id: string) => void;
  guardarUsuario: (usuario: Omit<UsuarioSistema, 'id' | 'ultimaSesion'>, id?: string) => void;
  toggleEstadoUsuario: (id: string) => void;
  agregarPalabraUrgencia: (palabra: string) => void;
  eliminarPalabraUrgencia: (palabra: string) => void;
  crearSolicitudDesdeLaboratorio: (
    remitente: string,
    asunto: string,
    cuerpo: string,
    falloIaSimulado: boolean
  ) => Solicitud;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: USUARIOS_SEED[0],
  darkMode: false,
  umbralConfianza: 0.7,
  categoriasCatalogo: ['Mantenimiento', 'Administrativo', 'Facturación', 'Seguridad'],
  estadosCatalogo: [
    'Pendiente de validación',
    'Validada',
    'Asignada',
    'En proceso',
    'Resuelta',
    'Cerrada',
  ],
  palabrasClaveUrgencia: DEFAULT_URGENCY_KEYWORDS,
  solicitudes: SOLICITUDES_SEED,
  residentes: RESIDENTES_SEED,
  usuarios: USUARIOS_SEED,

  loginAs: (userId) => {
    const found = get().usuarios.find((u) => u.id === userId) ?? null;
    set({ currentUser: found });
  },

  logout: () => set({ currentUser: null }),

  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),

  setUmbralConfianza: (nuevoUmbral) => {
    const actor = get().currentUser?.nombre ?? 'Administrador';
    const prev = get().umbralConfianza;
    set((state) => ({
      umbralConfianza: nuevoUmbral,
      solicitudes: state.solicitudes.map((sol) => {
        if (sol.estado !== 'Pendiente de validación') return sol;
        const caeEnReglas = sol.sugerencia.confianza < nuevoUmbral;
        return {
          ...sol,
          pendienteRevision: caeEnReglas,
          sugerencia: {
            ...sol.sugerencia,
            origen: caeEnReglas ? 'Reglas' : 'IA',
            pendienteRevisionReglas: caeEnReglas,
          },
          historial:
            sol.id === state.solicitudes[0]?.id
              ? [
                  ...sol.historial,
                  {
                    id: `evt-umb-${Date.now()}`,
                    solicitudId: sol.id,
                    fecha: new Date().toISOString(),
                    actor,
                    tipoAccion: 'CATALOGO_CONFIG',
                    descripcion: 'Actualización global del umbral de confianza de IA.',
                    valorAnterior: `${Math.round(prev * 100)}%`,
                    valorNuevo: `${Math.round(nuevoUmbral * 100)}%`,
                  },
                ]
              : sol.historial,
        };
      }),
    }));
  },

  sincronizarGmail: async () => {
    await new Promise((resolve) => setTimeout(resolve, 650));
    const state = get();
    const res = state.residentes[Math.floor(Math.random() * 10)];
    const now = new Date().toISOString();
    const id = `sol-${1001 + state.solicitudes.length}`;
    const radicado = `PCO-2025-${String(1001 + state.solicitudes.length).padStart(4, '0')}`;
    const cuerpo = `Cordial saludo Administración. Reporto fuga de agua en el registro principal del piso 2 de la ${res.torre}. Mi celular es ${res.telefono} y mi cédula CC 80.123.998. Quedo atento en ${res.correo}.`;
    const { maskedText } = maskPII(cuerpo);

    const nueva: Solicitud = {
      id,
      radicado,
      correoId: `msg-gmail-${Date.now()}`,
      remitenteCorreo: res.correo,
      remitenteNombre: res.nombre,
      residenteId: res.id,
      asunto: `URGENTE: Fuga en registro hidráulico piso 2 (${res.torre} - ${res.apartamento})`,
      cuerpoOriginal: cuerpo,
      cuerpoEnmascarado: maskedText,
      fechaRecepcion: now,
      fechaActualizacion: now,
      estadoProcesamientoCorreo: 'Procesado IA',
      sugerencia: {
        categoria: 'Mantenimiento',
        prioridad: 'Alta',
        resumen: `Reporte de fuga hidráulica en registro común del piso 2 (${res.torre}).`,
        justificacion: 'Detectada palabra crítica "fuga de agua" en infraestructura común con confianza alta.',
        confianza: 0.95,
        origen: 'IA',
        pendienteRevisionReglas: false,
      },
      categoria: 'Mantenimiento',
      prioridad: 'Alta',
      estado: 'Pendiente de validación',
      pendienteRevision: false,
      responsableId: null,
      slaHoras: 4,
      historial: [
        {
          id: `evt-sync-1-${Date.now()}`,
          solicitudId: id,
          fecha: now,
          actor: 'Email Gateway (Gmail API)',
          tipoAccion: 'RECEPCION',
          descripcion: 'Correo sincronizado desde administracion@parquesoccidente.demo y PII enmascarado.',
        },
        {
          id: `evt-sync-2-${Date.now()}`,
          solicitudId: id,
          fecha: now,
          actor: 'Motor IA Gemini 1.5 Flash',
          tipoAccion: 'SUGERENCIA_IA',
          descripcion: 'Sugerencia automática generada con 95% de confianza (Mantenimiento / Alta).',
          valorAnterior: 'Sin clasificar',
          valorNuevo: 'Mantenimiento | Alta',
        },
      ],
    };

    set((prev) => ({ solicitudes: [nueva, ...prev.solicitudes] }));
    return nueva;
  },

  validarSugerencia: (solicitudId, categoriaFinal, prioridadFinal) => {
    const actor = get().currentUser?.nombre ?? 'Administrador';
    const now = new Date().toISOString();

    set((state) => ({
      solicitudes: state.solicitudes.map((sol) => {
        if (sol.id !== solicitudId) return sol;
        const huboCambio =
          sol.sugerencia.categoria !== categoriaFinal ||
          sol.sugerencia.prioridad !== prioridadFinal;

        const nuevoEvento: EventoHistorial = {
          id: `evt-val-${Date.now()}`,
          solicitudId: sol.id,
          fecha: now,
          actor,
          tipoAccion: 'VALIDACION',
          descripcion: huboCambio
            ? `Sugerencia modificada y validada por ${actor}.`
            : `Sugerencia aprobada sin cambios por ${actor}.`,
          valorAnterior: `${sol.sugerencia.categoria} / ${sol.sugerencia.prioridad} (Pendiente)`,
          valorNuevo: `${categoriaFinal} / ${prioridadFinal} (Validada)`,
        };

        return {
          ...sol,
          categoria: categoriaFinal,
          prioridad: prioridadFinal,
          estado: 'Validada',
          pendienteRevision: false,
          validadaPor: actor,
          fechaValidacion: now,
          fechaActualizacion: now,
          huboModificacionAlValidar: huboCambio,
          slaHoras: prioridadFinal === 'Alta' ? 4 : prioridadFinal === 'Media' ? 24 : 72,
          historial: [...sol.historial, nuevoEvento],
        };
      }),
    }));
  },

  validarMasivamenteAltaConfianza: () => {
    const state = get();
    const actor = state.currentUser?.nombre ?? 'Administrador';
    const now = new Date().toISOString();
    let contador = 0;

    const actualizadas = state.solicitudes.map((sol) => {
      if (
        sol.estado === 'Pendiente de validación' &&
        sol.sugerencia.confianza >= state.umbralConfianza &&
        sol.sugerencia.origen === 'IA'
      ) {
        contador += 1;
        return {
          ...sol,
          estado: 'Validada' as EstadoSolicitud,
          pendienteRevision: false,
          validadaPor: actor,
          fechaValidacion: now,
          fechaActualizacion: now,
          huboModificacionAlValidar: false,
          historial: [
            ...sol.historial,
            {
              id: `evt-bulk-${Date.now()}-${contador}`,
              solicitudId: sol.id,
              fecha: now,
              actor,
              tipoAccion: 'VALIDACION' as const,
              descripcion: 'Aprobación masiva de alta confianza ejecutada por el Administrador.',
              valorAnterior: 'Pendiente de validación',
              valorNuevo: 'Validada',
            },
          ],
        };
      }
      return sol;
    });

    set({ solicitudes: actualizadas });
    return contador;
  },

  asignarResponsable: (solicitudId, responsableId) => {
    const state = get();
    const actor = state.currentUser?.nombre ?? 'Administrador';
    const nuevoResp = state.usuarios.find((u) => u.id === responsableId);
    const now = new Date().toISOString();

    set({
      solicitudes: state.solicitudes.map((sol) => {
        if (sol.id !== solicitudId || sol.estado === 'Pendiente de validación') return sol;
        const antResp = state.usuarios.find((u) => u.id === sol.responsableId);
        const nuevoEstado: EstadoSolicitud =
          sol.estado === 'Validada' ? 'Asignada' : sol.estado;

        return {
          ...sol,
          responsableId,
          estado: nuevoEstado,
          fechaActualizacion: now,
          historial: [
            ...sol.historial,
            {
              id: `evt-asig-${Date.now()}`,
              solicitudId: sol.id,
              fecha: now,
              actor,
              tipoAccion: 'ASIGNACION',
              descripcion: `Responsable asignado: ${nuevoResp?.nombre ?? responsableId}`,
              valorAnterior: antResp?.nombre ?? 'Sin asignar',
              valorNuevo: nuevoResp?.nombre ?? responsableId,
            },
          ],
        };
      }),
    });
  },

  cambiarEstadoSolicitud: (solicitudId, nuevoEstado, observacion) => {
    const actor = get().currentUser?.nombre ?? 'Usuario';
    const now = new Date().toISOString();

    set((state) => ({
      solicitudes: state.solicitudes.map((sol) => {
        if (sol.id !== solicitudId) return sol;
        return {
          ...sol,
          estado: nuevoEstado,
          fechaActualizacion: now,
          tiempoRespuestaHoras:
            nuevoEstado === 'Resuelta' || nuevoEstado === 'Cerrada'
              ? sol.tiempoRespuestaHoras ?? 5
              : sol.tiempoRespuestaHoras,
          historial: [
            ...sol.historial,
            {
              id: `evt-est-${Date.now()}`,
              solicitudId: sol.id,
              fecha: now,
              actor,
              tipoAccion: 'CAMBIO_ESTADO',
              descripcion: observacion
                ? `Cambio de estado con nota: "${observacion}"`
                : `Cambio de estado a ${nuevoEstado}.`,
              valorAnterior: sol.estado,
              valorNuevo: nuevoEstado,
            },
          ],
        };
      }),
    }));
  },

  enviarRespuestaResidente: (solicitudId, cuerpoRespuesta) => {
    const actor = get().currentUser?.nombre ?? 'Soporte';
    const now = new Date().toISOString();

    set((state) => ({
      solicitudes: state.solicitudes.map((sol) => {
        if (sol.id !== solicitudId) return sol;
        return {
          ...sol,
          fechaActualizacion: now,
          historial: [
            ...sol.historial,
            {
              id: `evt-mail-${Date.now()}`,
              solicitudId: sol.id,
              fecha: now,
              actor,
              tipoAccion: 'RESPUESTA_CORREO',
              descripcion: `Correo enviado a ${sol.remitenteCorreo}: "${cuerpoRespuesta.slice(0, 120)}..."`,
              valorAnterior: 'Bandeja de salida',
              valorNuevo: 'Enviado vía SMTP Gmail',
            },
          ],
        };
      }),
    }));
  },

  guardarResidente: (datos, id) => {
    set((state) => {
      if (id) {
        return {
          residentes: state.residentes.map((r) => (r.id === id ? { ...r, ...datos } : r)),
        };
      }
      const nuevo: Residente = {
        ...datos,
        id: `res-${Date.now()}`,
        fechaRegistro: new Date().toISOString().slice(0, 10),
      };
      return { residentes: [nuevo, ...state.residentes] };
    });
  },

  toggleEstadoResidente: (id) => {
    set((state) => ({
      residentes: state.residentes.map((r) =>
        r.id === id ? { ...r, activo: !r.activo } : r
      ),
    }));
  },

  guardarUsuario: (datos, id) => {
    set((state) => {
      if (id) {
        return {
          usuarios: state.usuarios.map((u) => (u.id === id ? { ...u, ...datos } : u)),
        };
      }
      const nuevo: UsuarioSistema = {
        ...datos,
        id: `usr-${Date.now()}`,
        ultimaSesion: new Date().toISOString(),
      };
      return { usuarios: [...state.usuarios, nuevo] };
    });
  },

  toggleEstadoUsuario: (id) => {
    set((state) => ({
      usuarios: state.usuarios.map((u) =>
        u.id === id ? { ...u, activo: !u.activo } : u
      ),
    }));
  },

  agregarPalabraUrgencia: (palabra) => {
    const clean = palabra.trim().toLowerCase();
    if (!clean) return;
    set((state) => ({
      palabrasClaveUrgencia: Array.from(new Set([...state.palabrasClaveUrgencia, clean])),
    }));
  },

  eliminarPalabraUrgencia: (palabra) => {
    set((state) => ({
      palabrasClaveUrgencia: state.palabrasClaveUrgencia.filter((p) => p !== palabra),
    }));
  },

  crearSolicitudDesdeLaboratorio: (remitente, asunto, cuerpo, falloIaSimulado) => {
    const state = get();
    const now = new Date().toISOString();
    const { maskedText } = maskPII(cuerpo);
    const id = `sol-${1001 + state.solicitudes.length}`;
    const radicado = `PCO-2025-${String(1001 + state.solicitudes.length).padStart(4, '0')}`;

    const sugerenciaReglas = classifyByKeywords(maskedText, state.palabrasClaveUrgencia);
    const sugerenciaFinal = falloIaSimulado
      ? sugerenciaReglas
      : {
          ...sugerenciaReglas,
          origen: 'IA' as const,
          confianza: 0.91,
          pendienteRevisionReglas: false,
          justificacion: 'Clasificación neuronal Gemini 1.5 sobre texto enmascarado con validación JSON exitosa.',
        };

    const usaReglas =
      falloIaSimulado || sugerenciaFinal.confianza < state.umbralConfianza;

    const nueva: Solicitud = {
      id,
      radicado,
      correoId: `msg-lab-${Date.now()}`,
      remitenteCorreo: remitente,
      remitenteNombre: 'Prueba Laboratorio IA',
      residenteId: state.residentes[0].id,
      asunto,
      cuerpoOriginal: cuerpo,
      cuerpoEnmascarado: maskedText,
      fechaRecepcion: now,
      fechaActualizacion: now,
      estadoProcesamientoCorreo: usaReglas ? 'Procesado por Reglas' : 'Procesado IA',
      sugerencia: {
        ...sugerenciaFinal,
        origen: usaReglas ? 'Reglas' : 'IA',
        pendienteRevisionReglas: usaReglas,
      },
      categoria: sugerenciaFinal.categoria,
      prioridad: sugerenciaFinal.prioridad,
      estado: 'Pendiente de validación',
      pendienteRevision: usaReglas,
      responsableId: null,
      slaHoras: sugerenciaFinal.prioridad === 'Alta' ? 4 : 24,
      historial: [
        {
          id: `evt-lab-1-${Date.now()}`,
          solicitudId: id,
          fecha: now,
          actor: 'Laboratorio IA Demo',
          tipoAccion: usaReglas ? 'RESPALDO_REGLAS' : 'SUGERENCIA_IA',
          descripcion: usaReglas
            ? 'Solicitud ingresada vía Laboratorio con contingencia de reglas activada.'
            : 'Solicitud ingresada vía Laboratorio con sugerencia IA de alta confianza.',
          valorAnterior: 'Nuevo correo',
          valorNuevo: `${sugerenciaFinal.categoria} | ${sugerenciaFinal.prioridad}`,
        },
      ],
    };

    set((prev) => ({ solicitudes: [nueva, ...prev.solicitudes] }));
    return nueva;
  },
}));
