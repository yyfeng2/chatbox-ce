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

// Android 15 (targetSdk 35) forces edge-to-edge: the legacy
// windowSoftInputMode=adjustResize no longer compresses the view, so the
// keyboard would cover the input. Use the reported keyboard height as the
// bottom inset to keep the composer above the keyboard. iOS keeps 0px (its
// webview resizes automatically; a nonzero value would double-pad).
Keyboard.addListener('keyboardWillShow', async (info) => {
  if (CHATBOX_BUILD_PLATFORM === 'android' && info.keyboardHeight > 0) {
    setInset('bottom', info.keyboardHeight)
    return
  }
  document.documentElement.style.setProperty(`--mobile-safe-area-inset-bottom`, `0px`)
})

// Some Android keyboards report height 0 on keyboardWillShow; keyboardDidShow
// fires once the height is known and covers that case.
Keyboard.addListener('keyboardDidShow', async (info) => {
  if (CHATBOX_BUILD_PLATFORM === 'android' && info.keyboardHeight > 0) {
    setInset('bottom', info.keyboardHeight)
  }
})

Keyboard.addListener('keyboardWillHide', () => {
  applyAllInsets()
})
