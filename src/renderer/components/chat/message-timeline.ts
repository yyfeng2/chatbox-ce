import type { MessageContentParts } from '@shared/types'

type MessageContentPart = MessageContentParts[number]
type TimelinePart = Extract<MessageContentPart, { type: 'reasoning' | 'text' | 'tool-call' }>

export type GroupedMessageContentPart = { type: 'step_group'; parts: TimelinePart[] } | MessageContentPart

interface MessageTimelineLayout {
  orderedContentParts: MessageContentParts
  lastStepIndex: number
  groupedContentParts: GroupedMessageContentPart[]
}

/**
 * Some providers return a single non-streaming response as `[text, reasoning]`.
 * In v1.21, content parts rendered in their stored order without a connected
 * timeline, so the text remained normal answer content and the reasoning block
 * followed it.
 *
 * Preserve that presentation only for the exact two-part compatibility case.
 * Multi-step timelines continue to use their stored order and semantics.
 */
function isLegacyNonStreamingTextReasoningPair(
  contentParts: MessageContentParts,
  isStreamingMode: boolean | undefined
): boolean {
  return (
    isStreamingMode === false &&
    contentParts.length === 2 &&
    contentParts[0].type === 'text' &&
    contentParts[1].type === 'reasoning'
  )
}

export function createMessageTimelineLayout(
  contentParts: MessageContentParts,
  isStreamingMode: boolean | undefined
): MessageTimelineLayout {
  const orderedContentParts = contentParts
  const preserveLegacyTextReasoningPair = isLegacyNonStreamingTextReasoningPair(contentParts, isStreamingMode)

  // Text before the last reasoning/tool-call part is intermediate narration;
  // text after it is the final answer.
  let lastStepIndex = -1
  for (let index = 0; index < orderedContentParts.length; index++) {
    const part = orderedContentParts[index]
    if (part.type === 'reasoning' || part.type === 'tool-call') lastStepIndex = index
  }

  const groupedContentParts: GroupedMessageContentPart[] = []
  const pushToStepGroup = (part: TimelinePart) => {
    const last = groupedContentParts[groupedContentParts.length - 1]
    if (last && 'parts' in last && last.type === 'step_group') {
      last.parts.push(part)
    } else {
      groupedContentParts.push({ type: 'step_group', parts: [part] })
    }
  }

  for (let index = 0; index < orderedContentParts.length; index++) {
    const part = orderedContentParts[index]
    if (part.type === 'tool-call' || part.type === 'reasoning') {
      pushToStepGroup(part)
    } else if (part.type === 'text' && index < lastStepIndex && !preserveLegacyTextReasoningPair) {
      pushToStepGroup(part)
    } else {
      groupedContentParts.push(part)
    }
  }

  return { orderedContentParts, lastStepIndex, groupedContentParts }
}
