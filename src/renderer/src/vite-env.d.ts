/// <reference types="vite/client" />

import type { WatchAlongApi } from '@shared/types'

declare global {
  interface Window {
    watchAlong: WatchAlongApi
  }
}

export {}
