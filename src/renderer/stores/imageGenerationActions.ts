import { BaseError } from '@shared/models/errors'
import { getModel } from '@shared/providers'
import type { ImageGeneration, ImageGenerationModel, ImageGenerationSource } from '@shared/types'
import { createModelDependencies } from '@/adapters'
import { getLogger } from '@/lib/utils'
import platform from '@/platform'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { trackEvent } from '@/utils/track'
import {
  addGeneratedImage,
  createRecord,
  IMAGE_GEN_LIST_QUERY_KEY,
  IMAGE_GEN_QUERY_KEY,
  imageGenerationStore,
  updateRecord,
} from './imageGenerationStore'
import { queryClient } from './queryClient'
import { settingsStore } from './settingsStore'

const log = getLogger('image-generation-actions')

// AbortController for cancelling in-flight polling
let currentAbortController: AbortController | null = null

function getErrorRecordUpdate(
  error: unknown
): Pick<ImageGeneration, 'status' | 'error' | 'errorCode' | 'errorItemUuid'> {
  const normalizedError = error instanceof Error ? error : new Error(`${error}`)
  return {
    status: 'error',
    error: normalizedError.message,
    errorCode: error instanceof BaseError ? error.code : undefined,
    errorItemUuid: undefined,
  }
}

export interface GenerateImageParams {
  prompt: string
  referenceImages: string[]
  model: ImageGenerationModel
  dalleStyle?: 'vivid' | 'natural'
  imageGenerateNum?: number
  aspectRatio?: string
  parentIds?: string[]
  source?: ImageGenerationSource
}

export function isGenerating(): boolean {
  return imageGenerationStore.getState().currentGeneratingId !== null
}

export interface ImageGenerationHandle {
  recordId: string
  startedAt: number
  monitoring: { mode: 'polling'; intervalMs: number } | { mode: 'direct' }
  completion: Promise<ImageGeneration | null>
}

export interface StartImageGenerationOptions {
  /**
   * Runs after the local record is durable and before any potentially billable
   * provider request starts. Callers can use this to persist their own retry key.
   */
  onRecordCreated?: (record: ImageGeneration) => Promise<void>
}

/**
 * Starts image generation without waiting for the provider task to finish.
 * Callers that need background-task notifications can observe `completion`;
 * existing UI callers can keep using `createAndGenerate` and only consume the id.
 */
export async function startImageGeneration(
  params: GenerateImageParams,
  options: StartImageGenerationOptions = {}
): Promise<ImageGenerationHandle> {
  const store = imageGenerationStore.getState()

  // Normalize: 'auto' means no aspect ratio constraint
  if (params.aspectRatio === 'auto') {
    params = { ...params, aspectRatio: undefined }
  }

  if (store.currentGeneratingId !== null) {
    throw new Error('Another image is being generated. Please wait.')
  }

  const record = await createRecord({
    prompt: params.prompt,
    referenceImages: params.referenceImages,
    model: params.model,
    dalleStyle: params.dalleStyle,
    imageGenerateNum: params.imageGenerateNum,
    parentIds: params.parentIds,
    aspectRatio: params.aspectRatio,
    source: params.source,
  })

  try {
    await options.onRecordCreated?.(record)
  } catch (error) {
    await updateRecord(record.id, getErrorRecordUpdate(error))
    throw error
  }

  store.setCurrentGeneratingId(record.id)
  store.setCurrentRecordId(record.id)
  queryClient.setQueryData([IMAGE_GEN_QUERY_KEY, record.id], record)

  const generateFn = generateImagesDirect
  const generation = generateFn(record.id, params).finally(() => {
    imageGenerationStore.getState().setCurrentGeneratingId(null)
    queryClient.invalidateQueries({ queryKey: [IMAGE_GEN_LIST_QUERY_KEY] })
  })

  return {
    recordId: record.id,
    startedAt: record.createdAt,
    monitoring: { mode: 'direct' },
    completion: generation,
  }
}

export async function createAndGenerate(params: GenerateImageParams): Promise<string> {
  const handle = await startImageGeneration(params)
  return handle.recordId
}

async function generateImagesDirect(recordId: string, params: GenerateImageParams): Promise<ImageGeneration | null> {
  const num = params.imageGenerateNum || 1

  currentAbortController = new AbortController()
  const signal = currentAbortController.signal

  try {
    let currentRecord = await updateRecord(recordId, { status: 'generating' })
    if (currentRecord) {
      queryClient.setQueryData([IMAGE_GEN_QUERY_KEY, recordId], currentRecord)
    }

    // Build model instance via provider registry
    const dependencies = await createModelDependencies()
    const globalSettings = settingsStore.getState().getSettings()
    const configs = await platform.getConfig()
    const sessionSettings = {
      provider: params.model.provider,
      modelId: params.model.modelId,
    }
    const model = getModel(sessionSettings, globalSettings, configs, dependencies)

    // Prepare reference images: storage keys → base64 data URLs
    const images: { imageUrl: string }[] = []
    for (const keyOrUrl of params.referenceImages) {
      if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
        images.push({ imageUrl: keyOrUrl })
        continue
      }
      const imageData = await dependencies.storage.getImage(keyOrUrl)
      if (imageData) {
        images.push({ imageUrl: imageData })
      }
    }

    trackEvent('generate_image', {
      provider: params.model.provider,
      model: params.model.modelId,
      num_images: num,
      has_reference: params.referenceImages.length > 0,
      path: 'direct',
    })

    // Call model.paint() with progressive callback
    const resultDataUrls = await model.paint(
      {
        prompt: params.prompt,
        images: images.length > 0 ? images : undefined,
        num,
        aspectRatio: params.aspectRatio,
      },
      signal,
      async (picBase64: string) => {
        const storageKey = StorageKeyGenerator.picture(`image-gen:${recordId}`)
        await storage.setBlob(storageKey, picBase64)
        const updated = await addGeneratedImage(recordId, storageKey)
        if (updated) {
          queryClient.setQueryData([IMAGE_GEN_QUERY_KEY, recordId], updated)
        }
      }
    )

    // Final status based on how many images we got
    if (resultDataUrls.length > 0) {
      // Ensure all returned images are stored (in case callback wasn't called for some)
      const record = await platform.getImageGenerationStorage().getById(recordId)
      const existingCount = record?.generatedImages.length || 0
      if (existingCount < resultDataUrls.length) {
        for (let i = existingCount; i < resultDataUrls.length; i++) {
          const storageKey = StorageKeyGenerator.picture(`image-gen:${recordId}`)
          await storage.setBlob(storageKey, resultDataUrls[i])
          await addGeneratedImage(recordId, storageKey)
        }
      }

      currentRecord = await updateRecord(recordId, {
        status: resultDataUrls.length < num ? 'error' : 'done',
        error: resultDataUrls.length < num ? 'Some images failed to generate' : undefined,
      })
    } else {
      currentRecord = await updateRecord(recordId, {
        status: 'error',
        error: 'All images failed to generate',
      })
    }

    if (currentRecord) {
      queryClient.setQueryData([IMAGE_GEN_QUERY_KEY, recordId], currentRecord)
    }

    log.debug('Direct image generation completed:', recordId, 'images:', resultDataUrls.length)
    return currentRecord
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      log.debug('Direct image generation aborted:', recordId)
      return null
    }

    log.error('Direct image generation failed:', err)

    const updatedRecord = await updateRecord(recordId, getErrorRecordUpdate(err))
    if (updatedRecord) {
      queryClient.setQueryData([IMAGE_GEN_QUERY_KEY, updatedRecord.id], updatedRecord)
    }
    return updatedRecord
  } finally {
    currentAbortController = null
  }
}

export function cancelGeneration(): void {
  const store = imageGenerationStore.getState()
  if (store.currentGeneratingId) {
    // Abort in-flight polling requests
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }

    // Keep status as 'generating' so "Resume Generation" button appears
    store.setCurrentGeneratingId(null)
    queryClient.invalidateQueries({ queryKey: [IMAGE_GEN_LIST_QUERY_KEY] })
  }
}

export async function loadRecord(recordId: string): Promise<ImageGeneration | null> {
  const record = await platform.getImageGenerationStorage().getById(recordId)
  if (record) {
    imageGenerationStore.getState().setCurrentRecordId(record.id)
  }
  return record
}

export function clearCurrentRecord(): void {
  imageGenerationStore.getState().setCurrentRecordId(null)
}

export async function retryGeneration(recordId: string): Promise<void> {
  const store = imageGenerationStore.getState()

  if (store.currentGeneratingId !== null) {
    throw new Error('Another image is being generated. Please wait.')
  }

  const record = await platform.getImageGenerationStorage().getById(recordId)
  if (!record) {
    throw new Error('Record not found')
  }

  // Clear previous task data before retry to avoid confusion
  // This is intentional: retry means start fresh, not resume
  log.debug('Retrying generation, clearing previous task data:', {
    recordId,
    previousTaskId: record.taskId,
  })

  await updateRecord(recordId, {
    taskId: undefined,
    generatedImages: [],
    generatedImageThumbnails: [],
    status: 'pending',
    error: undefined,
    errorCode: undefined,
    errorItemUuid: undefined,
  })

  store.setCurrentGeneratingId(recordId)

  const params: GenerateImageParams = {
    prompt: record.prompt,
    referenceImages: record.referenceImages,
    model: record.model,
    dalleStyle: record.dalleStyle,
    imageGenerateNum: record.imageGenerateNum,
    aspectRatio: record.aspectRatio,
  }

  void generateImagesDirect(recordId, params).finally(() => {
    imageGenerationStore.getState().setCurrentGeneratingId(null)
    queryClient.invalidateQueries({ queryKey: [IMAGE_GEN_LIST_QUERY_KEY] })
  })
}
