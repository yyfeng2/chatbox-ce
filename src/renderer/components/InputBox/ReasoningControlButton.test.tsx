// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import { ModelProviderEnum, type ProviderModelInfo, type ProviderOptions } from '@shared/types'
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@/test-utils'
import ReasoningControlButton from './ReasoningControlButton'

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
  useTranslation: () => ({
    t: (key: string, values?: { level?: string }) => (values?.level ? key.replace('{{level}}', values.level) : key),
  }),
}))

const model: ProviderModelInfo = { modelId: 'gpt-5.1' }

function renderButton(compact: boolean, reasoningEffort: 'low' | 'medium' | 'high' = 'high') {
  const providerOptions: ProviderOptions = { openai: { reasoningEffort } }
  return render(
    <MantineProvider>
      <ReasoningControlButton
        provider={ModelProviderEnum.OpenAIResponses}
        model={model}
        providerOptions={providerOptions}
        iconSize={22}
        compact={compact}
        onChange={vi.fn()}
      />
    </MantineProvider>
  )
}

describe('ReasoningControlButton', () => {
  test('shows a state icon instead of the level text in compact mode', () => {
    const view = renderButton(true)

    expect(screen.getByRole('button', { name: 'Thinking: High' })).toBeTruthy()
    expect(view.container.querySelector('[data-reasoning-level="high"]')).toBeTruthy()
    expect(view.container.querySelector('button')?.textContent).toBe('')
  })

  test.each([
    ['low', 1],
    ['medium', 2],
    ['high', 3],
  ] as const)('shows %s effort with %i active dots', (level, activeDotCount) => {
    const view = renderButton(true, level)
    const status = view.container.querySelector(`[data-reasoning-status="${level}"]`)

    expect(status?.querySelectorAll('[data-reasoning-dot="active"]')).toHaveLength(activeDotCount)
    expect(status?.querySelectorAll('[data-reasoning-dot="inactive"]')).toHaveLength(3 - activeDotCount)
  })

  test('keeps the level text in regular mode', () => {
    renderButton(false)

    expect(screen.getByRole('button', { name: 'Thinking: High' }).textContent).toBe('High')
  })

  test('opens the effort menu when the trigger is clicked', async () => {
    renderButton(false)

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: High' }))

    await waitFor(() => expect(screen.getByTestId(TestId.reasoning.menu)).toBeTruthy())
    expect(screen.getByTestId(TestId.reasoning.level('default'))).toBeTruthy()
  })
})
