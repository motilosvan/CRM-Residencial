import { describe, expect, it } from 'vitest';
import { accesoConfigFromEnv, hostsImapPermitidosFromEnv } from './config.js';

const SECRETO = 'x'.repeat(32);
const base = { AUTH_SECRETO: SECRETO };
const smtp = {
  SMTP_HOST: 'smtp.mail.com',
  SMTP_PORT: '465',
  SMTP_USER: 'envios@mail.com',
  SMTP_PASSWORD: 'clave-smtp-xyz',
  SMTP_FROM: 'MailFlow <no-responder@mail.com>',
};

describe('API · accesoConfigFromEnv', () => {
  it('sin SMTP en desarrollo: smtp null y valores por defecto', () => {
    const c = accesoConfigFromEnv(base);
    expect(c).toEqual({
      secreto: SECRETO,
      smtp: null,
      adminInicialCorreo: null,
      cookieSegura: false,
      origenes: new Set(['http://localhost:5173', 'http://127.0.0.1:5173']),
      desarrollo: true,
    });
  });

  it('exige AUTH_SECRETO y de al menos 32 caracteres; el error nombra la variable, no el valor', () => {
    expect(() => accesoConfigFromEnv({})).toThrow(/AUTH_SECRETO/);
    expect(() => accesoConfigFromEnv({ AUTH_SECRETO: '' })).toThrow(/AUTH_SECRETO/);
    try {
      accesoConfigFromEnv({ AUTH_SECRETO: 'corto-secreto-abc' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/AUTH_SECRETO/);
      expect((e as Error).message).not.toContain('corto-secreto-abc');
    }
  });

  it('lee el SMTP completo cuando hay SMTP_HOST', () => {
    expect(accesoConfigFromEnv({ ...base, ...smtp }).smtp).toEqual({
      host: 'smtp.mail.com',
      port: 465,
      user: 'envios@mail.com',
      password: 'clave-smtp-xyz',
      remitente: 'MailFlow <no-responder@mail.com>',
    });
  });

  it('con SMTP_HOST, el puerto por defecto es 587 y faltan usuario, clave o remitente: error que nombra la variable sin su valor', () => {
    expect(accesoConfigFromEnv({ ...base, ...smtp, SMTP_PORT: '' }).smtp?.port).toBe(587);
    for (const v of ['SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
      expect(() => accesoConfigFromEnv({ ...base, ...smtp, [v]: '' })).toThrow(new RegExp(v));
    }
    try {
      accesoConfigFromEnv({ ...base, ...smtp, SMTP_PORT: 'no-numero' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/SMTP_PORT/);
      expect((e as Error).message).not.toContain('clave-smtp-xyz');
    }
  });

  it('sin SMTP en producción lanza, nombrando SMTP_HOST; con SMTP funciona y desarrollo es false', () => {
    expect(() => accesoConfigFromEnv({ ...base, NODE_ENV: 'production' })).toThrow(/SMTP_HOST/);
    const c = accesoConfigFromEnv({ ...base, ...smtp, NODE_ENV: 'production' });
    expect(c.desarrollo).toBe(false);
    expect(c.smtp).not.toBeNull();
  });

  it('cookieSegura solo con el literal true', () => {
    expect(accesoConfigFromEnv({ ...base, COOKIE_SEGURA: 'true' }).cookieSegura).toBe(true);
    for (const v of ['false', 'TRUE', '1', 'yes', '']) {
      expect(accesoConfigFromEnv({ ...base, COOKIE_SEGURA: v }).cookieSegura).toBe(false);
    }
  });

  it('WEB_ORIGENES: lista separada por comas, normalizada; un valor inválido nombra la variable', () => {
    const c = accesoConfigFromEnv({ ...base, WEB_ORIGENES: ' https://panel.mail.com/ , http://localhost:4000' });
    expect(c.origenes).toEqual(new Set(['https://panel.mail.com', 'http://localhost:4000']));
    expect(() => accesoConfigFromEnv({ ...base, WEB_ORIGENES: 'no es un origen' })).toThrow(/WEB_ORIGENES/);
  });

  it('ADMIN_INICIAL_CORREO se normaliza a minúsculas y se valida', () => {
    expect(accesoConfigFromEnv({ ...base, ADMIN_INICIAL_CORREO: ' Admin@Mail.com ' }).adminInicialCorreo).toBe('admin@mail.com');
    expect(() => accesoConfigFromEnv({ ...base, ADMIN_INICIAL_CORREO: 'sin-arroba' })).toThrow(/ADMIN_INICIAL_CORREO/);
  });
});

describe('API · hostsImapPermitidosFromEnv', () => {
  it('por defecto solo imap.gmail.com; una variable vacía cuenta como no definida', () => {
    expect(hostsImapPermitidosFromEnv({})).toEqual(new Set(['imap.gmail.com']));
    expect(hostsImapPermitidosFromEnv({ IMAP_HOSTS_PERMITIDOS: '  ' })).toEqual(new Set(['imap.gmail.com']));
  });

  it('lista separada por comas, recortada y en minúsculas', () => {
    expect(hostsImapPermitidosFromEnv({ IMAP_HOSTS_PERMITIDOS: ' IMAP.Gmail.com , outlook.office365.com,,' })).toEqual(
      new Set(['imap.gmail.com', 'outlook.office365.com']),
    );
  });

  it('un valor que no es nombre de servidor lanza; el error nombra la variable y no el valor', () => {
    for (const malo of ['imap.gmail.com:993', 'http://imap.x.com', 'host con espacio', ',,']) {
      try {
        hostsImapPermitidosFromEnv({ IMAP_HOSTS_PERMITIDOS: malo });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toMatch(/IMAP_HOSTS_PERMITIDOS/);
        if (malo.trim().replace(/,/g, '')) expect((e as Error).message).not.toContain(malo);
      }
    }
  });
});
