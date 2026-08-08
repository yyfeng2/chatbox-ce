import type { Message } from '@shared/types'
import type { ModelMessage } from 'ai'
import dayjs from 'dayjs'
import { createModelDependencies } from '@/adapters'
import {
  type ConvertToModelMessagesOptions,
  convertToModelMessages as sharedConvertToModelMessages,
} from '../../../shared/services/model-message-converter'
import { cloneMessage, getMessageText } from '../../../shared/utils/message'

/**
 * Convert internal `Message[]` into AI SDK `ModelMessage[]`.
 *
 * Thin renderer wrapper over the shared converter: it resolves the renderer's
 * `ModelDependencies` image storage and injects it as the `resolveImage` seam.
 * The actual conversion logic lives in `@shared/services/model-message-converter`
 * and is shared with the native chat engine.
 */
export async function convertToModelMessages(
  messages: Message[],
  options?: ConvertToModelMessagesOptions
): Promise<ModelMessage[]> {
  const dependencies = await createModelDependencies()
  return sharedConvertToModelMessages(messages, (storageKey) => dependencies.storage.getImage(storageKey), options)
}

/**
 * 在 system prompt 中注入模型信息
 * @param model
 * @param messages
 * @returns
 */
export function injectModelSystemPrompt(
  model: string,
  messages: Message[],
  additionalInfo: string,
  role: 'system' | 'user' = 'system'
) {
  const metadataPrompt = `Current model: ${model}\nCurrent date: ${dayjs().format(
    'YYYY-MM-DD'
  )}\n Additional info for this conversation: ${additionalInfo}\n\n`
  let hasInjected = false
  const injectedMessages = messages.map((m) => {
    if (m.role === role && !hasInjected) {
      m = cloneMessage(m) // 复制，防止原始数据在其他地方被直接渲染使用
      m.contentParts = [{ type: 'text', text: metadataPrompt + getMessageText(m) }]
      hasInjected = true
    }
    return m
  })

  if (!hasInjected) {
    injectedMessages.unshift({
      id: `injected-system-prompt-${dayjs().valueOf()}`,
      role,
      timestamp: Date.now(),
      contentParts: [{ type: 'text', text: metadataPrompt.trimEnd() }],
    })
  }

  return injectedMessages
}
