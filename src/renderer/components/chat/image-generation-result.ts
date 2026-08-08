import type { MessagePicture } from '@shared/types'

function isDirectImageSource(value: string): boolean {
  return /^(https?:|data:image\/|blob:)/i.test(value)
}

export function imageGenerationSourcesToPictures(sources: readonly string[]): MessagePicture[] {
  return sources
    .map((source) => source.trim())
    .filter(Boolean)
    .map((source) => (isDirectImageSource(source) ? { url: source } : { storageKey: source }))
}
