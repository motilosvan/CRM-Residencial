import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferenciasState {
  ultimoConjuntoSlug: string | null;
  recordarConjunto(slug: string): void;
}

export const usePreferencias = create<PreferenciasState>()(
  persist(
    (set) => ({
      ultimoConjuntoSlug: null,
      recordarConjunto: (slug) => set({ ultimoConjuntoSlug: slug }),
    }),
    {
      name: 'mailflow.preferencias',
      partialize: (s) => ({ ultimoConjuntoSlug: s.ultimoConjuntoSlug }),
    },
  ),
);
