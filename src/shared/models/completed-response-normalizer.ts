import type { MessageContentParts } from '../types'
import { normalizeDeepSeekCompletedResponse } from './utils/deepseek'

type CompletedResponseNormalizer = (
  contentParts: MessageContentParts,
  finishReason: string | undefined,
  modelId: string
) => MessageContentParts

const normalizers: CompletedResponseNormalizer[] = [normalizeDeepSeekCompletedResponse]

export function normalizeCompletedResponse(
  contentParts: MessageContentParts,
  finishReason: string | undefined,
  modelId: string
): MessageContentParts {
  return normalizers.reduce(
    (normalizedParts, normalize) => normalize(normalizedParts, finishReason, modelId),
    contentParts
  )
}
