/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACTORY_ADDRESS?: string
  readonly VITE_DEFAULT_RPC?: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_BACKEND_API_KEY?: string
  readonly VITE_VRF_SUB_ID?: string
  readonly VITE_VRF_COORDINATOR?: string
  readonly VITE_PUBLIC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
