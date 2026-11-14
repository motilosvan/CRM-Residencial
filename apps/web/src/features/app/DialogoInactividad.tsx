import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSesion } from '@/store/sesion';

interface Props {
  abierto: boolean;
  segundos: number;
  alSeguir(): void;
}

export default function DialogoInactividad({ abierto, segundos, alSeguir }: Props) {
  const cerrar = useSesion((s) => s.cerrar);
  return (
    <AlertDialog open={abierto}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading">¿Sigues ahí?</AlertDialogTitle>
          <AlertDialogDescription>
            Por seguridad, cerraremos tu sesión en {segundos} {segundos === 1 ? 'segundo' : 'segundos'} por inactividad.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => cerrar('manual')}>Cerrar sesión</AlertDialogCancel>
          <AlertDialogAction onClick={alSeguir}>Seguir conectado</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
