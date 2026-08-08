import { registerPlugin } from '@capacitor/core'

export interface SaveFileOptions {
  sourceUri: string
  suggestedName: string
  mimeType?: string
}

export interface SaveFileResult {
  uri: string
}

export interface AndroidDocumentSaverPlugin {
  saveFile(options: SaveFileOptions): Promise<SaveFileResult>
}

export const AndroidDocumentSaver = registerPlugin<AndroidDocumentSaverPlugin>('DocumentSaver')
