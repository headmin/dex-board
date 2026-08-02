<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Software waste</h1>
      <span class="subtitle">Third-party apps installed but unused — reclaim seats, control cost</span>
    </header>

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
      <div class="section-header-with-caption">
        <h2>Most-wasted apps</h2>
        <span class="section-caption">
          Ranked by unused installs (opened 90d+ ago or never). Apple built-ins excluded —
          these are third-party apps with likely seat/license cost.
        </span>
      </div>

      <div v-if="loading" class="sw-empty">Loading…</div>
      <div v-else-if="!apps.length" class="sw-empty">No third-party app usage matches the current filter.</div>
      <table v-else class="sw-table">
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
            <td class="num mono">{{ a.installs }}</td>
            <td class="num mono"><strong>{{ a.unused_hosts }}</strong></td>
            <td class="sw-bar-col">
              <div class="sw-bar-row">
                <div class="sw-bar-track">
                  <div class="sw-bar-fill" :class="shareClass(a.pct_unused)" :style="{ width: a.pct_unused + '%' }"></div>
                </div>
                <span class="sw-bar-label">{{ a.pct_unused }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
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
function shareClass(pct) {
  return pct >= 80 ? 'sev-high' : pct >= 50 ? 'sev-mid' : 'sev-ok'
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
.section-header-with-caption { margin-bottom: var(--pad-medium); }
.section-caption { display: block; font-size: var(--font-size-sm); color: var(--fleet-black-50); margin-top: 2px; }

.sw-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); overflow: hidden; }
.sw-table th { text-align: left; padding: 10px 14px; font-size: var(--font-size-sm); color: var(--fleet-black-75); font-weight: 600; border-bottom: 1px solid var(--fleet-black-10); background: var(--fleet-off-white); }
.sw-table td { padding: 8px 14px; color: var(--fleet-black-75); border-bottom: 1px solid var(--fleet-black-5); vertical-align: middle; }
.sw-table tr:last-child td { border-bottom: none; }
.sw-table tr:hover td { background: var(--fleet-off-white); }
.sw-app { font-weight: 500; color: var(--fleet-black); }
.sw-cat { color: var(--fleet-black-50); font-size: var(--font-size-xs); }
.num { text-align: right; }
.mono { font-family: var(--font-mono); }

.sw-bar-col { width: 200px; }
.sw-bar-row { display: flex; align-items: center; gap: 10px; }
.sw-bar-track { position: relative; flex: 1; height: var(--gauge-track-height); background: var(--fleet-black-10); border-radius: var(--radius-full); overflow: hidden; }
.sw-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: var(--radius-full); }
.sw-bar-label { font-size: var(--font-size-xs); font-weight: 600; color: var(--fleet-black-75); min-width: 38px; text-align: right; }
.sev-ok { background: var(--status-good); }
.sev-mid { background: var(--status-fair); }
.sev-high { background: var(--status-critical); }

.sw-empty { text-align: center; color: var(--fleet-black-50); font-style: italic; padding: 28px; background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); }
</style>
