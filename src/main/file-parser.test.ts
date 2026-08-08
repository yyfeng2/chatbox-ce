import * as os from 'node:os'
import * as path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import * as fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFile, parsePdf } from './file-parser'

/**
 * Build a minimal valid PDF with one Helvetica text page per entry in `pages`,
 * computing xref offsets so pdfjs can parse it. Avoids committing binary fixtures.
 */
function buildPdf(pages: string[][]): Buffer {
  const objects: string[] = []
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  pages.forEach((lines, i) => {
    const pageNum = 4 + i * 2
    const contentNum = pageNum + 1
    let stream = ''
    if (lines.length > 0) {
      stream = 'BT /F1 12 Tf 72 720 Td 14 TL\n'
      stream += lines.map((line) => `(${line}) Tj T*`).join('\n')
      stream += '\nET'
    }
    objects[pageNum] =
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`
    objects[contentNum] = `${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  })

  return assembleObjects(objects)
}

/**
 * Build a single-page PDF from a raw content stream so tests can position text
 * fragments at exact coordinates (e.g. sub-line baseline jitter that `buildPdf`'s
 * line-based API cannot express).
 */
function buildPdfFromStream(stream: string): Buffer {
  const objects: string[] = []
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  objects[2] = '2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n'
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  objects[4] =
    '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
    '/Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>\nendobj\n'
  objects[5] = `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  return assembleObjects(objects)
}

/** Serialize a sparse object array into a valid PDF with computed xref offsets. */
function assembleObjects(objects: string[]): Buffer {
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length
    pdf += objects[i]
  }
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

/** Build a minimal EPUB fixture without relying on the optional native zipfile module. */
function buildEpub(): Buffer {
  return Buffer.from(
    zipSync({
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`),
      'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">epub-fallback-test</dc:identifier>
    <dc:title>EPUB fallback test</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter" />
  </spine>
</package>`),
      'OEBPS/toc.ncx': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="epub-fallback-test" /></head>
  <docTitle><text>EPUB fallback test</text></docTitle>
  <navMap>
    <navPoint id="chapter-nav" playOrder="1">
      <navLabel><text>Fallback chapter</text></navLabel>
      <content src="chapter.xhtml" />
    </navPoint>
  </navMap>
</ncx>`),
      'OEBPS/chapter.xhtml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body><h1>Fallback chapter</h1><p>Parsed without the native zipfile binding.</p></body>
</html>`),
    })
  )
}

describe('parsePdf', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-parser-test-'))
  })

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  it('inserts a page marker before each page so models can cite PDF page numbers', async () => {
    const filePath = path.join(tmpDir, 'three-pages.pdf')
    await fs.writeFile(
      filePath,
      buildPdf([
        ['Hello World page one.', 'Second line on page one.'],
        ['Page two content here.'],
        ['Final page three text.'],
      ])
    )

    const text = await parsePdf(filePath)

    expect(text).toContain('==== Page 1 ====')
    expect(text).toContain('==== Page 2 ====')
    expect(text).toContain('==== Page 3 ====')
    // Page text stays under its own marker
    expect(text.indexOf('Hello World page one.')).toBeGreaterThan(text.indexOf('==== Page 1 ===='))
    expect(text.indexOf('Hello World page one.')).toBeLessThan(text.indexOf('==== Page 2 ===='))
    expect(text.indexOf('Page two content here.')).toBeGreaterThan(text.indexOf('==== Page 2 ===='))
    expect(text.indexOf('Page two content here.')).toBeLessThan(text.indexOf('==== Page 3 ===='))
    expect(text.indexOf('Final page three text.')).toBeGreaterThan(text.indexOf('==== Page 3 ===='))
  })

  it('keeps line breaks between text lines within a page', async () => {
    const filePath = path.join(tmpDir, 'multiline.pdf')
    await fs.writeFile(filePath, buildPdf([['First line.', 'Second line.']]))

    const text = await parsePdf(filePath)

    const pageBody = text.split('==== Page 1 ====')[1]
    expect(pageBody).toContain('First line.')
    expect(pageBody).toContain('Second line.')
    expect(pageBody).not.toContain('First line.Second line.')
    // pdfjs line markers must not be double-counted into blank lines between text.
    expect(pageBody).not.toMatch(/First line\.\n\s*\nSecond line\./)
  })

  it('does not insert a line break for sub-line baseline jitter on the same visual line', async () => {
    const filePath = path.join(tmpDir, 'jitter.pdf')
    // "Hello" then "World" nudged 4pt up (still the same visual line for a 12pt
    // font, tolerance 6pt) — must not split into separate lines.
    await fs.writeFile(filePath, buildPdfFromStream('BT /F1 12 Tf 72 720 Td (Hello) Tj 40 4 Td (World) Tj ET'))

    const text = await parsePdf(filePath)

    const pageBody = text.split('==== Page 1 ====')[1]
    expect(pageBody).toContain('Hello')
    expect(pageBody).toContain('World')
    expect(pageBody).not.toMatch(/Hello\s*\n\s*World/)
  })

  it('still breaks lines when the baseline advances a full line height', async () => {
    const filePath = path.join(tmpDir, 'real-lines.pdf')
    // Two fragments a full 14pt line apart must remain on separate lines.
    await fs.writeFile(filePath, buildPdfFromStream('BT /F1 12 Tf 72 720 Td (Above) Tj 0 -14 Td (Below) Tj ET'))

    const text = await parsePdf(filePath)

    const pageBody = text.split('==== Page 1 ====')[1]
    expect(pageBody).toMatch(/Above\s*\n\s*Below/)
  })

  it('returns an empty string for PDFs without extractable text (e.g. scanned documents)', async () => {
    const filePath = path.join(tmpDir, 'no-text.pdf')
    await fs.writeFile(filePath, buildPdf([[], []]))

    const text = await parsePdf(filePath)

    expect(text).toBe('')
  })

  it('is used by parseFile for .pdf files', async () => {
    const filePath = path.join(tmpDir, 'routed.pdf')
    await fs.writeFile(filePath, buildPdf([['Routed through parseFile.']]))

    const text = await parseFile(filePath)

    expect(text).toContain('==== Page 1 ====')
    expect(text).toContain('Routed through parseFile.')
  })
})

describe('parseEpub', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-parser-test-'))
  })

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  it('parses EPUB content through the pure-JavaScript fallback', async () => {
    const filePath = path.join(tmpDir, 'fallback.epub')
    await fs.writeFile(filePath, buildEpub())

    const text = await parseFile(filePath)

    expect(text).toContain('Fallback chapter')
    expect(text).toContain('Parsed without the native zipfile binding.')
  })
})
