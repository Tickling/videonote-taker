/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_GROQ_BASE_URL?: string;
  readonly VITE_STORE_BUILD?: string;
  readonly VITE_YOUTUBE_VIA_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
