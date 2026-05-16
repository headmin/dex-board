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
          <div v-if="fmaDeviceLoading[r.id]" class="fma-stats fma-stats-loading">Loading…</div>
          <template v-else-if="fmaDeviceCounts[r.id]">
            <div class="fma-stats">
              <div class="fma-headline">
                <strong>{{ totalDevicesForRelease(r.id) || 0 }}</strong>
                <span class="fma-headline-label">{{ totalDevicesForRelease(r.id) === 1 ? 'host patched' : 'hosts patched' }}</span>
              </div>
              <div v-if="totalDevicesForRelease(r.id) > 0" class="fma-caption">
                avg {{ aggregateLag(r.id).avg }}d · max {{ aggregateLag(r.id).max }}d · via osquery
              </div>
              <div v-else class="fma-caption fma-caption-empty">
                no matching transitions in {{ fmaWindowDays }}d window
              </div>
            </div>
            <a
              v-if="totalDevicesForRelease(r.id) > 0"
              class="fma-cta"
              :href="ctaHref(r)"
              @click.prevent="jumpToTimeline(r)"
            >See in timeline →</a>
            <button v-else class="fma-cta fma-cta-secondary" @click="loadFmaReleaseDevices(r)">Refresh</button>
          </template>
          <button v-else class="fma-load-btn" @click="loadFmaReleaseDevices(r)">Show hosts patched</button>
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
    <section class="section" id="deployment-timeline">
      <div class="timeline-controls">
        <div class="event-chip-group">
          <button
            v-for="t in eventTypes" :key="t.key"
            class="event-chip" :class="{ active: eventTypeFilter[t.key] }"
            @click="toggleEventType(t.key)"
          >
            <span class="event-chip-dot" :style="{ background: t.color }"></span>
            {{ t.label }}
            <span class="event-chip-count">{{ eventTypeCounts[t.key] || 0 }}</span>
          </button>
        </div>
        <label class="hosts-slider-label">
          <span>Min hosts/wave</span>
          <input type="range" min="1" max="100" v-model.number="minHosts" class="hosts-slider" />
          <span class="hosts-slider-value">{{ minHosts }}</span>
        </label>
      </div>

      <div class="timeline">
        <div v-for="day in groupedEntries" :key="day.date" class="timeline-day">
          <div class="day-header">
            <span class="day-dot"></span>
            <span class="day-label">{{ formatDate(day.date) }}</span>
            <span class="day-count">
              <template v-if="eventTypeFilter.commits">{{ day.commits.length }} commit{{ day.commits.length === 1 ? '' : 's' }}</template>
              <template v-if="eventTypeFilter.releases && day.releases.length"> · {{ day.releases.length }} release{{ day.releases.length === 1 ? '' : 's' }}</template>
              <template v-if="eventTypeFilter.patches && day.patchBuckets.length"> · {{ day.patchBuckets.length }} app{{ day.patchBuckets.length === 1 ? '' : 's' }} patched ({{ day.totalPatchedHosts }} hosts)</template>
            </span>
          </div>

          <!-- 1. Vendor releases (RSS) — first in the cause→effect reading order -->
          <template v-if="eventTypeFilter.releases">
            <div
              v-for="rel in day.releases" :key="day.date + '-rel-' + rel.id"
              class="release-card"
            >
              <span class="release-badge">RELEASE</span>
              <span class="release-name">{{ rel.app }}</span>
              <span class="release-platform" :class="'platform-' + rel.platform">{{ rel.platform }}</span>
              <span class="release-versions mono">
                <template v-if="rel.version_from">{{ rel.version_from }}</template>
                <template v-else>new</template>
                <span class="ver-arrow">→</span>
                {{ rel.version_to }}
              </span>
              <span class="release-time">{{ formatTime(rel.timestamp) }}</span>
            </div>
          </template>

          <!-- 2. GitOps commits -->
          <template v-if="eventTypeFilter.commits">
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
          </template>

          <!-- 3. Endpoint patch buckets (per-software, expandable) -->
          <template v-if="eventTypeFilter.patches">
            <div
              v-for="bucket in day.patchBuckets" :key="day.date + '-bk-' + bucket.software_name"
              class="patch-bucket"
              :class="{ expanded: isBucketExpanded(day.date, bucket.software_name), highlighted: highlightedBucket === day.date + '::' + bucket.software_name }"
              :id="bucketAnchorId(day.date, bucket.software_name)"
            >
              <div class="patch-bucket-row" @click="toggleBucket(day.date, bucket.software_name)">
                <span class="patch-bucket-caret">{{ isBucketExpanded(day.date, bucket.software_name) ? '▼' : '▶' }}</span>
                <span class="patch-badge">PATCH</span>
                <span class="patch-bucket-name">{{ bucket.software_name }}</span>
                <span class="patch-bucket-versions mono">
                  {{ bucket.earliest_from || '—' }}
                  <span class="ver-arrow">→</span>
                  {{ bucket.latest_to }}
                </span>
                <span class="patch-bucket-hosts"><strong>{{ bucket.hosts }}</strong> host{{ bucket.hosts === 1 ? '' : 's' }}</span>
                <span class="patch-bucket-transitions">{{ bucket.transitions }} transition{{ bucket.transitions === 1 ? '' : 's' }}</span>
                <span class="patch-bucket-lag" :title="'Mean time to patch — average days between fleet-first sighting and per-host apply'">
                  MTTP {{ bucket.avg_lag }}d
                  <span class="patch-bucket-distinct" v-if="bucket.distinct_lags > 1">· {{ bucket.distinct_lags }} distinct</span>
                </span>
              </div>
              <div v-if="isBucketExpanded(day.date, bucket.software_name)" class="patch-bucket-drilldown" @click.stop>
                <div class="patch-bucket-summary">
                  <strong>Mean time to patch: {{ bucket.avg_lag }} days</strong>
                  <span class="patch-bucket-summary-meta">
                    range {{ bucket.min_lag }}–{{ bucket.max_lag }}d ·
                    {{ bucket.distinct_lags }} distinct lag value{{ bucket.distinct_lags === 1 ? '' : 's' }} across {{ bucket.hosts }} host{{ bucket.hosts === 1 ? '' : 's' }}
                  </span>
                </div>
                <div v-if="isBucketLoading(day.date, bucket.software_name)" class="patch-bucket-loading">Loading transitions…</div>
                <table v-else-if="drilldownRowsSorted(day.date, bucket.software_name).length" class="drilldown-table">
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>From</th>
                      <th>Hosts</th>
                      <th>Avg lag</th>
                      <th>Max lag</th>
                      <th>Hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(w, wi) in drilldownRowsSorted(day.date, bucket.software_name)"
                      :key="wi"
                      :class="{ 'target-group-start': isNewTargetGroup(drilldownRowsSorted(day.date, bucket.software_name), wi) }"
                    >
                      <td class="mono target-cell">{{ w.new_version }}</td>
                      <td class="mono from-cell">{{ w.old_version || '—' }}</td>
                      <td><strong>{{ w.device_count }}</strong></td>
                      <td>{{ w.avg_lag }}d</td>
                      <td>{{ w.max_lag }}d</td>
                      <td>{{ formatTime(w.hour) }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="patch-bucket-loading">No transitions returned.</div>
              </div>
            </div>
          </template>
        </div>

        <div v-if="!loading && filteredCommits.length === 0 && !patchBuckets.length" class="empty-state">
          No activity matches your filters.
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

// ─── Endpoint patch events (bucketed) + filters ─────
const { fetchPatchSummaryBucketed, fetchSoftwareDayPatches } = useTimelineEvents()
const patchBuckets = ref([])
const expandedBuckets = ref({})         // { 'YYYY-MM-DD::software_name': true }
const bucketDrilldowns = ref({})        // { key: rows[] }
const bucketLoading = ref({})           // { key: true }
const highlightedBucket = ref(null)     // for deep-link visual ping

// Persisted filter state
const FILTER_STORAGE_KEY = 'firehose-timeline-event-filter'
function loadFilter() {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (raw) return { commits: true, releases: true, patches: true, ...JSON.parse(raw) }
  } catch {}
  return { commits: true, releases: true, patches: true }
}
const eventTypeFilter = ref(loadFilter())
function toggleEventType(key) {
  eventTypeFilter.value = { ...eventTypeFilter.value, [key]: !eventTypeFilter.value[key] }
  try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(eventTypeFilter.value)) } catch {}
}

const eventTypes = [
  { key: 'commits',  label: 'Commits',          color: 'var(--fleet-vibrant-blue)' },
  { key: 'releases', label: 'Releases (RSS)',   color: '#14b8a6' },
  { key: 'patches',  label: 'Endpoint patches', color: '#6a67fe' },
]

// Min-hosts slider with light debouncing
const minHosts = ref(1)
let minHostsDebounceTimer = null

async function loadPatchBuckets() {
  const end = dayjs()
  const start = end.subtract(14, 'day')
  try {
    const rows = await fetchPatchSummaryBucketed(
      start.format('YYYY-MM-DD HH:mm:ss'),
      end.format('YYYY-MM-DD HH:mm:ss'),
      minHosts.value,
    )
    patchBuckets.value = (rows || []).map(r => ({
      ...r,
      hosts: Number(r.hosts || 0),
      transitions: Number(r.transitions || 0),
      avg_lag: r.avg_lag !== undefined ? Number(r.avg_lag) : 0,
      max_lag: r.max_lag !== undefined ? Number(r.max_lag) : 0,
    }))
    // Slider change invalidates cached drill-downs since the underlying set changed
    bucketDrilldowns.value = {}
  } catch (e) {
    patchBuckets.value = []
  }
}

watch(minHosts, () => {
  if (minHostsDebounceTimer) clearTimeout(minHostsDebounceTimer)
  minHostsDebounceTimer = setTimeout(() => loadPatchBuckets(), 200)
})

function bucketKey(day, sw) { return `${day}::${sw}` }
function isBucketExpanded(day, sw) { return !!expandedBuckets.value[bucketKey(day, sw)] }
function isBucketLoading(day, sw)  { return !!bucketLoading.value[bucketKey(day, sw)] }
function bucketAnchorId(day, sw)   { return 'bucket-' + bucketKey(day, sw).replace(/[^a-zA-Z0-9-]/g, '-') }

// Natural version compare — splits on '.', treats numeric segments numerically.
// e.g. '148.0.7778.97' < '148.0.7778.168' (lexically would be the opposite).
function compareVersion(a, b) {
  const norm = v => (v || '').split('.').map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p)
  const ax = norm(a), bx = norm(b)
  const n = Math.max(ax.length, bx.length)
  for (let i = 0; i < n; i++) {
    const av = ax[i], bv = bx[i]
    if (av === undefined) return -1
    if (bv === undefined) return 1
    if (typeof av === 'number' && typeof bv === 'number') {
      if (av !== bv) return av - bv
    } else if (String(av) !== String(bv)) {
      return String(av) < String(bv) ? -1 : 1
    }
  }
  return 0
}

function drilldownRows(day, sw) { return bucketDrilldowns.value[bucketKey(day, sw)] || [] }

// Drilldown rows sorted by target version (latest first) so paths converging
// on the same new_version cluster together. Within a target, oldest source
// first (shows the longest version jumps at the top of each group).
function drilldownRowsSorted(day, sw) {
  const rows = drilldownRows(day, sw)
  return rows.slice().sort((a, b) => {
    const t = compareVersion(b.new_version, a.new_version)   // new_version DESC
    if (t !== 0) return t
    const s = compareVersion(a.old_version, b.old_version)   // old_version ASC
    if (s !== 0) return s
    return (a.hour || '').localeCompare(b.hour || '')        // earliest hour first
  })
}

// True when this row's new_version differs from the previous row's — used to
// draw a subtle separator above the first row of each target-version group.
function isNewTargetGroup(rows, idx) {
  if (idx === 0) return false
  return rows[idx].new_version !== rows[idx - 1].new_version
}

async function toggleBucket(day, sw) {
  const k = bucketKey(day, sw)
  const wasOpen = !!expandedBuckets.value[k]
  expandedBuckets.value = { ...expandedBuckets.value, [k]: !wasOpen }
  if (wasOpen) return
  // Lazy fetch on first expand
  if (bucketDrilldowns.value[k]) return
  bucketLoading.value = { ...bucketLoading.value, [k]: true }
  try {
    const rows = await fetchSoftwareDayPatches(sw, day)
    bucketDrilldowns.value = { ...bucketDrilldowns.value, [k]: rows || [] }
  } finally {
    bucketLoading.value = { ...bucketLoading.value, [k]: false }
  }
}

// Merged daily structure: each day carries commits, releases, and patch buckets.
const groupedEntries = computed(() => {
  const days = {}
  const ensure = (d) => {
    if (!days[d]) days[d] = { date: d, commits: [], releases: [], patchBuckets: [], totalPatchedHosts: 0 }
    return days[d]
  }
  for (const c of filteredCommits.value) {
    const d = c.timestamp.split('T')[0]
    ensure(d).commits.push(c)
  }
  const releasesByDayMap = fmaReleasesByDay()
  for (const [d, list] of Object.entries(releasesByDayMap)) {
    ensure(d).releases.push(...list)
  }
  for (const b of patchBuckets.value) {
    const d = (b.day || '').toString().slice(0, 10)
    if (!d) continue
    const day = ensure(d)
    day.patchBuckets.push(b)
    day.totalPatchedHosts += Number(b.hosts || 0)
  }
  for (const day of Object.values(days)) {
    day.patchBuckets.sort((a, b) => b.hosts - a.hosts)
    day.releases.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
  }
  return Object.values(days).sort((a, b) => b.date.localeCompare(a.date))
})

const eventTypeCounts = computed(() => ({
  commits:  filteredCommits.value.length,
  releases: fmaReleases.value.length,
  patches:  patchBuckets.value.length,
}))

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
const { releases: fmaReleases, fetchFmaReleases, fetchReleaseDevices, releasesByDay: fmaReleasesByDay } = useFmaReleases()
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

// Weighted-by-host avg lag, plus max-of-max. Used by the slim FMA card.
function aggregateLag(id) {
  const rows = fmaDeviceCounts.value[id] || []
  let totalHosts = 0
  let weightedSum = 0
  let maxLag = 0
  for (const r of rows) {
    const hosts = Number(r.device_count || 0)
    const avg = Number(r.avg_lag || 0)
    const max = Number(r.max_lag || 0)
    weightedSum += hosts * avg
    totalHosts += hosts
    if (max > maxLag) maxLag = max
  }
  const avg = totalHosts > 0 ? +(weightedSum / totalHosts).toFixed(1) : 0
  return { avg, max: +maxLag.toFixed(1) }
}

// Pick the most-patched software name from a release's matched rows.
// Used to build the timeline deep-link.
function dominantSoftware(id) {
  const rows = fmaDeviceCounts.value[id] || []
  if (!rows.length) return ''
  return rows.slice().sort((a, b) => Number(b.device_count) - Number(a.device_count))[0].software_name || ''
}

// Find the day on which the bulk of the patching happened for this release.
function dominantDay(id) {
  const rows = fmaDeviceCounts.value[id] || []
  const byDay = {}
  for (const r of rows) {
    const d = (r.first_applied || '').toString().split(/[T ]/)[0]
    if (!d) continue
    byDay[d] = (byDay[d] || 0) + Number(r.device_count || 0)
  }
  const entries = Object.entries(byDay)
  if (!entries.length) return ''
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

function ctaHref(release) {
  const day = dominantDay(release.id)
  const sw = dominantSoftware(release.id)
  if (!day || !sw) return '#deployment-timeline'
  return `#patch/${day}/${encodeURIComponent(sw)}`
}

function jumpToTimeline(release) {
  const href = ctaHref(release)
  window.location.hash = href
  // The timeline section will pick up the hash via its watcher.
  const el = document.getElementById('deployment-timeline')
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

// ── Deep-link receiver: #patch/{day}/{software_name} ──
function applyHash() {
  const hash = (window.location.hash || '').replace(/^#/, '')
  const m = hash.match(/^patch\/([0-9]{4}-[0-9]{2}-[0-9]{2})\/(.+)$/)
  if (!m) return
  const day = m[1]
  const sw = decodeURIComponent(m[2])
  const k = bucketKey(day, sw)
  // Open the bucket (this also triggers the lazy drill-down fetch)
  if (!expandedBuckets.value[k]) toggleBucket(day, sw)
  // Wait a tick for the DOM, then scroll + ping
  setTimeout(() => {
    const el = document.getElementById(bucketAnchorId(day, sw))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightedBucket.value = k
    setTimeout(() => { if (highlightedBucket.value === k) highlightedBucket.value = null }, 2400)
  }, 80)
}

onMounted(async () => {
  fetchChangelog()
  loadPatchBuckets()
  await fetchFmaReleases()
  // fmaReleases now populated → eager-load counts for the top slice
  eagerLoadFmaCounts()
  // If the page was opened with a deep-link, honor it now that data exists.
  if (window.location.hash) {
    // give patchBuckets a moment to settle, then resolve hash
    setTimeout(applyHash, 250)
  }
  window.addEventListener('hashchange', applyHash)
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
.search-input:focus { outline: none; border-color: var(--fleet-vibrant-blue); box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
.filter-select { font-family: var(--font-mono); font-size: var(--font-size-sm); padding: 8px 12px; border: 1px solid var(--fleet-black-10); border-radius: var(--radius); background: var(--fleet-white); color: var(--fleet-black); }
.timeline { position: relative; padding-left: 24px; }
.timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: var(--fleet-black-10); }
.timeline-day { margin-bottom: 24px; }
.day-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; position: relative; }
.day-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--fleet-vibrant-blue); border: 2px solid var(--fleet-white); position: absolute; left: -22px; z-index: 1; }
.day-label { font-family: var(--font-mono); font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black); }
.day-count { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.commit-card { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 8px; cursor: pointer; transition: border-color 150ms, box-shadow 150ms; }
.commit-card:hover { border-color: var(--fleet-vibrant-blue); box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.commit-card.expanded { border-color: var(--fleet-vibrant-blue); border-left: 3px solid var(--fleet-vibrant-blue); }
.commit-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.commit-sha { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-vibrant-blue); font-weight: 600; flex-shrink: 0; }
.commit-message { font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black); font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-card.expanded .commit-message { white-space: normal; }
.commit-time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); flex-shrink: 0; }
.commit-meta { display: flex; align-items: center; gap: 10px; }
.commit-author { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.commit-files-count { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.file-tag { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.file-tag.policies { background: var(--fleet-accent-blue-light); color: #1e40af; }
.file-tag.scripts { background: var(--fleet-status-success-light); color: var(--fleet-status-success); }
.file-tag.profiles { background: var(--fleet-status-warning-light); color: var(--fleet-status-warning-dark); }
.file-tag.queries { background: #f3e8ff; color: #6b21a8; }
.commit-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--fleet-black-5); }
.file-list { margin-bottom: 8px; }
.file-entry { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); }
.file-icon { width: 16px; text-align: center; }
.file-path { word-break: break-all; }
.github-link { display: inline-block; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-vibrant-blue); text-decoration: none; font-weight: 600; margin-top: 4px; }
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
.fma-platform.platform-windows { background: var(--fleet-accent-blue-light); color: #1e40af; }
.fma-platform.platform-linux { background: var(--fleet-status-success-light); color: var(--fleet-status-success); }
.fma-badge.added { font-family: var(--font-mono); font-size: 10px; padding: 1px 6px; border-radius: 6px; background: var(--fleet-status-warning-light); color: var(--fleet-status-warning-dark); text-transform: uppercase; font-weight: 700; }
.fma-version { font-family: var(--font-mono); font-size: 12px; color: var(--fleet-black-75); }
.fma-time { font-family: var(--font-mono); font-size: 11px; color: var(--fleet-black-50); }
.fma-load-btn { align-self: flex-start; font-family: var(--font-mono); font-size: var(--font-size-xs); padding: 6px 12px; border: 1px solid #6a67fe; background: var(--fleet-white); color: #6a67fe; border-radius: var(--radius); cursor: pointer; transition: background 150ms; }
.fma-load-btn:hover:not(:disabled) { background: #f8f7ff; }
.fma-load-btn:disabled { opacity: 0.6; cursor: wait; }

/* Slim summary stats inside an FMA card */
.fma-stats { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--fleet-black-5); display: flex; flex-direction: column; gap: 4px; }
.fma-stats-loading { color: var(--fleet-black-50); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.fma-headline { display: flex; align-items: baseline; gap: 6px; }
.fma-headline strong { font-family: var(--font-mono); font-size: 22px; font-weight: 700; color: #6a67fe; line-height: 1; }
.fma-headline-label { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); }
.fma-caption { font-family: var(--font-mono); font-size: 11px; color: var(--fleet-black-50); }
.fma-caption-empty { font-style: italic; }
.fma-cta { display: inline-block; align-self: flex-start; margin-top: 4px; padding: 4px 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: #6a67fe; text-decoration: none; font-weight: 600; cursor: pointer; }
.fma-cta:hover { text-decoration: underline; }
.fma-cta-secondary { align-self: flex-start; background: none; border: 1px solid var(--fleet-black-10); padding: 4px 10px; border-radius: var(--radius); color: var(--fleet-black-75); cursor: pointer; }
.fma-cta-secondary:hover { border-color: #6a67fe; color: #6a67fe; }

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

/* ── Timeline control strip ── */
.timeline-controls {
  display: flex; align-items: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
  padding: 10px 12px; background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius);
}
.event-chip-group { display: flex; gap: 4px; }
.event-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  padding: 4px 10px; border: 1px solid var(--fleet-black-10); background: var(--fleet-white);
  color: var(--fleet-black-50); border-radius: 999px; cursor: pointer; transition: all 100ms;
}
.event-chip:hover { color: var(--fleet-black); border-color: var(--fleet-black-50); }
.event-chip.active { color: var(--fleet-black); border-color: var(--fleet-black); background: var(--fleet-off-white); }
.event-chip-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.event-chip-count { font-size: 10px; opacity: 0.75; }
.hosts-slider-label { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); margin-left: auto; }
.hosts-slider { width: 140px; }
.hosts-slider-value { font-weight: 700; color: var(--fleet-black); min-width: 24px; text-align: right; }

/* ── Release (RSS) cards in the timeline ── */
.release-card {
  display: flex; align-items: baseline; gap: 8px;
  background: #f0fdfa; border: 1px solid var(--fleet-black-10); border-left: 3px solid #14b8a6;
  border-radius: var(--radius); padding: 8px 14px; margin-bottom: 8px;
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black);
  flex-wrap: wrap;
}
.release-badge { font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 4px; background: #14b8a6; color: var(--fleet-white); flex-shrink: 0; }
.release-name { font-weight: 500; }
.release-platform { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; padding: 1px 6px; border-radius: 6px; background: var(--fleet-off-white); color: var(--fleet-black-75); }
.release-platform.platform-mac, .release-platform.platform-darwin { background: #e0e7ff; color: #3730a3; }
.release-platform.platform-windows { background: var(--fleet-accent-blue-light); color: #1e40af; }
.release-platform.platform-linux { background: var(--fleet-status-success-light); color: var(--fleet-status-success); }
.release-versions { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); white-space: nowrap; }
.release-versions .ver-arrow { margin: 0 4px; color: var(--fleet-black-50); }
.release-time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); margin-left: auto; flex-shrink: 0; }

/* ── Endpoint patch buckets (per-software per-day) ── */
.patch-bucket {
  background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-left: 3px solid #6a67fe;
  border-radius: var(--radius); margin-bottom: 8px; transition: background 150ms, box-shadow 150ms;
}
.patch-bucket.highlighted { box-shadow: 0 0 0 3px rgba(106, 103, 254, 0.25); background: #f8f7ff; }
.patch-bucket-row {
  display: grid; align-items: center;
  grid-template-columns: 16px auto 1fr auto auto auto auto;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black);
}
.patch-bucket-row:hover { background: #fafaff; }
.patch-bucket.expanded .patch-bucket-row { border-bottom: 1px solid var(--fleet-black-5); }
.patch-bucket-caret { font-size: 10px; color: var(--fleet-black-50); text-align: center; }
.patch-bucket .patch-badge { /* reuses badge style from bucket bg */
  font-family: var(--font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 4px; background: #6a67fe; color: var(--fleet-white); flex-shrink: 0;
}
.patch-bucket-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.patch-bucket-versions { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
.patch-bucket-versions .ver-arrow { margin: 0 4px; }
.patch-bucket-hosts { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); white-space: nowrap; }
.patch-bucket-transitions, .patch-bucket-lag { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); white-space: nowrap; }
.patch-bucket-drilldown { padding: 10px 14px; background: #fafaff; }
.patch-bucket-summary {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  padding: 6px 8px; margin-bottom: 8px;
  background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius);
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black);
}
.patch-bucket-summary strong { color: #6a67fe; font-weight: 700; }
.patch-bucket-summary-meta { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.patch-bucket-distinct { color: var(--fleet-black-50); margin-left: 4px; }
.patch-bucket-loading { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); padding: 4px 0; }
.drilldown-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 11px; }
.drilldown-table th { text-align: left; padding: 4px 8px 6px; color: var(--fleet-black-50); font-weight: 600; border-bottom: 1px solid var(--fleet-black-10); }
.drilldown-table td { padding: 4px 8px; color: var(--fleet-black-75); border-bottom: 1px solid var(--fleet-black-5); }
.drilldown-table td.mono { font-family: var(--font-mono); white-space: nowrap; }
.drilldown-table td.target-cell { font-weight: 600; color: var(--fleet-black); }
.drilldown-table td.from-cell { color: var(--fleet-black-50); }
.drilldown-table tr.target-group-start td { border-top: 2px solid var(--fleet-black-10); padding-top: 8px; }
.drilldown-table .ver-arrow { margin: 0 4px; color: var(--fleet-black-50); }

@media (max-width: 900px) {
  .patch-bucket-row { grid-template-columns: 16px auto 1fr auto; }
  .patch-bucket-versions, .patch-bucket-transitions, .patch-bucket-lag { display: none; }
}
.fma-more-btn { margin-top: 12px; font-family: var(--font-mono); font-size: var(--font-size-xs); padding: 6px 12px; border: 1px solid var(--fleet-black-10); background: var(--fleet-white); color: var(--fleet-black-75); border-radius: var(--radius); cursor: pointer; }
.fma-more-btn:hover { border-color: var(--fleet-vibrant-blue); color: var(--fleet-black); }
</style>
