// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Message, Session } from '@shared/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { getDefaultStore } from 'jotai'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { compactionUIStateMapAtom } from '@/stores/atoms/compactionAtoms'

const { deleteForkMock, isSmallScreenMock, switchForkMock, switchForkToMock, toastMock } = vi.hoisted(() => ({
  deleteForkMock: vi.fn(),
  isSmallScreenMock: vi.fn(() => false),
  switchForkMock: vi.fn(),
  switchForkToMock: vi.fn(),
  toastMock: vi.fn(),
}))

vi.mock('@/hooks/useScreenChange', () => ({ useIsSmallScreen: isSmallScreenMock }))
vi.mock('@/stores/sessionActions', () => ({
  deleteFork: deleteForkMock,
  switchFork: switchForkMock,
  switchForkTo: switchForkToMock,
}))
vi.mock('@/stores/toastActions', () => ({ add: toastMock }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), key),
  }),
}))
vi.mock('../ActionMenu', () => ({
  default: ({
    children,
    items,
  }: {
    children: React.ReactNode
    items: Array<{ divider?: boolean; text?: string; disabled?: boolean; onClick?: () => void }>
  }) => (
    <div>
      {children}
      {items
        .filter((item) => !item.divider)
        .map((item) => (
          <button key={item.text} type="button" disabled={item.disabled} onClick={item.onClick}>
            {item.text}
          </button>
        ))}
    </div>
  ),
}))
vi.mock('./Message', () => ({
  default: ({ msg }: { msg: Message }) => <div data-testid={`message-${msg.id}`}>{msg.id}</div>,
}))

import ForkGroup from './ForkGroup'

type ForkEntry = NonNullable<Session['messageForksHash']>[string]

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    role: 'assistant',
    contentParts: [{ type: 'text', text: id }],
    ...overrides,
  }
}

function renderGroup(forks: ForkEntry, generationLocked = false) {
  return render(
    <MantineProvider>
      <ForkGroup
        sessionId="session-1"
        sessionType="chat"
        msgId="user-1"
        forks={forks}
        generatingReplyCount={generationLocked ? 2 : 0}
        generationLocked={generationLocked}
      />
    </MantineProvider>
  )
}

describe('ForkGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isSmallScreenMock.mockReturnValue(false)
    getDefaultStore().set(compactionUIStateMapAtom, {})
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  test('keeps saved replies collapsed until the user expands them', () => {
    renderGroup({
      position: 0,
      lists: [
        { id: 'current', messages: [] },
        {
          id: 'alternative',
          messages: [message('alternative-reply'), message('follow-up-user', { role: 'user' })],
        },
      ],
      createdAt: 1,
    })

    expect(screen.queryByTestId('message-alternative-reply')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand view' }))

    expect(screen.getByTestId('message-alternative-reply')).toBeTruthy()
    expect(screen.getByText('1 follow-up message')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse other branches' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Switch to this branch' }))

    expect(switchForkToMock).toHaveBeenCalledWith('session-1', 'user-1', 1)
  })

  test('filters empty branches from expanded reply counts', () => {
    renderGroup({
      position: 0,
      lists: [
        { id: 'current', messages: [] },
        { id: 'empty', messages: [] },
        { id: 'alternative', messages: [message('alternative-reply')] },
      ],
      createdAt: 1,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand view' }))

    expect(screen.getByTestId('message-alternative-reply')).toBeTruthy()
    expect(screen.queryByText('Showing 1 of 1 other replies')).toBeNull()
  })

  test('reveals a newly generating inactive reply without expanding every branch', () => {
    renderGroup(
      {
        position: 0,
        lists: [
          { id: 'current', messages: [] },
          { id: 'older', messages: [message('older-reply')] },
          {
            id: 'generating',
            messages: [message('generating-reply', { generating: true, cancel: () => {} })],
          },
        ],
        createdAt: 1,
      },
      true
    )

    expect(screen.queryByTestId('message-older-reply')).toBeNull()
    expect(screen.getByTestId('message-generating-reply')).toBeTruthy()
    expect(screen.getByText('Showing 1 of 2 other replies')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand view' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Collapse other branches' })).toBeTruthy()
  })

  test('shows alternative replies newest-first so a generating reply stays on top', () => {
    renderGroup(
      {
        position: 0,
        lists: [
          { id: 'current', messages: [] },
          { id: 'older', messages: [message('older-reply')] },
          {
            id: 'generating',
            messages: [message('generating-reply', { generating: true, cancel: () => {} })],
          },
        ],
        createdAt: 1,
      },
      true
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand view' }))

    const replyLabels = screen.getAllByText(/Reply \d+/).map((node) => node.textContent)
    expect(replyLabels).toEqual(['Reply 3', 'Reply 2'])

    const messages = screen.getAllByTestId(/^message-/)
    expect(messages.map((node) => node.getAttribute('data-testid'))).toEqual([
      'message-generating-reply',
      'message-older-reply',
    ])
  })

  test('blocks branch switching during generation and explains why', () => {
    renderGroup(
      {
        position: 0,
        lists: [
          { id: 'current', messages: [] },
          {
            id: 'alternative',
            messages: [message('alternative-reply', { generating: true, cancel: () => {} })],
          },
        ],
        createdAt: 1,
      },
      true
    )

    fireEvent.click(screen.getAllByLabelText('Wait for the current replies to finish')[0])

    expect(switchForkMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('Wait for the current replies to finish', 2500)
    expect((screen.getByRole('button', { name: 'Switch to this branch' }) as HTMLButtonElement).disabled).toBe(true)
    expect(switchForkToMock).not.toHaveBeenCalled()
  })

  test('explains the disabled direct switch when tapped on mobile', () => {
    isSmallScreenMock.mockReturnValue(true)
    renderGroup(
      {
        position: 0,
        lists: [
          { id: 'current', messages: [] },
          {
            id: 'alternative',
            messages: [message('alternative-reply', { generating: true, cancel: () => {} })],
          },
        ],
        createdAt: 1,
      },
      true
    )

    fireEvent.click(screen.getByRole('button', { name: 'Switch to this branch' }))

    expect(switchForkToMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('Wait for the current replies to finish', 2500)
  })

  test('blocks branch switching while compaction is running and explains why', () => {
    getDefaultStore().set(compactionUIStateMapAtom, {
      'session-1': { status: 'running', error: null, streamingText: '' },
    })
    renderGroup({
      position: 0,
      lists: [
        { id: 'current', messages: [] },
        { id: 'alternative', messages: [message('alternative-reply')] },
      ],
      createdAt: 1,
    })

    fireEvent.click(screen.getAllByLabelText('Wait for compaction to finish')[0])

    expect(switchForkMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('Wait for compaction to finish', 2500)
  })

  test('unlocks branch switching for other sessions during compaction', () => {
    getDefaultStore().set(compactionUIStateMapAtom, {
      'other-session': { status: 'running', error: null, streamingText: '' },
    })
    renderGroup({
      position: 0,
      lists: [
        { id: 'current', messages: [] },
        { id: 'alternative', messages: [message('alternative-reply')] },
      ],
      createdAt: 1,
    })

    fireEvent.click(screen.getByLabelText('Next reply'))

    expect(switchForkMock).toHaveBeenCalledWith('session-1', 'user-1', 'next')
  })
})
