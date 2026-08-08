// 格式化数字为简短形式 (例如: 12000000 -> 12M / 1200万, 210000 -> 210K / 21万, 191 -> 191)
export const formatNumber = (num: number, decimals: number = 0, isCN: boolean = false): string => {
  const fmt = (val: number, d: number) => (d > 0 ? val.toFixed(d) : String(Math.floor(val)))
  const abs = Math.abs(num)

  if (isCN) {
    if (abs >= 10_0000_0000) return `${fmt(num / 10_0000_0000, decimals)}十亿`
    if (abs >= 1_0000_0000) return `${fmt(num / 1_0000_0000, decimals)}亿`
    if (abs >= 1000_0000) return `${fmt(num / 1000_0000, decimals)}千万`
    if (abs >= 100_0000) return `${fmt(num / 100_0000, decimals)}百万`
    if (abs >= 1_0000) return `${fmt(num / 1_0000, decimals)}万`
    if (abs >= 1000) return `${fmt(num / 1000, decimals)}千`
    return fmt(num, decimals)
  }

  if (abs >= 1_000_000_000) return `${fmt(num / 1_000_000_000, decimals)}B`
  if (abs >= 1_000_000) return `${fmt(num / 1_000_000, decimals)}M`
  if (abs >= 1000) return `${fmt(num / 1000, decimals)}K`
  return fmt(num, decimals)
}

// 格式化使用量显示 (例如: "210k/12m" 或 "191/200")
export const formatUsage = (used: number, total: number, decimals: number = 0, isCN: boolean = false): string => {
  return `${formatNumber(used, decimals, isCN)}/${formatNumber(total, decimals, isCN)}`
}
