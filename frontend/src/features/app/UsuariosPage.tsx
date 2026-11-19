import { useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AvisoConflicto } from '@/components/AvisoConflicto';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { usuariosService } from '@/services';
import { clave } from '@/services/claves';
import { ErrorApi, type CambioUsuarioConjunto, type UsuarioConjunto } from '@/services/contratos';
import { useSesion } from '@/store/sesion';
import type { Rol } from '@/types/conjunto';

const esquemaNuevoUsuario = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(100, 'El nombre no puede superar 100 caracteres'),
  correo: z
    .string()
    .trim()
    .min(1, 'Escribe el correo')
    .max(320, 'El correo es demasiado largo')
    .pipe(z.email('Escribe un correo válido')),
  rol: z.enum(['ADMIN', 'SOPORTE'], { message: 'Elige un rol' }),
});

type ValoresNuevoUsuario = z.infer<typeof esquemaNuevoUsuario>;

interface ConfirmacionPendiente {
  usuario: UsuarioConjunto;
  cambio: Omit<CambioUsuarioConjunto, 'versionEsperada'>;
  tipo: 'quitar-admin' | 'desactivar';
}

function InsigniaEstadoUsuario({ usuario }: { usuario: UsuarioConjunto }) {
  if (!usuario.cuentaActiva) {
    return (
      <Badge variant="secondary" className="bg-destructive-claro text-destructive">
        Cuenta deshabilitada
      </Badge>
    );
  }
  if (!usuario.activo) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Inactivo
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-exito-claro text-exito">
      Activo
    </Badge>
  );
}

interface FilaControlesProps {
  usuario: UsuarioConjunto;
  deshabilitarAcciones: boolean;
  alCambiarRol: (u: UsuarioConjunto, rol: Rol) => void;
  alCambiarActivo: (u: UsuarioConjunto, activo: boolean) => void;
}

function ControlesUsuario({
  usuario,
  deshabilitarAcciones,
  alCambiarRol,
  alCambiarActivo,
}: FilaControlesProps) {
  const idExplicacion = useId();
  const idSwitchEstado = useId();
  const bloqueadoPorCuenta = !usuario.cuentaActiva;
  const deshabilitado = bloqueadoPorCuenta || deshabilitarAcciones;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={usuario.rol}
          onValueChange={(valor) => alCambiarRol(usuario, valor as Rol)}
          disabled={deshabilitado}
        >
          <SelectTrigger
            aria-label={`Rol de ${usuario.nombre}`}
            aria-describedby={bloqueadoPorCuenta ? idExplicacion : undefined}
            className="w-40 max-sm:h-10 max-sm:data-[size=default]:h-10"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Administrador</SelectItem>
            <SelectItem value="SOPORTE">Soporte</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Switch
            id={idSwitchEstado}
            checked={usuario.activo}
            onCheckedChange={(activo) => alCambiarActivo(usuario, activo)}
            disabled={deshabilitado}
            aria-label={`Estado de ${usuario.nombre}`}
            aria-describedby={bloqueadoPorCuenta ? idExplicacion : undefined}
          />
          <Label htmlFor={idSwitchEstado} className="cursor-pointer text-xs font-normal text-muted-foreground">
            {usuario.activo ? 'Activo' : 'Inactivo'}
          </Label>
        </div>
      </div>
      {bloqueadoPorCuenta && (
        <p id={idExplicacion} className="max-w-64 text-xs text-muted-foreground">
          Cuenta deshabilitada en la plataforma: no es posible modificar su rol ni su estado.
        </p>
      )}
    </div>
  );
}

export default function UsuariosPage() {
  const sesion = useSesion((s) => s.sesion);
  const queryClient = useQueryClient();
  const esMovil = useIsMobile();

  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [hayConflicto, setHayConflicto] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionPendiente | null>(null);

  const conjuntoId = sesion?.conjuntoActivo.id ?? '';
  const idSwitchInactivos = useId();
  const botonAgregarRef = useRef<HTMLButtonElement>(null);
  const disparadorDialogoRef = useRef<HTMLButtonElement | null>(null);

  const consulta = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'usuarios', { incluirInactivos }) : ['usuarios-inactivo'],
    queryFn: ({ signal }) => usuariosService.listar({ incluirInactivos }, signal),
    enabled: !!sesion,
  });

  const form = useForm<ValoresNuevoUsuario>({
    resolver: zodResolver(esquemaNuevoUsuario),
    defaultValues: { nombre: '', correo: '', rol: 'SOPORTE' },
  });

  const mutacionAgregar = useMutation({
    mutationFn: (valores: ValoresNuevoUsuario) => usuariosService.agregar(valores),
    onSuccess: async () => {
      setErrorDialogo(null);
      setDialogoAbierto(false);
      form.reset({ nombre: '', correo: '', rol: 'SOPORTE' });
      if (conjuntoId) {
        await queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'usuarios') });
        await queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') });
      }
      toast.success('Usuario agregado al conjunto');
    },
    onError: (error) => {
      setErrorDialogo(mensajeDeError(error));
    },
  });

  const mutacionActualizar = useMutation({
    mutationFn: ({ id, cambio }: { id: number; cambio: CambioUsuarioConjunto }) =>
      usuariosService.actualizar(id, cambio),
    onSuccess: async () => {
      setHayConflicto(false);
      setErrorAccion(null);
      if (conjuntoId) {
        await queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'usuarios') });
        await queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'resumen') });
      }
      toast.success('Usuario actualizado');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.tipo === 'CONFLICTO') {
        setErrorAccion(null);
        setHayConflicto(true);
      } else {
        setHayConflicto(false);
        setErrorAccion(mensajeDeError(error));
      }
    },
  });

  if (!sesion) return null;

  const esTu = (u: UsuarioConjunto) =>
    String(u.id) === sesion.usuario.id ||
    u.correo.trim().toLowerCase() === sesion.usuario.correo.trim().toLowerCase();

  function abrirDialogo(disparador?: HTMLButtonElement | null) {
    disparadorDialogoRef.current = disparador ?? botonAgregarRef.current;
    setErrorDialogo(null);
    form.reset({ nombre: '', correo: '', rol: 'SOPORTE' });
    setDialogoAbierto(true);
  }

  function manejarCambioDialogo(abierto: boolean) {
    setDialogoAbierto(abierto);
    if (!abierto) {
      setErrorDialogo(null);
      form.reset({ nombre: '', correo: '', rol: 'SOPORTE' });
    }
  }

  function enviarNuevoUsuario(valores: ValoresNuevoUsuario) {
    setErrorDialogo(null);
    mutacionAgregar.mutate({
      nombre: valores.nombre.trim(),
      correo: valores.correo.trim(),
      rol: valores.rol,
    });
  }

  function solicitarCambioRol(usuario: UsuarioConjunto, nuevoRol: Rol) {
    if (nuevoRol === usuario.rol) return;
    setErrorAccion(null);
    setHayConflicto(false);
    if (usuario.rol === 'ADMIN' && nuevoRol !== 'ADMIN') {
      setConfirmacion({ usuario, cambio: { rol: nuevoRol }, tipo: 'quitar-admin' });
      return;
    }
    mutacionActualizar.mutate({
      id: usuario.id,
      cambio: { rol: nuevoRol, versionEsperada: usuario.version },
    });
  }

  function solicitarCambioActivo(usuario: UsuarioConjunto, nuevoActivo: boolean) {
    if (nuevoActivo === usuario.activo) return;
    setErrorAccion(null);
    setHayConflicto(false);
    if (!nuevoActivo) {
      setConfirmacion({ usuario, cambio: { activo: false }, tipo: 'desactivar' });
      return;
    }
    mutacionActualizar.mutate({
      id: usuario.id,
      cambio: { activo: true, versionEsperada: usuario.version },
    });
  }

  function confirmarPendiente() {
    if (!confirmacion) return;
    const { usuario, cambio } = confirmacion;
    setConfirmacion(null);
    mutacionActualizar.mutate({
      id: usuario.id,
      cambio: { ...cambio, versionEsperada: usuario.version },
    });
  }

  function recargarLista() {
    setHayConflicto(false);
    setErrorAccion(null);
    void consulta.refetch();
  }

  const usuarios = consulta.data;
  const soloTu = !!usuarios && usuarios.length === 1 && esTu(usuarios[0]);
  const listaVacia = !!usuarios && usuarios.length === 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold">Personal del conjunto</h2>
          <p className="text-sm text-muted-foreground">
            Administra quién puede ingresar a {sesion.conjuntoActivo.nombre} y qué rol cumple.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={idSwitchInactivos}
              checked={incluirInactivos}
              onCheckedChange={(valor) => setIncluirInactivos(valor)}
            />
            <Label htmlFor={idSwitchInactivos} className="cursor-pointer text-sm">
              Mostrar inactivos
            </Label>
          </div>

          <Button
            ref={botonAgregarRef}
            type="button"
            className="max-sm:h-10"
            onClick={(e) => abrirDialogo(e.currentTarget)}
          >
            <UserPlus aria-hidden="true" />
            Agregar usuario
          </Button>
        </div>
      </div>

      {hayConflicto && <AvisoConflicto alRecargar={recargarLista} />}

      {errorAccion && (
        <Alert className="border-destructive bg-destructive-claro text-foreground">
          <TriangleAlert aria-hidden="true" className="text-destructive" />
          <AlertDescription className="text-foreground">{errorAccion}</AlertDescription>
        </Alert>
      )}

      {consulta.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consulta.isError && !usuarios ? (
        <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />
      ) : listaVacia ? (
        <EmptyState
          icono={Users}
          titulo="Aún no hay personal en este conjunto"
          descripcion="Agrega a las personas de administración o soporte que atenderán las solicitudes."
          accion={
            <Button type="button" className="max-sm:h-10" onClick={(e) => abrirDialogo(e.currentTarget)}>
              <UserPlus aria-hidden="true" />
              Agregar usuario
            </Button>
          }
        />
      ) : (
        usuarios && (
          <>
            {esMovil ? (
              <ul className="flex flex-col gap-3">
                {usuarios.map((u) => (
                  <li key={u.id}>
                    <Card>
                      <CardContent className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-heading font-semibold">{u.nombre}</span>
                              {esTu(u) && <Badge variant="secondary">Tú</Badge>}
                            </div>
                            <p className="text-sm break-words text-muted-foreground">{u.correo}</p>
                          </div>
                          <InsigniaEstadoUsuario usuario={u} />
                        </div>
                        <ControlesUsuario
                          usuario={u}
                          deshabilitarAcciones={mutacionActualizar.isPending}
                          alCambiarRol={solicitarCambioRol}
                          alCambiarActivo={solicitarCambioActivo}
                        />
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
                        <TableHead className="pl-6">Nombre</TableHead>
                        <TableHead>Correo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="pr-6">Rol y acceso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="pl-6 whitespace-normal">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{u.nombre}</span>
                              {esTu(u) && <Badge variant="secondary">Tú</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.correo}</TableCell>
                          <TableCell>
                            <InsigniaEstadoUsuario usuario={u} />
                          </TableCell>
                          <TableCell className="max-w-xs pr-6 whitespace-normal">
                            <ControlesUsuario
                              usuario={u}
                              deshabilitarAcciones={mutacionActualizar.isPending}
                              alCambiarRol={solicitarCambioRol}
                              alCambiarActivo={solicitarCambioActivo}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {soloTu && (
              <EmptyState
                icono={UserPlus}
                titulo="Solo estás tú en este conjunto"
                descripcion="Agrega a otras personas de administración o soporte para repartir la atención de las solicitudes."
                accion={
                  <Button
                    type="button"
                    variant="outline"
                    className="max-sm:h-10"
                    onClick={(e) => abrirDialogo(e.currentTarget)}
                  >
                    <UserPlus aria-hidden="true" />
                    Agregar usuario
                  </Button>
                }
              />
            )}
          </>
        )
      )}

      <Dialog open={dialogoAbierto} onOpenChange={manejarCambioDialogo}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const destino = disparadorDialogoRef.current?.isConnected
              ? disparadorDialogoRef.current
              : botonAgregarRef.current;
            destino?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-heading">Agregar usuario</DialogTitle>
            <DialogDescription>
              Ingresa el nombre, correo y rol de la persona que participará en {sesion.conjuntoActivo.nombre}.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={(e) => void form.handleSubmit(enviarNuevoUsuario)(e)} noValidate className="grid gap-4">
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
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Camila Torres" autoComplete="name" {...field} />
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
                    <FormLabel>Correo electrónico</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        inputMode="email"
                        placeholder="persona@ejemplo.com"
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full max-sm:h-10 max-sm:data-[size=default]:h-10">
                          <SelectValue placeholder="Elige un rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SOPORTE">Soporte</SelectItem>
                        <SelectItem value="ADMIN">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => manejarCambioDialogo(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutacionAgregar.isPending}>
                  {mutacionAgregar.isPending ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      Agregando…
                    </>
                  ) : (
                    'Agregar'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmacion}
        onOpenChange={(abierto) => {
          if (!abierto) setConfirmacion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              {confirmacion?.tipo === 'desactivar'
                ? `¿Desactivar a ${confirmacion.usuario.nombre}?`
                : '¿Quitar el rol de administrador?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacion?.tipo === 'desactivar'
                ? `${confirmacion.usuario.nombre} perderá acceso a este conjunto y sus sesiones activas se cerrarán.`
                : `${confirmacion?.usuario.nombre ?? ''} pasará al rol Soporte y dejará de administrar el personal y la configuración del conjunto.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmacion?.tipo === 'desactivar' ? 'destructive' : 'default'}
              onClick={confirmarPendiente}
            >
              {confirmacion?.tipo === 'desactivar' ? 'Desactivar' : 'Confirmar cambio'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
