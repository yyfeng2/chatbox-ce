import { CapacitorHttp } from '@capacitor/core'
import type { SearchResult } from '@shared/types'
import { type FetchOptions, ofetch } from 'ofetch'
import platform from '@/platform'
import { CHATBOX_BUILD_PLATFORM } from '@/variables'

const IOS_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
const FALLBACK_MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'

export interface ParseLinkResult {
  url: string
  title: string
  content: string
}

function formatHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {}

  const result: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    result[key] = value
  })
  return result
}

function getMobileUserAgent() {
  switch (CHATBOX_BUILD_PLATFORM) {
    case 'ios':
      return IOS_USER_AGENT
    case 'android':
      return ANDROID_USER_AGENT
    default:
      return FALLBACK_MOBILE_USER_AGENT
  }
}

abstract class WebSearch {
  abstract search(query: string, signal?: AbortSignal): Promise<SearchResult>

  supportsParseLink = false

  /**
   * Parse/extract readable content from a URL.
   * Override in subclasses that support this capability.
   */
  async parseLink(_url: string, _signal?: AbortSignal): Promise<ParseLinkResult | null> {
    return null
  }

  /**
   * fetch-compatible wrapper over `this.fetch`, for shared implementations
   * (native-web-search.ts) that take a `fetchFn: typeof fetch`. Keeps the
   * mobile CapacitorHttp path (CORS bypass) working for shared providers.
   */
  fetchCompat: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const headers = formatHeaders(init?.headers as HeadersInit | undefined)
    let body: unknown = init?.body
    const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1]
    if (typeof body === 'string' && contentType?.includes('application/json')) {
      try {
        body = JSON.parse(body)
      } catch {}
    }
    const data = await this.fetch(url, {
      method: (init?.method ?? 'GET') as FetchOptions['method'],
      headers,
      body: body as FetchOptions['body'],
      signal: init?.signal ?? undefined,
      responseType: 'json',
    })
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } })
  }

  async fetch(url: string, options: FetchOptions) {
    if (platform.type === 'mobile') {
      const method = options.method ?? 'GET'
      const responseType =
        options.responseType === 'text' ? 'text' : options.responseType === 'json' ? 'json' : undefined
      const userAgent = getMobileUserAgent()
      const headers = {
        ...formatHeaders(options.headers),
        'User-Agent': userAgent,
      }
      const response = await CapacitorHttp.request({
        url,
        method,
        headers,
        params: options.query,
        data: options.body,
        ...(responseType ? { responseType } : {}),
      })
      return response.data
    } else {
      return ofetch(url, options)
    }
  }
}

export default WebSearch
