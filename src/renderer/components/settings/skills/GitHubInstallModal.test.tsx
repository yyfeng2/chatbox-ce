// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@/test-utils'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn(
    (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })
  ),
})

const mocks = vi.hoisted(() => ({
  installSkill: vi.fn(),
  translations: {} as Record<string, string>,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => mocks.translations[key] ?? key,
  }),
}))

vi.mock('@/packages/skills/controller', () => ({
  skillsController: {
    installSkill: mocks.installSkill,
  },
}))

import GitHubInstallModal from './GitHubInstallModal'

function renderModal() {
  render(
    <MantineProvider>
      <GitHubInstallModal
        opened
        onClose={vi.fn()}
        skills={[{ name: 'skill-name', path: 'skills/skill-name' }]}
        repoOwner="owner"
        repoName="repo"
        onInstallComplete={vi.fn()}
      />
    </MantineProvider>
  )
}

describe('GitHubInstallModal install status badges', () => {
  test.each([
    ['English', 'Installing', 'Install Selected'],
    ['简体中文', '正在安装', '安装已选'],
  ])('keeps the %s installing label visible without shrinking', (_language, installing, installSelected) => {
    mocks.translations = {
      Installing: installing,
      'Install Selected': installSelected,
    }
    mocks.installSkill.mockReturnValue(new Promise(() => {}))

    renderModal()
    fireEvent.click(screen.getByRole('button', { name: installSelected }))

    const badge = screen.getByText(installing).parentElement
    expect(badge?.getAttribute('style')).toContain('flex: 0 0 auto')
    expect(badge?.getAttribute('style')).toContain('width: max-content')
  })
})
