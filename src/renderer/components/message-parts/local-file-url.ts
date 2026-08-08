export function getLocalFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

export function localFilePathToUrl(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const url = new URL('file:///')

  if (normalizedPath.startsWith('//')) {
    const [host, ...pathSegments] = normalizedPath.slice(2).split('/')
    url.host = host
    url.pathname = `/${pathSegments.join('/')}`
  } else {
    url.pathname = /^[A-Za-z]:\//.test(normalizedPath) ? `/${normalizedPath}` : normalizedPath
  }

  return url.href
}
