import { describe, expect, test, vi, beforeEach } from 'vitest'
import { StreamHttp } from 'capacitor-stream-http'
import { handleMobileRequest } from './mobile-request'
import { ApiError } from '../../shared/models/errors'

interface MockStreamHttp {
  addListener: ReturnType<typeof vi.fn>
  startStream: ReturnType<typeof vi.fn>
  cancelStream: ReturnType<typeof vi.fn>
  __emit(event: string, data: Record<string, unknown>): void
  __reset(): void
}

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: {
    request: vi.fn(async () => ({ status: 200, data: 'ok', headers: {} })),
  },
}))

vi.mock('capacitor-stream-http', () => {
  const state = {
    listeners: {} as Record<string, Array<(data: Record<string, unknown>) => void>>,
    nextId: 0,
  }
  const StreamHttp = {
    addListener: vi.fn(async (event: string, cb: (data: Record<string, unknown>) => void) => {
      state.listeners[event] = state.listeners[event] || []
      state.listeners[event].push(cb)
      return {
        remove: () => {
          state.listeners[event] = state.listeners[event].filter((f) => f !== cb)
        },
      }
    }),
    startStream: vi.fn(async () => ({ id: `stream-${++state.nextId}` })),
    cancelStream: vi.fn(async () => undefined),
    __emit(event: string, data: Record<string, unknown>) {
      for (const cb of state.listeners[event] || []) cb(data)
    },
    __reset() {
      state.listeners = {}
      state.nextId = 0
    },
  }
  return { StreamHttp }
})

const mock = StreamHttp as unknown as MockStreamHttp

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

const STREAM_ID = 'stream-1'

describe('mobile request streaming status handling', () => {
  beforeEach(() => {
    mock.__reset()
    vi.clearAllMocks()
  })

  test('builds the Response with the real status reported by the native layer', async () => {
    const pending = handleMobileRequest(
      'https://api.example.com/v1/chat',
      'POST',
      new Headers({ 'Content-Type': 'application/json' }),
      JSON.stringify({ stream: true })
    )
    await flush()
    mock.__emit('status', { id: STREAM_ID, status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    mock.__emit('chunk', { id: STREAM_ID, chunk: 'data: hello' })
    mock.__emit('end', { id: STREAM_ID })

    const res = await pending
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(await res.text()).toBe('data: hello')
  })

  test('surfaces API errors for streaming requests with status >= 400', async () => {
    const pending = handleMobileRequest(
      'https://api.example.com/v1/chat',
      'POST',
      new Headers({ 'Content-Type': 'application/json' }),
      JSON.stringify({ stream: true })
    )
    await flush()
    mock.__emit('status', { id: STREAM_ID, status: 401, headers: { 'Content-Type': 'application/json' } })
    mock.__emit('chunk', { id: STREAM_ID, chunk: '{"error":{"message":"invalid key"}}' })
    mock.__emit('end', { id: STREAM_ID })

    const err = await pending.then(
      () => {
        throw new Error('expected the request to reject')
      },
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).statusCode).toBe(401)
    expect((err as ApiError).responseBody).toBe('{"error":{"message":"invalid key"}}')
  })

  test('cancels the native request directly on abort (locked-stream safe)', async () => {
    const controller = new AbortController()
    const pending = handleMobileRequest(
      'https://api.example.com/v1/chat',
      'POST',
      new Headers({ 'Content-Type': 'application/json' }),
      JSON.stringify({ stream: true }),
      controller.signal
    )
    await flush()
    controller.abort()
    await flush()

    expect(mock.cancelStream).toHaveBeenCalledWith({ id: STREAM_ID })

    // Settle the response so the test can finish cleanly
    mock.__emit('end', { id: STREAM_ID })
    await pending
  })

  test('falls back to status 200 on legacy native plugins without status support', async () => {
    const pending = handleMobileRequest(
      'https://api.example.com/v1/chat',
      'POST',
      new Headers({ 'Content-Type': 'application/json' }),
      JSON.stringify({ stream: true })
    )
    await flush()
    // Legacy plugin: first chunk arrives without any prior status event
    mock.__emit('chunk', { id: STREAM_ID, chunk: 'data: hello' })
    mock.__emit('end', { id: STREAM_ID })

    const res = await pending
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('data: hello')
  })

  test('treats non-JSON bodies as non-streaming', async () => {
    const pending = handleMobileRequest(
      'https://api.example.com/v1/chat',
      'POST',
      new Headers({ 'Content-Type': 'application/json' }),
      'not-json'
    )
    await flush()
    const res = await pending
    expect(res.status).toBe(200)
    expect(mock.startStream).not.toHaveBeenCalled()
    expect(mock.addListener).not.toHaveBeenCalled()
  })
})
