import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Circle, Inbox, Palette, UserPlus, UsersRound, type LucideIcon } from 'lucide-react';
import { Isotipo } from '@/components/marca/Isotipo';
import { Revelar } from '@/components/movimiento/Revelar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSesion } from '@/store/sesion';

interface Paso {
  ruta: string;
  titulo: string;
  descripcion: string;
  accion: string;
  icono: LucideIcon;
  hecho: boolean;
}

const PASOS: Paso[] = [
  { ruta: 'bandeja', titulo: 'Conectar el buzón', descripcion: 'Recibe los correos de tus residentes en un solo lugar.', accion: 'Conectar buzón', icono: Inbox, hecho: false },
  { ruta: 'identidad', titulo: 'Personalizar la identidad', descripcion: 'Sube el logo y elige los colores de tu conjunto.', accion: 'Personalizar', icono: Palette, hecho: false },
  { ruta: 'usuarios', titulo: 'Invitar al personal', descripcion: 'Suma a quienes atenderán las solicitudes.', accion: 'Invitar usuarios', icono: UserPlus, hecho: false },
  { ruta: 'residentes', titulo: 'Cargar los residentes', descripcion: 'Así reconoceremos quién escribe.', accion: 'Cargar residentes', icono: UsersRound, hecho: false },
];

function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function InicioPage() {
  const sesion = useSesion((s) => s.sesion);
  if (!sesion) return null;
  const { usuario, conjuntoActivo } = sesion;
  const esAdmin = usuario.rol === 'ADMIN';
  const primerNombre = usuario.nombre.split(/\s+/)[0];
  const hechos = PASOS.filter((p) => p.hecho).length;

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
                {hechos} de {PASOS.length} completados
              </p>
              <div
                role="progressbar"
                aria-labelledby="progreso-etiqueta"
                aria-valuemin={0}
                aria-valuemax={PASOS.length}
                aria-valuenow={hechos}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-700 ease-out"
                  style={{ transform: `scaleX(${hechos / PASOS.length})` }}
                />
              </div>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PASOS.map((p, i) => (
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
                      <Circle aria-label="Pendiente" role="img" className="size-5 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-auto">
                      {esAdmin ? (
                        <Button asChild variant="outline" size="sm" className="max-sm:h-10">
                          <Link to={`/app/${conjuntoActivo.slug}/${p.ruta}`}>
                            {p.accion}
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
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
    </div>
  );
}
