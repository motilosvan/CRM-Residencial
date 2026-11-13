import { useQuery } from '@tanstack/react-query';
import { conjuntosService } from '@/services';

export function useConjuntos() {
  return useQuery({
    queryKey: ['conjuntos'],
    queryFn: ({ signal }) => conjuntosService.listar(signal),
  });
}
