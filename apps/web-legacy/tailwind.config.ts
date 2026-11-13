import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#355E3B',
          hover: '#284A2E',
          light: '#E8EDE5',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#789653',
          light: '#E8EDE5',
        },
        accent: {
          DEFAULT: '#D6A64F',
          hover: '#C2923A',
          foreground: '#292D29',
        },
        background: '#F7F6F0',
        surface: '#F7F6F0',
        textMain: '#292D29',
        textMuted: '#5C645C',
        borderSubtle: '#D5DDD0',
        // Escalas neutras re-mapeadas a la paleta (verde bosque / niebla / carbón)
        slate: {
          50: '#F1F4EE',
          100: '#E8EDE5',
          200: '#D5DDD0',
          300: '#B9C4B4',
          400: '#8A948A',
          500: '#6B736B',
          600: '#565E56',
          700: '#3B423B',
          800: '#292D29',
          900: '#202420',
          950: '#161916',
        },
        blue: {
          50: '#EEF2EB',
          100: '#E8EDE5',
          200: '#C9D5C4',
          300: '#A9BCA2',
          400: '#789653',
          500: '#5F7F4A',
          600: '#4A6E47',
          700: '#3F6B47',
          800: '#2E5034',
          900: '#284A2E',
          950: '#1F3524',
        },
        // Tokens de shadcn/ui, enlazados a la paleta de index.css (cambian solos en modo oscuro)
        border: 'var(--color-border)',
        input: 'var(--color-border)',
        ring: 'var(--color-primary)',
        foreground: 'var(--color-text)',
        card: { DEFAULT: 'var(--color-surface)', foreground: 'var(--color-text)' },
        popover: { DEFAULT: 'var(--color-surface)', foreground: 'var(--color-text)' },
        muted: { DEFAULT: 'var(--color-secondary-light)', foreground: 'var(--color-text-muted)' },
        destructive: { DEFAULT: '#D64545', foreground: '#FFFFFF' },
        priority: {
          alta: '#D64545',
          media: '#E8A317',
          baja: '#789653',
        },
        category: {
          mantenimiento: '#2F80ED',
          administrativo: '#8B5CF6',
          facturacion: '#F59E0B',
          seguridad: '#D64545',
        },
      },
      fontFamily: {
        heading: ['Poppins', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
