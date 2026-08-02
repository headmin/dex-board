<template>
  <div class="experience-score page-stack">
    <!-- ─── Page Header with Time Range ────────────────────── -->
    <PageHeader title="Experience score" :subtitle="pageSubtitle">
      <template #actions>
        <div class="time-range-group">
          <TimeRangeFilter />
          <span class="time-range-hint" title="The time range only changes the sections further down — what moved, cohorts, movers and the host list — which show hosts that checked in during the selected window. The composite and category scores always show each host's most recent reading, so they don't change when you switch the range.">
            ⓘ affects the sections below, not the scores
          </span>
        </div>
        <div class="header-buttons">
          <a :href="fleetManageLink" target="_blank" rel="noopener" class="header-btn-link">
            <BaseButton variant="secondary">Open in Fleet ↗</BaseButton>
          </a>
          <BaseButton variant="primary" @click="exportBriefing">Save briefing</BaseButton>
        </div>
      </template>
    </PageHeader>

    <!-- ─── Scoring readiness warning (SETUP.md §3.2a) ──────── -->
    <div v-if="missingSignals.length" class="readiness-banner">
      <strong>Scoring signals missing:</strong>
      {{ missingSignals.join(', ') }} — these tables are empty, so the affected
      categories default to "average" instead of real data. Check that the
      upstream DEX query pack is applied and its schedules are enabled
      (SETUP.md §3.1–3.2).
    </div>

    <!-- ─── Answer — the briefing hero ──────────────────────── -->
    <AnswerHero
      :fleet="fleet"
      :tile-deltas="tileDeltas"
      :categories="categories"
      :exposure-view="exposureView"
      :exposure-days="exposureDays"
      :delta-label="tileDeltaLabel"
      :distribution="distribution"
      :device-list="deviceList"
    />

    <!-- ─── Why — where the points are going ────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Why — where the points are going</h2>
        <span class="grammar-hint">Click a category to expand its signals</span>
      </div>
      <CategoryGrid
        :categories="categories"
        :tile-deltas="tileDeltas"
        :expanded-category="expandedCategory"
        :loading="loading.categories"
        @toggle="toggleSignals"
      />
      <SignalBreakdown
        :expanded-category="expandedCategory"
        :expanded-category-label="expandedCategoryLabel"
        :category="expandedCategoryObj"
        :signals="signals"
        v-model:showMethodology="showMethodology"
        @close="expandedCategory = null"
      >
        <SoftwareSignalDetail
          v-if="expandedCategory === 'software'"
          :patch-stats="patchStats"
          :most-used-apps="mostUsedApps"
          :least-used-apps="leastUsedApps"
          :software-patch-movers="softwarePatchMovers"
          :patch-trend-view="patchTrendView"
          :drill-app="drillApp"
          :drill-devices="drillDevices"
          :drill-loading="drillLoading"
          @toggle-app-drill="toggleAppDrill"
        />
      </SignalBreakdown>
    </section>

    <!-- ─── Who — which cohorts carry the loss ──────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Who — which cohorts carry the loss</h2>
      </div>
      <div class="who-grid">
        <CohortCard :team-rows="teamRows" :dimension-data="dimensionData" />
        <BiggestMovers
          title="Biggest movers (7d)"
          :data="movers"
          :loading="loading.movers"
          :fetchDetail="buildMoverDetail"
        />
      </div>
    </section>

    <!-- ─── Act — hosts needing attention ───────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — hosts needing attention</h2>
        <router-link to="/hosts" class="grammar-link">See all {{ fleet.deviceCount || '' }} hosts →</router-link>
      </div>
      <HostScoresTable
        :device-list="deviceList"
        :distribution="distribution"
        :loading="loading.deviceList"
        @inspect-host="inspectHost"
      />
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useTimeRange } from '../composables/useTimeRange'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'
import { useExperienceScore } from '../composables/useExperienceScore'
import { useSignalDetails } from '../composables/useSignalDetails'
import { useSecurityExposure } from '../composables/useSecurityExposure'
import TimeRangeFilter from '../components/TimeRangeFilter.vue'
import PageHeader from '../components/base/PageHeader.vue'
import BaseButton from '../components/base/BaseButton.vue'
import BiggestMovers from '../components/BiggestMovers.vue'
import { useAppConfig } from '../composables/useAppConfig'
import { buildBriefingHtml, downloadBriefing } from '../composables/useBriefingExport'
import AnswerHero from '../components/experience/AnswerHero.vue'
import CategoryGrid from '../components/experience/CategoryGrid.vue'
import SignalBreakdown from '../components/experience/SignalBreakdown.vue'
import SoftwareSignalDetail from '../components/experience/SoftwareSignalDetail.vue'
import CohortCard from '../components/experience/CohortCard.vue'
import HostScoresTable from '../components/experience/HostScoresTable.vue'

const router = useRouter()
function inspectHost(hostId) {
  if (!hostId) return
  router.push(`/hosts/${hostId}`)
}

const { config } = useAppConfig()
const fleetManageLink = computed(() => `${(config.value.fleetUrl || '').replace(/\/$/, '')}/hosts/manage`)

function exportBriefing() {
  const html = buildBriefingHtml({
    fleet: fleet.value,
    tileDeltas: tileDeltas.value,
    categories: categories.value,
    exposureView: exposureView.value,
    distribution: distribution.value,
    deviceList: deviceList.value,
    movers: movers.value,
    teamRows: teamRows.value,
    deltaLabel: tileDeltaLabel.value,
  })
  downloadBriefing(html)
}

const { filterParams } = useFleetFilter()
const { wcMode } = useWorkersCouncil()
const { timeRangeHours, selectedRange } = useTimeRange()

// ─── Query params (replaces all SQL fragment computeds) ───────
// Drill-downs (grade distribution, dimensions, biggest movers, device list)
// are scoped to hosts active in the selected window, so they carry timeRange.
const queryParams = computed(() => ({
  timeRange: timeRangeHours.value,
  ...filterParams.value
}))
// Snapshot cards (composite, categories, exposure, per-fleet) reflect each
// host's latest snapshot and ignore the time range — filter-only params so a
// range switch never reloads them.
const snapshotParams = computed(() => ({ ...filterParams.value }))

const tileDeltaLabel = computed(() => {
  const labels = { '1h': '1h ago', '6h': '6h ago', '1d': '1d ago', '7d': '7d ago', '30d': '30d ago' }
  return labels[selectedRange.value] || 'window start'
})

// "updated HH:MM UTC" in the subtitle — stamped when a fetch cycle lands.
const updatedAt = ref(null)
const pageSubtitle = computed(() => {
  const base = 'Fleet-wide digital employee experience'
  if (!updatedAt.value) return base
  const hh = String(updatedAt.value.getUTCHours()).padStart(2, '0')
  const mm = String(updatedAt.value.getUTCMinutes()).padStart(2, '0')
  return `${base} · updated ${hh}:${mm} UTC`
})

// ─── Data layer (see composables for the query wiring) ────────
const {
  loading,
  fleet,
  tileDeltas,
  categories,
  distribution,
  movers,
  dimensionData,
  deviceList,
  teamRows,
  missingSignals,
  fetchFleetScore,
  fetchCategoryScores,
  fetchTileDeltas,
  fetchDistribution,
  fetchMovers,
  fetchDimensions,
  fetchDeviceList,
  fetchTeamBreakdown,
  fetchReadiness,
  buildMoverDetail,
} = useExperienceScore({ queryParams, snapshotParams, timeRangeHours, wcMode })

const {
  signals,
  patchStats,
  mostUsedApps,
  leastUsedApps,
  softwarePatchMovers,
  patchTrendView,
  drillApp,
  drillDevices,
  drillLoading,
  fetchSignals,
  toggleAppDrill,
} = useSignalDetails()

const {
  exposureDays,
  exposureView,
  fetchSecurityExposure,
} = useSecurityExposure(snapshotParams)

// ─── Signal Breakdown UI state ────────────────────────────────
const expandedCategory = ref(null)
const showMethodology = ref(false)

const expandedCategoryObj = computed(() =>
  categories.value.find(c => c.key === expandedCategory.value) || null
)
const expandedCategoryLabel = computed(() => expandedCategoryObj.value?.label || '')

// ─── Signal Breakdown for Category Drill-down ─────────────────
function toggleSignals(categoryKey) {
  if (expandedCategory.value === categoryKey) {
    expandedCategory.value = null
    signals.value = []
    fetchDistribution(null)  // Reset to composite distribution
    return
  }
  expandedCategory.value = categoryKey
  showMethodology.value = false
  fetchSignals(categoryKey)
  fetchDistribution(categoryKey)  // Show per-category distribution
}

// ─── Fetch All Data ───────────────────────────────────────────
function fetchAll() {
  fetchFleetScore()
  fetchCategoryScores()
  fetchSecurityExposure()
  fetchTileDeltas()
  fetchDrillDowns()
  fetchTeamBreakdown()
  fetchReadiness()
  updatedAt.value = new Date()
}

// Time-range-scoped views only: refetch these (and nothing else) when the user
// switches the range, so the snapshot cards above don't flicker.
function fetchDrillDowns() {
  fetchDistribution(expandedCategory.value)
  fetchMovers()
  fetchDimensions()
  fetchDeviceList()
}

// Filter changes affect every cohort → refetch everything.
watch(filterParams, () => {
  fetchAll()
}, { deep: true })

// Time-range changes only scope the drill-downs → refetch just those. The
// composite/category/exposure cards reflect each host's latest snapshot and
// don't depend on the range, so they stay put (no reload, no flicker).
watch(selectedRange, () => {
  fetchTileDeltas()
  fetchDrillDowns()
})

onMounted(() => {
  fetchAll()
})
</script>

<style scoped>
/* column layout + gap come from the shared .page-stack class */
.experience-score {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-large);
}

/* ─── Page header extras (inside PageHeader's actions slot) ── */
.time-range-group {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.time-range-hint {
  font-size: 10px;
  color: var(--fleet-black-50);
  font-style: italic;
  cursor: help;
}

.header-buttons {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}
.header-btn-link { text-decoration: none; }

/* ─── Scoring readiness warning ───────────────── */
.readiness-banner {
  background: var(--status-fair-bg);
  border: 1px solid var(--fleet-yellow-banner-outline);
  border-radius: var(--radius-large);
  padding: var(--pad-smedium) var(--pad-medium);
  margin-bottom: var(--pad-medium);
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
}

/* ─── Grammar sections: Answer → Why → Who → Act ── */
.grammar-section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-smedium);
}

.grammar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.grammar-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--fleet-black);
}

.grammar-hint {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
}

.grammar-link {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--fleet-green);
  text-decoration: none;
}
.grammar-link:hover { color: var(--fleet-green-over); }

.who-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pad-medium);
  align-items: start;
}

@media (max-width: 1024px) {
  .who-grid { grid-template-columns: 1fr; }
}
</style>
