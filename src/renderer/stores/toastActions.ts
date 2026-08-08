import { uiStore } from './uiStore'

export function add(content: string, duration?: number, action?: { label: string; settingsPath?: string }) {
  uiStore.getState().addToast(content, duration, action)
}

export function remove(id: string) {
  uiStore.getState().removeToast(id)
}
