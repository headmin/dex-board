/**
 * Explain the on-device dex_os_health verdict. Mirrors the classification in
 * Fleet's upstream dex-queries.yml ("DEX - System experience - OS health"):
 *
 *   healthy     OS major >= 26  AND uptime < 7d
 *   acceptable  OS major >= 15  AND uptime < 14d
 *   degraded    otherwise
 *
 * If the upstream thresholds change, update CURRENT_MAJOR / MIN_MAJOR here.
 */
const CURRENT_MAJOR = 26
const MIN_MAJOR = 15

export function osHealthReasons(osVersion, uptimeDays, health) {
  const h = String(health || '').toLowerCase()
  if (!h || h === 'healthy') return []
  const major = parseInt(String(osVersion || '').split('.')[0], 10)
  const up = Number(uptimeDays)
  const reasons = []

  if (h === 'degraded') {
    if (isFinite(major) && major < MIN_MAJOR) {
      reasons.push({ short: 'legacy OS', long: `macOS ${osVersion} is a legacy major version (< ${MIN_MAJOR})` })
    }
    if (isFinite(up) && up >= 14) {
      reasons.push({ short: `${Math.round(up)}d uptime`, long: `no reboot in ${Math.round(up)} days (threshold: 14d)` })
    }
    // Degraded with neither condition visible usually means the fields lag
    // the classification snapshot — say so instead of guessing.
    if (!reasons.length) {
      reasons.push({ short: 'see host', long: 'classified on-device; current OS/uptime fields do not show the trigger (snapshot lag)' })
    }
  } else if (h === 'acceptable') {
    if (isFinite(major) && major < CURRENT_MAJOR) {
      reasons.push({ short: 'OS behind', long: `macOS ${osVersion} is behind the current major (${CURRENT_MAJOR})` })
    }
    if (isFinite(up) && up >= 7) {
      reasons.push({ short: `${Math.round(up)}d uptime`, long: `${Math.round(up)} days since reboot (healthy needs < 7d)` })
    }
  }
  return reasons
}
