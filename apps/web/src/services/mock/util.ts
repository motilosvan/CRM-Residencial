import type { OpcionesMock } from './tipos';
import { ErrorAuth } from '../contratos';

export function esperar(o: OpcionesMock, signal?: AbortSignal): Promise<void> {
  const [min, max] = o.latenciaMs ?? [300, 900];
  const ms = min + Math.random() * Math.max(0, max - min);
  return new Promise((resolver, rechazar) => {
    if (signal?.aborted) {
      rechazar(new DOMException('Cancelado', 'AbortError'));
      return;
    }
    const alAbortar = () => {
      clearTimeout(id);
      rechazar(new DOMException('Cancelado', 'AbortError'));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', alAbortar);
      resolver();
    }, ms);
    signal?.addEventListener('abort', alAbortar, { once: true });
  });
}

export function fallaRed(o: OpcionesMock): void {
  if ((o.tasaError ?? 0) > 0 && Math.random() < (o.tasaError ?? 0)) throw new ErrorAuth('RED');
}
