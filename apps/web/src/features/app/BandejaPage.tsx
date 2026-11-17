import { useEffect, useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  MailPlus,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { AvisoConflicto } from '@/components/AvisoConflicto';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import { InsigniaCategoria, InsigniaEstado, InsigniaPrioridad } from '@/components/InsigniasDominio';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatearFechaHora } from '@/lib/formato';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { cn } from '@/lib/utils';
import { buzonService, correosService } from '@/services';
import { clave } from '@/services/claves';
import {
  ErrorApi,
  type CodigoErrorBuzon,
  type EntradaBuzon,
  type EstadoGateway,
  type EstadoSugerencia,
  type FilaCorreoBuzon,
  type SugerenciaGuardada,
} from '@/services/contratos';
import { useSesion } from '@/store/sesion';

const LIMITE_PAGINA = 10;
const DEBOUNCE_BUSQUEDA_MS = 200;

const MENSAJES_ERROR_BUZON: Record<CodigoErrorBuzon, string> = {
  AUTENTICACION:
    'El servidor de correo rechazó el inicio de sesión. Revisa el correo y usa una «contraseña de aplicación» de Google, no la contraseña normal de la cuenta.',
  CERTIFICADO:
    'No se pudo verificar el certificado del servidor de correo: algo intercepta la conexión cifrada (un antivirus con análisis de correo o un proxy).',
  CONEXION: 'No se pudo conectar con el servidor de correo. Revisa el servidor, el puerto y la carpeta.',
  CLAVE: 'La contraseña guardada del buzón ya no se puede descifrar. Vuelve a conectar el buzón.',
  INTERNO: 'La sincronización del buzón falló por un error interno; se reintentará en el siguiente ciclo.',
};

function textoErrorBuzon(codigo: string): string {
  return Object.hasOwn(MENSAJES_ERROR_BUZON, codigo)
    ? MENSAJES_ERROR_BUZON[codigo as CodigoErrorBuzon]
    : 'El buzón reportó un problema en la última sincronización. Revisa la configuración e intenta reconectar.';
}

const ETIQUETAS_SUGERENCIA: Record<EstadoSugerencia, string> = {
  LISTA: 'Lista',
  EN_REINTENTO: 'En reintento',
  FALLIDA: 'Fallida',
};

const esquemaBuzon = z.object({
  correo: z
    .string()
    .trim()
    .min(1, 'Escribe el correo de Gmail')
    .max(320, 'El correo no puede superar 320 caracteres')
    .pipe(z.email('Escribe un correo válido')),
  contrasena: z
    .string()
    .refine((v) => v.replace(/\s+/g, '').length >= 1, 'Escribe la contraseña de aplicación')
    .refine((v) => v.replace(/\s+/g, '').length <= 120, 'La contraseña no puede superar 120 caracteres'),
  imapHost: z
    .string()
    .trim()
    .min(1, 'Escribe el servidor IMAP')
    .max(120, 'El servidor IMAP es demasiado largo')
    .regex(/^[A-Za-z0-9.-]+$/, 'Debe ser un nombre de servidor válido'),
  imapPort: z
    .number({ message: 'Escribe un puerto válido' })
    .int('El puerto debe ser entero')
    .min(1, 'El puerto debe estar entre 1 y 65535')
    .max(65535, 'El puerto debe estar entre 1 y 65535'),
  buzon: z.string().trim().min(1, 'Escribe la carpeta del buzón').max(200, 'La carpeta es demasiado larga'),
  diasIniciales: z
    .number({ message: 'Indica los días iniciales' })
    .int('Debe ser un número entero')
    .min(0, 'Mínimo 0 días')
    .max(365, 'Máximo 365 días'),
  marcarLeido: z.boolean(),
});

type ValoresFormularioBuzon = z.infer<typeof esquemaBuzon>;

function valoresInicialesBuzon(estado?: EstadoGateway): ValoresFormularioBuzon {
  return {
    correo: estado?.buzon?.correo ?? '',
    contrasena: '',
    imapHost: estado?.buzon?.imapHost ?? 'imap.gmail.com',
    imapPort: estado?.buzon?.imapPort ?? 993,
    buzon: estado?.buzon?.buzon ?? 'INBOX',
    diasIniciales: estado?.buzon?.diasIniciales ?? 7,
    marcarLeido: estado?.buzon?.marcarLeido ?? false,
  };
}

function BloqueSugerenciaIa({ sugerencia }: { sugerencia: SugerenciaGuardada }) {
  return (
    <section
      aria-label="Sugerencia de IA"
      className="flex flex-col gap-3 rounded-lg border bg-primary-claro p-4 text-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <h4 className="font-heading text-sm font-semibold">Sugerencia de IA</h4>
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
    </section>
  );
}

interface DetalleCorreoContenidoProps {
  conjuntoId: string;
  conjuntoSlug: string;
  idCorreo: number;
}

function DetalleCorreoContenido({ conjuntoId, conjuntoSlug, idCorreo }: DetalleCorreoContenidoProps) {
  const [mostrarEnmascarado, setMostrarEnmascarado] = useState(false);
  const idSwitchEnmascarado = useId();

  const consulta = useQuery({
    queryKey: clave(conjuntoId, 'correos', 'detalle', idCorreo),
    queryFn: ({ signal }) => correosService.detalle(idCorreo, signal),
  });

  if (consulta.isPending) {
    return <EsqueletoCarga className="min-h-0 p-0" />;
  }

  if (consulta.isError && !consulta.data) {
    return <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />;
  }

  const detalle = consulta.data;
  if (!detalle) return null;

  const textoMostrado = mostrarEnmascarado ? detalle.cuerpoEnmascarado : detalle.cuerpo;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold text-foreground">
            {detalle.asunto?.trim() ? detalle.asunto : '(Sin asunto)'}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">{formatearFechaHora(detalle.fechaRecepcion)}</span>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {detalle.idResidente && detalle.residente ? (
              <>
                <span className="font-medium text-foreground">{detalle.residente}</span>
                {detalle.unidad && <Badge variant="secondary">{detalle.unidad}</Badge>}
              </>
            ) : (
              <Badge variant="outline">Sin residente vinculado</Badge>
            )}
          </div>
          <p className="text-muted-foreground max-sm:break-words">{detalle.remitente}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {detalle.estado && <InsigniaEstado estado={detalle.estado} />}
          {detalle.categoria && <InsigniaCategoria categoria={detalle.categoria} />}
          {detalle.prioridad && <InsigniaPrioridad prioridad={detalle.prioridad} />}
          {detalle.idSolicitud && detalle.codigo && (
            <Button asChild variant="outline" size="sm" className="ml-auto max-sm:h-10">
              <Link to={`/app/${conjuntoSlug}/solicitudes?id=${detalle.idSolicitud}`}>
                {detalle.codigo}
                <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          {mostrarEnmascarado ? 'Mostrando: texto enmascarado' : 'Mostrando: texto original'}
        </span>
        <div className="flex items-center gap-2">
          <Switch
            id={idSwitchEnmascarado}
            checked={mostrarEnmascarado}
            onCheckedChange={setMostrarEnmascarado}
          />
          <Label htmlFor={idSwitchEnmascarado} className="cursor-pointer text-sm">
            Texto enmascarado (Ley 1581)
          </Label>
        </div>
      </div>

      <div className="rounded-lg border bg-muted p-4">
        {textoMostrado ? (
          <p className="text-sm whitespace-pre-wrap break-words text-foreground">{textoMostrado}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Este correo no contiene texto en el cuerpo.</p>
        )}
      </div>

      {detalle.sugerencia && <BloqueSugerenciaIa sugerencia={detalle.sugerencia} />}
    </div>
  );
}

function InsigniaSugerenciaFila({ estado }: { estado: EstadoSugerencia | null }) {
  if (!estado) return null;
  if (estado === 'LISTA') {
    return (
      <Badge variant="secondary" className="bg-primary-claro text-primary">
        <Sparkles aria-hidden="true" />
        Sugerencia IA
      </Badge>
    );
  }
  if (estado === 'EN_REINTENTO') {
    return <Badge variant="outline">IA en proceso</Badge>;
  }
  return <Badge variant="outline">IA sin sugerencia</Badge>;
}

interface FilaCorreoItemProps {
  correo: FilaCorreoBuzon;
  seleccionado: boolean;
  alSeleccionar: (id: number) => void;
}

function FilaCorreoItem({ correo, seleccionado, alSeleccionar }: FilaCorreoItemProps) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={seleccionado}
        onClick={() => alSeleccionar(correo.id)}
        className={cn(
          'flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          seleccionado ? 'border-primary bg-primary-claro' : 'bg-card hover:bg-muted',
        )}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          <div className="min-w-0 sm:flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {correo.idResidente && correo.residente ? (
                <>
                  <span className="font-heading text-sm font-semibold text-foreground">{correo.residente}</span>
                  {correo.unidad && <Badge variant="secondary">{correo.unidad}</Badge>}
                </>
              ) : (
                <Badge variant="outline">Sin residente vinculado</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground max-sm:break-words">{correo.remitente}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{formatearFechaHora(correo.fechaRecepcion)}</span>
        </div>

        <p className="font-heading text-sm font-semibold text-foreground">
          {correo.asunto?.trim() ? correo.asunto : '(Sin asunto)'}
        </p>

        {correo.extracto && <p className="line-clamp-2 text-sm text-muted-foreground">{correo.extracto}</p>}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {correo.codigo && (
            <Badge variant="outline" className="font-mono text-xs">
              {correo.codigo}
            </Badge>
          )}
          {correo.estado && <InsigniaEstado estado={correo.estado} />}
          {correo.categoria && <InsigniaCategoria categoria={correo.categoria} />}
          {correo.prioridad && <InsigniaPrioridad prioridad={correo.prioridad} />}
          <InsigniaSugerenciaFila estado={correo.sugerenciaEstado} />
        </div>
      </button>
    </li>
  );
}

interface PaginacionCorreosProps {
  pagina: number;
  total: number;
  limite: number;
  alCambiarPagina: (pagina: number) => void;
}

function PaginacionCorreos({ pagina, total, limite, alCambiarPagina }: PaginacionCorreosProps) {
  if (total <= 0) return null;
  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const inicio = (pagina - 1) * limite + 1;
  const fin = Math.min(total, pagina * limite);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-xs text-muted-foreground tabular-nums">
        Mostrando {inicio}–{fin} de {total}
      </p>
      {totalPaginas > 1 && (
        <Pagination aria-label="Paginación de correos" className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-sm:h-10"
                disabled={pagina <= 1}
                onClick={() => alCambiarPagina(pagina - 1)}
              >
                <ChevronLeft aria-hidden="true" />
                Anterior
              </Button>
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 text-xs font-medium text-foreground tabular-nums">
                Página {pagina} de {totalPaginas}
              </span>
            </PaginationItem>
            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-sm:h-10"
                disabled={pagina >= totalPaginas}
                onClick={() => alCambiarPagina(pagina + 1)}
              >
                Siguiente
                <ChevronRight aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function BandejaContenido({ conjuntoId, conjuntoSlug, conjuntoNombre, esAdmin }: {
  conjuntoId: string;
  conjuntoSlug: string;
  conjuntoNombre: string;
  esAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const esMovil = useIsMobile();

  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [qAplicada, setQAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [idSeleccionado, setIdSeleccionado] = useState<number | null>(null);

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [mostrarAvanzadas, setMostrarAvanzadas] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [conflictoDialogo, setConflictoDialogo] = useState(false);

  const [confirmarDesconexion, setConfirmarDesconexion] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [conflictoAccion, setConflictoAccion] = useState(false);

  const idBuscador = useId();
  const botonConectarRef = useRef<HTMLButtonElement>(null);
  const botonConfigurarRef = useRef<HTMLButtonElement>(null);
  const disparadorDialogoRef = useRef<HTMLButtonElement | null>(null);
  const temporizadorBusquedaRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (temporizadorBusquedaRef.current !== null) {
        window.clearTimeout(temporizadorBusquedaRef.current);
      }
    };
  }, []);

  const desplazamiento = (pagina - 1) * LIMITE_PAGINA;

  const consultaBuzon = useQuery({
    queryKey: clave(conjuntoId, 'buzon', 'estado'),
    queryFn: ({ signal }) => buzonService.estado(signal),
  });

  const consultaCorreos = useQuery({
    queryKey: clave(conjuntoId, 'correos', { q: qAplicada, limite: LIMITE_PAGINA, desplazamiento }),
    queryFn: ({ signal }) =>
      correosService.listar(
        { q: qAplicada || undefined, limite: LIMITE_PAGINA, desplazamiento },
        signal,
      ),
  });

  const form = useForm<ValoresFormularioBuzon>({
    resolver: zodResolver(esquemaBuzon),
    defaultValues: valoresInicialesBuzon(),
  });

  const mutacionGuardar = useMutation({
    mutationFn: (entrada: EntradaBuzon) => buzonService.guardar(entrada),
    onSuccess: async (nuevoEstado) => {
      setErrorDialogo(null);
      setConflictoDialogo(false);
      setDialogoAbierto(false);
      form.reset(valoresInicialesBuzon(nuevoEstado));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'buzon', 'estado') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') }),
      ]);
      toast.success('Buzón conectado correctamente');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.tipo === 'CONFLICTO') {
        setErrorDialogo(null);
        setConflictoDialogo(true);
      } else {
        setConflictoDialogo(false);
        setErrorDialogo(mensajeDeError(error));
      }
    },
  });

  const mutacionDesconectar = useMutation({
    mutationFn: (versionEsperada?: number) => buzonService.desconectar(versionEsperada),
    onSuccess: async () => {
      setErrorAccion(null);
      setConflictoAccion(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'buzon', 'estado') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') }),
      ]);
      toast.success('Buzón desconectado');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.tipo === 'CONFLICTO') {
        setErrorAccion(null);
        setConflictoAccion(true);
      } else {
        setConflictoAccion(false);
        setErrorAccion(mensajeDeError(error));
      }
    },
  });

  const mutacionSincronizar = useMutation({
    mutationFn: () => buzonService.sincronizar(),
    onSuccess: async (r) => {
      setErrorAccion(null);
      setConflictoAccion(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'buzon', 'estado') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') }),
      ]);
      const palabraNuevos = r.nuevos === 1 ? 'nuevo' : 'nuevos';
      const palabraRevisados = r.revisados === 1 ? 'revisado' : 'revisados';
      toast.success(`Sincronización completa: ${r.nuevos} ${palabraNuevos} de ${r.revisados} ${palabraRevisados}`);
    },
    onError: async (error) => {
      setConflictoAccion(false);
      setErrorAccion(mensajeDeError(error));
      if (error instanceof ErrorApi && error.estado === 422) {
        await queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'buzon', 'estado') });
      }
    },
  });

  function abrirDialogoBuzon(disparador?: HTMLButtonElement | null) {
    disparadorDialogoRef.current = disparador ?? botonConectarRef.current ?? botonConfigurarRef.current;
    setErrorDialogo(null);
    setConflictoDialogo(false);
    setMostrarAvanzadas(false);
    form.reset(valoresInicialesBuzon(consultaBuzon.data));
    setDialogoAbierto(true);
  }

  function manejarCambioDialogo(abierto: boolean) {
    setDialogoAbierto(abierto);
    if (!abierto) {
      setErrorDialogo(null);
      setConflictoDialogo(false);
    }
  }

  function enviarBuzon(valores: ValoresFormularioBuzon) {
    setErrorDialogo(null);
    setConflictoDialogo(false);
    const versionActual = consultaBuzon.data?.buzon?.version;
    mutacionGuardar.mutate({
      correo: valores.correo.trim(),
      contrasena: valores.contrasena.replace(/\s+/g, ''),
      imapHost: valores.imapHost.trim(),
      imapPort: valores.imapPort,
      buzon: valores.buzon.trim(),
      diasIniciales: valores.diasIniciales,
      marcarLeido: valores.marcarLeido,
      ...(versionActual !== undefined ? { versionEsperada: versionActual } : {}),
    });
  }

  async function recargarDentroDialogo() {
    setConflictoDialogo(false);
    setErrorDialogo(null);
    const res = await consultaBuzon.refetch();
    if (res.data) {
      form.reset({
        ...valoresInicialesBuzon(res.data),
        contrasena: form.getValues('contrasena'),
      });
    }
  }

  function recargarEstadoBuzon() {
    setConflictoAccion(false);
    setErrorAccion(null);
    void consultaBuzon.refetch();
  }

  function confirmarDesconectar() {
    const versionActual = consultaBuzon.data?.buzon?.version;
    setConfirmarDesconexion(false);
    mutacionDesconectar.mutate(versionActual);
  }

  function manejarCambioBusqueda(valor: string) {
    setTextoBusqueda(valor);
    if (temporizadorBusquedaRef.current !== null) {
      window.clearTimeout(temporizadorBusquedaRef.current);
    }
    temporizadorBusquedaRef.current = window.setTimeout(() => {
      setQAplicada(valor.trim());
      setPagina(1);
    }, DEBOUNCE_BUSQUEDA_MS);
  }

  function manejarSubmitBusqueda(e: React.FormEvent) {
    e.preventDefault();
    if (temporizadorBusquedaRef.current !== null) {
      window.clearTimeout(temporizadorBusquedaRef.current);
      temporizadorBusquedaRef.current = null;
    }
    setQAplicada(textoBusqueda.trim());
    setPagina(1);
  }

  function limpiarBusqueda() {
    if (temporizadorBusquedaRef.current !== null) {
      window.clearTimeout(temporizadorBusquedaRef.current);
      temporizadorBusquedaRef.current = null;
    }
    setTextoBusqueda('');
    setQAplicada('');
    setPagina(1);
  }

  if (consultaBuzon.isPending && consultaCorreos.isPending) {
    return <EsqueletoCarga className="min-h-0 p-0" />;
  }

  const estadoGateway = consultaBuzon.data;
  const listaCorreos = consultaCorreos.data;
  const correos = listaCorreos?.correos ?? [];
  const totalCorreos = listaCorreos?.total ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold">Bandeja de correos</h2>
          <p className="text-sm text-muted-foreground">
            Correos recibidos en {conjuntoNombre}, vinculados con sus solicitudes e historial.
          </p>
        </div>
      </div>

      {consultaBuzon.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consultaBuzon.isError && !estadoGateway ? (
        <EstadoError mensaje={mensajeDeError(consultaBuzon.error)} alReintentar={() => void consultaBuzon.refetch()} />
      ) : (
        estadoGateway && (
          <section aria-label="Estado del buzón" className="flex flex-col gap-3">
            {estadoGateway.buzon?.ultimoError && (
              <Alert className="border-aviso bg-aviso-claro text-foreground">
                <TriangleAlert aria-hidden="true" className="text-aviso" />
                <AlertTitle>El buzón necesita atención</AlertTitle>
                <AlertDescription className="text-foreground">
                  <p>{textoErrorBuzon(estadoGateway.buzon.ultimoError)}</p>
                  {esAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 max-sm:h-10"
                      onClick={(e) => abrirDialogoBuzon(e.currentTarget)}
                    >
                      Reconectar buzón
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {conflictoAccion && <AvisoConflicto alRecargar={recargarEstadoBuzon} />}

            {errorAccion && (
              <Alert className="border-destructive bg-destructive-claro text-foreground">
                <TriangleAlert aria-hidden="true" className="text-destructive" />
                <AlertDescription className="text-foreground">{errorAccion}</AlertDescription>
              </Alert>
            )}

            {!estadoGateway.conectado ? (
              <Card>
                <CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-claro text-primary">
                      <Mail aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-heading text-base font-semibold">
                        {esAdmin ? 'Conecta el buzón de Gmail' : 'Buzón sin conectar'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {esAdmin
                          ? estadoGateway.buzon
                            ? `El buzón ${estadoGateway.buzon.correo} está desconectado. Conéctalo nuevamente para recibir correos de residentes.`
                            : 'Conecta la cuenta de Gmail donde llegan los correos de tus residentes para crear solicitudes automáticamente.'
                          : 'La administración del conjunto debe conectar el buzón de Gmail para activar la sincronización de correos.'}
                      </p>
                    </div>
                  </div>

                  {esAdmin && (
                    <Button
                      ref={botonConectarRef}
                      type="button"
                      className="shrink-0 max-sm:h-10 max-sm:w-full"
                      onClick={(e) => abrirDialogoBuzon(e.currentTarget)}
                    >
                      <MailPlus aria-hidden="true" />
                      Conectar buzón de Gmail
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              estadoGateway.buzon && (
                <Card>
                  <CardContent className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="bg-exito-claro text-exito">
                          Conectado
                        </Badge>
                        <span className="font-heading text-sm font-semibold text-foreground max-sm:break-words">
                          {estadoGateway.buzon.correo}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Carpeta: {estadoGateway.buzon.buzon}</span>
                        <span>
                          Última sincronización:{' '}
                          {estadoGateway.buzon.ultimaSincronizacion
                            ? formatearFechaHora(estadoGateway.buzon.ultimaSincronizacion)
                            : 'Sin sincronizar aún'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        className="max-sm:h-10"
                        disabled={mutacionSincronizar.isPending}
                        onClick={() => {
                          setErrorAccion(null);
                          setConflictoAccion(false);
                          mutacionSincronizar.mutate();
                        }}
                      >
                        {mutacionSincronizar.isPending ? (
                          <>
                            <Loader2 aria-hidden="true" className="animate-spin" />
                            Sincronizando…
                          </>
                        ) : (
                          <>
                            <RefreshCw aria-hidden="true" />
                            Sincronizar ahora
                          </>
                        )}
                      </Button>

                      {esAdmin && (
                        <>
                          <Button
                            ref={botonConfigurarRef}
                            type="button"
                            variant="outline"
                            className="max-sm:h-10"
                            onClick={(e) => abrirDialogoBuzon(e.currentTarget)}
                          >
                            Configurar / Reconectar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="max-sm:h-10"
                            disabled={mutacionDesconectar.isPending}
                            onClick={() => setConfirmarDesconexion(true)}
                          >
                            <Unplug aria-hidden="true" />
                            Desconectar
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            )}
          </section>
        )
      )}

      <section aria-label="Correos del conjunto" className="flex flex-col gap-4">
        <form role="search" onSubmit={manejarSubmitBusqueda} className="flex flex-wrap items-center gap-2">
          <Label htmlFor={idBuscador} className="sr-only">
            Buscar correos
          </Label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={idBuscador}
              type="search"
              value={textoBusqueda}
              onChange={(e) => manejarCambioBusqueda(e.target.value)}
              placeholder="Buscar por asunto o remitente"
              className="pl-9 max-sm:h-10"
            />
          </div>
          <Button type="submit" variant="outline" className="max-sm:h-10">
            Buscar
          </Button>
          {(textoBusqueda || qAplicada) && (
            <Button type="button" variant="ghost" className="max-sm:h-10" onClick={limpiarBusqueda}>
              Limpiar
            </Button>
          )}
        </form>

        {consultaCorreos.isPending ? (
          <EsqueletoCarga className="min-h-0 p-0" />
        ) : consultaCorreos.isError && !listaCorreos ? (
          <EstadoError mensaje={mensajeDeError(consultaCorreos.error)} alReintentar={() => void consultaCorreos.refetch()} />
        ) : correos.length === 0 ? (
          qAplicada ? (
            <EmptyState
              variante="sin-resultados"
              icono={Search}
              titulo="No encontramos correos con esa búsqueda"
              descripcion="Prueba con otro asunto, remitente o nombre de residente."
              accion={
                <Button type="button" variant="outline" className="max-sm:h-10" onClick={limpiarBusqueda}>
                  Limpiar búsqueda
                </Button>
              }
            />
          ) : (
            <EmptyState
              variante="sin-datos"
              icono={Inbox}
              titulo="La bandeja está vacía"
              descripcion={
                estadoGateway?.conectado
                  ? 'Cuando lleguen correos al buzón conectado aparecerán aquí.'
                  : 'Conecta el buzón de Gmail para empezar a recibir correos de los residentes.'
              }
            />
          )
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <ul className="flex flex-col gap-3">
                {correos.map((c) => (
                  <FilaCorreoItem
                    key={c.id}
                    correo={c}
                    seleccionado={idSeleccionado === c.id}
                    alSeleccionar={setIdSeleccionado}
                  />
                ))}
              </ul>

              <PaginacionCorreos
                pagina={pagina}
                total={totalCorreos}
                limite={LIMITE_PAGINA}
                alCambiarPagina={setPagina}
              />
            </div>

            {!esMovil && (
              <section aria-label="Detalle del correo" className="min-w-0">
                {idSeleccionado !== null ? (
                  <Card>
                    <CardContent>
                      <DetalleCorreoContenido
                        key={idSeleccionado}
                        conjuntoId={conjuntoId}
                        conjuntoSlug={conjuntoSlug}
                        idCorreo={idSeleccionado}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-heading text-base">Selecciona un correo</CardTitle>
                      <CardDescription>
                        Elige un correo de la lista para leer su contenido completo, alternar el texto enmascarado
                        (Ley 1581) y consultar la sugerencia de IA.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </section>
            )}
          </div>
        )}
      </section>

      {esMovil && (
        <Sheet
          open={idSeleccionado !== null}
          onOpenChange={(abierto) => {
            if (!abierto) setIdSeleccionado(null);
          }}
        >
          <SheetContent side="right" className="w-full max-w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader className="border-b">
              <SheetTitle className="font-heading">Detalle del correo</SheetTitle>
              <SheetDescription>Contenido del mensaje, protección Ley 1581 y solicitud asociada.</SheetDescription>
            </SheetHeader>
            <div className="p-4 pt-0">
              {idSeleccionado !== null && (
                <DetalleCorreoContenido
                  key={idSeleccionado}
                  conjuntoId={conjuntoId}
                  conjuntoSlug={conjuntoSlug}
                  idCorreo={idSeleccionado}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={dialogoAbierto} onOpenChange={manejarCambioDialogo}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const destino = disparadorDialogoRef.current?.isConnected
              ? disparadorDialogoRef.current
              : (botonConectarRef.current ?? botonConfigurarRef.current);
            destino?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading">
              {estadoGateway?.conectado ? 'Configurar buzón de Gmail' : 'Conectar buzón de Gmail'}
            </DialogTitle>
            <DialogDescription>
              Ingresa las credenciales IMAP del buzón de {conjuntoNombre}. Probaremos la conexión antes de guardarla.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={(e) => void form.handleSubmit(enviarBuzon)(e)} noValidate className="grid gap-4">
              {conflictoDialogo && <AvisoConflicto alRecargar={() => void recargarDentroDialogo()} />}

              {errorDialogo && (
                <Alert className="border-destructive bg-destructive-claro text-foreground">
                  <TriangleAlert aria-hidden="true" className="text-destructive" />
                  <AlertDescription className="text-foreground">{errorDialogo}</AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="correo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo de Gmail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="mesa.ayuda@ejemplo.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contrasena"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña de aplicación</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" placeholder="abcd efgh ijkl mnop" {...field} />
                    </FormControl>
                    <FormDescription>
                      Usa una contraseña de aplicación de 16 caracteres generada en tu cuenta de Google (Seguridad →
                      Verificación en 2 pasos → Contraseñas de aplicaciones), no la contraseña habitual.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={mostrarAvanzadas}
                  onClick={() => setMostrarAvanzadas((v) => !v)}
                  className="px-0 max-sm:h-10"
                >
                  {mostrarAvanzadas ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  Opciones avanzadas
                </Button>
              </div>

              {mostrarAvanzadas && (
                <div className="grid gap-4 rounded-lg border bg-muted p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="buzon"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Carpeta</FormLabel>
                          <FormControl>
                            <Input placeholder="INBOX" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="diasIniciales"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Días iniciales</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              max={365}
                              value={field.value}
                              onChange={(e) => {
                                const v = e.target.valueAsNumber;
                                field.onChange(Number.isNaN(v) ? 0 : v);
                              }}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="imapHost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Servidor IMAP</FormLabel>
                          <FormControl>
                            <Input placeholder="imap.gmail.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="imapPort"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Puerto IMAP</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={65535}
                              value={field.value}
                              onChange={(e) => {
                                const v = e.target.valueAsNumber;
                                field.onChange(Number.isNaN(v) ? 993 : v);
                              }}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="marcarLeido"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5">
                        <FormLabel className="cursor-pointer font-normal">
                          Marcar correos como leídos al procesarlos
                        </FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="max-sm:h-10"
                  onClick={() => manejarCambioDialogo(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="max-sm:h-10" disabled={mutacionGuardar.isPending}>
                  {mutacionGuardar.isPending ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      Verificando…
                    </>
                  ) : (
                    'Guardar y conectar'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarDesconexion} onOpenChange={setConfirmarDesconexion}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">¿Desconectar el buzón de Gmail?</AlertDialogTitle>
            <AlertDialogDescription>
              El conjunto dejará de sincronizar correos nuevos desde {estadoGateway?.buzon?.correo ?? 'esta cuenta'}.
              Los correos y solicitudes existentes permanecerán disponibles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="max-sm:h-10">Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="max-sm:h-10" onClick={confirmarDesconectar}>
              Confirmar desconexión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function BandejaPage() {
  const sesion = useSesion((s) => s.sesion);
  if (!sesion) return null;

  return (
    <BandejaContenido
      key={sesion.conjuntoActivo.id}
      conjuntoId={sesion.conjuntoActivo.id}
      conjuntoSlug={sesion.conjuntoActivo.slug}
      conjuntoNombre={sesion.conjuntoActivo.nombre}
      esAdmin={sesion.usuario.rol === 'ADMIN'}
    />
  );
}
