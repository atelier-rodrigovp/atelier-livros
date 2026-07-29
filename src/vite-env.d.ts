/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Commit de que esta interface foi construída (injetado em vite.config.ts). */
declare const __COMMIT_SHA__: string;
declare const __BUILD_DIRTY__: boolean;
