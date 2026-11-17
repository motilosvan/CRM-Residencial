import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Search } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatearFechaHora } from '@/lib/formato';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { auditoriaService } from '@/services';
import { clave } from '@/services/claves';
import type { TipoEventoAuditoria } from '@/services/contratos';
import { useSesion } from '@/store/sesion';

const LIMITE_PAGINA = 20;

const ETIQUETA_TIPO: Record<TipoEventoAuditoria, { texto: string; clase: string }> = {
  ESTADO: { texto: 'Estado', clase: 'bg-primary-claro text-primary' },
  ASIGNACION: { texto: 'Asignación', clase: 'bg-secondary text-secondary-foreground' },
  ADMIN: { texto: 'Admin', clase: 'bg-aviso-claro text-aviso' },
};

function enlaceSolicitud(slug: string, entidad: string, codigo: string): string | null {
  if (entidad !== 'SOLICITUD') return null;
  const match = /^SOL-(\d+)$/.exec(codigo);
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return `/app/${slug}/solicitudes?id=${id}`;
}

export default function AuditoriaPage() {
  const sesion = useSesion((s) => s.sesion);
  const conjuntoId = sesion?.conjuntoActivo.id ?? '';
  const slug = sesion?.conjuntoActivo.slug ?? '';

  const [busquedaInput, setBusquedaInput] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [desplazamiento, setDesplazamiento] = useState(0);

  const idBuscador = useId();

  const consulta = useQuery({
    queryKey: conjuntoId
      ? clave(conjuntoId, 'auditoria', { q: busquedaAplicada, limite: LIMITE_PAGINA, desplazamiento })
      : ['auditoria-inactiva'],
    queryFn: ({ signal }) =>
      auditoriaService.listar(
        { q: busquedaAplicada || undefined, limite: LIMITE_PAGINA, desplazamiento },
        signal,
      ),
    enabled: !!sesion && !!conjuntoId,
  });

  if (!sesion) return null;

  const ejecutarBusqueda = (e: React.FormEvent) => {
    e.preventDefault();
    setDesplazamiento(0);
    setBusquedaAplicada(busquedaInput.trim());
  };

  const limpiarBusqueda = () => {
    setBusquedaInput('');
    setBusquedaAplicada('');
    setDesplazamiento(0);
  };

  const datos = consulta.data;
  const total = datos?.total ?? 0;
  const eventos = datos?.eventos ?? [];
  const hayAnterior = desplazamiento > 0;
  const haySiguiente = desplazamiento + LIMITE_PAGINA < total;
  const inicioRango = total === 0 ? 0 : desplazamiento + 1;
  const finRango = Math.min(total, desplazamiento + eventos.length);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold">Auditoría global</h2>
        <p className="text-sm text-muted-foreground">
          Bitácora cronológica de cambios de estado, asignaciones y acciones administrativas del conjunto.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={ejecutarBusqueda} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={idBuscador}>Buscar en la bitácora</Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id={idBuscador}
                  value={busquedaInput}
                  onChange={(e) => setBusquedaInput(e.target.value)}
                  placeholder="Código SOL-..., actor, acción o detalle"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Buscar</Button>
              {busquedaAplicada && (
                <Button type="button" variant="outline" onClick={limpiarBusqueda}>
                  Limpiar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {consulta.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consulta.isError && !datos ? (
        <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />
      ) : eventos.length === 0 ? (
        <EmptyState
          icono={History}
          titulo={busquedaAplicada ? 'Sin eventos que coincidan' : 'Aún no hay eventos registrados'}
          descripcion={
            busquedaAplicada
              ? 'No encontramos registros con ese criterio. Prueba con otro código o actor.'
              : 'Aquí aparecerán los cambios de estado, asignaciones y acciones administrativas.'
          }
          variante={busquedaAplicada ? 'sin-resultados' : 'sin-datos'}
          accion={
            busquedaAplicada && (
              <Button type="button" variant="outline" onClick={limpiarBusqueda}>
                Limpiar búsqueda
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Entidad / Código</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventos.map((ev, idx) => {
                  const def = ETIQUETA_TIPO[ev.tipo] ?? {
                    texto: ev.tipo,
                    clase: 'bg-muted text-muted-foreground',
                  };
                  const href = enlaceSolicitud(slug, ev.entidad, ev.codigo);
                  return (
                    <TableRow key={`${ev.tipo}-${ev.codigo}-${ev.fecha}-${idx}`}>
                      <TableCell>
                        <Badge variant="secondary" className={def.clase}>
                          {def.texto}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {href ? (
                            <Link to={href} className="font-medium text-primary hover:underline">
                              {ev.codigo}
                            </Link>
                          ) : (
                            <span className="font-medium">{ev.codigo}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{ev.entidad}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal font-medium">{ev.accion}</TableCell>
                      <TableCell className="whitespace-normal">{ev.actor}</TableCell>
                      <TableCell className="max-w-44 whitespace-normal break-words text-muted-foreground">
                        {ev.detalle ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {formatearFechaHora(ev.fecha)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {inicioRango}–{finRango} de {total} eventos
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hayAnterior}
                  onClick={() => setDesplazamiento((d) => Math.max(0, d - LIMITE_PAGINA))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!haySiguiente}
                  onClick={() => setDesplazamiento((d) => d + LIMITE_PAGINA)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
