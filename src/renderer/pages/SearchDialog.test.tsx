// @vitest-environment jsdom

import type React from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render } from '@/test-utils'

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('jotai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtomValue: () => undefined,
}))

vi.mock('@/hooks/useScreenChange', () => ({
  useIsSmallScreen: () => false,
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      openSearchDialog: false,
      searchDialogGlobalOnly: false,
      setOpenSearchDialog: vi.fn(),
    }),
}))

vi.mock('@/stores/sessionHelpers', () => ({
  searchSessions: vi.fn(),
}))

vi.mock('../stores/scrollActions', () => ({
  scrollToMessage: vi.fn(),
}))

vi.mock('../stores/sessionActions', () => ({
  switchCurrentSession: vi.fn(),
}))

vi.mock('@/components/chat/Message', () => ({
  default: () => null,
}))

vi.mock('@/components/Markdown', () => ({
  BlockCodeCollapsedStateProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/components/common/Mark', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))

import SearchDialog from './SearchDialog'

describe('SearchDialog', () => {
  test('does not hide the application from assistive technology while closed', () => {
    const appRoot = document.createElement('div')
    document.body.appendChild(appRoot)

    const { unmount } = render(<SearchDialog />, { container: appRoot })

    expect(appRoot.getAttribute('aria-hidden')).toBeNull()

    unmount()
    appRoot.remove()
  })
})
