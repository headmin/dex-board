import { ref, watch } from 'vue'

/**
 * Demo mode — renders identifying values as deterministic pseudonyms so the
 * dashboard can be shown to an outside audience without exposing who owns
 * which host.
 *
 * Deliberately SEPARATE from Workers Council mode (useWorkersCouncil.js):
 *
 *   • WC mode is a compliance posture — it *withholds* per-host detail
 *     entirely, because a works council agreed individual attribution should
 *     not be visible.
 *   • Demo mode *keeps* every panel working and only swaps the labels, so a
 *     drill-down still tells its story.
 *
 * Conflating them would weaken the WC guarantee, so the two toggle
 * independently and can be on at the same time.
 *
 * IMPORTANT — this is a presentation aid, not a privacy control. Masking
 * happens at render time, so real hostnames still arrive in every
 * POST /api/query response and remain visible in the browser's Network tab
 * and in Vue devtools. Only server-side rewriting (src/worker/query-registry.ts)
 * would make the data itself untraceable. See docs/docs/privacy.md.
 */

// ─── Module-level singleton state (shared across all components) ──
// Mirrors the useWorkersCouncil.js pattern: one ref, persisted to
// localStorage, imported directly rather than provide/inject.
const STORAGE_KEY = 'fleet-demo-mode'

// ?demo=1 wins over the stored value on boot, so a demo link lands in the
// right state on someone else's machine (and ?demo=0 forces it off again).
function initialValue() {
  try {
    const param = new URLSearchParams(window.location.search).get('demo')
    if (param === '1' || param === 'true') return true
    if (param === '0' || param === 'false') return false
  } catch {
    // Non-browser context (unit test, SSR probe) — fall through to storage.
  }
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const demoMode = ref(initialValue())

watch(demoMode, (val) => {
  try {
    localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false')
  } catch {
    // Private-browsing / storage-disabled: mode still works for this session.
  }
})

/**
 * Which categories get pseudonymised. Tunable here rather than at ~20 call
 * sites, and documented so the scope of a demo is auditable at a glance.
 *
 *   hosts    hostname + computer_name (the risky one — computer_name is the
 *            user-set "Dale's MacBook Pro" and embeds real first names)
 *   people   Fleet admin emails in Audit Logs, git authors in GitOps
 *   teams    team_id / team display names
 *   software non-public app titles only; recognised public software stays
 *            readable, because that is what carries the demo's value
 *   serials  hardware_serial, shown in the Reports → Hardware tab and
 *            traceable to a purchase record
 *
 * Note there is intentionally no flag for host UUIDs: they are Vue :key
 * values, Map dedup keys and the /hosts/:hostId route param, so masking them
 * would break navigation. A bare UUID also identifies nobody without Fleet
 * access.
 */
const DEMO_FIELDS = {
  hosts: true,
  people: true,
  teams: true,
  software: true,
  serials: true,
}

function toggleDemoMode() {
  demoMode.value = !demoMode.value
}

/** True when demo mode is on AND this category is in scope. */
function isMasked(field) {
  return demoMode.value && DEMO_FIELDS[field] === true
}

// ─── Export ───────────────────────────────────────────────────────
export function useDemoMode() {
  return { demoMode, toggleDemoMode, isMasked, DEMO_FIELDS }
}

// Direct exports for non-component consumers (displayName.js and the other
// leaf helpers), which need the ref without calling a composable.
export { demoMode, isMasked, DEMO_FIELDS }
