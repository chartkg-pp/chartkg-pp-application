/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The site needs no runtime configuration beyond the Vite base path of its bundled data. */
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
