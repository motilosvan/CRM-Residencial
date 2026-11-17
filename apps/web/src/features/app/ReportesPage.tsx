import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import { InsigniaCategoria, InsigniaEstado, InsigniaPrioridad } from '@/components/InsigniasDominio';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatearDuracion } from '@/lib/formato';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { reportesService } from '@/services';
import { clave } from '@/services/claves';
import type { FiltroReporte } from '@/services/contratos';
import { useSesion } from '@/store/sesion';

function porcentajeBarra(valor: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((valor * 100) / total)));
}

export default function ReportesPage() {
  const sesion = useSesion((s) => s.sesion);
  const conjuntoId = sesion?.conjuntoActivo.id ?? '';

  const [desdeInput, setDesdeInput] = useState('');
  const [hastaInput, setHastaInput] = useState('');
  const [filtroAplicado, setFiltroAplicado] = useState<FiltroReporte>({});
  const [errorFiltro, setErrorFiltro] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  const idDesde = useId();
  const idHasta = useId();

  const consulta = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'reportes', filtroAplicado) : ['reportes-inactivo'],
    queryFn: ({ signal }) => reportesService.obtener(filtroAplicado, signal),
    enabled: !!sesion && !!conjuntoId,
  });

  if (!sesion) return null;

  const aplicarFiltro = (e: React.FormEvent) => {
    e.preventDefault();
    if (desdeInput && hastaInput && desdeInput > hastaInput) {
      setErrorFiltro('La fecha inicial debe ser menor o igual a la fecha final.');
      return;
    }
    setErrorFiltro(null);
    setFiltroAplicado({
      desde: desdeInput || undefined,
      hasta: hastaInput || undefined,
    });
  };

  const limpiarFiltro = () => {
    setDesdeInput('');
    setHastaInput('');
    setErrorFiltro(null);
    setFiltroAplicado({});
  };

  const manejarDescargarCsv = async () => {
    setDescargando(true);
    try {
      const csv = await reportesService.descargarCsv(filtroAplicado);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'reporte-solicitudes.csv';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
      toast.success('Reporte CSV descargado');
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setDescargando(false);
    }
  };

  const datos = consulta.data;
  const esVacio = !!datos && datos.totales.total === 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-semibold">Reportes</h2>
          <p className="text-sm text-muted-foreground">
            Indicadores de volumen, tiempos de primera respuesta, cumplimiento de SLA y carga por responsable.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={descargando || consulta.isPending}
          onClick={() => void manejarDescargarCsv()}
        >
          <Download aria-hidden="true" className="size-4" />
          {descargando ? 'Descargando…' : 'Descargar CSV'}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={aplicarFiltro} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={idDesde}>Desde</Label>
              <Input
                id={idDesde}
                type="date"
                value={desdeInput}
                onChange={(e) => setDesdeInput(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={idHasta}>Hasta</Label>
              <Input
                id={idHasta}
                type="date"
                value={hastaInput}
                onChange={(e) => setHastaInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Aplicar</Button>
              <Button type="button" variant="outline" onClick={limpiarFiltro}>
                Limpiar
              </Button>
            </div>
          </form>
          {errorFiltro && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{errorFiltro}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {consulta.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consulta.isError && !datos ? (
        <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />
      ) : esVacio ? (
        <EmptyState
          icono={BarChart3}
          titulo="Sin solicitudes en el periodo"
          descripcion="No hay solicitudes registradas para el rango de fechas seleccionado. Prueba limpiando el filtro."
          variante="sin-resultados"
          accion={
            (filtroAplicado.desde || filtroAplicado.hasta) && (
              <Button type="button" variant="outline" onClick={limpiarFiltro}>
                Ver todo el historial
              </Button>
            )
          }
        />
      ) : datos ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total solicitudes</CardDescription>
                <CardTitle className="font-heading text-2xl">{datos.totales.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Abiertas</CardDescription>
                <CardTitle className="font-heading text-2xl">{datos.totales.abiertas}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Resueltas y cerradas</CardDescription>
                <CardTitle className="font-heading text-2xl">
                  {datos.totales.resueltas + datos.totales.cerradas}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>% dentro de SLA</CardDescription>
                <CardTitle className="font-heading text-2xl">
                  {datos.global.porcentajeSla !== null ? `${datos.global.porcentajeSla}%` : '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Primera respuesta prom.</CardDescription>
                <CardTitle className="font-heading text-2xl">
                  {formatearDuracion(datos.global.minutosPromedio)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">Por estado</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {datos.porEstado.map((item) => {
                  const pct = porcentajeBarra(item.n, datos.totales.total);
                  return (
                    <div key={item.estado} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <InsigniaEstado estado={item.estado} />
                        <span className="font-medium text-foreground">
                          {item.n} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">Por categoría</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {datos.porCategoria.map((item) => {
                  const pct = porcentajeBarra(item.n, datos.totales.total);
                  return (
                    <div key={item.categoria} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <InsigniaCategoria categoria={item.categoria} />
                        <span className="font-medium text-foreground">
                          {item.n} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">Por prioridad</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {datos.porPrioridad.map((item) => {
                  const pct = porcentajeBarra(item.n, datos.totales.total);
                  return (
                    <div key={item.prioridad} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <InsigniaPrioridad prioridad={item.prioridad} />
                        <span className="font-medium text-foreground">
                          {item.n} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-base">
                  <FileSpreadsheet aria-hidden="true" className="size-4 text-primary" />
                  Tiempos de respuesta y SLA por categoría
                </CardTitle>
              </CardHeader>
              <CardContent>
                {datos.respuesta.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aún no hay solicitudes con primera respuesta registrada en este periodo.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-normal">Categoría</TableHead>
                        <TableHead className="whitespace-normal text-right">Respondidas</TableHead>
                        <TableHead className="whitespace-normal text-right">Prom. respuesta</TableHead>
                        <TableHead className="whitespace-normal text-right">Dentro SLA</TableHead>
                        <TableHead className="whitespace-normal text-right">% SLA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.respuesta.map((r) => (
                        <TableRow key={r.categoria}>
                          <TableCell>
                            <InsigniaCategoria categoria={r.categoria} />
                          </TableCell>
                          <TableCell className="text-right">{r.total}</TableCell>
                          <TableCell className="text-right">{formatearDuracion(r.minutosPromedio)}</TableCell>
                          <TableCell className="text-right">{r.dentroSla}</TableCell>
                          <TableCell className="text-right font-medium">{r.porcentajeSla}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">Carga por responsable (Soporte)</CardTitle>
              </CardHeader>
              <CardContent>
                {datos.carga.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay personal de soporte activo asignado en este conjunto.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Responsable</TableHead>
                        <TableHead className="text-right">Abiertas</TableHead>
                        <TableHead className="text-right">Resueltas en periodo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.carga.map((u) => (
                        <TableRow key={u.idUsuario}>
                          <TableCell className="font-medium">{u.nombre}</TableCell>
                          <TableCell className="text-right">{u.abiertas}</TableCell>
                          <TableCell className="text-right">{u.resueltasEnPeriodo}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
