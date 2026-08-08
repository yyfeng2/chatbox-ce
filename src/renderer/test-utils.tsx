import { render as testingLibraryRender, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { AppProviders } from '@/components/AppProviders'

function TestProviders({ children }: { children: ReactNode }) {
  return <AppProviders>{children}</AppProviders>
}

function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult {
  return testingLibraryRender(ui, { wrapper: TestProviders, ...options })
}

export * from '@testing-library/react'
export { render, TestProviders }
