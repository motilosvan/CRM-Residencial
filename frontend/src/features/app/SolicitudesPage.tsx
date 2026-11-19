import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  ListChecks,
  Loader2,
  Sparkles,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AvisoConflicto } from '@/components/AvisoConflicto';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import {
  CATEGORIAS,
  ESTADOS,
  InsigniaCategoria,
  InsigniaEstado,
  InsigniaPrioridad,
  PRIORIDADES,
} from '@/components/InsigniasDominio';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { cn } from '@/lib/utils';
import { solicitudesService, usuariosService } from '@/services';
import { clave } from '@/services/claves';
import {
  ErrorApi,
  type AsignacionSolicitud,
  type CategoriaSolicitud,
  type DetalleSolicitud,
  type EstadoSolicitud,
  type EstadoSugerencia,
  type EventoHistorialSolicitud,
  type FilaSolicitud,
  type FiltroSolicitudes,
  type PrioridadSolicitud,
  type SugerenciaGuardada,
  type UsuarioConjunto,
} from '@/services/contratos';
import { useSesion } from '@/store/sesion';

const TAMANO_PAGINA = 20;
const TODOS = '__TODOS__';

const ETIQUETAS_ESTADO: Record<EstadoSolicitud, string> = {
  NUEVA: 'Nueva',
  ASIGNADA: 'Asignada',
  EN_PROCESO: 'En proceso',
  RESUELTA: 'Resuelta',
  CERRADA: 'Cerrada',
};

const ETIQUETAS_CATEGORIA: Record<CategoriaSolicitud, string> = {
  SEGURIDAD: 'Seguridad',
  MANTENIMIENTO: 'Mantenimiento',
  FACTURACION: 'Facturación',
  ADMINISTRATIVO: 'Administrativo',
  SIN_CLASIFICAR: 'Sin clasificar',
};

const ETIQUETAS_PRIORIDAD: Record<PrioridadSolicitud, string> = {
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
};

const ETIQUETAS_SUGERENCIA: Record<EstadoSugerencia, string> = {
  LISTA: 'Lista',
  EN_REINTENTO: 'En reintento',
  FALLIDA: 'Fallida',
};

function parsearEnum<T extends string>(valor: string | null, permitidos: readonly T[]): T | undefined {
  return valor && (permitidos as readonly string[]).includes(valor) ? (valor as T) : undefined;
}

function parsearEnteroPositivo(valor: string | null): number | undefined {
  if (!valor || !/^\d+$/.test(valor)) return undefined;
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

type EventoLineaTiempo =
  | {
      claveUnica: string;
      tipo: 'historial';
      tiempoMs: number;
      esCreacion: boolean;
      orden: number;
      evento: EventoHistorialSolicitud;
    }
  | {
      claveUnica: string;
      tipo: 'asignacion';
      tiempoMs: number;
      esCreacion: boolean;
      orden: number;
      asignacion: AsignacionSolicitud;
    };

function construirLineaTiempo(
  historial: EventoHistorialSolicitud[],
  asignaciones: AsignacionSolicitud[],
): EventoLineaTiempo[] {
  const eventos: EventoLineaTiempo[] = [
    ...historial.map((evento, idx) => ({
      claveUnica: `h-${idx}-${evento.fecha}`,
      tipo: 'historial' as const,
      tiempoMs: Date.parse(evento.fecha) || 0,
      esCreacion: evento.anterior === null,
      orden: idx,
      evento,
    })),
    ...asignaciones.map((asignacion, idx) => ({
      claveUnica: `a-${idx}-${asignacion.fechaAsignacion}`,
      tipo: 'asignacion' as const,
      tiempoMs: Date.parse(asignacion.fechaAsignacion) || 0,
      esCreacion: false,
      orden: idx,
      asignacion,
    })),
  ];

  return eventos.sort((a, b) => {
    if (a.tiempoMs !== b.tiempoMs) return a.tiempoMs - b.tiempoMs;
    if (a.esCreacion !== b.esCreacion) return a.esCreacion ? -1 : 1;
    if (a.tipo !== b.tipo) return a.tipo === 'asignacion' ? -1 : 1;
    return a.orden - b.orden;
  });
}

function BloqueSugerenciaIa({
  sugerencia,
  puedeAceptar,
  pendiente,
  alAceptar,
}: {
  sugerencia: SugerenciaGuardada;
  puedeAceptar: boolean;
  pendiente: boolean;
  alAceptar: () => void;
}) {
  return (
    <section
      aria-label="Sugerencia de IA"
      className="flex flex-col gap-3 rounded-lg border bg-primary-claro p-4 text-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <h3 className="font-heading text-sm font-semibold">Sugerencia de IA</h3>
        </div>
        <Badge variant="secondary" className="bg-card text-foreground">
          {ETIQUETAS_SUGERENCIA[sugerencia.estado] ?? sugerencia.estado}
        </Badge>
      </div>

      {(sugerencia.categoria || sugerencia.prioridad) && (
        <div className="flex flex-wrap items-center gap-2">
          {sugerencia.categoria && <InsigniaCategoria categoria={sugerencia.categoria} />}
          {sugerencia.prioridad && <InsigniaPrioridad prioridad={sugerencia.prioridad} />}
        </div>
      )}

      {sugerencia.resumen && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Resumen sugerido</p>
          <p className="text-sm text-foreground">{sugerencia.resumen}</p>
        </div>
      )}

      {sugerencia.justificacion && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Justificación</p>
          <p className="text-sm text-foreground">{sugerencia.justificacion}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {sugerencia.proveedor} · {sugerencia.modelo} · {formatearFechaHora(sugerencia.fechaActualizacion)}
      </p>

      {puedeAceptar && (
        <Button type="button" size="sm" className="self-start max-sm:h-10" disabled={pendiente} onClick={alAceptar}>
          {pendiente ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              Aplicando…
            </>
          ) : (
            'Aceptar sugerencia'
          )}
        </Button>
      )}
    </section>
  );
}

interface AccionesSolicitudProps {
  detalle: DetalleSolicitud;
  esAdmin: boolean;
  usuariosActivos: UsuarioConjunto[];
  errorUsuarios: boolean;
  mutando: boolean;
  accionEnCurso: 'asignar' | 'estado' | 'reclasificar' | 'aceptar' | null;
  alAsignar: (idResponsable: number) => void;
  alCambiarEstado: (nuevoEstado: EstadoSolicitud, comentario?: string) => void;
  alReclasificar: (categoria: CategoriaSolicitud, prioridad: PrioridadSolicitud, comentario?: string) => void;
}

function AccionesSolicitud({
  detalle,
  esAdmin,
  usuariosActivos,
  errorUsuarios,
  mutando,
  accionEnCurso,
  alAsignar,
  alCambiarEstado,
  alReclasificar,
}: AccionesSolicitudProps) {
  const destinosValidos = detalle.destinos.filter((d) => d !== 'ASIGNADA');

  const [idResp, setIdResp] = useState<string>(detalle.idResponsable ? String(detalle.idResponsable) : '');
  const [nuevoEstado, setNuevoEstado] = useState<string>(destinosValidos[0] ?? '');
  const [comentarioEstado, setComentarioEstado] = useState('');
  const [categoria, setCategoria] = useState<CategoriaSolicitud>(detalle.categoria);
  const [prioridad, setPrioridad] = useState<PrioridadSolicitud>(detalle.prioridad);
  const [comentarioClas, setComentarioClas] = useState('');

  const idSelectResp = useId();
  const idSelectDestino = useId();
  const idComentarioEstado = useId();
  const idSelectCategoria = useId();
  const idSelectPrioridad = useId();
  const idComentarioClas = useId();

  const puedeAsignar = esAdmin && ['NUEVA', 'ASIGNADA', 'EN_PROCESO'].includes(detalle.estado);
  const puedeReclasificar = esAdmin && detalle.estado !== 'CERRADA';

  return (
    <div className="flex flex-col gap-4">
      {puedeAsignar && (
        <section aria-label="Asignar responsable" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <UserCheck aria-hidden="true" className="size-4 text-primary" />
            <h3 className="font-heading text-sm font-semibold">Asignar responsable</h3>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={idSelectResp}>Responsable</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={idResp} onValueChange={setIdResp} disabled={mutando || usuariosActivos.length === 0}>
                <SelectTrigger
                  id={idSelectResp}
                  className="w-full sm:flex-1 max-sm:h-10 max-sm:data-[size=default]:h-10"
                >
                  <SelectValue
                    placeholder={
                      errorUsuarios
                        ? 'No pudimos cargar el personal'
                        : usuariosActivos.length === 0
                          ? 'No hay personal activo'
                          : 'Elige una persona'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {usuariosActivos.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nombre} ({u.rol === 'ADMIN' ? 'Administrador' : 'Soporte'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                className="shrink-0 max-sm:h-10"
                disabled={!idResp || mutando}
                onClick={() => alAsignar(Number(idResp))}
              >
                {accionEnCurso === 'asignar' ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    Asignando…
                  </>
                ) : (
                  'Asignar'
                )}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section aria-label="Cambiar estado" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h3 className="font-heading text-sm font-semibold">Cambiar estado</h3>
        {destinosValidos.length > 0 ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor={idSelectDestino}>Nuevo estado</Label>
              <Select value={nuevoEstado} onValueChange={setNuevoEstado} disabled={mutando}>
                <SelectTrigger
                  id={idSelectDestino}
                  className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
                >
                  <SelectValue placeholder="Elige el nuevo estado" />
                </SelectTrigger>
                <SelectContent>
                  {destinosValidos.map((d) => (
                    <SelectItem key={d} value={d}>
                      {ETIQUETAS_ESTADO[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={idComentarioEstado}>Comentario (opcional)</Label>
              <Textarea
                id={idComentarioEstado}
                value={comentarioEstado}
                onChange={(e) => setComentarioEstado(e.target.value)}
                maxLength={500}
                placeholder="Agrega una nota sobre este cambio de estado"
                disabled={mutando}
              />
            </div>

            <Button
              type="button"
              className="self-start max-sm:h-10"
              disabled={!nuevoEstado || mutando}
              onClick={() => alCambiarEstado(nuevoEstado as EstadoSolicitud, comentarioEstado.trim() || undefined)}
            >
              {accionEnCurso === 'estado' ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Actualizando…
                </>
              ) : (
                'Actualizar estado'
              )}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {detalle.estado === 'NUEVA'
              ? 'Para pasar esta solicitud a «Asignada», asigna un responsable.'
              : 'Esta solicitud está cerrada y no admite cambios de estado.'}
          </p>
        )}
      </section>

      {puedeReclasificar && (
        <section aria-label="Reclasificar" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <h3 className="font-heading text-sm font-semibold">Reclasificar</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={idSelectCategoria}>Categoría</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as CategoriaSolicitud)}
                disabled={mutando}
              >
                <SelectTrigger
                  id={idSelectCategoria}
                  className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {ETIQUETAS_CATEGORIA[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={idSelectPrioridad}>Prioridad</Label>
              <Select
                value={prioridad}
                onValueChange={(v) => setPrioridad(v as PrioridadSolicitud)}
                disabled={mutando}
              >
                <SelectTrigger
                  id={idSelectPrioridad}
                  className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ETIQUETAS_PRIORIDAD[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={idComentarioClas}>Comentario (opcional)</Label>
            <Textarea
              id={idComentarioClas}
              value={comentarioClas}
              onChange={(e) => setComentarioClas(e.target.value)}
              maxLength={300}
              placeholder="Motivo del cambio de categoría o prioridad"
              disabled={mutando}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="self-start max-sm:h-10"
            disabled={mutando}
            onClick={() => alReclasificar(categoria, prioridad, comentarioClas.trim() || undefined)}
          >
            {accionEnCurso === 'reclasificar' ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar clasificación'
            )}
          </Button>
        </section>
      )}
    </div>
  );
}

function LineaTiempoSolicitud({
  historial,
  asignaciones,
}: {
  historial: EventoHistorialSolicitud[];
  asignaciones: AsignacionSolicitud[];
}) {
  const eventos = construirLineaTiempo(historial, asignaciones);

  return (
    <section aria-label="Línea de tiempo" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Clock aria-hidden="true" className="size-4 text-primary" />
        <h3 className="font-heading text-sm font-semibold">Línea de tiempo</h3>
      </div>

      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
          {eventos.map((item) => {
            if (item.tipo === 'historial') {
              const { evento } = item;
              const transicion = evento.anterior
                ? `${ETIQUETAS_ESTADO[evento.anterior] ?? evento.anterior} → ${ETIQUETAS_ESTADO[evento.nuevo] ?? evento.nuevo}`
                : `Creación → ${ETIQUETAS_ESTADO[evento.nuevo] ?? evento.nuevo}`;
              return (
                <li key={item.claveUnica} className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{transicion}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatearFechaHora(evento.fecha)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Por: {evento.usuario ?? 'Sistema'}</p>
                  {evento.comentario && <p className="text-sm text-foreground">{evento.comentario}</p>}
                </li>
              );
            }

            const { asignacion } = item;
            return (
              <li key={item.claveUnica} className="flex flex-col gap-1 rounded-lg border bg-muted p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">Asignada a {asignacion.nombre}</span>
                  {asignacion.liberadaEn === null ? (
                    <Badge variant="secondary" className="bg-exito-claro text-exito">
                      Vigente
                    </Badge>
                  ) : (
                    <Badge variant="outline">Liberada</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Asignación: {formatearFechaHora(asignacion.fechaAsignacion)}
                </p>
                {asignacion.liberadaEn && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Liberada: {formatearFechaHora(asignacion.liberadaEn)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

interface DetalleSolicitudContenidoProps {
  conjuntoId: string;
  idSolicitud: number;
  esAdmin: boolean;
  usuariosActivos: UsuarioConjunto[];
  errorUsuarios: boolean;
}

function DetalleSolicitudContenido({
  conjuntoId,
  idSolicitud,
  esAdmin,
  usuariosActivos,
  errorUsuarios,
}: DetalleSolicitudContenidoProps) {
  const queryClient = useQueryClient();
  const [conflicto, setConflicto] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState<'asignar' | 'estado' | 'reclasificar' | 'aceptar' | null>(null);

  const consultaDetalle = useQuery({
    queryKey: clave(conjuntoId, 'solicitudes', 'detalle', idSolicitud),
    queryFn: ({ signal }) => solicitudesService.detalle(idSolicitud, signal),
  });

  async function invalidarTrasExito() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'solicitudes') }),
      queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'solicitudes', 'detalle', idSolicitud) }),
      queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
      queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') }),
    ]);
  }

  function manejarErrorMutacion(error: unknown) {
    if (error instanceof ErrorApi && error.tipo === 'CONFLICTO') {
      setErrorAccion(null);
      setConflicto(true);
    } else {
      setConflicto(false);
      setErrorAccion(mensajeDeError(error));
    }
  }

  const mutacionAsignar = useMutation({
    mutationFn: ({ idResponsable, versionEsperada }: { idResponsable: number; versionEsperada: number }) =>
      solicitudesService.asignar(idSolicitud, { idResponsable, versionEsperada }),
    onMutate: () => {
      setErrorAccion(null);
      setConflicto(false);
      setAccionEnCurso('asignar');
    },
    onSuccess: async (res) => {
      await invalidarTrasExito();
      toast.success(res.sinCambios ? 'Esta persona ya era la responsable actual' : 'Responsable asignado');
    },
    onError: manejarErrorMutacion,
    onSettled: () => setAccionEnCurso(null),
  });

  const mutacionEstado = useMutation({
    mutationFn: ({
      nuevoEstado,
      versionEsperada,
      comentario,
    }: {
      nuevoEstado: EstadoSolicitud;
      versionEsperada: number;
      comentario?: string;
    }) => solicitudesService.cambiarEstado(idSolicitud, { nuevoEstado, versionEsperada, comentario }),
    onMutate: () => {
      setErrorAccion(null);
      setConflicto(false);
      setAccionEnCurso('estado');
    },
    onSuccess: async () => {
      await invalidarTrasExito();
      toast.success('Estado actualizado');
    },
    onError: manejarErrorMutacion,
    onSettled: () => setAccionEnCurso(null),
  });

  const mutacionReclasificar = useMutation({
    mutationFn: ({
      categoria,
      prioridad,
      versionEsperada,
      comentario,
    }: {
      categoria: CategoriaSolicitud;
      prioridad: PrioridadSolicitud;
      versionEsperada: number;
      comentario?: string;
    }) => solicitudesService.reclasificar(idSolicitud, { categoria, prioridad, versionEsperada, comentario }),
    onMutate: () => {
      setErrorAccion(null);
      setConflicto(false);
      setAccionEnCurso('reclasificar');
    },
    onSuccess: async (res) => {
      await invalidarTrasExito();
      toast.success(res.sinCambios ? 'La clasificación no tuvo cambios' : 'Clasificación actualizada');
    },
    onError: manejarErrorMutacion,
    onSettled: () => setAccionEnCurso(null),
  });

  const mutacionAceptar = useMutation({
    mutationFn: ({ versionEsperada }: { versionEsperada: number }) =>
      solicitudesService.aceptarSugerencia(idSolicitud, { versionEsperada }),
    onMutate: () => {
      setErrorAccion(null);
      setConflicto(false);
      setAccionEnCurso('aceptar');
    },
    onSuccess: async (res) => {
      await invalidarTrasExito();
      toast.success(
        res.sinCambios ? 'La clasificación ya coincide con la sugerencia de IA' : 'Sugerencia de IA aplicada',
      );
    },
    onError: manejarErrorMutacion,
    onSettled: () => setAccionEnCurso(null),
  });

  async function recargarPorConflicto() {
    setErrorAccion(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'solicitudes') }),
      queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'solicitudes', 'detalle', idSolicitud) }),
    ]);
    await consultaDetalle.refetch();
    setConflicto(false);
  }

  const detalle = consultaDetalle.data;

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="font-heading">
          {detalle ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-primary">{detalle.codigo}</span>
              <span>{detalle.asunto?.trim() ? detalle.asunto : '(Sin asunto)'}</span>
            </span>
          ) : (
            'Detalle de solicitud'
          )}
        </SheetTitle>
        <SheetDescription>
          Metadatos, acciones de seguimiento y línea de tiempo inmutable de la solicitud.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-5 p-4 pt-0">
        {consultaDetalle.isPending ? (
          <EsqueletoCarga className="min-h-0 p-0" />
        ) : consultaDetalle.isError && !detalle ? (
          <EstadoError
            mensaje={mensajeDeError(consultaDetalle.error)}
            alReintentar={() => void consultaDetalle.refetch()}
          />
        ) : (
          detalle && (
            <>
              {conflicto && <AvisoConflicto alRecargar={() => void recargarPorConflicto()} />}

              {errorAccion && (
                <Alert className="border-destructive bg-destructive-claro text-foreground">
                  <TriangleAlert aria-hidden="true" className="text-destructive" />
                  <AlertDescription className="text-foreground">{errorAccion}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <InsigniaEstado estado={detalle.estado} />
                <InsigniaCategoria categoria={detalle.categoria} />
                <InsigniaPrioridad prioridad={detalle.prioridad} />
              </div>

              <dl className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">Remitente</dt>
                  <dd className="text-foreground max-sm:break-words">{detalle.remitente}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Responsable</dt>
                  <dd className={cn(detalle.responsable ? 'text-foreground' : 'text-muted-foreground')}>
                    {detalle.responsable ?? 'Sin asignar'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Creación</dt>
                  <dd className="text-foreground tabular-nums">{formatearFechaHora(detalle.fechaCreacion)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Primera respuesta</dt>
                  <dd className="text-foreground tabular-nums">{formatearFechaHora(detalle.primeraRespuesta)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Cierre</dt>
                  <dd className="text-foreground tabular-nums">{formatearFechaHora(detalle.fechaCierre)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">SLA</dt>
                  <dd className="text-foreground tabular-nums">{detalle.slaHoras} h</dd>
                </div>
              </dl>

              <section aria-label="Contenido del correo" className="flex flex-col gap-2">
                <h3 className="font-heading text-sm font-semibold">Contenido del correo</h3>
                <div className="rounded-lg border bg-muted p-4">
                  {detalle.cuerpo ? (
                    <p className="text-sm whitespace-pre-wrap break-words text-foreground">{detalle.cuerpo}</p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">Este correo no contiene texto en el cuerpo.</p>
                  )}
                </div>
              </section>

              {detalle.sugerencia && (
                <BloqueSugerenciaIa
                  sugerencia={detalle.sugerencia}
                  puedeAceptar={
                    detalle.sugerencia.estado === 'LISTA' && esAdmin && detalle.estado !== 'CERRADA'
                  }
                  pendiente={accionEnCurso === 'aceptar'}
                  alAceptar={() => mutacionAceptar.mutate({ versionEsperada: detalle.version })}
                />
              )}

              <AccionesSolicitud
                key={`${detalle.id}-${detalle.version}-${detalle.estado}-${detalle.categoria}-${detalle.prioridad}-${detalle.idResponsable ?? 'sin'}`}
                detalle={detalle}
                esAdmin={esAdmin}
                usuariosActivos={usuariosActivos}
                errorUsuarios={errorUsuarios}
                mutando={accionEnCurso !== null}
                accionEnCurso={accionEnCurso}
                alAsignar={(idResponsable) =>
                  mutacionAsignar.mutate({ idResponsable, versionEsperada: detalle.version })
                }
                alCambiarEstado={(nuevoEstado, comentario) =>
                  mutacionEstado.mutate({ nuevoEstado, versionEsperada: detalle.version, comentario })
                }
                alReclasificar={(categoria, prioridad, comentario) =>
                  mutacionReclasificar.mutate({
                    categoria,
                    prioridad,
                    versionEsperada: detalle.version,
                    comentario,
                  })
                }
              />

              <LineaTiempoSolicitud historial={detalle.historial} asignaciones={detalle.asignaciones} />
            </>
          )
        )}
      </div>
    </>
  );
}

function SolicitudesContenido({
  conjuntoId,
  conjuntoNombre,
  esAdmin,
}: {
  conjuntoId: string;
  conjuntoNombre: string;
  esAdmin: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const esMovil = useIsMobile();

  const estado = parsearEnum(searchParams.get('estado'), ESTADOS);
  const categoria = parsearEnum(searchParams.get('categoria'), CATEGORIAS);
  const prioridad = parsearEnum(searchParams.get('prioridad'), PRIORIDADES);
  const idResponsable = esAdmin ? parsearEnteroPositivo(searchParams.get('idResponsable')) : undefined;
  const idSeleccionado = parsearEnteroPositivo(searchParams.get('id')) ?? null;

  const claveFiltros = `${estado ?? ''}|${categoria ?? ''}|${prioridad ?? ''}|${idResponsable ?? ''}`;
  const [estadoPagina, setEstadoPagina] = useState<{ filtroClave: string; pagina: number }>({
    filtroClave: claveFiltros,
    pagina: 1,
  });
  const pagina = estadoPagina.filtroClave === claveFiltros ? estadoPagina.pagina : 1;

  const idFiltroEstado = useId();
  const idFiltroCategoria = useId();
  const idFiltroPrioridad = useId();
  const idFiltroResponsable = useId();

  const consultaUsuarios = useQuery({
    queryKey: clave(conjuntoId, 'usuarios', { incluirInactivos: false }),
    queryFn: ({ signal }) => usuariosService.listar({ incluirInactivos: false }, signal),
    enabled: esAdmin,
  });

  const usuariosActivos = (consultaUsuarios.data ?? []).filter((u) => u.activo && u.cuentaActiva);

  const desplazamiento = (pagina - 1) * TAMANO_PAGINA;
  const filtroConsulta: FiltroSolicitudes = {
    ...(estado ? { estado } : {}),
    ...(categoria ? { categoria } : {}),
    ...(prioridad ? { prioridad } : {}),
    ...(idResponsable !== undefined ? { idResponsable } : {}),
    limite: TAMANO_PAGINA + 1,
    desplazamiento,
  };

  const consultaLista = useQuery({
    queryKey: clave(conjuntoId, 'solicitudes', 'lista', filtroConsulta),
    queryFn: ({ signal }) => solicitudesService.listar(filtroConsulta, signal),
  });

  function actualizarParametro(nombre: string, valor: string | undefined) {
    const siguientes = new URLSearchParams(searchParams);
    if (valor === undefined || valor === TODOS) {
      siguientes.delete(nombre);
    } else {
      siguientes.set(nombre, valor);
    }
    setSearchParams(siguientes, { replace: true });
    setEstadoPagina({ filtroClave: claveFiltros, pagina: 1 });
  }

  function limpiarFiltros() {
    const siguientes = new URLSearchParams(searchParams);
    siguientes.delete('estado');
    siguientes.delete('categoria');
    siguientes.delete('prioridad');
    siguientes.delete('idResponsable');
    setSearchParams(siguientes, { replace: true });
    setEstadoPagina({ filtroClave: '|||', pagina: 1 });
  }

  function abrirDetalle(id: number) {
    const siguientes = new URLSearchParams(searchParams);
    siguientes.set('id', String(id));
    setSearchParams(siguientes);
  }

  function cerrarDetalle() {
    const siguientes = new URLSearchParams(searchParams);
    siguientes.delete('id');
    setSearchParams(siguientes, { replace: true });
  }

  const hayFiltrosActivos =
    estado !== undefined ||
    categoria !== undefined ||
    prioridad !== undefined ||
    idResponsable !== undefined;

  const crudo = consultaLista.data ?? [];
  const hayMas = crudo.length > TAMANO_PAGINA;
  const filas: FilaSolicitud[] = hayMas ? crudo.slice(0, TAMANO_PAGINA) : crudo;
  const inicio = desplazamiento + 1;
  const fin = desplazamiento + filas.length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="min-w-0">
        <h2 className="font-heading text-2xl font-semibold">Solicitudes del conjunto</h2>
        <p className="text-sm text-muted-foreground">
          {esAdmin
            ? `Seguimiento, asignación y clasificación de solicitudes en ${conjuntoNombre}.`
            : `Solicitudes asignadas a ti en ${conjuntoNombre}.`}
        </p>
      </div>

      <section aria-label="Filtros de solicitudes" className="rounded-xl border bg-card p-4">
        <div
          className={cn(
            'grid gap-3 sm:grid-cols-2',
            esAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
          )}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idFiltroEstado}>Estado</Label>
            <Select
              value={estado ?? TODOS}
              onValueChange={(v) => actualizarParametro('estado', v === TODOS ? undefined : v)}
            >
              <SelectTrigger
                id={idFiltroEstado}
                className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ETIQUETAS_ESTADO[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idFiltroCategoria}>Categoría</Label>
            <Select
              value={categoria ?? TODOS}
              onValueChange={(v) => actualizarParametro('categoria', v === TODOS ? undefined : v)}
            >
              <SelectTrigger
                id={idFiltroCategoria}
                className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ETIQUETAS_CATEGORIA[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idFiltroPrioridad}>Prioridad</Label>
            <Select
              value={prioridad ?? TODOS}
              onValueChange={(v) => actualizarParametro('prioridad', v === TODOS ? undefined : v)}
            >
              <SelectTrigger
                id={idFiltroPrioridad}
                className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {ETIQUETAS_PRIORIDAD[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {esAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idFiltroResponsable}>Responsable</Label>
              <Select
                value={idResponsable !== undefined ? String(idResponsable) : TODOS}
                onValueChange={(v) => actualizarParametro('idResponsable', v === TODOS ? undefined : v)}
              >
                <SelectTrigger
                  id={idFiltroResponsable}
                  className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {usuariosActivos.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full max-sm:h-10"
              disabled={!hayFiltrosActivos}
              onClick={limpiarFiltros}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      </section>

      {consultaLista.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consultaLista.isError && !consultaLista.data ? (
        <EstadoError
          mensaje={mensajeDeError(consultaLista.error)}
          alReintentar={() => void consultaLista.refetch()}
        />
      ) : filas.length === 0 ? (
        hayFiltrosActivos ? (
          <EmptyState
            variante="sin-resultados"
            icono={Filter}
            titulo="No encontramos solicitudes con esos filtros"
            descripcion="Prueba ajustando o limpiando los filtros activos para ver más solicitudes."
            accion={
              <Button type="button" variant="outline" className="max-sm:h-10" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            }
          />
        ) : pagina > 1 ? (
          <EmptyState
            variante="sin-resultados"
            icono={ListChecks}
            titulo="No hay más solicitudes en esta página"
            descripcion="Vuelve a la página anterior para revisar el listado."
            accion={
              <Button
                type="button"
                variant="outline"
                className="max-sm:h-10"
                onClick={() => setEstadoPagina({ filtroClave: claveFiltros, pagina: pagina - 1 })}
              >
                Volver a la página anterior
              </Button>
            }
          />
        ) : (
          <EmptyState
            variante="sin-datos"
            icono={ListChecks}
            titulo="No hay solicitudes todavía"
            descripcion={
              esAdmin
                ? 'Cuando lleguen correos al buzón conectado del conjunto aparecerán aquí como solicitudes.'
                : 'Aún no tienes solicitudes asignadas en este conjunto.'
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {esMovil ? (
            <ul className="flex flex-col gap-3">
              {filas.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={idSeleccionado === s.id}
                    onClick={() => abrirDetalle(s.id)}
                    className={cn(
                      'flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      idSeleccionado === s.id ? 'border-primary bg-primary-claro' : 'bg-card hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">{s.codigo}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatearFecha(s.fechaCreacion)}
                      </span>
                    </div>

                    <p className="font-heading text-sm font-semibold text-foreground">
                      {s.asunto?.trim() ? s.asunto : '(Sin asunto)'}
                    </p>

                    <p className="text-xs text-muted-foreground max-sm:break-words">{s.remitente}</p>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <InsigniaEstado estado={s.estado} />
                      <InsigniaCategoria categoria={s.categoria} />
                      <InsigniaPrioridad prioridad={s.prioridad} />
                      <Badge variant="outline" className="tabular-nums">
                        {s.slaHoras} h
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Responsable:{' '}
                      <span className={cn(s.responsable ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {s.responsable ?? 'Sin asignar'}
                      </span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Código</TableHead>
                      <TableHead>Asunto y remitente</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead className="pr-6">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((s) => (
                      <TableRow
                        key={s.id}
                        onClick={() => abrirDetalle(s.id)}
                        className={cn('cursor-pointer', idSeleccionado === s.id && 'bg-primary-claro')}
                      >
                        <TableCell className="pl-6">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirDetalle(s.id);
                            }}
                            className="rounded-sm font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {s.codigo}
                          </button>
                        </TableCell>
                        <TableCell className="min-w-52 whitespace-normal">
                          <p className="font-medium text-foreground">
                            {s.asunto?.trim() ? s.asunto : '(Sin asunto)'}
                          </p>
                          <p className="text-xs text-muted-foreground">{s.remitente}</p>
                        </TableCell>
                        <TableCell>
                          <InsigniaEstado estado={s.estado} />
                        </TableCell>
                        <TableCell>
                          <InsigniaCategoria categoria={s.categoria} />
                        </TableCell>
                        <TableCell>
                          <InsigniaPrioridad prioridad={s.prioridad} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{s.slaHoras} h</TableCell>
                        <TableCell className={cn('text-sm', !s.responsable && 'text-muted-foreground')}>
                          {s.responsable ?? 'Sin asignar'}
                        </TableCell>
                        <TableCell className="pr-6 text-xs text-muted-foreground tabular-nums">
                          {formatearFecha(s.fechaCreacion)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {(pagina > 1 || hayMas) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                Mostrando {inicio}–{fin}
              </p>
              <Pagination aria-label="Paginación de solicitudes" className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-sm:h-10"
                      disabled={pagina <= 1}
                      onClick={() => setEstadoPagina({ filtroClave: claveFiltros, pagina: pagina - 1 })}
                    >
                      <ChevronLeft aria-hidden="true" />
                      Anterior
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-2 text-xs font-medium text-foreground tabular-nums">Página {pagina}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-sm:h-10"
                      disabled={!hayMas}
                      onClick={() => setEstadoPagina({ filtroClave: claveFiltros, pagina: pagina + 1 })}
                    >
                      Siguiente
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      )}

      <Sheet
        open={idSeleccionado !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarDetalle();
        }}
      >
        <SheetContent side="right" className="w-full max-w-full overflow-y-auto sm:max-w-xl">
          {idSeleccionado !== null && (
            <DetalleSolicitudContenido
              key={idSeleccionado}
              conjuntoId={conjuntoId}
              idSolicitud={idSeleccionado}
              esAdmin={esAdmin}
              usuariosActivos={usuariosActivos}
              errorUsuarios={consultaUsuarios.isError}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function SolicitudesPage() {
  const sesion = useSesion((s) => s.sesion);
  if (!sesion) return null;

  return (
    <SolicitudesContenido
      key={sesion.conjuntoActivo.id}
      conjuntoId={sesion.conjuntoActivo.id}
      conjuntoNombre={sesion.conjuntoActivo.nombre}
      esAdmin={sesion.usuario.rol === 'ADMIN'}
    />
  );
}
