import { describe, expect, it } from 'vitest'
import { inlineSandboxHtmlAssets } from './html-artifact-assets'

function toBase64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

describe('inlineSandboxHtmlAssets', () => {
  it('inlines local script, stylesheet, and image references next to the html file', async () => {
    const files = new Map([
      ['/tmp/chatbox-sandbox/session/chart_data.js', toBase64('window.chartData = [1, 2, 3];')],
      ['/tmp/chatbox-sandbox/session/style.css', toBase64('body { color: red; }')],
      ['/tmp/chatbox-sandbox/session/image.png', 'iVBORw0KGgo='],
    ])

    const html = [
      '<html>',
      '<head><link rel="stylesheet" href="style.css"></head>',
      '<body>',
      '<img src="image.png">',
      '<script src="chart_data.js"></script>',
      '</body>',
      '</html>',
    ].join('\n')

    const result = await inlineSandboxHtmlAssets(html, '/tmp/chatbox-sandbox/session/index.html', async (filePath) => ({
      success: files.has(filePath),
      base64: files.get(filePath),
    }))

    expect(result).toContain('<style>\nbody { color: red; }\n</style>')
    expect(result).toContain('<script>\nwindow.chartData = [1, 2, 3];\n</script>')
    expect(result).toContain('src="data:image/png;base64,iVBORw0KGgo="')
    expect(result).not.toContain('href="style.css"')
    expect(result).not.toContain('src="chart_data.js"')
  })

  it('treats root-relative asset paths as local to the html artifact directory', async () => {
    const result = await inlineSandboxHtmlAssets(
      '<script src="/chart_data.js"></script>',
      '/tmp/chatbox-sandbox/session/report/index.html',
      async (filePath) => ({
        success: filePath === '/tmp/chatbox-sandbox/session/report/chart_data.js',
        base64: toBase64('window.chartData = [];'),
      })
    )

    expect(result).toContain('window.chartData = [];')
  })

  it('leaves remote assets untouched', async () => {
    const html = '<script src="https://example.com/chart.js"></script>'
    const result = await inlineSandboxHtmlAssets(html, '/tmp/chatbox-sandbox/session/index.html', () =>
      Promise.reject(new Error('remote assets should not be read from sandbox'))
    )

    expect(result).toBe(html)
  })
})
