// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { AgentModeValue } from '@shared/types'
import { fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
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

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/', search: {} }),
}))

let agentModeValue: AgentModeValue = 'on'

vi.mock('@/stores/session/agent-mode', () => ({
  useSessionAgentMode: () => ({ value: agentModeValue, locked: false, lockReason: null }),
}))

vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))

vi.mock('./AgentModePanel', () => ({ default: () => <div>Agent mode menu</div> }))

import AgentModeButton from './AgentModeButton'

function renderButton({ modelSupportsAgentMode = true, compact = false } = {}) {
  return render(
    <MantineProvider>
      <AgentModeButton
        sessionId="session-1"
        modelSupportsAgentMode={modelSupportsAgentMode}
        compact={compact}
        webBrowsingMode={false}
        onWebBrowsingChange={vi.fn()}
        onKnowledgeBaseSelect={vi.fn()}
        onSkillSelect={vi.fn()}
      />
    </MantineProvider>
  )
}

describe('AgentModeButton', () => {
  beforeEach(() => {
    window.localStorage.clear()
    agentModeValue = 'on'
  })

  test('is disabled and explains why when the selected model does not support agent tools', async () => {
    renderButton({ modelSupportsAgentMode: false })

    const button = screen.getByRole('button', { name: 'Chat Mode' })
    expect(button).toHaveProperty('disabled', true)

    fireEvent.mouseEnter(button.parentElement as HTMLElement)

    expect(
      await screen.findByText(
        'This model is older and has limited capabilities, so it does not support more advanced features.'
      )
    ).toBeTruthy()
  })

  test('remains enabled for a model that supports agent tools', () => {
    renderButton()

    expect(screen.getByRole('button', { name: 'Work Mode' })).toHaveProperty('disabled', false)
  })

  test('shows the Web Search migration tip until the user dismisses it', () => {
    const view = renderButton()

    expect(screen.getByText('Web Search has moved')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByText('Web Search has moved')).toBeNull()
    expect(screen.queryByText('Agent mode menu')).toBeNull()
    expect(window.localStorage.getItem('chatbox.web-search-moved-tip-dismissed.v1')).toBe('true')

    view.unmount()
    renderButton()
    expect(screen.queryByText('Web Search has moved')).toBeNull()
  })

  test('keeps the mode text in regular mode', () => {
    renderButton()

    expect(screen.getByRole('button', { name: 'Work Mode' }).textContent).toBe('Work Mode')
  })

  test.each([
    ['on', 'on', 'Work Mode'],
    ['off', 'off', 'Chat Mode'],
  ] as const)('shows a status icon instead of the mode text for %s', (value, expectedMode, label) => {
    agentModeValue = value
    const view = renderButton({ compact: true })

    const button = screen.getByRole('button', { name: label })
    expect(button.textContent).toBe('')
    expect(view.container.querySelector(`[data-agent-mode="${expectedMode}"]`)).toBeTruthy()
    expect(view.container.querySelector(`[data-agent-mode-status="${expectedMode}"]`)).toBeTruthy()
  })

  test('falls back to the chat mode status icon when the model is unsupported', () => {
    const view = renderButton({ modelSupportsAgentMode: false, compact: true })

    expect(screen.getByRole('button', { name: 'Chat Mode' })).toHaveProperty('disabled', true)
    expect(view.container.querySelector('[data-agent-mode-status="off"]')).toBeTruthy()
  })
})
