import { ofetch } from 'ofetch'
import { z } from 'zod'
import { getLogger } from '@/lib/utils'
import { type ClaimedAgentModeReward, ClaimFreeAgentModeRewardResponseSchema } from '@/packages/agent-mode-reward'
import platform from '@/platform'
import { authInfoStore } from '@/stores/authInfoStore'
import { CHATBOX_BUILD_CHANNEL, USE_BETA_CHATBOX, USE_LOCAL_CHATBOX } from '@/variables'
import { ApiError } from '../../shared/models/errors'
import * as chatboxaiAPI from '../../shared/request/chatboxai_pool'
import { createAfetch, createAuthenticatedAfetch, uploadFile } from '../../shared/request/request'
import { reportNativeContent } from '../../shared/services/native-report'
import type { Config, CopilotDetail, ModelProvider, RemoteConfig, SessionRagConfig, Settings } from '../../shared/types'
import { getOS } from './navigator'

const log = getLogger('remote-api')

let _afetch: ReturnType<typeof createAfetch> | null = null
let afetchPromise: Promise<ReturnType<typeof createAfetch>> | null = null

async function initAfetch(): Promise<ReturnType<typeof createAfetch>> {
  if (afetchPromise) return afetchPromise

  afetchPromise = (async () => {
    _afetch = createAfetch({
      type: platform.type,
      platform: await platform.getPlatform(),
      os: getOS(),
      version: await platform.getVersion(),
    })
    return _afetch
  })()

  return afetchPromise
}

async function getAfetch() {
  if (!_afetch) {
    return await initAfetch()
  }
  return _afetch
}

// ========== Authenticated Afetch (带 token 自动刷新) ==========

let _authenticatedAfetch: ReturnType<typeof createAuthenticatedAfetch> | null = null
let authenticatedAfetchPromise: Promise<ReturnType<typeof createAuthenticatedAfetch>> | null = null

async function initAuthenticatedAfetch(): Promise<ReturnType<typeof createAuthenticatedAfetch>> {
  if (authenticatedAfetchPromise) return authenticatedAfetchPromise

  authenticatedAfetchPromise = (async () => {
    _authenticatedAfetch = createAuthenticatedAfetch({
      platformInfo: {
        type: platform.type,
        platform: await platform.getPlatform(),
        os: getOS(),
        version: await platform.getVersion(),
      },
      getTokens: async () => {
        const tokens = authInfoStore.getState().getTokens()
        return tokens
      },
      refreshTokens: async (refreshToken: string) => {
        const result = await refreshAccessToken({ refreshToken })
        authInfoStore.getState().setTokens(result)
        return result
      },
      clearTokens: async () => {
        authInfoStore.getState().clearTokens()
      },
    })
    return _authenticatedAfetch
  })()

  return authenticatedAfetchPromise
}

async function getAuthenticatedAfetch() {
  if (!_authenticatedAfetch) {
    return await initAuthenticatedAfetch()
  }
  return _authenticatedAfetch
}

// ========== API ORIGIN 根据可用性维护 ==========

// const RELEASE_ORIGIN = 'https://releases.chatboxai.app'
export function getAPIOrigin() {
  return chatboxaiAPI.getChatboxAPIOrigin()
}

export function getChatboxOrigin() {
  if (USE_LOCAL_CHATBOX) {
    return 'http://localhost:3002'
  } else if (USE_BETA_CHATBOX) {
    return 'https://beta.chatboxai.app'
  } else {
    return 'https://chatboxai.app'
  }
}

export function buildChatboxUrl(path: string) {
  return new URL(path, getChatboxOrigin()).toString()
}

const getChatboxHeaders = async () => {
  return {
    'CHATBOX-PLATFORM': await platform.getPlatform(),
    'CHATBOX-PLATFORM-TYPE': platform.type,
    'CHATBOX-CHANNEL': CHATBOX_BUILD_CHANNEL,
    'CHATBOX-VERSION': await platform.getVersion(),
    'CHATBOX-OS': getOS(),
  }
}

// ========== 各个接口方法 ==========

export async function checkNeedUpdate(version: string, os: string, config: Config, settings: Settings) {
  type Response = {
    need_update?: boolean
  }
  // const res = await ofetch<Response>(`${RELEASE_ORIGIN}/chatbox_need_update/${version}`, {
  const res = await ofetch<Response>(`${getAPIOrigin()}/chatbox_need_update/${version}`, {
    method: 'POST',
    retry: 3,
    body: {
      uuid: config.uuid,
      os: os,
      allowReportingAndTracking: settings.allowReportingAndTracking ? 1 : 0,
    },
  })
  return !!res.need_update
}

// export async function getSponsorAd(): Promise<null | SponsorAd> {
//     type Response = {
//         data: null | SponsorAd
//     }
//     // const res = await ofetch<Response>(`${RELEASE_ORIGIN}/sponsor_ad`, {
//     const res = await ofetch<Response>(`${API_ORIGIN}/sponsor_ad`, {
//         retry: 3,
//     })
//     return res['data'] || null
// }

// export async function listSponsorAboutBanner() {
//     type Response = {
//         data: SponsorAboutBanner[]
//     }
//     // const res = await ofetch<Response>(`${RELEASE_ORIGIN}/sponsor_about_banner`, {
//     const res = await ofetch<Response>(`${API_ORIGIN}/sponsor_ad`, {
//         retry: 3,
//     })
//     return res['data'] || []
// }

export async function listCopilotTags(lang: string) {
  type Response = {
    data: string[]
  }
  const res = await ofetch<Response>(`${getAPIOrigin()}/api/system_copilots/tags/${lang}`, {
    method: 'GET',
    retry: 3,
  })
  return res.data
}

export async function listCopilotsByCursor(
  lang: string,
  filters?: {
    limit?: number
    cursor?: string
    tag?: string
    search?: string
  }
) {
  type Response = {
    data: CopilotDetail[]
    next_cursor: string | null
  }
  const res = await ofetch<Response>(`${getAPIOrigin()}/api/system_copilots/list`, {
    method: 'POST',
    retry: 3,
    body: { lang, ...filters },
  })
  return res
}

export async function recordCopilotUsage(params: {
  id: string
  action: 'create_session' | 'create_thread' | 'create_message' | 'use_copilot'
}) {
  await ofetch(`${getAPIOrigin()}/api/system_copilots/record_usage`, {
    method: 'POST',
    body: {
      ...params,
      device_id: (await platform.getConfig()).uuid,
    },
  })
}

export async function recordCopilotShare(detail: CopilotDetail) {
  await ofetch(`${getAPIOrigin()}/api/copilots/share-record`, {
    method: 'POST',
    body: {
      detail: detail,
    },
  })
}

export async function getRemoteConfig(config: keyof RemoteConfig) {
  type Response = {
    data: Pick<RemoteConfig, typeof config>
  }
  const res = await ofetch<Response>(`${getAPIOrigin()}/api/remote_config/${config}`, {
    retry: 3,
    headers: await getChatboxHeaders(),
  })
  return res['data']
}

/**
 * In-memory cache for session RAG remote config. The config controls toolset
 * capabilities (rerank availability, rerank model) which the renderer needs every time
 * a tool set is built — once per generation. Hitting the network on each call is
 * wasteful and adds latency to message submission. The remote config changes rarely
 * (capability flag flips, model swaps), so a 10-minute TTL is comfortable.
 *
 * Each cache entry stores the in-flight promise so concurrent callers share a single
 * request. On rejection the entry is evicted so the next caller retries.
 */
type SessionRagConfigCacheEntry = {
  expiresAt: number
  promise: Promise<SessionRagConfig>
}

const SESSION_RAG_CONFIG_CACHE_TTL_MS = 10 * 60 * 1000
const sessionRagConfigCache = new Map<string, SessionRagConfigCacheEntry>()

export async function getSessionRagConfig(params?: { licenseKey?: string }) {
  type Response = {
    data: SessionRagConfig
  }
  const cacheKey = params?.licenseKey ?? ''
  const now = Date.now()
  const cached = sessionRagConfigCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = (async () => {
    const headers = await getChatboxHeaders()
    const res = await ofetch<Response>(`${getAPIOrigin()}/api/session_rag/config`, {
      retry: 3,
      headers: {
        ...(params?.licenseKey ? { Authorization: `Bearer ${params.licenseKey}` } : {}),
        ...headers,
      },
    })
    return res.data
  })()

  const entry: SessionRagConfigCacheEntry = {
    expiresAt: now + SESSION_RAG_CONFIG_CACHE_TTL_MS,
    promise,
  }
  sessionRagConfigCache.set(cacheKey, entry)

  // Evict on failure so the next caller retries instead of being stuck with a rejected
  // promise for the entire TTL window.
  promise.catch(() => {
    if (sessionRagConfigCache.get(cacheKey) === entry) {
      sessionRagConfigCache.delete(cacheKey)
    }
  })

  return promise
}

/**
 * Invalidate cached session RAG config. Call this when the license changes or when the
 * caller has reason to believe the remote config has been updated (e.g. user just
 * activated a new license, signed out).
 */
export function invalidateSessionRagConfigCache(licenseKey?: string) {
  if (licenseKey === undefined) {
    sessionRagConfigCache.clear()
    return
  }
  sessionRagConfigCache.delete(licenseKey)
}

export interface DialogConfig {
  markdown: string
  buttons: { label: string; url: string }[]
}

export async function getDialogConfig(params: { uuid: string; language: string; version: string }) {
  type Response = {
    data: null | DialogConfig
  }
  const res = await ofetch<Response>(`${getAPIOrigin()}/api/dialog_config`, {
    method: 'POST',
    retry: 3,
    body: params,
    headers: await getChatboxHeaders(),
  })
  return res['data'] || null
}

export async function generateUploadUrl(params: { licenseKey: string; filename: string }) {
  type Response = {
    data: {
      url: string
      filename: string
    }
  }
  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/files/generate-upload-url`,
    {
      method: 'POST',
      headers: {
        Authorization: params.licenseKey,
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify(params),
    },
    { parseChatboxRemoteError: true }
  )
  const json: Response = await res.json()
  return json['data']
}

export async function createUserFile<T extends boolean>(params: {
  licenseKey: string
  filename: string
  filetype: string
  returnContent: T
}) {
  type Response = {
    data: {
      uuid: string
      content: T extends true ? string : undefined
    }
  }
  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/files/create`,
    {
      method: 'POST',
      headers: {
        Authorization: params.licenseKey,
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify(params),
    },
    { parseChatboxRemoteError: true }
  )
  const json: Response = await res.json()
  return json['data']
}

export async function uploadAndCreateUserFile(licenseKey: string, file: File) {
  const { url, filename } = await generateUploadUrl({
    licenseKey,
    filename: file.name,
  })
  log.debug(`Uploading user file to URL: ${url}`)
  await uploadFile(file, url)
  log.debug(`Uploaded user file: ${file.name}`)
  const result = await createUserFile({
    licenseKey,
    filename,
    filetype: file.type,
    returnContent: true,
  })
  log.debug(`Created user file with UUID: ${result.uuid}`)
  const storageKey = `parseFile-${file.name}_${result.uuid}.${file.type.split('/')[1]}.txt`

  await platform.setStoreBlob(storageKey, result.content)
  return storageKey
}

export async function parseUserLinkPro(params: { licenseKey: string; url: string; abortSignal?: AbortSignal }) {
  type Response = {
    data: {
      uuid: string
      title: string
      content: string
    }
  }
  const { licenseKey, url, abortSignal } = params
  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/links/parse`,
    {
      method: 'POST',
      headers: {
        Authorization: licenseKey,
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify({
        licenseKey,
        url,
        returnContent: true,
      }),
      signal: abortSignal,
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )
  const json: Response = await res.json()
  const storageKey = `parseUrl-${url}_${json['data']['uuid']}.txt`
  if (json['data']['content']) {
    await platform.setStoreBlob(storageKey, json['data']['content'])
  }
  return {
    key: json['data']['uuid'],
    title: json['data']['title'],
    storageKey,
  }
}

export async function parseUserLinkFree(params: { url: string }) {
  type Response = {
    title: string
    text: string
  }
  const afetch = await getAfetch()
  const res = await afetch(`https://cors-proxy.chatboxai.app/api/fetch-webpage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getChatboxHeaders()),
    },
    body: JSON.stringify(params),
  })
  const json: Response = await res.json()
  return json
}

const RemoteModelInfoSchema = z.object({
  modelId: z.string(),
  modelName: z.string(),
  labels: z.array(z.string()).optional(),
  type: z.enum(['chat', 'embedding', 'rerank', 'image']).optional(),
  apiStyle: z.enum(['google', 'openai', 'openai-responses', 'anthropic']).optional(),
  contextWindow: z.number().optional(),
  capabilities: z.array(z.enum(['vision', 'tool_use', 'reasoning'])).optional(),
})

export type RemoteModelInfo = z.infer<typeof RemoteModelInfoSchema>

const ModelManifestResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    groupName: z.string(),
    models: z.array(RemoteModelInfoSchema),
    imageModels: z.array(RemoteModelInfoSchema).optional().default([]),
  }),
})

export async function getModelManifest(params: { aiProvider: ModelProvider; licenseKey?: string; language?: string }) {
  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/model_manifest`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getChatboxHeaders()),
      },
      body: JSON.stringify({
        aiProvider: params.aiProvider,
        licenseKey: params.licenseKey,
        language: params.language,
      }),
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )
  const { success, data, error } = ModelManifestResponseSchema.safeParse(await res.json())
  if (!success) {
    log.error('getModelManifest error', error)
    throw error
  }
  return data.data
}

export async function reportContent(params: { id: string; type: string; details: string }) {
  const afetch = await getAfetch()
  await reportNativeContent({
    ...params,
    apiOrigin: getAPIOrigin(),
    fetchFn: (input, init) => afetch(input, init),
    headers: await getChatboxHeaders(),
  })
}

export async function getWebAuthToken(): Promise<string> {
  type Response = {
    data: {
      web_auth_token: string
    }
    success: boolean
  }
  const afetch = await getAuthenticatedAfetch()
  const res = await afetch(
    `${getChatboxOrigin()}/api/auth/web_auth_token/generate`,
    {
      method: 'POST',
      headers: {
        ...(await getChatboxHeaders()),
      },
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )
  const json: Response = await res.json()
  return json.data.web_auth_token
}

export async function refreshAccessToken(params: { refreshToken: string }) {
  type Response = {
    data: {
      result: string
    }
  }
  const afetch = await getAfetch()
  const res = await afetch(
    `${getChatboxOrigin()}/api/auth/token_refresh`,
    {
      method: 'POST',
      headers: {
        'x-chatbox-refresh-token': params.refreshToken,
        ...(await getChatboxHeaders()),
      },
    },
    {
      parseChatboxRemoteError: true,
      retry: 2,
    }
  )
  const json: Response = await res.json()
  // log.info('✅ refreshAccessToken response', json)

  const accessToken = res.headers.get('x-chatbox-access-token')
  const refreshToken = res.headers.get('x-chatbox-refresh-token')

  if (!accessToken || !refreshToken) {
    log.error('❌ Missing tokens in response headers:', {
      accessToken: accessToken ? 'present' : 'missing',
      refreshToken: refreshToken ? 'present' : 'missing',
    })
    throw new Error('Failed to refresh token: missing tokens in response headers')
  }

  return {
    accessToken,
    refreshToken,
  }
}

export async function claimFreeAgentModeReward(licenseKey: string): Promise<ClaimedAgentModeReward> {
  const normalizedLicenseKey = licenseKey.trim()
  if (!normalizedLicenseKey) {
    throw new Error('A license key is required to claim the Agent Mode reward')
  }

  const afetch = await getAfetch()
  const res = await afetch(
    `${getAPIOrigin()}/api/license/claim-free-agent-mode-reward`,
    {
      method: 'POST',
      headers: {
        ...(await getChatboxHeaders()),
        Authorization: `Bearer ${normalizedLicenseKey}`,
      },
    },
    {
      parseChatboxRemoteError: true,
      retry: 0,
    }
  )
  return ClaimFreeAgentModeRewardResponseSchema.parse(await res.json())
}
