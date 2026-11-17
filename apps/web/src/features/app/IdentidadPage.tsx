import { useId, useState, type CSSProperties } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  Info,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AvatarConjunto, iniciales } from '@/components/AvatarConjunto';
import { AvisoConflicto } from '@/components/AvisoConflicto';
import { EsqueletoCarga } from '@/components/EsqueletoCarga';
import { EstadoError } from '@/components/EstadoError';
import { Isotipo } from '@/components/marca/Isotipo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { mensajeDeError } from '@/lib/mensajeDeError';
import { identidadService } from '@/services';
import { clave } from '@/services/claves';
import { ErrorApi, type ConjuntoIdentidad, type EntradaIdentidadConjunto } from '@/services/contratos';
import { useSesion } from '@/store/sesion';
import { aplicarTema } from '@/tema/aplicarTema';
import { derivarTema, validarPaleta } from '@/tema/derivarTema';
import { PALETA_MAILFLOW, type Paleta } from '@/tema/paletas';

const HEX_6 = /^#[0-9a-fA-F]{6}$/;

function tieneCaracterInvalidoUrl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127 || /\s/.test(s[i])) return true;
  }
  return false;
}

function errorLogoUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.length > 500 || tieneCaracterInvalidoUrl(s)) {
    return 'URL de logo inválida (máximo 500 caracteres, sin espacios)';
  }
  if (s.startsWith('/')) {
    if (s.startsWith('//') || s.includes('\\')) {
      return 'La ruta relativa del logo debe iniciar con / simple';
    }
    return null;
  }
  try {
    const u = new URL(s);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.length > 0) return null;
  } catch {
    // URL inválida: reporta mensaje debajo.
  }
  return 'El logo debe ser una URL http(s):// o una ruta relativa /...';
}

const esquemaColorHex = z
  .string()
  .trim()
  .refine((v) => !v || HEX_6.test(v), 'Escribe un color hexadecimal válido (#RRGGBB)');

const esquemaIdentidad = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1, 'Escribe el nombre del conjunto')
      .max(120, 'El nombre no puede superar 120 caracteres'),
    logoUrl: z.string().superRefine((raw, ctx) => {
      const msg = errorLogoUrl(raw);
      if (msg) ctx.addIssue({ code: 'custom', message: msg });
    }),
    colorPrimario: esquemaColorHex,
    colorAcento: esquemaColorHex,
    colorSecundario: esquemaColorHex,
  })
  .superRefine((v, ctx) => {
    const p = v.colorPrimario.trim();
    const a = v.colorAcento.trim();
    const s = v.colorSecundario.trim();
    if (p && !a) {
      ctx.addIssue({
        code: 'custom',
        path: ['colorAcento'],
        message: 'Indica también el color de acento junto con el color primario',
      });
    }
    if (!p && a) {
      ctx.addIssue({
        code: 'custom',
        path: ['colorPrimario'],
        message: 'Indica también el color primario junto con el color de acento',
      });
    }
    if (s && (!p || !a)) {
      ctx.addIssue({
        code: 'custom',
        path: ['colorSecundario'],
        message: 'Para usar un color secundario debes definir primario y acento',
      });
    }
  });

type ValoresIdentidad = z.infer<typeof esquemaIdentidad>;

type CampoColorNombre = 'colorPrimario' | 'colorAcento' | 'colorSecundario';

interface EvaluacionPaletaVivo {
  estado: 'predeterminada' | 'incompleta' | 'invalida-hex' | 'valida' | 'falla-aa';
  paletaTema: Paleta;
  problemas: ReturnType<typeof validarPaleta>['problemas'];
}

function evaluarPaletaEnVivo(primarioRaw: string, acentoRaw: string, secundarioRaw: string): EvaluacionPaletaVivo {
  const p = primarioRaw.trim();
  const a = acentoRaw.trim();
  const s = secundarioRaw.trim();

  if (!p && !a && !s) {
    return { estado: 'predeterminada', paletaTema: PALETA_MAILFLOW, problemas: [] };
  }
  if ((p && !HEX_6.test(p)) || (a && !HEX_6.test(a)) || (s && !HEX_6.test(s))) {
    return { estado: 'invalida-hex', paletaTema: PALETA_MAILFLOW, problemas: [] };
  }
  if (!p || !a) {
    return { estado: 'incompleta', paletaTema: PALETA_MAILFLOW, problemas: [] };
  }

  const paleta: Paleta = {
    primario: p.toUpperCase(),
    acento: a.toUpperCase(),
    ...(s ? { secundario: s.toUpperCase() } : {}),
  };
  const resultado = validarPaleta(paleta);
  return {
    estado: resultado.valida ? 'valida' : 'falla-aa',
    paletaTema: resultado.valida ? paleta : PALETA_MAILFLOW,
    problemas: resultado.problemas,
  };
}

function CampoColor({
  control,
  name,
  etiqueta,
  etiquetaSelector,
  placeholder,
  valorRespaldo,
  opcional = false,
  alLimpiar,
}: {
  control: Control<ValoresIdentidad>;
  name: CampoColorNombre;
  etiqueta: string;
  etiquetaSelector: string;
  placeholder: string;
  valorRespaldo: string;
  opcional?: boolean;
  alLimpiar?: () => void;
}) {
  const idTexto = useId();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const limpio = field.value.trim();
        const valorSelector = HEX_6.test(limpio) ? limpio.toLowerCase() : valorRespaldo.toLowerCase();
        return (
          <FormItem>
            <FormLabel htmlFor={idTexto}>{etiqueta}</FormLabel>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={etiquetaSelector}
                value={valorSelector}
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:h-10"
              />
              <FormControl>
                <Input
                  id={idTexto}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={placeholder}
                  maxLength={7}
                  className="font-mono uppercase max-sm:h-10"
                />
              </FormControl>
              {opcional && limpio !== '' && alLimpiar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 max-sm:h-10"
                  onClick={alLimpiar}
                >
                  Quitar
                </Button>
              )}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function VistaPreviaIdentidad({
  nombre,
  logoUrl,
  evaluacion,
}: {
  nombre: string;
  logoUrl: string;
  evaluacion: EvaluacionPaletaVivo;
}) {
  const [urlFallida, setUrlFallida] = useState<string | null>(null);

  const nombreVisible = nombre.trim() || 'Nombre del conjunto';
  const urlTrim = logoUrl.trim();
  const logoSeguro = urlTrim && errorLogoUrl(urlTrim) === null ? urlTrim : null;
  const falloCarga = Boolean(logoSeguro && urlFallida === logoSeguro);
  const variablesPreview = derivarTema(evaluacion.paletaTema) as CSSProperties;

  return (
    <section aria-label="Vista previa de identidad" className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Vista previa en vivo</CardTitle>
          <CardDescription>
            Así se verán el encabezado, los botones y las insignias dentro del panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {evaluacion.estado === 'falla-aa' && (
            <p className="text-xs font-medium text-aviso">
              Mostrando respaldo de MailFlow porque la paleta actual no alcanza contraste AA.
            </p>
          )}
          <div
            style={variablesPreview}
            className="overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xs"
          >
            <div className="flex items-center gap-3 border-b border-border bg-sidebar px-4 py-3 text-sidebar-foreground">
              {logoSeguro && !falloCarga ? (
                <img
                  key={logoSeguro}
                  src={logoSeguro}
                  alt={`Logo de ${nombreVisible}`}
                  onError={() => setUrlFallida(logoSeguro)}
                  className="size-10 shrink-0 rounded-full border border-border bg-card object-cover"
                />
              ) : (
                <AvatarConjunto conjunto={{ nombre: nombreVisible }} tamano="lg" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading text-sm font-semibold">{nombreVisible}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Isotipo className="size-3.5 text-sidebar-primary" />
                  Impulsado por MailFlow
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary-claro px-2.5 py-0.5 text-xs font-medium text-primary">
                Activo
              </span>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary-claro px-2.5 py-1 text-xs font-medium text-primary">
                  Nueva
                </span>
                <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  En revisión
                </span>
                <span className="rounded-md bg-acento px-2.5 py-1 text-xs font-medium text-acento-foreground">
                  Destacada
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
                  Acción principal
                </span>
                <span className="inline-flex h-8 items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground">
                  Secundaria
                </span>
              </div>

              {!logoSeguro && (
                <p className="text-xs text-muted-foreground">
                  Iniciales de respaldo: <strong className="font-semibold text-foreground">{iniciales(nombreVisible)}</strong>
                </p>
              )}
            </div>
          </div>

          {falloCarga && (
            <p className="text-xs text-aviso">
              No se pudo cargar la imagen del logo; el panel mostrará las iniciales de respaldo.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function PanelContrasteWcag({ evaluacion }: { evaluacion: EvaluacionPaletaVivo }) {
  return (
    <section aria-label="Validación de contraste WCAG AA">
      {evaluacion.estado === 'predeterminada' && (
        <Alert className="border-exito bg-exito-claro text-foreground">
          <CircleCheck aria-hidden="true" className="text-exito" />
          <AlertTitle>Paleta predeterminada de MailFlow</AlertTitle>
          <AlertDescription className="text-foreground">
            Cumple contraste WCAG AA (mínimo 4.5:1) en todos los textos y controles del panel.
          </AlertDescription>
        </Alert>
      )}

      {evaluacion.estado === 'valida' && (
        <Alert className="border-exito bg-exito-claro text-foreground">
          <CircleCheck aria-hidden="true" className="text-exito" />
          <AlertTitle>Cumple contraste WCAG AA</AlertTitle>
          <AlertDescription className="text-foreground">
            Todos los pares evaluados superan la relación mínima 4.5:1. El panel aplicará esta paleta al guardar.
          </AlertDescription>
        </Alert>
      )}

      {evaluacion.estado === 'incompleta' && (
        <Alert className="border-aviso bg-aviso-claro text-foreground">
          <Info aria-hidden="true" className="text-aviso" />
          <AlertTitle>Paleta incompleta</AlertTitle>
          <AlertDescription className="text-foreground">
            Completa el color primario y el color de acento para evaluar el contraste WCAG AA.
          </AlertDescription>
        </Alert>
      )}

      {evaluacion.estado === 'invalida-hex' && (
        <Alert className="border-aviso bg-aviso-claro text-foreground">
          <Info aria-hidden="true" className="text-aviso" />
          <AlertTitle>Formato de color pendiente</AlertTitle>
          <AlertDescription className="text-foreground">
            Escribe colores hexadecimales de 6 dígitos (#RRGGBB) para evaluar el contraste WCAG AA.
          </AlertDescription>
        </Alert>
      )}

      {evaluacion.estado === 'falla-aa' && (
        <Alert className="border-aviso bg-aviso-claro text-foreground">
          <TriangleAlert aria-hidden="true" className="text-aviso" />
          <AlertTitle>No cumple contraste WCAG AA</AlertTitle>
          <AlertDescription className="text-foreground">
            <p>
              Si guardas esta paleta, el panel usará el respaldo de MailFlow hasta que todos los pares alcancen al menos
              4.5:1:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
              {evaluacion.problemas.map((p) => (
                <li key={p.par}>
                  <span className="font-medium">{p.par}</span>: relación {p.razon}:1 (mínimo {p.minimo}:1)
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function FormularioIdentidad({
  conjuntoId,
  identidad,
  alRecargar,
}: {
  conjuntoId: string;
  identidad: ConjuntoIdentidad;
  alRecargar: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [hayConflicto, setHayConflicto] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);

  const idNombre = useId();
  const idLogo = useId();

  const form = useForm<ValoresIdentidad>({
    resolver: zodResolver(esquemaIdentidad),
    defaultValues: {
      nombre: identidad.nombre,
      logoUrl: identidad.logoUrl ?? '',
      colorPrimario: identidad.paleta?.primario ?? '',
      colorAcento: identidad.paleta?.acento ?? '',
      colorSecundario: identidad.paleta?.secundario ?? '',
    },
  });

  const valoresEnVivo = useWatch({ control: form.control });
  const nombreVivo = valoresEnVivo.nombre ?? identidad.nombre;
  const logoVivo = valoresEnVivo.logoUrl ?? '';
  const primarioVivo = valoresEnVivo.colorPrimario ?? '';
  const acentoVivo = valoresEnVivo.colorAcento ?? '';
  const secundarioVivo = valoresEnVivo.colorSecundario ?? '';

  const evaluacion = evaluarPaletaEnVivo(primarioVivo, acentoVivo, secundarioVivo);

  const mutacion = useMutation({
    mutationFn: (valores: ValoresIdentidad) => {
      const p = valores.colorPrimario.trim();
      const a = valores.colorAcento.trim();
      const s = valores.colorSecundario.trim();
      const entrada: EntradaIdentidadConjunto = {
        nombre: valores.nombre.trim(),
        logoUrl: valores.logoUrl.trim() || null,
        colorPrimario: p ? p.toUpperCase() : null,
        colorAcento: a ? a.toUpperCase() : null,
        colorSecundario: p && a && s ? s.toUpperCase() : null,
        versionEsperada: identidad.version,
      };
      return identidadService.actualizar(entrada);
    },
    onSuccess: async (respuesta) => {
      setHayConflicto(false);
      setErrorFormulario(null);
      queryClient.setQueryData(clave(conjuntoId, 'identidad'), respuesta);
      useSesion.getState().actualizarConjunto(respuesta);
      aplicarTema(respuesta.paleta);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clave(conjuntoId, 'identidad') }),
        queryClient.invalidateQueries({ queryKey: ['conjuntos'] }),
      ]);
      toast.success('Identidad del conjunto actualizada');
    },
    onError: (error) => {
      if (error instanceof ErrorApi && error.tipo === 'CONFLICTO') {
        setErrorFormulario(null);
        setHayConflicto(true);
      } else {
        setHayConflicto(false);
        setErrorFormulario(mensajeDeError(error));
      }
    },
  });

  function restablecerPaletaMailFlow() {
    setErrorFormulario(null);
    form.setValue('colorPrimario', '', { shouldValidate: false, shouldDirty: true });
    form.setValue('colorAcento', '', { shouldValidate: false, shouldDirty: true });
    form.setValue('colorSecundario', '', { shouldValidate: false, shouldDirty: true });
    form.clearErrors(['colorPrimario', 'colorAcento', 'colorSecundario']);
    void form.trigger(['colorPrimario', 'colorAcento', 'colorSecundario']);
  }

  function enviar(valores: ValoresIdentidad) {
    setErrorFormulario(null);
    setHayConflicto(false);
    mutacion.mutate(valores);
  }

  async function manejarRecarga() {
    setHayConflicto(false);
    setErrorFormulario(null);
    await alRecargar();
  }

  const respaldoSecundario = HEX_6.test(primarioVivo.trim()) ? primarioVivo.trim() : PALETA_MAILFLOW.primario;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-7">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 font-heading text-lg">
                  <Palette aria-hidden="true" className="size-5 text-primary" />
                  Configuración visual
                </CardTitle>
                <CardDescription>Identificador del conjunto: {identidad.slug}</CardDescription>
              </div>
              <Badge variant="outline" className="tabular-nums">
                Versión {identidad.version}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={(e) => void form.handleSubmit(enviar)(e)} noValidate className="grid gap-5">
                {hayConflicto && <AvisoConflicto alRecargar={() => void manejarRecarga()} />}

                {errorFormulario && (
                  <Alert className="border-destructive bg-destructive-claro text-foreground">
                    <TriangleAlert aria-hidden="true" className="text-destructive" />
                    <AlertDescription className="text-foreground">{errorFormulario}</AlertDescription>
                  </Alert>
                )}

                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor={idNombre}>Nombre del conjunto</FormLabel>
                      <FormControl>
                        <Input
                          id={idNombre}
                          placeholder="Ej. Parque Central de Occidente"
                          maxLength={120}
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
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor={idLogo}>URL del logo (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          id={idLogo}
                          placeholder="https://... o /logos/conjunto.png"
                          maxLength={500}
                          className="max-sm:h-10"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Acepta direcciones http(s):// o rutas relativas que inicien con /. Déjalo vacío para usar iniciales.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-semibold">Paleta de colores</h3>
                    <p className="text-xs text-muted-foreground">
                      Usa formato hexadecimal #RRGGBB o restablece la paleta oficial de MailFlow.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="max-sm:h-10"
                    onClick={restablecerPaletaMailFlow}
                  >
                    <RotateCcw aria-hidden="true" />
                    Restablecer paleta MailFlow
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoColor
                    control={form.control}
                    name="colorPrimario"
                    etiqueta="Color primario"
                    etiquetaSelector="Selector visual de color primario"
                    placeholder={PALETA_MAILFLOW.primario}
                    valorRespaldo={PALETA_MAILFLOW.primario}
                  />

                  <CampoColor
                    control={form.control}
                    name="colorAcento"
                    etiqueta="Color de acento"
                    etiquetaSelector="Selector visual de color de acento"
                    placeholder={PALETA_MAILFLOW.acento}
                    valorRespaldo={PALETA_MAILFLOW.acento}
                  />
                </div>

                <CampoColor
                  control={form.control}
                  name="colorSecundario"
                  etiqueta="Color secundario (opcional)"
                  etiquetaSelector="Selector visual de color secundario"
                  placeholder="Derivado automáticamente si se omite"
                  valorRespaldo={respaldoSecundario}
                  opcional
                  alLimpiar={() => form.setValue('colorSecundario', '', { shouldValidate: true, shouldDirty: true })}
                />

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <Button type="submit" className="max-sm:h-10 max-sm:w-full" disabled={mutacion.isPending}>
                    {mutacion.isPending ? (
                      <>
                        <Loader2 aria-hidden="true" className="animate-spin" />
                        Guardando…
                      </>
                    ) : (
                      <>
                        <Save aria-hidden="true" />
                        Guardar cambios
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
        <PanelContrasteWcag evaluacion={evaluacion} />
        <VistaPreviaIdentidad nombre={nombreVivo} logoUrl={logoVivo} evaluacion={evaluacion} />
      </div>
    </div>
  );
}

export default function IdentidadPage() {
  const sesion = useSesion((s) => s.sesion);
  const conjuntoId = sesion?.conjuntoActivo.id ?? '';
  const [revisionRecarga, setRevisionRecarga] = useState(0);

  const consulta = useQuery({
    queryKey: conjuntoId ? clave(conjuntoId, 'identidad') : ['identidad-inactiva'],
    queryFn: ({ signal }) => identidadService.obtener(signal),
    enabled: !!sesion && !!conjuntoId,
  });

  if (!sesion) return null;

  async function manejarRecarga() {
    await consulta.refetch();
    setRevisionRecarga((r) => r + 1);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold">Identidad del conjunto</h2>
        <p className="text-sm text-muted-foreground">
          Personaliza el nombre visible, el logo y los colores de {sesion.conjuntoActivo.nombre} verificando contraste WCAG AA.
        </p>
      </div>

      {consulta.isPending ? (
        <EsqueletoCarga className="min-h-0 p-0" />
      ) : consulta.isError && !consulta.data ? (
        <EstadoError mensaje={mensajeDeError(consulta.error)} alReintentar={() => void consulta.refetch()} />
      ) : (
        consulta.data && (
          <FormularioIdentidad
            key={`${consulta.data.id}-${consulta.data.version}-${revisionRecarga}`}
            conjuntoId={conjuntoId}
            identidad={consulta.data}
            alRecargar={manejarRecarga}
          />
        )
      )}
    </div>
  );
}
