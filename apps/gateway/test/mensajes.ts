/** Mensajes RFC 822 de prueba (solo para pruebas). */

export interface OpcionesMensaje {
  /** Message-ID; `null` = sin cabecera (para el id sintético). Por defecto, uno único. */
  id?: string | null;
  de?: string;
  asunto?: string;
  cuerpo?: string;
  /** Si se da, el mensaje es solo HTML. */
  html?: string;
  fecha?: Date;
  /** Cabeceras crudas al inicio, como las que agrega el servidor que recibe (Authentication-Results). */
  cabeceras?: string[];
  responderA?: string;
  /** Con adjuntos, el mensaje es multipart/mixed. */
  adjuntos?: { nombre: string; tipo: string }[];
}

let contador = 0;

const base64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** Asunto como encoded-word UTF-8 y cuerpo en base64, como los envía Gmail con tildes o emojis. */
export function mensajeCrudo(o: OpcionesMensaje = {}): Buffer {
  const id = o.id === undefined ? `<auto-${++contador}@prueba.local>` : o.id;
  const tipo = o.html !== undefined ? 'text/html' : 'text/plain';
  const cuerpo = o.html ?? o.cuerpo ?? 'Cuerpo de prueba';
  const cabeceras = [
    ...(o.cabeceras ?? []),
    `From: ${o.de ?? 'residente@mail.com'}`,
    'To: buzon@gmail.com',
    ...(o.responderA ? [`Reply-To: ${o.responderA}`] : []),
    `Subject: =?UTF-8?B?${base64(o.asunto ?? 'Prueba')}?=`,
    `Date: ${(o.fecha ?? new Date('2026-10-01T10:00:00Z')).toUTCString()}`,
    ...(id ? [`Message-ID: ${id}`] : []),
    'MIME-Version: 1.0',
  ];
  const parteCuerpo = [`Content-Type: ${tipo}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', base64(cuerpo)];
  if (!o.adjuntos?.length) return Buffer.from([...cabeceras, ...parteCuerpo].join('\r\n'), 'utf8');

  const limite = `limite-${contador}`;
  const partes = [
    ...cabeceras,
    `Content-Type: multipart/mixed; boundary="${limite}"`,
    '',
    `--${limite}`,
    ...parteCuerpo,
    ...o.adjuntos.flatMap((a) => [
      `--${limite}`,
      `Content-Type: ${a.tipo}; name="${a.nombre}"`,
      `Content-Disposition: attachment; filename="${a.nombre}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64('contenido de prueba'),
    ]),
    `--${limite}--`,
  ];
  return Buffer.from(partes.join('\r\n'), 'utf8');
}
