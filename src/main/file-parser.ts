import * as chardet from 'chardet'
import Epub from 'epub'
import * as fs from 'fs-extra'
import * as iconv from 'iconv-lite'
import { isEpubFilePath, isOfficeFilePath, isPdfFilePath } from '../shared/file-extensions'
import {
  LOCAL_PARSER_FILE_TOO_LARGE_ERROR,
  LOCAL_PARSER_MAX_PDF_FILE_SIZE,
  LOCAL_PARSER_PDF_PASSWORD_PROTECTED_ERROR,
} from '../shared/file-parse-errors'
import { getLogger } from './util'

const log = getLogger('file-parser')

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string): string {
  // Handle hexadecimal entities like &#x6b64;
  text = text.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16))
    } catch (e) {
      return match // Return original if conversion fails
    }
  })

  // Handle decimal entities like &#123;
  text = text.replace(/&#(\d+);/g, (match, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10))
    } catch (e) {
      return match // Return original if conversion fails
    }
  })

  // Handle named entities
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

// Simple concurrent map implementation using native Promise.allSettled
async function concurrentMap<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = 8
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchNumber = Math.floor(i / concurrency) + 1
    const totalBatches = Math.ceil(items.length / concurrency)

    log.debug(`Processing batch ${batchNumber}/${totalBatches} with ${batch.length} items`)

    const batchResults = await Promise.allSettled(batch.map((item, batchIndex) => mapper(item, i + batchIndex)))

    // Extract successful results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }

  return results
}

export async function parseFile(filePath: string) {
  if (isPdfFilePath(filePath)) {
    try {
      return await parsePdf(filePath)
    } catch (error) {
      log.error(error)
      throw error
    }
  }

  if (isOfficeFilePath(filePath)) {
    try {
      const officeParser = await import('officeparser')
      const data = await officeParser.default.parseOfficeAsync(filePath)
      return data
    } catch (error) {
      log.error(error)
      throw error
    }
  }

  if (isEpubFilePath(filePath)) {
    try {
      const data = await parseEpub(filePath)
      return data
    } catch (error) {
      log.error(error)
      throw error
    }
  }

  // Read first 4KB for encoding detection to avoid memory issues with large files
  const stats = await fs.stat(filePath)
  const sampleSize = Math.min(4096, stats.size)

  // Read sample using createReadStream for partial file reading
  const sampleBuffer = new Uint8Array(sampleSize)
  const fd = await fs.promises.open(filePath, 'r')
  await fd.read(sampleBuffer, 0, sampleSize, 0)
  await fd.close()

  // Detect encoding from sample
  const detectedEncoding = chardet.detect(sampleBuffer)
  const encoding = detectedEncoding || 'utf8'

  log.debug(`Detected encoding for ${filePath}: ${encoding}`)

  // Read full file as buffer and convert with detected encoding
  const fileBuffer = await fs.readFile(filePath)
  const data = iconv.decode(fileBuffer, encoding)
  return data
}

async function loadPdfjs() {
  // The production main bundle inlines dynamic imports, but pdfjs resolves its
  // worker with a runtime-built path that the bundler cannot inline. Pre-load
  // the worker module and expose it via the globalThis.pdfjsWorker hook that
  // pdfjs checks before attempting the dynamic import.
  const globals = globalThis as { pdfjsWorker?: unknown }
  if (!globals.pdfjsWorker) {
    globals.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  }
  return await import('pdfjs-dist/legacy/build/pdf.mjs')
}

/**
 * Per-page marker inserted before each page's text.
 *
 * IMPORTANT: this format must stay in sync with the Chatbox AI backend's remote
 * document parsing (chatbox-backend: documentai.MistralOCRResponse.GetTextWithPageInfo,
 * which emits "\n\n==== Page %d ====\n\n"). Models see this exact format for PDFs
 * parsed remotely (Web/mobile) and locally (desktop); changing it on one side only
 * makes citations inconsistent across platforms.
 */
function formatPdfPageMarker(pageNumber: number): string {
  return `==== Page ${pageNumber} ====`
}

/**
 * Parse a PDF into plain text with per-page markers (see {@link formatPdfPageMarker})
 * so that models can cite PDF page numbers instead of line numbers of the extracted
 * text.
 */
export async function parsePdf(filePath: string): Promise<string> {
  // Guard before reading the file into memory: pdfjs holds the buffer plus its own
  // internal copy, so a huge PDF can transiently use several times its size.
  const stats = await fs.stat(filePath)
  if (stats.size > LOCAL_PARSER_MAX_PDF_FILE_SIZE) {
    throw new Error(LOCAL_PARSER_FILE_TOO_LARGE_ERROR)
  }
  const { getDocument } = await loadPdfjs()
  const fileBuffer = await fs.readFile(filePath)
  const loadingTask = getDocument({
    data: new Uint8Array(fileBuffer),
    // Text extraction does not render glyphs; pdfjs package assets (cMaps,
    // standard fonts) are not shipped with the bundled main process.
    useSystemFonts: true,
  })
  try {
    const document = await loadingTask.promise
    const pageTexts: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      try {
        const page = await document.getPage(pageNumber)
        try {
          const textContent = await page.getTextContent()
          let pageText = ''
          // pdfjs returns text as positioned fragments; insert a line break when the
          // fragment reports an EOL or its baseline (transform[5]) moves vertically.
          let lastY: number | undefined
          for (const item of textContent.items) {
            if (!('str' in item)) {
              continue
            }
            // pdfjs emits empty-string fragments (e.g. via appendEOL) purely as
            // line markers. Honor an explicit EOL but skip the baseline heuristic
            // and the lastY update, otherwise the same break is counted twice and
            // produces spurious blank lines.
            if (item.str === '') {
              if (item.hasEOL && pageText && !pageText.endsWith('\n')) {
                pageText += '\n'
              }
              continue
            }
            const y = item.transform[5]
            // Only break when the baseline moves by more than a fraction of the
            // fragment's font height. A strict inequality treats sub-line jitter
            // (superscripts, footnote markers, mixed font sizes) as new lines and
            // litters the text with spurious breaks; a real line advance is a full
            // line height and still exceeds this tolerance. Fall back to the font
            // matrix scale (transform[3]) when pdfjs reports no height.
            const fontHeight = item.height || Math.abs(item.transform[3]) || 0
            const lineTolerance = fontHeight * 0.5
            if (pageText && !pageText.endsWith('\n') && lastY !== undefined && Math.abs(y - lastY) > lineTolerance) {
              pageText += '\n'
            }
            pageText += item.str
            if (item.hasEOL) {
              pageText += '\n'
            }
            lastY = y
          }
          pageTexts.push(pageText.trim())
        } finally {
          page.cleanup()
        }
      } catch (error) {
        // A single damaged page must not abort extraction of the rest. Push an
        // empty placeholder so the surviving pages keep their real page numbers.
        log.warn(`parsePdf: failed to extract page ${pageNumber} of ${filePath}`, error)
        pageTexts.push('')
      }
    }

    if (pageTexts.every((text) => text === '')) {
      // No extractable text (e.g. a scanned PDF) — keep returning an empty string
      // instead of a list of bare page markers.
      return ''
    }

    log.info(`Parsed PDF ${filePath}: ${document.numPages} pages`)
    return pageTexts.map((text, i) => `${formatPdfPageMarker(i + 1)}\n\n${text}`).join('\n\n')
  } catch (error) {
    // pdfjs throws a typed PasswordException for encrypted PDFs. Surface it as a
    // distinct code so the user is told the PDF needs a password instead of the
    // generic "unsupported file" message (and so the cloud fallback, which also
    // cannot read it, is skipped). Per-page failures are handled inside the loop
    // and never reach here.
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new Error(LOCAL_PARSER_PDF_PASSWORD_PROTECTED_ERROR)
    }
    throw error
  } finally {
    await loadingTask.destroy()
  }
}

export async function parseEpub(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const epub = new Epub(filePath)

    epub.on('error', (error) => {
      log.error('EPUB parsing error:', error)
      reject(error)
    })

    epub.on('end', async () => {
      try {
        const metadata = epub.metadata as { title?: string; creator?: string; language?: string }
        log.info('EPUB metadata:', {
          title: metadata.title,
          creator: metadata.creator,
          language: metadata.language,
          chapters: epub.flow.length,
        })

        // Helper function to process a single chapter
        const processChapter = async (chapter: { id: string }): Promise<string | null> => {
          try {
            const chapterText = await new Promise<string>((resolveChapter, rejectChapter) => {
              epub.getChapter(chapter.id, (error, text) => {
                if (error) {
                  log.error(`Error reading chapter ${chapter.id}:`, error)
                  rejectChapter(error)
                } else {
                  resolveChapter(text || '')
                }
              })
            })

            // Remove HTML tags and extract plain text
            let plainText = chapterText.replace(/<[^>]*>/g, '') // Remove HTML tags

            // Decode HTML entities (including hex)
            plainText = decodeHtmlEntities(plainText)
              .replace(/\s+/g, ' ') // Replace multiple whitespaces with single space
              .trim()

            return plainText || null
          } catch (chapterError) {
            log.warn(`Failed to read chapter ${chapter.id}, skipping:`, chapterError)
            return null // Return null for failed chapters to continue processing
          }
        }

        // Extract text from all chapters using concurrent processing
        log.info(`Starting concurrent processing of ${epub.flow.length} chapters with concurrency: 8`)

        const chapterResults = await concurrentMap(epub.flow as { id: string }[], processChapter, 8)
        const chapterTexts = chapterResults.filter((text: string | null) => text !== null) as string[]
        log.info(`Successfully processed ${chapterTexts.length}/${epub.flow.length} chapters`)

        const fullText = chapterTexts.join('\n\n')

        if (!fullText) {
          throw new Error('No readable text content found in EPUB file')
        }

        log.info(`Successfully extracted ${fullText.length} characters from ${chapterTexts.length} chapters`)
        resolve(fullText)
      } catch (error) {
        log.error('Error extracting EPUB content:', error)
        reject(error)
      }
    })

    epub.parse()
  })
}
