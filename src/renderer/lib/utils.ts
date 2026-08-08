import { type ClassValue, clsx } from 'clsx'
import dayjs from 'dayjs'
import { getDefaultStore } from 'jotai'
import { twMerge } from 'tailwind-merge'
import platform from '@/platform'
import { initLogAtom } from '@/stores/atoms/utilAtoms'

// Re-export from shared layer for backward compatibility
export { parseJsonOrEmpty } from '../../shared/utils/json_utils'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLogger(logId: string) {
  const serializeArg = (arg: unknown): string => {
    if (arg instanceof Error) {
      return JSON.stringify({
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      })
    }
    if (typeof arg === 'string') {
      return arg
    }
    if (arg === undefined) {
      return 'undefined'
    }
    if (arg === null) {
      return 'null'
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg)
      } catch (_error) {
        return String(arg)
      }
    }
    return String(arg)
  }

  // const logger = log.create({ logId })
  // logger.transports.console.format = '{h}:{i}:{s}.{ms} › [{logId}] › {text}'
  // return logger
  return {
    log(level: string, ...args: any[]) {
      const store = getDefaultStore()
      const now = dayjs().format('HH:mm:ss.SSS')
      const message = args.map((arg) => serializeArg(arg)).join(' ')
      store.set(initLogAtom, [...store.get(initLogAtom), `[${now}][${logId}] ${message}`])
      platform.appLog(level, message).catch((e) => {
        console.error('Failed to send log to main process', e)
      })
    },
    info(...args: any[]) {
      this.log('info', ...args)
    },
    warn(...args: any[]) {
      this.log('warn', ...args)
    },
    error(...args: any[]) {
      this.log('error', ...args)
    },
    debug(...args: any[]) {
      console.debug('debug', ...args)
    },
  }
}
