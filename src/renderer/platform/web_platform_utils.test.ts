import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockParsePdfFileLocally } = vi.hoisted(() => ({
  mockParsePdfFileLocally: vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: {
    setStoreBlob: vi.fn(),
  },
}))

vi.mock('@/packages/pdf-parser', () => ({
  parsePdfFileLocally: mockParsePdfFileLocally,
}))

import { parseFileLocallyInBrowser } from './web_platform_utils'

describe('parseFileLocallyInBrowser', () => {
  beforeEach(() => {
    mockParsePdfFileLocally.mockReset()
  })

  it('reads text files directly', async () => {
    const file = new File(['hello'], 'notes.md', { type: 'text/markdown' })

    const result = await parseFileLocallyInBrowser(file)

    expect(result).toEqual({ text: 'hello', isSupported: true })
    expect(mockParsePdfFileLocally).not.toHaveBeenCalled()
  })

  it('parses PDF files with the browser PDF parser', async () => {
    const file = new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' })
    mockParsePdfFileLocally.mockResolvedValueOnce('pdf text')

    const result = await parseFileLocallyInBrowser(file)

    expect(mockParsePdfFileLocally).toHaveBeenCalledWith(file)
    expect(result).toEqual({ text: 'pdf text', isSupported: true })
  })

  it('returns unsupported for non-text non-PDF files', async () => {
    const file = new File(['binary data'], 'paper.bin', { type: 'application/octet-stream' })

    const result = await parseFileLocallyInBrowser(file)

    expect(result).toEqual({ text: '', isSupported: false })
    expect(mockParsePdfFileLocally).not.toHaveBeenCalled()
  })

  it('parses Office documents with jszip', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document><w:body><w:p><w:t>hello docx</w:t></w:p></w:body></w:document>'
    )
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buffer], 'paper.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const result = await parseFileLocallyInBrowser(file)

    expect(result).toEqual({ text: 'hello docx', isSupported: true })
    expect(mockParsePdfFileLocally).not.toHaveBeenCalled()
  })

  it('preserves PDF parser error codes', async () => {
    const file = new File(['%PDF'], 'locked.pdf', { type: 'application/pdf' })
    mockParsePdfFileLocally.mockRejectedValueOnce(new Error('pdf_password_protected'))

    const result = await parseFileLocallyInBrowser(file)

    expect(result).toEqual({ text: '', isSupported: false, errorCode: 'pdf_password_protected' })
  })
})
