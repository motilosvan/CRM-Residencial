import { z } from 'zod';
import type { ConjuntosService } from '../contratos';
import { pedir } from './cliente';
import { esquemaConjunto } from './esquemas';

export function crearConjuntosHttp(): ConjuntosService {
  return {
    listar: (signal) => pedir('/conjuntos', z.array(esquemaConjunto), { signal }),
  };
}
