import { z } from 'zod';
import type { AuthService } from '../contratos';
import { pedir, pedirOpcional } from './cliente';
import { esquemaSesion } from './esquemas';

const esquemaCodigo = z.object({ venceEn: z.number(), reenvioDisponibleEn: z.number() });

export function crearAuthHttp(): AuthService {
  return {
    solicitarCodigo: (p) => pedir('/auth/codigo', esquemaCodigo, { metodo: 'POST', cuerpo: p }),
    verificarCodigo: (p) => pedir('/auth/verificar', esquemaSesion, { metodo: 'POST', cuerpo: p }),
    sesion: () => pedirOpcional('/auth/sesion', esquemaSesion),
    cambiarConjunto: (conjuntoId) => pedir('/auth/conjunto', esquemaSesion, { metodo: 'POST', cuerpo: { conjuntoId } }),
    async salir() {
      try {
        await pedir('/auth/salir', z.unknown(), { metodo: 'POST' });
      } catch {
        // Cerrar sesión no debe fallar en el cliente.
      }
    },
  };
}
