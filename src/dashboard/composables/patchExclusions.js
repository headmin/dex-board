/**
 * Patch-velocity exclusion list — the manual escape hatch.
 *
 * Two classes of title are excluded automatically, server-side, in
 * src/worker/queries/core-scores.ts, so they need no entry here:
 *   - Apple-bundled titles (Safari, System Settings, iWork, the helpers
 *     inside Xcode), resolved by bundle identifier and install path rather
 *     than by name. They move on Apple's schedule, not the fleet's.
 *   - Version changes that go backwards, which are not patches at all.
 *
 * This list is for anything else the team decides does not reflect how fast
 * the fleet ships software it actually manages. Entries are matched
 * case-insensitively against dex_patch_events `software_name` (exact, after
 * lowercasing) — so "safari.app" would exclude Safari without catching
 * "Safari Technology Preview.app". Adding a title here drops it from the
 * hero percentiles, the coverage curve, and the app/host lists at once.
 */
export const PATCH_EXCLUSIONS = []

/** True when a software_name is on the exclusion list. */
export function isExcludedSoftware(name) {
  return PATCH_EXCLUSIONS.includes(String(name || '').trim().toLowerCase())
}

/** Comma-joined form for the worker `excludeSoftware` param. */
export const PATCH_EXCLUSIONS_PARAM = PATCH_EXCLUSIONS.join(',')
