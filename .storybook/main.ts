import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const config: StorybookConfig = {
  stories: ['../src/renderer/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  viteFinal: async (config, { configType }) => {
    const nodeEnv = configType === 'PRODUCTION' ? 'production' : 'development'
    config.envDir = __dirname
    // 给 Storybook 独立的 Vite 依赖缓存目录。否则它与 electron-vite 渲染进程 dev server
    // 共用默认的 node_modules/.vite，两个 server 会互相打断依赖预优化：打开 UI inventory
    // 预览触发 Storybook 重优化依赖、改写该目录，渲染 server 检测到缓存失效后整页重载，
    // 表现为 dev app 在访问预览时“自动重启”。
    config.cacheDir = resolve(__dirname, '../node_modules/.cache/storybook-vite')
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': resolve(__dirname, '../src/renderer'),
      '@shared': resolve(__dirname, '../src/shared'),
    }
    // 强制 React 与 TanStack Router 单实例，避免依赖被优化成多份导致
    // RouterProvider 的 context 与 <Link>/useLinkProps 读取的不是同一个（context 为 null）。
    config.resolve.dedupe = [
      ...(config.resolve.dedupe ?? []),
      'react',
      'react-dom',
      '@tanstack/react-router',
    ]
    config.define = {
      ...config.define,
      'process.type': '"renderer"',
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
      'process.env.CHATBOX_BUILD_TARGET': JSON.stringify('unknown'),
      'process.env.CHATBOX_BUILD_PLATFORM': JSON.stringify('web'),
      'process.env.USE_LOCAL_API': JSON.stringify(''),
      'process.env.USE_BETA_API': JSON.stringify(''),
    }
    config.css = {
      ...config.css,
      postcss: resolve(__dirname, '../postcss.config.js'),
    }
    // 预先 include 重型公共依赖，让 Storybook 启动时一次性优化它们，避免打开某个 story
    // 时才首次优化 @tanstack/react-router 触发整页 reload 的竞态（过渡瞬间 router context
    // 为 null，渲染 <Link> 抛 "Cannot read properties of null (reading 'isServer')"）。
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [
        ...(config.optimizeDeps?.include || []),
        '@mantine/core',
        '@mantine/hooks',
        '@tanstack/react-router',
      ],
    }
    config.server = {
      ...config.server,
      watch: {
        ...config.server?.watch,
        ignored: [
          '**/.env',
          '**/.env.*',
          ...(Array.isArray(config.server?.watch?.ignored) ? config.server.watch.ignored : []),
        ],
      },
    }
    return config
  },
}
export default config
