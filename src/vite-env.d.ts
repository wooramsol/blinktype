/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_REF?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
