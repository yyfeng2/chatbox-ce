import type { CSSProperties } from 'react'

export const SELECTED_CLASS = '!bg-chatbox-background-brand-secondary text-chatbox-tint-primary'
export const HOVER_CLASS = 'hover:bg-chatbox-background-secondary-hover'
export const MODEL_SELECTOR_SURFACE_CLASS = 'bg-chatbox-background-primary'
export const DESKTOP_DETAIL_CARD_WIDTH = 320
export const DESKTOP_DETAIL_CARD_MARGIN = 4
export const DESKTOP_DETAIL_CARD_OUTER_WIDTH = DESKTOP_DETAIL_CARD_WIDTH + DESKTOP_DETAIL_CARD_MARGIN * 2
export const DESKTOP_DETAIL_CARD_GAP = 12
export const DESKTOP_DETAIL_VIEWPORT_MARGIN = 12

export const CARD_SURFACE_STYLE: CSSProperties = {
  background: 'var(--chatbox-background-primary)',
  borderColor: 'color-mix(in srgb, var(--chatbox-border-secondary), transparent 18%)',
  boxShadow: '0 14px 36px rgb(0 0 0 / 0.14)',
}

export const DRAWER_SURFACE_STYLE: CSSProperties = {
  background: 'var(--chatbox-background-primary)',
  borderColor: 'color-mix(in srgb, var(--chatbox-border-secondary), transparent 12%)',
}

export const MOBILE_TAP_RESET_STYLE: CSSProperties = {
  WebkitTapHighlightColor: 'transparent',
}
