import { ProveedorChat, type OpcionesChat } from './chatCompatible.js';

export { construirMensajes } from './chatCompatible.js';

export class ProveedorOpenRouter extends ProveedorChat {
  constructor(opciones: OpcionesChat) {
    super(
      {
        nombre: 'openrouter',
        etiqueta: 'OpenRouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        variableLlave: 'OPENROUTER_API_KEY',
        encabezados: { 'x-title': 'SOC-CRM' },
        // Innegociable: si ningún proveedor cumple, la solicitud falla en lugar de enviar los datos a otro.
        cuerpoExtra: { provider: { data_collection: 'deny', require_parameters: true } },
      },
      opciones,
    );
  }
}
