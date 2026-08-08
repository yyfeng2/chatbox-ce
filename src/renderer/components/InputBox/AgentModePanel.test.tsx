/**
 * @vitest-environment jsdom
 */

import { MantineProvider } from '@mantine/core'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@/test-utils'

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

HTMLElement.prototype.scrollTo = vi.fn()

const mocks = vi.hoisted(() => {
  const settingsState = {
    extension: {
      webSearch: {
        provider: 'bing',
        tavilyApiKey: '',
      },
    },
    licenseKey: '',
    skills: {
      enabledSkillNames: [],
    },
    setSettings: vi.fn(),
  }
  const uiState = {
    newSessionState: {},
    setAgentModeSmartSwitchingDefault: vi.fn(),
    setNewSessionState: vi.fn(),
  }
  const agentModeEntry = {
    value: 'on' as 'auto' | 'on' | 'off',
    locked: false,
    lockReason: null,
  }
  const knowledgeBases: Array<{ id: number; name: string }> = []
  const openDirectoryDialogMock = vi.fn()
  const trackWebSearchClickMock = vi.fn()

  return {
    agentModeEntry,
    knowledgeBases,
    openDirectoryDialogMock,
    settingsState,
    trackWebSearchClickMock,
    uiState,
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/analytics/agent-mode', () => ({
  trackAgentModeSelect: vi.fn(),
  trackCodeExecutionClick: vi.fn(),
  trackSmartSwitchingClick: vi.fn(),
  trackWebSearchClick: mocks.trackWebSearchClickMock,
}))

vi.mock('@/hooks/knowledge-base', () => ({
  useKnowledgeBases: () => ({ data: mocks.knowledgeBases }),
}))

vi.mock('@/hooks/mcp', () => ({
  useMCPServerStatus: () => undefined,
  useToggleMCPServer: () => vi.fn(),
}))

vi.mock('@/modals/Settings', () => ({
  navigateToSettings: vi.fn(),
}))

vi.mock('@/packages/navigator', () => ({
  getOS: () => 'macOS',
}))

vi.mock('@/packages/skills/controller', () => ({
  skillsController: {
    discoverSkills: vi.fn(() => new Promise(() => {})),
  },
  subscribeSkillsChanged: () => vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: { type: 'desktop', isDesktopLike: true, openDirectoryDialog: mocks.openDirectoryDialogMock },
}))

vi.mock('@/stores/chatStore', () => ({
  updateSession: vi.fn(),
  useSession: () => ({ session: undefined }),
  useSessionSettings: () => ({ sessionSettings: {} }),
}))

vi.mock('@/stores/premiumActions', () => ({
  useAutoValidate: () => false,
}))

vi.mock('@/stores/session/agent-mode', () => ({
  setSessionAgentMode: vi.fn(),
  useSessionAgentMode: () => mocks.agentModeEntry,
}))

vi.mock('@/stores/settingsStore', () => ({
  useMcpSettings: () => ({ servers: [], enabledBuiltinServers: [] }),
  useSettingsStore: (selector: (state: typeof mocks.settingsState) => unknown) => selector(mocks.settingsState),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (state: typeof mocks.uiState) => unknown) => selector(mocks.uiState),
}))

import { recentDirectoriesStore } from '@/stores/recentDirectoriesStore'
import AgentModePanel from './AgentModePanel'

const defaultProps: ComponentProps<typeof AgentModePanel> = {
  sessionId: 'new',
  modelSupportsAgentMode: true,
  webBrowsingMode: false,
  onWebBrowsingChange: vi.fn(),
  onKnowledgeBaseSelect: vi.fn(),
  onSkillSelect: vi.fn(),
  onClose: vi.fn(),
}

function renderPanel(props: Partial<ComponentProps<typeof AgentModePanel>> = {}) {
  return render(
    <MantineProvider>
      <AgentModePanel {...defaultProps} {...props} />
    </MantineProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.agentModeEntry.value = 'on'
  mocks.knowledgeBases.splice(0)
  mocks.uiState.newSessionState = {}
  recentDirectoriesStore.setState({ directories: [] })
})

describe('AgentModePanel mode buttons', () => {
  test('label the chat and work mode buttons with the same status icons as the composer button', () => {
    const view = renderPanel()

    const chatMode = screen.getByRole('button', { name: 'Chat Mode' })
    const workMode = screen.getByRole('button', { name: 'Work Mode' })

    expect(chatMode.querySelector('[data-agent-mode-status="off"]')).toBeTruthy()
    expect(workMode.querySelector('[data-agent-mode-status="on"]')).toBeTruthy()
    expect(view.container.querySelectorAll('[data-agent-mode-status]')).toHaveLength(2)
  })
})

describe('AgentModePanel submenu hover behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('cancels a delayed submenu switch when the pointer leaves the target row', () => {
    renderPanel()

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Skills' }))
    expect(screen.getAllByText('Skills')).toHaveLength(2)

    const mcpRow = screen.getByRole('button', { name: 'MCP' })
    fireEvent.mouseEnter(mcpRow)
    fireEvent.mouseLeave(mcpRow, { relatedTarget: mcpRow.parentElement })

    act(() => vi.advanceTimersByTime(180))

    expect(screen.getAllByText('MCP')).toHaveLength(1)
    expect(screen.getAllByText('Skills')).toHaveLength(2)
  })

  test('clears a pending switch when Escape closes the submenu', () => {
    renderPanel()

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Skills' }))
    const mcpRow = screen.getByRole('button', { name: 'MCP' })
    fireEvent.mouseEnter(mcpRow)
    fireEvent.keyDown(mcpRow, { key: 'Escape' })

    act(() => vi.advanceTimersByTime(180))

    expect(screen.getAllByText('Skills')).toHaveLength(1)
    expect(screen.getAllByText('MCP')).toHaveLength(1)
  })

  test('keeps the submenu open while the pointer crosses the gap into it', () => {
    renderPanel()

    const skillsRow = screen.getByRole('button', { name: 'Skills' })
    fireEvent.mouseEnter(skillsRow)
    expect(screen.getAllByText('Skills')).toHaveLength(2)

    const panel = screen.getByRole('button', { name: 'Skills' }).closest('.relative')
    expect(panel).not.toBeNull()
    fireEvent.mouseLeave(panel as Element)

    act(() => vi.advanceTimersByTime(200))
    expect(screen.getAllByText('Skills')).toHaveLength(2)

    const subPanel = (panel as Element).querySelector('.absolute')
    expect(subPanel).not.toBeNull()
    fireEvent.mouseEnter(subPanel as Element)

    act(() => vi.advanceTimersByTime(300))
    expect(screen.getAllByText('Skills')).toHaveLength(2)
  })

  test('closes the submenu after the pointer stays outside the whole panel', () => {
    renderPanel()

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Skills' }))
    const panel = screen.getByRole('button', { name: 'Skills' }).closest('.relative')
    expect(panel).not.toBeNull()
    fireEvent.mouseLeave(panel as Element)

    act(() => vi.advanceTimersByTime(300))

    expect(screen.getAllByText('Skills')).toHaveLength(1)
  })
})

describe('AgentModePanel capability availability', () => {
  test('keeps Web Search and Knowledge Base enabled in Chat Mode', () => {
    mocks.agentModeEntry.value = 'off'
    renderPanel()

    expect(screen.getByRole('button', { name: 'Web Search' }).getAttribute('aria-disabled')).toBe('false')
    expect(screen.getByRole('button', { name: 'Knowledge Base' }).getAttribute('aria-disabled')).toBe('false')
    expect(screen.getByRole('button', { name: /^Code Execution/ }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: 'Skills' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: 'MCP' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: 'Working Directory' }).getAttribute('aria-disabled')).toBe('true')
  })

  test('tracks and updates Web Search from Chat Mode', () => {
    mocks.agentModeEntry.value = 'off'
    const onWebBrowsingChange = vi.fn()
    renderPanel({ onWebBrowsingChange })

    const webSearchRow = screen.getByRole('button', { name: 'Web Search' })
    const webSearchSwitch = webSearchRow.querySelector('input[type="checkbox"]')
    expect(webSearchSwitch).not.toBeNull()
    fireEvent.click(webSearchSwitch as HTMLInputElement)

    expect(onWebBrowsingChange).toHaveBeenCalledWith(true)
    expect(mocks.trackWebSearchClickMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'chat_mode', sessionId: 'new' }),
      true,
      'bing'
    )
  })

  test('allows selecting a Knowledge Base from Chat Mode', () => {
    mocks.agentModeEntry.value = 'off'
    mocks.knowledgeBases.push({ id: 1, name: 'Product Docs' })
    const onKnowledgeBaseSelect = vi.fn()
    const onClose = vi.fn()
    renderPanel({ onKnowledgeBaseSelect, onClose })

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Knowledge Base' }))
    fireEvent.click(screen.getByText('Product Docs'))

    expect(onKnowledgeBaseSelect).toHaveBeenCalledWith({ id: 1, name: 'Product Docs' })
    expect(onClose).toHaveBeenCalled()
  })

  test('keeps all capability rows enabled in Work Mode', () => {
    renderPanel()

    for (const name of ['Web Search', 'Skills', 'MCP', 'Knowledge Base', 'Working Directory']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('false')
    }
    expect(screen.getByRole('button', { name: /^Code Execution/ }).getAttribute('aria-disabled')).toBe('false')
  })
})

describe('AgentModePanel working directories', () => {
  test('shows unselected recent directories in a new session', () => {
    mocks.uiState.newSessionState = { workingDirectories: ['/Users/themez/workspace/chatbox'] }
    recentDirectoriesStore.setState({
      directories: ['/Users/themez/workspace/chatbox', String.raw`C:\Users\themez\workspace\chatbox-pro`],
    })
    renderPanel()

    fireEvent.mouseEnter(screen.getByRole('button', { name: /^Working Directory/ }))

    expect(screen.getByText('Recent')).toBeTruthy()
    expect(screen.getByRole('button', { name: String.raw`C:\Users\themez\workspace\chatbox-pro` })).toBeTruthy()
    expect(screen.getByText('chatbox-pro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '/Users/themez/workspace/chatbox' })).toBeNull()
  })

  test('adds a recent directory to the new session and moves it to the front', () => {
    const selectedDirectory = '/Users/themez/workspace/chatbox-pro'
    recentDirectoriesStore.setState({ directories: ['/Users/themez/Downloads', selectedDirectory] })
    renderPanel()

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Working Directory' }))
    fireEvent.click(screen.getByRole('button', { name: selectedDirectory }))

    expect(mocks.uiState.setNewSessionState).toHaveBeenCalledOnce()
    const updater = mocks.uiState.setNewSessionState.mock.calls[0][0]
    expect(updater({})).toEqual({ workingDirectories: [selectedDirectory] })
    expect(recentDirectoriesStore.getState().directories).toEqual([selectedDirectory, '/Users/themez/Downloads'])
  })

  test('remembers a directory selected from the system picker', async () => {
    const selectedDirectory = '/Users/themez/workspace/chatbox-pro'
    mocks.openDirectoryDialogMock.mockResolvedValue({ canceled: false, path: selectedDirectory })
    renderPanel()

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Working Directory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Folder' }))

    await vi.waitFor(() => {
      expect(mocks.uiState.setNewSessionState).toHaveBeenCalledOnce()
    })
    expect(recentDirectoriesStore.getState().directories).toEqual([selectedDirectory])
  })

  test('refreshes recency without duplicating a directory already selected in the session', async () => {
    const selectedDirectory = '/Users/themez/workspace/chatbox-pro'
    mocks.uiState.newSessionState = { workingDirectories: [selectedDirectory] }
    recentDirectoriesStore.setState({ directories: ['/Users/themez/Downloads', selectedDirectory] })
    mocks.openDirectoryDialogMock.mockResolvedValue({ canceled: false, path: selectedDirectory })
    renderPanel()

    fireEvent.mouseEnter(screen.getByRole('button', { name: /^Working Directory/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Folder' }))

    await vi.waitFor(() => {
      expect(recentDirectoriesStore.getState().directories).toEqual([selectedDirectory, '/Users/themez/Downloads'])
    })
    expect(mocks.uiState.setNewSessionState).not.toHaveBeenCalled()
  })
})
