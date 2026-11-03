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
}

let contador = 0;

/** Asunto como encoded-word UTF-8 y cuerpo en base64, como los envía Gmail con tildes o emojis. */
export function mensajeCrudo(o: OpcionesMensaje = {}): Buffer {
  const id = o.id === undefined ? `<auto-${++contador}@prueba.local>` : o.id;
  const asunto = `=?UTF-8?B?${Buffer.from(o.asunto ?? 'Prueba', 'utf8').toString('base64')}?=`;
  const tipo = o.html !== undefined ? 'text/html' : 'text/plain';
  const cuerpo = o.html ?? o.cuerpo ?? 'Cuerpo de prueba';
  const lineas = [
    `From: ${o.de ?? 'residente@mail.com'}`,
    'To: buzon@gmail.com',
    `Subject: ${asunto}`,
    `Date: ${(o.fecha ?? new Date('2026-10-01T10:00:00Z')).toUTCString()}`,
    ...(id ? [`Message-ID: ${id}`] : []),
    'MIME-Version: 1.0',
    `Content-Type: ${tipo}; charset=utf-8`,
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(cuerpo, 'utf8').toString('base64'),
  ];
  return Buffer.from(lineas.join('\r\n'), 'utf8');
}
