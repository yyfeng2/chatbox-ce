// @vitest-environment jsdom

import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import { describe, expect, test, vi } from 'vitest'
import { render } from '@/test-utils'
import { getSidebarModalSx } from './sidebar-drawer'

describe('sidebar drawer modal', () => {
  test('keeps the modal root visible while the drawer is open', () => {
    expect(getSidebarModalSx(true)).toBeUndefined()
  })

  test('does not intercept pointer events after the responsive drawer closes', () => {
    render(
      <SwipeableDrawer
        variant="temporary"
        open={false}
        onClose={vi.fn()}
        onOpen={vi.fn()}
        ModalProps={{ keepMounted: true, sx: getSidebarModalSx(false) }}
      >
        <div>Sidebar</div>
      </SwipeableDrawer>
    )

    const modalRoot = document.querySelector<HTMLElement>('.MuiDrawer-modal')
    if (!modalRoot) {
      throw new Error('Drawer modal root was not rendered')
    }
    expect(getComputedStyle(modalRoot).pointerEvents).toBe('none')
  })

  test('keeps the modal visible while SwipeableDrawer handles an internal swipe transition', () => {
    render(
      <SwipeableDrawer
        variant="temporary"
        open
        onClose={vi.fn()}
        onOpen={vi.fn()}
        ModalProps={{ keepMounted: true, sx: getSidebarModalSx(false) }}
      >
        <div>Sidebar</div>
      </SwipeableDrawer>
    )

    const modalRoot = document.querySelector<HTMLElement>('.MuiDrawer-modal')
    if (!modalRoot) {
      throw new Error('Drawer modal root was not rendered')
    }
    expect(getComputedStyle(modalRoot).visibility).toBe('visible')
  })
})
