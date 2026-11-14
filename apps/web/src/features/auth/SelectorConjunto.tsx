import { Check, ChevronsUpDown } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Conjunto } from '@/types/conjunto';

interface Props extends Omit<ComponentProps<typeof Button>, 'value' | 'onChange'> {
  conjuntos: Conjunto[];
  valor: string;
  alCambiar: (id: string) => void;
  marcador?: string;
}

/** Combobox accesible: popover + lista filtrable. El botón recibe el id/aria del campo del formulario. */
export function SelectorConjunto({ conjuntos, valor, alCambiar, marcador = 'Elige tu conjunto', className, disabled, ...boton }: Props) {
  const [abierto, setAbierto] = useState(false);
  const elegido = conjuntos.find((c) => c.id === valor);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          disabled={disabled}
          className={cn('h-11 w-full justify-between bg-card px-3 font-normal hover:bg-muted aria-expanded:bg-muted', !elegido && 'text-muted-foreground', className)}
          {...boton}
        >
          <span className="truncate">{elegido ? elegido.nombre : marcador}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="Buscar conjunto" aria-label="Buscar conjunto" />
          <CommandList>
            <CommandEmpty>No hay conjuntos con ese nombre.</CommandEmpty>
            <CommandGroup>
              {conjuntos.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.nombre}
                  onSelect={() => {
                    alCambiar(c.id);
                    setAbierto(false);
                  }}
                >
                  <span className="truncate">{c.nombre}</span>
                  <Check aria-hidden="true" className={cn('ml-auto size-4', c.id === valor ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
