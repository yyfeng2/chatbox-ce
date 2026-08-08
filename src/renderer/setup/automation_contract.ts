import { AUTOMATION_CONTRACT_VERSION, AUTOMATION_CONTRACT_VERSION_ATTRIBUTE } from '@shared/automation/testids'

// Publish the UI contract version where Playwright can read it before app initialization.
document.documentElement.setAttribute(AUTOMATION_CONTRACT_VERSION_ATTRIBUTE, AUTOMATION_CONTRACT_VERSION)
