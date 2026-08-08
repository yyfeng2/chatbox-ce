import type { Session } from '@shared/types'
import platform from '@/platform'
import { isSessionAttachmentRagSupportedFilePath } from '../../../shared/file-extensions'
import { visitSessionFiles } from './resources'
import type { BackupWarning } from './types'

export async function rehydrateImportedSession(session: Session): Promise<{
  session: Session
  warnings: BackupWarning[]
  rollback?: () => Promise<void>
}> {
  const warnings: BackupWarning[] = []
  const files: Array<{ file: NonNullable<Session['messages'][number]['files']>[number]; messageId: string }> = []
  visitSessionFiles(session, (file, message) => {
    if (file.ragMode === 'session-retrieval') files.push({ file, messageId: message.id })
  })

  if (platform.type !== 'desktop') {
    for (const { file } of files) file.ragMode = 'inline'
    return { session, warnings }
  }

  const controller = platform.getSessionAttachmentRagController()
  const createdAttachmentIds: number[] = []
  for (const { file, messageId } of files) {
    if (!file.storageKey || !isSessionAttachmentRagSupportedFilePath(file.name)) {
      file.ragMode = 'inline'
      continue
    }
    try {
      const attachment = await controller.create({
        sessionId: session.id,
        messageId,
        attachmentStorageKey: file.storageKey,
        filename: file.name,
        mimeType: file.fileType,
        fileSize: file.byteLength ?? 0,
        tokenEstimate: file.tokenCountMap?.default ?? 0,
        parserType: file.parserType,
      })
      createdAttachmentIds.push(attachment.id)
      file.sessionAttachmentId = attachment.id
      file.sessionAttachmentAvailability = attachment.availability
      file.sessionAttachmentIndexStatus = attachment.indexStatus
      file.sessionAttachmentStatus = attachment.status
      file.sessionAttachmentChunkCount = attachment.chunkCount ?? 0
      file.sessionAttachmentTotalChunks = attachment.totalChunks ?? 0
      file.sessionAttachmentEmbeddedChunks = attachment.embeddedChunks ?? 0
      file.sessionAttachmentIndexingStage = attachment.indexingStage
    } catch (error) {
      file.ragMode = 'inline'
      warnings.push({
        code: 'rag-rebuild-failed',
        itemType: 'resource',
        itemId: file.name,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return {
    session,
    warnings,
    rollback:
      createdAttachmentIds.length > 0
        ? async () => {
            for (const attachmentId of createdAttachmentIds.reverse()) {
              await controller.deleteAttachment(attachmentId)
            }
          }
        : undefined,
  }
}
