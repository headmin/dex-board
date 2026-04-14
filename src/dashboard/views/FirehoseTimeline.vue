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
        <div v-for="(group, date) in groupedCommits" :key="date" class="timeline-day">
          <div class="day-header">
            <span class="day-dot"></span>
            <span class="day-label">{{ formatDate(date) }}</span>
            <span class="day-count">{{ group.length }} commit{{ group.length > 1 ? 's' : '' }}</span>
          </div>

          <div
            v-for="c in group" :key="c.sha"
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
import { ref, computed, onMounted } from 'vue'
import MetricCard from '../components/MetricCard.vue'
import BarChart from '../components/BarChart.vue'
import PieChart from '../components/PieChart.vue'

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

onMounted(() => fetchChangelog())
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
</style>
