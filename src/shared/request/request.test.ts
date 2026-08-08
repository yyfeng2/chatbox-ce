import { afterEach, describe, expect, it, vi } from 'vitest'
import { type ApiError, type ChatboxAIAPIError } from '../models/errors'
import { createAfetch } from './request'

const platformInfo = {
  type: 'desktop',
  platform: 'darwin',
  os: 'macos',
  version: '1.0.0',
}

describe('createAfetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds platform metadata without dropping caller-provided Chatbox headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const afetch = createAfetch(platformInfo)
    const url = 'https://api.chatboxai.app/gateway/openai/v1/chat/completions'

    await afetch(url, {
      headers: {
        'chatbox-session-id': 'session-123',
        'chatbox-agent-mode': 'true',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(url, {
      headers: {
        'chatbox-session-id': 'session-123',
        'chatbox-agent-mode': 'true',
        'CHATBOX-PLATFORM': 'darwin',
        'CHATBOX-PLATFORM-TYPE': 'desktop',
        'CHATBOX-OS': 'macos',
        'CHATBOX-VERSION': '1.0.0',
      },
    })
  })

  it('stores request id from Chatbox error body on known Chatbox errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'token_quota_exhausted',
              request_id: 'req-from-body',
            },
          }),
          { status: 429 }
        )
      )
    )

    const afetch = createAfetch(platformInfo)

    await expect(
      afetch('https://api.chatboxai.app/gateway/openai/v1/chat/completions', {}, { parseChatboxRemoteError: true })
    ).rejects.toMatchObject({
      code: 10004,
      requestId: 'req-from-body',
    } satisfies Partial<ChatboxAIAPIError>)
  })

  it('stores request id from response headers on generic API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'not_a_real_code', request_id: 'req-from-body' } }), {
          status: 500,
          headers: { 'x-request-id': 'req-from-header' },
        })
      )
    )

    const afetch = createAfetch(platformInfo)

    await expect(
      afetch('https://api.chatboxai.app/gateway/openai/v1/chat/completions', {}, { parseChatboxRemoteError: true })
    ).rejects.toMatchObject({
      code: 10001,
      statusCode: 500,
      requestId: 'req-from-header',
    } satisfies Partial<ApiError>)
  })
})
