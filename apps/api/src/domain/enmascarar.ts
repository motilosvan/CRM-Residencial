/**
 * Enmascarado de datos personales (Ley 1581) antes de que un texto salga del sistema hacia un tercero,
 * como un modelo de IA. Es una defensa por patrones: reduce lo que se expone, pero no garantiza detectar
 * todo dato personal (un nombre sin registrar y fuera de una presentación o firma puede pasar).
 */

export interface OpcionesEnmascarado {
  /** Nombres ya conocidos (p. ej. el residente vinculado): se ocultan donde aparezcan. */
  nombres?: readonly (string | null | undefined)[];
}

const DESPEDIDA = /^\s*(?:(?:muchas\s+)?gracias|atentamente|cordialmente|saludos|un\s+saludo|quedo\s+atent[oa])[\s.,!]*$/i;
/** La despedida solo cuenta cerca del final: al inicio de un correo puede haber un "gracias" suelto. */
const LINEAS_DE_FIRMA = 8;

const ENLACE = /\bhttps?:\/\/\S+/gi;
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Número con 7 a 10 dígitos, con o sin separadores (incluye la cédula de 10: 1.023.456.789). */
const DOCUMENTO =
  /\b(?:c\.?\s?c\.?|c[ée]dula(?:\s+de\s+ciudadan[íi]a)?|identificaci[óo]n|documento|nit|pasaporte)\s*(?:no\.?|n[úu]mero|nro\.?|#|:)?\s*(\d[\d.\s-]{4,14}\d)/gi;
const CELULAR = /(?:\+?57[\s.-]?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g;
const FIJO = /(?:\+?57[\s.-]?)?\(?\b60\d\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g;
const DIRECCION =
  /\b(?:calle|cl|carrera|cra|kr|avenida|av|diagonal|dg|transversal|tv)\.?\s*\d+\s*[a-z]?(?:\s*(?:bis|sur|norte|este|oeste))?\s*(?:#|no\.?|n[úu]mero)\s*\d+\s*[a-z]?(?:\s*-\s*\d+)?/gi;
const UNIDAD =
  /\b(?:apto|apartamento|apt|casa|interior|int|torre|bloque|manzana|mz|local|oficina|parqueadero|garaje)\.?\s*(?:#|no\.?|n[úu]mero)?\s*[a-z]?\d+[a-z]?\b|\bT\d{1,2}[\s-]\d{3,4}\b/gi;
/** Sin bandera `i`: "los 300" o "hay 100" no son placas. */
const PLACA = /\b(?:[A-Z]{3}[\s-]?\d{3}|[A-Z]{3}[\s-]?\d{2}[A-Z]|[a-z]{3}-?\d{3})\b/g;
/** Cualquier cifra de 7 o más dígitos: cuentas, tarjetas, cédulas sin rótulo, teléfonos antiguos. */
const CIFRA_LARGA = /\b\d(?:[.\s-]?\d){6,}\b/g;
const PRESENTACION =
  /\b(?:[Ss]oy|[Mm]i nombre es|[Mm]e llamo|[Ll]es? escribe|[Ll]es? habla)[ \t]+(?:el señor |la señora |el sr\.? |la sra\.? )?(\p{Lu}[\p{L}'-]+(?:[ \t]+\p{Lu}[\p{L}'-]+){0,3})/gu;

/** Quita el historial citado y la firma: no aportan a la solicitud y es donde más datos personales hay. */
function quitarCitasYFirma(texto: string): string {
  const sinHistorial = texto
    .replace(/^\s*El\s.{5,120}escribi[óo]:[\s\S]*$/im, '')
    .replace(/^\s*On\s.{5,120}wrote:[\s\S]*$/im, '')
    .replace(/^-{2,}\s*Mensaje (?:original|reenviado)[\s\S]*$/im, '')
    .replace(/^--\s*$[\s\S]*$/m, '');
  const lineas = sinHistorial.split(/\r?\n/).filter((l) => !l.trim().startsWith('>'));
  const desde = Math.max(0, lineas.length - LINEAS_DE_FIRMA);
  const firma = lineas.findIndex((l, i) => i >= desde && DESPEDIDA.test(l));
  return (firma >= 0 ? lineas.slice(0, firma) : lineas).join('\n').trim();
}

const escaparRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reemplaza el nombre completo y cada parte de él, solo como palabra entera. */
function ocultarNombres(texto: string, nombres: OpcionesEnmascarado['nombres']): string {
  let resultado = texto;
  for (const nombre of nombres ?? []) {
    const partes = (nombre ?? '').trim().split(/\s+/).filter((p) => p.length >= 3);
    for (const parte of partes.sort((a, b) => b.length - a.length)) {
      // `\b` de JavaScript no reconoce letras con tilde: "Ángel" necesita fronteras Unicode.
      const patron = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegExp(parte)}(?![\\p{L}\\p{N}])`, 'giu');
      resultado = resultado.replace(patron, '[NOMBRE_PROTEGIDO]');
    }
  }
  return resultado.replace(/\[NOMBRE_PROTEGIDO\](?:\s+\[NOMBRE_PROTEGIDO\])+/g, '[NOMBRE_PROTEGIDO]');
}

export function enmascarar(texto: string, opciones: OpcionesEnmascarado = {}): string {
  const base = ocultarNombres(quitarCitasYFirma(texto), opciones.nombres);
  return base
    .replace(ENLACE, '[ENLACE_PROTEGIDO]')
    .replace(CORREO, '[CORREO_PROTEGIDO]')
    .replace(DOCUMENTO, (coincidencia: string, numero: string) => `${coincidencia.slice(0, -numero.length)}[DOC_PROTEGIDO]`)
    .replace(CELULAR, '[TEL_PROTEGIDO]')
    .replace(FIJO, '[TEL_PROTEGIDO]')
    .replace(DIRECCION, '[DIRECCION_PROTEGIDA]')
    .replace(UNIDAD, '[UNIDAD_PROTEGIDA]')
    .replace(PLACA, '[PLACA_PROTEGIDA]')
    .replace(CIFRA_LARGA, '[NUMERO_PROTEGIDO]')
    .replace(PRESENTACION, (coincidencia: string, nombre: string) => `${coincidencia.slice(0, -nombre.length)}[NOMBRE_PROTEGIDO]`);
}
