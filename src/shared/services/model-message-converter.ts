import type { JSONValue } from '@ai-sdk/provider'
import type { ReasoningPart } from '@ai-sdk/provider-utils'
import type { FilePart, ImagePart, ModelMessage, TextPart, ToolCallPart } from 'ai'
import { compact } from 'lodash'
import type { Message, MessageContentParts, MessageContentToolCallPart } from '../types'
import { getMessageText } from '../utils/message'

/**
 * Resolve a stored image (by storage key) to a data URL (e.g. `data:image/png;base64,...`)
 * or `null` when the image is unavailable. Each shell injects its own implementation:
 * renderer wraps `ModelDependencies.storage.getImage`, native wraps `readNativeImageAsDataUrl`.
 */
export type ModelImageResolver = (storageKey: string) => Promise<string | null>

export interface ConvertToModelMessagesOptions {
  modelSupportVision: boolean
  preserveReasoning?: boolean
  ensureGoogleFunctionCallSignatures?: boolean
}

const GOOGLE_THOUGHT_SIGNATURE_VALIDATOR_BYPASS = 'skip_thought_signature_validator'

async function resolveImageData(
  storageKey: string,
  resolveImage: ModelImageResolver
): Promise<{ base64Data: string; mediaType: string } | null> {
  try {
    const imageData = await resolveImage(storageKey)
    if (!imageData) return null
    return {
      base64Data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
      mediaType: imageData.match(/^data:([^;]+)/)?.[1] || 'image/png',
    }
  } catch {
    return null
  }
}

/**
 * Coerce an arbitrary tool result into a value the AI SDK accepts as a `json` tool output.
 * Tool results may carry non-serializable values (Error instances, circular refs, functions,
 * `undefined`) — e.g. when an MCP/tool execution fails and the raw error leaks into history.
 * Feeding those into `{ type: 'json', value }` makes the AI SDK's `ModelMessage[]` schema
 * validation throw `AI_InvalidPromptError`, blocking the whole request. This defensive net
 * guarantees the value is plain JSON before it reaches the SDK.
 */
function toSafeJSONValue(result: unknown): JSONValue {
  if (result == null) return null
  if (result instanceof Error) {
    return { error: result.message || String(result) }
  }
  try {
    // Round-trip through JSON to strip anything non-serializable. The replacer coerces the
    // values JSON.stringify would otherwise lose silently (nested Errors → `{}`) or throw on
    // (BigInt); JSON.stringify still drops `undefined`/functions and throws on circular refs
    // (caught below).
    return JSON.parse(
      JSON.stringify(result, (_key, value) => {
        if (value instanceof Error) return { error: value.message || String(value) }
        if (typeof value === 'bigint') return value.toString()
        return value
      })
    ) as JSONValue
  } catch {
    return stringifyErrorResult(result)
  }
}

function stringifyErrorResult(result: unknown): string {
  if (result == null) return 'Tool call failed'
  if (typeof result === 'string') return result
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.error === 'string') return obj.error
    try {
      return JSON.stringify(result)
    } catch {
      /* fall through */
    }
  }
  return String(result)
}

/**
 * Coerce a tool-call's stored `args` into a JSON object for the wire `tool_use.input`.
 * Anthropic (and strict OpenAI-compatible) upstreams require `input` to be an object and reject
 * a string with HTTP 422 ("Input should be a valid dictionary"). Malformed model output can leave
 * `args` as an unparseable string — e.g. two concatenated JSON objects `{"q":"a"}{"q":"b"}` — which
 * was previously serialized verbatim, so every history resend of that turn 422'd. Parse strings
 * back into an object, falling back to `{}` when the string is not a JSON object.
 */
function toToolCallInput(args: unknown): unknown {
  if (typeof args !== 'string') return args
  try {
    const parsed = JSON.parse(args)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    /* malformed JSON — fall through to an empty object */
  }
  return {}
}

function hasGoogleThoughtSignature(part: MessageContentToolCallPart): boolean {
  const google = part.providerMetadata?.google
  return Boolean(
    google && typeof google === 'object' && 'thoughtSignature' in google && typeof google.thoughtSignature === 'string'
  )
}

function withGoogleThoughtSignatureBypass(part: MessageContentToolCallPart): MessageContentToolCallPart {
  return {
    ...part,
    providerMetadata: {
      ...part.providerMetadata,
      google: {
        ...part.providerMetadata?.google,
        thoughtSignature: GOOGLE_THOUGHT_SIGNATURE_VALIDATOR_BYPASS,
      },
    },
  }
}

function isCompletedToolCall(part: MessageContentParts[number]): part is MessageContentToolCallPart {
  return part.type === 'tool-call' && (part.state === 'result' || part.state === 'error')
}

function isSameToolCallBatch(first: MessageContentToolCallPart, next: MessageContentToolCallPart): boolean {
  // stepIndex is the provider-level step boundary; parts without one (legacy messages)
  // keep the old one-call-per-batch serialization.
  return first.stepIndex !== undefined && first.stepIndex === next.stepIndex
}

async function convertContentParts<T extends TextPart | ImagePart | FilePart>(
  contentParts: MessageContentParts,
  imageType: 'image' | 'file',
  resolveImage: ModelImageResolver,
  options?: { modelSupportVision: boolean }
): Promise<T[]> {
  return compact(
    await Promise.all(
      contentParts.map(async (c) => {
        if (c.type === 'text') {
          return { type: 'text', text: c.text } as T
        } else if (c.type === 'image') {
          if (options?.modelSupportVision === false) {
            return { type: 'text', text: `This is an image, OCR Result: \n${c.ocrResult}` } as T
          }
          const resolved = await resolveImageData(c.storageKey, resolveImage)
          if (!resolved) return null
          if (imageType === 'image') {
            return { type: 'image', image: resolved.base64Data, mediaType: resolved.mediaType } as T
          }
          return { type: 'file', data: resolved.base64Data, mediaType: resolved.mediaType } as T
        }
        return null
      })
    )
  )
}

async function convertUserContentParts(
  contentParts: MessageContentParts,
  resolveImage: ModelImageResolver,
  options?: { modelSupportVision: boolean }
): Promise<Array<TextPart | ImagePart>> {
  return convertContentParts<TextPart | ImagePart>(contentParts, 'image', resolveImage, options)
}

async function convertAssistantContentParts(
  contentParts: MessageContentParts,
  resolveImage: ModelImageResolver,
  options?: { preserveReasoning?: boolean }
): Promise<Array<TextPart | FilePart | ToolCallPart | ReasoningPart>> {
  const results: Array<TextPart | FilePart | ToolCallPart | ReasoningPart | null> = await Promise.all(
    contentParts.map(async (c) => {
      if (c.type === 'tool-call') {
        if (c.state === 'call' || c.state === 'paused') return null
        return {
          type: 'tool-call' as const,
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          input: toToolCallInput(c.args),
          providerExecuted: c.providerExecuted,
          providerOptions: c.providerMetadata,
        } satisfies ToolCallPart
      }
      if (c.type === 'text') {
        return { type: 'text', text: c.text } as TextPart
      }
      // Reasoning is opt-in per provider. DeepSeek V4 thinking mode requires it on every
      // assistant turn, but other providers reject (xAI Grok 400s on unknown
      // `reasoning_content`) or merge it into text content (Mistral concatenates without
      // a separator). Default off keeps prior behavior; orchestration enables it for DeepSeek.
      if (c.type === 'reasoning') {
        if (!options?.preserveReasoning || !c.text) return null
        return { type: 'reasoning', text: c.text } satisfies ReasoningPart
      }
      if (c.type === 'image') {
        const resolved = await resolveImageData(c.storageKey, resolveImage)
        if (!resolved) return null
        return { type: 'file', data: resolved.base64Data, mediaType: resolved.mediaType } as FilePart
      }
      return null
    })
  )
  return results.filter((r): r is TextPart | FilePart | ToolCallPart | ReasoningPart => r !== null)
}

/**
 * Split assistant contentParts into segments around tool-call boundaries and emit
 * the correct message sequence: assistant(pre-tool + tool-call) → tool(result) → assistant(post-tool).
 * This preserves the ordering that providers expect for multi-turn tool use.
 */
async function emitAssistantMessages(
  contentParts: MessageContentParts,
  resolveImage: ModelImageResolver,
  output: ModelMessage[],
  options?: { preserveReasoning?: boolean; ensureGoogleFunctionCallSignatures?: boolean }
): Promise<void> {
  let cursor = 0
  while (cursor < contentParts.length) {
    const tcIdx = contentParts.findIndex((part, index) => index >= cursor && isCompletedToolCall(part))
    if (tcIdx === -1) break

    // Collect the contiguous run of completed tool calls that belong to the same batch.
    const toolCallParts: MessageContentToolCallPart[] = []
    for (let index = tcIdx; index < contentParts.length; index += 1) {
      const part = contentParts[index]
      if (!isCompletedToolCall(part)) break
      if (toolCallParts.length > 0 && !isSameToolCallBatch(toolCallParts[0], part)) break
      toolCallParts.push(part)
    }
    const batchEnd = tcIdx + toolCallParts.length

    // Gemini 3 signs only the first functionCall of a batch, so a missing signature on the
    // batch head is the only case that needs the validator bypass.
    if (options?.ensureGoogleFunctionCallSignatures && !hasGoogleThoughtSignature(toolCallParts[0])) {
      toolCallParts[0] = withGoogleThoughtSignatureBypass(toolCallParts[0])
    }

    const segment = [...contentParts.slice(cursor, tcIdx), ...toolCallParts]
    const converted = await convertAssistantContentParts(segment, resolveImage, options)
    if (converted.length > 0) {
      output.push({ role: 'assistant' as const, content: converted })
    }

    const toolResults = toolCallParts.map((tc) => {
      let toolOutput: { type: 'error-text'; value: string } | { type: 'json'; value: JSONValue }
      if (tc.state === 'error') {
        toolOutput = { type: 'error-text' as const, value: stringifyErrorResult(tc.result) }
      } else if (tc.resultStorageKey) {
        // The full result was offloaded to blob storage — send the preview + a hint.
        // tc.result is always a plain string here (truncated from the serialized form).
        const preview = String(tc.result ?? '')
        toolOutput = {
          type: 'json' as const,
          value: {
            _truncated: true,
            preview,
            fullResultFileKey: tc.resultStorageKey,
            hint: 'Result was too large and has been truncated. Use the read_file tool with the fullResultFileKey above to read the complete result.',
          } as JSONValue,
        }
      } else {
        toolOutput = { type: 'json' as const, value: toSafeJSONValue(tc.result) }
      }
      return {
        type: 'tool-result' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        output: toolOutput,
        providerOptions: tc.resultProviderMetadata,
      }
    })

    output.push({
      role: 'tool' as const,
      content: toolResults,
    })

    cursor = batchEnd
  }

  if (cursor < contentParts.length) {
    const remaining = contentParts.slice(cursor)
    const converted = await convertAssistantContentParts(remaining, resolveImage, options)
    if (converted.length > 0) {
      output.push({ role: 'assistant' as const, content: converted })
    }
  }
}

/**
 * Convert internal `Message[]` into AI SDK `ModelMessage[]`.
 *
 * Shared between the renderer store and the native chat engine so both shells produce
 * the same wire sequence — crucially preserving assistant tool-call / tool-result history
 * for multi-turn tool conversations. Image resolution is injected via `resolveImage`.
 *
 * Callers are expected to have already applied message sequencing / system→user coercion
 * (e.g. `sequenceMessages`) before calling.
 */
export async function convertToModelMessages(
  messages: Message[],
  resolveImage: ModelImageResolver,
  options?: ConvertToModelMessagesOptions
): Promise<ModelMessage[]> {
  const output: ModelMessage[] = []

  for (const m of messages) {
    switch (m.role) {
      case 'system':
        output.push({
          role: 'system' as const,
          content: getMessageText(m),
        })
        break
      case 'user': {
        const contentParts = await convertUserContentParts(m.contentParts || [], resolveImage, options)
        output.push({
          role: 'user' as const,
          content: contentParts,
        })
        break
      }
      case 'assistant':
        await emitAssistantMessages(m.contentParts || [], resolveImage, output, {
          preserveReasoning: options?.preserveReasoning,
          ensureGoogleFunctionCallSignatures: options?.ensureGoogleFunctionCallSignatures,
        })
        break
      case 'tool':
        // Tool results are now handled inline from assistant message tool-call parts
        break
      default: {
        const _exhaustiveCheck: never = m.role
        throw new Error(`Unknown role: ${_exhaustiveCheck}`)
      }
    }
  }

  return output
}
