/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUILD_REF?: string;
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
