import { normalizar } from './clasificador.js';

/**
 * Detección de correos maliciosos: phishing, suplantación de identidad, fraude de pago (cambio de cuenta),
 * enlaces y dominios engañosos, adjuntos peligrosos e inyección de instrucciones contra el modelo de IA.
 *
 * Son reglas explicables y deterministas: cada señal dice qué vio y cuánto pesa, y el puntaje es la suma.
 * No bloquea nada (regla 8): el correo y su solicitud se guardan igual y el panel advierte del riesgo.
 * Una evidencia "buena" (p. ej. SPF pass) nunca resta: así una cabecera falsificada no puede bajar el riesgo.
 */

export const NIVELES_RIESGO = ['BAJO', 'MEDIO', 'ALTO'] as const;
export type NivelRiesgo = (typeof NIVELES_RIESGO)[number];

/** Versión de las reglas: queda guardada con cada análisis para saber con qué criterio se hizo. */
export const VERSION_DETECTOR = 'seg-1';
/** También están en la BD (CK_AnalisisSeguridad_coherente, migración 0007): cambiarlos exige una migración. */
export const UMBRAL_MEDIO = 30;
export const UMBRAL_ALTO = 60;

/** Texto máximo analizado: las reglas son lineales, pero un correo gigante no debe frenar la ingesta. */
const LIMITE_ANALISIS = 50_000;
const MAX_ENLACES = 200;
const MAX_ADJUNTOS = 100;

export const RESULTADOS_AUTENTICACION = ['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror', 'policy'] as const;
export type ResultadoAutenticacion = (typeof RESULTADOS_AUTENTICACION)[number];

export interface Enlace {
  /** Destino real (href). */
  url: string;
  /** Texto visible del enlace, si viene de un HTML. */
  texto?: string;
}

/** Lo que se sabe del correo. Solo asunto y texto son obligatorios; el gateway aporta el resto. */
export interface EvidenciaCorreo {
  asunto: string;
  texto: string;
  /** Dirección real del remitente (From). */
  remitente?: string;
  /** Nombre visible del From ("Bancolombia", "Administración"...). */
  nombreRemitente?: string;
  /** Direcciones de Reply-To: a dónde irían las respuestas. */
  responderA?: readonly string[];
  /** Resultado de SPF/DKIM/DMARC según el servidor que recibió el mensaje (Gmail). */
  autenticacion?: { spf?: ResultadoAutenticacion; dkim?: ResultadoAutenticacion; dmarc?: ResultadoAutenticacion };
  /** Enlaces del HTML; los escritos en el texto plano se detectan aquí. */
  enlaces?: readonly Enlace[];
  adjuntos?: readonly { nombre: string; tipo?: string }[];
  /** El MIME no se pudo interpretar (a veces es una técnica para evadir filtros). */
  mimeIlegible?: boolean;
}

export const CODIGOS_SENAL = [
  'AUTENTICACION_FALLIDA',
  'SUPLANTACION_NOMBRE',
  'RESPONDER_A_DISTINTO',
  'ENLACE_ENGANOSO',
  'ENLACE_IP',
  'ENLACE_ACORTADO',
  'DOMINIO_HOMOGRAFO',
  'DOMINIO_PARECIDO',
  'DOMINIO_RIESGOSO',
  'ADJUNTO_PELIGROSO',
  'PEDIDO_CREDENCIALES',
  'AMENAZA_CUENTA',
  'FRAUDE_PAGO',
  'INYECCION_INSTRUCCIONES',
  'MIME_ILEGIBLE',
  'ANALISIS_FALLIDO',
] as const;
export type CodigoSenal = (typeof CODIGOS_SENAL)[number];

/** `detalle` nunca lleva direcciones completas ni URLs con parámetros: solo dominios (se muestra en el panel). */
export interface Senal {
  codigo: CodigoSenal;
  peso: number;
  detalle: string;
}

export interface AnalisisSeguridad {
  nivel: NivelRiesgo;
  puntaje: number;
  senales: Senal[];
  version: string;
}

/* ------------------------------------------------------------------ dominios */

/** Sufijos de dos partes más comunes en Colombia y la región: "x.com.co" se registra como "x.com.co". */
const SUFIJOS_DOBLES = new Set([
  'com.co', 'net.co', 'org.co', 'edu.co', 'gov.co', 'mil.co', 'nom.co',
  'com.mx', 'com.ar', 'com.br', 'com.pe', 'com.ec', 'com.ve', 'com.es', 'co.uk', 'org.uk', 'com.au',
]);

const ES_IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const esIp = (host: string) => ES_IPV4.test(host) || host.startsWith('[');

/** "correo.alertas.bancolombia.com.co" → "bancolombia.com.co" (aproximación sin la lista pública completa). */
export function dominioRegistrable(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (esIp(h)) return h;
  const partes = h.split('.');
  if (partes.length <= 2) return h;
  return SUFIJOS_DOBLES.has(partes.slice(-2).join('.')) ? partes.slice(-3).join('.') : partes.slice(-2).join('.');
}

/** La parte que se compra del dominio: "bancolombia-seguro.xyz" → "bancolombia-seguro". */
function etiquetaPrincipal(registrable: string): string {
  const partes = registrable.split('.');
  const sufijo = SUFIJOS_DOBLES.has(partes.slice(-2).join('.')) ? 2 : 1;
  return partes.slice(0, Math.max(1, partes.length - sufijo)).join('.');
}

const dominioDeCorreo = (direccion: string | undefined) => direccion?.toLowerCase().trim().split('@')[1]?.replace(/[>\s]/g, '') || undefined;

/** Host de una URL. La API URL convierte un dominio Unicode a punycode: "bаnco" con "а" cirílica → "xn--...". */
function hostDe(url: string): string | null {
  try {
    const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `http://${url}`;
    const u = new URL(conEsquema);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

const WEBMAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'yahoo.com',
  'yahoo.es', 'icloud.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com',
]);

const ACORTADORES = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'is.gd', 'ow.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc',
  'rb.gy', 'shorte.st', 'buff.ly', 'v.gd', 'acortar.link', 'bitly.ws',
]);

/** TLD baratos o confusos muy usados en campañas de phishing (.zip y .mov parecen nombres de archivo). */
const TLD_RIESGOSOS = new Set(['zip', 'mov', 'xyz', 'top', 'click', 'tk', 'ml', 'ga', 'cf', 'gq', 'rest', 'cam', 'icu', 'buzz', 'sbs', 'cfd']);

/** Marcas que se suplantan a menudo en Colombia, con sus dominios legítimos. */
const MARCAS: readonly { clave: string; nombre: string; legitimos: readonly string[] }[] = [
  { clave: 'bancolombia', nombre: 'Bancolombia', legitimos: ['bancolombia.com', 'bancolombia.com.co', 'grupobancolombia.com', 'transaccionesbancolombia.com'] },
  { clave: 'davivienda', nombre: 'Davivienda', legitimos: ['davivienda.com'] },
  { clave: 'daviplata', nombre: 'Daviplata', legitimos: ['daviplata.com'] },
  { clave: 'nequi', nombre: 'Nequi', legitimos: ['nequi.com.co'] },
  { clave: 'bancodebogota', nombre: 'Banco de Bogotá', legitimos: ['bancodebogota.com', 'bancodebogota.com.co'] },
  { clave: 'bbva', nombre: 'BBVA', legitimos: ['bbva.com.co', 'bbva.com'] },
  { clave: 'dian', nombre: 'DIAN', legitimos: ['dian.gov.co'] },
  { clave: 'google', nombre: 'Google', legitimos: ['google.com', 'google.com.co', 'googleusercontent.com', 'googleapis.com', 'gstatic.com', 'gmail.com', 'googlemail.com', 'youtube.com', 'goo.gl'] },
  { clave: 'gmail', nombre: 'Gmail', legitimos: ['gmail.com', 'googlemail.com', 'google.com'] },
  { clave: 'microsoft', nombre: 'Microsoft', legitimos: ['microsoft.com', 'microsoftonline.com', 'live.com', 'outlook.com', 'office.com', 'office365.com', 'sharepoint.com'] },
  { clave: 'outlook', nombre: 'Outlook', legitimos: ['outlook.com', 'outlook.es', 'live.com', 'microsoft.com', 'office.com'] },
  { clave: 'apple', nombre: 'Apple', legitimos: ['apple.com', 'icloud.com'] },
  { clave: 'paypal', nombre: 'PayPal', legitimos: ['paypal.com', 'paypal.me'] },
  { clave: 'netflix', nombre: 'Netflix', legitimos: ['netflix.com'] },
  { clave: 'amazon', nombre: 'Amazon', legitimos: ['amazon.com', 'amazon.es', 'amazonaws.com', 'amazonses.com'] },
  { clave: 'mercadolibre', nombre: 'Mercado Libre', legitimos: ['mercadolibre.com.co', 'mercadolibre.com'] },
  { clave: 'whatsapp', nombre: 'WhatsApp', legitimos: ['whatsapp.com', 'whatsapp.net', 'wa.me'] },
];

/** Distancia de edición (inserciones, borrados y cambios) entre dos cadenas cortas. */
export function distanciaEdicion(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(previa[j]! + 1, actual[j - 1]! + 1, previa[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = actual;
  }
  return previa[b.length]!;
}

/** Sustituciones visuales típicas: "paypa1" → "paypal", "rnicrosoft" → "microsoft". */
const sinHomoglifos = (s: string) =>
  s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');

/**
 * ¿El dominio imita a una marca sin ser suyo? "contiene": lleva el nombre de la marca (bancolombia-alertas.com),
 * casi seguro falso. "parecido": a una o dos letras (paypa1.com, goggle.com), más propenso a falsos positivos.
 */
export function marcaImitada(host: string): { marca: string; tipo: 'contiene' | 'parecido' } | null {
  const registrable = dominioRegistrable(host);
  if (esIp(registrable) || WEBMAIL.has(registrable)) return null;
  const etiqueta = etiquetaPrincipal(registrable);
  const piezas = etiqueta.split(/[-.]/);
  for (const m of MARCAS) {
    if (m.legitimos.includes(registrable)) continue;
    if (piezas.includes(m.clave) || (m.clave.length >= 6 && etiqueta.includes(m.clave))) return { marca: m.nombre, tipo: 'contiene' };
    const tolerancia = m.clave.length >= 8 ? 2 : m.clave.length >= 5 ? 1 : 0;
    const d = distanciaEdicion(etiqueta, m.clave);
    if (sinHomoglifos(etiqueta) === m.clave || (tolerancia > 0 && d >= 1 && d <= tolerancia)) return { marca: m.nombre, tipo: 'parecido' };
  }
  return null;
}

/* ------------------------------------------------------------------ texto */

/** URLs escritas en el texto plano. */
function enlacesDelTexto(texto: string): Enlace[] {
  const encontrados = texto.match(/\bhttps?:\/\/[^\s<>"'()]+|\bwww\.[^\s<>"'()]+/gi) ?? [];
  return encontrados.slice(0, MAX_ENLACES).map((u) => ({ url: u.replace(/[.,;:!?\]]+$/, '') }));
}

/** TLD con los que un texto suelto se lee como dirección web (y no como "factura.pdf"). */
const TLD_COMUNES = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'io', 'info', 'biz', 'me', 'app', 'online', 'site', 'es', 'mx', 'us']);

/** El texto visible de un enlace parece una dirección web ("www.bancolombia.com"): devuelve su host. */
function hostVisible(texto: string | undefined): string | null {
  const t = texto?.trim();
  if (!t || t.length > 300) return null;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return hostDe(t);
  const m = t.match(/^((?:[a-z0-9-]+\.)+([a-z]{2,}))(?:[/:?#]\S*)?$/i);
  return m && TLD_COMUNES.has(m[2]!.toLowerCase()) ? hostDe(m[1]!) : null;
}

const PEDIDO_CREDENCIALES =
  /\b(contrasena|clave|codigo de (verificacion|seguridad|acceso)|pin|token|datos de (acceso|tu tarjeta|su tarjeta)|numero de (la )?tarjeta)\b/;
const VERBO_ENTREGAR =
  /\b(ingrese|ingresa|digite|digita|confirme|confirma|verifique|verifica|actualice|actualiza|envie|envia|enviar|comparta|compartir|valide|valida|validar|reactive|restablezca|inicie sesion|iniciar sesion)\b/;
const AMENAZA_CUENTA = [
  /\b(cuenta|servicio|buzon|correo|acceso|tarjeta)\b.{0,40}\b(sera|seran|ha sido|han sido|quedara|fue|esta)\s+(suspendid|bloquead|desactivad|cancelad|eliminad|cerrad|restringid)/,
  /\b(ultimo aviso|accion inmediata|evite (la )?(suspension|cancelacion|bloqueo)|(dentro de|en) las proximas \d{1,3} horas)\b/,
];
const FRAUDE_PAGO = [
  /\b(nueva|nuevo|cambio de|cambiamos|actualizamos|actualizacion de|otra|diferente)\b.{0,30}\b(cuenta|datos bancarios|numero de cuenta|llave)\b/,
  /\b(a partir de (hoy|ahora|la fecha|este mes)|desde (hoy|ahora))\b.{0,60}\b(consign|transfi|pag|deposit)/,
];
const INYECCION = [
  /\bignor(a|e|en|ar|ad)\s+(todas\s+)?(las|tus|sus|estas)\s+(instrucciones|reglas|indicaciones)/,
  /\bignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions|prompts?)/,
  /\b(system prompt|prompt del sistema|instrucciones del sistema)\b/,
  /\b(eres|actua como)\s+un\s+(modelo|asistente|clasificador|sistema)\b/,
  /\b(clasifica|clasifique|categoriza|categorice)\s+(este correo|este mensaje|esto)\s+como\b/,
  /<\/?\s*(correo|system|instrucciones)\s*>/,
];
/** "El archivo tiene clave 1234": así se pasa malware comprimido sin que el filtro pueda abrirlo. */
const CLAVE_DE_ARCHIVO = /\b(contrasena|clave)\b.{0,25}\b(archivo|adjunto|zip|rar|comprimido)\b|\b(archivo|adjunto|zip|rar|comprimido)\b.{0,25}\b(contrasena|clave)\b/;

/* ------------------------------------------------------------------ adjuntos */

const EXT_EJECUTABLES = new Set([
  'exe', 'scr', 'com', 'pif', 'bat', 'cmd', 'msi', 'msp', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'hta',
  'jar', 'lnk', 'cpl', 'reg', 'iso', 'img', 'vhd', 'vhdx', 'apk', 'dll', 'appx', 'msix',
]);
const EXT_MACROS = new Set(['docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'xlam']);
const EXT_PAGINAS = new Set(['html', 'htm', 'shtml', 'xhtml', 'svg', 'mht', 'mhtml']);
const EXT_COMPRIMIDOS = new Set(['zip', 'rar', '7z', 'gz', 'tar', 'tgz']);
const EXT_DOCUMENTO = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'txt']);
const TIPOS_EJECUTABLES = /application\/(x-msdownload|x-dosexec|x-msdos-program|vnd\.microsoft\.portable-executable|java-archive|x-sh|hta)/i;

function extensiones(nombre: string): { ext: string; anterior: string } {
  const partes = nombre.toLowerCase().trim().split('.');
  return { ext: partes.length > 1 ? partes.at(-1)! : '', anterior: partes.length > 2 ? partes.at(-2)! : '' };
}

function riesgoAdjunto(nombre: string, tipo: string | undefined): { peso: number; detalle: string } | null {
  const { ext, anterior } = extensiones(nombre);
  const ejecutable = EXT_EJECUTABLES.has(ext) || (tipo !== undefined && TIPOS_EJECUTABLES.test(tipo));
  // "factura.pdf.exe": Windows oculta la última extensión y el archivo parece un PDF.
  const doble = (ejecutable || EXT_PAGINAS.has(ext)) && EXT_DOCUMENTO.has(anterior);
  const sufijo = doble ? ' con doble extensión' : '';
  if (ejecutable) return { peso: doble ? 50 : 40, detalle: `adjunto ejecutable o de script (.${ext || '?'})${sufijo}` };
  if (EXT_PAGINAS.has(ext)) return { peso: doble ? 40 : 25, detalle: `adjunto que abre una página web (.${ext})${sufijo}` };
  if (EXT_MACROS.has(ext)) return { peso: 20, detalle: `documento con macros (.${ext})` };
  return null;
}

/* ------------------------------------------------------------------ análisis */

const INSTITUCIONAL =
  /\b(administracion|administrador|administradora|consejo de administracion|revisoria fiscal|tesoreria|contabilidad|banco|bancolombia|davivienda|daviplata|nequi|bbva|dian|google|gmail|microsoft|outlook|apple|paypal|netflix|amazon|mercado libre|whatsapp|soporte|servicio al cliente|seguridad|notificaciones)\b/;

function nivelDe(puntaje: number): NivelRiesgo {
  return puntaje >= UMBRAL_ALTO ? 'ALTO' : puntaje >= UMBRAL_MEDIO ? 'MEDIO' : 'BAJO';
}

/**
 * Analiza un correo. Cada código cuenta una sola vez (con el mayor peso visto), así 50 enlaces acortados no
 * suman más que uno; el detalle muestra hasta 3 ejemplos distintos.
 */
export function analizarSeguridad(e: EvidenciaCorreo): AnalisisSeguridad {
  const vistas = new Map<CodigoSenal, { peso: number; detalles: string[] }>();
  const senal = (codigo: CodigoSenal, peso: number, detalle: string) => {
    const s = vistas.get(codigo) ?? { peso: 0, detalles: [] };
    s.peso = Math.max(s.peso, peso);
    if (!s.detalles.includes(detalle)) s.detalles.push(detalle);
    vistas.set(codigo, s);
  };

  // 1. Autenticación del remitente (SPF/DKIM/DMARC): la suplantación directa de un dominio falla aquí.
  const a = e.autenticacion ?? {};
  const fallas: [string, number][] = [];
  if (a.dmarc === 'fail') fallas.push(['DMARC fail', 35]);
  if (a.spf === 'fail') fallas.push(['SPF fail', 20]);
  else if (a.spf === 'softfail') fallas.push(['SPF softfail', 10]);
  if (a.dkim === 'fail') fallas.push(['DKIM fail', 15]);
  if (fallas.length > 0) {
    const peso = Math.min(50, fallas.reduce((s, [, p]) => s + p, 0));
    senal('AUTENTICACION_FALLIDA', peso, `el servidor de correo no pudo verificar al remitente (${fallas.map(([f]) => f).join(', ')})`);
  }

  // 2. Identidad visible vs. real.
  const dominioRemitente = dominioDeCorreo(e.remitente?.slice(0, 320));
  // Recortado: esta regex tiene costo cuadrático en una cadena larga sin "@".
  const nombreVisible = (e.nombreRemitente ?? '').slice(0, 300);
  const otraDireccion = nombreVisible.match(/[^\s<>"'@]+@([^\s<>"'@]+\.[a-z]{2,})/i)?.[1]?.toLowerCase();
  if (otraDireccion && dominioRemitente && dominioRegistrable(otraDireccion) !== dominioRegistrable(dominioRemitente)) {
    senal('SUPLANTACION_NOMBRE', 30, `el nombre visible muestra una dirección de ${dominioRegistrable(otraDireccion)}, pero el remitente real es de ${dominioRemitente}`);
  }
  const institucion = normalizar(nombreVisible).match(INSTITUCIONAL)?.[1];
  if (institucion && dominioRemitente && WEBMAIL.has(dominioRemitente)) {
    senal('SUPLANTACION_NOMBRE', 15, `se presenta como «${institucion}» pero escribe desde un correo gratuito (${dominioRemitente})`);
  }
  if (dominioRemitente) {
    const imitada = marcaImitada(dominioRemitente);
    if (imitada) {
      senal('DOMINIO_PARECIDO', imitada.tipo === 'contiene' ? 30 : 25, `el remitente usa ${dominioRegistrable(dominioRemitente)}, que imita a ${imitada.marca}`);
    }
  }
  for (const r of e.responderA ?? []) {
    const d = dominioDeCorreo(r);
    if (d && dominioRemitente && dominioRegistrable(d) !== dominioRegistrable(dominioRemitente)) {
      senal('RESPONDER_A_DISTINTO', 15, `las respuestas irían a otro dominio (${dominioRegistrable(d)})`);
    }
  }

  // 3. Enlaces: destino real, texto que engaña, IP, acortadores, punycode, marcas imitadas, TLD riesgosos.
  const texto = e.texto.slice(0, LIMITE_ANALISIS);
  const enlaces = [...(e.enlaces ?? []).slice(0, MAX_ENLACES), ...enlacesDelTexto(texto)];
  for (const enlace of enlaces) {
    const host = hostDe(enlace.url);
    if (!host) continue;
    const registrable = dominioRegistrable(host);
    const mostrado = hostVisible(enlace.texto);
    if (mostrado && dominioRegistrable(mostrado) !== registrable) {
      senal('ENLACE_ENGANOSO', 30, `un enlace muestra ${dominioRegistrable(mostrado)} pero lleva a ${registrable}`);
    }
    if (esIp(host)) senal('ENLACE_IP', 20, 'un enlace apunta a una dirección IP en vez de a un dominio');
    if (ACORTADORES.has(registrable) || ACORTADORES.has(host)) senal('ENLACE_ACORTADO', 10, `enlace acortado (${host}): oculta el destino`);
    if (host.split('.').some((p) => p.startsWith('xn--'))) senal('DOMINIO_HOMOGRAFO', 20, `dominio con caracteres que imitan letras latinas (${host})`);
    const imitada = marcaImitada(host);
    if (imitada) senal('DOMINIO_PARECIDO', imitada.tipo === 'contiene' ? 25 : 20, `un enlace lleva a ${registrable}, que imita a ${imitada.marca}`);
    const tld = host.split('.').at(-1) ?? '';
    if (TLD_RIESGOSOS.has(tld)) senal('DOMINIO_RIESGOSO', 8, `enlace a un dominio .${tld}, frecuente en campañas de phishing`);
  }

  // 4. Adjuntos.
  const t = normalizar(`${e.asunto}\n${texto}`);
  const adjuntos = (e.adjuntos ?? []).slice(0, MAX_ADJUNTOS);
  for (const adj of adjuntos) {
    const r = riesgoAdjunto(adj.nombre, adj.tipo);
    if (r) senal('ADJUNTO_PELIGROSO', r.peso, r.detalle);
  }
  if (adjuntos.some((adj) => EXT_COMPRIMIDOS.has(extensiones(adj.nombre).ext)) && CLAVE_DE_ARCHIVO.test(t)) {
    senal('ADJUNTO_PELIGROSO', 30, 'adjunto comprimido con la contraseña en el texto (evita que el filtro lo revise)');
  }

  // 5. Contenido: pide credenciales, amenaza con cerrar la cuenta, cambia la cuenta de pago, instruye a la IA.
  if (PEDIDO_CREDENCIALES.test(t) && VERBO_ENTREGAR.test(t)) {
    const conEnlaces = enlaces.length > 0;
    senal('PEDIDO_CREDENCIALES', conEnlaces ? 30 : 20, `pide contraseñas, códigos o datos de tarjeta${conEnlaces ? ' e incluye enlaces' : ''}`);
  }
  if (AMENAZA_CUENTA.some((p) => p.test(t))) senal('AMENAZA_CUENTA', 15, 'presiona con suspender o bloquear una cuenta, o con un plazo urgente');
  if (FRAUDE_PAGO.some((p) => p.test(t))) senal('FRAUDE_PAGO', 25, 'pide pagar a una cuenta nueva o distinta: verifique por otro medio antes de pagar');
  if (INYECCION.some((p) => p.test(t))) {
    senal('INYECCION_INSTRUCCIONES', 20, 'contiene instrucciones dirigidas a un sistema de IA (intento de manipular la clasificación)');
  }
  if (e.mimeIlegible) senal('MIME_ILEGIBLE', 15, 'el formato del correo no se pudo interpretar');

  const senales: Senal[] = [...vistas]
    .map(([codigo, s]) => ({ codigo, peso: s.peso, detalle: s.detalles.slice(0, 3).join('; ') }))
    .sort((x, y) => y.peso - x.peso || (x.codigo < y.codigo ? -1 : 1));
  const puntaje = Math.min(100, senales.reduce((suma, s) => suma + s.peso, 0));
  return { nivel: nivelDe(puntaje), puntaje, senales, version: VERSION_DETECTOR };
}

/**
 * Nunca lanza. Si el análisis falla (un correo construido para romperlo, por ejemplo), el resultado es una
 * señal propia que lo deja en MEDIO para que una persona lo revise: la ingesta sigue (regla 8).
 */
export function analizarSeguridadSeguro(e: EvidenciaCorreo): AnalisisSeguridad {
  try {
    return analizarSeguridad(e);
  } catch {
    return {
      nivel: nivelDe(UMBRAL_MEDIO),
      puntaje: UMBRAL_MEDIO,
      senales: [{ codigo: 'ANALISIS_FALLIDO', peso: UMBRAL_MEDIO, detalle: 'el análisis de seguridad falló con este correo' }],
      version: VERSION_DETECTOR,
    };
  }
}
