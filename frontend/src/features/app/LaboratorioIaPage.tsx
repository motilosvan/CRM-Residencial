import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FlaskConical, ShieldCheck, Sparkles } from 'lucide-react';
import { InsigniaCategoria, InsigniaPrioridad } from '@/components/InsigniasDominio';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { laboratorioService } from '@/services';
import type { EntradaLaboratorio } from '@/services/contratos';
import { useSesion } from '@/store/sesion';

interface EjemploRapido {
  id: string;
  etiqueta: string;
  asunto: string;
  cuerpo: string;
}

const EJEMPLOS_RAPIDOS: EjemploRapido[] = [
  {
    id: 'seguridad',
    etiqueta: 'Seguridad urgente',
    asunto: 'Robo en apto 302 — urgente',
    cuerpo:
      'Soy Residente Demo, CC 1023456789, cel 3101234567, correo residente@demo.mailflow.test. Hubo un robo en portería.',
  },
  {
    id: 'mantenimiento',
    etiqueta: 'Mantenimiento con placa',
    asunto: 'Gotera en parqueadero del vehículo ABC123',
    cuerpo:
      'Buenos días, reporto fuga de agua sobre el carro placa ABC123 en torre 2. Teléfono 3119876543.',
  },
  {
    id: 'facturacion',
    etiqueta: 'Facturación',
    asunto: 'Consulta sobre cobro de cuota de administración',
    cuerpo:
      'Solicito revisión de la factura y paz y salvo del apartamento 405. Correo contacto@demo.mailflow.test.',
  },
];

export default function LaboratorioIaPage() {
  const sesion = useSesion((s) => s.sesion);

  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const idAsunto = useId();
  const idCuerpo = useId();

  const mutacion = useMutation({
    mutationFn: (entrada: EntradaLaboratorio) => laboratorioService.probar(entrada),
  });

  if (!sesion) return null;

  const ejecutarPrueba = (entrada: EntradaLaboratorio) => {
    if (!entrada.asunto.trim() && !entrada.cuerpo.trim()) {
      setErrorValidacion('Escribe al menos un asunto o un cuerpo para ejecutar la prueba.');
      return;
    }
    setErrorValidacion(null);
    mutacion.mutate(entrada);
  };

  const manejarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutarPrueba({ asunto, cuerpo });
  };

  const probarEjemplo = (ej: EjemploRapido) => {
    setAsunto(ej.asunto);
    setCuerpo(ej.cuerpo);
    ejecutarPrueba({ asunto: ej.asunto, cuerpo: ej.cuerpo });
  };

  const resultado = mutacion.data;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold">Laboratorio IA</h2>
        <p className="text-sm text-muted-foreground">
          Simula paso a paso el enmascarado Ley 1581, la clasificación y la priorización antes de aplicarlo en la bandeja.
        </p>
      </div>

      <Alert>
        <ShieldCheck aria-hidden="true" className="size-4" />
        <AlertTitle>Ejecución en memoria sin escritura</AlertTitle>
        <AlertDescription>
          Las pruebas de este laboratorio se ejecutan únicamente en memoria y no crean correos ni solicitudes en la base
          de datos.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Correo de prueba</CardTitle>
            <CardDescription>
              Ingresa un asunto y un cuerpo ficticio, o elige un ejemplo rápido para probar en un clic.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {EJEMPLOS_RAPIDOS.map((ej) => (
                <Button
                  key={ej.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutacion.isPending}
                  onClick={() => probarEjemplo(ej)}
                >
                  {ej.etiqueta}
                </Button>
              ))}
            </div>

            <form onSubmit={manejarSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={idAsunto}>Asunto</Label>
                <Input
                  id={idAsunto}
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  placeholder="Ej. Fuga de agua en apartamento 204"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={idCuerpo}>Cuerpo del mensaje</Label>
                <Textarea
                  id={idCuerpo}
                  rows={6}
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  placeholder="Escribe el texto del correo para observar el enmascarado y la clasificación…"
                />
              </div>

              {errorValidacion && (
                <Alert variant="destructive">
                  <AlertDescription>{errorValidacion}</AlertDescription>
                </Alert>
              )}

              {mutacion.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{mensajeDeError(mutacion.error)}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={mutacion.isPending}>
                  <FlaskConical aria-hidden="true" className="size-4" />
                  {mutacion.isPending ? 'Analizando…' : 'Probar clasificación'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {!resultado ? (
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-base">
                  <Sparkles aria-hidden="true" className="size-4 text-primary" />
                  Resultado paso a paso
                </CardTitle>
                <CardDescription>
                  Ejecuta una prueba para ver cómo se protegen los datos personales y qué reglas de clasificación coinciden.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="flex list-inside list-decimal flex-col gap-2 text-sm text-muted-foreground">
                  <li>Paso 1 — Enmascarado Ley 1581 de nombres, documentos, teléfonos, correos, unidades y placas.</li>
                  <li>Paso 2 — Categoría sugerida, prioridad calculada y palabras clave detectadas.</li>
                </ol>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-base">Paso 1 — Enmascarado Ley 1581</CardTitle>
                  <CardDescription>
                    Texto limpio que se enviaría al motor de análisis sin exponer datos personales.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Asunto enmascarado</p>
                    <p className="mt-1 rounded-md bg-muted p-2.5 text-sm">
                      {resultado.asuntoEnmascarado || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Cuerpo enmascarado</p>
                    <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2.5 text-sm">
                      {resultado.cuerpoEnmascarado || '—'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-base">Paso 2 — Clasificación y prioridad</CardTitle>
                  <CardDescription>
                    Resultado determinista del clasificador y priorizador del dominio.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-6">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Categoría</span>
                      <div>
                        <InsigniaCategoria categoria={resultado.categoria} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Prioridad</span>
                      <div>
                        <InsigniaPrioridad prioridad={resultado.prioridad} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Palabras clave detectadas</span>
                    {resultado.palabrasDetectadas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Sin coincidencias directas; se asignó la categoría y prioridad por defecto.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {resultado.palabrasDetectadas.map((palabra) => (
                          <Badge key={palabra} variant="outline">
                            {palabra}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
