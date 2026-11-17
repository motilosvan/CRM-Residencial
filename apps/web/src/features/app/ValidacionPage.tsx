import { useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Link2, Loader2, Pencil, Sparkles, TriangleAlert, UserCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { AvisoConflicto } from '@/components/AvisoConflicto';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import {
  CATEGORIAS,
  InsigniaCategoria,
  InsigniaEstado,
  InsigniaPrioridad,
  PRIORIDADES,
} from '@/components/InsigniasDominio';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatearFechaHora } from '@/lib/formato';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { residentesService, solicitudesService, validacionService } from '@/services';
import { clave } from '@/services/claves';
import {
  ErrorApi,
  type CategoriaSolicitud,
  type EntradaVincularCorreo,
  type FilaCorreoBuzon,
  type PrioridadSolicitud,
  type SugerenciaPendienteValidacion,
} from '@/services/contratos';
import { useSesion } from '@/store/sesion';

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

const esquemaCorreccion = z.object({
  categoria: z.enum(CATEGORIAS),
  prioridad: z.enum(PRIORIDADES),
  comentario: z.string().trim().max(300, 'El comentario no puede superar 300 caracteres'),
});

type ValoresCorreccion = z.infer<typeof esquemaCorreccion>;

const esquemaNuevoResidente = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(100, 'El nombre no puede superar 100 caracteres'),
  unidad: z.string().trim().min(1, 'Escribe la unidad').max(20, 'La unidad no puede superar 20 caracteres'),
  telefono: z.string().trim().max(20, 'El teléfono no puede superar 20 caracteres'),
  usarCorreoRemitente: z.boolean(),
});

type ValoresNuevoResidente = z.infer<typeof esquemaNuevoResidente>;

interface ContenidoCorregirProps {
  conjuntoId: string;
  item: SugerenciaPendienteValidacion;
  alCerrar: () => void;
  alRecargarItem: () => Promise<void>;
}

function ContenidoDialogoCorregir({ conjuntoId, item, alCerrar, alRecargarItem }: ContenidoCorregirProps) {
  const queryClient = useQueryClient();
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState(false);

  const idCategoria = useId();
  const idPrioridad = useId();
  const idComentario = useId();

  const form = useForm<ValoresCorreccion>({
    resolver: zodResolver(esquemaCorreccion),
    defaultValues: {
      categoria: item.categoriaActual,
      prioridad: item.prioridadActual,
      comentario: '',
    },
  });

  const mutacion = useMutation({
    mutationFn: (valores: ValoresCorreccion) =>
      solicitudesService.reclasificar(item.idSolicitud, {
        categoria: valores.categoria,
        prioridad: valores.prioridad,
        versionEsperada: item.version,
        comentario: valores.comentario.trim() || undefined,
      }),
    onSuccess: async (res) => {
      setErrorDialogo(null);
      setConflicto(false);
      alCerrar();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'validacion') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'solicitudes') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') }),
      ]);
      toast.success(res.sinCambios ? 'La clasificación no tuvo cambios' : 'Clasificación actualizada');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.tipo === 'CONFLICTO') {
        setErrorDialogo(null);
        setConflicto(true);
      } else {
        setConflicto(false);
        setErrorDialogo(mensajeDeError(error));
      }
    },
  });

  async function manejarRecarga() {
    setConflicto(false);
    setErrorDialogo(null);
    await alRecargarItem();
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit((v) => mutacion.mutate(v))(e)} noValidate className="grid gap-4">
        {conflicto && <AvisoConflicto alRecargar={() => void manejarRecarga()} />}

        {errorDialogo && (
          <Alert className="border-destructive bg-destructive-claro text-foreground">
            <TriangleAlert aria-hidden="true" className="text-destructive" />
            <AlertDescription className="text-foreground">{errorDialogo}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="categoria"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor={idCategoria}>Categoría</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={mutacion.isPending}>
                  <FormControl>
                    <SelectTrigger
                      id={idCategoria}
                      className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
                    >
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {ETIQUETAS_CATEGORIA[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="prioridad"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor={idPrioridad}>Prioridad</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={mutacion.isPending}>
                  <FormControl>
                    <SelectTrigger
                      id={idPrioridad}
                      className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
                    >
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {ETIQUETAS_PRIORIDAD[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="comentario"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={idComentario}>Comentario (opcional)</FormLabel>
              <FormControl>
                <Textarea
                  id={idComentario}
                  maxLength={300}
                  placeholder="Motivo de la corrección"
                  disabled={mutacion.isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" className="max-sm:h-10" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" className="max-sm:h-10" disabled={mutacion.isPending}>
            {mutacion.isPending ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar clasificación'
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

interface ContenidoVincularProps {
  conjuntoId: string;
  correo: FilaCorreoBuzon;
  alCerrar: () => void;
}

function ContenidoDialogoVincular({ conjuntoId, correo, alCerrar }: ContenidoVincularProps) {
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<'existente' | 'nuevo'>('existente');
  const [idResidente, setIdResidente] = useState('');
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);

  const idSelectResidente = useId();
  const idNombre = useId();
  const idUnidad = useId();
  const idTelefono = useId();
  const idUsarCorreo = useId();

  const consultaActivos = useQuery({
    queryKey: clave(conjuntoId, 'residentes', { soloActivos: true }),
    queryFn: ({ signal }) => residentesService.listar({ soloActivos: true }, signal),
  });

  const form = useForm<ValoresNuevoResidente>({
    resolver: zodResolver(esquemaNuevoResidente),
    defaultValues: {
      nombre: '',
      unidad: '',
      telefono: '',
      usarCorreoRemitente: correo.remitente.trim().toLowerCase() !== 'desconocido@invalid',
    },
  });

  const mutacionVincular = useMutation({
    mutationFn: (entrada: EntradaVincularCorreo) => residentesService.vincularCorreo(correo.id, entrada),
    onSuccess: async () => {
      setErrorDialogo(null);
      alCerrar();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'validacion') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'residentes') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
      ]);
      toast.success('Correo vinculado al residente');
    },
    onError: (error) => {
      setErrorDialogo(mensajeDeError(error));
    },
  });

  function asociarExistente(e: React.FormEvent) {
    e.preventDefault();
    setErrorDialogo(null);
    if (!idResidente) {
      setErrorDialogo('Elige un residente activo para continuar.');
      return;
    }
    mutacionVincular.mutate({ idResidente: Number(idResidente) });
  }

  function registrarYVincular(valores: ValoresNuevoResidente) {
    setErrorDialogo(null);
    mutacionVincular.mutate({
      residente: {
        nombre: valores.nombre.trim(),
        unidad: valores.unidad.trim(),
        telefono: valores.telefono.trim() || null,
        usarCorreoRemitente: valores.usarCorreoRemitente,
      },
    });
  }

  const activos = consultaActivos.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted p-3 text-sm">
        <p className="font-medium text-foreground max-sm:break-words">{correo.remitente}</p>
        <p className="text-xs text-muted-foreground">{correo.asunto?.trim() ? correo.asunto : '(Sin asunto)'}</p>
      </div>

      {errorDialogo && (
        <Alert className="border-destructive bg-destructive-claro text-foreground">
          <TriangleAlert aria-hidden="true" className="text-destructive" />
          <AlertDescription className="text-foreground">{errorDialogo}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={modo}
        onValueChange={(v) => {
          setErrorDialogo(null);
          setModo(v as 'existente' | 'nuevo');
        }}
      >
        <TabsList className="flex max-sm:h-auto! max-sm:flex-col max-sm:items-stretch max-sm:w-full w-full gap-1 sm:grid sm:h-9 sm:grid-cols-2 sm:gap-0">
          <TabsTrigger value="existente" className="max-sm:h-10 max-sm:w-full max-sm:flex-none">
            Asociar a residente existente
          </TabsTrigger>
          <TabsTrigger value="nuevo" className="max-sm:h-10 max-sm:w-full max-sm:flex-none">
            Registrar nuevo residente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="existente" className="pt-3">
          <form onSubmit={asociarExistente} className="grid gap-4">
            {consultaActivos.isPending ? (
              <EsqueletoCarga className="min-h-0 p-0" />
            ) : consultaActivos.isError && !consultaActivos.data ? (
              <EstadoError
                mensaje={mensajeDeError(consultaActivos.error)}
                alReintentar={() => void consultaActivos.refetch()}
              />
            ) : activos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay residentes activos registrados todavía. Usa la pestaña «Registrar nuevo residente» para crearlo.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor={idSelectResidente}>Residente activo</Label>
                <Select value={idResidente} onValueChange={setIdResidente} disabled={mutacionVincular.isPending}>
                  <SelectTrigger
                    id={idSelectResidente}
                    className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10"
                  >
                    <SelectValue placeholder="Selecciona un residente" />
                  </SelectTrigger>
                  <SelectContent>
                    {activos.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.unidad} — {r.nombre}
                        {r.correo ? ` (${r.correo})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" className="max-sm:h-10" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="max-sm:h-10"
                disabled={mutacionVincular.isPending || activos.length === 0 || !idResidente}
              >
                {mutacionVincular.isPending ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    Asociando…
                  </>
                ) : (
                  'Asociar residente'
                )}
              </Button>
            </DialogFooter>
          </form>
        </TabsContent>

        <TabsContent value="nuevo" className="pt-3">
          <Form {...form}>
            <form onSubmit={(e) => void form.handleSubmit(registrarYVincular)(e)} noValidate className="grid gap-4">
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
                name="telefono"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor={idTelefono}>Teléfono (opcional)</FormLabel>
                    <FormControl>
                      <Input id={idTelefono} placeholder="Ej. 300 456 7890" className="max-sm:h-10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="usarCorreoRemitente"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2.5 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox
                        id={idUsarCorreo}
                        checked={field.value}
                        onCheckedChange={(valor) => field.onChange(valor === true)}
                      />
                    </FormControl>
                    <Label htmlFor={idUsarCorreo} className="cursor-pointer text-sm leading-snug font-normal">
                      Usar el correo del remitente ({correo.remitente})
                    </Label>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" className="max-sm:h-10" onClick={alCerrar}>
                  Cancelar
                </Button>
                <Button type="submit" className="max-sm:h-10" disabled={mutacionVincular.isPending}>
                  {mutacionVincular.isPending ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      Registrando…
                    </>
                  ) : (
                    'Registrar y vincular'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ValidacionContenido({ conjuntoId, conjuntoSlug, conjuntoNombre }: {
  conjuntoId: string;
  conjuntoSlug: string;
  conjuntoNombre: string;
}) {
  const queryClient = useQueryClient();
  const [conflictoPagina, setConflictoPagina] = useState(false);
  const [errorPagina, setErrorPagina] = useState<string | null>(null);
  const [idAprobando, setIdAprobando] = useState<number | null>(null);

  const [itemCorreccion, setItemCorreccion] = useState<SugerenciaPendienteValidacion | null>(null);
  const [correoVincular, setCorreoVincular] = useState<FilaCorreoBuzon | null>(null);

  const disparadorCorreccionRef = useRef<HTMLButtonElement | null>(null);
  const disparadorVincularRef = useRef<HTMLButtonElement | null>(null);

  const consulta = useQuery({
    queryKey: clave(conjuntoId, 'validacion'),
    queryFn: ({ signal }) => validacionService.obtener(signal),
  });

  const mutacionAprobar = useMutation({
    mutationFn: ({ idSolicitud, versionEsperada }: { idSolicitud: number; versionEsperada: number }) =>
      solicitudesService.aceptarSugerencia(idSolicitud, { versionEsperada }),
    onMutate: ({ idSolicitud }) => {
      setErrorPagina(null);
      setConflictoPagina(false);
      setIdAprobando(idSolicitud);
    },
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'validacion') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'solicitudes') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'correos') }),
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') }),
      ]);
      toast.success(
        res.sinCambios ? 'La clasificación ya coincide con la sugerencia de IA' : 'Sugerencia de IA aplicada',
      );
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
    onSettled: () => setIdAprobando(null),
  });

  async function recargarCola() {
    setConflictoPagina(false);
    setErrorPagina(null);
    await consulta.refetch();
  }

  async function recargarItemCorreccion() {
    const res = await consulta.refetch();
    if (!itemCorreccion) return;
    const actualizado = res.data?.sugerencias.find((s) => s.idSolicitud === itemCorreccion.idSolicitud);
    if (actualizado) {
      setItemCorreccion(actualizado);
    } else {
      setItemCorreccion(null);
      toast.info('Esta sugerencia ya fue gestionada');
    }
  }

  if (consulta.isPending) {
    return <EsqueletoCarga className="min-h-0 p-0" />;
  }

  if (consulta.isError && !consulta.data) {
    return <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />;
  }

  const cola = consulta.data ?? { sugerencias: [], remitentesSinResidente: [] };
  const sugerencias = cola.sugerencias;
  const remitentes = cola.remitentesSinResidente;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="min-w-0">
        <h2 className="font-heading text-2xl font-semibold">Cola de validación</h2>
        <p className="text-sm text-muted-foreground">
          Confirma las sugerencias de clasificación de IA y asocia remitentes sin residente en {conjuntoNombre}.
        </p>
      </div>

      {conflictoPagina && <AvisoConflicto alRecargar={() => void recargarCola()} />}

      {errorPagina && (
        <Alert className="border-destructive bg-destructive-claro text-foreground">
          <TriangleAlert aria-hidden="true" className="text-destructive" />
          <AlertDescription className="text-foreground">{errorPagina}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="sugerencias" className="flex flex-col gap-4">
        <TabsList className="flex max-sm:h-auto! max-sm:flex-col max-sm:items-stretch max-sm:w-full w-full gap-1 sm:inline-flex sm:h-9 sm:w-fit sm:flex-row sm:gap-0">
          <TabsTrigger value="sugerencias" className="max-sm:h-10 max-sm:w-full max-sm:flex-none">
            Sugerencias de IA ({sugerencias.length})
          </TabsTrigger>
          <TabsTrigger value="remitentes" className="max-sm:h-10 max-sm:w-full max-sm:flex-none">
            Remitentes sin residente ({remitentes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sugerencias" className="flex flex-col gap-4">
          {sugerencias.length === 0 ? (
            <EmptyState
              icono={Sparkles}
              titulo="No hay sugerencias de IA pendientes"
              descripcion="Cuando la inteligencia artificial proponga una categoría o prioridad distinta a la actual, aparecerá aquí para tu revisión."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {sugerencias.map((item) => (
                <li key={item.idSolicitud}>
                  <Card>
                    <CardContent className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/app/${conjuntoSlug}/solicitudes?id=${item.idSolicitud}`}
                              className="rounded-sm font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              {item.codigo}
                            </Link>
                            <InsigniaEstado estado={item.estado} />
                          </div>
                          <h3 className="font-heading text-base font-semibold text-foreground">
                            {item.asunto?.trim() ? item.asunto : '(Sin asunto)'}
                          </h3>
                          <p className="text-sm text-muted-foreground max-sm:break-words">{item.remitente}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatearFechaHora(item.fechaCreacion)}
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                          <p className="text-xs font-medium text-muted-foreground">Clasificación actual</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <InsigniaCategoria categoria={item.categoriaActual} />
                            <InsigniaPrioridad prioridad={item.prioridadActual} />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 rounded-lg border bg-primary-claro p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                              <Sparkles aria-hidden="true" className="size-3.5" />
                              Sugerencia de IA
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <InsigniaCategoria categoria={item.sugerencia.categoria} />
                            <InsigniaPrioridad prioridad={item.sugerencia.prioridad} />
                          </div>
                          {item.sugerencia.resumen && (
                            <p className="text-sm text-foreground">{item.sugerencia.resumen}</p>
                          )}
                          {item.sugerencia.justificacion && (
                            <p className="text-xs text-muted-foreground">{item.sugerencia.justificacion}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {item.sugerencia.proveedor} · {item.sugerencia.modelo}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          className="max-sm:h-10"
                          disabled={idAprobando !== null}
                          onClick={() =>
                            mutacionAprobar.mutate({
                              idSolicitud: item.idSolicitud,
                              versionEsperada: item.version,
                            })
                          }
                        >
                          {idAprobando === item.idSolicitud ? (
                            <>
                              <Loader2 aria-hidden="true" className="animate-spin" />
                              Aprobando…
                            </>
                          ) : (
                            <>
                              <Check aria-hidden="true" />
                              Aprobar sugerencia
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          className="max-sm:h-10"
                          disabled={idAprobando !== null}
                          onClick={(e) => {
                            disparadorCorreccionRef.current = e.currentTarget;
                            setItemCorreccion(item);
                          }}
                        >
                          <Pencil aria-hidden="true" />
                          Corregir clasificación
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="remitentes" className="flex flex-col gap-4">
          {remitentes.length === 0 ? (
            <EmptyState
              icono={UserCheck}
              titulo="Todos los remitentes están vinculados"
              descripcion="No hay correos pendientes por asociar a un residente del conjunto."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {remitentes.map((correo) => (
                <li key={correo.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Sin residente vinculado</Badge>
                            {correo.idSolicitud && correo.codigo && (
                              <Link
                                to={`/app/${conjuntoSlug}/solicitudes?id=${correo.idSolicitud}`}
                                className="inline-flex items-center gap-1 rounded-sm font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              >
                                {correo.codigo}
                                <ExternalLink aria-hidden="true" className="size-3" />
                              </Link>
                            )}
                          </div>
                          <p className="font-heading text-sm font-semibold text-foreground max-sm:break-words">
                            {correo.remitente}
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {correo.asunto?.trim() ? correo.asunto : '(Sin asunto)'}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatearFechaHora(correo.fechaRecepcion)}
                        </span>
                      </div>

                      {correo.extracto && <p className="text-sm text-muted-foreground">{correo.extracto}</p>}

                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          className="max-sm:h-10"
                          onClick={(e) => {
                            disparadorVincularRef.current = e.currentTarget;
                            setCorreoVincular(correo);
                          }}
                        >
                          <Link2 aria-hidden="true" />
                          Vincular residente
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={itemCorreccion !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setItemCorreccion(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (disparadorCorreccionRef.current?.isConnected) {
              disparadorCorreccionRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading">Corregir clasificación</DialogTitle>
            <DialogDescription>
              {itemCorreccion
                ? `Ajusta la categoría o prioridad de ${itemCorreccion.codigo}.`
                : 'Ajusta la categoría o prioridad de la solicitud.'}
            </DialogDescription>
          </DialogHeader>

          {itemCorreccion && (
            <ContenidoDialogoCorregir
              key={`${itemCorreccion.idSolicitud}-${itemCorreccion.version}`}
              conjuntoId={conjuntoId}
              item={itemCorreccion}
              alCerrar={() => setItemCorreccion(null)}
              alRecargarItem={recargarItemCorreccion}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={correoVincular !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setCorreoVincular(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (disparadorVincularRef.current?.isConnected) {
              disparadorVincularRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading">Vincular residente</DialogTitle>
            <DialogDescription>
              Asocia este correo a un residente existente o registra uno nuevo en el directorio.
            </DialogDescription>
          </DialogHeader>

          {correoVincular && (
            <ContenidoDialogoVincular
              key={correoVincular.id}
              conjuntoId={conjuntoId}
              correo={correoVincular}
              alCerrar={() => setCorreoVincular(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ValidacionPage() {
  const sesion = useSesion((s) => s.sesion);
  if (!sesion) return null;
  return (
    <ValidacionContenido
      conjuntoId={sesion.conjuntoActivo.id}
      conjuntoSlug={sesion.conjuntoActivo.slug}
      conjuntoNombre={sesion.conjuntoActivo.nombre}
    />
  );
}
