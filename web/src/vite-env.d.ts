/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TAWK_PROPERTY_ID?: string;
  readonly VITE_TAWK_WIDGET_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  Tawk_API?: Record<string, unknown>;
  Tawk_LoadStart?: Date;
}
