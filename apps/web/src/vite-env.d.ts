/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Latencia máxima (ms) de los servicios simulados. */
  readonly VITE_MOCK_LATENCIA?: string;
  /** Probabilidad (0–1) de fallo de red simulado. */
  readonly VITE_MOCK_TASA_ERROR?: string;
  /** '1' hace que el listado de conjuntos salga vacío. */
  readonly VITE_MOCK_SIN_CONJUNTOS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
