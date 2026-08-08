import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// preview-server pulls in manager (for sandbox-root resolution), which imports electron + the logger.
const { USER_DATA } = vi.hoisted(() => {
  const os = require('node:os') as typeof import('node:os')
  const p = require('node:path') as typeof import('node:path')
  return { USER_DATA: p.join(os.tmpdir(), `chatbox-test-preview-userdata-${process.pid}`) }
})
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => USER_DATA } }))
vi.mock('../util', () => ({
  getLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createSandboxHtmlPreviewUrl, stopSandboxHtmlPreviewServer } from './preview-server'

const testDirs: string[] = []

async function createSandboxDir(): Promise<string> {
  const root = path.join(tmpdir(), 'chatbox-sandbox')
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(path.join(root, 'preview-test-'))
  testDirs.push(dir)
  return dir
}

afterEach(async () => {
  stopSandboxHtmlPreviewServer()
  await Promise.all(testDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('sandbox preview server', () => {
  it('serves html and sibling assets from the sandbox root', async () => {
    const dir = await createSandboxDir()
    await writeFile(path.join(dir, 'chart_data.js'), 'window.chartData = [1, 2, 3];')
    await writeFile(path.join(dir, 'index.html'), '<script src="chart_data.js"></script>')

    const preview = await createSandboxHtmlPreviewUrl(path.join(dir, 'index.html'))

    expect(preview.success).toBe(true)
    expect(preview.url).toContain('/sandbox/')

    const html = await fetch(preview.url || '').then((res) => res.text())
    expect(html).toContain('chart_data.js')

    const assetUrl = new URL('chart_data.js', preview.url).toString()
    const asset = await fetch(assetUrl).then((res) => res.text())
    expect(asset).toBe('window.chartData = [1, 2, 3];')
  })

  it('rewrites root-relative html asset references to the html directory', async () => {
    const dir = await createSandboxDir()
    await mkdir(path.join(dir, 'report'))
    await writeFile(path.join(dir, 'report', 'chart_data.js'), 'window.chartData = [];')
    await writeFile(path.join(dir, 'report', 'index.html'), '<script src="/chart_data.js"></script>')

    const preview = await createSandboxHtmlPreviewUrl(path.join(dir, 'report', 'index.html'))
    const html = await fetch(preview.url || '').then((res) => res.text())

    expect(html).toContain('/sandbox/')
    expect(html).toContain('/report/chart_data.js')
  })

  it('uses the sandbox referer directory for root-relative runtime requests', async () => {
    const dir = await createSandboxDir()
    await mkdir(path.join(dir, 'report'))
    await writeFile(path.join(dir, 'report', 'data.json'), '{"ok":true}')
    await writeFile(path.join(dir, 'report', 'index.html'), '<html></html>')

    const preview = await createSandboxHtmlPreviewUrl(path.join(dir, 'report', 'index.html'))
    const rootAssetUrl = new URL('/data.json', preview.url).toString()
    const response = await fetch(rootAssetUrl, { headers: { referer: preview.url || '' } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('rejects files outside the sandbox root', async () => {
    const outside = path.join(tmpdir(), `outside-${Date.now()}.html`)
    await writeFile(outside, '<html></html>')
    testDirs.push(outside)

    const preview = await createSandboxHtmlPreviewUrl(outside)

    expect(preview.success).toBe(false)
  })
})
