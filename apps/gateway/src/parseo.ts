import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import type { CorreoEntrante } from '../../api/src/modules/ingesta.js';

/** De dónde salió el mensaje: alimenta el checkpoint (T6) que se guarda junto con el correo. */
export interface Contexto {
  cuenta: string;
  uidValidity: number;
  uid: number;
  fechaInterna?: Date;
}

const LIMITE_CRUDO_RESPALDO = 20_000;

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/**
 * Message-ID sintético para correos sin esa cabecera. Sale del contenido crudo, no del UID: el mismo
 * correo produce siempre el mismo id, aunque el servidor lo renumere (cambio de UIDVALIDITY), así que
 * reprocesarlo nunca lo duplica.
 */
export function messageIdSintetico(fuente: Buffer): string {
  return `<sin-id.${sha256(fuente)}@soc-crm.gateway>`;
}

const checkpointDe = (ctx: Contexto) => ({ cuenta: ctx.cuenta, uidValidity: ctx.uidValidity, uid: ctx.uid });

const fechaValida = (d: Date | undefined) => (d && !Number.isNaN(d.getTime()) ? d : undefined);

/** Respaldo si mailparser no entregara texto plano: quita etiquetas y entidades básicas. */
function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * RFC 822 crudo → entrada de T1. La fecha de recepción es la del servidor (INTERNALDATE): la cabecera
 * Date la escribe el remitente y puede venir errada o en el futuro. La normalización (remitente inválido,
 * recortes) la hace el esquema de T1, no este módulo.
 */
export async function aCorreoEntrante(fuente: Buffer, ctx: Contexto): Promise<CorreoEntrante> {
  const p = await simpleParser(fuente, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
  const remitente = p.from?.value.find((a) => a.address)?.address;
  const texto = p.text?.trim() || (typeof p.html === 'string' ? htmlATexto(p.html) : '');
  return {
    messageId: p.messageId?.trim() || messageIdSintetico(fuente),
    imapUid: ctx.uid,
    remitente,
    asunto: p.subject ?? '',
    cuerpo: texto,
    recibidoEn: fechaValida(ctx.fechaInterna) ?? fechaValida(p.date),
    checkpoint: checkpointDe(ctx),
  };
}

/**
 * Respaldo cuando el MIME no se puede interpretar (regla 8: un correo nunca se descarta). Rescata las
 * cabeceras con expresiones simples, guarda el inicio del mensaje crudo como cuerpo y lo marca
 * SIN_CLASIFICAR para que un humano lo revise.
 */
export function correoDeRespaldo(fuente: Buffer, ctx: Contexto): CorreoEntrante {
  const crudo = fuente.toString('utf8');
  const fin = crudo.search(/\r?\n\r?\n/);
  // Cabeceras "plegadas" en varias líneas se unen antes de buscar.
  const cabeceras = (fin >= 0 ? crudo.slice(0, fin) : crudo.slice(0, 8_000)).replace(/\r?\n[ \t]+/g, ' ');
  const cabecera = (nombre: string) => new RegExp(`^${nombre}:[ \\t]*(.*)$`, 'im').exec(cabeceras)?.[1]?.trim();
  const from = cabecera('from');
  return {
    messageId: cabecera('message-id') || messageIdSintetico(fuente),
    imapUid: ctx.uid,
    remitente: from?.match(/<([^>]+)>/)?.[1] ?? from,
    asunto: `(correo no procesable) ${cabecera('subject') ?? ''}`.trim(),
    cuerpo: crudo.slice(0, LIMITE_CRUDO_RESPALDO),
    recibidoEn: fechaValida(ctx.fechaInterna),
    sinClasificar: true,
    checkpoint: checkpointDe(ctx),
  };
}
