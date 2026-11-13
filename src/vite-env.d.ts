/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase 프로젝트 주소와 공개(anon) 키. 둘 다 있으면 로그인·동기화가 켜진다.
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
