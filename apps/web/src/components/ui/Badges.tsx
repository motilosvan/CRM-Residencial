import React from 'react';
import {
  ShieldAlert,
  Wrench,
  FileText,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { CategoriaSolicitud, PrioridadSolicitud } from '../../types/domain';

export const CATEGORY_COLORS: Record<CategoriaSolicitud, string> = {
  Mantenimiento: '#2F80ED',
  Administrativo: '#8B5CF6',
  Facturación: '#F59E0B',
  Seguridad: '#D64545',
};

export function PriorityBadge({ prioridad }: { prioridad: PrioridadSolicitud }) {
  const styles = {
    Alta: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300',
    Media: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300',
    Baja: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300',
  }[prioridad];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles}`}>
      {prioridad === 'Alta' && <AlertTriangle className="w-3.5 h-3.5" />}
      {prioridad === 'Media' && <Clock className="w-3.5 h-3.5" />}
      {prioridad === 'Baja' && <CheckCircle2 className="w-3.5 h-3.5" />}
      {prioridad}
    </span>
  );
}

export function CategoryBadge({ categoria }: { categoria: CategoriaSolicitud }) {
  const styles = {
    Mantenimiento: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
    Administrativo: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
    Facturación: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    Seguridad: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  }[categoria];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {categoria === 'Mantenimiento' && <Wrench className="w-3 h-3" />}
      {categoria === 'Administrativo' && <FileText className="w-3 h-3" />}
      {categoria === 'Facturación' && <CreditCard className="w-3 h-3" />}
      {categoria === 'Seguridad' && <ShieldAlert className="w-3 h-3" />}
      {categoria}
    </span>
  );
}
