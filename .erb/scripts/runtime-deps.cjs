const fs = require('fs')
const path = require('path')

const unpackedRuntimePackages = [
  {
    name: '@anthropic-ai/sandbox-runtime',
    includeDependencies: true,
  },
]

function packagePath(baseDir, packageName) {
  return path.join(baseDir, ...packageName.split('/'))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function getPackageDependencyNames(nodeModulesDir, packageName) {
  const packageJsonPath = path.join(packagePath(nodeModulesDir, packageName), 'package.json')
  const packageJson = readJson(packageJsonPath)
  return Object.keys(packageJson.dependencies || {})
}

function getRequiredRuntimePackages(nodeModulesDir) {
  return [
    ...new Set(
      unpackedRuntimePackages.flatMap((runtimePackage) => {
        const dependencies = runtimePackage.includeDependencies
          ? getPackageDependencyNames(nodeModulesDir, runtimePackage.name)
          : []
        return [runtimePackage.name, ...dependencies]
      }),
    ),
  ]
}

function verifyNodeModulesTree(nodeModulesDir, stage) {
  const requiredPackages = getRequiredRuntimePackages(nodeModulesDir)
  const missing = requiredPackages.filter((packageName) => {
    return !fs.existsSync(path.join(packagePath(nodeModulesDir, packageName), 'package.json'))
  })

  if (missing.length > 0) {
    throw new Error(
      `[runtime-deps] missing ${stage} package(s): ${missing.join(', ')} in ${nodeModulesDir}`,
    )
  }

  console.log(`[runtime-deps] verified ${stage} runtime package(s): ${requiredPackages.join(', ')}`)
}

function findUnpackedNodeModulesDirs(context) {
  const candidates = []
  const productFilename = context.packager?.appInfo?.productFilename

  if (context.appOutDir && context.electronPlatformName === 'darwin' && productFilename) {
    candidates.push(
      path.join(
        context.appOutDir,
        `${productFilename}.app`,
        'Contents',
        'Resources',
        'app.asar.unpacked',
        'node_modules',
      ),
    )
  }

  if (context.appOutDir) {
    candidates.push(path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules'))
  }

  return candidates.filter((dir) => {
    return unpackedRuntimePackages.some((runtimePackage) => {
      return fs.existsSync(packagePath(dir, runtimePackage.name))
    })
  })
}

function verifyInstalledRuntimeDeps(appDir) {
  verifyNodeModulesTree(path.join(appDir, 'node_modules'), 'installed')
}

exports.verifyInstalledRuntimeDeps = verifyInstalledRuntimeDeps

function copyPackage(sourceNodeModulesDir, targetNodeModulesDir, packageName) {
  const sourceDir = packagePath(sourceNodeModulesDir, packageName)
  const targetDir = packagePath(targetNodeModulesDir, packageName)

  if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
    throw new Error(`[runtime-deps] source package is missing: ${packageName} in ${sourceNodeModulesDir}`)
  }

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
}

function ensureNodeModulesDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function ensureUnpackedRuntimeDeps(context) {
  const appDir = path.join(__dirname, '..', '..', 'release', 'app')
  const sourceNodeModulesDir = path.join(appDir, 'node_modules')
  const requiredPackages = getRequiredRuntimePackages(sourceNodeModulesDir)
  const nodeModulesDirs = findUnpackedNodeModulesDirs(context)

  if (nodeModulesDirs.length === 0) {
    const productFilename = context.packager?.appInfo?.productFilename

    if (context.appOutDir && context.electronPlatformName === 'darwin' && productFilename) {
      nodeModulesDirs.push(
        ensureNodeModulesDir(
          path.join(
            context.appOutDir,
            `${productFilename}.app`,
            'Contents',
            'Resources',
            'app.asar.unpacked',
            'node_modules',
          ),
        ),
      )
    } else if (context.appOutDir) {
      nodeModulesDirs.push(ensureNodeModulesDir(path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules')))
    }
  }

  if (nodeModulesDirs.length === 0) {
    throw new Error('[runtime-deps] cannot locate app.asar.unpacked node_modules directory')
  }

  for (const nodeModulesDir of nodeModulesDirs) {
    for (const packageName of requiredPackages) {
      copyPackage(sourceNodeModulesDir, nodeModulesDir, packageName)
    }
    console.log(
      `[runtime-deps] copied runtime package(s) to ${nodeModulesDir}: ${requiredPackages.join(', ')}`,
    )
  }
}

exports.ensureUnpackedRuntimeDeps = ensureUnpackedRuntimeDeps

exports.default = async function verifyPackagedRuntimeDeps(context) {
  const nodeModulesDirs = findUnpackedNodeModulesDirs(context)

  if (nodeModulesDirs.length === 0) {
    throw new Error('[runtime-deps] runtime package(s) were not found in app.asar.unpacked')
  }

  for (const nodeModulesDir of nodeModulesDirs) {
    verifyNodeModulesTree(nodeModulesDir, 'packaged')
  }
}
