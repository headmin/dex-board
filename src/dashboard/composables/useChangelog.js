import { ref } from 'vue'

/**
 * GitOps changelog — shared, session-cached fetch of the commit feed
 * (kept up to date by the fleet-gitops-changelog GitHub Action).
 * Commit shape: {sha, short_sha, message, author, timestamp, files[]}.
 */
const CHANGELOG_URL = 'https://raw.githubusercontent.com/headmin/fleet-gitops-changelog/refs/heads/main/changelog.json'

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
      commits.value = await res.json()
      fetched = true
    } catch (e) {
      changelogError.value = e.message
    }
    return commits.value
  })()
  return inflight
}

/** Classify a commit's files into GitOps change types. */
export function fileTags(files) {
  const tags = new Set()
  for (const f of files || []) {
    if (f.includes('/policies/')) tags.add('policies')
    else if (f.includes('/scripts/')) tags.add('scripts')
    else if (f.includes('/profiles/')) tags.add('profiles')
    else if (f.includes('/queries/')) tags.add('queries')
  }
  return [...tags]
}

export function useChangelog() {
  return { commits, changelogError, fetchChangelog }
}
