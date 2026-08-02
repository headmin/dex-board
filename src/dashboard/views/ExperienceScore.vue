<template>
  <div class="experience-score page-stack">
    <!-- ─── Page Header with Time Range ────────────────────── -->
    <PageHeader title="Experience score" subtitle="Fleet-wide digital employee experience">
      <template #actions>
        <div class="time-range-group">
          <TimeRangeFilter />
          <span class="time-range-hint" title="The time range only changes the charts further down — grade distribution, the breakdowns, biggest movers and the host list — which show hosts that checked in during the selected window. The scores at the top (composite, the category cards and the exposure tile) always show each host's most recent reading, so they don't change when you switch the range.">
            ⓘ affects the charts below, not the top scores
          </span>
        </div>
        <div class="comparison-label">
          tiles show Δ vs {{ tileDeltaLabel }} · 30-day trend
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

    <!-- ─── Fleet Composite Grade Hero ─────────────────────── -->
    <FleetScoreHero
      :fleet="fleet"
      :delta="tileDeltas.composite"
      :loading="loading.fleet"
    />

    <!-- ─── Endpoint security-exposure delta (board callout, selectable window) ── -->
    <ExposureCallout
      v-model:exposureDays="exposureDays"
      :exposure-view="exposureView"
      :exposure-signals="exposureSignals"
      :exposure-window-options="exposureWindowOptions"
      :loading="exposureLoading"
    />

    <!-- ─── 30-day fleet composite trend ───────────────────── -->
    <FleetTrendChart :fleet="fleet" />

    <!-- ─── Per-Fleet breakdown ────────────────────────────── -->
    <TeamBreakdown :team-rows="teamRows" />

    <!-- ─── Category Grade Cards ───────────────────────────── -->
    <CategoryGrid
      :categories="categories"
      :tile-deltas="tileDeltas"
      :loading="loading.categories"
      @toggle="toggleSignals"
    />

    <!-- ─── Signal Breakdown (appears when category card clicked) ── -->
    <SignalBreakdown
      :expanded-category="expandedCategory"
      :expanded-category-label="expandedCategoryLabel"
      :signals="signals"
      v-model:showMethodology="showMethodology"
      @close="expandedCategory = null"
    >
      <!-- ─── Software Detail: Patch Velocity + Usage Tables ──── -->
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

    <!-- ─── Biggest Movers (promoted: what changed overnight) ─ -->
    <section class="full-width">
      <BiggestMovers
        title="Biggest movers (7d)"
        :data="movers"
        :loading="loading.movers"
        :fetchDetail="buildMoverDetail"
      />
    </section>

    <!-- ─── Dimension Breakdown (pattern finder) ───────────── -->
    <section class="full-width">
      <DimensionBreakdown
        :data="dimensionData"
        :loading="loading.dimensions"
        @row-click="onDimensionClick"
      />
    </section>

    <!-- ─── Device Scores Table (with inline grade distribution) -->
    <HostScoresTable
      :device-list="deviceList"
      :distribution="distribution"
      :loading="loading.deviceList"
      @inspect-host="inspectHost"
    />
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
import BiggestMovers from '../components/BiggestMovers.vue'
import DimensionBreakdown from '../components/DimensionBreakdown.vue'
import FleetScoreHero from '../components/experience/FleetScoreHero.vue'
import ExposureCallout from '../components/experience/ExposureCallout.vue'
import FleetTrendChart from '../components/experience/FleetTrendChart.vue'
import TeamBreakdown from '../components/experience/TeamBreakdown.vue'
import CategoryGrid from '../components/experience/CategoryGrid.vue'
import SignalBreakdown from '../components/experience/SignalBreakdown.vue'
import SoftwareSignalDetail from '../components/experience/SoftwareSignalDetail.vue'
import HostScoresTable from '../components/experience/HostScoresTable.vue'

const router = useRouter()
function inspectHost(hostId) {
  if (!hostId) return
  router.push({ path: '/hosts', query: { hostId } })
}

const { filterParams, setOSFilter, setModelFilter, setRAMFilter } = useFleetFilter()
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
  loading: exposureLoading,
  exposureWindowOptions,
  exposureDays,
  exposureSignals,
  exposureView,
  fetchSecurityExposure,
} = useSecurityExposure(snapshotParams)

// ─── Signal Breakdown UI state ────────────────────────────────
const expandedCategory = ref(null)
const showMethodology = ref(false)

const expandedCategoryLabel = computed(() => {
  const cat = categories.value.find(c => c.key === expandedCategory.value)
  return cat?.label || ''
})

// ─── Signal Breakdown for Category Drill-down ─────────────────
function toggleSignals(categoryKey) {
  if (expandedCategory.value === categoryKey) {
    expandedCategory.value = null
    signals.value = []
    fetchDistribution(null)  // Reset to composite distribution
    return
  }
  expandedCategory.value = categoryKey
  showMethodology.value = true
  fetchSignals(categoryKey)
  fetchDistribution(categoryKey)  // Show per-category distribution
}

function onDimensionClick({ dimension, value }) {
  if (dimension === 'os') setOSFilter(value)
  else if (dimension === 'model') setModelFilter(value)
  else if (dimension === 'ram') setRAMFilter(value)
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
.comparison-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
  font-style: italic;
}

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

.full-width {
  width: 100%;
}
</style>
