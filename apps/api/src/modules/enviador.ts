import nodemailer, { type Transporter } from 'nodemailer';

/** Mensaje con el código de acceso. El código solo viaja aquí: nunca se registra ni se guarda en claro. */
export interface MensajeCodigo {
  correo: string;
  codigo: string;
  /** Nombre del conjunto, para que el usuario sepa a qué está entrando. */
  conjunto: string;
  venceEn: Date;
}

export interface EnviadorCodigo {
  enviar(m: MensajeCodigo): Promise<void>;
}

export interface ConfigSmtp {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Remitente (`From`), p. ej. `MailFlow <no-responder@dominio>`. */
  remitente: string;
}

/** Envía el código por SMTP. El transporte se puede inyectar (pruebas con `jsonTransport`). */
export class EnviadorSmtp implements EnviadorCodigo {
  private readonly transporte: Transporter;

  constructor(
    private readonly config: ConfigSmtp,
    transporte?: Transporter,
  ) {
    this.transporte =
      transporte ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.password },
      });
  }

  async enviar(m: MensajeCodigo): Promise<void> {
    await this.transporte.sendMail({
      from: this.config.remitente,
      to: m.correo,
      subject: 'Su código de acceso a MailFlow',
      text: [
        'Hola:',
        '',
        `Su código para entrar a MailFlow (${m.conjunto}) es: ${m.codigo}`,
        '',
        'Vence en 10 minutos y solo se puede usar una vez.',
        'Si usted no lo pidió, ignore este mensaje.',
      ].join('\n'),
    });
  }
}

/**
 * Enviador de desarrollo: no manda correos. Guarda el último mensaje (pruebas) y escribe el código
 * en la consola de la API, sin el correo del destinatario.
 */
export class EnviadorLocal implements EnviadorCodigo {
  ultimo: MensajeCodigo | undefined;

  constructor(private readonly escribir: (linea: string) => void = console.info) {}

  async enviar(m: MensajeCodigo): Promise<void> {
    this.ultimo = m;
    this.escribir(`[acceso] código (solo desarrollo): ${m.codigo}`);
  }
}
