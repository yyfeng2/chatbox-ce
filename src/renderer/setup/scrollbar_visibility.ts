const SCROLLING_CLASS = 'scrollbar-scrolling'
const SCROLLBAR_HIDE_DELAY = 600
const hideTimers = new WeakMap<Element, number>()

function getScrollElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target
  }
  if (target === document) {
    return document.scrollingElement
  }
  return null
}

document.addEventListener(
  'scroll',
  (event) => {
    const element = getScrollElement(event.target)
    if (!element) {
      return
    }

    const previousTimer = hideTimers.get(element)
    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer)
    }

    element.classList.add(SCROLLING_CLASS)
    hideTimers.set(
      element,
      window.setTimeout(() => {
        element.classList.remove(SCROLLING_CLASS)
        hideTimers.delete(element)
      }, SCROLLBAR_HIDE_DELAY)
    )
  },
  { capture: true, passive: true }
)

export {}
