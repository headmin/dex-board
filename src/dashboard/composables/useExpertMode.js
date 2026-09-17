import { ref, watch } from 'vue'

/**
 * Expert mode — the density switch.
 *
 * The board answers two different questions for two different readers. A
 * manager wants "is the fleet OK, and what should we do?" — an A-F grade, a
 * headline, a shortlist. An operator wants the numbers behind that grade:
 * the raw scores, the per-signal breakdowns, the sample sizes, the coverage
 * caveats. Historically every view showed the second, and the first had to be
 * inferred from it.
 *
 * So the default is now the manager reading, and expert mode reveals the
 * detail. This is a PRESENTATION switch, not a permission one — nothing here
 * is hidden for access reasons and every expert panel is one toggle away.
 * Where that distinction matters, defer to the modes that do carry meaning:
 *
 *   • Workers Council (useWorkersCouncil) withholds per-host attribution
 *     because a works council agreed it should not be visible. Expert mode
 *     must never re-expose what WC withholds.
 *   • Demo mode (useDemoMode) swaps identifying labels for pseudonyms.
 *
 * All three toggle independently and can be on at once.
 *
 * The rule for what belongs behind the toggle: if a number needs a caveat to
 * be read correctly, it is expert. If it survives being read at a glance by
 * someone who will not read the caveat, it is default. A grade survives that;
 * "84.2 composite over 4 of 4 scored categories" does not.
 */

const STORAGE_KEY = 'fleet-expert-mode'

// ?expert=1 wins over the stored value on boot, so a link into a detailed
// view lands expanded on someone else's machine (and ?expert=0 forces it off).
function initialValue() {
  try {
    const param = new URLSearchParams(window.location.search).get('expert')
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

const expertMode = ref(initialValue())

watch(expertMode, (val) => {
  try {
    localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false')
  } catch {
    // Private-browsing / storage-disabled: mode still works for this session.
  }
})

function toggleExpertMode() {
  expertMode.value = !expertMode.value
}

export function useExpertMode() {
  return { expertMode, toggleExpertMode }
}

// Direct export for non-component consumers (chart option builders and other
// leaf helpers that need the ref without calling a composable).
export { expertMode }
