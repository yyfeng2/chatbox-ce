export function getSidebarModalSx(opened: boolean) {
  if (opened) {
    return undefined
  }

  // MUI can leave a keepMounted modal root intercepting clicks when the drawer changes variants.
  // Keep visibility under MUI's control so close animations and iOS swipe-to-open still work.
  return {
    pointerEvents: 'none',
  } as const
}
