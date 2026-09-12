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
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
    },
  },
}

export default config
