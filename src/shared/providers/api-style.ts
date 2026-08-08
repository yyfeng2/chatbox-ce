import { ModelProviderType, type ProviderModelInfo } from '../types'

/**
 * Maps a provider's type (its API family) to the model API style. ChatboxAI, custom
 * providers, and built-in proxy providers (e.g. github-copilot) carry no reasoning
 * semantics in their provider id, so reasoning-control support is judged by API style
 * (derived from the provider type) + model id.
 *
 * Single source of truth shared by:
 *  - getModel() (request side, stamps `model.apiStyle` when missing)
 *  - useReasoningControlState (UI side, fills the reasoning control's model info)
 * so both paths resolve the same effective provider.
 */
export const API_STYLE_BY_PROVIDER_TYPE: Partial<Record<ModelProviderType, ProviderModelInfo['apiStyle']>> = {
  [ModelProviderType.Claude]: 'anthropic',
  [ModelProviderType.Gemini]: 'google',
  [ModelProviderType.OpenAIResponses]: 'openai-responses',
  [ModelProviderType.OpenAI]: 'openai',
}

export function apiStyleFromProviderType(
  type: ModelProviderType | string | undefined
): ProviderModelInfo['apiStyle'] | undefined {
  return type ? API_STYLE_BY_PROVIDER_TYPE[type as ModelProviderType] : undefined
}
