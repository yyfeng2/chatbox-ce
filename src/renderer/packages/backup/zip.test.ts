import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createZipStream, readZipFileEntries, type ZipArchiveEntry } from './zip'

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of stream) {
    chunks.push(chunk)
    total += chunk.length
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

function asFile(bytes: Uint8Array): File {
  return new File([Uint8Array.from(bytes).buffer], 'backup.zip', { type: 'application/zip' })
}

describe('streaming ZIP', () => {
  it('writes and reads entries without assembling entry data in the ZIP layer', async () => {
    const archive = await collect(
      createZipStream([
        { path: 'manifest.json', data: strToU8('{"ok":true}') },
        { path: 'resources/image.png', data: new Uint8Array([0, 1, 2, 3]), compress: false },
      ])
    )
    const restored = new Map<string, Uint8Array>()
    await readZipFileEntries(asFile(archive), (entry) => {
      restored.set(entry.path, entry.data)
    })
    expect(new TextDecoder().decode(restored.get('manifest.json'))).toBe('{"ok":true}')
    expect(Array.from(restored.get('resources/image.png') ?? [])).toEqual([0, 1, 2, 3])
  })

  it('preserves nested ZIP resources as a single outer entry', async () => {
    const officeDocument = zipSync({
      '[Content_Types].xml': strToU8('<Types />'),
      'ppt/media/': new Uint8Array(),
      'ppt/media/image1.png': new Uint8Array([0, 1, 2, 3]),
    })
    const archive = await collect(
      createZipStream([
        {
          path: 'sessions/session-1/resources/resource-000001.pptx',
          data: officeDocument,
          compress: false,
        },
        { path: 'manifest.json', data: strToU8('{"ok":true}') },
      ])
    )
    const restored = new Map<string, Uint8Array>()

    await readZipFileEntries(asFile(archive), (entry) => {
      restored.set(entry.path, entry.data)
    })

    expect(Array.from(restored.keys())).toEqual(['sessions/session-1/resources/resource-000001.pptx', 'manifest.json'])
    expect(restored.get('sessions/session-1/resources/resource-000001.pptx')).toEqual(officeDocument)
  })

  it('rejects path traversal entries', async () => {
    const archive = zipSync({ '../outside.txt': strToU8('bad') })
    await expect(readZipFileEntries(asFile(archive), async () => undefined)).rejects.toThrow('Unsafe ZIP entry path')
  })

  it('enforces uncompressed entry limits while inflating', async () => {
    const archive = zipSync({ 'large.txt': strToU8('123456') })
    await expect(
      readZipFileEntries(asFile(archive), async () => undefined, { limits: { maxEntryUncompressedBytes: 3 } })
    ).rejects.toThrow('too large')
  })

  it('supports stricter per-entry limits without applying them to binary resources', async () => {
    const archive = zipSync({ 'resource.bin': strToU8('5678'), 'session.json': strToU8('1234') })
    const restored: string[] = []

    await expect(
      readZipFileEntries(
        asFile(archive),
        (entry) => {
          restored.push(entry.path)
        },
        {
          limits: { maxEntryUncompressedBytes: 4 },
          entryLimits: (path) => (path === 'session.json' ? { maxEntryUncompressedBytes: 3 } : {}),
        }
      )
    ).rejects.toThrow('session.json')

    expect(restored).toEqual(['resource.bin'])
  })

  it('rejects a truncated archive', async () => {
    const archive = zipSync({ 'manifest.json': strToU8('{}') })
    await expect(
      readZipFileEntries(asFile(archive.subarray(0, archive.length - 8)), async () => undefined)
    ).rejects.toThrow()
  })

  it('ignores an end-of-central-directory signature embedded in a valid ZIP comment', async () => {
    const archive = zipSync({ 'manifest.json': strToU8('{}') })
    const comment = new Uint8Array(30)
    comment.set([0x50, 0x4b, 0x05, 0x06])
    const withComment = new Uint8Array(archive.length + comment.length)
    withComment.set(archive)
    new DataView(withComment.buffer).setUint16(archive.length - 2, comment.length, true)
    withComment.set(comment, archive.length)
    const restored: string[] = []

    await readZipFileEntries(asFile(withComment), (entry) => {
      restored.push(entry.path)
    })

    expect(restored).toEqual(['manifest.json'])
  })

  it('does not mistake a data-descriptor signature inside a stored entry for the entry boundary', async () => {
    const data = new Uint8Array(1024 * 1024)
    let state = 0x12345678
    for (let index = 0; index < data.length; index++) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      data[index] = state & 0xff
    }
    data.set([0x50, 0x4b, 0x07, 0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], data.length / 2)
    const archive = await collect(
      createZipStream([
        { path: 'resources/collision.bin', data, compress: false },
        { path: 'manifest.json', data: strToU8('{"ok":true}') },
      ])
    )
    const restored = new Map<string, Uint8Array>()

    await readZipFileEntries(asFile(archive), (entry) => {
      restored.set(entry.path, entry.data)
    })

    expect(restored.get('resources/collision.bin')).toEqual(data)
    expect(new TextDecoder().decode(restored.get('manifest.json'))).toBe('{"ok":true}')
  })

  it('feeds large stored entries to the writer in bounded chunks', async () => {
    const data = new Uint8Array(8 * 1024 * 1024)
    let state = 0x12345678
    for (let index = 0; index < data.length; index++) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      data[index] = state & 0xff
    }
    let chunkCount = 0
    let largestChunk = 0
    for await (const chunk of createZipStream([{ path: 'resources/large.bin', data, compress: false }])) {
      chunkCount++
      largestChunk = Math.max(largestChunk, chunk.length)
    }
    expect(chunkCount).toBeGreaterThan(4)
    expect(largestChunk).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  it('rejects duplicate writer paths', async () => {
    const duplicateEntries: ZipArchiveEntry[] = [
      { path: 'manifest.json', data: strToU8('{}') },
      { path: 'manifest.json', data: strToU8('{}') },
    ]
    await expect(collect(createZipStream(duplicateEntries))).rejects.toThrow('Duplicate ZIP entry')
  })

  it('rejects unsafe compression ratios', async () => {
    const archive = zipSync({ 'bomb.txt': new Uint8Array(2 * 1024 * 1024) }, { level: 9 })
    await expect(
      readZipFileEntries(asFile(archive), async () => undefined, { limits: { maxCompressionRatio: 10 } })
    ).rejects.toThrow('compression ratio is unsafe')
  })

  it('rejects unsafe compression ratios for streaming ZIP entries without header sizes', async () => {
    const archive = await collect(createZipStream([{ path: 'bomb.txt', data: new Uint8Array(2 * 1024 * 1024) }]))
    await expect(
      readZipFileEntries(asFile(archive), () => undefined, { limits: { maxCompressionRatio: 10 } })
    ).rejects.toThrow('compression ratio is unsafe')
  })

  it('enforces total uncompressed size and entry count limits', async () => {
    const archive = zipSync({ 'one.txt': strToU8('1234'), 'two.txt': strToU8('5678') })
    await expect(
      readZipFileEntries(asFile(archive), async () => undefined, { limits: { maxTotalUncompressedBytes: 6 } })
    ).rejects.toThrow('uncompressed size')
    await expect(
      readZipFileEntries(asFile(archive), async () => undefined, { limits: { maxEntries: 1 } })
    ).rejects.toThrow('too many entries')
  })
})
