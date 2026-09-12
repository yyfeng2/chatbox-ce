import { type StartStreamOptions, StreamHttp } from 'capacitor-stream-http'
import { NetworkError } from '../../shared/models/errors'

export type { StartStreamOptions } from 'capacitor-stream-http'
export { StreamHttp }

export interface NativeStreamStatus {
  status: number
  headers: Record<string, string>
}

export interface NativeStreamHandle {
  /** Data stream: consumed by the Response (2xx) or drained into an error body (>=400). */
  stream: ReadableStream<Uint8Array>
  /**
   * Resolves with the real HTTP status once the native layer reports it, before
   * any body data. Resolves with null on legacy native plugins that emit no
   * 'status' event (first chunk arrives instead).
   */
  response: Promise<NativeStreamStatus | null>
  /** Cancels the underlying native request regardless of the stream lock state. */
  cancelNative(): void
}

export function createNativeStream(options: StartStreamOptions): NativeStreamHandle {
  let streamId: string | null = null
  let removeChunk: (() => void) | null = null
  let removeEnd: (() => void) | null = null
  let removeError: (() => void) | null = null
  let removeStatus: (() => void) | null = null
  let responseSettled = false
  let resolveResponse!: (value: NativeStreamStatus | null) => void
  let rejectResponse!: (reason: unknown) => void
  // Create single TextEncoder instance to reuse
  const textEncoder = new TextEncoder()

  const response = new Promise<NativeStreamStatus | null>((resolve, reject) => {
    resolveResponse = (value) => {
      if (responseSettled) return
      responseSettled = true
      resolve(value)
    }
    rejectResponse = (reason) => {
      if (responseSettled) return
      responseSettled = true
      reject(reason)
    }
  })
  // The Response is only awaited after the status settles; if the native layer
  // errors earlier, keep the rejection from surfacing as unhandled.
  response.catch(() => undefined)

  const cleanup = () => {
    removeChunk?.()
    removeEnd?.()
    removeError?.()
    removeStatus?.()
    removeChunk = null
    removeEnd = null
    removeError = null
    removeStatus = null
  }

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      try {
        // Register listeners first. The native layer emits 'status' before any
        // body data; resolveResponse's settled flag makes later 'chunk' events
        // from legacy plugins (no status support) fall back without overriding.
        removeStatus = (
          await StreamHttp.addListener('status', (data) => {
            if (!streamId || data.id !== streamId) return
            resolveResponse({ status: data.status ?? 0, headers: data.headers ?? {} })
          })
        ).remove

        removeChunk = (
          await StreamHttp.addListener('chunk', (data) => {
            if (!streamId || data.id !== streamId) return
            resolveResponse(null)
            const text = data.chunk || ''
            controller.enqueue(textEncoder.encode(text))
          })
        ).remove

        removeEnd = (
          await StreamHttp.addListener('end', (data) => {
            if (!streamId || data.id !== streamId) return
            cleanup()
            resolveResponse(null)
            controller.close()
          })
        ).remove

        removeError = (
          await StreamHttp.addListener('error', (data) => {
            if (!streamId || data.id !== streamId) return
            cleanup()
            // Connection-level failure: NetworkError lets retryRequest retry it,
            // distinct from a startStream failure (plugin unavailable → fallback).
            let origin = options.url
            try {
              origin = new URL(options.url).origin
            } catch {}
            const error = new NetworkError(data.error || 'Native stream error', origin)
            rejectResponse(error)
            controller.error(error)
          })
        ).remove

        // Start the stream after listeners are registered
        const res = await StreamHttp.startStream(options)
        streamId = res.id
      } catch (error) {
        // Clean up listeners if startStream fails
        cleanup()
        rejectResponse(error instanceof Error ? error : new Error('Failed to start native stream'))
        controller.error(error instanceof Error ? error : new Error('Failed to start native stream'))
      }
    },
    cancel: async () => {
      try {
        if (streamId) {
          await StreamHttp.cancelStream({ id: streamId })
        }
      } finally {
        cleanup()
      }
    },
  })

  return {
    stream,
    response,
    cancelNative() {
      // Bypass the ReadableStream state machine entirely: a plain stream.cancel()
      // throws on a locked stream, which silently leaked the native connection.
      if (streamId) {
        void StreamHttp.cancelStream({ id: streamId }).catch(() => undefined)
      }
    },
  }
}
