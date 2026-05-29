<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Hardware lifecycle</h1>
      <span class="subtitle">Refresh &amp; upgrade candidates from endpoint telemetry — plan smarter investments</span>
    </header>

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
      <div class="metrics-row four-col reason-row">
        <MetricCard label="Battery: replace" :value="summary.battery_replace" :loading="loading" />
        <MetricCard label="8GB RAM" :value="summary.low_ram" :loading="loading" />
        <MetricCard label="Aging CPU (Intel)" :value="summary.aging_cpu" :loading="loading" />
        <MetricCard label="Apple-silicon hosts" :value="appleHosts" :loading="loading" />
      </div>
    </section>

    <!-- Candidate list -->
    <section class="section">
      <div class="section-header-with-caption">
        <h2>Refresh shortlist</h2>
        <span class="section-caption">
          Ranked by refresh score — battery health, CPU age, RAM tier and sustained swap pressure.
          Procurement, warranty and cost live outside this view.
        </span>
      </div>

      <div v-if="loading" class="lc-empty">Loading…</div>
      <div v-else-if="!candidates.length" class="lc-empty">No hosts match the current filter.</div>
      <table v-else class="lc-table">
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
            <td class="mono">{{ cpuLabel(h.cpu_class) }}</td>
            <td class="num mono">{{ h.ram_gb }}GB</td>
            <td>
              <span class="lc-badge" :class="batteryClass(h.battery_health_score)">
                {{ h.battery_health_score || '—' }}<template v-if="h.battery_health_pct"> · {{ Math.round(h.battery_health_pct) }}%</template>
              </span>
            </td>
            <td>
              <span v-for="r in reasons(h)" :key="r.label" class="lc-badge" :class="`sev-${r.sev}`">{{ r.label }}</span>
              <span v-if="!reasons(h).length" class="lc-none">—</span>
            </td>
            <td class="num">
              <span class="lc-score" :class="scoreClass(h.refresh_score)">{{ h.refresh_score }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
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
function batteryClass(s) {
  return s === 'replace' ? 'sev-high' : s === 'degraded' ? 'sev-mid' : 'sev-ok'
}
function scoreClass(n) {
  return n >= 40 ? 'sev-high' : n >= 20 ? 'sev-mid' : 'sev-ok'
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
.reason-row { margin-top: var(--pad-medium); }
.section-header-with-caption { margin-bottom: var(--pad-medium); }
.section-caption { display: block; font-size: var(--font-size-sm); color: var(--fleet-black-50); margin-top: 2px; }

.lc-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); overflow: hidden; }
.lc-table th { text-align: left; padding: 10px 14px; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--fleet-black-10); background: var(--fleet-off-white); }
.lc-table td { padding: 8px 14px; color: var(--fleet-black-75); border-bottom: 1px solid var(--fleet-black-5); vertical-align: middle; }
.lc-table tr:last-child td { border-bottom: none; }
.lc-table tr:hover td { background: var(--fleet-off-white); }
.lc-host { font-weight: 500; color: var(--fleet-black); }
.num { text-align: right; }
.mono { font-family: var(--font-mono); }

.lc-badge { display: inline-block; font-family: var(--font-mono); font-size: var(--font-size-xs); font-weight: 600; padding: 1px 7px; border-radius: var(--radius-sm, 4px); margin-right: 4px; }
.sev-ok { background: #e8f8f0; color: #1a7a4c; }
.sev-mid { background: #fef9e8; color: #9a7b1a; }
.sev-high { background: #fdecec; color: #b3261e; }
.lc-none { color: var(--fleet-black-25); }

.lc-score { font-family: var(--font-mono); font-weight: 700; padding: 1px 8px; border-radius: var(--radius-sm, 4px); }
.lc-empty { text-align: center; font-family: var(--font-mono); color: var(--fleet-black-50); font-style: italic; padding: 28px; background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); }
</style>
