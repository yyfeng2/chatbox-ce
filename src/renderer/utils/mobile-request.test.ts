import { describe, expect, test, vi } from 'vitest'
import { cancelReadableStreamOnAbort } from './mobile-request'

describe('mobile request stream cancellation', () => {
  test('swallows locked stream cancel rejections', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const stream = new ReadableStream<Uint8Array>()
    const reader = stream.getReader()

    cancelReadableStreamOnAbort(stream)
    await Promise.resolve()
    await Promise.resolve()

    expect(warnSpy).not.toHaveBeenCalled()
    reader.releaseLock()
    warnSpy.mockRestore()
  })

  test('logs unexpected cancel failures', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const stream = {
      cancel: vi.fn().mockRejectedValue(new Error('boom')),
    } as Pick<ReadableStream<Uint8Array>, 'cancel'> as ReadableStream<Uint8Array>

    cancelReadableStreamOnAbort(stream)
    await Promise.resolve()
    await Promise.resolve()

    expect(warnSpy).toHaveBeenCalledWith('Failed to cancel native stream', expect.any(Error))
    warnSpy.mockRestore()
  })
})
