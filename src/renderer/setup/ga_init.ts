import platforms from '@/platform'
;(() => {
  try {
    platforms.initTracking()
  } catch (e) {
    console.error(e)
  }
})()
