import { ref, computed } from 'vue'
import { isMasked } from './useDemoMode'
import { pseudoPerson } from './pseudonyms'

/**
 * GitOps changelog — shared, session-cached fetch of the commit feed.
 *
 * Source: this repo's own `changelog.jsonl`, regenerated every 6 hours by
 * .github/workflows/gitops-changelog.yml from fleetdm/fleet's it-and-security
 * history. The JSONL is the enriched form: each commit carries `change_type`
 * (security > policy > profile > software > script > report > label > config),
 * `scope` (platform / cross-platform / global), `commit_url`, and a
 * `categories` breakdown — the plain changelog.json has none of that.
 *
 * Commit shape: {sha, short_sha, message, author, email, timestamp,
 *   commit_url, change_type, scope, files_changed, files[], categories{}}.
 */
const CHANGELOG_URL = 'https://raw.githubusercontent.com/headmin/dex-board/main/changelog.jsonl'

const commits = ref([])
const changelogError = ref(null)
let fetched = false
let inflight = null

export async function fetchChangelog() {
  if (fetched) return commits.value
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch(CHANGELOG_URL)
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const text = await res.text()
      commits.value = text
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
      fetched = true
    } catch (e) {
      changelogError.value = e.message
    }
    return commits.value
  })()
  return inflight
}

/** Classify a commit's files into GitOps change types (path-based).
 *  Covers every directory the gitops tree actually has — software, labels,
 *  and fleets commits must not silently fall through as untagged. */
export function fileTags(files) {
  const tags = new Set()
  for (const f of files || []) {
    if (f.includes('/policies/')) tags.add('policies')
    else if (f.includes('/scripts/')) tags.add('scripts')
    else if (f.includes('/profiles/')) tags.add('profiles')
    else if (f.includes('/queries/') || f.includes('/reports/')) tags.add('queries')
    else if (f.includes('/software/')) tags.add('software')
    else if (f.includes('/labels/')) tags.add('labels')
    else if (f.includes('/fleets/') || f.includes('/teams/')) tags.add('fleets')
    else if (f.endsWith('default.yml') || f.includes('agent-options')) tags.add('config')
  }
  return [...tags]
}

/**
 * Commits with authors pseudonymised in demo mode.
 *
 * Exposed in place of the raw ref so every GitOps consumer — the author
 * filter, the "Commits by author" chart, the timeline rows and the markdown
 * export — inherits the masking from one place. It is a computed rather than
 * a mutation of `commits` because the fetch is session-cached (`fetched`),
 * so a mid-session toggle would otherwise never re-map.
 *
 * These are public open-source contributors to fleetdm/fleet, so this is
 * about not putting names on a demo screen rather than confidentiality.
 */
const displayCommits = computed(() => {
  if (!isMasked('people')) return commits.value
  return commits.value.map(c => ({
    ...c,
    author: pseudoPerson(c.author, { email: false }),
    email: pseudoPerson(c.email),
  }))
})

export function useChangelog() {
  return { commits: displayCommits, changelogError, fetchChangelog }
}
