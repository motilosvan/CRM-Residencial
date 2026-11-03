import {
  Solicitud,
  SugerenciaClasificacion,
  Residente,
  UsuarioSistema,
} from '../types/domain';
import { maskPII } from '../lib/piiMasker';
import { classifyByKeywords } from '../lib/keywordClassifier';
import { RESIDENTES_SEED, SOLICITUDES_SEED, USUARIOS_SEED } from '../data/seed';

export async function simulateNetworkLatency(min = 300, max = 900): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function sanitizeEmailContent(rawHtmlOrText: string): string {
  return rawHtmlOrText
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .trim();
}

export interface IAiClassifierProvider {
  classifyMaskedText(
    maskedText: string,
    confidenceThreshold: number,
    customUrgencyKeywords?: string[],
    forceFailure?: boolean
  ): Promise<SugerenciaClasificacion>;
}

export interface IEmailGatewayService {
  fetchNewIncomingEmails(): Promise<
    Array<{
      correoId: string;
      remitenteCorreo: string;
      remitenteNombre: string;
      asunto: string;
      cuerpoRecibido: string;
      fechaRecepcion: string;
    }>
  >;
  sendReplyEmail(to: string, subject: string, body: string): Promise<{ messageId: string; sentAt: string }>;
}

export class MockGeminiClassifierProvider implements IAiClassifierProvider {
  async classifyMaskedText(
    maskedText: string,
    confidenceThreshold: number,
    customUrgencyKeywords?: string[],
    forceFailure = false
  ): Promise<SugerenciaClasificacion> {
    await simulateNetworkLatency(350, 780);
    if (forceFailure) {
      return classifyByKeywords(maskedText, customUrgencyKeywords);
    }
    const baseHeuristic = classifyByKeywords(maskedText, customUrgencyKeywords);
    const simulatedAiConfidence = baseHeuristic.prioridad === 'Alta' ? 0.94 : 0.86;

    if (simulatedAiConfidence < confidenceThreshold) {
      return {
        ...baseHeuristic,
        confianza: simulatedAiConfidence,
        origen: 'Reglas',
        pendienteRevisionReglas: true,
      };
    }

    return {
      categoria: baseHeuristic.categoria,
      prioridad: baseHeuristic.prioridad,
      resumen: baseHeuristic.resumen.replace('Clasificación automática por reglas:', 'Resumen IA:'),
      justificacion: `Clasificación generada por Gemini sobre texto con PII enmascarado (Confianza ${(
        simulatedAiConfidence * 100
      ).toFixed(0)}% >= umbral ${(confidenceThreshold * 100).toFixed(0)}%).`,
      confianza: simulatedAiConfidence,
      origen: 'IA',
      pendienteRevisionReglas: false,
    };
  }
}

export class MockGmailGatewayService implements IEmailGatewayService {
  async fetchNewIncomingEmails() {
    await simulateNetworkLatency(400, 850);
    const randomResidente =
      RESIDENTES_SEED[Math.floor(Math.random() * RESIDENTES_SEED.length)];

    return [
      {
        correoId: `msg-gmail-${Date.now()}`,
        remitenteCorreo: randomResidente.correo,
        remitenteNombre: randomResidente.nombre,
        asunto: `Reporte de daño en cerradura peatonal y citófono (${randomResidente.torre} - ${randomResidente.apartamento})`,
        cuerpoRecibido: sanitizeEmailContent(
          `Buen día administración. Desde esta mañana el electroimán de la puerta peatonal de la ${randomResidente.torre} quedó sin fuerza. Mi celular es ${randomResidente.telefono} y mi cédula CC 79.321.654.`
        ),
        fechaRecepcion: new Date().toISOString(),
      },
    ];
  }

  async sendReplyEmail(_to: string, _subject: string, _body: string) {
    await simulateNetworkLatency(300, 650);
    return {
      messageId: `smtp-sent-${Date.now()}`,
      sentAt: new Date().toISOString(),
    };
  }
}

export const mockApi = {
  aiProvider: new MockGeminiClassifierProvider(),
  emailGateway: new MockGmailGatewayService(),

  async getSolicitudes(): Promise<Solicitud[]> {
    await simulateNetworkLatency();
    return SOLICITUDES_SEED;
  },

  async getResidentes(): Promise<Residente[]> {
    await simulateNetworkLatency();
    return RESIDENTES_SEED;
  },

  async getUsuarios(): Promise<UsuarioSistema[]> {
    await simulateNetworkLatency();
    return USUARIOS_SEED;
  },

  preprocessAndMaskEmail(rawBody: string) {
    const clean = sanitizeEmailContent(rawBody);
    return maskPII(clean);
  },
};
