const SHOW_GUIDE_DEV_BUTTONS_KEY = 'dev-tools:show-guide-dev-buttons'
const FORCE_SHOW_NEW_USER_SCENARIO_CARDS_KEY = 'dev-tools:force-show-new-user-scenario-cards'

export function getShowGuideDevButtonsFlag() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SHOW_GUIDE_DEV_BUTTONS_KEY) === 'true'
}

export function setShowGuideDevButtonsFlag(show: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SHOW_GUIDE_DEV_BUTTONS_KEY, show ? 'true' : 'false')
}

export function getForceShowNewUserScenarioCardsFlag() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(FORCE_SHOW_NEW_USER_SCENARIO_CARDS_KEY) === 'true'
}

export function setForceShowNewUserScenarioCardsFlag(show: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FORCE_SHOW_NEW_USER_SCENARIO_CARDS_KEY, show ? 'true' : 'false')
}
