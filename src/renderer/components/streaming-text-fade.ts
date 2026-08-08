import type { Element, Root, RootContent, Text } from 'hast'
import { useLayoutEffect, useRef } from 'react'

const STREAMING_TEXT_FADE_RETENTION_MS = 350
const MAX_OBSERVED_STREAM_KEYS = 200
const observedStreamKeys = new Set<string>()

export type StreamingTextSegment = {
  createdAt: number
  endOffset: number
  key: string
  startOffset: number
}

type StreamingTextState = {
  segments: StreamingTextSegment[]
  text: string | null
}

function markStreamObserved(streamKey: string) {
  observedStreamKeys.delete(streamKey)
  observedStreamKeys.add(streamKey)
  if (observedStreamKeys.size > MAX_OBSERVED_STREAM_KEYS) {
    const oldestKey = observedStreamKeys.values().next().value
    if (oldestKey) observedStreamKeys.delete(oldestKey)
  }
}

export function useStreamingTextSegments(
  text: string,
  generating?: boolean,
  streamKey?: string
): StreamingTextSegment[] {
  const previousStateRef = useRef<StreamingTextState>(
    streamKey && observedStreamKeys.has(streamKey) ? { segments: [], text } : { segments: [], text: null }
  )
  const previousState = previousStateRef.current
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  let segments: StreamingTextSegment[]
  if (!generating || prefersReducedMotion || text.length === 0) {
    segments = []
  } else if (text === previousState.text) {
    segments = previousState.segments
  } else if (previousState.text === null) {
    segments = [{ createdAt: Date.now(), endOffset: text.length, key: `0-${text.length}`, startOffset: 0 }]
  } else if (text.length > previousState.text.length && text.startsWith(previousState.text)) {
    const now = Date.now()
    segments = [
      ...previousState.segments.filter((segment) => now - segment.createdAt <= STREAMING_TEXT_FADE_RETENTION_MS),
      {
        createdAt: now,
        endOffset: text.length,
        key: `${previousState.text.length}-${text.length}`,
        startOffset: previousState.text.length,
      },
    ]
  } else {
    segments = []
  }

  useLayoutEffect(() => {
    previousStateRef.current = { segments, text }
    if (streamKey && generating) markStreamObserved(streamKey)
  }, [generating, segments, streamKey, text])

  return segments
}

function createAnimatedText(value: string, segment: StreamingTextSegment, sourceOffset: number): Element {
  return {
    type: 'element',
    // react-markdown keys siblings by tag name. A stable per-segment custom tag keeps an
    // in-flight animation mounted when older segments are pruned from the HAST tree.
    tagName: `chatbox-streaming-fade-${segment.key}`,
    properties: {
      dataStreamingFadeKey: `${segment.key}:${sourceOffset}`,
    },
    children: [{ type: 'text', value }],
  }
}

function getClassNames(element: Element): string[] {
  const className = element.properties.className
  if (!Array.isArray(className)) return typeof className === 'string' ? [className] : []
  return className.map(String)
}

function transformChildren(parent: Root | Element, segments: StreamingTextSegment[], blocked: boolean): void {
  const transformed: RootContent[] = []

  for (const child of parent.children) {
    if (child.type === 'element') {
      const classNames = getClassNames(child)
      const childBlocked =
        blocked ||
        child.tagName === 'code' ||
        child.tagName === 'pre' ||
        classNames.some((name) => name.includes('katex'))
      transformChildren(child, segments, childBlocked)
      transformed.push(child)
      continue
    }

    if (blocked || child.type !== 'text') {
      transformed.push(child)
      continue
    }

    const startOffset = child.position?.start.offset
    const endOffset = child.position?.end.offset
    if (startOffset === undefined || endOffset === undefined) {
      transformed.push(child)
      continue
    }

    const overlappingSegments = segments.filter(
      (segment) => segment.endOffset > startOffset && segment.startOffset < endOffset
    )
    if (overlappingSegments.length === 0) {
      transformed.push(child)
      continue
    }

    const sourceLength = endOffset - startOffset
    if (sourceLength !== child.value.length) {
      // Escapes and entities can make rendered text shorter than its Markdown source range.
      // Without a reliable source-to-rendered offset map, animating the whole node would replay history.
      transformed.push(child)
      continue
    }

    let cursor = 0
    for (const segment of overlappingSegments) {
      const segmentStart = Math.max(cursor, segment.startOffset - startOffset, 0)
      const segmentEnd = Math.min(segment.endOffset - startOffset, child.value.length)
      if (segmentEnd <= segmentStart) continue

      if (segmentStart > cursor) {
        const stableText: Text = { type: 'text', value: child.value.slice(cursor, segmentStart) }
        transformed.push(stableText)
      }
      transformed.push(
        createAnimatedText(child.value.slice(segmentStart, segmentEnd), segment, startOffset + segmentStart)
      )
      cursor = segmentEnd
    }

    if (cursor < child.value.length) {
      transformed.push({ type: 'text', value: child.value.slice(cursor) })
    }
  }

  parent.children = transformed
}

export function wrapStreamingSegmentsInHast(tree: Root, segments: StreamingTextSegment[]): void {
  transformChildren(tree, segments, false)
}
