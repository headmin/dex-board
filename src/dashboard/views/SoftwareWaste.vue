<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="Software waste"
      subtitle="Third-party apps installed but unused — reclaim seats, control cost"
    />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Summary tiles -->
    <section class="section">
      <div class="metrics-row four-col">
        <MetricCard label="Unused seats" :value="summary.unused_seats" :loading="loading"
          subtitle="install-instances unopened 90d+" />
        <MetricCard label="of total seats" :value="summary.total_seats" :loading="loading"
          subtitle="third-party installs" />
        <MetricCard label="% unused" :value="summary.pct_unused" unit="%" :loading="loading" />
        <MetricCard label="Apps with waste" :value="summary.apps_with_waste" :loading="loading" />
      </div>
    </section>

    <!-- Waste leaderboard -->
    <section class="section">
      <SectionHeader
        title="Most-wasted apps"
        caption="Ranked by unused installs (opened 90d+ ago or never). Apple built-ins excluded — these are third-party apps with likely seat/license cost."
      />

      <div v-if="loading" class="sw-loading">Loading…</div>
      <EmptyState v-else-if="!apps.length" small title="No third-party app usage matches the current filter." />
      <div v-else class="sw-table-wrapper">
        <table class="sw-table">
          <thead>
            <tr>
              <th>App</th>
              <th>Category</th>
              <th class="num">Installs</th>
              <th class="num">Unused</th>
              <th class="sw-bar-col">Unused share</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in apps" :key="a.app_name">
              <td class="sw-app">{{ a.app_name }}</td>
              <td class="sw-cat">{{ prettyCategory(a.category) }}</td>
              <td class="num">{{ a.installs }}</td>
              <td class="num"><strong>{{ a.unused_hosts }}</strong></td>
              <td class="sw-bar-col">
                <div class="sw-bar-row">
                  <MeterBar class="sw-bar" height="var(--bar-height)" :value="a.pct_unused" :color="shareColor(a.pct_unused)" />
                  <span class="sw-bar-label">{{ a.pct_unused }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import MeterBar from '../components/base/MeterBar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { useFleetFilter } from '../composables/useFleetFilter'

const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const loading = ref(false)
const summary = ref({})
const apps = ref([])

// "public.app-category.productivity" → "Productivity"
function prettyCategory(c) {
  if (!c) return '—'
  const tail = String(c).split('.').pop() || ''
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : '—'
}
// Unused-share severity thresholds (same bands as the old shareClass).
function shareColor(pct) {
  return pct >= 80 ? 'var(--status-critical)' : pct >= 50 ? 'var(--status-fair)' : 'var(--status-good)'
}

async function load() {
  error.value = null
  loading.value = true
  try {
    const [s, list] = await Promise.all([
      query('firehose.adoption.waste_summary', fp()),
      query('firehose.adoption.license_waste', { ...fp(), minInstalls: 3, limit: 25 }),
    ])
    summary.value = s[0] || {}
    apps.value = list || []
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
}

onMounted(load)
watch(filterParams, load, { deep: true })
</script>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

/* ─── Most-wasted apps table (kept hand-rolled: gauge cells) ─── */
.sw-table-wrapper {
  width: 100%;
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.sw-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: var(--table-font-size);
}
.sw-table th {
  text-align: left;
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  font-size: var(--table-header-font-size);
  color: var(--fleet-black);
  font-weight: 700;
  border-bottom: 1px solid var(--fleet-black-10);
  background: var(--fleet-off-white);
  white-space: nowrap;
}
.sw-table td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  color: var(--fleet-black-75);
  border-bottom: 1px solid var(--fleet-black-10);
  vertical-align: middle;
}
.sw-table tr:last-child td { border-bottom: none; }
.sw-table tbody tr:hover td { background: var(--fleet-off-white); }
.sw-app { font-weight: 500; color: var(--fleet-black); }
.sw-cat { color: var(--fleet-black-50); font-size: var(--font-size-xs); }
.num { text-align: right; }

.sw-bar-col { width: 200px; }
.sw-bar-row { display: flex; align-items: center; gap: 10px; }
.sw-bar { flex: 1; }
.sw-bar-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-75);
  min-width: 38px;
  text-align: right;
}

.sw-loading {
  text-align: center;
  color: var(--fleet-black-50);
  font-style: italic;
  padding: 28px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
</style>
