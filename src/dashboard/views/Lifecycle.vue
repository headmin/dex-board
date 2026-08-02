<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="Hardware lifecycle"
      subtitle="Refresh & upgrade candidates from endpoint telemetry — plan smarter investments"
    />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Summary tiles -->
    <section class="section">
      <div class="metrics-row four-col">
        <MetricCard label="Hosts assessed" :value="summary.total_hosts" :loading="loading" />
        <MetricCard label="Refresh now" :value="summary.high_priority" :loading="loading"
          subtitle="score ≥ 40" />
        <MetricCard label="Watch" :value="summary.watch" :loading="loading"
          subtitle="score 20–39" />
        <MetricCard label="Severe swap strain" :value="summary.swap_strain" :loading="loading"
          subtitle="under-powered for workload" />
      </div>
      <div class="metrics-row four-col">
        <MetricCard label="Battery: replace" :value="summary.battery_replace" :loading="loading" />
        <MetricCard label="8GB RAM" :value="summary.low_ram" :loading="loading" />
        <MetricCard label="Aging CPU (Intel)" :value="summary.aging_cpu" :loading="loading" />
        <MetricCard label="Apple-silicon hosts" :value="appleHosts" :loading="loading" />
      </div>
    </section>

    <!-- Candidate list -->
    <section class="section">
      <SectionHeader
        title="Refresh shortlist"
        caption="Ranked by refresh score — battery health, CPU age, RAM tier and sustained swap pressure. Procurement, warranty and cost live outside this view."
      />

      <div v-if="loading" class="lc-loading">Loading…</div>
      <EmptyState v-else-if="!candidates.length" small title="No hosts match the current filter." />
      <div v-else class="lc-table-wrapper">
        <table class="lc-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Model</th>
              <th>CPU</th>
              <th class="num">RAM</th>
              <th>Battery</th>
              <th>Signals</th>
              <th class="num">Score</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in candidates" :key="h.host_id">
              <td class="lc-host">{{ displayHost(h) }}</td>
              <td class="mono">{{ h.hardware_model }}</td>
              <td>{{ cpuLabel(h.cpu_class) }}</td>
              <td class="num">{{ h.ram_gb }}GB</td>
              <td>
                <Badge :tone="batteryTone(h.battery_health_score)">
                  {{ h.battery_health_score || '—' }}<template v-if="h.battery_health_pct"> · {{ Math.round(h.battery_health_pct) }}%</template>
                </Badge>
              </td>
              <td>
                <span class="lc-signals">
                  <Badge v-for="r in reasons(h)" :key="r.label" :tone="sevTone[r.sev]" :label="r.label" />
                  <span v-if="!reasons(h).length" class="lc-none">—</span>
                </span>
              </td>
              <td class="num">
                <span class="lc-score" :class="`lc-score--${scoreTone(h.refresh_score)}`">{{ h.refresh_score }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import Badge from '../components/base/Badge.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { useFleetFilter } from '../composables/useFleetFilter'
import { displayHost } from '../composables/displayName'

const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const loading = ref(false)
const summary = ref({})
const candidates = ref([])

const appleHosts = computed(() => {
  const t = Number(summary.value.total_hosts) || 0
  const intel = Number(summary.value.aging_cpu) || 0
  return Math.max(0, t - intel)
})

function cpuLabel(c) {
  if (!c) return '—'
  return c.replace('apple_', 'Apple ').replace('intel_', 'Intel ').toUpperCase().replace('APPLE ', 'Apple ').replace('INTEL ', 'Intel ')
}
// Internal severity keys ('high'/'mid'/'ok') → Badge tones.
const sevTone = { high: 'critical', mid: 'fair', ok: 'good' }
function batteryTone(s) {
  return s === 'replace' ? 'critical' : s === 'degraded' ? 'fair' : 'good'
}
function scoreTone(n) {
  return n >= 40 ? 'critical' : n >= 20 ? 'fair' : 'good'
}
// Reasons mirror the worker's REFRESH_SCORE contributions.
function reasons(h) {
  const out = []
  if (h.battery_health_score === 'replace') out.push({ label: 'Battery EOL', sev: 'high' })
  else if (h.battery_health_score === 'degraded') out.push({ label: 'Battery aging', sev: 'mid' })
  if (/^intel/i.test(h.cpu_class || '')) out.push({ label: 'Aging CPU', sev: 'high' })
  else if (h.cpu_class === 'apple_m1') out.push({ label: 'M1 (older)', sev: 'mid' })
  const ram = String(h.ram_tier || '').toLowerCase()
  if (ram === '8gb') out.push({ label: '8GB RAM', sev: 'high' })
  else if (ram === '16gb') out.push({ label: '16GB RAM', sev: 'mid' })
  if (h.swap_pressure === 'severe') out.push({ label: 'Severe swap', sev: 'high' })
  else if (h.swap_pressure === 'elevated') out.push({ label: 'Elevated swap', sev: 'mid' })
  return out
}

async function load() {
  error.value = null
  loading.value = true
  try {
    const [s, list] = await Promise.all([
      query('firehose.lifecycle.refresh_summary', fp()),
      query('firehose.lifecycle.refresh_candidates', { ...fp(), limit: 200 }),
    ])
    summary.value = s[0] || {}
    candidates.value = list || []
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

/* ─── Refresh shortlist table (kept hand-rolled: multi-badge cells) ─── */
.lc-table-wrapper {
  width: 100%;
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.lc-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: var(--table-font-size);
}
.lc-table th {
  text-align: left;
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  font-size: var(--table-header-font-size);
  color: var(--fleet-black);
  font-weight: 700;
  border-bottom: 1px solid var(--fleet-black-10);
  background: var(--fleet-off-white);
  white-space: nowrap;
}
.lc-table td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  color: var(--fleet-black-75);
  border-bottom: 1px solid var(--fleet-black-10);
  vertical-align: middle;
}
.lc-table tr:last-child td { border-bottom: none; }
.lc-table tbody tr:hover td { background: var(--fleet-off-white); }
.lc-host { font-weight: 700; color: var(--fleet-black); }
.num { text-align: right; }
.mono { font-family: var(--font-mono); }

.lc-signals { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.lc-none { color: var(--fleet-black-25); }

.lc-score { font-family: var(--font-mono); font-weight: 700; }
.lc-score--good { color: var(--status-good); }
.lc-score--fair { color: var(--status-fair-text); }
.lc-score--critical { color: var(--status-critical); }

.lc-loading {
  text-align: center;
  color: var(--fleet-black-50);
  font-style: italic;
  padding: 28px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
</style>
