import { Image } from '@mantine/core'
import type { ModelProvider } from '@shared/types'
import { useProviders } from '@/hooks/useProviders'
import { getProviderIconSrc } from '@/utils/providerIconSrc'
import CustomProviderIcon from '../CustomProviderIcon'
import ProviderIcon from './ProviderIcon'

export default function ProviderImageIcon(props: {
  className?: string
  size?: number
  provider: ModelProvider | string
  providerName?: string
}) {
  const { className, size = 24, provider, providerName } = props

  const { providers } = useProviders()
  const providerInfo = providers.find((p) => p.id === provider)

  if (providerInfo?.isCustom) {
    return providerInfo.iconUrl ? (
      <Image w={size} h={size} src={providerInfo.iconUrl} alt={providerInfo.name} />
    ) : (
      <CustomProviderIcon providerId={providerInfo.id} providerName={providerInfo.name} size={size} />
    )
  }

  const iconSrc = getProviderIconSrc(provider)

  return iconSrc ? (
    <Image w={size} h={size} src={iconSrc} className={className} alt={`${providerName || provider} image icon`} />
  ) : providerInfo && !providerInfo.isCustom ? (
    <ProviderIcon provider={provider} size={size} className={className} />
  ) : providerName ? (
    <CustomProviderIcon providerId={provider} providerName={providerName} size={size} />
  ) : null
}
