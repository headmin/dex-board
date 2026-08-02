<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="Lifecycle"
      subtitle="Refresh & upgrade candidates from endpoint telemetry — plan smarter investments"
    />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Summary tiles -->
    <section class="section">
      <div class="metrics-row four-col">
        <MetricCard label="Hosts assessed" :value="summary.total_hosts" :loading="loading" />
        <MetricCard label="Refresh candidates" :value="groupCount('refresh')" :loading="loading"
          subtitle="old silicon + sustained strain" />
        <MetricCard label="Investigate" :value="groupCount('investigate')" :loading="loading"
          subtitle="current silicon, sustained strain" />
        <MetricCard label="Watch" :value="groupCount('watch')" :loading="loading"
          subtitle="signals, not sustained" />
      </div>
      <div class="metrics-row four-col">
        <MetricCard label="Battery: replace" :value="summary.battery_replace" :loading="loading" />
        <MetricCard label="8GB RAM" :value="summary.low_ram" :loading="loading" />
        <MetricCard label="Aging CPU (Intel)" :value="summary.aging_cpu" :loading="loading" />
        <MetricCard label="Severe swap strain" :value="summary.swap_strain" :loading="loading"
          subtitle="under-powered for workload" />
      </div>
    </section>

    <!-- Candidate list -->
    <section class="section">
      <SectionHeader
        title="Refresh shortlist"
        caption="Ranked by refresh score — battery health, CPU age, RAM tier and sustained swap pressure. Procurement, warranty and cost live outside this view."
      />

      <div v-if="loading" class="lc-loading">Loading…</div>
      <EmptyState v-else-if="!visibleCount" small title="No hosts with refresh signals match the current filter." />
      <div v-else class="lc-table-wrapper">
        <table class="lc-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Model</th>
              <th>CPU</th>
              <th>Chip age</th>
              <th class="num">RAM</th>
              <th>Battery</th>
              <th>Signals</th>
              <th class="num">Score</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody v-for="g in verdictGroups" :key="g.key">
            <tr class="lc-group-row">
              <td colspan="9">
                <span class="lc-group-label" :class="`lc-group-label--${g.tone}`">{{ g.label }}</span>
                <span class="lc-group-count">{{ g.rows.length }} host{{ g.rows.length === 1 ? '' : 's' }}</span>
                <span class="lc-group-hint">{{ g.hint }}</span>
              </td>
            </tr>
            <tr v-for="h in g.rows" :key="h.host_id">
              <td class="lc-host">{{ displayHost(h) }}</td>
              <td class="mono">{{ h.hardware_model }}</td>
              <td>{{ cpuLabel(h.cpu_class) }}</td>
              <td>
                <span v-if="chipInfo(h.cpu_class)" class="lc-age" :class="`lc-age--${ageTone(chipInfo(h.cpu_class).gensBehind)}`"
                  :title="`${chipInfo(h.cpu_class).gensBehind} generation(s) behind current — host is at least ${new Date().getFullYear() - chipInfo(h.cpu_class).year} years old`">
                  {{ chipInfo(h.cpu_class).year }} · {{ chipInfo(h.cpu_class).gensBehind }} gens
                </span>
                <span v-else class="lc-none">—</span>
              </td>
              <td class="num">{{ h.ram_gb }}GB</td>
              <td>
                <Badge :tone="batteryTone(h.battery_health_score)">
                  {{ h.battery_health_score || '—' }}<template v-if="h.battery_health_pct"> · {{ Math.min(100, Math.round(h.battery_health_pct)) }}%</template>
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
              <td>
                <span class="lc-verdict" :title="verdictTitle(h)">
                  <Badge :tone="hostVerdict(h).tone" :label="hostVerdict(h).label" />
                  <span v-if="h.days_reporting_30d >= 5" class="lc-verdict-days">{{ h.days_pressured_30d }}/{{ h.days_reporting_30d }}d</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!loading && hiddenHealthy > 0" class="lc-hidden-note">
        {{ hiddenHealthy }} host{{ hiddenHealthy === 1 ? '' : 's' }} healthy — no refresh signals (hidden)
      </p>
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
import { chipInfo, ageTone, verdictFor } from '../composables/chipAge'

const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const loading = ref(false)
const summary = ref({})
const candidates = ref([])

function cpuLabel(c) {
  if (!c) return '—'
  return c.replace('apple_', 'Apple ').replace('intel_', 'Intel ').toUpperCase().replace('APPLE ', 'Apple ').replace('INTEL ', 'Intel ')
}
// Chip age context + the refresh decision quadrant (perf x silicon age):
// weak on OLD silicon -> replace; weak on NEW silicon -> investigate first.
function hostVerdict(h) {
  const info = chipInfo(h.cpu_class)
  // refresh_score is inverted (higher = more refresh-worthy); the 30d
  // pressure persistence keeps one bad day from nominating a device.
  // Sustained SEVERE swap counts as weakness on its own — a new machine
  // can be drowning while its score sits below the 30 threshold.
  return verdictFor(Number(h.refresh_score) >= 30, info?.gensBehind ?? null, {
    weakDays: Number(h.days_pressured_30d) || 0,
    reportDays: Number(h.days_reporting_30d) || 0,
    severeDays: Number(h.days_severe_30d) || 0,
  })
}

function verdictTitle(h) {
  const d = Number(h.days_pressured_30d) || 0
  const s = Number(h.days_severe_30d) || 0
  const r = Number(h.days_reporting_30d) || 0
  return `Memory-pressured on ${d} of ${r} reporting days (${s} severe) — 30d window`
}

// ─── Verdict-grouped shortlist ────────────────────────────────
// The ranked list reads as "everything here should be replaced" unless the
// verdict does the grouping: refresh candidates first, then new-but-strained
// (investigate), then watch, then old-but-fine. Healthy hosts with no
// signals are hidden entirely (count shown below the table).
const GROUP_META = [
  { key: 'refresh', label: 'Refresh candidates', tone: 'critical', hint: 'old silicon + sustained strain — replacement is the fix' },
  { key: 'investigate', label: 'Investigate', tone: 'fair', hint: 'current silicon under sustained strain — fix the workload or spec, not the device age' },
  { key: 'watch', label: 'Watch', tone: 'fair', hint: 'signals present but not sustained — recheck next cycle' },
  { key: 'defer', label: 'Defer OK', tone: 'good', hint: 'aging silicon holding up fine — no action needed yet' },
]

const verdictGroups = computed(() => {
  const byKey = new Map(GROUP_META.map(g => [g.key, { ...g, rows: [] }]))
  for (const h of candidates.value) {
    const v = hostVerdict(h)
    byKey.get(v.key)?.rows.push(h)
  }
  return GROUP_META.map(g => byKey.get(g.key)).filter(g => g.rows.length)
})

const visibleCount = computed(() => verdictGroups.value.reduce((s, g) => s + g.rows.length, 0))
const hiddenHealthy = computed(() => candidates.value.length - visibleCount.value)

function groupCount(key) {
  return verdictGroups.value.find(g => g.key === key)?.rows.length || 0
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
.lc-verdict { display: inline-flex; align-items: center; gap: 6px; }
.lc-verdict-days { font-size: var(--font-size-xs); color: var(--fleet-black-50); font-variant-numeric: tabular-nums; }

.lc-age { font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
.lc-age--neutral { color: var(--fleet-black-75); }
.lc-age--fair { color: var(--status-fair-text); }
.lc-age--elevated { color: var(--status-elevated); }
.lc-age--critical { color: var(--status-critical); }

.lc-none { color: var(--fleet-black-25); }

/* ─── Verdict group header rows ───────────────── */
.lc-group-row td {
  background: var(--fleet-off-white);
  padding: 8px var(--table-cell-pad-x);
}
.lc-group-label {
  font-weight: 700;
  font-size: var(--font-size-sm);
}
.lc-group-label--critical { color: var(--status-critical-text); }
.lc-group-label--fair { color: var(--status-fair-text); }
.lc-group-label--good { color: var(--status-good-text); }
.lc-group-count {
  margin-left: 8px;
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  font-variant-numeric: tabular-nums;
}
.lc-group-hint {
  margin-left: 12px;
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  font-style: italic;
}

.lc-hidden-note {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  font-style: italic;
}

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
