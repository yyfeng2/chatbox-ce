// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import type { Message, Session } from '@shared/types'
import { MessageRoleEnum } from '@shared/types'
import { createRef, type ReactNode, type UIEventHandler } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render } from '@/test-utils'
import MessageList, { type MessageListRef } from './MessageList'

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-virtuoso', async () => {
  const React = await import('react')
  return {
    Virtuoso: React.forwardRef(
      (
        props: {
          data: unknown[]
          itemContent: (index: number, item: unknown) => ReactNode
          atTopStateChange?: (value: boolean) => void
          atBottomStateChange?: (value: boolean) => void
          onScroll?: UIEventHandler<HTMLDivElement>
        },
        ref
      ) => {
        React.useImperativeHandle(ref, () => ({
          scrollTo: vi.fn(),
          scrollToIndex: vi.fn(),
          getState: vi.fn(),
        }))
        React.useEffect(() => {
          props.atTopStateChange?.(false)
          props.atBottomStateChange?.(true)
        }, [props])
        return (
          <div data-testid="virtuoso" onScroll={props.onScroll}>
            {props.data.map((item, index) => {
              const itemKey =
                item && typeof item === 'object' && 'key' in item && typeof item.key === 'string'
                  ? item.key
                  : `item-${index}`

              return (
                <div data-index={index} key={itemKey}>
                  {props.itemContent(index, item)}
                </div>
              )
            })}
          </div>
        )
      }
    ),
  }
})

vi.mock('./Message', () => ({
  default: ({ msg }: { msg: Message }) => <div data-testid={`message-${msg.id}`}>{msg.role}</div>,
}))

vi.mock('./MessageMinimapRail', () => ({
  default: () => null,
}))

vi.mock('./MessageNavigation', () => ({
  default: () => null,
  ScrollToBottomButton: () => null,
}))

vi.mock('./SummaryMessage', () => ({
  default: () => null,
}))

vi.mock('./ForkMarkerMessage', () => ({
  default: () => null,
}))

vi.mock('../ActionMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../common/ScalableIcon', () => ({
  ScalableIcon: () => null,
}))

vi.mock('@/hooks/useScreenChange', () => ({
  useIsSmallScreen: () => false,
}))

vi.mock('@/hooks/useNeedRoomForWinControls', () => ({
  platformTypeAtom: {},
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' '),
  getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

// Partially mock jotai: ForkGroup imports compactionAtoms, which calls the
// real `atom()` at module scope; only the hooks need stubbing here.
vi.mock('jotai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useAtomValue: () => 'darwin',
  useSetAtom: () => vi.fn(),
}))

vi.mock('@/stores/atoms', () => ({
  showThreadHistoryDrawerAtom: {},
}))

vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => ({ autoCollapseCodeBlock: false }),
  },
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (
    selector: (state: {
      widthFull: boolean
      setMessageListElement: () => void
      setMessageScrolling: () => void
    }) => unknown
  ) =>
    selector({
      widthFull: true,
      setMessageListElement: vi.fn(),
      setMessageScrolling: vi.fn(),
    }),
}))

vi.mock('@/stores/sessionActions', () => ({
  deleteFork: vi.fn(),
  expandFork: vi.fn(),
  moveThreadToConversations: vi.fn(),
  removeMessage: vi.fn(),
  removeThread: vi.fn(),
  switchFork: vi.fn(),
  switchThread: vi.fn(),
}))

vi.mock('@/stores/sessionHelpers', () => ({
  getAllMessageList: (session: Session) => [
    ...(session.threads ?? []).flatMap((thread) => thread.messages),
    ...session.messages,
  ],
  getCurrentThreadHistoryHash: (session: Session) => {
    const entries: Record<string, unknown> = {}
    for (const thread of session.threads ?? []) {
      if (!thread.messages[0]) continue
      entries[thread.messages[0].id] = {
        id: thread.id,
        name: thread.name,
        firstMessageId: thread.messages[0].id,
        messageCount: thread.messages.length,
      }
    }
    if (session.threads?.length && session.messages[0]) {
      entries[session.messages[0].id] = {
        id: session.id,
        name: session.threadName || '',
        firstMessageId: session.messages[0].id,
        messageCount: session.messages.length,
      }
    }
    return entries
  },
}))

vi.mock('../Markdown', () => ({
  BlockCodeCollapsedStateProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function message(id: string, role: Message['role'], content: string): Message {
  return {
    id,
    role,
    contentParts: [{ type: 'text', text: content }],
    timestamp: 1,
  }
}

describe('MessageList new message layout', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 600,
    })

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  test('does not stretch an archived thread turn when the current new thread is appended after it', () => {
    const currentSystem = message('current-system', MessageRoleEnum.System, 'system')
    const session: Session = {
      id: 'session-1',
      type: 'chat',
      name: 'Session',
      messages: [currentSystem],
      threads: [
        {
          id: 'archived-thread',
          name: 'Archived Thread',
          createdAt: 1,
          messages: [
            message('old-user', MessageRoleEnum.User, 'old question'),
            message('old-assistant', MessageRoleEnum.Assistant, 'old answer'),
          ],
        },
      ],
    }
    const ref = createRef<MessageListRef>()

    const { container } = render(
      <MantineProvider>
        <MessageList ref={ref} currentSession={session} />
      </MantineProvider>
    )

    act(() => {
      ref.current?.setIsNewMessage(true)
    })

    expect(container.querySelector('[style*="min-height"]')).toBeNull()
  })
  test('only stretches the latest new message when the feature is enabled', () => {
    const session: Session = {
      id: 'session-1',
      type: 'chat',
      name: 'Session',
      messages: [message('user-message', MessageRoleEnum.User, 'question')],
    }
    const ref = createRef<MessageListRef>()

    const { container } = render(
      <MantineProvider>
        <MessageList ref={ref} currentSession={session} />
      </MantineProvider>
    )

    expect(container.querySelector('[style*="min-height"]')).toBeNull()

    act(() => {
      ref.current?.setIsNewMessage(true)
    })

    expect(container.querySelector<HTMLElement>('[style*="min-height"]')?.style.minHeight).toBe('510px')
  })
})
