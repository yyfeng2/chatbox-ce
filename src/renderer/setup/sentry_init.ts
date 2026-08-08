import * as Sentry from '@sentry/react'
import { createSentryEventProcessor } from '@shared/utils/sentry_policy'
import { initSettingsStore, settingsStore } from '@/stores/settingsStore'
import { CHATBOX_BUILD_PLATFORM, CHATBOX_BUILD_TARGET, NODE_ENV } from '@/variables'
import platform from '../platform'

const processSentryEvent = createSentryEventProcessor({
  normalSampleRate: 0.1,
  source: 'renderer',
})

let sentryInitPromise: Promise<boolean> | undefined

async function initializeSentry(): Promise<boolean> {
  try {
    const settings = await initSettingsStore()
    if (!settings.allowReportingAndTracking) {
      return false
    }

    const version = await platform.getVersion().catch(() => 'unknown')
    if (!settingsStore.getState().allowReportingAndTracking) {
      return false
    }
    Sentry.init({
      dsn: 'https://eca691c5e01ebfa05958fca1fcb487a9@sentry.midway.run/697',
      environment: NODE_ENV,
      sampleRate: 1.0,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.05,
      replaysOnErrorSampleRate: 0.05,
      release: version,
      initialScope: {
        tags: {
          platform: platform.type,
          app_version: version,
          build_target: CHATBOX_BUILD_TARGET,
          build_platform: CHATBOX_BUILD_PLATFORM,
          error_source: 'renderer',
        },
      },
      beforeBreadcrumb(breadcrumb) {
        // Console output is already persisted in local app logs and can contain user data.
        return breadcrumb.category === 'console' ? null : breadcrumb
      },
      beforeSend(event, hint) {
        if (!settingsStore.getState().allowReportingAndTracking) {
          return null
        }
        return processSentryEvent(event, hint)
      },
    })
    return true
  } catch (e) {
    console.error('Failed to initialize Sentry:', e)
    return false
  }
}

export function initSentry(): Promise<boolean> {
  sentryInitPromise ??= initializeSentry()
  return sentryInitPromise
}

settingsStore.subscribe((settings, previousSettings) => {
  if (settings.allowReportingAndTracking === previousSettings.allowReportingAndTracking) {
    return
  }

  sentryInitPromise = undefined
  if (settings.allowReportingAndTracking) {
    void initSentry()
  } else {
    void Sentry.close(2000)
  }
})

export default Sentry
