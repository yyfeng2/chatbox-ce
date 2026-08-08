import { CapacitorHttp } from '@capacitor/core'
import { createNativeReadableStream } from '@/native/stream-http'
import { ApiError } from '../../shared/models/errors'

function isLockedStreamCancelError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('Cannot cancel a locked stream') ||
      error.message.includes('ReadableStream is locked') ||
      error.message.includes('stream is locked'))
  )
}

export function cancelReadableStreamOnAbort(stream: ReadableStream<Uint8Array>) {
  try {
    void stream.cancel('aborted').catch((error: unknown) => {
      if (!isLockedStreamCancelError(error)) {
        console.warn('Failed to cancel native stream', error)
      }
    })
  } catch (error) {
    if (!isLockedStreamCancelError(error)) {
      console.warn('Failed to cancel native stream', error)
    }
  }
}

export async function handleMobileRequest(
  url: string,
  method: string,
  headers: Headers,
  body?: RequestInit['body'],
  signal?: AbortSignal
): Promise<Response> {
  // Fix: Convert Headers to plain object without using .entries()
  const headerObj: Record<string, string> = {}
  headers.forEach((value, key) => {
    headerObj[key] = value
  })
  const isStreaming = body && typeof body === 'string' && JSON.parse(body).stream === true

  if (isStreaming) {
    try {
      // Add SSE Accept header for proper content negotiation
      const streamHeaders = {
        ...headerObj,
        Accept: 'text/event-stream',
      }

      const stream = createNativeReadableStream({
        url,
        method,
        headers: streamHeaders,
        body: body as string,
      })

      // Handle abort signal for stream cancellation
      if (signal) {
        const onAbort = () => {
          cancelReadableStreamOnAbort(stream)
        }
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }

      // TODO: Once native plugin supports returning status/headers,
      // use them instead of hardcoded values
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    } catch (err) {
      console.warn('Native streaming unavailable, falling back', err)
    }
  }

  const response = await CapacitorHttp.request({
    url,
    method,
    headers: headerObj,
    data: body,
    responseType: 'text',
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
