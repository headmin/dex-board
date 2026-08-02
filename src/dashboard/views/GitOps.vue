<template>
  <div class="firehose-timeline page-stack">
    <PageHeader title="GitOps timeline" subtitle="Changes to fleetdm/fleet → it-and-security/, and what the score did after them" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — did shipping help? (briefing hero) ─────── -->
    <section class="go-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">Net score move · 30d</span>
        <div class="hero-count-row">
          <span v-if="netMove != null" class="hero-count" :class="netMove >= 0 ? 'hero-up' : 'hero-down'">{{ netMove >= 0 ? '+' : '−' }}{{ Math.abs(netMove).toFixed(1) }}</span>
          <span v-else class="hero-count hero-count--muted">—</span>
          <span class="hero-count-of">points</span>
        </div>
        <span class="hero-chip">{{ commits.length }} commits · {{ uniqueAuthors }} authors · {{ uniqueFiles }} files</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          <template v-if="outcome.judged === 0">
            {{ commits.length }} changes landed<template v-if="netMove != null">; the fleet composite moved {{ netMove >= 0 ? 'up' : 'down' }} {{ Math.abs(netMove).toFixed(1) }} points over 30 days</template> — none are 7 days old yet, so per-change impact can't be judged.
          </template>
          <template v-else-if="outcome.worse === 0">
            Shipping was <span class="hl-good">net positive or neutral</span> — none of the {{ outcome.judged }} judgeable changes was followed by a measurable score drop.
          </template>
          <template v-else>
            <span :class="netMove != null && netMove >= 0 ? 'hl-good' : 'hl-critical'">Shipping was net {{ netMove != null && netMove >= 0 ? 'positive' : 'negative' }}</span>, but
            <span class="hl-critical">{{ outcome.worse }} change{{ outcome.worse === 1 ? ' was' : 's were' }} followed by a score drop</span> — flagged in the chain below.
          </template>
        </p>
        <p class="hero-support">Per-change impact is the fleet-composite move in the 7 days after the change landed — correlation, not attribution.</p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">By outcome · 7d window</span>
        <div class="hero-rail-list">
          <div class="hero-rail-row"><span>Score rose after</span><span class="hero-rail-count hero-up">{{ outcome.better }}</span></div>
          <div class="hero-rail-row"><span>No measurable move</span><span class="hero-rail-count">{{ outcome.flat }}</span></div>
          <div class="hero-rail-row" :class="{ 'hero-rail-row--bad': outcome.worse }"><span>Score fell after</span><span class="hero-rail-count" :class="{ 'hero-down': outcome.worse }">{{ outcome.worse }}</span></div>
          <div v-if="outcome.tooRecent" class="hero-rail-row"><span>Too recent to judge</span><span class="hero-rail-count">{{ outcome.tooRecent }}</span></div>
          <div v-if="outcome.outsideWindow" class="hero-rail-row hero-rail-row--dim"><span>Before the 30d score window</span><span class="hero-rail-count">{{ outcome.outsideWindow }}</span></div>
        </div>
        <span class="hero-rail-tiers mono" title="Evidence tiers: verified = commit linked by software name to a real patch rollout ≤7 days after it; policy = policy/profile/script commits judged on their category; temporal = date proximity only">
          {{ tierCounts.verified }} verified · {{ tierCounts.policy }} policy · {{ tierCounts.temporal }} temporal
        </span>
      </div>
      <div class="hero-mttp-strip">
        <span class="mono">
          <template v-if="mttp7 && mttp7.p50_lag != null">MTTP {{ Number(mttp7.p50_lag).toFixed(1) }}d median · 7d window</template>
          <template v-else>MTTP — · no patch events in 7d</template>
          <template v-if="mttpTrend"> · {{ mttpTrend.delta }}d {{ mttpTrend.faster ? 'faster' : 'slower' }} than prior 7d</template>
          <template v-if="vendorLagMedian"> · vendor→first-patch median {{ vendorLagMedian.hours < 48 ? Math.round(vendorLagMedian.hours) + 'h' : (vendorLagMedian.hours / 24).toFixed(1) + 'd' }} (for the {{ vendorLagMedian.n }} loaded release{{ vendorLagMedian.n === 1 ? '' : 's' }} with patch data)</template>
        </span>
        <router-link to="/patch-velocity" class="hero-mttp-link">Patch velocity →</router-link>
      </div>
    </section>

    <!-- ─── Why — what moved the score (verified chains) ────── -->
    <section class="why-section">
      <div class="why-head">
        <h2 class="why-title">Why — what moved the score</h2>
        <span class="why-hint">Verified chains only (commit name-linked to a real rollout) · Δ7d is correlation, not attribution</span>
      </div>
      <div v-if="whyChains.best.length || whyChains.worst.length" class="why-grid">
        <div v-for="(group, gi) in [whyChains.best, whyChains.worst]" :key="gi" class="why-col">
          <span class="why-col-label">{{ gi === 0 ? 'Score rose after' : 'Score fell after' }}</span>
          <template v-if="group.length">
            <div v-for="ch in group" :key="ch.id" class="why-chain" @click="jumpToBucket(ch.bucketKeys[0])">
              <div class="why-chain-main">
                <span class="why-chain-sw">{{ ch.software }}</span>
                <span class="why-chain-delta mono" :class="ch.delta7d > 0 ? 'hero-up' : 'hero-down'">Δ7d {{ ch.delta7d > 0 ? '+' : '−' }}{{ Math.abs(ch.delta7d).toFixed(1) }}</span>
              </div>
              <div class="why-chain-sub">
                <template v-if="ch.release">{{ ch.release.app }} {{ ch.release.version_to }} released → </template>
                <template v-else>no vendor release matched → </template>
                <span class="mono">{{ ch.commits[0].short_sha }}</span> committed → {{ ch.totalHosts }} host{{ ch.totalHosts === 1 ? '' : 's' }} patched · see in timeline →
              </div>
            </div>
          </template>
          <span v-else class="why-empty">No verified chain was followed by a score {{ gi === 0 ? 'rise' : 'drop' }}.</span>
        </div>
      </div>
      <div v-else class="why-empty-block">
        <template v-if="whyChains.chainCount === 0">No verified release→commit→rollout chains in the current windows (rollouts kept 14d) — commits below still carry their evidence tier.</template>
        <template v-else>{{ whyChains.chainCount }} verified chain{{ whyChains.chainCount === 1 ? '' : 's' }} found, but none has a closed 7-day score window yet.</template>
      </div>
    </section>

    <!-- Upstream Fleet-maintained app releases (from fmalibrary.com) -->
    <section v-if="fmaReleases.length" class="fma-section">
      <SectionHeader title="App releases" :caption="fmaCaption" />
      <div class="fma-controls">
        <Tabs v-model="osFilter" :options="osTabs" variant="pill" />
        <label class="fma-toggle">
          <input type="checkbox" v-model="onlyWithData" />
          <span>Only show releases with patch data</span>
          <span v-if="onlyWithData && fmaEagerLoaded" class="fma-toggle-meta">({{ releasesWithData }}/{{ fmaTopReleases.length }} match)</span>
        </label>
      </div>
      <div v-if="!fmaEagerLoaded" class="fma-loading">Loading patch matches for {{ fmaTopReleases.length }} releases…</div>
      <EmptyState
        v-else-if="!visibleFmaReleases.length"
        small
        title="No releases match the current filter"
        info='Try a different OS or untick "Only show releases with patch data".'
      />
      <div class="fma-grid">
        <FmaReleaseCard
          v-for="r in visibleFmaReleases"
          :key="r.id"
          :release="r"
          :rows="fmaDeviceCounts[r.id] || null"
          :loading="!!fmaDeviceLoading[r.id]"
          :window-days="fmaWindowDays"
          @load-devices="loadFmaReleaseDevices"
        >
          <a
            v-if="totalDevicesForRelease(r.id) > 0"
            class="fma-cta"
            :href="ctaHref(r)"
            @click.prevent="jumpToTimeline(r)"
          >See in timeline →</a>
        </FmaReleaseCard>
      </div>
      <BaseButton v-if="visibleFmaReleases.length > 0 && fmaTopReleases.length < fmaReleases.length" class="fma-more-btn" @click="fmaLimit += 12">
        Show 12 more releases
      </BaseButton>
    </section>

    <!-- Filter bar -->
    <div class="filter-bar">
      <SearchInput v-model="search" class="filter-search" placeholder="Search commits, authors, files, releases, patched apps..." />
      <BaseSelect v-model="authorFilter" class="filter-select" :options="authorOptions" />
      <BaseSelect v-model="fileTypeFilter" class="filter-select" :options="fileTypeOptions" />
      <BaseButton
        class="copy-md-btn"
        :class="{ 'copy-md-btn--copied': copied }"
        :disabled="!hasExportableEntries"
        :title="hasExportableEntries ? 'Copy the currently visible timeline as Markdown' : 'Nothing to copy'"
        @click="copyMarkdownExport"
      >
        <template #icon>
          <svg v-if="copied" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 6.5L4.8 9.2L10 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="4" y="4" width="6.5" height="6.5" rx="1" stroke="currentColor" stroke-width="1.2" />
            <path d="M8 2H2.8A0.8 0.8 0 0 0 2 2.8V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </template>
        {{ copied ? 'Copied' : 'Copy as MD' }}
      </BaseButton>
    </div>

    <!-- Timeline -->
    <section class="timeline-section" id="deployment-timeline">
      <div class="timeline-controls">
        <div class="legend-toggles">
          <button
            v-for="t in eventTypes" :key="t.key"
            type="button"
            class="legend-toggle"
            :aria-pressed="eventTypeFilter[t.key]"
            @click="toggleEventType(t.key)"
          >
            <Chip
              :tone="eventTypeFilter[t.key] ? t.tone : 'neutral'"
              :label="t.label"
              :value="String(eventTypeCounts[t.key] || 0)"
            />
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
            <span
              v-if="deltaAfter(day.date) != null"
              class="day-delta"
              :class="dayDeltaClass(day.date)"
              :title="`Fleet composite move in the 7 days after ${day.date} — correlation, not attribution`"
            >Δ7d {{ deltaAfter(day.date) > 0 ? '+' : deltaAfter(day.date) < 0 ? '−' : '' }}{{ Math.abs(deltaAfter(day.date)).toFixed(1) }} pts</span>
          </div>

          <!-- 1. Vendor releases (RSS) — first in the cause→effect reading order -->
          <template v-if="eventTypeFilter.releases">
            <div
              v-for="rel in day.releases" :key="day.date + '-rel-' + rel.id"
              class="release-card"
            >
              <Badge tone="good" label="Release" />
              <span class="release-name">{{ rel.app }}</span>
              <span class="platform-tag" :class="'platform-' + rel.platform">{{ rel.platform }}</span>
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
                <template v-if="commitTier(c)">
                  <span
                    v-if="commitTier(c).tier === 'verified'"
                    class="tier-chip tier-chip--verified"
                    :title="`Name-linked to a real ${commitTier(c).linkedSoftware} rollout within 7 days of this commit`"
                  >verified · {{ commitTier(c).linkedSoftware }}</span>
                  <span
                    v-else-if="commitTier(c).tier === 'policy'"
                    class="tier-chip tier-chip--policy"
                    :title="`Judged on the ${commitTier(c).judgedOn} score — correlation, not attribution`"
                  >policy · {{ commitTier(c).judgedOn }}<template v-if="commitTier(c).categoryDelta7d != null"> Δ7d {{ commitTier(c).categoryDelta7d > 0 ? '+' : '−' }}{{ Math.abs(commitTier(c).categoryDelta7d).toFixed(1) }}</template></span>
                  <span v-else class="tier-chip tier-chip--temporal" title="Date proximity only — no rollout or category evidence links this commit to a score move">temporal — unverified</span>
                </template>
              </div>

              <div
                v-if="commitTier(c)?.tier === 'verified' && commitTier(c).linkedBucketKeys?.length"
                class="chain-connector"
                @click.stop="jumpToBucket(commitTier(c).linkedBucketKeys[0])"
              >
                ⛓ rollout evidence: {{ commitTier(c).linkedSoftware }} patched on {{ commitTier(c).linkedBucketKeys.length }} day{{ commitTier(c).linkedBucketKeys.length === 1 ? '' : 's' }}<template v-if="commitTier(c).linkedReleaseId == null"> · no vendor release matched</template> — see in timeline →
              </div>

              <div v-if="commitRegression(c)" class="commit-regression">
                <strong>Score fell after this change.</strong>
                Fleet composite moved {{ commitRegression(c) }} pts in the following 7 days — correlation, not attribution; worth reviewing the change.
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
                <Badge tone="info" label="Patch" />
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
                <div v-else-if="drilldownRowsSorted(day.date, bucket.software_name).length" class="drilldown-table-wrap">
                  <table class="drilldown-table">
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
                </div>
                <div v-else class="patch-bucket-loading">No transitions returned.</div>
              </div>
            </div>
          </template>
        </div>

        <EmptyState
          v-if="!loading && filteredCommits.length === 0 && !patchBuckets.length"
          small
          title="No activity matches your filters."
        />
      </div>
    </section>

    <!-- Author breakdown -->
    <div class="charts-row two-col">
      <BarChart
        title="Commits by author"
        :data="authorStats"
        :loading="loading"
        nameKey="author"
        valueKey="count"
      />
      <ChartCard title="Changes by type" :loading="loading" :empty="!typeStats.length">
        <BarList :data="typeStats" nameKey="type" valueKey="count" />
      </ChartCard>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import BarChart from '../components/BarChart.vue'
import ChartCard from '../components/base/ChartCard.vue'
import BarList from '../components/base/BarList.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import Tabs from '../components/base/Tabs.vue'
import Chip from '../components/base/Chip.vue'
import Badge from '../components/base/Badge.vue'
import BaseButton from '../components/base/BaseButton.vue'
import BaseSelect from '../components/base/BaseSelect.vue'
import SearchInput from '../components/base/SearchInput.vue'
import EmptyState from '../components/base/EmptyState.vue'
import FmaReleaseCard from '../components/FmaReleaseCard.vue'
import {
  useFmaReleases,
  totalDevicesForRelease as sharedTotalDevicesForRelease,
  loadFmaReleaseDevices as sharedLoadFmaReleaseDevices,
} from '../composables/useFmaReleases'
import { usePatchEvents } from '../composables/usePatchEvents'
import { useChangelog, fileTags } from '../composables/useChangelog'
import { useDailyScoreSeries } from '../composables/useDailyScoreSeries'
import { buildChangeImpact } from '../composables/useChangeImpact'
import { useAppConfig } from '../composables/useAppConfig'
import { query } from '../services/api'
import dayjs from 'dayjs'

const loading = ref(true)
const error = ref(null)
const { config } = useAppConfig()

// Shared session-cached changelog (also used by Patch velocity).
const { commits, changelogError, fetchChangelog: fetchSharedChangelog } = useChangelog()

// ─── Daily fleet score series (shared singleton; composite + categories).
// Powers the per-change "score after 7d" reading: the composite on day+7
// minus the composite on the change day. Correlation, not attribution —
// the labels say so wherever a delta is shown.
const { fetchDailySeries, deltaAfter, judgementFor, netMove } = useDailyScoreSeries()

function dayDeltaClass(dateStr) {
  const d = deltaAfter(dateStr)
  if (d == null) return ''
  if (d >= 0.5) return 'day-delta--up'
  if (d <= -0.5) return 'day-delta--down'
  return 'day-delta--flat'
}

function commitRegression(c) {
  const d = deltaAfter(String(c.timestamp).split('T')[0])
  return d != null && d <= -1 ? d.toFixed(1) : null
}

// Outcome buckets across commits (each judged by its 7d-after window).
// "Too recent" = the 7-day window hasn't closed; "outside window" = the
// commit predates the 30-day score series — two different kinds of unknown.
const outcome = computed(() => {
  let better = 0, flat = 0, worse = 0, tooRecent = 0, outsideWindow = 0
  for (const c of commits.value) {
    const dateStr = String(c.timestamp).split('T')[0]
    const d = deltaAfter(dateStr)
    if (d == null) {
      if (dayjs(dateStr).add(7, 'day').isAfter(dayjs(), 'day')) tooRecent++
      else outsideWindow++
      continue
    }
    if (d >= 0.5) better++
    else if (d <= -0.5) worse++
    else flat++
  }
  return { better, flat, worse, tooRecent, outsideWindow, judged: better + flat + worse }
})
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

const authorOptions = computed(() => [
  { value: '', label: 'All authors' },
  ...authors.value.map(a => ({ value: a, label: a })),
])

const fileTypeOptions = [
  { value: '', label: 'All file types' },
  { value: 'policies', label: 'Policies' },
  { value: 'scripts', label: 'Scripts' },
  { value: 'profiles', label: 'Profiles' },
  { value: 'queries', label: 'Queries' },
]

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
const { fetchPatchSummaryBucketed, fetchSoftwareDayPatches } = usePatchEvents()
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
  { key: 'commits',  label: 'Commits',          tone: 'info' },
  { key: 'releases', label: 'Releases (RSS)',   tone: 'good' },
  { key: 'patches',  label: 'Endpoint patches', tone: 'info' },
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

// Search applies to all event types (commits already handled by filteredCommits).
// Case-insensitive substring across the natural identity field of each kind:
//   • releases   → rel.app
//   • patches    → bucket.software_name
const filteredReleases = computed(() => {
  if (!search.value) return fmaReleases.value
  const s = search.value.toLowerCase()
  return fmaReleases.value.filter(r => (r.app || '').toLowerCase().includes(s))
})

const filteredPatchBuckets = computed(() => {
  if (!search.value) return patchBuckets.value
  const s = search.value.toLowerCase()
  return patchBuckets.value.filter(b => (b.software_name || '').toLowerCase().includes(s))
})

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
  // Group filtered releases by day instead of using the unfiltered map
  for (const r of filteredReleases.value) {
    const d = (r.timestamp || '').slice(0, 10)
    if (d) ensure(d).releases.push(r)
  }
  for (const b of filteredPatchBuckets.value) {
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
  releases: filteredReleases.value.length,
  patches:  filteredPatchBuckets.value.length,
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
function fileIcon(f) { if (f.endsWith('.yml') || f.endsWith('.yaml')) return '⚙'; if (f.endsWith('.sh')) return '▶'; if (f.endsWith('.mobileconfig') || f.endsWith('.xml')) return '☰'; return '◦' }

async function fetchChangelog() {
  loading.value = true; error.value = null
  await fetchSharedChangelog()
  error.value = changelogError.value
  loading.value = false
}

// ─── FMA upstream app releases ──────────────────────
const { releases: fmaReleases, fetchFmaReleases } = useFmaReleases()
const fmaWindowDays = 30
const fmaLimit = ref(24)
const fmaDeviceCounts = ref({})
const fmaDeviceLoading = ref({})
const fmaEagerLoaded = ref(false)

// OS filter — pill tabs at the top of the section.
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

const osTabs = computed(() =>
  osOptions.map(o => ({ value: o.value, label: o.label, count: osCounts.value[o.value] || 0 }))
)

const fmaCaption = computed(() =>
  `Vendor-published Fleet-maintained app versions · showing ${visibleFmaReleases.value.length} of ${fmaReleases.value.length} · ${fmaWindowDays}d patch window`
)

// Toggle: hide cards where the worker came back with zero matches.
const onlyWithData = ref(true)

const fmaTopReleases = computed(() => {
  let list = fmaReleases.value
  // Layer 1: OS tab filter
  if (osFilter.value !== 'all') {
    list = list.filter(r => platformBucket(r.platform) === osFilter.value)
  }
  // Layer 2: text search (same `search` ref the timeline below uses) — keeps
  // the top App-releases grid in lockstep with the timeline filter.
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter(r =>
      (r.app || '').toLowerCase().includes(s) ||
      (r.platform || '').toLowerCase().includes(s) ||
      (r.version_to || '').toLowerCase().includes(s) ||
      (r.version_from || '').toLowerCase().includes(s)
    )
  }
  return list.slice(0, fmaLimit.value)
})

const visibleFmaReleases = computed(() => {
  if (!fmaEagerLoaded.value) return fmaTopReleases.value
  if (!onlyWithData.value) return fmaTopReleases.value
  return fmaTopReleases.value.filter(r => (totalDevicesForRelease(r.id) || 0) > 0)
})

const releasesWithData = computed(() =>
  fmaTopReleases.value.filter(r => (totalDevicesForRelease(r.id) || 0) > 0).length
)

// If the patch-data filter would empty the section entirely, switch it off —
// an empty flagship section with an active filter reads as broken.
watch([releasesWithData, fmaEagerLoaded], ([n, loaded]) => {
  if (loaded && onlyWithData.value && n === 0) onlyWithData.value = false
})

// Shared helpers from useFmaReleases, bound to this view's state.
function loadFmaReleaseDevices(release) {
  return sharedLoadFmaReleaseDevices(query, release, {
    deviceCounts: fmaDeviceCounts,
    deviceLoading: fmaDeviceLoading,
    windowDays: fmaWindowDays,
  })
}

function totalDevicesForRelease(id) {
  return sharedTotalDevicesForRelease(fmaDeviceCounts, id)
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

// ─── Copy current view as Markdown ─────────────────────────
const copied = ref(false)
let copiedTimer = null

const hasExportableEntries = computed(() => {
  for (const day of groupedEntries.value) {
    if (eventTypeFilter.value.releases && day.releases.length) return true
    if (eventTypeFilter.value.commits  && day.commits.length)  return true
    if (eventTypeFilter.value.patches  && day.patchBuckets.length) return true
  }
  return false
})

// Linkify #NNNN issue refs in commit messages → fleetdm/fleet issues.
// Scoped to commit messages only (release/patch names rarely carry refs and
// the false-positive risk against version-like tokens is non-zero).
const FLEET_ISSUE_RE = /#(\d{2,6})\b/g
const linkifyIssueRefs = (text) =>
  (text || '').replace(FLEET_ISSUE_RE, '[#$1](https://github.com/fleetdm/fleet/issues/$1)')

function buildMarkdownExport() {
  const lines = ['# DEX Board — Timeline export', '']
  // ── Header: filter description + counts + export timestamp
  const types = Object.entries(eventTypeFilter.value)
    .filter(([, on]) => on).map(([k]) => k).join('+') || 'none'
  const filterParts = []
  if (search.value) filterParts.push(`search="${search.value}"`)
  if (authorFilter.value) filterParts.push(`author="${authorFilter.value}"`)
  if (fileTypeFilter.value) filterParts.push(`fileType="${fileTypeFilter.value}"`)
  filterParts.push(`types=${types}`)
  filterParts.push(`min hosts/wave=${minHosts.value}`)
  lines.push(`**Filter:** ${filterParts.join(' · ')}`)
  const counts = eventTypeCounts.value
  const totalPatchHosts = groupedEntries.value.reduce((s, d) => s + (d.totalPatchedHosts || 0), 0)
  lines.push(`**Days shown:** ${groupedEntries.value.length} · **Counts:** ${counts.commits} commits · ${counts.releases} releases · ${counts.patches} apps patched (${totalPatchHosts} hosts)`)
  lines.push(`**Exported:** ${dayjs().format('YYYY-MM-DD HH:mm')}`)
  lines.push('', '---', '')

  for (const day of groupedEntries.value) {
    const dayHasContent =
      (eventTypeFilter.value.releases && day.releases.length) ||
      (eventTypeFilter.value.commits  && day.commits.length)  ||
      (eventTypeFilter.value.patches  && day.patchBuckets.length)
    if (!dayHasContent) continue

    lines.push(`## ${day.date}`, '')

    if (eventTypeFilter.value.releases && day.releases.length) {
      lines.push('### Releases')
      for (const r of day.releases) {
        const from = r.version_from || '*new*'
        const dl = r.download_url ? ` · [download](${r.download_url})` : ''
        lines.push(`- **${r.app}** ${from} → ${r.version_to} *(${r.platform})*${dl}`)
      }
      lines.push('')
    }

    if (eventTypeFilter.value.commits && day.commits.length) {
      lines.push('### Commits')
      for (const c of day.commits) {
        const msg = linkifyIssueRefs(c.message)
        lines.push(`- \`${c.short_sha}\` — ${msg}`)
        lines.push(`  *by ${c.author} · [view commit](https://github.com/fleetdm/fleet/commit/${c.sha})*`)
      }
      lines.push('')
    }

    if (eventTypeFilter.value.patches && day.patchBuckets.length) {
      lines.push('### Endpoint patches')
      for (const b of day.patchBuckets) {
        const from = b.earliest_from || '*new*'
        lines.push(`- **${b.software_name}** ${from} → ${b.latest_to} — ${b.hosts} hosts · ${b.transitions} transitions · MTTP ${b.avg_lag}d`)
      }
      lines.push('')
    }

    lines.push('---', '')
  }

  return lines.join('\n')
}

async function copyMarkdownExport() {
  if (!hasExportableEntries.value) return
  const md = buildMarkdownExport()
  let ok = false
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(md)
      ok = true
    }
  } catch {}
  if (!ok) {
    // Fallback: hidden textarea + execCommand for older browsers / non-HTTPS
    const ta = document.createElement('textarea')
    ta.value = md
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { ok = document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
  }
  if (ok) {
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 1500)
  } else {
    alert("Couldn't copy to clipboard. Select-all-and-copy the Markdown manually.")
  }
}

// ─── Change-impact engine — evidence-tiered chains ──────────
// verified = commit name-linked to a real rollout ≤7d after it (optionally
// completed by a vendor release ≤7d before); policy = policy/profile/script
// commits judged on their category; temporal = date proximity only.
const impact = computed(() => buildChangeImpact({
  commits: commits.value,
  releases: fmaReleases.value,
  patchBuckets: patchBuckets.value,
  fileTags,
  deltaAfter,
  judgementFor,
}))

function commitTier(c) { return impact.value.byCommitSha.get(c.sha) || null }

const tierCounts = computed(() => {
  const t = { verified: 0, policy: 0, temporal: 0 }
  for (const c of commits.value) {
    const e = impact.value.byCommitSha.get(c.sha)
    t[e?.tier || 'temporal']++
  }
  return t
})

// Top judged verified chains, best and worst by |Δ7d| — the "Why" section.
const whyChains = computed(() => {
  const judged = impact.value.chains.filter(ch => ch.judgement === 'better' || ch.judgement === 'worse')
  const best = judged.filter(ch => ch.delta7d > 0).sort((a, b) => b.delta7d - a.delta7d).slice(0, 3)
  const worst = judged.filter(ch => ch.delta7d < 0).sort((a, b) => a.delta7d - b.delta7d).slice(0, 3)
  return { best, worst, judgedCount: judged.length, chainCount: impact.value.chains.length }
})

// Jump to a rollout bucket from a chain connector (reuses the hash receiver).
function jumpToBucket(key) {
  const [day, sw] = String(key).split('::')
  if (!day || !sw) return
  window.location.hash = `#patch/${day}/${encodeURIComponent(sw)}`
  applyHash()
}

// ─── Hero MTTP strip → /patch-velocity ──────────────────────
// Fleet-internal clock (days). Vendor lag (hours) is computed client-side
// from the already-loaded release patch waves and labeled with its count.
const mttp7 = ref(null)
const mttpPrior7 = ref(null)

async function fetchMttpStrip() {
  const sla = Number(config.value.patchSlaDays) || 14
  const one = (params) =>
    query('firehose.scores.mttp_summary', { slaDays: sla, ...params })
      .then(rows => rows?.[0] || null)
      .catch(() => null)
  ;[mttp7.value, mttpPrior7.value] = await Promise.all([
    one({ windowDays: 7 }),
    one({ windowDays: 7, offsetDays: 7 }),
  ])
}

const mttpTrend = computed(() => {
  const c = mttp7.value?.p50_lag
  const p = mttpPrior7.value?.p50_lag
  if (c == null || p == null) return null
  const d = Number(c) - Number(p)
  return { delta: Math.abs(d).toFixed(1), faster: d < 0 }
})

const vendorLagMedian = computed(() => {
  const firsts = []
  for (const rows of Object.values(fmaDeviceCounts.value)) {
    if (!rows?.length) continue
    const f = Math.min(...rows.map(x => Number(x.hours_to_first_patch)).filter(isFinite))
    if (isFinite(f)) firsts.push(f)
  }
  if (!firsts.length) return null
  const a = firsts.sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  const med = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
  return { hours: med, n: firsts.length }
})

onMounted(async () => {
  fetchChangelog()
  fetchDailySeries()
  loadPatchBuckets()
  fetchMttpStrip()
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
/* Column layout + gap between top-level blocks come from .page-stack */
.firehose-timeline { max-width: 1280px; margin: 0 auto; padding: var(--pad-xlarge); }

/* Sections stack their own children */
.fma-section, .timeline-section { display: flex; flex-direction: column; gap: 12px; }

/* ── Filter bar ── */
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.filter-search { flex: 1; min-width: 200px; width: auto; }
.filter-select { width: 170px; }
.copy-md-btn { margin-left: auto; }
.copy-md-btn.copy-md-btn--copied {
  background: var(--status-good-bg);
  border-color: var(--status-good);
  color: var(--status-good-text);
}


/* ── Timeline rail (day dots keep the blue chart-identity accent) ── */
.timeline { position: relative; padding-left: 24px; }
.timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: var(--fleet-black-10); }
.timeline-day { margin-bottom: 24px; }
.day-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; position: relative; }
.day-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--fleet-vibrant-blue); border: 2px solid var(--fleet-white); position: absolute; left: -22px; z-index: 1; }
.day-label { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black); }
.day-count { font-size: var(--font-size-xs); color: var(--fleet-black-50); }

/* ── Commit cards ── */
.commit-card { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); padding: 12px 16px; margin-bottom: 8px; cursor: pointer; transition: border-color 150ms, box-shadow 150ms, background-color 150ms; }
.commit-card:hover { border-color: var(--fleet-black-50); box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.commit-card.expanded { border-color: var(--fleet-black-10); background: var(--info-tint-soft); }
.commit-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.commit-sha { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); font-weight: 600; flex-shrink: 0; }
.commit-message { font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black); font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-card.expanded .commit-message { white-space: normal; }
.commit-time { font-size: var(--font-size-xs); color: var(--fleet-black-50); flex-shrink: 0; }
.commit-meta { display: flex; align-items: center; gap: 10px; }
.commit-author { font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.commit-files-count { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.file-tag { display: inline-block; padding: 1px 6px; border-radius: var(--radius-full); font-size: 10px; font-weight: 600; text-transform: capitalize; letter-spacing: 0.5px; }
.file-tag.policies { background: var(--fleet-accent-blue-light); color: var(--fleet-accent-blue); }
.file-tag.scripts { background: var(--status-good-bg); color: var(--status-good-text); }
.file-tag.profiles { background: var(--status-fair-bg); color: var(--status-fair-text); }
.file-tag.queries { background: var(--fleet-accent-purple-light); color: var(--fleet-accent-purple); }
.commit-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--fleet-black-5); }
.file-list { margin-bottom: 8px; }
.file-entry { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: var(--font-size-xs); color: var(--fleet-black-75); }
.file-icon { width: 16px; text-align: center; }
.file-path { word-break: break-all; }
.github-link { display: inline-block; font-size: var(--font-size-xs); color: var(--link-color); text-decoration: none; font-weight: 600; margin-top: 4px; }
.github-link:hover { color: var(--link-color-hover); text-decoration: underline; }
@media (max-width: 768px) { .filter-bar { flex-direction: column; align-items: stretch; } .copy-md-btn { margin-left: 0; } .commit-header { flex-wrap: wrap; } }

/* ── FMA upstream releases ── */
.fma-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.fma-cta { align-self: flex-start; font-size: var(--font-size-xs); color: var(--link-color); text-decoration: none; font-weight: 600; cursor: pointer; }
.fma-cta:hover { color: var(--link-color-hover); text-decoration: underline; }
.fma-controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.fma-toggle { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-xs); color: var(--fleet-black-75); cursor: pointer; }
.fma-toggle input { cursor: pointer; }
.fma-toggle-meta { color: var(--fleet-black-50); }
.fma-loading { font-size: var(--font-size-xs); color: var(--fleet-black-50); padding: 16px 0; }
.fma-more-btn { align-self: flex-start; }

/* ── Timeline control strip ── */
.timeline-controls {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 9px 11px; background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large);
}
.legend-toggles { display: flex; gap: 6px; }
.legend-toggle { border: 0; padding: 0; background: none; cursor: pointer; border-radius: var(--radius-full); }
.legend-toggle:focus-visible { outline: 1px solid var(--fleet-focused-outline); outline-offset: 1px; }
.hosts-slider-label { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-xs); color: var(--fleet-black-75); margin-left: auto; }
.hosts-slider { width: 140px; }
.hosts-slider-value { font-weight: 700; color: var(--fleet-black); min-width: 24px; text-align: right; }

/* ── Release (RSS) cards in the timeline ── */
.release-card {
  display: flex; align-items: baseline; gap: 8px;
  background: var(--fleet-off-white); border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large); padding: 8px 14px; margin-bottom: 8px;
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black);
  flex-wrap: wrap;
}
.release-name { font-weight: 500; }
.platform-tag { font-size: 10px; text-transform: uppercase; padding: 1px 6px; border-radius: var(--radius-full); background: var(--fleet-off-white); color: var(--fleet-black-75); }
.platform-tag.platform-mac, .platform-tag.platform-darwin { background: var(--fleet-accent-indigo-light); color: var(--fleet-accent-indigo); }
.platform-tag.platform-windows { background: var(--fleet-accent-blue-light); color: var(--fleet-accent-blue); }
.platform-tag.platform-linux { background: var(--status-good-bg); color: var(--status-good-text); }
.release-versions { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-75); white-space: nowrap; }
.release-versions .ver-arrow { margin: 0 4px; color: var(--fleet-black-50); }
.release-time { font-size: var(--font-size-xs); color: var(--fleet-black-50); margin-left: auto; flex-shrink: 0; }

/* ── Endpoint patch buckets (per-software per-day) ── */
.patch-bucket {
  background: var(--fleet-white); border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large); margin-bottom: 8px; transition: background 150ms, box-shadow 150ms, border-color 150ms;
}
.patch-bucket.highlighted { box-shadow: 0 0 0 3px var(--info-tint); border-color: var(--fleet-vibrant-blue); background: var(--info-tint-soft); }
.patch-bucket-row {
  display: grid; align-items: center;
  grid-template-columns: 16px auto 1fr auto auto auto auto;
  gap: 9px;
  padding: 9px 13px;
  cursor: pointer;
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black);
}
.patch-bucket-row:hover { background: var(--fleet-off-white); }
.patch-bucket.expanded .patch-bucket-row { border-bottom: 1px solid var(--fleet-black-5); }
.patch-bucket-caret { font-size: 10px; color: var(--fleet-black-50); text-align: center; }
.patch-bucket-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.patch-bucket-versions { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
.patch-bucket-versions .ver-arrow { margin: 0 4px; }
.patch-bucket-hosts { font-size: var(--font-size-xs); color: var(--fleet-black-75); white-space: nowrap; }
.patch-bucket-transitions, .patch-bucket-lag { font-size: var(--font-size-xs); color: var(--fleet-black-50); white-space: nowrap; }
.patch-bucket-drilldown { padding: 10px 14px; background: var(--info-tint-soft); }
.patch-bucket-summary {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  padding: 5px 7px; margin-bottom: 8px;
  background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large);
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--fleet-black);
}
.patch-bucket-summary strong { color: var(--fleet-black); font-weight: 700; }
.patch-bucket-summary-meta { font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.patch-bucket-distinct { color: var(--fleet-black-50); margin-left: 4px; }
.patch-bucket-loading { font-size: var(--font-size-xs); color: var(--fleet-black-50); padding: 4px 0; }

/* Drill-down micro-table — table spec: off-white 12px/700 navy header,
   14px body, 10px/16px cells, black-10 dividers, rounded bordered wrapper.
   Mono ONLY on version cells. */
.drilldown-table-wrap { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); overflow: hidden; }
.drilldown-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: 14px; }
.drilldown-table th { text-align: left; padding: 10px 16px; background: var(--fleet-off-white); color: var(--fleet-black); font-size: 12px; font-weight: 700; border-bottom: 1px solid var(--fleet-black-10); }
.drilldown-table td { padding: 10px 16px; color: var(--fleet-black-75); border-bottom: 1px solid var(--fleet-black-10); }
.drilldown-table tbody tr:last-child td { border-bottom: 0; }
.drilldown-table td.mono { font-family: var(--font-mono); font-size: 12px; white-space: nowrap; }
.drilldown-table td.target-cell { font-weight: 600; color: var(--fleet-black); }
.drilldown-table td.from-cell { color: var(--fleet-black-50); }
.drilldown-table tr.target-group-start td { border-top: 2px solid var(--fleet-black-10); }

@media (max-width: 900px) {
  .patch-bucket-row { grid-template-columns: 16px auto 1fr auto; }
  .patch-bucket-versions, .patch-bucket-transitions, .patch-bucket-lag { display: none; }
}
/* ─── Briefing hero (4a chain) ─────────────────── */
.go-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}

.hero-eyebrow {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 56px; font-weight: 700; line-height: 0.9; }
.hero-count--muted { color: var(--fleet-black-50); }
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
.hero-up { color: var(--status-good-soft); }
.hero-down { color: #ff9a9a; }
.hero-chip {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.1);
  color: var(--fleet-black-10);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.go-hero .hero-narrative {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 1px solid var(--fleet-blue);
  padding-left: 40px;
}
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hl-critical { color: #ff9a9a; }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }

.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-base);
}
.hero-rail-row--bad { background: rgba(235, 67, 67, 0.16); }
.hero-rail-row--dim { opacity: 0.6; }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }
.hero-rail-tiers { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); cursor: help; }

/* ─── Hero MTTP strip → /patch-velocity ─────────── */
.hero-mttp-strip {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--fleet-blue);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-33);
}
.hero-mttp-link {
  color: var(--status-good-soft);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.hero-mttp-link:hover { text-decoration: underline; }

/* ─── Why — what moved the score ────────────────── */
.why-section {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large) var(--pad-xlarge);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.why-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.why-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.why-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); text-align: right; }
.why-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--pad-large); align-items: start; }
.why-col { display: flex; flex-direction: column; gap: 8px; }
.why-col-label {
  font-size: var(--font-size-xxsmall);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.why-chain {
  padding: 10px 12px;
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-medium);
  cursor: pointer;
  transition: border-color 120ms ease;
}
.why-chain:hover { border-color: var(--fleet-green); }
.why-chain-main { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.why-chain-sw { font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.why-chain-delta { font-size: var(--font-size-base); font-weight: 700; }
.why-chain .hero-up { color: var(--status-good); }
.why-chain .hero-down { color: var(--status-critical); }
.why-chain-sub { margin-top: 3px; font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.why-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }
.why-empty-block { font-size: var(--font-size-base); color: var(--fleet-black-50); }

/* ─── Evidence tier chips + chain connectors ────── */
.tier-chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  cursor: help;
}
.tier-chip--verified { background: var(--status-good-bg); color: var(--status-good-text); }
.tier-chip--policy { background: var(--info-tint); color: var(--fleet-info); }
.tier-chip--temporal { background: none; color: var(--fleet-black-50); opacity: 0.75; font-weight: 500; }
.chain-connector {
  margin-top: 8px;
  padding: 7px 12px;
  border-left: 2px solid var(--status-good);
  background: var(--status-good-bg);
  border-radius: 0 var(--radius-medium) var(--radius-medium) 0;
  font-size: var(--font-size-sm);
  color: var(--status-good-text);
  cursor: pointer;
}
.chain-connector:hover { text-decoration: underline; }

/* ─── Per-day / per-commit score deltas ────────── */
.day-delta {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: 700;
}
.day-delta--up { color: var(--status-good); }
.day-delta--down { color: var(--status-critical); }
.day-delta--flat { color: var(--fleet-black-50); }

.commit-regression {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--status-critical-bg);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  text-wrap: pretty;
}
.commit-regression strong { color: var(--status-critical-text); }

@media (max-width: 1100px) {
  .go-hero { grid-template-columns: 1fr; gap: 20px; }
  .go-hero .hero-narrative { border-left: none; padding-left: 0; }
}
</style>
