export type HomeWelcomeCardMode = 'none' | 'login' | 'no-license' | 'expired-license'

export function getHomeWelcomeCardMode(params: {
  providerCount: number
  isLoggedIn: boolean
  hasLicense: boolean
  hasExpiredLicense: boolean
  hideForStoreReview?: boolean
}): HomeWelcomeCardMode {
  // Chatbox AI 官方登录/付费解锁（claim free plan / purchase plan / expired）提示已随
  // Chatbox AI license/premium 体系移除。该欢迎卡片对用户不再渲染（mode 始终为 'none'），
  // 组件与调用点保留是为了不破坏 image-creator 等其他仍在引用它的模块。
  void params
  return 'none'
}
