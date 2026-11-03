import { ImapFlow } from 'imapflow';
import type { ConfigGateway } from './config.js';

/** Un mensaje tal como está en el servidor (RFC 822 crudo). */
export interface MensajeCrudo {
  uid: number;
  fuente: Buffer;
  /** INTERNALDATE: cuándo lo recibió el servidor de correo. */
  fechaInterna?: Date;
}

export interface EstadoBuzon {
  uidValidity: number;
  uidNext: number;
}

/**
 * Lo que el ciclo de sincronización necesita de un buzón. La implementación real es IMAP (Gmail);
 * las pruebas usan un buzón en memoria. Una instancia = una conexión = un ciclo: quien la usa llama a
 * `cerrar()` siempre, también si `abrir()` falló a mitad (puede haber quedado una sesión abierta).
 */
export interface FuenteCorreo {
  abrir(): Promise<EstadoBuzon>;
  /** UIDs ascendentes de los mensajes recibidos desde `fecha` (granularidad de día, como IMAP SINCE). */
  uidsDesde(fecha: Date): Promise<number[]>;
  /** UIDs ascendentes estrictamente mayores que `uid`. */
  uidsMayoresQue(uid: number): Promise<number[]>;
  /** null si el mensaje desapareció entre la búsqueda y la descarga. */
  descargar(uid: number): Promise<MensajeCrudo | null>;
  marcarLeido(uid: number): Promise<void>;
  /** Idempotente y seguro tras un `abrir()` fallido. */
  cerrar(): Promise<void>;
}

/**
 * En IMAP, `UID n:*` incluye SIEMPRE el último mensaje aunque su UID sea menor que n (RFC 3501 §6.4.8):
 * sin este filtro, un buzón sin novedades devolvería el último correo en cada ciclo.
 */
export function filtrarMayores(uids: readonly number[], uid: number): number[] {
  return [...new Set(uids.filter((u) => u > uid))].sort((a, b) => a - b);
}

/** Gmail (o cualquier servidor IMAP) vía imapflow. */
export class FuenteImap implements FuenteCorreo {
  private cliente: ImapFlow | null = null;
  private liberar: (() => void) | null = null;

  constructor(private readonly cfg: ConfigGateway) {}

  private get c(): ImapFlow {
    if (!this.cliente) throw new Error('FuenteImap: abrir() no se ha llamado');
    return this.cliente;
  }

  async abrir(): Promise<EstadoBuzon> {
    const cliente = new ImapFlow({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: true,
      auth: { user: this.cfg.usuario, pass: this.cfg.contrasena },
      logger: false,
    });
    // Sin este listener, un error de socket en segundo plano tumbaría el proceso; la operación en curso falla igual.
    cliente.on('error', () => {});
    this.cliente = cliente;
    try {
      await cliente.connect();
      // Si no se marcan leídos, el buzón se abre en solo lectura (EXAMINE): el gateway no altera Gmail.
      const lock = await cliente.getMailboxLock(this.cfg.buzon, { readOnly: !this.cfg.marcarLeido });
      this.liberar = () => lock.release();
      const mb = cliente.mailbox;
      if (!mb) throw new Error(`No se pudo abrir el buzón ${this.cfg.buzon}`);
      return { uidValidity: Number(mb.uidValidity), uidNext: mb.uidNext };
    } catch (err) {
      // Ya autenticado pero sin buzón (IMAP_MAILBOX mal escrito...): sin esto la sesión quedaba abierta en
      // cada ciclo y Gmail, que admite unas 15 por cuenta, terminaba rechazando todas las conexiones.
      await this.cerrar();
      throw err;
    }
  }

  async uidsDesde(fecha: Date): Promise<number[]> {
    const r = await this.c.search({ since: fecha }, { uid: true });
    return filtrarMayores(r || [], 0);
  }

  async uidsMayoresQue(uid: number): Promise<number[]> {
    const r = await this.c.search({ uid: `${uid + 1}:*` }, { uid: true });
    return filtrarMayores(r || [], uid);
  }

  async descargar(uid: number): Promise<MensajeCrudo | null> {
    const m = await this.c.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
    if (!m || !m.source) return null;
    const fecha = m.internalDate ? new Date(m.internalDate) : undefined;
    return { uid, fuente: m.source, fechaInterna: fecha && !Number.isNaN(fecha.getTime()) ? fecha : undefined };
  }

  async marcarLeido(uid: number): Promise<void> {
    await this.c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
  }

  async cerrar(): Promise<void> {
    const liberar = this.liberar;
    const cliente = this.cliente;
    this.liberar = null;
    this.cliente = null;
    try {
      liberar?.();
    } catch {
      // El candado muere con la conexión: lo importante es cerrarla.
    }
    if (cliente) await cliente.logout().catch(() => cliente.close());
  }
}

const CODIGOS_CERTIFICADO = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/**
 * El certificado del servidor no es verificable: típico de un antivirus o proxy que intercepta TLS
 * (p. ej. "Avast Web/Mail Shield Root"). Reintentar no sirve; se corrige en el equipo, no en el código.
 */
export function esErrorDeCertificado(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code !== undefined && CODIGOS_CERTIFICADO.has(code);
}

/** Gmail rechazó usuario o contraseña de aplicación: reintentar no sirve (y puede bloquear la cuenta). */
export function esErrorDeAutenticacion(err: unknown): boolean {
  return (err as { authenticationFailed?: boolean } | null)?.authenticationFailed === true;
}
