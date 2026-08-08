// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Element, Root } from 'hast'
import { StrictMode } from 'react'
import ReactMarkdown from 'react-markdown'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@/test-utils'
import StreamingTextFade from './StreamingTextFade'
import { type StreamingTextSegment, wrapStreamingSegmentsInHast } from './streaming-text-fade'

const blockCss = readFileSync(path.join(process.cwd(), 'src/renderer/static/Block.css'), 'utf8')

function rehypeWrapStreamingSegments(options: StreamingTextSegment[]) {
  return (tree: Root) => wrapStreamingSegmentsInHast(tree, options)
}

describe('wrapStreamingSegmentsInHast', () => {
  it('keeps multiple recent Markdown suffixes in separate animation spans', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            {
              type: 'text',
              value: 'hello world!',
              position: {
                start: { line: 1, column: 1, offset: 0 },
                end: { line: 1, column: 13, offset: 12 },
              },
            },
          ],
        },
      ],
    }

    wrapStreamingSegmentsInHast(tree, [
      { createdAt: 0, endOffset: 11, key: '6-11', startOffset: 6 },
      { createdAt: 50, endOffset: 12, key: '11-12', startOffset: 11 },
    ])

    const paragraph = tree.children[0] as Element
    expect(paragraph.children).toEqual([
      { type: 'text', value: 'hello ' },
      {
        type: 'element',
        tagName: 'chatbox-streaming-fade-6-11',
        properties: {
          dataStreamingFadeKey: '6-11:6',
        },
        children: [{ type: 'text', value: 'world' }],
      },
      {
        type: 'element',
        tagName: 'chatbox-streaming-fade-11-12',
        properties: {
          dataStreamingFadeKey: '11-12:11',
        },
        children: [{ type: 'text', value: '!' }],
      },
    ])
  })

  it('does not wrap code content', () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [
                {
                  type: 'text',
                  value: 'const answer = 42',
                  position: {
                    start: { line: 1, column: 1, offset: 0 },
                    end: { line: 1, column: 18, offset: 17 },
                  },
                },
              ],
            },
          ],
        },
      ],
    }

    wrapStreamingSegmentsInHast(tree, [{ createdAt: 0, endOffset: 17, key: '6-17', startOffset: 6 }])

    expect(tree).not.toHaveProperty('children.0.children.0.children.0.properties.className', [
      'chatbox-streaming-text-fade',
    ])
    expect((tree.children[0] as Element).children[0]).toMatchObject({
      type: 'element',
      children: [{ type: 'text', value: 'const answer = 42' }],
    })
  })

  it('renders the stable Markdown element with the CSS data hook', () => {
    const segment: StreamingTextSegment = {
      createdAt: 0,
      endOffset: 11,
      key: '6-11',
      startOffset: 6,
    }
    const view = render(
      <ReactMarkdown rehypePlugins={[[rehypeWrapStreamingSegments, [segment]]]}>hello world</ReactMarkdown>
    )

    const animatedElement = view.container.querySelector('[data-streaming-fade-key]')
    expect(animatedElement?.tagName).toBe('CHATBOX-STREAMING-FADE-6-11')
    expect(animatedElement?.getAttribute('data-streaming-fade-key')).toBe('6-11:6')
    expect(animatedElement?.textContent).toBe('world')
  })

  it.each([
    { expected: '*hello wo', source: '\\*hello wo' },
    { expected: 'A & Bo', source: 'A &amp; Bo' },
  ])('does not replay an encoded text node while appending to $source', ({ expected, source }) => {
    const segment: StreamingTextSegment = {
      createdAt: 0,
      endOffset: source.length,
      key: `${source.length - 1}-${source.length}`,
      startOffset: source.length - 1,
    }
    const view = render(
      <ReactMarkdown rehypePlugins={[[rehypeWrapStreamingSegments, [segment]]]}>{source}</ReactMarkdown>
    )

    expect(view.container.querySelector('[data-streaming-fade-key]')).toBeNull()
    expect(view.container.textContent).toBe(expected)
  })
})

describe('StreamingTextFade', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('keeps recent suffix spans mounted long enough to finish their animations', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const view = render(
      <StrictMode>
        <StreamingTextFade text="hello" streamKey="retention-test" generating />
      </StrictMode>
    )
    const container = view.container.firstElementChild as HTMLElement
    const firstAnimatedSpan = container.querySelector('.chatbox-streaming-text-fade')
    expect(firstAnimatedSpan?.textContent).toBe('hello')
    const streamingRuleStart = blockCss.indexOf('.chatbox-streaming-text-fade')
    const streamingRuleEnd = blockCss.indexOf('}', streamingRuleStart)
    const streamingRule = blockCss.slice(streamingRuleStart, streamingRuleEnd)
    expect(streamingRule).toContain('display: inline;')
    expect(streamingRule).toContain('position: relative;')
    expect(streamingRule).not.toContain('inline-block')

    vi.setSystemTime(1_050)
    view.rerender(
      <StrictMode>
        <StreamingTextFade text="hello world" streamKey="retention-test" generating />
      </StrictMode>
    )
    const secondAnimatedSpans = container.querySelectorAll('.chatbox-streaming-text-fade')
    expect(container.textContent).toBe('hello world')
    expect(Array.from(secondAnimatedSpans, (span) => span.textContent)).toEqual(['hello', ' world'])
    expect(secondAnimatedSpans[0]).toBe(firstAnimatedSpan)

    vi.setSystemTime(1_100)
    view.rerender(
      <StrictMode>
        <StreamingTextFade text="hello world!" streamKey="retention-test" generating />
      </StrictMode>
    )
    const thirdAnimatedSpans = container.querySelectorAll('.chatbox-streaming-text-fade')
    expect(container.textContent).toBe('hello world!')
    expect(Array.from(thirdAnimatedSpans, (span) => span.textContent)).toEqual(['hello', ' world', '!'])
    expect(thirdAnimatedSpans[0]).toBe(firstAnimatedSpan)
    expect(thirdAnimatedSpans[1]).toBe(secondAnimatedSpans[1])

    vi.setSystemTime(1_500)
    view.rerender(
      <StrictMode>
        <StreamingTextFade text="hello world! again" streamKey="retention-test" generating />
      </StrictMode>
    )
    const prunedAnimatedSpans = container.querySelectorAll('.chatbox-streaming-text-fade')
    expect(container.textContent).toBe('hello world! again')
    expect(Array.from(prunedAnimatedSpans, (span) => span.textContent)).toEqual([' again'])
  })

  it('does not replay existing text after remounting an observed stream', () => {
    const firstMount = render(<StreamingTextFade text="already streamed" streamKey="remount-test" generating />)
    expect(firstMount.container.querySelector('.chatbox-streaming-text-fade')?.textContent).toBe('already streamed')
    firstMount.unmount()

    const view = render(<StreamingTextFade text="already streamed" streamKey="remount-test" generating />)
    const container = view.container.firstElementChild as HTMLElement

    expect(container.querySelector('.chatbox-streaming-text-fade')).toBeNull()

    view.rerender(<StreamingTextFade text="already streamed text" streamKey="remount-test" generating />)
    const animatedSpan = container.querySelector('.chatbox-streaming-text-fade')
    expect(animatedSpan?.textContent).toBe(' text')
    expect(container.textContent).toBe('already streamed text')
  })

  it('does not animate completed or replacement text', () => {
    const view = render(<StreamingTextFade text="initial" generating={false} />)
    const container = view.container.firstElementChild as HTMLElement
    expect(container.querySelector('.chatbox-streaming-text-fade')).toBeNull()

    view.rerender(<StreamingTextFade text="replacement" generating />)
    expect(container.textContent).toBe('replacement')
    expect(container.querySelector('.chatbox-streaming-text-fade')).toBeNull()

    view.rerender(<StreamingTextFade text="replacement done" generating={false} />)
    expect(container.querySelector('.chatbox-streaming-text-fade')).toBeNull()
  })

  it('does not animate when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    )
    const view = render(<StreamingTextFade text="hello" generating />)
    const container = view.container.firstElementChild as HTMLElement

    view.rerender(<StreamingTextFade text="hello world" generating />)
    expect(container.textContent).toBe('hello world')
    expect(container.querySelector('.chatbox-streaming-text-fade')).toBeNull()
  })
})
