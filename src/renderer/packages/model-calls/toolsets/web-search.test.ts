import { ChatboxAIAPIError } from '@shared/models/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getLicenseKeyMock = vi.fn()
const getExtensionSettingsMock = vi.fn()
const getParseLinkProviderMock = vi.fn()
const webSearchExecutorMock = vi.fn()

vi.mock('@/stores/settingActions', () => ({
  getLicenseKey: () => getLicenseKeyMock(),
  getExtensionSettings: () => getExtensionSettingsMock(),
}))

vi.mock('@/packages/web-search', () => ({
  getParseLinkProvider: () => getParseLinkProviderMock(),
  webSearchExecutor: (...args: unknown[]) => webSearchExecutorMock(...args),
}))

// Import after mocks are registered
import { parseLinkTool, webSearchTool } from '@/packages/model-calls/toolsets/web-search'

type ParseLinkInput = { url: string; maxLength?: number }

type ParseLinkToolLike = {
  execute: (
    input: ParseLinkInput,
    context: { abortSignal?: AbortSignal }
  ) => Promise<{
    url: string
    title: string
    content: string
    originalLength: number
    truncated: boolean
  }>
}

async function execParseLink(input: ParseLinkInput, abortSignal?: AbortSignal) {
  // The `tool()` wrapper from `ai` exposes `execute` directly on the returned object.
  return await (parseLinkTool as unknown as ParseLinkToolLike).execute(input, { abortSignal })
}

async function toModelOutput(tool: unknown, output: unknown) {
  const mapper = tool as {
    toModelOutput: (options: { toolCallId: string; input: unknown; output: unknown }) => Promise<unknown> | unknown
  }
  return await mapper.toModelOutput({ toolCallId: 'tool-call-id', input: {}, output })
}

describe('webSearchTool', () => {
  it('maps search results to readable model text', async () => {
    await expect(
      toModelOutput(webSearchTool, {
        searchResults: [{ title: 'Result title', snippet: 'Short summary.', link: 'https://example.com/result' }],
      })
    ).resolves.toEqual({
      type: 'text',
      value: 'Result 1\nTitle: Result title\nURL: https://example.com/result\nSnippet:\nShort summary.',
    })
  })
})

describe('parseLinkTool', () => {
  beforeEach(() => {
    getLicenseKeyMock.mockReset()
    getExtensionSettingsMock.mockReset()
    getParseLinkProviderMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('maps parsed page content to readable model text', async () => {
    await expect(
      toModelOutput(parseLinkTool, {
        url: 'https://example.com',
        title: 'Example title',
        content: 'Readable page body.',
        originalLength: 19,
        truncated: false,
      })
    ).resolves.toEqual({
      type: 'text',
      value: 'Title: Example title\nURL: https://example.com\nContent:\nReadable page body.',
    })
  })

  describe('third-party provider (e.g. Tavily)', () => {
    beforeEach(() => {
      getExtensionSettingsMock.mockReturnValue({ webSearch: { provider: 'tavily' } })
    })

    it('routes to provider.parseLink and forwards abortSignal', async () => {
      const parseLinkMock = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        title: 'Tavily Title',
        content: 'Extracted page content.',
      })
      getParseLinkProviderMock.mockReturnValue({ parseLink: parseLinkMock })
      const controller = new AbortController()

      const result = await execParseLink({ url: 'https://example.com' }, controller.signal)

      expect(parseLinkMock).toHaveBeenCalledWith('https://example.com', controller.signal)
      expect(getLicenseKeyMock).not.toHaveBeenCalled()
      expect(result).toEqual({
        url: 'https://example.com',
        title: 'Tavily Title',
        content: 'Extracted page content.',
        originalLength: 'Extracted page content.'.length,
        truncated: false,
      })
    })

    it('propagates underlying provider errors (e.g. missing API key)', async () => {
      const apiKeyError = ChatboxAIAPIError.fromCodeName('tavily_api_key_required', 'tavily_api_key_required')
      getParseLinkProviderMock.mockImplementation(() => {
        throw apiKeyError
      })

      await expect(execParseLink({ url: 'https://example.com' })).rejects.toMatchObject({
        detail: { name: 'tavily_api_key_required' },
      })
    })

    it('throws parse_link_not_supported when no provider has the capability', async () => {
      getParseLinkProviderMock.mockReturnValue(null)

      await expect(execParseLink({ url: 'https://example.com' })).rejects.toMatchObject({
        detail: { name: 'parse_link_not_supported' },
      })
    })

    it('throws parse_link_failed when provider returns null', async () => {
      getParseLinkProviderMock.mockReturnValue({ parseLink: vi.fn().mockResolvedValue(null) })

      await expect(execParseLink({ url: 'https://example.com' })).rejects.toMatchObject({
        detail: { name: 'parse_link_failed' },
      })
    })

    it('truncates third-party result to maxLength', async () => {
      const longContent = 'b'.repeat(15_000)
      getParseLinkProviderMock.mockReturnValue({
        parseLink: vi.fn().mockResolvedValue({
          url: 'https://example.com',
          title: 't',
          content: longContent,
        }),
      })

      const result = await execParseLink({ url: 'https://example.com', maxLength: 5_000 })

      expect(result.content.length).toBe(5_000)
      expect(result.originalLength).toBe(15_000)
      expect(result.truncated).toBe(true)
    })
  })
})
