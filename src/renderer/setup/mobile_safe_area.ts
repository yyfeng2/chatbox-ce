// 这个库解决了移动端异形屏的显示安全区域的问题，比如iPhoneX，iPhone11等
// 这个库引入后，将设置全局的css变量 --mobile-safe-area-inset-top, --mobile-safe-area-inset-bottom, --mobile-safe-area-inset-left, --mobile-safe-area-inset-right
// 通过这些变量，可以在css中设置安全区域的padding，margin等，来规避异形屏的显示问题
// 为了达到最好的效果，在 html 的 meta 标签中设置 viewport-fit=cover

import { SafeArea } from 'capacitor-plugin-safe-area'
import { Keyboard } from '@capacitor/keyboard'
import { CHATBOX_BUILD_PLATFORM } from '@/variables'

const setInset = (key: string, value: number) => {
  document.documentElement.style.setProperty(`--mobile-safe-area-inset-${key}`, `${value}px`)
}

const applyAllInsets = () => {
  SafeArea.getSafeAreaInsets().then(({ insets }) => {
    for (const [key, value] of Object.entries(insets)) {
      setInset(key, value)
    }
  })
}

SafeArea.getSafeAreaInsets().then(({ insets }) => {
  for (const [key, value] of Object.entries(insets)) {
    setInset(key, value)
  }
})

SafeArea.getStatusBarHeight().then(({ statusBarHeight }) => {
  // console.log(statusBarHeight, 'statusbarHeight');
})

;(async () => {
  // when safe-area changed
  const eventListener = await SafeArea.addListener('safeAreaChanged', (data) => {
    const { insets } = data
    for (const [key, value] of Object.entries(insets)) {
      setInset(key, value)
    }
  })
  // eventListener.remove();
})()

// Android (with resizeOnFullScreen: true in capacitor.config) and iOS both
// resize the webview natively when the keyboard shows; keep the bottom inset
// at 0 while it is visible to avoid double-padding the composer.
// keyboardWillShow does not fire on Android — keyboardDidShow is the reliable
// event there.
Keyboard.addListener('keyboardWillShow', async () => {
  document.documentElement.style.setProperty(`--mobile-safe-area-inset-bottom`, `0px`)
})

Keyboard.addListener('keyboardDidShow', async () => {
  document.documentElement.style.setProperty(`--mobile-safe-area-inset-bottom`, `0px`)
})

Keyboard.addListener('keyboardWillHide', () => {
  applyAllInsets()
})
