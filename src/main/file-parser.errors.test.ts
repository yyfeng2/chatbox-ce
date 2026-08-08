import type { Stats } from 'fs-extra'
import * as fs from 'fs-extra'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOCAL_PARSER_FILE_TOO_LARGE_ERROR,
  LOCAL_PARSER_MAX_PDF_FILE_SIZE,
  LOCAL_PARSER_PDF_PASSWORD_PROTECTED_ERROR,
} from '../shared/file-parse-errors'
import { parsePdf } from './file-parser'

// Encrypted / oversized PDFs are awkward to build by hand, so stub the file system
// and pdfjs to exercise parsePdf's error branches deterministically.
vi.mock('fs-extra', () => ({
  stat: vi.fn(),
  readFile: vi.fn(async () => Buffer.from('%PDF-1.4')),
}))

vi.mock('pdfjs-dist/legacy/build/pdf.worker.mjs', () => ({}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: () => ({
    // pdfjs raises a typed PasswordException for encrypted PDFs.
    promise: Promise.reject(Object.assign(new Error('No password given'), { name: 'PasswordException' })),
    destroy: () => Promise.resolve(),
  }),
}))

function statWithSize(size: number): Stats {
  return { size } as unknown as Stats
}

describe('parsePdf error handling', () => {
  beforeEach(() => {
    vi.mocked(fs.stat).mockReset()
  })

  it('rejects oversized PDFs before reading them into memory', async () => {
    vi.mocked(fs.stat).mockResolvedValue(statWithSize(LOCAL_PARSER_MAX_PDF_FILE_SIZE + 1))

    await expect(parsePdf('/tmp/huge.pdf')).rejects.toThrow(LOCAL_PARSER_FILE_TOO_LARGE_ERROR)
    // The size guard must short-circuit before the (expensive) file read.
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  it('maps a pdfjs PasswordException to a distinct password-protected error', async () => {
    vi.mocked(fs.stat).mockResolvedValue(statWithSize(1024))

    await expect(parsePdf('/tmp/encrypted.pdf')).rejects.toThrow(LOCAL_PARSER_PDF_PASSWORD_PROTECTED_ERROR)
  })
})
