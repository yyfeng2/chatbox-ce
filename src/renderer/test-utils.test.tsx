// @vitest-environment jsdom

import { AppTooltip } from '@/components/ui/tooltip'
import { render, screen } from '@/test-utils'
import { expect, test } from 'vitest'

test('renders app components with their required providers', () => {
  render(
    <AppTooltip label="Tooltip content">
      <button type="button">Trigger</button>
    </AppTooltip>
  )

  expect(screen.getByRole('button', { name: 'Trigger' })).toBeTruthy()
})
