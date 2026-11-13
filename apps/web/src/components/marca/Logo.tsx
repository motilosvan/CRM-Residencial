import { cn } from '@/lib/utils';
import { Isotipo } from './Isotipo';

interface Props {
  soloIsotipo?: boolean;
  className?: string;
}

export function Logo({ soloIsotipo = false, className }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-primary', className)}>
      {soloIsotipo ? (
        <Isotipo decorativo={false} />
      ) : (
        <>
          <Isotipo />
          <span className="font-heading text-xl font-bold tracking-tight">MailFlow</span>
        </>
      )}
    </span>
  );
}
