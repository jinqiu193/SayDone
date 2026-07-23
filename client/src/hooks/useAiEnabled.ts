import { useSyncExternalStore } from 'react'
import { subscribeAiEnabled, getAiEnabled } from '@/stores/aiEnabled'

export function useAiEnabled() {
  return useSyncExternalStore(subscribeAiEnabled, getAiEnabled)
}
