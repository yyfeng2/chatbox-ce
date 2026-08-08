const fs = require('node:fs')
const path = require('node:path')

const rootEnvPath = path.resolve(__dirname, '../.env')

function isRootEnvPath(filePath) {
  if (typeof filePath !== 'string') {
    return false
  }
  return path.resolve(filePath) === rootEnvPath
}

function shouldSkip(filePath) {
  if (!isRootEnvPath(filePath)) {
    return false
  }

  try {
    return fs.lstatSync(rootEnvPath).isFIFO()
  } catch {
    return false
  }
}

function emptyReadResult(options) {
  if (typeof options === 'string' || options?.encoding) {
    return ''
  }
  return Buffer.from('')
}

const originalReadFileSync = fs.readFileSync.bind(fs)
fs.readFileSync = function readFileSync(filePath, options) {
  if (shouldSkip(filePath)) {
    return emptyReadResult(options)
  }
  return originalReadFileSync(filePath, options)
}

const originalReadFile = fs.readFile.bind(fs)
fs.readFile = function readFile(filePath, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = undefined
  }

  if (shouldSkip(filePath)) {
    process.nextTick(callback, null, emptyReadResult(options))
    return
  }

  return originalReadFile(filePath, options, callback)
}

const originalPromisesReadFile = fs.promises.readFile.bind(fs.promises)
fs.promises.readFile = function readFile(filePath, options) {
  if (shouldSkip(filePath)) {
    return Promise.resolve(emptyReadResult(options))
  }
  return originalPromisesReadFile(filePath, options)
}
