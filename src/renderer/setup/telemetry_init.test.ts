// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { initSettingsStoreMock, settingsStoreGetStateMock, settingsStoreSubscribeMock } = vi.hoisted(() => ({
  initSettingsStoreMock: vi.fn(async () => ({ allowReportingAndTracking: false })),
  settingsStoreGetStateMock: vi.fn(() => ({ allowReportingAndTracking: false })),
  settingsStoreSubscribeMock: vi.fn(),
}))

vi.mock('@/analytics/jk', () => ({
  initJkAnalytics: vi.fn(),
  trackJkViewEvent: vi.fn(),
}))
vi.mock('@/analytics/jk-events', () => ({ JK_EVENTS: { APP_LAUNCH: 'app_launch' } }))
vi.mock('@/stores/settingsStore', () => ({
  initSettingsStore: initSettingsStoreMock,
  settingsStore: {
    getState: settingsStoreGetStateMock,
    subscribe: settingsStoreSubscribeMock,
  },
}))
vi.mock('../hooks/useVersion', () => ({ isFirstDay: vi.fn(() => false) }))
vi.mock('../platform', () => ({ default: { getVersion: vi.fn(async () => '1.0.0') } }))

describe('settings-backed telemetry initialization', () => {
  beforeEach(() => {
    initSettingsStoreMock.mockClear()
    settingsStoreGetStateMock.mockReset()
    settingsStoreGetStateMock.mockReturnValue({ allowReportingAndTracking: false })
    settingsStoreSubscribeMock.mockClear()
    window.plausible = undefined
    vi.resetModules()
  })

  it('does not hydrate settings as an import side effect', async () => {
    await Promise.all([import('./jk_analytics_init'), import('./plausible_init')])

    expect(initSettingsStoreMock).not.toHaveBeenCalled()
  })

  it('hydrates settings only after explicit post-migration initialization', async () => {
    const [{ initJkTracking }, { initPlausibleTracking }] = await Promise.all([
      import('./jk_analytics_init'),
      import('./plausible_init'),
    ])

    await initPlausibleTracking()
    await initJkTracking()

    expect(initSettingsStoreMock).toHaveBeenCalledTimes(2)
  })

  it('subscribes to navigation without importing the application router', async () => {
    initSettingsStoreMock.mockResolvedValueOnce({ allowReportingAndTracking: true })
    settingsStoreGetStateMock.mockReturnValue({ allowReportingAndTracking: true })
    const plausibleMock = vi.fn()
    const navigationSubscriber = vi.fn()
    window.plausible = plausibleMock

    const { initPlausibleTracking } = await import('./plausible_init')
    await initPlausibleTracking(navigationSubscriber)

    expect(navigationSubscriber).toHaveBeenCalledOnce()
    expect(plausibleMock).toHaveBeenCalledWith('pageview', expect.objectContaining({ props: expect.any(Object) }))
  })
})
