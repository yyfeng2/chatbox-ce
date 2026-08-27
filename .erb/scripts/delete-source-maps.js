import fs from 'fs'
import path from 'path'
import { rimrafSync } from 'rimraf'
import { pathToFileURL } from 'url'
import webpackPaths from '../configs/webpack.paths'

export default function deleteSourceMaps() {
    if (fs.existsSync(webpackPaths.distMainPath))
        rimrafSync(path.join(webpackPaths.distMainPath, '*.js.map'), {
            glob: true,
        })
    if (fs.existsSync(webpackPaths.distRendererPath))
        rimrafSync(path.join(webpackPaths.distRendererPath, '*.js.map'), {
            glob: true,
        })
}

// 当被作为脚本直接执行时（pnpm run delete-sourcemaps），删除构建产物中的 source map。
// 该脚本服务于 build:web / mobile:sync:* 构建流程。
if (typeof process !== 'undefined' && import.meta.url === pathToFileURL(process.argv[1]).href) {
    deleteSourceMaps()
}
