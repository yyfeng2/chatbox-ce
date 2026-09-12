import { CapacitorHttp } from '@capacitor/core'
import { createNativeStream, type NativeStreamStatus } from '@/native/stream-http'
import { ApiError, NetworkError } from '../../shared/models/errors'

async function drainNativeStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    // Return whatever was read before the failure
  } finally {
    reader.releaseLock()
  }
  return text
}

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lower)
  return entry?.[1]
}

export async function handleMobileRequest(
  url: string,
  method: string,
  headers: Headers,
  body?: RequestInit['body'],
  signal?: AbortSignal
): Promise<Response> {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  // Fix: Convert Headers to plain object without using .entries()
  const headerObj: Record<string, string> = {}
  headers.forEach((value, key) => {
    headerObj[key] = value
  })

  // JSON.parse may throw on non-JSON bodies — treat parse failure as non-streaming.
  let isStreaming = false
  if (body && typeof body === 'string') {
    try {
      isStreaming = JSON.parse(body).stream === true
    } catch {
      isStreaming = false
    }
  }

  if (isStreaming) {
    try {
      // Add SSE Accept header for proper content negotiation
      const handle = createNativeStream({
        url,
        method,
        headers: {
          ...headerObj,
          Accept: 'text/event-stream',
        },
        body: body as string,
      })

      // Cancel the native request directly on abort: a plain stream.cancel()
      // silently fails on a locked stream and leaks the native connection.
      const onAbort = () => handle.cancelNative()
      signal?.addEventListener('abort', onAbort, { once: true })

      // Wait for the native layer to report the HTTP status — equivalent to
      // fetch awaiting the response headers. Resolves null on legacy native
      // plugins without status support.
      const statusInfo: NativeStreamStatus | null = await handle.response

      if (statusInfo && statusInfo.status >= 400) {
        // The native layer routes non-2xx responses through the error stream:
        // drain the body first, then surface the status like the non-streaming
        // path does.
        const rawData = await drainNativeStream(handle.stream)
        throw new ApiError(`Status Code ${statusInfo.status}`, rawData, statusInfo.status)
      }

      const contentType = statusInfo ? findHeader(statusInfo.headers, 'Content-Type') : undefined
      return new Response(handle.stream, {
        status: statusInfo?.status ?? 200,
        headers: {
          'Content-Type': contentType ?? 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    } catch (err) {
      // Surface real API errors (401/429/...) instead of falling back, otherwise
      // the request would run twice. NetworkError is a connection-level failure:
      // rethrow it so retryRequest retries, same as the plain-fetch path.
      if (err instanceof ApiError || err instanceof NetworkError) {
        throw err
      }
      console.warn('Native streaming unavailable, falling back', err)
    }
  }

  const response = await CapacitorHttp.request({
    url,
    method,
    headers: headerObj,
    data: body,
    responseType: 'text',
    // Bounds hangs: without these the native HttpURLConnection waits forever
    // (especially on connect), so retryRequest never gets a chance to retry.
    // Read timeout is generous — non-streaming LLM generations can take minutes.
    connectTimeout: 30000,
    readTimeout: 600000,
  })

  const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
  // Treat status 0 or < 200 as errors, in addition to >= 400
  if (response.status === 0 || response.status < 200 || response.status >= 400) {
    throw new ApiError(`Status Code ${response.status}`, rawData, response.status)
  }
  const responseData = rawData

  if (isStreaming) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(responseData))
        controller.close()
      },
    })
    return new Response(stream, {
      status: response.status,
      headers: { ...response.headers, 'Content-Type': 'text/event-stream' },
    })
  }

  return new Response(responseData, {
    status: response.status,
    headers: response.headers,
  })
}
