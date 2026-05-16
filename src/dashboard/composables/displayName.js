/**
 * Pick the best human-readable name for a host row.
 *
 *   1. computer_name — the user-set "Dale's MacBook Pro" from System Settings.
 *      Matches what Fleet's UI displays.
 *   2. hostname stripped of trailing ".local" — the kebab-case fallback.
 *   3. host_id / host_identifier — last resort.
 *
 * Accepts any object with a subset of those keys; returns a string.
 */
export function displayHost(h) {
  if (!h) return '?'
  const cn = h.computer_name && String(h.computer_name).trim()
  if (cn) return cn
  const hn = h.hostname && String(h.hostname).trim()
  if (hn) return hn.replace(/\.local$/i, '')
  return h.host_id || h.host_identifier || '?'
}
