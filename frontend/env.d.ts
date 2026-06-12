/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected in vite.config (dev only) for health + WS when the proxy misbehaves. */
declare const __TYPING_RACE_DEV_API_TARGET__: string;
