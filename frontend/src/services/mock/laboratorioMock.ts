import type {
  CategoriaSolicitud,
  EntradaLaboratorio,
  LaboratorioService,
  PrioridadSolicitud,
  ResultadoLaboratorio,
} from '../contratos';
import { ErrorApi } from '../contratos';
import { CATALOGOS_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

const ENLACE = /\bhttps?:\/\/\S+/gi;
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DOCUMENTO =
  /\b(?:c\.?\s?c\.?|c[ée]dula(?:\s+de\s+ciudadan[íi]a)?|identificaci[óo]n|documento|nit|pasaporte)\s*(?:no\.?|n[úu]mero|nro\.?|#|:)?\s*(\d[\d.\s-]{4,14}\d)/gi;
const CELULAR = /(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g;
const FIJO = /(?:\+?57[\s.-]?)?\(?\b60\d\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g;
const DIRECCION =
  /\b(?:calle|cl|carrera|cra|kr|avenida|av|diagonal|dg|transversal|tv)\.?\s*\d+\s*[a-z]?(?:\s*(?:bis|sur|norte|este|oeste))?\s*(?:#|no\.?|n[úu]mero)\s*\d+\s*[a-z]?(?:\s*-\s*\d+)?/gi;
const UNIDAD =
  /\b(?:apto|apartamento|apt|casa|interior|int|torre|bloque|manzana|mz|local|oficina|parqueadero|garaje)\.?\s*(?:#|no\.?|n[úu]mero)?\s*[a-z]?\d+[a-z]?\b|\bT\d{1,2}[\s-]\d{3,4}\b/gi;
const PLACA = /\b(?:[A-Z]{3}[\s-]?\d{3}|[A-Z]{3}[\s-]?\d{2}[A-Z]|[a-z]{3}-?\d{3})\b/g;
const CIFRA_LARGA = /\b\d(?:[.\s-]?\d){6,}\b/g;
const PRESENTACION =
  /\b(?:[Ss]oy|[Mm]i nombre es|[Mm]e llamo|[Ll]es? escribe|[Ll]es? habla)[ \t]+(?:el señor |la señora |el sr\.? |la sra\.? )?(\p{Lu}[\p{L}'-]+(?:[ \t]+\p{Lu}[\p{L}'-]+){0,3})/gu;

function enmascararTexto(texto: string): string {
  return texto
    .trim()
    .replace(ENLACE, '[ENLACE_PROTEGIDO]')
    .replace(CORREO, '[CORREO_PROTEGIDO]')
    .replace(DOCUMENTO, (c: string, n: string) => `${c.slice(0, -n.length)}[DOC_PROTEGIDO]`)
    .replace(CELULAR, '[TEL_PROTEGIDO]')
    .replace(FIJO, '[TEL_PROTEGIDO]')
    .replace(DIRECCION, '[DIRECCION_PROTEGIDA]')
    .replace(UNIDAD, '[UNIDAD_PROTEGIDA]')
    .replace(PLACA, '[PLACA_PROTEGIDA]')
    .replace(CIFRA_LARGA, '[NUMERO_PROTEGIDO]')
    .replace(PRESENTACION, (c: string, nombre: string) => `${c.slice(0, -nombre.length)}[NOMBRE_PROTEGIDO]`);
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function analizarTexto(asunto: string, cuerpo: string): Omit<ResultadoLaboratorio, 'asuntoEnmascarado' | 'cuerpoEnmascarado'> {
  const plano = normalizar(`${asunto}\n${cuerpo}`);
  const palabras = new Set<string>();

  let mejorCategoria: CategoriaSolicitud = 'SIN_CLASIFICAR';
  let mejorPuntaje = 0;

  for (const cat of CATALOGOS_DEMO.categorias) {
    if (cat.nombre === 'SIN_CLASIFICAR') continue;
    let puntaje = 0;
    for (const patron of cat.palabrasClave) {
      const rx = new RegExp(`\\b${patron}`, 'i');
      const m = plano.match(rx);
      if (m) {
        puntaje += 1;
        palabras.add(m[0]);
      }
    }
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorCategoria = cat.nombre;
    }
  }

  let esUrgente = false;
  for (const patron of CATALOGOS_DEMO.palabrasClaveUrgencia) {
    const rx = new RegExp(`\\b${patron}`, 'i');
    const m = plano.match(rx);
    if (m) {
      esUrgente = true;
      palabras.add(m[0]);
    }
  }

  const base =
    CATALOGOS_DEMO.categorias.find((c) => c.nombre === mejorCategoria)?.prioridadBase ?? 'MEDIA';
  const prioridad: PrioridadSolicitud = esUrgente ? 'ALTA' : base;

  return {
    categoria: mejorCategoria,
    prioridad,
    palabrasDetectadas: Array.from(palabras),
  };
}

export function crearLaboratorioMock(o: OpcionesMock = {}): LaboratorioService {
  return {
    async probar(entrada: EntradaLaboratorio, signal?: AbortSignal) {
      await esperar(o, signal);
      fallaRedApi(o);

      if (!entrada.asunto.trim() && !entrada.cuerpo.trim()) {
        throw new ErrorApi(422, 'Escribe al menos un asunto o un cuerpo para probar.');
      }

      const analisis = analizarTexto(entrada.asunto, entrada.cuerpo);
      return {
        asuntoEnmascarado: enmascararTexto(entrada.asunto),
        cuerpoEnmascarado: enmascararTexto(entrada.cuerpo),
        ...analisis,
      };
    },
  };
}
