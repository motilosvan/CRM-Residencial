import { CategoriaSolicitud, PrioridadSolicitud, SugerenciaClasificacion } from '../types/domain';

const CATEGORY_RULES: Record<CategoriaSolicitud, string[]> = {
  Seguridad: [
    'robo', 'sospechoso', 'intruso', 'portería', 'porteria', 'cámara', 'camara',
    'alarma', 'emergencia', 'atrac', 'arme', 'vigilante', 'hurto', 'incendio',
  ],
  Mantenimiento: [
    'fuga', 'agua', 'ascensor', 'atrapad', 'luminaria', 'bombillo', 'inundación',
    'inundacion', 'cortocircuito', 'energía', 'energia', 'puerta', 'humedad', 'gas',
    'parqueadero', 'fachada', 'tubo',
  ],
  Facturación: [
    'cuota', 'cobro', 'factura', 'recibo', 'intereses', 'mora', 'pago',
    'extraordinaria', 'descuento', 'consignación', 'consignacion', 'estado de cuenta',
  ],
  Administrativo: [
    'paz y salvo', 'mudanza', 'trasteo', 'ruido', 'mascota', 'perro', 'salón social',
    'salon social', 'asamblea', 'convivencia', 'autorización', 'autorizacion', 'reglamento',
  ],
};

export const DEFAULT_URGENCY_KEYWORDS: string[] = [
  'fuga', 'incendio', 'atrapado', 'atrapada', 'robo', 'cortocircuito',
  'inundación', 'inundacion', 'gas', 'emergencia', 'sospechoso', 'humo',
  'chispa', 'herido', 'colapso', 'peligro', 'sin agua', 'sin luz', 'explosión', 'urgente',
];

export function classifyByKeywords(
  text: string,
  customUrgencyKeywords: string[] = DEFAULT_URGENCY_KEYWORDS
): SugerenciaClasificacion {
  const normalized = text.toLowerCase();

  let bestCategory: CategoriaSolicitud = 'Administrativo';
  let maxMatches = 0;
  const matchedWords: string[] = [];

  (Object.keys(CATEGORY_RULES) as CategoriaSolicitud[]).forEach((cat) => {
    const matches = CATEGORY_RULES[cat].filter((kw) => normalized.includes(kw));
    if (matches.length > maxMatches) {
      maxMatches = matches.length;
      bestCategory = cat;
      matchedWords.push(...matches);
    }
  });

  const urgentHits = customUrgencyKeywords.filter((kw) =>
    normalized.includes(kw.toLowerCase())
  );

  let prioridad: PrioridadSolicitud = 'Baja';
  if (urgentHits.length > 0) {
    prioridad = 'Alta';
  } else if (maxMatches >= 2 || bestCategory === 'Mantenimiento' || bestCategory === 'Facturación') {
    prioridad = 'Media';
  }

  const firstSentence = text.replace(/\s+/g, ' ').trim().slice(0, 130);

  return {
    categoria: bestCategory,
    prioridad,
    resumen: `Clasificación automática por reglas: "${firstSentence}${text.length > 130 ? '...' : ''}"`,
    justificacion:
      urgentHits.length > 0
        ? `Activado respaldo por reglas. Detectadas palabras críticas de urgencia: ${urgentHits.join(', ')}.`
        : matchedWords.length > 0
        ? `Activado respaldo por reglas. Coincidencias léxicas: ${matchedWords.slice(0, 4).join(', ')}.`
        : 'Sin coincidencias fuertes; asignado a categoría Administrativa por defecto para revisión humana.',
    confianza: urgentHits.length > 0 ? 0.68 : 0.55,
    origen: 'Reglas',
    pendienteRevisionReglas: true,
  };
}
