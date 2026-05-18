import { ref } from 'vue'

/**
 * Singleton runtime config fetched once from the worker.
 *
 * The worker exposes GET /api/config returning { fleetUrl, ... } sourced
 * from Cloudflare secrets. We cache the result module-level so every
 * caller across the app sees the same instance — there's exactly one
 * network round-trip on boot, regardless of how many components consume
 * it.
 *
 * Defaults match what the worker would return if FLEET_URL is unset,
 * so the dashboard stays usable while the secret is being configured
 * (no flash of broken deep-links).
 */
const FALLBACK_FLEET_URL = 'https://dogfood.fleetdm.com'

const config = ref({ fleetUrl: FALLBACK_FLEET_URL })
let inflight = null
let loaded = false

async function load() {
  if (loaded) return config.value
  if (inflight) return inflight
  inflight = fetch('/api/config', { credentials: 'include' })
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (data?.fleetUrl) {
        config.value = { ...config.value, fleetUrl: String(data.fleetUrl).replace(/\/$/, '') }
      }
      loaded = true
      return config.value
    })
    .catch(() => config.value)
    .finally(() => { inflight = null })
  return inflight
}

export function useAppConfig() {
  // Fire-and-forget on first access; consumers read config.value reactively
  // and see the fetched URL once it lands. Until then they see the fallback.
  if (!loaded && !inflight) load()
  return { config, reload: load }
}
