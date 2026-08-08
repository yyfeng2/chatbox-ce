/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, waitFor } from '@/test-utils'

vi.mock('@/analytics/jk', () => ({
  trackJkAutoEvent: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/packages/navigator', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('@/packages/pic_utils', () => ({
  svgCodeToBase64: vi.fn(),
  svgToPngBase64: vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: { type: 'desktop' },
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: () => vi.fn(),
}))

vi.mock('../stores/toastActions', () => ({
  add: vi.fn(),
}))

import { MessageMermaid } from './Mermaid'

describe('MessageMermaid with real Mermaid', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('shows the local error fallback without leaking Mermaid error nodes into the body', async () => {
    const source = 'graph TD\nA -->'
    const { container } = render(<MessageMermaid source={source} theme="light" />)

    await waitFor(() => expect(container.querySelector('code')?.textContent).toBe(source), { timeout: 10_000 })

    expect(document.querySelector('[id^="dmermaidtmp"]')).toBeNull()
  })
})
