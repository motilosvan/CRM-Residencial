import { Beneficios } from './secciones/Beneficios';
import { Cabecera } from './secciones/Cabecera';
import { ComoFunciona } from './secciones/ComoFunciona';
import { Hero } from './secciones/Hero';
import { Pie } from './secciones/Pie';
import { Seguridad } from './secciones/Seguridad';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#contenido"
        className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Saltar al contenido
      </a>
      <Cabecera />
      <main id="contenido" tabIndex={-1} className="outline-none">
        <Hero />
        <ComoFunciona />
        <Beneficios />
        <Seguridad />
      </main>
      <Pie />
    </div>
  );
}
