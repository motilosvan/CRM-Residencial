const PASOS = [
  {
    titulo: 'El residente escribe',
    texto: 'Usa el correo del conjunto, como siempre. No instala nada ni aprende una herramienta nueva.',
  },
  {
    titulo: 'MailFlow clasifica y prioriza',
    texto:
      'Reglas por palabras clave asignan categoría y prioridad. La inteligencia artificial solo sugiere y una persona valida.',
  },
  {
    titulo: 'El equipo da seguimiento',
    texto: 'Se asigna un responsable, se responde y cada cambio queda en el historial de la solicitud.',
  },
];

export function ComoFunciona() {
  return (
    <section aria-labelledby="titulo-como-funciona" className="bg-secondary">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <h2
          id="titulo-como-funciona"
          className="max-w-[24ch] text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          Cómo funciona
        </h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="relative">
              <span
                aria-hidden="true"
                className="font-heading text-5xl font-extrabold text-primary/25"
              >
                {i + 1}
              </span>
              <h3 className="mt-2 text-xl font-semibold text-foreground">{paso.titulo}</h3>
              <p className="mt-2 max-w-[40ch] leading-relaxed text-muted-foreground">{paso.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
