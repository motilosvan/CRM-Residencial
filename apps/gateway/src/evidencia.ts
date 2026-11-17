import type { ParsedMail } from 'mailparser';
import type { Evidencia } from '../../api/src/modules/ingesta.js';

/**
 * Evidencia de seguridad que solo existe en el correo crudo: autenticación del remitente según Gmail,
 * Reply-To, nombre visible, destino real de los enlaces del HTML y adjuntos. T1 la analiza con las reglas
 * de `domain/seguridad.ts`. Aquí solo se extrae: ninguna decisión de riesgo vive en el gateway.
 */

/**
 * Servidor cuya cabecera Authentication-Results se cree. Cualquiera puede escribir esa cabecera en el correo
 * que envía; la verdadera es la que agrega el servidor que lo recibió (Gmail), arriba de todas.
 */
export const SERVIDOR_CONFIABLE = 'mx.google.com';

const MAX_ENLACES = 200;
const LIMITE_HTML = 500_000;

type Autenticacion = NonNullable<Evidencia['autenticacion']>;

/**
 * SPF/DKIM/DMARC de la PRIMERA cabecera Authentication-Results del servidor confiable (la más reciente, puesta
 * por Gmail). Las de otros servidores o más abajo se ignoran: pueden venir falsificadas por el remitente.
 */
export function autenticacionDe(
  lineas: readonly { key: string; line: string }[],
  servidor: string = SERVIDOR_CONFIABLE,
): Autenticacion | undefined {
  for (const { key, line } of lineas) {
    if (key.toLowerCase() !== 'authentication-results') continue;
    const valor = line.replace(/^[^:]*:/, '').replace(/\r?\n[ \t]+/g, ' ').trim();
    const autor = valor.split(';')[0]?.trim().split(/\s+/)[0]?.toLowerCase();
    if (autor !== servidor) continue;
    const r: Record<string, string> = {};
    for (const m of valor.matchAll(/\b(spf|dkim|dmarc)\s*=\s*([a-z]+)/gi)) {
      const metodo = m[1]!.toLowerCase();
      r[metodo] ??= m[2]!.toLowerCase(); // la primera firma de cada método
    }
    // T1 ignora un valor desconocido (p. ej. "bestguesspass") en vez de rechazar el correo.
    return r as Autenticacion;
  }
  return undefined;
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d{1,7});/g, (_, d: string) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const MAX_ETIQUETA = 2000;
const MAX_TEXTO_ENLACE = 1000;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * Destino real (href) y texto visible de los enlaces de un HTML (el texto plano del correo pierde los href).
 *
 * Recorrido lineal con indexOf, sin una expresión regular sobre todo el documento: una primera versión con
 * una sola regex tardó 189 s con un HTML de miles de `<a href="x"` sin cerrar (retroceso polinomial, ReDoS).
 * Las posiciones del próximo ">" y del próximo "</a" se reutilizan mientras sigan por delante, así cada
 * carácter se recorre un número acotado de veces. Las regex solo corren sobre trozos de tamaño acotado.
 */
export function enlacesDelHtml(html: string): { url: string; texto: string }[] {
  const h = html.slice(0, LIMITE_HTML);
  const bajo = h.toLowerCase();
  const enlaces: { url: string; texto: string }[] = [];
  let mayor = -2; // posición del próximo ">" (-1: no hay más; -2: sin calcular)
  let cierre = -2; // posición del próximo "</a"
  const proximo = (cache: number, aguja: string, desde: number) => (cache === -1 || cache >= desde ? cache : bajo.indexOf(aguja, desde));
  let i = 0;
  while (enlaces.length < MAX_ENLACES) {
    i = bajo.indexOf('<a', i);
    if (i === -1) break;
    if (!/[\s>/]/.test(bajo[i + 2] ?? '')) {
      i += 2; // <abbr>, <article>...
      continue;
    }
    mayor = proximo(mayor, '>', i);
    if (mayor === -1) break; // ninguna etiqueta más se cierra
    if (mayor - i > MAX_ETIQUETA) {
      i = mayor - MAX_ETIQUETA; // toda "<a" anterior tiene una etiqueta demasiado larga: se salta
      continue;
    }
    const href = HREF.exec(h.slice(i, mayor));
    i = mayor + 1;
    if (!href) continue;
    const url = decodificarEntidades((href[1] ?? href[2] ?? href[3] ?? '').trim());
    if (!url || url.startsWith('#') || /^(mailto|tel|cid):/i.test(url)) continue;
    cierre = proximo(cierre, '</a', i);
    const crudo = cierre !== -1 && cierre - i <= MAX_TEXTO_ENLACE ? h.slice(i, cierre) : '';
    const texto = decodificarEntidades(crudo.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    enlaces.push({ url, texto });
  }
  return enlaces;
}

/** Evidencia de un correo que mailparser pudo interpretar. */
export function evidenciaDe(p: ParsedMail): Evidencia {
  const de = p.from?.value.find((a) => a.address);
  return {
    nombreRemitente: de?.name || undefined,
    responderA: p.replyTo?.value.map((a) => a.address).filter((a): a is string => !!a),
    autenticacion: autenticacionDe(p.headerLines),
    enlaces: typeof p.html === 'string' ? enlacesDelHtml(p.html) : undefined,
    adjuntos: p.attachments.slice(0, 100).map((a) => ({ nombre: a.filename ?? '', tipo: a.contentType })),
  };
}

/** Evidencia mínima de un correo cuyo MIME no se pudo interpretar: solo las cabeceras crudas. */
export function evidenciaDeCabeceras(cabeceras: string): Evidencia {
  const lineas = cabeceras
    .split(/\r?\n/)
    .map((line) => ({ key: line.slice(0, Math.max(0, line.indexOf(':'))).trim(), line }))
    .filter((l) => l.key);
  const from = lineas.find((l) => l.key.toLowerCase() === 'from')?.line.replace(/^[^:]*:/, '').trim();
  const nombre = from?.includes('<') ? from.slice(0, from.indexOf('<')).replace(/["']/g, '').trim() : undefined;
  return { mimeIlegible: true, nombreRemitente: nombre || undefined, autenticacion: autenticacionDe(lineas) };
}
