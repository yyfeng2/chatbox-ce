// @vitest-environment jsdom

import type { SessionThread } from '@shared/types'
import { createMessage } from '@shared/types'
import { expect, test, vi } from 'vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(
    (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })
  ),
})

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    exporter: { exportByUrl: vi.fn(), exportImageFile: vi.fn() },
  },
}))

import { formatChatAsHtml } from './format-chat'

test('exports previewable HTML code blocks without interactive controls', async () => {
  const threads: SessionThread[] = [
    {
      id: 'thread-1',
      name: 'Thread',
      createdAt: 0,
      messages: [createMessage('assistant', '```html\n<div>previewable-export</div>\n```')],
    },
  ]

  const html = await formatChatAsHtml('Session', threads)

  expect(html).toContain('previewable-export')
  expect(html).not.toContain('<button')
})
