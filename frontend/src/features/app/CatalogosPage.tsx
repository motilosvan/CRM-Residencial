import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpenText,
  Clock,
  GitBranch,
  Search,
  ShieldAlert,
  Tag,
} from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import { InsigniaCategoria, InsigniaEstado, InsigniaPrioridad } from '@/components/InsigniasDominio';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { catalogosService } from '@/services';
import { clave } from '@/services/claves';
import type { CategoriaSolicitud, EstadoSolicitud, PrioridadSolicitud } from '@/services/contratos';
import { useSesion } from '@/store/sesion';

const ETIQUETA_CATEGORIA: Record<CategoriaSolicitud, string> = {
  SEGURIDAD: 'Seguridad',
  MANTENIMIENTO: 'Mantenimiento',
  FACTURACION: 'Facturación',
  ADMINISTRATIVO: 'Administrativo',
  SIN_CLASIFICAR: 'Sin clasificar',
};

const DESCRIPCION_PRIORIDAD: Record<PrioridadSolicitud, string> = {
  ALTA: 'Atención prioritaria e incidentes críticos o de seguridad.',
  MEDIA: 'Atención estándar del conjunto dentro del día hábil.',
  BAJA: 'Consultas o trámites programables de administración y facturación.',
};

const NOTA_TRANSICION: Record<string, string> = {
  'NUEVA->ASIGNADA': 'Se ejecuta únicamente al asignar un responsable (T2).',
  'ASIGNADA->EN_PROCESO': 'El responsable inicia la atención de la solicitud.',
  'EN_PROCESO->RESUELTA': 'Se registra la solución o respuesta entregada al residente.',
  'RESUELTA->CERRADA': 'Cierre definitivo del caso; libera la asignación activa.',
  'RESUELTA->EN_PROCESO': 'Reabre la solicitud para continuar su gestión.',
  'ASIGNADA->NUEVA': 'Desasigna la solicitud y la devuelve a la cola inicial.',
};

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function descripcionTransicion(origen: EstadoSolicitud, destino: EstadoSolicitud): string {
  return NOTA_TRANSICION[`${origen}->${destino}`] ?? 'Transición habilitada en el ciclo de vida.';
}

export default function CatalogosPage() {
  const sesion = useSesion((s) => s.sesion);
  const esMovil = useIsMobile();
  const [busqueda, setBusqueda] = useState('');
  const idBuscador = useId();

  const conjuntoId = sesion?.conjuntoActivo.id ?? '';
  const consulta = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'catalogos') : ['catalogos-inactivo'],
    queryFn: ({ signal }) => catalogosService.obtener(signal),
    enabled: !!sesion && !!conjuntoId,
  });

  if (!sesion) return null;

  const datos = consulta.data;
  const sinCatalogos =
    !!datos &&
    datos.categorias.length === 0 &&
    datos.prioridades.length === 0 &&
    datos.estados.length === 0 &&
    datos.transiciones.length === 0;

  const termino = normalizar(busqueda);
  const categoriasFiltradas = (datos?.categorias ?? [])
    .map((cat) => {
      if (!termino) {
        return { cat, palabrasVisibles: cat.palabrasClave, filtradoPorPalabra: false };
      }
      const etiqueta = ETIQUETA_CATEGORIA[cat.nombre] ?? cat.nombre;
      const coincideCategoria = normalizar(cat.nombre).includes(termino) || normalizar(etiqueta).includes(termino);
      const palabrasCoincidentes = cat.palabrasClave.filter((p) => normalizar(p).includes(termino));
      if (!coincideCategoria && palabrasCoincidentes.length === 0) return null;
      return {
        cat,
        palabrasVisibles: coincideCategoria ? cat.palabrasClave : palabrasCoincidentes,
        filtradoPorPalabra: !coincideCategoria,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h2 className="font-heading text-2xl font-semibold">Catálogos del dominio</h2>
        <p className="text-sm text-muted-foreground">
          Reglas oficiales de clasificación, prioridades SLA y ciclo de vida aplicadas por el motor del dominio y la base de
          datos.
        </p>
      </div>

      {consulta.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consulta.isError && !datos ? (
        <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />
      ) : sinCatalogos ? (
        <EmptyState
          icono={BookOpenText}
          titulo="No hay catálogos disponibles"
          descripcion="No encontramos categorías, prioridades ni estados configurados para mostrar."
        />
      ) : (
        datos && (
          <>
            <section aria-labelledby="titulo-categorias" className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h3 id="titulo-categorias" className="flex items-center gap-2 font-heading text-xl font-semibold">
                    <Tag aria-hidden="true" className="size-5 text-primary" />
                    Categorías oficiales y palabras clave
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Patrones evaluados en orden de desempate; el asunto del correo pesa el doble en la clasificación.
                  </p>
                </div>

                <div className="flex w-full items-center gap-2 sm:w-80">
                  <Label htmlFor={idBuscador} className="sr-only">
                    Buscar categorías o palabras clave
                  </Label>
                  <div className="relative min-w-0 flex-1">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id={idBuscador}
                      type="search"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Filtrar categoría o palabra clave"
                      className="pl-9 max-sm:h-10"
                    />
                  </div>
                  {busqueda && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="shrink-0 max-sm:h-10"
                      onClick={() => setBusqueda('')}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>

              {categoriasFiltradas.length === 0 ? (
                <EmptyState
                  variante="sin-resultados"
                  icono={Search}
                  titulo="No encontramos coincidencias"
                  descripcion="Ninguna categoría ni palabra clave coincide con tu búsqueda."
                  accion={
                    <Button type="button" variant="outline" className="max-sm:h-10" onClick={() => setBusqueda('')}>
                      Limpiar búsqueda
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {categoriasFiltradas.map(({ cat, palabrasVisibles, filtradoPorPalabra }) => (
                    <Card key={cat.id} className="min-w-0">
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <InsigniaCategoria categoria={cat.nombre} />
                            <Badge variant="outline" className="tabular-nums">
                              {cat.palabrasClave.length}{' '}
                              {cat.palabrasClave.length === 1 ? 'palabra clave' : 'palabras clave'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Prioridad base:</span>
                            <InsigniaPrioridad prioridad={cat.prioridadBase} />
                          </div>
                        </div>
                        {filtradoPorPalabra && (
                          <CardDescription>
                            Mostrando {palabrasVisibles.length} de {cat.palabrasClave.length} palabras clave coincidentes
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        {cat.palabrasClave.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Respaldo automático cuando ningún patrón coincide; ningún correo se descarta y puede
                            reclasificarse manualmente.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {palabrasVisibles.map((palabra) => (
                              <Badge key={palabra} variant="outline" className="font-normal">
                                {palabra}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="titulo-prioridades" className="flex flex-col gap-4">
              <div>
                <h3 id="titulo-prioridades" className="flex items-center gap-2 font-heading text-xl font-semibold">
                  <Clock aria-hidden="true" className="size-5 text-primary" />
                  Prioridades, tiempos SLA y señales de urgencia
                </h3>
                <p className="text-sm text-muted-foreground">
                  Acuerdos de nivel de servicio (SLA) y señales automáticas que elevan la atención.
                </p>
              </div>

              {esMovil ? (
                <ul className="flex flex-col gap-3">
                  {datos.prioridades.map((p) => (
                    <li key={p.id}>
                      <Card>
                        <CardContent className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <InsigniaPrioridad prioridad={p.nombre} />
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="tabular-nums">
                                {p.slaHoras} h
                              </Badge>
                              <Badge variant="secondary" className="tabular-nums">
                                Peso {p.peso}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">{DESCRIPCION_PRIORIDAD[p.nombre]}</p>
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
                          <TableHead className="pl-6">Prioridad</TableHead>
                          <TableHead>SLA máximo</TableHead>
                          <TableHead>Peso</TableHead>
                          <TableHead className="pr-6">Criterio de atención</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {datos.prioridades.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="pl-6">
                              <InsigniaPrioridad prioridad={p.nombre} />
                            </TableCell>
                            <TableCell className="font-medium tabular-nums">{p.slaHoras} h</TableCell>
                            <TableCell className="tabular-nums">{p.peso}</TableCell>
                            <TableCell className="pr-6 whitespace-normal text-muted-foreground">
                              {DESCRIPCION_PRIORIDAD[p.nombre]}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-heading text-lg">
                    <ShieldAlert aria-hidden="true" className="size-5 text-aviso" />
                    Señales de urgencia ({datos.palabrasClaveUrgencia.length})
                  </CardTitle>
                  <CardDescription>
                    Cualquier coincidencia en el asunto o el cuerpo eleva la solicitud a prioridad Alta.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Alert className="border-aviso bg-aviso-claro text-foreground">
                    <ShieldAlert aria-hidden="true" className="text-aviso" />
                    <AlertTitle>Reglas de prioridad del dominio</AlertTitle>
                    <AlertDescription className="text-foreground">
                      <p>Las señales de urgencia elevan la prioridad calculada a ALTA sin importar la categoría base.</p>
                      <p className="mt-1">
                        Además, las solicitudes de Seguridad (SEGURIDAD) nunca pueden quedar en prioridad BAJA.
                      </p>
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-wrap gap-1.5">
                    {datos.palabrasClaveUrgencia.map((senal) => (
                      <Badge key={senal} variant="outline" className="font-normal">
                        {senal}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="titulo-ciclo-vida" className="flex flex-col gap-4">
              <div>
                <h3 id="titulo-ciclo-vida" className="flex items-center gap-2 font-heading text-xl font-semibold">
                  <GitBranch aria-hidden="true" className="size-5 text-primary" />
                  Ciclo de vida y transiciones permitidas
                </h3>
                <p className="text-sm text-muted-foreground">
                  Estados vigentes y transiciones validadas en la tabla TRANSICIONES_ESTADO.
                </p>
              </div>

              <ul aria-label="Estados del ciclo de vida" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {datos.estados.map((est) => (
                  <li key={est.id} className="min-w-0">
                    <Card className="h-full min-w-0">
                      <CardContent className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <InsigniaEstado estado={est.nombre} />
                          {est.esFinal && <Badge variant="outline">Estado final</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {est.esFinal
                            ? 'No admite cambios posteriores ni nuevas asignaciones.'
                            : 'Estado operativo dentro del flujo de atención.'}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-lg">Transiciones permitidas ({datos.transiciones.length})</CardTitle>
                  <CardDescription>
                    La transición Nueva → Asignada se ejecuta únicamente al asignar un responsable (T2).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul aria-label="Transiciones permitidas" className="grid gap-3 md:grid-cols-2">
                    {datos.transiciones.map((t) => (
                      <li
                        key={`${t.origen}-${t.destino}`}
                        className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <InsigniaEstado estado={t.origen} />
                          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                          <InsigniaEstado estado={t.destino} />
                        </div>
                        <p className="text-xs text-muted-foreground">{descripcionTransicion(t.origen, t.destino)}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          </>
        )
      )}
    </div>
  );
}
