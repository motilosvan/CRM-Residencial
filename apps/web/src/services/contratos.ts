import type { Conjunto, Sesion } from '@/types/conjunto';

export interface ConjuntosService {
  /** GET /conjuntos */
  listar(signal?: AbortSignal): Promise<Conjunto[]>;
}

export interface SolicitudCodigo {
  conjuntoId: string;
  correo: string;
}

/** Marcas de tiempo en epoch ms. */
export interface CodigoEnviado {
  venceEn: number;
  reenvioDisponibleEn: number;
}

export interface AuthService {
  /** POST /auth/codigo */
  solicitarCodigo(p: SolicitudCodigo): Promise<CodigoEnviado>;
  /** POST /auth/verificar */
  verificarCodigo(p: SolicitudCodigo & { codigo: string }): Promise<Sesion>;
}

export type CodigoErrorAuth =
  | 'CODIGO_INCORRECTO'
  | 'CODIGO_VENCIDO'
  | 'BLOQUEADO'
  | 'REENVIO_PRONTO'
  | 'RED';

/** Error de acceso. Los fallos de red (también en `ConjuntosService`) usan el código 'RED'. */
export class ErrorAuth extends Error {
  readonly codigo: CodigoErrorAuth;
  readonly intentosRestantes?: number;
  readonly desbloqueoEn?: number;

  constructor(codigo: CodigoErrorAuth, detalle?: { intentosRestantes?: number; desbloqueoEn?: number }) {
    super(codigo);
    this.name = 'ErrorAuth';
    this.codigo = codigo;
    this.intentosRestantes = detalle?.intentosRestantes;
    this.desbloqueoEn = detalle?.desbloqueoEn;
  }
}
