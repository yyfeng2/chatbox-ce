const fs = require('fs')
const path = require('path')
const { Arch } = require('builder-util')

function getTargetArch(context) {
  const arch = typeof context.arch === 'number' ? Arch[context.arch] : context.arch
  if (!arch || arch === 'universal') {
    throw new Error(`[copy-ripgrep] unsupported target architecture: ${String(arch)}`)
  }
  return arch
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'rg.exe' : 'rg'
}

function getRipgrepSourcePath(context, projectDir) {
  const platform = context.electronPlatformName
  const arch = getTargetArch(context)
  return path.join(
    projectDir,
    'node_modules',
    '@vscode',
    'ripgrep-universal',
    'bin',
    `${platform}-${arch}`,
    getBinaryName(platform),
  )
}

function getRipgrepTargetPath(context) {
  const resourcesDir = context.packager?.getResourcesDir?.(context.appOutDir)
  if (!resourcesDir) {
    throw new Error('[copy-ripgrep] electron-builder resources directory is unavailable')
  }
  return path.join(resourcesDir, 'ripgrep', getBinaryName(context.electronPlatformName))
}

async function copyRipgrep(context, options = {}) {
  const projectDir = options.projectDir || path.join(__dirname, '..', '..')
  const source = getRipgrepSourcePath(context, projectDir)
  const target = getRipgrepTargetPath(context)
  const licenseSource = path.join(projectDir, 'node_modules', '@vscode', 'ripgrep-universal', 'LICENSE')

  if (!fs.existsSync(source)) {
    throw new Error(`[copy-ripgrep] target binary is missing: ${source}`)
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  fs.copyFileSync(licenseSource, path.join(path.dirname(target), 'LICENSE.vscode-ripgrep'))
  if (context.electronPlatformName !== 'win32') fs.chmodSync(target, 0o755)

  const size = fs.statSync(target).size
  if (size < 1024 * 1024) {
    throw new Error(`[copy-ripgrep] copied binary is unexpectedly small (${size} bytes): ${target}`)
  }
  console.log(`[copy-ripgrep] copied ${context.electronPlatformName}-${getTargetArch(context)} (${size} bytes) to ${target}`)
}

exports.getRipgrepSourcePath = getRipgrepSourcePath
exports.getRipgrepTargetPath = getRipgrepTargetPath
exports.default = copyRipgrep
