import { getModel } from '@shared/models'
import type { ModelInterface } from '@shared/models/types'
import { type OAuthCredentials, OAuthIpcChannels, toOAuthSettingsProviderId } from '@shared/oauth'
import { createAfetch } from '@shared/request/request'
import type { SessionSettings } from '@shared/types'
import type {
  ApiRequestOptions,
  ModelDependencies,
  OAuthAdapter,
  RequestAdapter,
  StorageAdapter,
} from '@shared/types/adapters'
import type { SentryAdapter } from '@shared/utils/sentry_adapter'
import { getOS } from '@/packages/navigator'
import platform from '@/platform'
import type { PlatformType } from '@/platform/interfaces'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import * as settingActions from '@/stores/settingActions'
import { settingsStore } from '@/stores/settingsStore'
import { apiRequest } from '@/utils/request'
import { RendererSentryAdapter } from './sentry'

interface ModelDependencyPlatformInfo {
  type: PlatformType
  platform: string
  os: string
  version: string
}

interface BlobStorageLike {
  setBlob(key: string, value: string): Promise<void>
  getBlob(key: string): Promise<string | null>
}

interface ApiRequestClient {
  post(
    url: string,
    headers: Record<string, string>,
    body: RequestInit['body'] | undefined,
    options: { signal?: AbortSignal; retry?: number; useProxy?: boolean }
  ): Promise<Response>
  get(
    url: string,
    headers: Record<string, string>,
    options: { signal?: AbortSignal; retry?: number; useProxy?: boolean }
  ): Promise<Response>
}

interface OAuthIpcInvoker {
  invoke(channel: string, providerId: string, credentialJson: string): Promise<string>
}

export interface CreateModelDependenciesOptions {
  platformInfo?: ModelDependencyPlatformInfo
  platformType?: ModelDependencies['platformType']
  storage?: StorageAdapter
  blobStorage?: BlobStorageLike
  createPictureStorageKey?: (folder: string) => string
  request?: RequestAdapter
  apiRequestClient?: ApiRequestClient
  sentry?: SentryAdapter
  getRemoteConfig?: ModelDependencies['getRemoteConfig']
  oauth?: OAuthAdapter
  oauthIpc?: OAuthIpcInvoker
}

async function createDefaultPlatformInfo(): Promise<ModelDependencyPlatformInfo> {
  return {
    type: platform.type,
    platform: await platform.getPlatform(),
    os: getOS(),
    version: (await platform.getVersion()) || 'unknown',
  }
}

function createStorageAdapter(options: CreateModelDependenciesOptions): StorageAdapter {
  if (options.storage) {
    return options.storage
  }
  const blobStorage = options.blobStorage ?? storage
  const createPictureStorageKey = options.createPictureStorageKey ?? StorageKeyGenerator.picture
  return {
    async saveImage(folder: string, dataUrl: string): Promise<string> {
      const storageKey = createPictureStorageKey(folder)
      await blobStorage.setBlob(storageKey, dataUrl)
      return storageKey
    },
    async getImage(keyOrUrl: string): Promise<string> {
      if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
        return keyOrUrl
      }
      const blob = await blobStorage.getBlob(keyOrUrl)
      if (!blob) return ''
      return blob.startsWith('data:') ? blob : `data:image/png;base64,${blob}`
    },
  }
}

function createRequestAdapter(
  platformInfo: ModelDependencyPlatformInfo,
  apiRequestClient: ApiRequestClient = apiRequest
): RequestAdapter {
  const afetch = createAfetch(platformInfo)
  return {
    fetchWithOptions: (
      url: string,
      init?: RequestInit,
      options?: { retry?: number; parseChatboxRemoteError?: boolean }
    ): Promise<Response> => {
      return afetch(url, init, options || {})
    },
    apiRequest(options: ApiRequestOptions): Promise<Response> {
      if (options.method === 'POST') {
        return apiRequestClient.post(options.url, options.headers || {}, options.body, {
          signal: options.signal,
          retry: options.retry,
          useProxy: options.useProxy,
        })
      }
      return apiRequestClient.get(options.url, options.headers || {}, {
        signal: options.signal,
        retry: options.retry,
        useProxy: options.useProxy,
      })
    },
  }
}

function getDefaultOAuthIpc(): OAuthIpcInvoker {
  const maybeDesktopPlatform = platform as unknown as { ipc?: OAuthIpcInvoker }
  if (!maybeDesktopPlatform.ipc) {
    throw new Error('OAuth IPC is only available on desktop')
  }
  return maybeDesktopPlatform.ipc
}

function createDesktopOAuthAdapter(oauthIpc?: OAuthIpcInvoker): OAuthAdapter {
  return {
    async refreshCredential(providerId: string, credential: OAuthCredentials): Promise<OAuthCredentials> {
      const ipc = oauthIpc ?? getDefaultOAuthIpc()
      const resultJson = await ipc.invoke(OAuthIpcChannels.REFRESH, providerId, JSON.stringify(credential))
      const result = JSON.parse(resultJson) as {
        success: boolean
        credentials?: OAuthCredentials
        error?: string
      }
      if (!result.success || !result.credentials) {
        throw new Error(result.error || `Failed to refresh OAuth credential for ${providerId}`)
      }
      return result.credentials
    },
    persistCredential(providerId: string, credential: OAuthCredentials): void {
      const settingsProviderId = toOAuthSettingsProviderId(providerId) || providerId
      settingsStore.setState((currentSettings) => ({
        providers: {
          ...(currentSettings.providers || {}),
          [settingsProviderId]: {
            ...(currentSettings.providers?.[settingsProviderId] || {}),
            oauth: credential,
          },
        },
      }))
    },
    clearCredential(providerId: string): void {
      const settingsProviderId = toOAuthSettingsProviderId(providerId) || providerId
      settingsStore.setState((currentSettings) => {
        const currentProviderSettings = currentSettings.providers?.[settingsProviderId] || {}
        return {
          providers: {
            ...(currentSettings.providers || {}),
            [settingsProviderId]: {
              ...currentProviderSettings,
              oauth: undefined,
            },
          },
        }
      })
    },
  }
}

export async function createModelDependencies(
  options: CreateModelDependenciesOptions = {}
): Promise<ModelDependencies> {
  const platformInfo = options.platformInfo ?? (await createDefaultPlatformInfo())
  const platformType = options.platformType ?? platformInfo.type

  return {
    storage: createStorageAdapter(options),
    request: options.request ?? createRequestAdapter(platformInfo, options.apiRequestClient),
    sentry: options.sentry ?? new RendererSentryAdapter(),
    getRemoteConfig: options.getRemoteConfig ?? settingActions.getRemoteConfig,
    oauth: options.oauth ?? (platformType === 'desktop' ? createDesktopOAuthAdapter(options.oauthIpc) : undefined),
    platformType,
  }
}

export async function createModel(
  settings: SessionSettings,
  dependencies?: ModelDependencies
): Promise<ModelInterface> {
  const globalSettings = settingsStore.getState().getSettings()
  const configs = await platform.getConfig()
  const modelDependencies = dependencies ?? (await createModelDependencies())
  return getModel(settings, globalSettings, configs, modelDependencies)
}
