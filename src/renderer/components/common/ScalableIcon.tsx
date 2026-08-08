import { useMantineTheme } from '@mantine/core'
import type { IconProps } from '@tabler/icons-react'
import { type ElementType, type ForwardedRef, forwardRef, type RefAttributes } from 'react'

type Props = Omit<IconProps, 'size'> & {
  size?: number
  icon: ElementType<IconProps & RefAttributes<SVGSVGElement>>
}

function ScalableIconInner({ icon: IconComponent, size = 16, ...others }: Props, ref: ForwardedRef<SVGSVGElement>) {
  const theme = useMantineTheme()
  const scale = theme.scale ?? 1
  return <IconComponent ref={ref} size={size * scale} {...others} />
}

export const ScalableIcon = forwardRef(ScalableIconInner)
