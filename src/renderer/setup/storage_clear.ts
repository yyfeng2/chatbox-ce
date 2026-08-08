import type { Session } from '@shared/types'
import { collectSessionResourceReferences } from '@/packages/backup/resources'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { listSessionsMetaPage } from '@/stores/chatStore'
import { settingsStore } from '@/stores/settingsStore'
import platform from '../platform'
import storage from '../storage'

// 启动时执行消息图片清理
// 只有网页版本需要清理，桌面版本存在本地、空间足够大无需清理
// 同时也避免了桌面端疑似出现的“图片丢失”问题（可能不是bug，与开发环境有关？）
if (platform.type !== 'desktop') {
  setTimeout(() => {
    void tickStorageTask()
  }, 10 * 1000) // 防止水合状态
}

export async function tickStorageTask() {
  const allBlobKeys = await storage.getBlobKeys()
  const prefixes = ['picture:', 'file:', 'parseUrl-', 'parseFile-']
  const storageKeys = allBlobKeys.filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
  if (storageKeys.length === 0) {
    return
  }
  const needDeletedSet = new Set<string>(storageKeys)

  // 会话中还存在的图片、文件不需要删除
  let sessionCursor: number | null = 0
  while (sessionCursor !== null) {
    const page = await listSessionsMetaPage(sessionCursor)
    for (const sessionMeta of page.items) {
      // 不从 atom 中获取，避免水合状态
      const session = await storage.getItem<Session | null>(StorageKeyGenerator.session(sessionMeta.id), null)
      if (!session) {
        continue
      }
      for (const reference of collectSessionResourceReferences(session).references) {
        needDeletedSet.delete(reference.storageKey)
      }
      if (needDeletedSet.size === 0) return
    }

    sessionCursor = page.nextCursor
  }

  // 用户头像不需要删除
  const settings = settingsStore.getState().getSettings()
  if (settings.userAvatarKey) {
    needDeletedSet.delete(settings.userAvatarKey)
  }
  // 助手头像不需要删除
  if (settings.defaultAssistantAvatarKey) {
    needDeletedSet.delete(settings.defaultAssistantAvatarKey)
  }
  // 背景图片不需要删除
  if (settings.backgroundImageKey) {
    needDeletedSet.delete(settings.backgroundImageKey)
  }

  // Image Creator 的图片存储在独立的 ImageGenerationStorage 中，需要额外排除仍被记录引用的 blobs
  try {
    const imageGenStorage = platform.getImageGenerationStorage()
    await imageGenStorage.initialize()
    const total = await imageGenStorage.getTotal()
    let cursor = 0
    const pageSize = 100
    while (cursor < total) {
      const page = await imageGenStorage.getPage(cursor, pageSize)
      for (const record of page.items) {
        for (const k of record.generatedImages) needDeletedSet.delete(k)
        for (const k of record.referenceImages) needDeletedSet.delete(k)
      }
      if (page.nextCursor === null) break
      cursor = page.nextCursor
    }
  } catch (e) {
    console.error('storage_clear: failed to scan image generation storage', e)
    return
  }
  for (const key of needDeletedSet) {
    await storage.delBlob(key)
  }
}
