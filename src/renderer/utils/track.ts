import { normalizePlausibleUrl, type Plausible } from '@/analytics/plausible'
import { settingsStore } from '@/stores/settingsStore'

declare global {
  interface Window {
    plausible?: Plausible
  }
}

export function trackEvent(event: string, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || !window.plausible) {
    return
  }
  // The Plausible script tag loads unconditionally in index.html, so the opt-out
  // must be enforced here, same as trackJkEvent/trackingEvent.
  if (!settingsStore.getState().allowReportingAndTracking) {
    return
  }
  // plausible_init also applies this globally. Keeping it here guarantees that
  // events fired during startup cannot expose a dynamic route before init finishes.
  window.plausible(event, { props, u: normalizePlausibleUrl(window.location.href) })
}
