// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@/test-utils'

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

vi.mock('@/hooks/useMessageInput', () => ({
  useMessageInput: () => ({
    messageInput: '',
    setMessageInput: vi.fn(),
    clearDraft: vi.fn(),
  }),
}))

import { MessageInputField } from './MessageInputField'

describe('MessageInputField', () => {
  test('exposes a localized accessible name independently from its placeholder', () => {
    render(
      <MantineProvider>
        <MessageInputField
          isNewSession={false}
          viewportHeight={800}
          isReadOnly={true}
          placeholder="Waiting for approval"
          ariaLabel="Type your question here..."
          autoFocus={false}
          onValueChange={vi.fn()}
          onKeyDown={vi.fn()}
          onPaste={vi.fn()}
        />
      </MantineProvider>
    )

    const input = screen.getByRole('textbox', { name: 'Type your question here...' })
    expect(input.getAttribute('placeholder')).toBe('Waiting for approval')
    expect(input).toHaveProperty('readOnly', true)
  })
})
