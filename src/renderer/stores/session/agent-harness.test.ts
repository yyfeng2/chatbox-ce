import { beforeEach, describe, expect, test, vi } from 'vitest'

const { discoverSkillsMock, getSettingsMock, mcpToolsMock, sandboxProviderMock, skillsChangedListeners } = vi.hoisted(
  () => ({
    discoverSkillsMock: vi.fn(),
    getSettingsMock: vi.fn(),
    mcpToolsMock: vi.fn(),
    sandboxProviderMock: {
      type: 'local',
      init: vi.fn(),
      exec: vi.fn(),
      copyBlobIn: vi.fn(),
      checkAvailability: vi.fn(),
      resolveWorkingDirectory: vi.fn(async () => null),
      setExtraWritableDirs: vi.fn(),
      destroy: vi.fn(),
    },
    skillsChangedListeners: new Set<() => void>(),
  })
)

vi.hoisted(() => {
  const storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  }
  const windowMock: Record<string, unknown> = {
    electronAPI: undefined,
    localStorage: storage,
  }
  ;(globalThis as unknown as { window: Record<string, unknown>; localStorage: typeof storage }).window = windowMock
  ;(globalThis as unknown as { window: Record<string, unknown>; localStorage: typeof storage }).localStorage = storage
  return {}
})

vi.mock('@/platform', () => ({
  default: {
    type: 'web',
    getPlatform: vi.fn().mockResolvedValue('darwin'),
    getVersion: vi.fn().mockResolvedValue('test-version'),
  },
}))

vi.mock('@/storage', () => ({
  default: {
    getBlob: vi.fn().mockResolvedValue(null),
    setBlob: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/sandbox', () => ({
  createSandboxProvider: () => sandboxProviderMock,
}))

vi.mock('@/packages/mcp/controller', () => ({
  mcpController: {
    getAvailableTools: mcpToolsMock,
  },
}))

vi.mock('@/packages/skills/controller', () => ({
  subscribeSkillsChanged: (listener: () => void) => {
    skillsChangedListeners.add(listener)
    return () => skillsChangedListeners.delete(listener)
  },
  skillsController: {
    discoverSkills: discoverSkillsMock,
    loadSkill: vi.fn().mockResolvedValue({ metadata: {}, body: '# Skill instructions' }),
    installFromSandbox: vi.fn(),
  },
}))

vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      getSettings: getSettingsMock,
    }),
    setState: vi.fn(),
  },
}))

vi.mock('@/stores/settingActions', () => ({
  getExtensionSettings: () => ({
    webSearch: { provider: 'tavily' },
  }),
  getRemoteConfig: vi.fn().mockResolvedValue({}),
  isPro: () => true,
}))

vi.mock('@/packages/user-exec-approval', () => ({
  requestUserExecApproval: vi.fn(),
}))

import type { ModelInterface } from '@shared/models/types'
import type { SandboxProvider } from '@shared/sandbox-provider'
import {
  type Config,
  type Message,
  MessageRoleEnum,
  ModelProviderEnum,
  type Session,
  type SessionSettings,
  type Settings,
} from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import { getMessageText } from '@shared/utils/message'
import { computeEffectiveAgentMode, prepareAgentGenerationHarness } from './agent-harness'

function createMockModel(overrides?: Partial<ModelInterface>): ModelInterface {
  return {
    name: 'Test Model',
    modelId: 'test-model',
    isSupportToolUse: vi.fn().mockReturnValue(true),
    isSupportVision: vi.fn().mockReturnValue(true),
    isSupportSystemMessage: vi.fn().mockReturnValue(true),
    chat: vi.fn(),
    chatStream: vi.fn(),
    paint: vi.fn(),
    ...overrides,
  } as unknown as ModelInterface
}

function createModelDependencies(): ModelDependencies {
  return {
    request: {
      apiRequest: vi.fn(),
      fetchWithOptions: vi.fn(),
    },
    storage: {
      saveImage: vi.fn(),
      getImage: vi.fn(),
    },
    sentry: {
      captureException: vi.fn(),
      withScope: vi.fn(),
    },
    getRemoteConfig: vi.fn(),
  }
}

function createSession(): Session {
  return {
    id: 'session-1',
    name: 'Session',
    type: 'chat',
    messages: [],
    threads: [],
    messageForksHash: {},
  } as unknown as Session
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const listener of skillsChangedListeners) {
    listener()
  }
  sandboxProviderMock.type = 'local'
  sandboxProviderMock.checkAvailability.mockResolvedValue({ available: true })
  sandboxProviderMock.init.mockResolvedValue({ success: true })
  sandboxProviderMock.exec.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
  sandboxProviderMock.copyBlobIn.mockResolvedValue({ success: true })
  mcpToolsMock.mockReturnValue({})
  discoverSkillsMock.mockResolvedValue([{ name: 'analysis', description: 'Analyze files' }])
  getSettingsMock.mockReturnValue({
    skills: { enabledSkillNames: ['analysis'] },
  })
})

describe('computeEffectiveAgentMode', () => {
  test('off when the platform does not support agent mode', () => {
    expect(computeEffectiveAgentMode('on', false)).toBe('off')
    expect(computeEffectiveAgentMode('auto', false)).toBe('off')
    expect(computeEffectiveAgentMode('off', false)).toBe('off')
  })

  test('on only when explicitly on and supported', () => {
    expect(computeEffectiveAgentMode('on', true)).toBe('on')
  })

  test('treats auto and off as off when supported (auto only triggers the suggestion)', () => {
    expect(computeEffectiveAgentMode('auto', true)).toBe('off')
    expect(computeEffectiveAgentMode('off', true)).toBe('off')
  })
})

describe('prepareAgentGenerationHarness', () => {
  test('prepares the real context, system prompt, tools, and sandbox gating for an uploaded file', async () => {
    const userMessage: Message = {
      id: 'msg-1',
      role: MessageRoleEnum.User,
      timestamp: Date.now(),
      contentParts: [{ type: 'text', text: 'Analyze this spreadsheet and create an HTML report.' }],
      files: [
        {
          id: 'file-1',
          name: 'sales.xlsx',
          storageKey: 'parsed-sales',
          rawStorageKey: 'raw-sales',
          byteLength: 2048,
          parserType: 'sandbox-raw',
        },
      ],
    } as unknown as Message

    const lockAgentMode = vi.fn()
    const prepared = await prepareAgentGenerationHarness({
      session: createSession(),
      settings: {
        provider: 'chatbox-ai',
        modelId: 'test-model',
      } as SessionSettings,
      globalSettings: {} as Settings,
      configs: { uuid: 'config-1' } as Config,
      messages: [userMessage],
      targetMsgIx: 1,
      model: createMockModel(),
      dependencies: createModelDependencies(),
      webBrowsing: false,
      agentModeValue: 'on',
      agentModeLocked: false,
      agentModeSupported: true,
      signal: new AbortController().signal,
      sandboxProviderFactory: () => sandboxProviderMock as unknown as SandboxProvider,
      isPro: () => true,
      sideEffects: {
        lockAgentMode,
      },
    })

    expect(lockAgentMode).toHaveBeenCalledWith('message_sent')
    expect(sandboxProviderMock.checkAvailability).toHaveBeenCalled()
    expect(prepared.debug.effectiveAgentMode).toBe('on')
    expect(prepared.debug.canExecuteCode).toBe(true)
    expect(prepared.debug.instructions).toContain('## Response Language')
    expect(prepared.debug.instructions).toContain("same language as the user's latest message")

    expect(prepared.tools.code_execution).toBeDefined()
    expect(prepared.tools.read_file).toBeDefined()
    expect(prepared.tools.write_file).toBeDefined()
    expect(prepared.tools.load_skill).toBeDefined()
    expect(prepared.tools.install_skill).toBeDefined()

    const lastPromptMessage = prepared.promptMsgs.at(-1)
    expect(lastPromptMessage).toBeDefined()
    const promptText = lastPromptMessage ? getMessageText(lastPromptMessage, true, false) : ''
    expect(promptText).toContain('<ATTACHMENT_FILE>')
    expect(promptText).toContain('<SANDBOX_MODE>true</SANDBOX_MODE>')
    expect(promptText).toContain('<SANDBOX_PATH>sales.xlsx</SANDBOX_PATH>')
    expect(promptText).not.toContain('ATTACHED_FILES')

    const serializedCoreMessages = JSON.stringify(prepared.coreMessages)
    expect(serializedCoreMessages).toContain('Current model: test-model')
    expect(serializedCoreMessages).toContain('## Response Language')
    expect(serializedCoreMessages).toContain("same language as the user's latest message")
    expect(serializedCoreMessages).toContain('code_execution')
    expect(serializedCoreMessages).toContain('Available Skills')

    expect(prepared.chatOptions.tools).toBe(prepared.tools)
    expect(prepared.chatOptions.agentMode).toBe(true)
    expect(prepared.chatOptions.prepareStep).toBeUndefined()
  })

  test('keeps legacy auto mode on the plain chat path when there are no files', async () => {
    const userMessage: Message = {
      id: 'msg-1',
      role: MessageRoleEnum.User,
      timestamp: Date.now(),
      contentParts: [{ type: 'text', text: 'Make a small HTML demo.' }],
    }

    const prepared = await prepareAgentGenerationHarness({
      session: createSession(),
      settings: {
        provider: 'chatbox-ai',
        modelId: 'test-model',
      } as SessionSettings,
      globalSettings: {} as Settings,
      configs: { uuid: 'config-1' } as Config,
      messages: [userMessage],
      targetMsgIx: 1,
      model: createMockModel(),
      dependencies: createModelDependencies(),
      webBrowsing: false,
      agentModeValue: 'auto',
      agentModeLocked: false,
      agentModeSupported: true,
      signal: new AbortController().signal,
      sandboxProviderFactory: () => sandboxProviderMock as unknown as SandboxProvider,
      isPro: () => true,
    })

    expect(prepared.debug.effectiveAgentMode).toBe('off')
    expect(prepared.chatOptions.agentMode).toBe(false)
    expect(prepared.debug.instructions).not.toContain('## Response Language')
    expect(prepared.tools.code_execution).toBeUndefined()
    expect(prepared.tools.load_skill).toBeUndefined()
    expect(prepared.chatOptions.prepareStep).toBeUndefined()

    const serializedCoreMessages = JSON.stringify(prepared.coreMessages)
    expect(serializedCoreMessages).not.toContain('## Response Language')
  })

  test('keeps legacy auto mode on the plain chat path for a single simple file', async () => {
    const userMessage: Message = {
      id: 'msg-1',
      role: MessageRoleEnum.User,
      timestamp: Date.now(),
      contentParts: [{ type: 'text', text: 'Summarize this note.' }],
      files: [
        {
          id: 'file-1',
          name: 'note.txt',
          fileType: 'text/plain',
          storageKey: 'note-key',
        },
      ],
    } as Message

    const lockAgentMode = vi.fn()
    const prepared = await prepareAgentGenerationHarness({
      session: createSession(),
      settings: {
        provider: 'chatbox-ai',
        modelId: 'test-model',
      } as SessionSettings,
      globalSettings: {} as Settings,
      configs: { uuid: 'config-1' } as Config,
      messages: [userMessage],
      targetMsgIx: 1,
      model: createMockModel(),
      dependencies: createModelDependencies(),
      webBrowsing: false,
      agentModeValue: 'auto',
      agentModeLocked: false,
      agentModeSupported: true,
      signal: new AbortController().signal,
      sandboxProviderFactory: () => sandboxProviderMock as unknown as SandboxProvider,
      isPro: () => true,
      sideEffects: {
        lockAgentMode,
      },
    })

    expect(lockAgentMode).not.toHaveBeenCalled()
    expect(prepared.debug.effectiveAgentMode).toBe('off')
    expect(prepared.tools.code_execution).toBeUndefined()
    expect(prepared.chatOptions.prepareStep).toBeUndefined()
  })

  test('keeps the toolset and context clean when agent mode is manually off', async () => {
    const userMessage: Message = {
      id: 'msg-1',
      role: MessageRoleEnum.User,
      timestamp: Date.now(),
      contentParts: [{ type: 'text', text: 'Answer normally.' }],
    }

    const prepared = await prepareAgentGenerationHarness({
      session: createSession(),
      settings: {
        provider: 'chatbox-ai',
        modelId: 'test-model',
      } as SessionSettings,
      globalSettings: {} as Settings,
      configs: { uuid: 'config-1' } as Config,
      messages: [userMessage],
      targetMsgIx: 1,
      model: createMockModel(),
      dependencies: createModelDependencies(),
      webBrowsing: false,
      agentModeValue: 'off',
      agentModeLocked: false,
      agentModeSupported: true,
      signal: new AbortController().signal,
      sandboxProviderFactory: () => sandboxProviderMock as unknown as SandboxProvider,
      isPro: () => true,
    })

    expect(prepared.debug.effectiveAgentMode).toBe('off')
    expect(prepared.debug.canExecuteCode).toBe(false)
    expect(prepared.tools.code_execution).toBeUndefined()
    expect(prepared.tools.read_file).toBeUndefined()
    expect(prepared.chatOptions.tools).toBeUndefined()
    expect(JSON.stringify(prepared.coreMessages)).not.toContain('SANDBOX_MODE')
  })

  test('keeps a still-generating resumed message with its tool calls in the model context', async () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MessageRoleEnum.User,
        contentParts: [{ type: 'text', text: 'Count from 1 to 30 with one tool call each.' }],
      },
      {
        id: 'assistant-1',
        role: MessageRoleEnum.Assistant,
        // A paused-tool-call continuation hands off to the follow-up generation while
        // the message is still flagged generating; its tool results must stay in context.
        generating: true,
        contentParts: [
          {
            type: 'tool-call',
            state: 'result',
            toolCallId: 'tool-26',
            toolName: 'code_execution',
            args: { code: 'console.log(26)' },
            result: { stdout: '26' },
          },
        ],
      },
    ]

    const prepared = await prepareAgentGenerationHarness({
      session: createSession(),
      settings: { provider: 'chatbox-ai', modelId: 'test-model' } as SessionSettings,
      globalSettings: {} as Settings,
      configs: { uuid: 'config-1' } as Config,
      messages,
      targetMsgIx: messages.length,
      model: createMockModel(),
      dependencies: {} as never,
      webBrowsing: false,
      agentModeValue: 'on',
      agentModeLocked: true,
      agentModeSupported: true,
      signal: new AbortController().signal,
      preserveLastPromptMessageToolCalls: true,
      sandboxProviderFactory: () => sandboxProviderMock as unknown as SandboxProvider,
      isPro: () => true,
    })

    expect(prepared.promptMsgs.some((message) => message.id === 'assistant-1')).toBe(true)
    const serialized = JSON.stringify(prepared.coreMessages)
    expect(serialized).toContain('tool-26')
    expect(serialized).toContain('console.log(26)')
  })
})
