<template>
  <div class="dashboard page-stack">
    <PageHeader title="Audit log">
      <template #actions>
        <TimeRangeFilter />
      </template>
    </PageHeader>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Premium license notice -->
    <div v-if="!loading.overview && noData" class="info-banner">
      Audit logs require a Fleet Premium license and admin activity in the Fleet UI.
      Once actions occur (login, policy changes, query edits), data will appear here.
    </div>

    <!-- ─── Answer — the accountability hero ────────────────── -->
    <section v-if="!noData" class="au-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">Admin events · window</span>
        <div class="hero-count-row">
          <span class="hero-count">{{ overview.totalEvents.toLocaleString() }}</span>
          <span class="hero-count-of">{{ overview.uniqueUsers }} user{{ overview.uniqueUsers === 1 ? '' : 's' }}</span>
        </div>
        <span class="hero-chip">{{ overview.eventTypes }} event type{{ overview.eventTypes === 1 ? '' : 's' }} · peak {{ overview.peakHourEvents }}/h</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          Every admin action in Fleet is on this page —
          <template v-if="topActor"><span class="hl-good">{{ topActor.share }}%</span> of activity comes from {{ topActor.user_email }}<template v-if="topType"> and the most common action is {{ topTypeLabel }}</template>.</template>
          <template v-else>who did what, and when.</template>
        </p>
        <p class="hero-support">Audit covers admin activity in the Fleet UI/API — not end-user behavior. Host telemetry never appears here.</p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">Most active users</span>
        <div v-if="topUsers.length" class="hero-rail-list">
          <div v-for="u in topUsers.slice(0, 3)" :key="u.user_email" class="hero-rail-row">
            <span class="hero-rail-label">{{ u.user_email }}</span>
            <span class="hero-rail-count">{{ u.count }}</span>
          </div>
        </div>
        <span v-else class="hero-rail-empty">—</span>
      </div>
    </section>

    <!-- Activity Timeline -->
    <section v-if="!noData" class="section">
      <div class="grammar-head">
        <h2 class="grammar-title">Why — when the activity happened</h2>
      </div>
      <TimeSeriesChart
        title="Events per hour"
        :data="timeline"
        :loading="loading.timeline"
        xKey="time"
        yKey="event_count"
        :color="palette.purple"
      />
    </section>

    <!-- Charts Row -->
    <div v-if="!noData" class="charts-row two-col">
      <section class="section">
        <ChartCard title="Event type breakdown" :loading="loading.details" :empty="!typeBreakdown.length">
          <BarList :data="typeBreakdown" nameKey="event_type" valueKey="count" :maxRows="8" />
        </ChartCard>
      </section>
      <section class="section">
        <BarChart
          title="Most active users"
          :data="topUsers"
          :loading="loading.details"
          labelKey="user_email"
          valueKey="count"
        />
      </section>
    </div>

    <!-- Activity Heatmap -->
    <section v-if="!noData" class="section">
      <HeatmapChart
        title="Activity heatmap (day x hour)"
        :data="heatmapData"
        :xLabels="heatmapHours"
        :yLabels="heatmapDays"
        :loading="loading.heatmap"
        :minValue="0"
        :maxValue="heatmapMax"
        :colorRange="['#ebedf0', '#c4b5fd', palette.purple, '#6d28d9', '#4c1d95']"
      />
    </section>

    <!-- Recent Events Table -->
    <section v-if="!noData" class="section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — the event trail</h2>
      </div>
      <DataTable
        :data="recentEvents"
        :columns="eventColumns"
        :loading="loading.details"
      />
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { query } from '../services/api'
import { useTimeRange } from '../composables/useTimeRange'
import { palette } from '../composables/uiPalette'
import TimeRangeFilter from '../components/TimeRangeFilter.vue'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import BarChart from '../components/BarChart.vue'
import ChartCard from '../components/base/ChartCard.vue'
import BarList from '../components/base/BarList.vue'
import HeatmapChart from '../components/HeatmapChart.vue'
import DataTable from '../components/DataTable.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'

const { timeRangeHours } = useTimeRange()
const error = ref(null)

const loading = ref({
  overview: false,
  timeline: false,
  details: false,
  heatmap: false
})

const eventColumns = [
  { key: 'event_time', label: 'Time', type: 'datetime' },
  { key: 'event_type', label: 'Event type' },
  { key: 'user_email', label: 'User' },
  { key: 'detail', label: 'Details' }
]

// ===================== Reactive Data =====================

const overview = ref({ totalEvents: 0, uniqueUsers: 0, eventTypes: 0, peakHourEvents: 0 })
const timeline = ref([])
const typeBreakdown = ref([])
const topUsers = ref([])
const heatmapData = ref([])
const heatmapHours = ref([])
const heatmapDays = ref([])
const heatmapMax = ref(10)
const recentEvents = ref([])

const noData = computed(() => !loading.value.overview && overview.value.totalEvents === 0)

// Hero facts — top actor share and most common event type, all queried.
const topActor = computed(() => {
  const u = topUsers.value[0]
  const total = Number(overview.value.totalEvents) || 0
  if (!u || !total) return null
  return { ...u, share: Math.round((Number(u.count) / total) * 100) }
})
const topType = computed(() => typeBreakdown.value[0] || null)
const topTypeLabel = computed(() =>
  topType.value ? String(topType.value.event_type).replace(/_/g, ' ') : ''
)

// ===================== Fetch Functions =====================

async function fetchOverview() {
  loading.value.overview = true
  try {
    const rows = await query('audit.overview', { timeRange: timeRangeHours.value })
    const r = rows[0] || {}
    overview.value = {
      totalEvents: r.total_events || 0,
      uniqueUsers: r.unique_users || 0,
      eventTypes: r.event_types || 0,
      peakHourEvents: r.peak_hour_events || 0
    }
  } catch (e) {
    error.value = `Overview: ${e.message}`
  } finally {
    loading.value.overview = false
  }
}

async function fetchTimeline() {
  loading.value.timeline = true
  try {
    const rows = await query('audit.timeline', { timeRange: timeRangeHours.value })
    timeline.value = rows
  } catch (e) {
    error.value = `Timeline: ${e.message}`
  } finally {
    loading.value.timeline = false
  }
}

async function fetchDetails() {
  loading.value.details = true
  try {
    const [types, users, events] = await Promise.all([
      query('audit.event_types', { timeRange: timeRangeHours.value }),
      query('audit.top_users', { timeRange: timeRangeHours.value }),
      query('audit.recent_events', { timeRange: timeRangeHours.value })
    ])

    typeBreakdown.value = types
    topUsers.value = users
    recentEvents.value = events
  } catch (e) {
    error.value = `Details: ${e.message}`
  } finally {
    loading.value.details = false
  }
}

async function fetchHeatmap() {
  loading.value.heatmap = true
  try {
    const rows = await query('audit.heatmap', { timeRange: timeRangeHours.value })

    // Build unique days and hours
    const daySet = new Set()
    const hourSet = new Set()
    for (const r of rows) {
      daySet.add(r.day)
      hourSet.add(r.hour)
    }

    const days = [...daySet].sort()
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

    // Build heatmap data: [xIndex, yIndex, value]
    const data = []
    let maxVal = 1
    for (const r of rows) {
      const x = hours.indexOf(`${String(r.hour).padStart(2, '0')}:00`)
      const y = days.indexOf(r.day)
      const val = parseInt(r.cnt)
      if (val > maxVal) maxVal = val
      data.push([x, y, val])
    }

    heatmapHours.value = hours
    heatmapDays.value = days
    heatmapData.value = data
    heatmapMax.value = maxVal
  } catch (e) {
    error.value = `Heatmap: ${e.message}`
  } finally {
    loading.value.heatmap = false
  }
}

async function fetchAll() {
  error.value = null
  await fetchOverview()
  // Only fetch details if there's data
  if (overview.value.totalEvents > 0) {
    await Promise.all([fetchTimeline(), fetchDetails(), fetchHeatmap()])
  }
}

watch(timeRangeHours, () => fetchAll())
onMounted(() => fetchAll())
</script>

<style scoped>
.dashboard {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-xlarge);
}

.info-banner {
  background: var(--fleet-off-white);
  color: var(--fleet-black-75);
  padding: 14px 18px;
  border-radius: var(--radius-large);
  border: 1px solid var(--fleet-black-10);
  font-size: 13px;
  line-height: 1.5;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

/* ─── Briefing hero ────────────────────────────── */
.au-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}
.hero-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 56px; font-weight: 700; line-height: 0.9; }
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
.hero-chip { display: inline-flex; align-self: flex-start; padding: 3px 9px; border-radius: var(--radius); background: rgba(255,255,255,0.1); color: var(--fleet-black-10); font-size: var(--font-size-sm); font-weight: 600; }
.hero-narrative { display: flex; flex-direction: column; gap: 12px; border-left: 1px solid var(--fleet-blue); padding-left: 40px; }
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }
.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.06); border-radius: var(--radius-medium); font-size: var(--font-size-base); }
.hero-rail-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }
.hero-rail-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

.grammar-head { display: flex; align-items: baseline; justify-content: space-between; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }

@media (max-width: 1100px) {
  .au-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
}
</style>
