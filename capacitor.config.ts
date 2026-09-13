import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'xyz.chatboxapp.ce',
  appName: 'Chatbox',
  // Web assets built by `pnpm mobile:sync:android` (electron-vite build with
  // CHATBOX_BUILD_TARGET=mobile_app CHATBOX_BUILD_PLATFORM=android).
  webDir: 'release/app/dist/renderer',
  server: {
    // Serve the bundled assets over https:// so WebView features that require a
    // secure context (clipboard, service workers) work as on desktop.
    androidScheme: 'https',
  },
  android: {
    // Let Capacitor apply edge-to-edge margins automatically: Android 15 forces
    // edge-to-edge, and without this the content is drawn under the status and
    // navigation bars on devices that use gesture or cutout layouts.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
    },
    Keyboard: {
      // Android 15 forces edge-to-edge: the native Keyboard plugin resizes the
      // webview container when the keyboard shows (the adjustResize equivalent),
      // keeping the composer above the keyboard. Without this the keyboard
      // covers the input.
      resizeOnFullScreen: true,
    },
  },
}

export default config
