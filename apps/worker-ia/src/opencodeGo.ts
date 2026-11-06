import { randomUUID } from 'node:crypto';
import { ProveedorChat, type OpcionesChat } from './chatCompatible.js';

/**
 * Go no permite exigir una política de datos por solicitud, como `data_collection: deny` en OpenRouter.
 * Por eso solo se admiten los modelos que su documentación marca sin entrenamiento y con 0 días de retención,
 * que usan /chat/completions, aceptan salida estructurada y funcionan en las regiones por defecto (EE. UU. y Europa).
 * Quedan fuera, entre otros: Muse Spark e Iceman (entrenan con los datos), Beam Free y los de 30 días de
 * retención, y DeepSeek (exige región Global y su acuerdo de retención se renueva cada mes).
 * Revisado en noviembre de 2026: https://opencode.ai/docs/go#privacy
 */
export const MODELOS_GO_PERMITIDOS: ReadonlySet<string> = new Set([
  'glm-5.3-flash',
  'glm-5.3',
  'glm-5.2',
  'kimi-k3',
  'kimi-k3.1-pro',
  'kimi-k2.7-code',
  'step-5-preview',
]);

export class ProveedorOpencodeGo extends ProveedorChat {
  constructor(opciones: OpcionesChat) {
    super(
      {
        nombre: 'opencode-go',
        etiqueta: 'OpenCode Go',
        url: 'https://opencode.ai/inference/go/openai/v1/chat/completions',
        variableLlave: 'OPENCODE_API_KEY',
        // Go pide a los clientes identificarse con su propio nombre y enviar un id de sesión estable.
        encabezados: { 'user-agent': 'soc-crm-worker/1.0', 'x-opencode-session': randomUUID() },
      },
      opciones,
    );
  }
}
