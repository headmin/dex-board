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

    <!-- Overview Metrics -->
    <section class="section">
      <SectionHeader title="Activity overview" />
      <div class="metrics-row four-col">
        <MetricCard label="Total events" :value="overview.totalEvents" :loading="loading.overview" />
        <MetricCard label="Unique users" :value="overview.uniqueUsers" :loading="loading.overview" />
        <MetricCard label="Event types" :value="overview.eventTypes" :loading="loading.overview" />
        <MetricCard label="Peak hour events" :value="overview.peakHourEvents" :loading="loading.overview" />
      </div>
    </section>

    <!-- Activity Timeline -->
    <section v-if="!noData" class="section">
      <SectionHeader title="Activity timeline" />
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
        <PieChart
          title="Event type breakdown"
          :data="typeBreakdown"
          :loading="loading.details"
          nameKey="event_type"
          valueKey="count"
        />
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
      <DataTable
        title="Recent events"
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
import PieChart from '../components/PieChart.vue'
import BarChart from '../components/BarChart.vue'
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
</style>
