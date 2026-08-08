import { Provider as TooltipProvider } from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function AppProviders({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={500}>{children}</TooltipProvider>
}
