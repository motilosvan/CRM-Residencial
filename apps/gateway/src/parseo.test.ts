import { describe, expect, it } from 'vitest';
import { esErrorDeCertificado, filtrarMayores } from './fuente.js';
import { aCorreoEntrante, correoDeRespaldo, messageIdSintetico } from './parseo.js';
import { mensajeCrudo } from '../test/mensajes.js';

const ctx = { cuenta: 'buzon@gmail.com/INBOX', uidValidity: 9, uid: 15 };

describe('Gateway · aCorreoEntrante (mailparser)', () => {
  it('extrae Message-ID, dirección del remitente, asunto, cuerpo y el checkpoint del contexto', async () => {
    const fuente = mensajeCrudo({ id: '<abc-1@mail.gmail.com>', de: 'Ana Pérez <Ana@Mail.com>', asunto: 'Fuga en el baño', cuerpo: 'Hay agua en el piso.' });
    const c = await aCorreoEntrante(fuente, ctx);
    expect(c).toMatchObject({
      messageId: '<abc-1@mail.gmail.com>', remitente: 'Ana@Mail.com', asunto: 'Fuga en el baño',
      cuerpo: 'Hay agua en el piso.', imapUid: 15,
      checkpoint: { cuenta: 'buzon@gmail.com/INBOX', uidValidity: 9, uid: 15 },
    });
  });

  it('decodifica asuntos con tildes y emojis (encoded-word UTF-8)', async () => {
    const c = await aCorreoEntrante(mensajeCrudo({ asunto: 'Cámara dañada 📹 — portería', cuerpo: 'x' }), ctx);
    expect(c.asunto).toBe('Cámara dañada 📹 — portería');
  });

  it('un correo solo HTML llega como texto sin etiquetas', async () => {
    const c = await aCorreoEntrante(mensajeCrudo({ html: '<p>Hola <b>administración</b></p><script>alert(1)</script>' }), ctx);
    expect(c.cuerpo).toContain('Hola');
    expect(c.cuerpo).toContain('administración');
    expect(c.cuerpo).not.toMatch(/<|alert/);
  });

  it('sin Message-ID: id sintético determinista (mismo contenido ⇒ mismo id; distinto ⇒ distinto)', async () => {
    const a = mensajeCrudo({ id: null, asunto: 'Sin id', cuerpo: 'uno' });
    const b = mensajeCrudo({ id: null, asunto: 'Sin id', cuerpo: 'dos' });
    const c1 = await aCorreoEntrante(a, ctx);
    const c2 = await aCorreoEntrante(Buffer.from(a), { ...ctx, uid: 99, uidValidity: 10 });
    expect(c1.messageId).toBe(messageIdSintetico(a));
    expect(c2.messageId).toBe(c1.messageId); // no depende del UID: sobrevive a una renumeración
    expect((await aCorreoEntrante(b, ctx)).messageId).not.toBe(c1.messageId);
  });

  it('la fecha de recepción es la del servidor (INTERNALDATE); la cabecera Date solo es respaldo', async () => {
    const fecha = new Date('2026-10-01T10:00:00Z');
    const interna = new Date('2026-10-02T08:30:00Z');
    const fuente = mensajeCrudo({ fecha });
    expect((await aCorreoEntrante(fuente, { ...ctx, fechaInterna: interna })).recibidoEn).toEqual(interna);
    expect((await aCorreoEntrante(fuente, ctx)).recibidoEn).toEqual(fecha);
  });
});

describe('Gateway · correoDeRespaldo (MIME ilegible)', () => {
  it('rescata Message-ID, remitente y asunto de las cabeceras crudas y queda SIN_CLASIFICAR', () => {
    const fuente = Buffer.from('Message-ID: <roto-1@x>\r\nFrom: "Raro"\r\n <raro@x.com>\r\nSubject: Hola\r\n\r\n\x00\x01basura', 'utf8');
    const c = correoDeRespaldo(fuente, ctx);
    expect(c).toMatchObject({ messageId: '<roto-1@x>', remitente: 'raro@x.com', asunto: '(correo no procesable) Hola', sinClasificar: true, imapUid: 15 });
    expect(c.checkpoint).toEqual({ cuenta: ctx.cuenta, uidValidity: 9, uid: 15 });
  });

  it('sin cabeceras utilizables usa el id sintético', () => {
    const fuente = Buffer.from('basura sin cabeceras');
    expect(correoDeRespaldo(fuente, ctx).messageId).toBe(messageIdSintetico(fuente));
  });
});

describe('Gateway · filtrarMayores (IMAP `UID n:*`)', () => {
  it('descarta el último mensaje que IMAP devuelve aunque su UID sea menor, ordena y quita repetidos', () => {
    expect(filtrarMayores([42], 42)).toEqual([]);
    expect(filtrarMayores([45, 43, 44, 43], 42)).toEqual([43, 44, 45]);
  });
});

describe('Gateway · esErrorDeCertificado', () => {
  it('reconoce la intercepción TLS (antivirus/proxy) y no la confunde con otros fallos', () => {
    expect(esErrorDeCertificado(Object.assign(new Error('x'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }))).toBe(true);
    expect(esErrorDeCertificado(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(false);
    expect(esErrorDeCertificado(null)).toBe(false);
  });
});
