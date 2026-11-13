import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  FileText,
  BarChart3,
  Users,
  Building2,
  Sparkles,
  History,
  Mail,
  CheckCircle2,
  Lock,
  ArrowRight,
  ChevronRight,
  MapPin,
  Phone,
  X,
} from 'lucide-react';
import { PUBLICACIONES_SEED } from '../../data/seed';
import { PublicacionInstitucional } from '../../types/domain';

export function PublicSitePage() {
  const [heroSlide, setHeroSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [selectedPub, setSelectedPub] = useState<PublicacionInstitucional | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const slides = [
    {
      title: 'Conjunto Residencial Parques del Occidente',
      subtitle: 'Comunidad, convivencia e innovación al servicio de nuestras 8 torres en Bogotá.',
      image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1400&q=80',
    },
    {
      title: 'Gestión Inteligente de Solicitudes por Correo',
      subtitle: 'Sin cuentas ni contraseñas para residentes: escríbenos desde tu correo y nuestro sistema SOC-CRM clasifica y prioriza tu caso.',
      image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80',
    },
  ];

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  const servicios = [
    { titulo: 'Pago de Administración', desc: 'PSE y convenios bancarios autorizados.', icon: CreditCard },
    { titulo: 'Documentos Generales', desc: 'Reglamento de PH y manual de convivencia.', icon: FileText },
    { titulo: 'Informes de Administración', desc: 'Estados financieros y actas de consejo.', icon: BarChart3 },
    { titulo: 'Gimnasio Comunal', desc: 'Horarios y normas de uso biosaludable.', icon: Users },
    { titulo: 'Sede Social', desc: 'Requisitos de reserva para eventos.', icon: Building2 },
    { titulo: 'Avisos Clasificados', desc: 'Vitrina comunitaria de la copropiedad.', icon: Sparkles },
    { titulo: 'Convocatorias', desc: 'Asambleas y licitaciones de proveedores.', icon: History },
    { titulo: 'Quejas y Reclamos', desc: 'Atención vía correo electrónico oficial.', icon: Mail },
    { titulo: 'Buzón de Sugerencias', desc: 'Iniciativas para mejorar nuestro conjunto.', icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-[#F7F6F0] text-[#292D29]">
      <header className="sticky top-0 z-40 bg-[#355E3B]/95 backdrop-blur-md text-[#F7F6F0] shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#789653] flex items-center justify-center font-bold text-lg shadow-inner">
              PO
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight block leading-none">
                Parques del Occidente
              </span>
              <span className="text-xs text-blue-200">
                Propiedad Horizontal · Cll 77B # 129-70, Bogotá
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <a href="#inicio" className="hover:text-[#D6A64F] transition">Inicio</a>
            <a href="#como-radicar" className="hover:text-[#D6A64F] transition">¿Cómo radicar?</a>
            <a href="#servicios" className="hover:text-[#D6A64F] transition">Servicios</a>
            <a href="#publicaciones" className="hover:text-[#D6A64F] transition">Publicaciones</a>
            <a href="#galeria" className="hover:text-[#D6A64F] transition">Galería</a>
            <a href="#contacto" className="hover:text-[#D6A64F] transition">Contacto</a>
          </nav>

          <Link
            to="/login"
            className="bg-[#D6A64F] hover:bg-[#C2923A] text-[#292D29] font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 shadow-sm transition transform hover:-translate-y-0.5"
          >
            <Lock className="w-4 h-4" />
            Ingreso Administración
          </Link>
        </div>
      </header>

      <section
        id="inicio"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative h-[440px] overflow-hidden bg-[#284A2E]"
      >
        <img
          src={slides[heroSlide].image}
          alt={slides[heroSlide].title}
          className="w-full h-full object-cover opacity-35 transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#355E3B]/90 via-[#355E3B]/70 to-transparent flex items-center">
          <div className="max-w-7xl mx-auto px-4 w-full">
            <span className="inline-block bg-[#789653] text-[#F7F6F0] text-xs font-semibold px-3 py-1 rounded-full mb-4">
              Portal Institucional de la Copropiedad
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-[#F7F6F0] max-w-2xl leading-tight mb-4">
              {slides[heroSlide].title}
            </h1>
            <p className="text-blue-100 text-lg max-w-xl mb-6">
              {slides[heroSlide].subtitle}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#como-radicar"
                className="bg-[#D6A64F] text-[#292D29] font-semibold px-5 py-3 rounded-xl inline-flex items-center gap-2"
              >
                Radicar solicitud por correo <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#publicaciones"
                className="bg-white/15 hover:bg-white/25 text-[#F7F6F0] font-medium px-5 py-3 rounded-xl"
              >
                Ver noticias del conjunto
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="como-radicar" className="py-16 max-w-7xl mx-auto px-4">
        <div className="bg-[#F7F6F0] rounded-2xl p-8 shadow-sm border border-[#D5DDD0]">
          <div className="max-w-3xl mb-8">
            <span className="text-xs font-bold uppercase tracking-wider text-[#789653]">
              Atención al Residente sin Portal ni Contraseñas
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-[#355E3B] mt-1">
              ¿Cómo radicar una solicitud ante la Administración?
            </h2>
            <p className="text-[#5C645C] mt-2">
              No necesitas crear cuenta ni iniciar sesión. Solo envía un correo electrónico a{' '}
              <strong className="text-[#355E3B]">administracion@parquesoccidente.demo</strong> indicando tu Torre y Apartamento.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: '1. Envías correo',
                desc: 'Escribes desde tu correo personal a administracion@parquesoccidente.demo con tu requerimiento.',
              },
              {
                step: '2. Se clasifica',
                desc: 'Nuestro sistema protege tus datos personales y sugiere categoría y nivel de urgencia.',
              },
              {
                step: '3. Se asigna',
                desc: 'La Administradora valida la solicitud y la asigna al responsable de área (Mantenimiento, Seguridad, etc.).',
              },
              {
                step: '4. Recibes respuesta',
                desc: 'El equipo atiende el caso y te responde directamente a tu correo electrónico con trazabilidad total.',
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-[#F7F6F0] p-5 rounded-xl border border-[#D5DDD0]">
                <div className="w-9 h-9 rounded-lg bg-[#355E3B] text-[#F7F6F0] font-bold flex items-center justify-center mb-3">
                  {idx + 1}
                </div>
                <h3 className="font-bold text-[#292D29] mb-1">{item.step}</h3>
                <p className="text-sm text-[#5C645C]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="servicios" className="py-12 max-w-7xl mx-auto px-4">
        <h2 className="text-2xl font-bold text-[#355E3B] mb-6">Servicios e Información de la Copropiedad</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {servicios.map((srv, i) => {
            const Icon = srv.icon;
            return (
              <div
                key={i}
                className="bg-[#F7F6F0] p-6 rounded-2xl border border-[#D5DDD0] shadow-sm hover:shadow-md hover:-translate-y-1 transition"
              >
                <div className="w-11 h-11 rounded-xl bg-[#E8EDE5] text-[#789653] flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg text-[#292D29]">{srv.titulo}</h3>
                <p className="text-sm text-[#5C645C] mt-1">{srv.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="publicaciones" className="py-12 max-w-7xl mx-auto px-4">
        <h2 className="text-2xl font-bold text-[#355E3B] mb-6">Circular y Publicaciones Recientes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PUBLICACIONES_SEED.map((pub) => (
            <article
              key={pub.id}
              className="bg-[#F7F6F0] rounded-2xl overflow-hidden border border-[#D5DDD0] shadow-sm flex flex-col"
            >
              <img src={pub.imagenUrl} alt={pub.titulo} className="h-40 w-full object-cover" />
              <div className="p-5 flex-1 flex flex-col">
                <span className="text-xs font-semibold text-[#789653]">{pub.categoria} · {pub.fecha}</span>
                <h3 className="font-bold text-base text-[#292D29] mt-1 line-clamp-2">{pub.titulo}</h3>
                <p className="text-xs text-[#5C645C] mt-2 line-clamp-3 flex-1">{pub.extracto}</p>
                <button
                  onClick={() => setSelectedPub(pub)}
                  className="mt-4 text-sm font-semibold text-[#355E3B] hover:underline inline-flex items-center gap-1"
                >
                  Leer más <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="galeria" className="py-12 max-w-7xl mx-auto px-4">
        <h2 className="text-2xl font-bold text-[#355E3B] mb-6">Galería de Zonas Comunes</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {PUBLICACIONES_SEED.map((item, idx) => (
            <button
              key={idx}
              onClick={() => setLightboxImg(item.imagenUrl)}
              className="group relative h-44 rounded-xl overflow-hidden border border-[#D5DDD0]"
            >
              <img
                src={item.imagenUrl}
                alt={item.titulo}
                className="w-full h-full object-cover group-hover:scale-105 transition"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-end p-3">
                <span className="text-[#F7F6F0] text-xs font-medium">{item.categoria}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <footer id="contacto" className="bg-[#355E3B] text-[#F7F6F0] mt-12 pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-blue-800">
          <div>
            <h3 className="font-bold text-lg mb-2">Conjunto Residencial Parques del Occidente</h3>
            <p className="text-sm text-blue-200">
              Personería Jurídica Localidad de Engativá · NIT 900.412.889-1
            </p>
            <p className="text-sm text-blue-200 mt-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#D6A64F]" /> Calle 77B # 129-70, Bogotá D.C., Colombia
            </p>
            <p className="text-sm text-blue-200 mt-1 flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#D6A64F]" /> (+57) 310 555 8920 · Portería 24/7
            </p>
            <p className="text-sm text-blue-200 mt-1 flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#D6A64F]" /> administracion@parquesoccidente.demo
            </p>
          </div>
          <div>
            <h4 className="font-bold text-base mb-2">Horario de Administración</h4>
            <p className="text-sm text-blue-200">Lunes a Viernes: 8:00 a.m. – 5:00 p.m.</p>
            <p className="text-sm text-blue-200">Sábados: 8:00 a.m. – 12:00 m.</p>
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="mt-4 text-xs bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-amber-300 font-medium"
            >
              Ver Política de Tratamiento de Datos (Ley 1581 de 2012)
            </button>
          </div>
          <div className="bg-[#284A2E] p-4 rounded-xl border border-blue-800 text-xs text-blue-200">
            <strong className="text-[#F7F6F0] block mb-1">Mapa de Ubicación Referencial</strong>
            Barrio Bolivia / Ciudadela Colsubsidio Occidente — Bogotá D.C.
            <div className="mt-2 h-24 rounded-lg bg-blue-950/80 flex items-center justify-center border border-blue-700 text-blue-300">
              📍 Cll 77B # 129-70 (Acceso Vehicular y Peatonal)
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pt-6 text-xs text-blue-300 flex justify-between">
          <span>© 2025 Conjunto Residencial Parques del Occidente · SOC-CRM</span>
          <span>Cumplimiento Ley 675 de 2001 y Ley 1581 de 2012</span>
        </div>
      </footer>

      {selectedPub && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#F7F6F0] rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-bold text-[#789653]">{selectedPub.categoria} · {selectedPub.fecha}</span>
              <button onClick={() => setSelectedPub(null)} aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>
            <h3 className="text-xl font-bold text-[#355E3B] mb-3">{selectedPub.titulo}</h3>
            <img src={selectedPub.imagenUrl} alt={selectedPub.titulo} className="w-full h-48 object-cover rounded-xl mb-4" />
            <p className="text-sm text-[#292D29] leading-relaxed">{selectedPub.contenido}</p>
          </div>
        </div>
      )}

      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <img src={lightboxImg} alt="Vista ampliada" className="max-h-[85vh] rounded-2xl shadow-2xl" />
        </div>
      )}

      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#F7F6F0] rounded-2xl max-w-xl w-full p-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg text-[#355E3B]">
                Política de Protección de Datos Personales (Ley 1581 de 2012)
              </h3>
              <button onClick={() => setShowPrivacyModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[#5C645C] leading-relaxed">
              El Conjunto Residencial Parques del Occidente garantiza que los correos electrónicos recibidos en el sistema SOC-CRM pasan por un módulo de anonimización y enmascarado de datos sensibles (cédulas, teléfonos y correos personales) antes de ser procesados por el asistente de clasificación de Inteligencia Artificial, cumpliendo con los principios de finalidad, seguridad y confidencialidad de la Ley Estatutaria 1581 de 2012.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
