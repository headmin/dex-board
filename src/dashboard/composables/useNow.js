import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Reactive "now" that ticks at a configurable interval. Shared across all
 * consumers via a module-level ref + ref-count: the interval starts when
 * the first component mounts a consumer and stops when the last unmounts.
 *
 * Use for relative-time labels ("Active · 12m ago") so they age in the UI
 * without re-fetching from the server.
 */
const now = ref(Date.now())
let timerId = null
let refCount = 0
const TICK_MS = 30_000

function start() {
  if (timerId !== null) return
  timerId = setInterval(() => { now.value = Date.now() }, TICK_MS)
}
function stop() {
  if (timerId === null) return
  clearInterval(timerId)
  timerId = null
}

export function useNow() {
  onMounted(() => {
    refCount++
    now.value = Date.now()  // refresh on consumer mount
    start()
  })
  onUnmounted(() => {
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0) stop()
  })
  return { now }
}
