import { isMasked } from './useDemoMode'
import { pseudoHost, pseudoTeam, pseudoSoftware, pseudoIdentifier } from './pseudonyms'

/**
 * Pick the best human-readable name for a host row.
 *
 *   1. computer_name — the user-set "Dale's MacBook Pro" from System Settings.
 *      Matches what Fleet's UI displays.
 *   2. hostname stripped of trailing ".local" — the kebab-case fallback.
 *   3. host_id / host_identifier — last resort.
 *
 * Accepts a row object, a bare hostname string, or null/undefined.
 * Always returns a string (never undefined).
 *
 * In demo mode this returns a deterministic pseudonym instead. Reading the
 * reactive demoMode ref (via isMasked) means every computed() that calls this
 * re-evaluates when the toggle flips, so names swap live with no refetch.
 */
export function displayHost(h) {
  if (!h) return '?'
  if (isMasked('hosts')) return pseudoHost(stableHostKey(h))
  // String form: someone already passed just a hostname.
  if (typeof h === 'string') return h.replace(/\.local$/i, '') || '?'
  const cn = h.computer_name && String(h.computer_name).trim()
  if (cn) return cn
  const hn = h.hostname && String(h.hostname).trim()
  if (hn) return hn.replace(/\.local$/i, '')
  return h.host_id || h.host_identifier || '?'
}

/**
 * The key a pseudonym is derived from — deliberately NOT the display string.
 *
 * A host shows up as `computer_name` in some queries and only `hostname` in
 * others; hashing whichever one happens to be present would give the same
 * host two different pseudonyms across panels and break every drill-down.
 * The UUID is stable everywhere, so it wins when available.
 *
 * Bare-string callers (a few components pass just a hostname) have nothing
 * better available — ".local" is stripped first so "x" and "x.local" agree.
 */
function stableHostKey(h) {
  if (typeof h === 'string') return h.replace(/\.local$/i, '')
  return (
    h.host_id ||
    h.host_identifier ||
    (h.hostname && String(h.hostname).replace(/\.local$/i, '')) ||
    h.computer_name ||
    ''
  )
}

/**
 * Resolve a Fleet team id ("team-247") to its configured display name.
 *
 * Takes the teamNames map from useAppConfig rather than reading the config
 * singleton itself, so this stays a pure display helper — callers already
 * hold the config ref.
 */
export function displayTeam(id, teamNames) {
  if (!id) return ''
  if (isMasked('teams')) return pseudoTeam(id)
  return teamNames?.[id] || id
}

/**
 * Software title as it should be shown.
 *
 * Recognised public software is returned unchanged — naming real titles is
 * what makes the software views useful, and public software identifies nobody.
 * Only in-house titles are pseudonymised.
 *
 * Call this at *render* time only. The raw app_name is load-bearing elsewhere:
 * it keys rows, tracks which drill is open, and is sent to ClickHouse as the
 * `appName` param, so it must not be rewritten in the data.
 */
export function displayApp(name) {
  if (!name) return name
  if (isMasked('software')) return pseudoSoftware(name)
  return name
}

/**
 * Reverse-DNS identifier as it should be shown — bundle ids, crash
 * identifiers, process names.
 *
 * Separate from displayApp because the input is an identifier rather than a
 * title: public vendor prefixes are recognised, and the masked form keeps
 * reverse-DNS shape. `com.acmecorp.agent` gives a company away more precisely
 * than the app's display name does, so these must be masked alongside titles.
 */
export function displayIdentifier(value) {
  if (!value) return value
  if (isMasked('software')) return pseudoIdentifier(value)
  return value
}
