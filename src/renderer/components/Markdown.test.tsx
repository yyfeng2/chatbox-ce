// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@/test-utils'

const { openViewer, sandboxPersistArtifact, sandboxExportFile } = vi.hoisted(() => ({
  openViewer: vi.fn(),
  sandboxPersistArtifact: vi.fn(),
  sandboxExportFile: vi.fn(),
}))

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    exporter: { exportByUrl: vi.fn(), exportImageFile: vi.fn() },
    sandboxPersistArtifact,
    sandboxExportFile,
  },
}))

vi.mock('@/utils/track', () => ({ trackEvent: vi.fn() }))

vi.mock('./Artifact', () => ({
  isRenderableCodeLanguage: () => false,
}))

vi.mock('react-photoswipe-gallery', () => ({
  Gallery: ({
    children,
    uiElements,
  }: {
    children: ReactNode
    uiElements?: Array<{ name: string; ariaLabel?: string }>
  }) => (
    <div
      data-testid="image-viewer"
      data-download-label={uiElements?.find((element) => element.name === 'custom-download-button')?.ariaLabel}
    >
      {children}
    </div>
  ),
  Item: ({
    children,
    original,
    width,
    height,
  }: {
    children: (props: { ref: () => void; open: typeof openViewer; close: () => void }) => ReactNode
    original?: string
    width?: number
    height?: number
  }) => (
    <span data-testid="image-viewer-item" data-original={original} data-width={width} data-height={height}>
      {children({ ref: vi.fn(), open: openViewer, close: vi.fn() })}
    </span>
  ),
}))

import Markdown from './Markdown'

afterEach(() => {
  cleanup()
  openViewer.mockReset()
  sandboxPersistArtifact.mockReset()
  sandboxExportFile.mockReset()
})

describe('Markdown images', () => {
  it('opens a rendered image in the shared viewer and preserves image metadata', async () => {
    render(<Markdown>{'![Generated preview](https://example.com/image.png?x=1&y=2 "Result")'}</Markdown>)

    const image = screen.getByRole('img', { name: 'Generated preview' })
    const viewerItem = screen.getByTestId('image-viewer-item')
    expect(image.getAttribute('title')).toBe('Result')
    expect(image.classList.contains('cursor-zoom-in')).toBe(true)
    expect(viewerItem.getAttribute('data-original')).toBe('https://example.com/image.png?x=1&y=2')
    expect(screen.getByTestId('image-viewer').getAttribute('data-download-label')).toBe('Download')

    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1280 },
      naturalHeight: { configurable: true, value: 720 },
    })
    fireEvent.load(image)

    await waitFor(() => {
      expect(viewerItem.getAttribute('data-width')).toBe('1280')
      expect(viewerItem.getAttribute('data-height')).toBe('720')
    })

    fireEvent.click(image)
    expect(openViewer).toHaveBeenCalledOnce()
  })

  it('opens linked images without navigating the enclosing link', () => {
    render(<Markdown>{'[![Linked preview](https://example.com/image.png)](https://example.com/destination)'}</Markdown>)

    const image = screen.getByRole('img', { name: 'Linked preview' })
    expect(fireEvent.click(image)).toBe(false)
    expect(openViewer).toHaveBeenCalledOnce()
  })

  it('groups all images from one Markdown block in one viewer', () => {
    render(
      <Markdown>{'![First](https://example.com/first.png)\n\n![Second](https://example.com/second.png)'}</Markdown>
    )

    expect(screen.getAllByTestId('image-viewer')).toHaveLength(1)
    expect(screen.getAllByTestId('image-viewer-item')).toHaveLength(2)
  })
})

describe('Markdown sandbox file links', () => {
  it('renders hallucinated sandbox links as a file chip instead of a dead anchor', () => {
    render(<Markdown sessionId="session-1">{'[**Download plot.py**](sandbox:/mnt/data/plot.py)'}</Markdown>)

    const chip = screen.getByRole('button', { name: /Download plot\.py/ })
    expect(chip.tagName).toBe('SPAN')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('keeps ordinary links as anchors', () => {
    render(<Markdown>{'[docs](https://example.com/docs)'}</Markdown>)

    const link = screen.getByRole('link', { name: 'docs' })
    expect(link.getAttribute('href')).toBe('https://example.com/docs')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('rescues the linked file from the session sandbox on click', async () => {
    sandboxPersistArtifact.mockResolvedValue({ success: true, artifactPath: '/durable/plot.py' })
    sandboxExportFile.mockResolvedValue({ success: true })

    render(<Markdown sessionId="session-1">{'[download](sandbox:/mnt/data/plot.py)'}</Markdown>)
    fireEvent.click(screen.getByRole('button', { name: 'download' }))

    await waitFor(() => {
      expect(sandboxPersistArtifact).toHaveBeenCalledWith({
        sandboxPath: 'plot.py',
        sessionId: 'session-1',
        displayName: 'plot.py',
      })
      expect(sandboxExportFile).toHaveBeenCalledWith({ sandboxPath: '/durable/plot.py', suggestedName: 'plot.py' })
    })
  })

  it('degrades to an unavailable state when the file cannot be rescued', async () => {
    sandboxPersistArtifact.mockResolvedValue({ success: false, error: 'File not found' })

    render(<Markdown sessionId="session-1">{'[download](sandbox:/mnt/data/gone.py)'}</Markdown>)
    fireEvent.click(screen.getByRole('button', { name: 'download' }))

    await waitFor(() => {
      expect(screen.getByText(/File no longer available/)).toBeTruthy()
    })
    expect(sandboxExportFile).not.toHaveBeenCalled()
  })

  it('surfaces export failures and keeps the chip clickable', async () => {
    sandboxPersistArtifact.mockResolvedValue({ success: true, artifactPath: '/durable/plot.py' })
    sandboxExportFile.mockResolvedValue({ success: false, error: 'Destination is not writable' })

    render(<Markdown sessionId="session-1">{'[download](sandbox:/mnt/data/plot.py)'}</Markdown>)
    fireEvent.click(screen.getByRole('button', { name: /download/ }))

    await waitFor(() => {
      expect(screen.getByText(/Destination is not writable/)).toBeTruthy()
    })
    const chip = screen.getByRole('button', { name: /download/ })
    expect(chip.getAttribute('aria-disabled')).toBe('false')
    expect(screen.queryByText(/File no longer available/)).toBeNull()
  })

  it('ignores rapid double-clicks while a rescue is in flight', async () => {
    sandboxPersistArtifact.mockResolvedValue({ success: true, artifactPath: '/durable/plot.py' })
    sandboxExportFile.mockResolvedValue({ success: true })

    render(<Markdown sessionId="session-1">{'[download](sandbox:/mnt/data/plot.py)'}</Markdown>)
    const chip = screen.getByRole('button', { name: 'download' })
    fireEvent.click(chip)
    fireEvent.click(chip)

    await waitFor(() => {
      expect(sandboxExportFile).toHaveBeenCalledTimes(1)
    })
    expect(sandboxPersistArtifact).toHaveBeenCalledTimes(1)
  })

  it('treats a cancelled save dialog as a non-error', async () => {
    sandboxPersistArtifact.mockResolvedValue({ success: true, artifactPath: '/durable/plot.py' })
    sandboxExportFile.mockResolvedValue({ success: false, error: 'Save dialog cancelled' })

    render(<Markdown sessionId="session-1">{'[download](sandbox:/mnt/data/plot.py)'}</Markdown>)
    fireEvent.click(screen.getByRole('button', { name: 'download' }))

    await waitFor(() => {
      expect(sandboxExportFile).toHaveBeenCalled()
    })
    expect(screen.queryByText(/Save dialog cancelled/)).toBeNull()
    expect(screen.queryByText(/File no longer available/)).toBeNull()
  })
})
