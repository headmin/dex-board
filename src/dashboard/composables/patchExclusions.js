/**
 * Patch-velocity exclusion list.
 *
 * Some titles don't reflect how fast the fleet ships the software it
 * manages, so leaving them in the velocity numbers is misleading:
 *   - Safari ships with macOS and updates through Software Update on
 *     Apple's own cadence — its lag measures OS-update behaviour, not the
 *     app-delivery pipeline every other title here goes through.
 *
 * Entries are matched case-insensitively against dex_patch_events
 * `software_name` (exact, after lowercasing) — so "Safari.app" excludes
 * the Safari rows without catching, say, "Safari Technology Preview.app".
 * Add a title here to drop it from the hero percentiles, the coverage
 * curve, and the app/host lists in one place.
 */
export const PATCH_EXCLUSIONS = [
  'safari.app',
]

/** True when a software_name is on the exclusion list. */
export function isExcludedSoftware(name) {
  return PATCH_EXCLUSIONS.includes(String(name || '').trim().toLowerCase())
}

/** Comma-joined form for the worker `excludeSoftware` param. */
export const PATCH_EXCLUSIONS_PARAM = PATCH_EXCLUSIONS.join(',')
