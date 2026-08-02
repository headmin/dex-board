/**
 * Humanize raw telemetry enum tokens for display.
 * "apple_m5" -> "Apple M5", "stale_7d" -> "stale 7d",
 * "direct_connected" -> "direct connected", "16gb" stays "16gb".
 */
export function humanizeToken(name, { capitalize = true } = {}) {
  if (name == null || name === '') return name
  return String(name).split('_').map((w, i) => {
    if (/^m\d+$/.test(w) || w === 'amd') return w.toUpperCase()
    if (i === 0 && capitalize) return w.charAt(0).toUpperCase() + w.slice(1)
    return w
  }).join(' ')
}
