export const CATEGORIAS = ['SEGURIDAD', 'MANTENIMIENTO', 'FACTURACION', 'ADMINISTRATIVO', 'SIN_CLASIFICAR'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** Minúsculas y sin tildes, para que "Cámara" y "camara" coincidan. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Reglas del MVP, ordenadas por prioridad de desempate (la primera gana un empate).
 * Los patrones se aplican sobre texto normalizado. `\b` al final solo donde la raíz
 * podría ser prefijo de otra palabra (p. ej. "arma" vs "armario").
 */
const REGLAS: ReadonlyArray<{ categoria: Exclude<Categoria, 'SIN_CLASIFICAR'>; patrones: RegExp[] }> = [
  {
    categoria: 'SEGURIDAD',
    patrones: [
      /\brobo/, /\brobaron/, /\bhurto/, /\bladron/, /\bintruso/, /\bsospechos/, /\balarma/,
      /\bcamaras?\b/, /\bvigilan/, /\bporteri/, /\bportero/, /\bforzaron/, /\bviolentaron/,
      /\bagresi/, /\bpelea/, /\barma\b/, /\bdisparo/, /\bamenaza/, /\bincendio/, /\bhumo\b/,
      /\bemergencia/, /\bacceso no autorizado/, /\bseguridad/,
    ],
  },
  {
    categoria: 'MANTENIMIENTO',
    patrones: [
      /\bfuga/, /\bgotera/, /\bhumedad/, /\bfiltracion/, /\binundacion/, /\btuberia/, /\bascensor/,
      /\belevador/, /\bbombillo/, /\bluz\b/, /\bluces\b/, /\biluminacion/, /\blampara/, /\bdano/,
      /\bdanado/, /\breparacion/, /\barreglo/, /\baveria/, /\bporton/, /\bcitofono/, /\bcerradura/,
      /\bpintura/, /\bjardin/, /\bpiscina/, /\bbomba\b/, /\btanque/, /\bplaga/, /\bfumigacion/,
      /\bcortocircuito/, /\bdesague/, /\bdestapar/, /\bgrieta/, /\bmantenimiento/, /\broto\b/, /\brota\b/,
      /\bquemad/, /\bgas\b/,
    ],
  },
  {
    categoria: 'FACTURACION',
    patrones: [
      /\bcuota/, /\bfactura/, /\bpago/, /\bpague/, /\bpagar/, /\brecibo/, /\bcobro/, /\bcobrar/,
      /\bmora\b/, /\bsaldo/, /\bdeuda/, /\bpaz y salvo/, /\bextracto/, /\bestado de cuenta/,
      /\btarifa/, /\bvalor\b/, /\bfacturacion/,
    ],
  },
  {
    categoria: 'ADMINISTRATIVO',
    patrones: [
      /\basamblea/, /\bcertificad/, /\bcertificacion/, /\bpermiso/, /\breglamento/, /\bconvivencia/,
      /\bqueja/, /\bruido/, /\bmascota/, /\bparqueadero/, /\bautorizacion/, /\bautorizar/, /\bmudanza/,
      /\btrastee?o/, /\breserva/, /\bsalon comunal/, /\bzona social/, /\bacta\b/, /\bcircular/,
      /\bconsejo/, /\bpropiedad horizontal/, /\bvisitante/,
    ],
  },
];

function contar(texto: string, patrones: RegExp[]): number {
  return patrones.reduce((n, p) => n + (texto.match(new RegExp(p.source, 'g'))?.length ?? 0), 0);
}

/**
 * Clasifica por palabras clave. El asunto pesa el doble. Sin coincidencias → SIN_CLASIFICAR
 * (un humano lo reclasifica con T4: ningún correo se descarta).
 */
export function clasificar(asunto: string, cuerpo: string): Categoria {
  const texto = normalizar(`${asunto} ${asunto} ${cuerpo}`);
  let mejor: Categoria = 'SIN_CLASIFICAR';
  let mejorPuntaje = 0;
  for (const regla of REGLAS) {
    const puntaje = contar(texto, regla.patrones);
    if (puntaje > mejorPuntaje) {
      mejor = regla.categoria;
      mejorPuntaje = puntaje;
    }
  }
  return mejor;
}
