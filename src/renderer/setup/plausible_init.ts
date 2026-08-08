import { normalizePlausibleUrl, type Plausible } from '../analytics/plausible'
import { isFirstDay } from '../hooks/useVersion'
import platform from '../platform'
import { initSettingsStore, settingsStore } from '../stores/settingsStore'

export type PlausibleNavigationSubscriber = (onResolved: (hrefChanged: boolean) => void) => void

export async function initPlausibleTracking(subscribeToNavigation?: PlausibleNavigationSubscriber): Promise<void> {
  try {
    const settings = await initSettingsStore()
    const version = await platform.getVersion().catch(() => 'unknown')
    const is_first_day = isFirstDay()

    // 设置 Plausible 全局属性
    if (window.plausible) {
      // 为所有后续的 pageview 和事件设置默认属性和已脱敏的 URL。
      const originalPlausible = window.plausible
      const enhancedPlausible: Plausible = (event, options) => {
        if (!settingsStore.getState().allowReportingAndTracking) {
          return
        }

        const enhancedOptions = {
          ...options,
          u: normalizePlausibleUrl(window.location.href),
          props: {
            ...options?.props,
            version,
            is_first_day,
          },
        }
        return originalPlausible(event, enhancedOptions)
      }

      // 复制原始函数的队列属性
      if ('q' in originalPlausible && (originalPlausible as unknown as { q: unknown[] }).q) {
        ;(enhancedPlausible as unknown as { q: unknown[] }).q = (originalPlausible as unknown as { q: unknown[] }).q
      }

      window.plausible = enhancedPlausible

      let lastTrackedHref: string | undefined
      const trackPageView = () => {
        // Dedupe router lifecycle events for the same location, but keep pageviews
        // when navigating between two sessions that share the normalized page URL.
        if (window.location.href === lastTrackedHref) {
          return
        }
        lastTrackedHref = window.location.href
        enhancedPlausible('pageview')
      }

      if (settings.allowReportingAndTracking) {
        trackPageView()
      }

      subscribeToNavigation?.((hrefChanged) => {
        if (hrefChanged) {
          trackPageView()
        }
      })

      settingsStore.subscribe((state, previousState) => {
        if (state.allowReportingAndTracking && !previousState.allowReportingAndTracking) {
          lastTrackedHref = undefined
          trackPageView()
        }
      })
    }
  } catch (e) {
    console.error('Failed to initialize Plausible with version:', e)
  }
}
