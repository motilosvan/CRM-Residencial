import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { EnviadorLocal, EnviadorSmtp } from './enviador.js';

const SMTP = { host: 'smtp.demo.mailflow.test', port: 587, user: 'mailflow', password: 'x', remitente: 'MailFlow <no-responder@demo.mailflow.test>' };

describe('EnviadorSmtp', () => {
  it('compone destinatario, asunto y un texto en español con el código y la vigencia', async () => {
    const transporte = nodemailer.createTransport({ jsonTransport: true });
    const envio = vi.spyOn(transporte, 'sendMail');
    const enviador = new EnviadorSmtp(SMTP, transporte);

    await enviador.enviar({
      correo: 'admin@demo.mailflow.test',
      codigo: '482913',
      conjunto: 'Parque Central de Occidente',
      venceEn: new Date(Date.UTC(2026, 10, 15, 12, 10)),
    });

    expect(envio).toHaveBeenCalledTimes(1);
    const info = (await envio.mock.results[0]!.value) as { message: string };
    const mensaje = JSON.parse(info.message) as { to: { address: string }[]; from: { address: string }; subject: string; text: string };
    expect(mensaje.to.map((d) => d.address)).toEqual(['admin@demo.mailflow.test']);
    expect(mensaje.from.address).toBe('no-responder@demo.mailflow.test');
    expect(mensaje.subject).toBe('Su código de acceso a MailFlow');
    expect(mensaje.text).toContain('482913');
    expect(mensaje.text).toContain('10 minutos');
    expect(mensaje.text).toContain('Parque Central de Occidente');
  });
});

describe('EnviadorLocal', () => {
  it('guarda el último envío y escribe el código sin el correo', async () => {
    const lineas: string[] = [];
    const enviador = new EnviadorLocal((l) => lineas.push(l));
    const m = { correo: 'admin@demo.mailflow.test', codigo: '000123', conjunto: 'Demo', venceEn: new Date(0) };

    await enviador.enviar(m);

    expect(enviador.ultimo).toEqual(m);
    expect(lineas).toEqual(['[acceso] código (solo desarrollo): 000123']);
  });
});
