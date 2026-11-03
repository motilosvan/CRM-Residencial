import type { FuenteCorreo } from '../src/fuente.js';

/**
 * Buzón IMAP en memoria (solo para pruebas). Reproduce lo que importa del protocolo: UIDs crecientes,
 * UIDVALIDITY que puede cambiar (renumeración) y búsqueda por fecha con granularidad de día.
 */
export class BuzonFalso {
  uidValidity = 1;
  readonly mensajes: { uid: number; fuente: Buffer; fecha: Date }[] = [];
  readonly leidos = new Set<number>();
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
      abrir: async () => ({ uidValidity: this.uidValidity, uidNext: this.siguiente }),
      uidsDesde: async (fecha) => this.mensajes.filter((m) => m.fecha >= fecha).map((m) => m.uid),
      uidsMayoresQue: async (uid) => this.mensajes.filter((m) => m.uid > uid).map((m) => m.uid),
      descargar: async (uid) => {
        const m = this.mensajes.find((x) => x.uid === uid);
        return m ? { uid: m.uid, fuente: m.fuente, fechaInterna: m.fecha } : null;
      },
      marcarLeido: async (uid) => {
        this.leidos.add(uid);
      },
      cerrar: async () => {},
    };
  }
}
