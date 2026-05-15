<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>GitOps timeline</h1>
      <span class="subtitle">Changes to fleetdm/fleet → it-and-security/</span>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Summary -->
    <section class="section">
      <div class="metrics-row four-col">
        <MetricCard label="Total commits" :value="commits.length" :loading="loading" />
        <MetricCard label="Authors" :value="uniqueAuthors" :loading="loading" />
        <MetricCard label="Files changed" :value="uniqueFiles" :loading="loading" />
        <MetricCard label="Latest" :value="latestDate" :loading="loading" />
      </div>
    </section>

    <!-- Upstream Fleet-maintained app releases (from fmalibrary.com) -->
    <section v-if="fmaReleases.length" class="section">
      <div class="fma-header-row">
        <h2>App releases</h2>
        <span class="fma-meta">
          Vendor-published Fleet-maintained app versions ·
          showing {{ visibleFmaReleases.length }} of {{ fmaReleases.length }} ·
          {{ fmaWindowDays }}d patch window
        </span>
      </div>
      <div class="fma-controls">
        <div class="fma-chip-group">
          <button
            v-for="opt in osOptions" :key="opt.value"
            class="fma-chip" :class="{ active: osFilter === opt.value }"
            @click="osFilter = opt.value"
          >{{ opt.label }} <span class="fma-chip-count">{{ osCounts[opt.value] || 0 }}</span></button>
        </div>
        <label class="fma-toggle">
          <input type="checkbox" v-model="onlyWithData" />
          <span>Only show releases with patch data</span>
          <span v-if="onlyWithData && fmaEagerLoaded" class="fma-toggle-meta">({{ releasesWithData }}/{{ fmaTopReleases.length }} match)</span>
        </label>
      </div>
      <div v-if="!fmaEagerLoaded" class="fma-loading">Loading patch matches for {{ fmaTopReleases.length }} releases…</div>
      <div v-else-if="!visibleFmaReleases.length" class="fma-empty">
        No releases match the current filter. Try a different OS or untick "Only show releases with patch data".
      </div>
      <div class="fma-grid">
        <div v-for="r in visibleFmaReleases" :key="r.id" class="fma-card">
          <div class="fma-head">
            <span class="fma-app">{{ r.app }}</span>
            <span class="fma-platform" :class="'platform-' + r.platform">{{ r.platform }}</span>
            <span v-if="r.event_type === 'added'" class="fma-badge added">new app</span>
          </div>
          <div class="fma-version">
            <template v-if="r.version_from">{{ r.version_from }} → </template>
            <strong>{{ r.version_to }}</strong>
          </div>
          <div class="fma-time">{{ formatTime(r.timestamp) }}</div>
          <button
            class="fma-load-btn"
            :class="{ loaded: fmaDeviceCounts[r.id] }"
            :disabled="fmaDeviceLoading[r.id]"
            @click="loadFmaReleaseDevices(r)"
          >
            <template v-if="fmaDeviceLoading[r.id]">Loading…</template>
            <template v-else-if="fmaDeviceCounts[r.id]">
              {{
                totalDevicesForRelease(r.id) > 0
                  ? totalDevicesForRelease(r.id) + ' host(s) patched · refresh'
                  : 'No hosts patched in ' + fmaWindowDays + 'd · refresh'
              }}
            </template>
            <template v-else>Show hosts patched</template>
          </button>
          <table v-if="fmaDeviceCounts[r.id] && fmaDeviceCounts[r.id].length" class="fma-rollout-table">
            <thead>
              <tr>
                <th class="col-match">Match</th>
                <th class="col-version">Version</th>
                <th class="col-hosts">Hosts</th>
                <th class="col-first">First (+lag)</th>
                <th class="col-lag">Avg/Max</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(w, wi) in fmaDeviceCounts[r.id]" :key="wi">
                <td class="col-match" :title="w.software_name">{{ w.software_name }}</td>
                <td class="col-version mono">
                  <span class="ver-from">{{ w.old_version || '—' }}</span>
                  <span class="ver-arrow">→</span>
                  <span class="ver-to">{{ w.new_version }}</span>
                </td>
                <td class="col-hosts"><strong>{{ w.device_count }}</strong></td>
                <td class="col-first">
                  <span class="when">{{ formatTime(w.first_applied) }}</span>
                  <span class="rollout-rel">+{{ formatHours(w.hours_to_first_patch) }}</span>
                </td>
                <td class="col-lag">{{ w.avg_lag }}d / {{ w.max_lag }}d</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <button v-if="fmaTopReleases.length < fmaReleases.length" class="fma-more-btn" @click="fmaLimit += 12">
        Show 12 more releases
      </button>
    </section>

    <!-- Filter bar -->
    <section class="filter-bar">
      <input v-model="search" class="search-input" placeholder="Search commits, authors, files..." />
      <select v-model="authorFilter" class="filter-select">
        <option value="">All authors</option>
        <option v-for="a in authors" :key="a" :value="a">{{ a }}</option>
      </select>
      <select v-model="fileTypeFilter" class="filter-select">
        <option value="">All file types</option>
        <option value="policies">Policies</option>
        <option value="scripts">Scripts</option>
        <option value="profiles">Profiles</option>
        <option value="queries">Queries</option>
      </select>
    </section>

    <!-- Timeline -->
    <section class="section">
      <div class="timeline">
        <div v-for="day in groupedEntries" :key="day.date" class="timeline-day">
          <div class="day-header">
            <span class="day-dot"></span>
            <span class="day-label">{{ formatDate(day.date) }}</span>
            <span class="day-count">
              {{ day.commits.length }} commit{{ day.commits.length === 1 ? '' : 's' }}
              <template v-if="day.patches.length"> · {{ day.patches.length }} patch wave{{ day.patches.length === 1 ? '' : 's' }}</template>
            </span>
          </div>

          <!-- Patch waves: hosts that applied an app upgrade on this day -->
          <div
            v-for="p in day.patches" :key="day.date + '-' + p.idx"
            class="patch-card"
          >
            <div class="patch-header">
              <span class="patch-badge">PATCH</span>
              <span class="patch-name">{{ p.software_name }}</span>
              <span class="patch-versions mono">
                <span class="ver-from">{{ p.old_version || '—' }}</span>
                <span class="ver-arrow">→</span>
                <span class="ver-to">{{ p.new_version }}</span>
              </span>
              <span class="patch-time">{{ formatTime(p.hour) }}</span>
            </div>
            <div class="patch-meta">
              <span class="patch-hosts"><strong>{{ p.device_count }}</strong> host{{ p.device_count === 1 ? '' : 's' }} patched</span>
              <span class="patch-source">via osquery</span>
              <span v-if="p.avg_lag !== undefined" class="patch-lag">avg {{ p.avg_lag }}d · max {{ p.max_lag }}d</span>
            </div>
          </div>

          <div
            v-for="c in day.commits" :key="c.sha"
            class="commit-card"
            :class="{ expanded: expandedSha === c.sha }"
            @click="toggleExpand(c.sha)"
          >
            <div class="commit-header">
              <span class="commit-sha">{{ c.short_sha }}</span>
              <span class="commit-message">{{ c.message }}</span>
              <span class="commit-time">{{ formatTime(c.timestamp) }}</span>
            </div>
            <div class="commit-meta">
              <span class="commit-author">{{ c.author }}</span>
              <span class="commit-files-count">{{ c.files.length }} file{{ c.files.length > 1 ? 's' : '' }}</span>
              <span v-for="tag in fileTags(c.files)" :key="tag" class="file-tag" :class="tag">{{ tag }}</span>
            </div>

            <!-- Expanded detail -->
            <div v-if="expandedSha === c.sha" class="commit-detail">
              <div class="file-list">
                <div v-for="f in c.files" :key="f" class="file-entry">
                  <span class="file-icon">{{ fileIcon(f) }}</span>
                  <span class="file-path">{{ f }}</span>
                </div>
              </div>
              <a :href="`https://github.com/fleetdm/fleet/commit/${c.sha}`" target="_blank" class="github-link">
                View on GitHub &rarr;
              </a>
            </div>
          </div>
        </div>

        <div v-if="!loading && filteredCommits.length === 0" class="empty-state">
          No commits match your filters.
        </div>
      </div>
    </section>

    <!-- Author breakdown -->
    <div class="charts-row two-col">
      <section class="section">
        <BarChart
          title="Commits by author"
          :data="authorStats"
          :loading="loading"
          nameKey="author"
          valueKey="count"
        />
      </section>
      <section class="section">
        <PieChart
          title="Changes by type"
          :data="typeStats"
          :loading="loading"
          nameKey="type"
          valueKey="count"
        />
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import MetricCard from '../components/MetricCard.vue'
import BarChart from '../components/BarChart.vue'
import PieChart from '../components/PieChart.vue'
import { useFmaReleases } from '../composables/useFmaReleases'
import { useTimelineEvents } from '../composables/useTimelineEvents'
import dayjs from 'dayjs'

const CHANGELOG_URL = 'https://raw.githubusercontent.com/headmin/fleet-gitops-changelog/refs/heads/main/changelog.json'

const loading = ref(true)
const error = ref(null)
const commits = ref([])
const search = ref('')
const authorFilter = ref('')
const fileTypeFilter = ref('')
const expandedSha = ref(null)

const authors = computed(() => [...new Set(commits.value.map(c => c.author))].sort())
const uniqueAuthors = computed(() => authors.value.length)
const uniqueFiles = computed(() => new Set(commits.value.flatMap(c => c.files)).size)
const latestDate = computed(() => {
  if (!commits.value.length) return '—'
  return new Date(commits.value[0].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
})

const filteredCommits = computed(() => {
  let list = commits.value
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter(c => c.message.toLowerCase().includes(s) || c.author.toLowerCase().includes(s) || c.files.some(f => f.toLowerCase().includes(s)))
  }
  if (authorFilter.value) list = list.filter(c => c.author === authorFilter.value)
  if (fileTypeFilter.value) { const ft = fileTypeFilter.value; list = list.filter(c => c.files.some(f => f.includes(`/${ft}/`))) }
  return list
})

const groupedCommits = computed(() => {
  const groups = {}
  for (const c of filteredCommits.value) { const date = c.timestamp.split('T')[0]; if (!groups[date]) groups[date] = []; groups[date].push(c) }
  return groups
})

// ─── Patch events on the timeline (from dex_patch_events on ALT) ──
const { fetchPatchSummary } = useTimelineEvents()
const patchEvents = ref([])

async function loadPatchEvents() {
  // Match the date span of the changelog we already loaded; default to 14d.
  const end = dayjs()
  const start = end.subtract(14, 'day')
  try {
    const rows = await fetchPatchSummary(
      start.format('YYYY-MM-DD HH:mm:ss'),
      end.format('YYYY-MM-DD HH:mm:ss')
    )
    patchEvents.value = (rows || []).map((r, idx) => ({
      ...r,
      idx,
      device_count: Number(r.device_count || 0),
      avg_lag: r.avg_lag !== undefined ? Number(r.avg_lag) : undefined,
      max_lag: r.max_lag !== undefined ? Number(r.max_lag) : undefined,
    }))
  } catch (e) {
    // Don't break the page if the worker query fails; just skip patch waves.
    patchEvents.value = []
  }
}

// Merged daily structure: each day carries its commits AND patch waves.
const groupedEntries = computed(() => {
  const days = {}
  for (const c of filteredCommits.value) {
    const d = c.timestamp.split('T')[0]
    if (!days[d]) days[d] = { date: d, commits: [], patches: [] }
    days[d].commits.push(c)
  }
  for (const p of patchEvents.value) {
    const ts = (p.hour || '').toString().replace('T', ' ')
    const d = ts.split(' ')[0]
    if (!d) continue
    if (!days[d]) days[d] = { date: d, commits: [], patches: [] }
    days[d].patches.push(p)
  }
  // Sort patches within a day newest first by hour
  for (const day of Object.values(days)) {
    day.patches.sort((a, b) => (b.hour || '').localeCompare(a.hour || ''))
  }
  return Object.values(days).sort((a, b) => b.date.localeCompare(a.date))
})

const authorStats = computed(() => {
  const counts = {}
  for (const c of commits.value) counts[c.author] = (counts[c.author] || 0) + 1
  return Object.entries(counts).map(([author, count]) => ({ author, count })).sort((a, b) => b.count - a.count).slice(0, 10)
})

const typeStats = computed(() => {
  const counts = { policies: 0, scripts: 0, profiles: 0, queries: 0, other: 0 }
  for (const c of commits.value) { for (const f of c.files) { if (f.includes('/policies/')) counts.policies++; else if (f.includes('/scripts/')) counts.scripts++; else if (f.includes('/profiles/')) counts.profiles++; else if (f.includes('/queries/')) counts.queries++; else counts.other++ } }
  return Object.entries(counts).filter(([, v]) => v > 0).map(([type, count]) => ({ type, count }))
})

function formatDate(dateStr) { return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) }
function formatTime(ts) { return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }
function toggleExpand(sha) { expandedSha.value = expandedSha.value === sha ? null : sha }
function fileTags(files) { const tags = new Set(); for (const f of files) { if (f.includes('/policies/')) tags.add('policies'); else if (f.includes('/scripts/')) tags.add('scripts'); else if (f.includes('/profiles/')) tags.add('profiles'); else if (f.includes('/queries/')) tags.add('queries') }; return [...tags] }
function fileIcon(f) { if (f.endsWith('.yml') || f.endsWith('.yaml')) return '\u2699'; if (f.endsWith('.sh')) return '\u25B6'; if (f.endsWith('.mobileconfig') || f.endsWith('.xml')) return '\u2630'; return '\u25E6' }

async function fetchChangelog() {
  loading.value = true; error.value = null
  try { const res = await fetch(CHANGELOG_URL); if (!res.ok) throw new Error(`Failed: ${res.status}`); commits.value = await res.json() }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}

// ─── FMA upstream app releases ──────────────────────
const { releases: fmaReleases, fetchFmaReleases, fetchReleaseDevices } = useFmaReleases()
const fmaWindowDays = 30
const fmaLimit = ref(24)
const fmaDeviceCounts = ref({})
const fmaDeviceLoading = ref({})
const fmaEagerLoaded = ref(false)

// OS filter — chips at the top of the section.
// FMA records use 'mac' and 'darwin' for macOS; merge them under one label.
const osFilter = ref('all')
const osOptions = [
  { value: 'all',     label: 'All' },
  { value: 'mac',     label: 'macOS' },
  { value: 'windows', label: 'Windows' },
  { value: 'linux',   label: 'Linux' },
]
function platformBucket(p) {
  const v = (p || '').toLowerCase()
  if (v === 'mac' || v === 'darwin' || v === 'macos') return 'mac'
  if (v === 'win' || v === 'windows') return 'windows'
  if (v === 'linux') return 'linux'
  return v || 'all'
}
const osCounts = computed(() => {
  const c = { all: fmaReleases.value.length, mac: 0, windows: 0, linux: 0 }
  for (const r of fmaReleases.value) {
    const b = platformBucket(r.platform)
    if (b in c) c[b]++
  }
  return c
})

// Toggle: hide cards where the worker came back with zero matches.
const onlyWithData = ref(true)

const fmaTopReleases = computed(() => {
  if (osFilter.value === 'all') return fmaReleases.value.slice(0, fmaLimit.value)
  return fmaReleases.value.filter(r => platformBucket(r.platform) === osFilter.value).slice(0, fmaLimit.value)
})

const visibleFmaReleases = computed(() => {
  if (!fmaEagerLoaded.value) return fmaTopReleases.value
  if (!onlyWithData.value) return fmaTopReleases.value
  return fmaTopReleases.value.filter(r => (totalDevicesForRelease(r.id) || 0) > 0)
})

const releasesWithData = computed(() =>
  fmaTopReleases.value.filter(r => (totalDevicesForRelease(r.id) || 0) > 0).length
)

async function loadFmaReleaseDevices(release) {
  if (fmaDeviceLoading.value[release.id]) return
  fmaDeviceLoading.value = { ...fmaDeviceLoading.value, [release.id]: true }
  try {
    const rows = await fetchReleaseDevices(release, fmaWindowDays)
    fmaDeviceCounts.value = { ...fmaDeviceCounts.value, [release.id]: rows || [] }
  } finally {
    fmaDeviceLoading.value = { ...fmaDeviceLoading.value, [release.id]: false }
  }
}

function totalDevicesForRelease(id) {
  const rows = fmaDeviceCounts.value[id]
  if (!rows) return null
  return rows.reduce((sum, r) => sum + Number(r.device_count || 0), 0)
}

function formatHours(h) {
  const n = Number(h)
  if (!isFinite(n)) return '?'
  if (n < 24) return `${Math.round(n)}h`
  return `${Math.round(n / 24)}d`
}

// Eager-load patch counts so we can hide cards with zero matches.
// Refires whenever the set of visible-but-uncounted releases changes
// (initial load, OS filter switch, "Show 12 more" click).
async function eagerLoadFmaCounts() {
  const targets = fmaTopReleases.value.filter(r => !fmaDeviceCounts.value[r.id] && !fmaDeviceLoading.value[r.id])
  if (!targets.length) {
    if (fmaReleases.value.length) fmaEagerLoaded.value = true
    return
  }
  await Promise.all(targets.map(r => loadFmaReleaseDevices(r)))
  fmaEagerLoaded.value = true
}

watch(fmaTopReleases, () => { eagerLoadFmaCounts() })

onMounted(async () => {
  fetchChangelog()
  loadPatchEvents()
  await fetchFmaReleases()
  // fmaReleases now populated → eager-load counts for the top slice
  eagerLoadFmaCounts()
})
</script>

<style scoped>
.dashboard { max-width: 1280px; margin: 0 auto; padding: var(--pad-xlarge); }
.dashboard-header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
.subtitle { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--fleet-black-50); }
h1 { font-size: var(--font-size-lg); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); }
.error-banner { background: var(--fleet-white); color: var(--fleet-error); padding: 12px 16px; border-radius: var(--radius); border: 1px solid var(--fleet-black-10); border-left: 3px solid var(--fleet-error); margin-bottom: 24px; }
.section { margin-bottom: 32px; }
.metrics-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
.metrics-row.four-col { grid-template-columns: repeat(4, 1fr); }
.charts-row.two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }
.filter-bar { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.search-input { font-family: var(--font-mono); font-size: var(--font-size-sm); padding: 8px 14px; border: 1px solid var(--fleet-black-10); border-radius: var(--radius); flex: 1; min-width: 200px; background: var(--fleet-white); }
.search-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
.filter-select { font-family: var(--font-mono); font-size: var(--font-size-sm); padding: 8px 12px; border: 1px solid var(--fleet-black-10); border-radius: var(--radius); background: var(--fleet-white); color: var(--fleet-black); }
.timeline { position: relative; padding-left: 24px; }
.timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: var(--fleet-black-10); }
.timeline-day { margin-bottom: 24px; }
.day-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; position: relative; }
.day-dot { width: 14px; height: 14px; border-radius: 50%; background: #3b82f6; border: 2px solid var(--fleet-white); position: absolute; left: -22px; z-index: 1; }
.day-label { font-family: var(--font-mono); font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black); }
.day-count { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.commit-card { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 8px; cursor: pointer; transition: border-color 150ms, box-shadow 150ms; }
.commit-card:hover { border-color: #3b82f6; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.commit-card.expanded { border-color: #3b82f6; border-left: 3px solid #3b82f6; }
.commit-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.commit-sha { font-family: var(--font-mono); font-size: var(--font-size-xs); color: #3b82f6; font-weight: 600; flex-shrink: 0; }
.commit-message { font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black); font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-card.expanded .commit-message { white-space: normal; }
.commit-time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); flex-shrink: 0; }
.commit-meta { display: flex; align-items: center; gap: 10px; }
.commit-author { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.commit-files-count { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.file-tag { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.file-tag.policies { background: #dbeafe; color: #1e40af; }
.file-tag.scripts { background: #dcfce7; color: #166534; }
.file-tag.profiles { background: #fef3c7; color: #92400e; }
.file-tag.queries { background: #f3e8ff; color: #6b21a8; }
.commit-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--fleet-black-5); }
.file-list { margin-bottom: 8px; }
.file-entry { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); }
.file-icon { width: 16px; text-align: center; }
.file-path { word-break: break-all; }
.github-link { display: inline-block; font-family: var(--font-mono); font-size: var(--font-size-xs); color: #3b82f6; text-decoration: none; font-weight: 600; margin-top: 4px; }
.github-link:hover { text-decoration: underline; }
.empty-state { text-align: center; padding: 40px; color: var(--fleet-black-50); font-family: var(--font-mono); }
@media (max-width: 1024px) { .metrics-row.four-col { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .metrics-row, .metrics-row.four-col { grid-template-columns: 1fr; } .charts-row.two-col { grid-template-columns: 1fr; } .filter-bar { flex-direction: column; } .dashboard-header { flex-direction: column; gap: 8px; } .commit-header { flex-wrap: wrap; } }

/* FMA upstream releases */
.fma-header-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.fma-header-row h2 { font-family: var(--font-mono); font-size: var(--font-size-md); font-weight: 600; color: var(--fleet-black); margin: 0; }
.fma-meta { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.fma-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.fma-card { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.fma-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.fma-app { font-weight: 600; font-size: 13px; color: var(--fleet-black); }
.fma-platform { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; padding: 1px 6px; border-radius: 6px; background: var(--fleet-off-white); color: var(--fleet-black-75); }
.fma-platform.platform-mac, .fma-platform.platform-darwin { background: #e0e7ff; color: #3730a3; }
.fma-platform.platform-windows { background: #dbeafe; color: #1e40af; }
.fma-platform.platform-linux { background: #dcfce7; color: #166534; }
.fma-badge.added { font-family: var(--font-mono); font-size: 10px; padding: 1px 6px; border-radius: 6px; background: #fef3c7; color: #92400e; text-transform: uppercase; font-weight: 700; }
.fma-version { font-family: var(--font-mono); font-size: 12px; color: var(--fleet-black-75); }
.fma-time { font-family: var(--font-mono); font-size: 11px; color: var(--fleet-black-50); }
.fma-load-btn { align-self: flex-start; font-family: var(--font-mono); font-size: var(--font-size-xs); padding: 6px 12px; border: 1px solid #6a67fe; background: var(--fleet-white); color: #6a67fe; border-radius: var(--radius); cursor: pointer; transition: background 150ms; }
.fma-load-btn:hover:not(:disabled) { background: #f8f7ff; }
.fma-load-btn:disabled { opacity: 0.6; cursor: wait; }
.fma-load-btn.loaded { background: #6a67fe; color: var(--fleet-white); border-color: #6a67fe; }
.fma-rollout-table { width: 100%; margin-top: 4px; border-collapse: collapse; font-size: 11px; font-family: var(--font-mono); table-layout: fixed; }
.fma-rollout-table th { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--fleet-black-10); color: var(--fleet-black-50); font-weight: 600; white-space: nowrap; }
.fma-rollout-table td { padding: 4px 6px; border-bottom: 1px solid var(--fleet-black-5); color: var(--fleet-black-75); vertical-align: top; white-space: nowrap; }
.fma-rollout-table td.mono { font-family: var(--font-mono); }
.fma-rollout-table .col-match { width: 28%; overflow: hidden; text-overflow: ellipsis; }
.fma-rollout-table .col-version { width: 32%; }
.fma-rollout-table .col-hosts { width: 8%; text-align: right; }
.fma-rollout-table .col-first { width: 20%; }
.fma-rollout-table .col-lag { width: 12%; text-align: right; }
.fma-rollout-table .ver-from, .fma-rollout-table .ver-to { white-space: nowrap; }
.fma-rollout-table .ver-arrow { margin: 0 4px; color: var(--fleet-black-50); }
.fma-rollout-table .when { display: inline; }
.fma-rollout-table .rollout-rel { color: var(--fleet-black-50); margin-left: 6px; font-size: 10px; }

/* FMA control strip */
.fma-controls { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.fma-chip-group { display: flex; gap: 4px; }
.fma-chip {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  padding: 4px 10px; border: 1px solid var(--fleet-black-10); background: var(--fleet-white);
  color: var(--fleet-black-75); border-radius: 999px; cursor: pointer; transition: border-color 100ms;
}
.fma-chip:hover { border-color: #6a67fe; color: var(--fleet-black); }
.fma-chip.active { background: #6a67fe; border-color: #6a67fe; color: var(--fleet-white); }
.fma-chip-count { font-size: 10px; opacity: 0.7; margin-left: 4px; }
.fma-toggle { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); cursor: pointer; }
.fma-toggle input { cursor: pointer; }
.fma-toggle-meta { color: var(--fleet-black-50); }
.fma-loading, .fma-empty { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); padding: 16px 0; }

/* Patch wave cards in the deployment timeline */
.patch-card {
  background: #f8fafc; border: 1px solid var(--fleet-black-10); border-left: 3px solid #6a67fe;
  border-radius: var(--radius); padding: 10px 14px; margin-bottom: 8px;
}
.patch-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
.patch-badge { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 4px; background: #6a67fe; color: var(--fleet-white); flex-shrink: 0; }
.patch-name { font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black); font-weight: 500; }
.patch-versions { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); white-space: nowrap; }
.patch-versions .ver-arrow { margin: 0 4px; color: var(--fleet-black-50); }
.patch-time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); margin-left: auto; flex-shrink: 0; }
.patch-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.patch-hosts { color: var(--fleet-black-75); }
.patch-source { color: var(--fleet-black-50); }
.patch-lag { color: var(--fleet-black-50); }
.fma-more-btn { margin-top: 12px; font-family: var(--font-mono); font-size: var(--font-size-xs); padding: 6px 12px; border: 1px solid var(--fleet-black-10); background: var(--fleet-white); color: var(--fleet-black-75); border-radius: var(--radius); cursor: pointer; }
.fma-more-btn:hover { border-color: #3b82f6; color: var(--fleet-black); }
</style>
