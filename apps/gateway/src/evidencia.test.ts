import { describe, expect, it } from 'vitest';
import { analizarSeguridad } from '../../api/src/domain/seguridad.js';
import { mensajeCrudo } from '../test/mensajes.js';
import { autenticacionDe, enlacesDelHtml, evidenciaDeCabeceras } from './evidencia.js';
import { aCorreoEntrante, correoDeRespaldo, htmlATexto } from './parseo.js';

const ctx = { cuenta: 'buzon@gmail.com/INBOX', uidValidity: 1, uid: 7 };
const linea = (valor: string) => ({ key: 'authentication-results', line: `Authentication-Results: ${valor}` });

describe('Gateway · autenticación del remitente (Authentication-Results)', () => {
  it('lee SPF, DKIM y DMARC de la cabecera de Gmail', () => {
    expect(
      autenticacionDe([linea('mx.google.com;\r\n dkim=pass header.i=@banco.com;\r\n spf=softfail smtp.mailfrom=x;\r\n dmarc=fail (p=REJECT) header.from=banco.com')]),
    ).toEqual({ dkim: 'pass', spf: 'softfail', dmarc: 'fail' });
  });

  it('una cabecera falsificada por el remitente no cuenta: solo la primera del servidor confiable', () => {
    const lineas = [
      linea('mx.google.com; spf=fail smtp.mailfrom=evil.ru; dmarc=fail'), // la puso Gmail (arriba)
      linea('mx.google.com; spf=pass; dkim=pass; dmarc=pass'), // la escribió el atacante (abajo)
      linea('servidor-del-atacante.ru; dmarc=pass'),
    ];
    expect(autenticacionDe(lineas)).toEqual({ spf: 'fail', dmarc: 'fail' });
    expect(autenticacionDe([linea('servidor-del-atacante.ru; dmarc=pass')])).toBeUndefined();
  });

  it('con varias firmas DKIM vale la primera', () => {
    expect(autenticacionDe([linea('mx.google.com; dkim=pass header.i=@a.com; dkim=fail header.i=@b.com')])).toEqual({ dkim: 'pass' });
  });
});

describe('Gateway · enlaces del HTML', () => {
  it('destino real y texto visible; decodifica entidades; ignora anclas internas, mailto y tel', () => {
    const html = `<p>Hola <a class="x" href="https://bit.ly/abc?a=1&amp;b=2"><b>www.bancolombia.com</b></a>
      <a href='#arriba'>arriba</a> <a href="mailto:a@b.com">escríbanos</a> <a href=tel:123>llamar</a>
      <A HREF="http://185.1.2.3/login">Ingresar</A></p>`;
    expect(enlacesDelHtml(html)).toEqual([
      { url: 'https://bit.ly/abc?a=1&b=2', texto: 'www.bancolombia.com' },
      { url: 'http://185.1.2.3/login', texto: 'Ingresar' },
    ]);
  });

  it('un HTML hostil (miles de "<a" sin cerrar) se procesa rápido y con tope de enlaces', () => {
    const inicio = Date.now();
    enlacesDelHtml(`${'<a href="x" '.repeat(50_000)}`);
    const muchos = enlacesDelHtml('<a href="https://a.com">a</a>'.repeat(1000));
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(muchos).toHaveLength(200);
  });
});

describe('Gateway · HTML a texto (respaldo de parseo) resistente a ReDoS', () => {
  it('quita etiquetas, script y style; convierte saltos; decodifica entidades', () => {
    expect(htmlATexto('<p>Hola<br>vecino &amp; amigo</p><script>alert(1)</script><STYLE>p{}</STYLE><div>Fuga &lt;urgente&gt;</div>')).toBe(
      'Hola\nvecino & amigo\nFuga <urgente>',
    );
    expect(htmlATexto('texto <b>sin cerrar')).toBe('texto sin cerrar');
    expect(htmlATexto('antes <script>nunca se cierra')).toBe('antes');
  });

  it('HTML hostil de varios MB (antes tardaba 12 s con 280 KB): se procesa rápido', async () => {
    const inicio = Date.now();
    for (const hostil of ['<style '.repeat(300_000), '<script>'.repeat(250_000), '<'.repeat(2_000_000), '<a<b<c>'.repeat(300_000)]) {
      htmlATexto(hostil);
    }
    const soloStyle = Buffer.from(`From: a@b.com\r\nSubject: x\r\nContent-Type: text/html\r\n\r\n${'<style '.repeat(40_000)}`);
    await aCorreoEntrante(soloStyle, ctx);
    expect(Date.now() - inicio).toBeLessThan(3000);
  });
});

describe('Gateway · evidencia de un correo real', () => {
  it('un phishing completo llega a T1 con autenticación, nombre visible, Reply-To, enlaces y adjuntos', async () => {
    const fuente = mensajeCrudo({
      cabeceras: ['Authentication-Results: mx.google.com;\r\n spf=fail smtp.mailfrom=evil.ru;\r\n dmarc=fail header.from=bancolombia.com'],
      de: '"Bancolombia" <alertas@bancolombia-seguridad.com>',
      responderA: 'cobros@otro-dominio.top',
      asunto: 'Su cuenta será bloqueada',
      html: '<p>Verifique su clave <a href="https://bit.ly/bco">www.bancolombia.com</a></p>',
      adjuntos: [{ nombre: 'comprobante.pdf.exe', tipo: 'application/octet-stream' }],
    });
    const c = await aCorreoEntrante(fuente, ctx);
    expect(c.evidencia).toMatchObject({
      nombreRemitente: 'Bancolombia',
      responderA: ['cobros@otro-dominio.top'],
      autenticacion: { spf: 'fail', dmarc: 'fail' },
      enlaces: [{ url: 'https://bit.ly/bco', texto: 'www.bancolombia.com' }],
      adjuntos: [{ nombre: 'comprobante.pdf.exe', tipo: 'application/octet-stream' }],
    });
    const a = analizarSeguridad({ ...c.evidencia, remitente: c.remitente, asunto: c.asunto ?? '', texto: c.cuerpo ?? '' });
    expect(a.nivel).toBe('ALTO');
  });

  it('un correo normal de un residente no trae evidencia de riesgo', async () => {
    const c = await aCorreoEntrante(mensajeCrudo({ de: 'Ana Pérez <ana@gmail.com>', asunto: 'Gotera', cuerpo: 'Hay una gotera en el 502' }), ctx);
    expect(c.evidencia).toMatchObject({ nombreRemitente: 'Ana Pérez', adjuntos: [] });
    expect(analizarSeguridad({ ...c.evidencia, remitente: c.remitente, asunto: c.asunto ?? '', texto: c.cuerpo ?? '' }).nivel).toBe('BAJO');
  });

  it('el respaldo de un MIME ilegible conserva la autenticación y lo marca como ilegible', () => {
    const fuente = Buffer.from(
      'Authentication-Results: mx.google.com; dmarc=fail\r\nFrom: "Soporte Gmail" <x@evil.ru>\r\nSubject: Hola\r\n\r\n\x00basura',
      'utf8',
    );
    expect(correoDeRespaldo(fuente, ctx).evidencia).toEqual({ mimeIlegible: true, nombreRemitente: 'Soporte Gmail', autenticacion: { dmarc: 'fail' } });
    expect(evidenciaDeCabeceras('From: x@y.com')).toEqual({ mimeIlegible: true, nombreRemitente: undefined, autenticacion: undefined });
  });
});
