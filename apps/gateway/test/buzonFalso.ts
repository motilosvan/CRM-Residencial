import { ErrorDescarga, type FuenteCorreo } from '../src/fuente.js';

/**
 * Buzón IMAP en memoria (solo para pruebas). Reproduce lo que importa del protocolo: UIDs crecientes,
 * UIDVALIDITY que puede cambiar (renumeración) y búsqueda por fecha con granularidad de día.
 */
export class BuzonFalso {
  uidValidity = 1;
  readonly mensajes: { uid: number; fuente: Buffer; fecha: Date }[] = [];
  readonly leidos = new Set<number>();
  /** Si se define, `abrir()` falla con este error (p. ej. la carpeta no existe). */
  falloAlAbrir: Error | null = null;
  /** UIDs que el servidor se niega a entregar (FETCH responde NO), como Gmail con un mensaje dañado. */
  readonly rechazados = new Set<number>();
  /** UIDs cuya descarga corta la conexión (no es culpa del mensaje). */
  readonly cortes = new Set<number>();
  /** Conexiones abiertas (o intentadas) y conexiones cerradas: deben coincidir al terminar cada ciclo. */
  aperturas = 0;
  cierres = 0;
  private siguiente = 1;

  agregar(fuente: Buffer, fecha: Date): number {
    const uid = this.siguiente++;
    this.mensajes.push({ uid, fuente, fecha });
    return uid;
  }

  /** El servidor reinicia los UID (p. ej. se recreó la carpeta): nueva UIDVALIDITY y UIDs nuevos. */
  renumerar(): void {
    this.uidValidity++;
    for (const m of this.mensajes) m.uid = this.siguiente++;
    this.leidos.clear();
  }

  /** Una conexión nueva, como hace el gateway en cada ciclo. */
  fuente(): FuenteCorreo {
    return {
      abrir: async () => {
        this.aperturas++;
        if (this.falloAlAbrir) throw this.falloAlAbrir;
        return { uidValidity: this.uidValidity, uidNext: this.siguiente };
      },
      uidsDesde: async (fecha) => this.mensajes.filter((m) => m.fecha >= fecha).map((m) => m.uid),
      uidsMayoresQue: async (uid) => this.mensajes.filter((m) => m.uid > uid).map((m) => m.uid),
      descargar: async (uid) => {
        if (this.cortes.has(uid)) throw Object.assign(new Error('Connection not available'), { code: 'NoConnection' });
        if (this.rechazados.has(uid)) {
          throw new ErrorDescarga(uid, Object.assign(new Error('Command failed'), { responseStatus: 'NO' }));
        }
        const m = this.mensajes.find((x) => x.uid === uid);
        return m ? { uid: m.uid, fuente: m.fuente, fechaInterna: m.fecha } : null;
      },
      marcarLeido: async (uid) => {
        this.leidos.add(uid);
      },
      cerrar: async () => {
        this.cierres++;
      },
    };
  }
}
