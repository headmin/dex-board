import dayjs from 'dayjs'

/**
 * Change-impact correlation engine — connects the three change feeds
 * (vendor releases, GitOps commits, endpoint patch rollouts) into
 * evidence-tiered chains and judges each against the fleet-score series.
 *
 * Tiers (strongest evidence first):
 *   verified — the commit is software-name-linked to a real patch rollout
 *              within 7 days after it (the rollout is the hard evidence).
 *              A vendor release of the same software ≤7d before completes
 *              the chain; without one the chain says so.
 *   policy   — not verified, but the commit touches policy/profile files
 *              (judged against the SECURITY category) or scripts (judged
 *              against composite). Query-only commits make no claim.
 *   temporal — date proximity only. Rendered dimmed, "temporal — unverified".
 *
 * Every delta is a correlation reading, never attribution — callers must
 * keep that label on screen.
 */

/** Name variants for matching: lowercase + space→-/_/removed. */
function variants(app) {
  const a = String(app || '').toLowerCase().trim()
  if (a.length < 4) return []   // too generic to claim a verified link
  return [...new Set([a, a.replace(/ /g, '-'), a.replace(/ /g, '_'), a.replace(/ /g, '')])]
}

function commitMatchesSoftware(commit, appVariants) {
  if (!appVariants.length) return false
  const msg = String(commit.message || '').toLowerCase()
  const files = (commit.files || []).map(f => String(f).toLowerCase())
  return appVariants.some(v =>
    new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(msg) ||
    files.some(f => f.includes(v))
  )
}

/** Bidirectional case-insensitive containment (mirrors the worker's
 *  positionCaseInsensitive semantics in fma_release_devices). */
function softwareMatches(a, b) {
  const x = String(a || '').toLowerCase()
  const y = String(b || '').toLowerCase()
  if (x.length < 4 || y.length < 4) return false
  return x.includes(y) || y.includes(x)
}

const day = (ts) => String(ts).slice(0, 10)
const daysBetween = (a, b) => dayjs(day(b)).diff(dayjs(day(a)), 'day')

/**
 * @param commits  [{sha, message, author, timestamp, files[]}]
 * @param releases [{id, app, version_to, timestamp, ...}]
 * @param patchBuckets [{day, software_name, hosts, ...}] (14d window)
 * @param fileTags (files[]) => ['policies'|'scripts'|'profiles'|'queries']
 * @param deltaAfter (dateStr, key) => number|null
 * @param judgementFor (dateStr, key) => judgement string
 */
export function buildChangeImpact({ commits, releases, patchBuckets, fileTags, deltaAfter, judgementFor }) {
  const byCommitSha = new Map()
  const byBucketKey = new Map()
  const byReleaseId = new Map()
  const chains = []

  const bucketKey = (b) => `${day(b.day)}::${b.software_name}`

  for (const c of commits || []) {
    const cDay = day(c.timestamp)

    // ── verified: name-link to a rollout ≤7d after the commit
    let linked = null
    for (const b of patchBuckets || []) {
      const gap = daysBetween(cDay, b.day)
      if (gap < 0 || gap > 7) continue
      const appVariants = variants(b.software_name)
      if (commitMatchesSoftware(c, appVariants)) {
        if (!linked) linked = { software: b.software_name, buckets: [], hosts: 0 }
        linked.buckets.push(bucketKey(b))
        linked.hosts += Number(b.hosts) || 0
      }
    }

    if (linked) {
      // Complete the chain with a matching vendor release ≤7d before.
      let release = null
      for (const r of releases || []) {
        const gap = daysBetween(r.timestamp, cDay)
        if (gap < 0 || gap > 7) continue
        if (softwareMatches(r.app, linked.software)) { release = r; break }
      }
      const enrichment = {
        tier: 'verified',
        linkedSoftware: linked.software,
        linkedReleaseId: release?.id ?? null,
        linkedBucketKeys: linked.buckets,
        delta7d: deltaAfter(cDay, 'composite'),
        judgement: judgementFor(cDay, 'composite'),
        judgedOn: 'composite',
      }
      byCommitSha.set(c.sha, enrichment)
      for (const k of linked.buckets) {
        const prev = byBucketKey.get(k)
        if (!prev || prev.tier !== 'verified') byBucketKey.set(k, { tier: 'verified', commitSha: c.sha })
      }
      if (release) byReleaseId.set(release.id, { tier: 'verified', commitSha: c.sha })

      const existing = chains.find(ch => ch.software === linked.software && ch.anchorDay === cDay)
      if (existing) {
        existing.commitShas.push(c.sha)
        existing.bucketKeys = [...new Set([...existing.bucketKeys, ...linked.buckets])]
        existing.totalHosts = Math.max(existing.totalHosts, linked.hosts)
      } else {
        chains.push({
          id: `${linked.software}@${cDay}`,
          software: linked.software,
          releaseId: release?.id ?? null,
          release,
          commitShas: [c.sha],
          commits: [c],
          bucketKeys: linked.buckets,
          anchorDay: cDay,
          delta7d: enrichment.delta7d,
          judgement: enrichment.judgement,
          totalHosts: linked.hosts,
        })
      }
      continue
    }

    // ── policy tier
    const tags = fileTags ? fileTags(c.files || []) : []
    if (tags.includes('policies') || tags.includes('profiles')) {
      byCommitSha.set(c.sha, {
        tier: 'policy',
        judgedOn: 'security',
        categoryDelta7d: deltaAfter(cDay, 'security'),
        judgement: judgementFor(cDay, 'security'),
      })
      continue
    }
    if (tags.includes('scripts')) {
      byCommitSha.set(c.sha, {
        tier: 'policy',
        judgedOn: 'composite',
        categoryDelta7d: deltaAfter(cDay, 'composite'),
        judgement: judgementFor(cDay, 'composite'),
      })
      continue
    }

    // ── temporal (incl. query-only commits — queries don't change host state)
    byCommitSha.set(c.sha, {
      tier: 'temporal',
      delta7d: deltaAfter(cDay, 'composite'),
      judgement: judgementFor(cDay, 'composite'),
      judgedOn: 'composite',
    })
  }

  // Releases without a verified commit link stay temporal.
  for (const r of releases || []) {
    if (!byReleaseId.has(r.id)) byReleaseId.set(r.id, { tier: 'temporal' })
  }

  return { byCommitSha, byReleaseId, byBucketKey, chains }
}
