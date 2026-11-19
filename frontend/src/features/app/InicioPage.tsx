import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowRight,
  Circle,
  CircleCheck,
  Inbox,
  Palette,
  TriangleAlert,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import { InsigniaCategoria, InsigniaEstado } from '@/components/InsigniasDominio';
import { Isotipo } from '@/components/marca/Isotipo';
import { Revelar } from '@/components/movimiento/Revelar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatearDuracion } from '@/lib/formato';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { buzonService, residentesService, resumenService, usuariosService } from '@/services';
import { clave } from '@/services/claves';
import type { CodigoErrorBuzon } from '@/services/contratos';
import { useSesion } from '@/store/sesion';

interface Paso {
  ruta: string;
  titulo: string;
  descripcion: string;
  accion: string;
  icono: LucideIcon;
  hecho: boolean;
}

const MENSAJES_ERROR_BUZON: Record<CodigoErrorBuzon, string> = {
  AUTENTICACION:
    'El servidor de correo rechazó el inicio de sesión. Revisa el correo y usa una contraseña de aplicación, no la contraseña normal de la cuenta.',
  CERTIFICADO:
    'No se pudo verificar el certificado del servidor de correo: algo intercepta la conexión cifrada (un antivirus con análisis de correo o un proxy).',
  CONEXION: 'No se pudo conectar con el servidor de correo. Revisa el servidor, el puerto y la carpeta.',
  CLAVE: 'La contraseña guardada del buzón ya no se puede descifrar. Vuelve a conectar el buzón.',
  INTERNO: 'La sincronización del buzón falló por un error interno; se reintentará en el siguiente ciclo.',
};

function textoErrorBuzon(codigo: string): string {
  return Object.hasOwn(MENSAJES_ERROR_BUZON, codigo)
    ? MENSAJES_ERROR_BUZON[codigo as CodigoErrorBuzon]
    : 'El buzón reportó un problema en la última sincronización. Revisa la configuración en la bandeja.';
}

function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function InicioPage() {
  const sesion = useSesion((s) => s.sesion);
  const conjuntoId = sesion?.conjuntoActivo.id ?? '';
  const esAdmin = sesion?.usuario.rol === 'ADMIN';

  const consultaResumen = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'resumen') : ['resumen-inactivo'],
    queryFn: ({ signal }) => resumenService.obtener(signal),
    enabled: !!sesion,
  });

  const consultaBuzon = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'buzon', 'estado') : ['buzon-inactivo'],
    queryFn: ({ signal }) => buzonService.estado(signal),
    enabled: !!sesion,
  });

  const consultaUsuarios = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'usuarios', { incluirInactivos: false }) : ['usuarios-inactivo'],
    queryFn: ({ signal }) => usuariosService.listar({ incluirInactivos: false }, signal),
    enabled: !!sesion && esAdmin,
  });

  const consultaResidentes = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'residentes', { soloActivos: true }) : ['residentes-inactivo'],
    queryFn: ({ signal }) => residentesService.listar({ soloActivos: true }, signal),
    enabled: !!sesion && esAdmin,
  });

  if (!sesion) return null;
  const { usuario, conjuntoActivo } = sesion;
  const primerNombre = usuario.nombre.split(/\s+/)[0];

  const buzonConectado = consultaBuzon.data?.conectado === true;
  const identidadLista = Boolean(conjuntoActivo.logoUrl?.trim() || conjuntoActivo.paleta);
  const personalListo =
    esAdmin && (consultaUsuarios.data?.filter((u) => u.activo && u.cuentaActiva).length ?? 0) > 1;
  const residentesListo = esAdmin && (consultaResidentes.data?.length ?? 0) > 0;

  const pasos: Paso[] = [
    {
      ruta: 'bandeja',
      titulo: 'Conectar el buzón',
      descripcion: 'Recibe los correos de tus residentes en un solo lugar.',
      accion: 'Conectar buzón',
      icono: Inbox,
      hecho: buzonConectado,
    },
    {
      ruta: 'identidad',
      titulo: 'Personalizar la identidad',
      descripcion: 'Sube el logo y elige los colores de tu conjunto.',
      accion: 'Personalizar',
      icono: Palette,
      hecho: identidadLista,
    },
    {
      ruta: 'usuarios',
      titulo: 'Invitar al personal',
      descripcion: 'Suma a quienes atenderán las solicitudes.',
      accion: 'Invitar usuarios',
      icono: UserPlus,
      hecho: personalListo,
    },
    {
      ruta: 'residentes',
      titulo: 'Cargar los residentes',
      descripcion: 'Así reconoceremos quién escribe.',
      accion: 'Cargar residentes',
      icono: UsersRound,
      hecho: residentesListo,
    },
  ];

  const hechos = pasos.filter((p) => p.hecho).length;
  const ultimoErrorBuzon = esAdmin ? consultaBuzon.data?.buzon?.ultimoError : null;
  const resumen = consultaResumen.data;
  const totalSolicitudes = resumen ? resumen.porEstado.reduce((acc, e) => acc + e.n, 0) : 0;
  const resumenVacio = !!resumen && totalSolicitudes === 0 && resumen.respuesta.length === 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Revelar>
        <section className="relative isolate overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-10">
          <div aria-hidden="true" className="mf-reticula absolute inset-0 -z-10" />
          <div aria-hidden="true" className="mf-resplandor-a mf-deriva-a absolute -top-32 -right-24 -z-10 size-96 rounded-full opacity-60" />
          <div aria-hidden="true" className="mf-resplandor-b mf-deriva-b absolute -bottom-40 -left-20 -z-10 size-96 rounded-full" />
          <Isotipo className="pointer-events-none absolute top-1/2 right-10 -z-10 hidden size-52 -translate-y-1/2 -rotate-6 text-primary-foreground opacity-15 lg:block" />
          <h2 className="font-heading text-2xl font-bold tracking-tight text-balance sm:text-4xl">
            {saludo(new Date().getHours())}, {primerNombre}
          </h2>
          <p className="mt-3 max-w-xl text-base text-primary-foreground sm:text-lg">
            Bienvenido a {conjuntoActivo.nombre}. Cada correo de un residente llegará aquí convertido en una solicitud con
            responsable, estado e historial.
          </p>
        </section>
      </Revelar>

      {ultimoErrorBuzon && (
        <Alert className="border-aviso bg-aviso-claro text-foreground">
          <TriangleAlert aria-hidden="true" className="text-aviso" />
          <AlertTitle>El buzón necesita atención</AlertTitle>
          <AlertDescription className="text-foreground">
            <p>{textoErrorBuzon(ultimoErrorBuzon)}</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to={`/app/${conjuntoActivo.slug}/bandeja`}>
                Ir a la bandeja
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Revelar retraso={120}>
        <section aria-labelledby="titulo-primeros-pasos" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2 id="titulo-primeros-pasos" className="font-heading text-xl font-semibold">
                Primeros pasos
              </h2>
              <p className="text-sm text-muted-foreground">
                {esAdmin ? 'Deja tu conjunto listo en cuatro tareas.' : 'La administración del conjunto completa esta configuración.'}
              </p>
            </div>
            <div className="w-full sm:w-64">
              <p className="mb-1.5 text-sm font-medium" id="progreso-etiqueta">
                {hechos} de {pasos.length} completados
              </p>
              <div
                role="progressbar"
                aria-labelledby="progreso-etiqueta"
                aria-valuemin={0}
                aria-valuemax={pasos.length}
                aria-valuenow={hechos}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-700 ease-out"
                  style={{ transform: `scaleX(${hechos / pasos.length})` }}
                />
              </div>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {pasos.map((p, i) => (
              <li key={p.ruta} className="mf-escalon" style={{ '--i': i } as CSSProperties}>
                <Card className="h-full transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <CardContent className="flex h-full flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-claro text-foreground">
                        <p.icono aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-heading font-semibold">{p.titulo}</h3>
                        <p className="text-sm text-muted-foreground">{p.descripcion}</p>
                      </div>
                      {p.hecho ? (
                        <CircleCheck aria-label="Completado" role="img" className="size-5 shrink-0 text-exito" />
                      ) : (
                        <Circle aria-label="Pendiente" role="img" className="size-5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <div className="mt-auto">
                      {esAdmin ? (
                        <Button asChild variant={p.hecho ? 'secondary' : 'outline'} size="sm" className="max-sm:h-10">
                          <Link to={`/app/${conjuntoActivo.slug}/${p.ruta}`}>
                            {p.hecho ? 'Ver' : p.accion}
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      ) : p.hecho ? (
                        <p className="text-sm font-medium text-exito">Configurado</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Pendiente de la administración</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </Revelar>

      <section aria-labelledby="titulo-resumen" className="flex flex-col gap-4">
        <div>
          <h2 id="titulo-resumen" className="font-heading text-xl font-semibold">
            Resumen
          </h2>
          <p className="text-sm text-muted-foreground">Estado actual de las solicitudes y tiempos de atención del conjunto.</p>
        </div>

        {consultaResumen.isPending ? (
          <EsqueletoCarga className="min-h-0 p-0" />
        ) : consultaResumen.isError && !resumen ? (
          <EstadoError mensaje={mensajeDeError(consultaResumen.error)} alReintentar={() => void consultaResumen.refetch()} />
        ) : resumenVacio ? (
          <EmptyState
            icono={Inbox}
            titulo="Sin solicitudes todavía"
            descripcion="Conecta el buzón del conjunto para empezar a recibir correos de residentes y ver aquí los indicadores."
            accion={
              esAdmin ? (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/app/${conjuntoActivo.slug}/bandeja`}>
                    Conectar buzón
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          resumen && (
            <div className="flex flex-col gap-6">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {resumen.porEstado.map((item) => (
                  <li key={item.estado} className="min-w-0">
                    <Link
                      to={`/app/${conjuntoActivo.slug}/solicitudes?estado=${encodeURIComponent(item.estado)}`}
                      className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Card className="h-full transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                        <CardContent className="flex flex-col gap-3">
                          <InsigniaEstado estado={item.estado} />
                          <p className="font-heading text-2xl font-bold tabular-nums">{item.n}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>

              {resumen.respuesta.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-heading text-base font-semibold">Primera respuesta y SLA por categoría</h3>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {resumen.respuesta.map((item) => (
                      <li key={item.categoria} className="min-w-0">
                        <Link
                          to={`/app/${conjuntoActivo.slug}/solicitudes?categoria=${encodeURIComponent(item.categoria)}`}
                          className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Card className="h-full transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                            <CardContent className="flex flex-col gap-2">
                              <InsigniaCategoria categoria={item.categoria} />
                              <p className="font-heading text-2xl font-bold tabular-nums">
                                {formatearDuracion(item.minutosPromedio)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {item.dentroSla} de {item.total} dentro de SLA
                              </p>
                            </CardContent>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resumen.carga.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-heading text-base font-semibold">Carga actual de soporte</h3>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {resumen.carga.map((item) => (
                      <li key={item.idUsuario} className="min-w-0">
                        <Link
                          to={`/app/${conjuntoActivo.slug}/solicitudes?idResponsable=${item.idUsuario}`}
                          className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Card className="h-full transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                            <CardContent className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate font-medium">{item.nombre}</span>
                              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                                {item.abiertas} {item.abiertas === 1 ? 'abierta' : 'abiertas'}
                              </span>
                            </CardContent>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        )}
      </section>
    </div>
  );
}
