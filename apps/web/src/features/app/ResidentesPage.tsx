import { useEffect, useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  ListChecks,
  Loader2,
  Pencil,
  Search,
  TriangleAlert,
  UserPlus,
  UsersRound,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatearFecha } from '@/lib/formato';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { residentesService, solicitudesService } from '@/services';
import { clave } from '@/services/claves';
import { ErrorApi, type ResidenteConjunto } from '@/services/contratos';
import { useSesion } from '@/store/sesion';

const DEBOUNCE_BUSQUEDA_MS = 200;

const esquemaResidente = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(100, 'El nombre no puede superar 100 caracteres'),
  unidad: z.string().trim().min(1, 'Escribe la unidad').max(20, 'La unidad no puede superar 20 caracteres'),
  correo: z
    .string()
    .trim()
    .max(320, 'El correo es demasiado largo')
    .refine((v) => !v || z.email().safeParse(v).success, 'Escribe un correo válido'),
  telefono: z.string().trim().max(20, 'El teléfono no puede superar 20 caracteres'),
});

type ValoresResidente = z.infer<typeof esquemaResidente>;

function esConflictoCorreoDuplicado(error: ErrorApi): boolean {
  return /ya existe|correo/i.test(error.mensaje);
}

function InsigniaEstadoResidente({ activo }: { activo: boolean }) {
  return activo ? (
    <Badge variant="secondary" className="bg-exito-claro text-exito">
      Activo
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Inactivo
    </Badge>
  );
}

function SwitchEstadoResidente({
  residente,
  deshabilitado,
  alCambiar,
}: {
  residente: ResidenteConjunto;
  deshabilitado: boolean;
  alCambiar: (residente: ResidenteConjunto, activo: boolean) => void;
}) {
  const idSwitch = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={idSwitch}
        checked={residente.activo}
        onCheckedChange={(activo) => alCambiar(residente, activo)}
        disabled={deshabilitado}
        aria-label={`Estado de ${residente.nombre}`}
      />
      <Label htmlFor={idSwitch} className="cursor-pointer text-xs font-normal text-muted-foreground">
        {residente.activo ? 'Activo' : 'Inactivo'}
      </Label>
    </div>
  );
}

interface ContenidoDialogoResidenteProps {
  conjuntoId: string;
  residente: ResidenteConjunto | null;
  alCerrar: () => void;
  alRecargarEdicion: (id: number) => Promise<void>;
}

function ContenidoDialogoResidente({
  conjuntoId,
  residente,
  alCerrar,
  alRecargarEdicion,
}: ContenidoDialogoResidenteProps) {
  const queryClient = useQueryClient();
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [conflictoVersion, setConflictoVersion] = useState(false);

  const idNombre = useId();
  const idUnidad = useId();
  const idCorreo = useId();
  const idTelefono = useId();

  const esEdicion = residente !== null;

  const form = useForm<ValoresResidente>({
    resolver: zodResolver(esquemaResidente),
    defaultValues: {
      nombre: residente?.nombre ?? '',
      unidad: residente?.unidad ?? '',
      correo: residente?.correo ?? '',
      telefono: residente?.telefono ?? '',
    },
  });

  const mutacionCrear = useMutation({
    mutationFn: (valores: ValoresResidente) =>
      residentesService.crear({
        nombre: valores.nombre.trim(),
        unidad: valores.unidad.trim(),
        correo: valores.correo.trim() || null,
        telefono: valores.telefono.trim() || null,
      }),
    onSuccess: async () => {
      setErrorDialogo(null);
      setConflictoVersion(false);
      alCerrar();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'residentes') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'validacion') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
      ]);
      toast.success('Residente registrado');
    },
    onError: (error) => {
      setConflictoVersion(false);
      setErrorDialogo(mensajeDeError(error));
    },
  });

  const mutacionEditar = useMutation({
    mutationFn: (valores: ValoresResidente) =>
      residentesService.actualizar(residente!.id, {
        nombre: valores.nombre.trim(),
        unidad: valores.unidad.trim(),
        correo: valores.correo.trim() || null,
        telefono: valores.telefono.trim() || null,
        versionEsperada: residente!.version,
      }),
    onSuccess: async () => {
      setErrorDialogo(null);
      setConflictoVersion(false);
      alCerrar();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'residentes') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'validacion') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
      ]);
      toast.success('Residente actualizado');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.tipo === 'CONFLICTO' && !esConflictoCorreoDuplicado(error)) {
        setErrorDialogo(null);
        setConflictoVersion(true);
      } else {
        setConflictoVersion(false);
        setErrorDialogo(mensajeDeError(error));
      }
    },
  });

  const pendiente = mutacionCrear.isPending || mutacionEditar.isPending;

  function enviar(valores: ValoresResidente) {
    setErrorDialogo(null);
    setConflictoVersion(false);
    if (esEdicion) {
      mutacionEditar.mutate(valores);
    } else {
      mutacionCrear.mutate(valores);
    }
  }

  async function manejarRecarga() {
    if (!residente) return;
    setConflictoVersion(false);
    setErrorDialogo(null);
    await alRecargarEdicion(residente.id);
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(enviar)(e)} noValidate className="grid gap-4">
        {conflictoVersion && <AvisoConflicto alRecargar={() => void manejarRecarga()} />}

        {errorDialogo && (
          <Alert className="border-destructive bg-destructive-claro text-foreground">
            <TriangleAlert aria-hidden="true" className="text-destructive" />
            <AlertDescription className="text-foreground">{errorDialogo}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={idNombre}>Nombre</FormLabel>
              <FormControl>
                <Input id={idNombre} placeholder="Ej. Elena Vargas" className="max-sm:h-10" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unidad"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={idUnidad}>Unidad</FormLabel>
              <FormControl>
                <Input id={idUnidad} placeholder="Ej. T2-401" className="max-sm:h-10" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="correo"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={idCorreo}>Correo electrónico (opcional)</FormLabel>
              <FormControl>
                <Input
                  id={idCorreo}
                  type="email"
                  inputMode="email"
                  placeholder="residente@ejemplo.com"
                  className="max-sm:h-10"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="telefono"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={idTelefono}>Teléfono (opcional)</FormLabel>
              <FormControl>
                <Input id={idTelefono} placeholder="Ej. 3004567890" className="max-sm:h-10" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" className="max-sm:h-10" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" className="max-sm:h-10" disabled={pendiente}>
            {pendiente ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Guardando…
              </>
            ) : esEdicion ? (
              'Guardar cambios'
            ) : (
              'Registrar'
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function SheetSolicitudesResidente({
  conjuntoId,
  conjuntoSlug,
  residente,
}: {
  conjuntoId: string;
  conjuntoSlug: string;
  residente: ResidenteConjunto;
}) {
  const correoNorm = residente.correo?.trim().toLowerCase() ?? null;

  const consulta = useQuery({
    queryKey: clave(conjuntoId, 'solicitudes', 'por-residente', residente.id, correoNorm),
    queryFn: ({ signal }) => solicitudesService.listar({ limite: 200 }, signal),
    enabled: correoNorm !== null,
  });

  const filtradas = (consulta.data ?? []).filter(
    (s) => correoNorm !== null && s.remitente.trim().toLowerCase() === correoNorm,
  );

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="font-heading">Solicitudes de {residente.nombre}</SheetTitle>
        <SheetDescription>
          Unidad {residente.unidad} · {residente.correo ?? 'Sin correo registrado'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 p-4 pt-0">
        {correoNorm === null ? (
          <EmptyState
            icono={ListChecks}
            titulo="Sin correo para consultar solicitudes"
            descripcion={
              residente.totalSolicitudes > 0
                ? 'Este residente no tiene un correo registrado; revisa sus correos vinculados desde la Bandeja o Solicitudes.'
                : 'Este residente no tiene un correo registrado para asociar solicitudes automáticamente.'
            }
          />
        ) : consulta.isPending ? (
          <EsqueletoCarga className="min-h-0 p-0" />
        ) : consulta.isError && !consulta.data ? (
          <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />
        ) : filtradas.length === 0 ? (
          <EmptyState
            icono={ListChecks}
            titulo="Sin solicitudes vinculadas"
            descripcion={`No encontramos solicitudes enviadas por ${residente.correo}.`}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {filtradas.map((s) => (
              <li key={s.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/app/${conjuntoSlug}/solicitudes?id=${s.id}`}
                        className="inline-flex items-center gap-1 rounded-sm font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {s.codigo}
                        <ExternalLink aria-hidden="true" className="size-3" />
                      </Link>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatearFecha(s.fechaCreacion)}
                      </span>
                    </div>
                    <p className="font-heading text-sm font-semibold text-foreground">
                      {s.asunto?.trim() ? s.asunto : '(Sin asunto)'}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <InsigniaEstado estado={s.estado} />
                      <InsigniaCategoria categoria={s.categoria} />
                      <InsigniaPrioridad prioridad={s.prioridad} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ResidentesContenido({
  conjuntoId,
  conjuntoSlug,
  conjuntoNombre,
}: {
  conjuntoId: string;
  conjuntoSlug: string;
  conjuntoNombre: string;
}) {
  const queryClient = useQueryClient();
  const esMovil = useIsMobile();

  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [qAplicada, setQAplicada] = useState('');
  const [soloActivos, setSoloActivos] = useState(false);

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [residenteEditando, setResidenteEditando] = useState<ResidenteConjunto | null>(null);
  const [residenteDesactivar, setResidenteDesactivar] = useState<ResidenteConjunto | null>(null);
  const [residenteSolicitudes, setResidenteSolicitudes] = useState<ResidenteConjunto | null>(null);

  const [conflictoPagina, setConflictoPagina] = useState(false);
  const [errorPagina, setErrorPagina] = useState<string | null>(null);

  const idBuscador = useId();
  const idSwitchSoloActivos = useId();
  const botonRegistrarRef = useRef<HTMLButtonElement>(null);
  const disparadorDialogoRef = useRef<HTMLButtonElement | null>(null);
  const temporizadorRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (temporizadorRef.current !== null) {
        window.clearTimeout(temporizadorRef.current);
      }
    };
  }, []);

  const filtroConsulta = {
    ...(qAplicada ? { q: qAplicada } : {}),
    ...(soloActivos ? { soloActivos: true } : {}),
  };

  const consulta = useQuery({
    queryKey: clave(conjuntoId, 'residentes', filtroConsulta),
    queryFn: ({ signal }) => residentesService.listar(filtroConsulta, signal),
  });

  const mutacionEstado = useMutation({
    mutationFn: ({ id, activo, versionEsperada }: { id: number; activo: boolean; versionEsperada: number }) =>
      residentesService.actualizar(id, { activo, versionEsperada }),
    onSuccess: async (_res, vars) => {
      setConflictoPagina(false);
      setErrorPagina(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'residentes') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'validacion') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
      ]);
      toast.success(vars.activo ? 'Residente activado' : 'Residente desactivado');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.tipo === 'CONFLICTO') {
        setErrorPagina(null);
        setConflictoPagina(true);
      } else {
        setConflictoPagina(false);
        setErrorPagina(mensajeDeError(error));
      }
    },
  });

  function manejarCambioBusqueda(valor: string) {
    setTextoBusqueda(valor);
    if (temporizadorRef.current !== null) {
      window.clearTimeout(temporizadorRef.current);
    }
    temporizadorRef.current = window.setTimeout(() => {
      setQAplicada(valor.trim());
    }, DEBOUNCE_BUSQUEDA_MS);
  }

  function manejarSubmitBusqueda(e: React.FormEvent) {
    e.preventDefault();
    if (temporizadorRef.current !== null) {
      window.clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
    setQAplicada(textoBusqueda.trim());
  }

  function limpiarFiltros() {
    if (temporizadorRef.current !== null) {
      window.clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
    setTextoBusqueda('');
    setQAplicada('');
    setSoloActivos(false);
  }

  function abrirCrear(disparador?: HTMLButtonElement | null) {
    disparadorDialogoRef.current = disparador ?? botonRegistrarRef.current;
    setResidenteEditando(null);
    setDialogoAbierto(true);
  }

  function abrirEditar(residente: ResidenteConjunto, disparador: HTMLButtonElement) {
    disparadorDialogoRef.current = disparador;
    setResidenteEditando(residente);
    setDialogoAbierto(true);
  }

  function solicitarCambioActivo(residente: ResidenteConjunto, nuevoActivo: boolean) {
    if (nuevoActivo === residente.activo) return;
    setErrorPagina(null);
    setConflictoPagina(false);
    if (!nuevoActivo) {
      setResidenteDesactivar(residente);
      return;
    }
    mutacionEstado.mutate({ id: residente.id, activo: true, versionEsperada: residente.version });
  }

  function confirmarDesactivacion() {
    if (!residenteDesactivar) return;
    const objetivo = residenteDesactivar;
    setResidenteDesactivar(null);
    mutacionEstado.mutate({ id: objetivo.id, activo: false, versionEsperada: objetivo.version });
  }

  async function recargarPagina() {
    setConflictoPagina(false);
    setErrorPagina(null);
    await consulta.refetch();
  }

  async function recargarEnEdicion(id: number) {
    const res = await consulta.refetch();
    const actualizado = res.data?.find((r) => r.id === id);
    if (actualizado) {
      setResidenteEditando(actualizado);
    } else {
      setDialogoAbierto(false);
      setResidenteEditando(null);
      toast.info('El residente ya no aparece en el filtro actual');
    }
  }

  const residentes = consulta.data ?? [];
  const hayFiltros = Boolean(qAplicada || soloActivos);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold">Directorio de residentes</h2>
          <p className="text-sm text-muted-foreground">
            Administra los residentes de {conjuntoNombre} y sus solicitudes vinculadas.
          </p>
        </div>

        <Button
          ref={botonRegistrarRef}
          type="button"
          className="max-sm:h-10"
          onClick={(e) => abrirCrear(e.currentTarget)}
        >
          <UserPlus aria-hidden="true" />
          Registrar residente
        </Button>
      </div>

      <section
        aria-label="Filtros de residentes"
        className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <form role="search" onSubmit={manejarSubmitBusqueda} className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-2">
          <Label htmlFor={idBuscador} className="sr-only">
            Buscar residentes
          </Label>
          <div className="relative min-w-40 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={idBuscador}
              type="search"
              value={textoBusqueda}
              onChange={(e) => manejarCambioBusqueda(e.target.value)}
              placeholder="Buscar por nombre, unidad o correo"
              className="pl-9 max-sm:h-10"
            />
          </div>
          <Button type="submit" variant="outline" className="max-sm:h-10">
            Buscar
          </Button>
          {(textoBusqueda || qAplicada || soloActivos) && (
            <Button type="button" variant="ghost" className="max-sm:h-10" onClick={limpiarFiltros}>
              Limpiar
            </Button>
          )}
        </form>

        <div className="flex items-center gap-2">
          <Switch id={idSwitchSoloActivos} checked={soloActivos} onCheckedChange={setSoloActivos} />
          <Label htmlFor={idSwitchSoloActivos} className="cursor-pointer text-sm">
            Solo activos
          </Label>
        </div>
      </section>

      {conflictoPagina && <AvisoConflicto alRecargar={() => void recargarPagina()} />}

      {errorPagina && (
        <Alert className="border-destructive bg-destructive-claro text-foreground">
          <TriangleAlert aria-hidden="true" className="text-destructive" />
          <AlertDescription className="text-foreground">{errorPagina}</AlertDescription>
        </Alert>
      )}

      {consulta.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consulta.isError && !consulta.data ? (
        <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />
      ) : residentes.length === 0 ? (
        hayFiltros ? (
          <EmptyState
            variante="sin-resultados"
            icono={Search}
            titulo="No encontramos residentes con esos filtros"
            descripcion="Prueba ajustando el texto de búsqueda o mostrando residentes inactivos."
            accion={
              <Button type="button" variant="outline" className="max-sm:h-10" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            variante="sin-datos"
            icono={UsersRound}
            titulo="Aún no hay residentes registrados"
            descripcion="Registra los residentes del conjunto para vincular automáticamente sus correos y solicitudes."
            accion={
              <Button type="button" className="max-sm:h-10" onClick={(e) => abrirCrear(e.currentTarget)}>
                <UserPlus aria-hidden="true" />
                Registrar residente
              </Button>
            }
          />
        )
      ) : esMovil ? (
        <ul className="flex flex-col gap-3">
          {residentes.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant="secondary">{r.unidad}</Badge>
                        <span className="font-heading font-semibold text-foreground">{r.nombre}</span>
                      </div>
                      <InsigniaEstadoResidente activo={r.activo} />
                    </div>
                    <p className="text-xs text-muted-foreground sm:text-sm max-sm:break-words">
                      {r.correo ?? 'Sin correo'}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.telefono ?? '—'}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-sm:h-10"
                      onClick={() => setResidenteSolicitudes(r)}
                    >
                      {r.totalSolicitudes} {r.totalSolicitudes === 1 ? 'solicitud' : 'solicitudes'}
                    </Button>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="max-sm:h-10"
                        onClick={(e) => abrirEditar(r, e.currentTarget)}
                      >
                        <Pencil aria-hidden="true" />
                        Editar
                      </Button>

                      <SwitchEstadoResidente
                        residente={r}
                        deshabilitado={mutacionEstado.isPending}
                        alCambiar={solicitarCambioActivo}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Unidad</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Solicitudes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-6">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {residentes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6">
                      <Badge variant="secondary">{r.unidad}</Badge>
                    </TableCell>
                    <TableCell className="font-medium whitespace-normal text-foreground">{r.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{r.correo ?? 'Sin correo'}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{r.telefono ?? '—'}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="tabular-nums"
                        onClick={() => setResidenteSolicitudes(r)}
                      >
                        {r.totalSolicitudes} {r.totalSolicitudes === 1 ? 'solicitud' : 'solicitudes'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <InsigniaEstadoResidente activo={r.activo} />
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => abrirEditar(r, e.currentTarget)}
                        >
                          <Pencil aria-hidden="true" />
                          Editar
                        </Button>

                        <SwitchEstadoResidente
                          residente={r}
                          deshabilitado={mutacionEstado.isPending}
                          alCambiar={solicitarCambioActivo}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogoAbierto}
        onOpenChange={(abierto) => {
          setDialogoAbierto(abierto);
          if (!abierto) setResidenteEditando(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const destino = disparadorDialogoRef.current?.isConnected
              ? disparadorDialogoRef.current
              : botonRegistrarRef.current;
            destino?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading">
              {residenteEditando ? 'Editar residente' : 'Registrar residente'}
            </DialogTitle>
            <DialogDescription>
              {residenteEditando
                ? `Actualiza los datos de ${residenteEditando.nombre}.`
                : `Agrega un residente al directorio de ${conjuntoNombre}.`}
            </DialogDescription>
          </DialogHeader>

          {dialogoAbierto && (
            <ContenidoDialogoResidente
              key={residenteEditando ? `${residenteEditando.id}-${residenteEditando.version}` : 'nuevo'}
              conjuntoId={conjuntoId}
              residente={residenteEditando}
              alCerrar={() => {
                setDialogoAbierto(false);
                setResidenteEditando(null);
              }}
              alRecargarEdicion={recargarEnEdicion}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={residenteDesactivar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setResidenteDesactivar(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              ¿Desactivar a {residenteDesactivar?.nombre ?? 'este residente'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El residente dejará de aparecer como activo y no se le podrán vincular nuevos correos hasta que lo reactives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarDesactivacion}>
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={residenteSolicitudes !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setResidenteSolicitudes(null);
        }}
      >
        <SheetContent side="right" className="w-full max-w-full overflow-y-auto sm:max-w-lg">
          {residenteSolicitudes && (
            <SheetSolicitudesResidente
              key={residenteSolicitudes.id}
              conjuntoId={conjuntoId}
              conjuntoSlug={conjuntoSlug}
              residente={residenteSolicitudes}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function ResidentesPage() {
  const sesion = useSesion((s) => s.sesion);
  if (!sesion) return null;
  return (
    <ResidentesContenido
      conjuntoId={sesion.conjuntoActivo.id}
      conjuntoSlug={sesion.conjuntoActivo.slug}
      conjuntoNombre={sesion.conjuntoActivo.nombre}
    />
  );
}
