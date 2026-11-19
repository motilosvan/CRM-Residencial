import { z } from 'zod';
import type { UsuariosService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaUsuarioConjunto } from './esquemas';

const esquemaListaUsuarios = z.array(esquemaUsuarioConjunto);

export function crearUsuariosHttp(): UsuariosService {
  return {
    listar: (filtro = {}, signal) =>
      pedirApi('/usuarios', esquemaListaUsuarios, {
        signal,
        consulta: {
          rol: filtro.rol,
          incluirInactivos: filtro.incluirInactivos ? true : undefined,
        },
      }),
    agregar: (entrada) =>
      pedirApi('/usuarios', esquemaUsuarioConjunto, {
        metodo: 'POST',
        cuerpo: entrada,
      }),
    actualizar: (id, cambio) =>
      pedirApi(`/usuarios/${id}`, esquemaUsuarioConjunto, {
        metodo: 'PATCH',
        cuerpo: cambio,
      }),
  };
}
