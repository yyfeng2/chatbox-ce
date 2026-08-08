export interface FileSharingNavigator {
  canShare?: (data: { files: File[] }) => boolean
  share?: (data: { files: File[]; title?: string }) => Promise<void>
}

export function canShareFile(file: File, targetNavigator: FileSharingNavigator = navigator): boolean {
  if (!targetNavigator.canShare || !targetNavigator.share) return false
  try {
    return targetNavigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export async function shareFile(file: File, targetNavigator: FileSharingNavigator = navigator): Promise<boolean> {
  if (!canShareFile(file, targetNavigator) || !targetNavigator.share) return false
  await targetNavigator.share({
    files: [file],
    title: file.name,
  })
  return true
}
