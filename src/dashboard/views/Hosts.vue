<template>
  <div class="hosts-page page-stack">
    <!-- Compare Mode Overlay -->
    <div v-if="compareMode" class="compare-overlay" @click.self="compareMode = false">
      <div class="compare-panel">
        <HostCompare
          :initialHostId="compareInitialId"
          :devices="compareDevices"
          @close="compareMode = false"
        />
      </div>
    </div>

    <!-- ─── Header ──────────────────────────────────────────── -->
    <div class="hp-header">
      <div>
        <h1 class="hp-title">Hosts</h1>
        <div class="hp-subtitle">Every scored host, worst first{{ updatedLabel }}</div>
      </div>
      <div class="hp-actions">
        <BaseButton variant="secondary" @click="openCompare('')">Compare hosts</BaseButton>
        <a :href="fleetManageLink" target="_blank" rel="noopener" class="hp-btn-link">
          <BaseButton variant="secondary">Open in Fleet ↗</BaseButton>
        </a>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — the population hero ────────────────────── -->
    <section class="hp-hero">
      <div class="hero-scope">
        <span class="hero-eyebrow">Hosts in scope</span>
        <div class="hero-count-row">
          <span class="hero-count">{{ queueRows.length }}</span>
          <span class="hero-count-of">of {{ mergedRows.length }}</span>
        </div>
        <span class="hero-scope-caption">{{ scopeCaption }}</span>
      </div>
      <div class="hero-dist">
        <span class="hero-eyebrow">Grade distribution · whole fleet</span>
        <div v-if="totalGraded" class="hero-dist-bar">
          <div v-for="g in GRADES" :key="g" class="hero-dist-seg" :style="{ width: distPct(g) + '%', background: gradeColor(g) }"></div>
        </div>
        <div v-if="totalGraded" class="hero-dist-counts">
          <span v-for="g in GRADES" :key="g"><strong>{{ gradeCounts[g] || 0 }}</strong> {{ g }}</span>
        </div>
        <span v-else class="hero-scope-caption">No scored hosts in this window</span>
      </div>
      <div class="hero-why">
        <span class="hero-eyebrow">Why hosts score low</span>
        <div v-if="whyRows.length" class="hero-why-list">
          <div v-for="w in whyRows" :key="w.label" class="hero-why-row">
            <span>{{ w.label }}</span>
            <span class="hero-why-count">{{ w.count }}</span>
          </div>
        </div>
        <span v-else class="hero-moved-empty">No hosts below the B line right now</span>
      </div>
    </section>

    <!-- ─── Act — the queue ─────────────────────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — the queue</h2>
        <div class="queue-controls">
          <button
            type="button"
            class="queue-filter-chip"
            :class="{ 'is-active': lowGradesOnly }"
            @click="lowGradesOnly = !lowGradesOnly"
          >Grade D or F</button>
        </div>
      </div>

      <div class="queue-card">
        <div v-if="loading" class="queue-loading">Loading hosts…</div>
        <EmptyState v-else-if="!queueRows.length" small title="No hosts match the current filter." />
        <template v-else>
          <div class="queue-table-wrap">
            <table class="queue-table">
              <thead>
                <tr>
                  <th @click="sortBy('display_name')" class="sortable">Host {{ sortIcon('display_name') }}</th>
                  <th>Model</th>
                  <th @click="sortBy('chip_year')" class="sortable">CPU {{ sortIcon('chip_year') }}</th>
                  <th @click="sortBy('mem_pressure')" class="sortable queue-ram-col">RAM use {{ sortIcon('mem_pressure') }}</th>
                  <th @click="sortBy('rssi')" class="sortable">Wi-Fi {{ sortIcon('rssi') }}</th>
                  <th>Weakest signal</th>
                  <th @click="sortBy('delta7d')" class="sortable num">7d {{ sortIcon('delta7d') }}</th>
                  <th @click="sortBy('composite_score')" class="sortable num">Composite {{ sortIcon('composite_score') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in queueRows" :key="d.host_id" class="queue-row" :title="`Open ${d.display_name} — full host detail`" @click="openHost(d.host_id)">
                  <td>
                    <div class="queue-host">
                      <span class="queue-hostname">{{ d.display_name }}</span>
                      <span v-if="d.team_id" class="queue-host-sub">{{ teamLabel(d.team_id) }}</span>
                    </div>
                  </td>
                  <td class="queue-muted">{{ d.hardware_model || '—' }}</td>
                  <td class="queue-muted">
                    {{ d.cpu_label }}
                    <span v-if="d.chip_year" class="queue-cpu-year" :class="`age--${ageTone(d.gens_behind)}`">{{ d.chip_year }}</span>
                  </td>
                  <td>
                    <div v-if="d.mem_pressure != null" class="queue-ram">
                      <div class="queue-ram-meter">
                        <div class="queue-ram-fill" :style="{ width: Math.min(100, d.mem_pressure) + '%', background: utilizationColor(d.mem_pressure) }"></div>
                      </div>
                      <span class="queue-ram-pct" :style="{ color: utilizationColor(d.mem_pressure) }">{{ Math.round(d.mem_pressure) }}%</span>
                    </div>
                    <span v-else class="queue-none">—</span>
                  </td>
                  <td class="queue-muted queue-nowrap">{{ d.rssi ? `${d.rssi} dBm` : '—' }}</td>
                  <td class="queue-muted">
                    <template v-if="d.weakest">{{ d.weakest.label }} · {{ d.weakest.score }}</template>
                    <template v-else>—</template>
                  </td>
                  <td class="num queue-delta" :class="deltaClass(d.delta7d)">{{ deltaText(d.delta7d) }}</td>
                  <td class="num">
                    <span class="queue-composite">
                      <span class="queue-score">{{ d.composite_score ?? '—' }}</span>
                      <GradeBadge v-if="d.composite_grade" :grade="d.composite_grade" />
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="queue-footer">
            <span>Showing {{ queueRows.length }} of {{ mergedRows.length }} hosts<template v-if="unscored"> · {{ unscored }} without scores in this window</template></span>
            <span class="queue-footer-hint">7d change shown for the {{ moversCovered }} largest movers — others read "—"</span>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { query } from '../services/api'
import BaseButton from '../components/base/BaseButton.vue'
import EmptyState from '../components/base/EmptyState.vue'
import GradeBadge from '../components/GradeBadge.vue'
import HostCompare from '../components/HostCompare.vue'
import { displayHost } from '../composables/displayName'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useSort } from '../composables/useSort'
import { gradeColor } from '../composables/gradeColors'
import { utilizationColor } from '../composables/statusTones'
import { chipInfo, ageTone } from '../composables/chipAge'
import { humanizeToken } from '../composables/humanize'
import { useAppConfig } from '../composables/useAppConfig'

const GRADES = ['A', 'B', 'C', 'D', 'F']

const route = useRoute()
const router = useRouter()
const { config } = useAppConfig()
const { searchText, selectedModel, selectedRAMTier, selectedOS, selectedTeam, filterParams } = useFleetFilter()

const error = ref(null)
const loading = ref(false)
const devices = ref([])
const scores = ref([])
const movers = ref([])
const updatedAt = ref(null)
const lowGradesOnly = ref(false)

const fleetManageLink = computed(() => `${(config.value.fleetUrl || '').replace(/\/$/, '')}/hosts/manage`)
const updatedLabel = computed(() => {
  if (!updatedAt.value) return ''
  const hh = String(updatedAt.value.getUTCHours()).padStart(2, '0')
  const mm = String(updatedAt.value.getUTCMinutes()).padStart(2, '0')
  return ` · updated ${hh}:${mm} UTC`
})

function teamLabel(id) {
  return config.value.teamNames?.[id] || id
}

// ─── Fetch: telemetry list + scores + 7d movers, merged by host ──
async function fetchAll() {
  loading.value = true
  error.value = null
  try {
    const [list, scoreRows, moverRows] = await Promise.all([
      query('firehose.devices.list', { limit: 500 }),
      // 30d window so every scored host appears even if quiet this week.
      query('firehose.scores.device_list', { timeRange: 720, limit: 500, ...filterParams.value }).catch(() => []),
      query('firehose.scores.biggest_movers', { timeRange: 720, limit: 50, ...filterParams.value }).catch(() => []),
    ])
    devices.value = list || []
    scores.value = scoreRows || []
    movers.value = moverRows || []
    updatedAt.value = new Date()
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
}

onMounted(() => {
  // Legacy deep-links (?hostId=<uuid>) land on the host detail page.
  if (route.query.hostId) {
    router.replace(`/hosts/${route.query.hostId}`)
    return
  }
  fetchAll()
})
watch(filterParams, fetchAll, { deep: true })

// ─── Merge ────────────────────────────────────────────────────
const SIGNALS = [
  { key: 'software_score', label: 'Software' },
  { key: 'security_score', label: 'Security' },
  { key: 'performance_score', label: 'Performance' },
  { key: 'device_health_score', label: 'Device health' },
]

function weakestOf(s) {
  let worst = null
  for (const sig of SIGNALS) {
    const v = s?.[sig.key]
    if (v == null || v === '') continue
    const n = Number(v)
    if (!worst || n < worst.score) worst = { label: sig.label, score: n }
  }
  return worst
}

const mergedRows = computed(() => {
  const scoreMap = new Map(scores.value.map(s => [s.host_id, s]))
  const moverMap = new Map(movers.value.map(m => [m.host_id, Number(m.delta)]))
  return devices.value.map(d => {
    const s = scoreMap.get(d.host_id)
    const info = chipInfo(d.cpu_class || s?.cpu_class)
    const memPressure = d.total_memory_mb && d.memory_gb
      ? Math.round((Number(d.total_memory_mb) / (Number(d.memory_gb) * 1024)) * 1000) / 10
      : null
    return {
      ...d,
      display_name: displayHost(d),
      composite_score: s?.composite_score != null ? Number(s.composite_score) : null,
      composite_grade: s?.composite_grade || null,
      weakest: weakestOf(s),
      delta7d: moverMap.get(d.host_id) ?? null,
      mem_pressure: memPressure,
      cpu_label: info?.pretty || humanizeToken(String(d.cpu_class || '')) || d.cpu_brand || '—',
      chip_year: info?.year ?? null,
      gens_behind: info?.gensBehind ?? null,
      team_id: d.team_id || s?.team_id || null,
    }
  })
})

// ─── Scope (global filter bar + local grade chip) ─────────────
const { sortKey, sortAsc, toggleSort, sortRows } = useSort('composite_score', true)

const queueRows = computed(() => {
  let list = mergedRows.value
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    list = list.filter(d =>
      (d.hostname || '').toLowerCase().includes(q) ||
      (d.computer_name || '').toLowerCase().includes(q) ||
      (d.hardware_model || '').toLowerCase().includes(q) ||
      (d.host_id || '').toLowerCase().includes(q)
    )
  }
  if (selectedModel.value) list = list.filter(d => d.hardware_model === selectedModel.value)
  if (selectedOS.value) list = list.filter(d => (d.platform || '') === selectedOS.value)
  if (selectedTeam.value) list = list.filter(d => d.team_id === selectedTeam.value)
  if (selectedRAMTier.value) {
    const ramVal = selectedRAMTier.value
    list = list.filter(d => {
      const gb = Number(d.memory_gb) || 0
      if (ramVal === '128GB+') return gb >= 128
      const target = parseInt(ramVal)
      return target && gb >= target && gb < target * 2
    })
  }
  if (lowGradesOnly.value) list = list.filter(d => d.composite_grade === 'D' || d.composite_grade === 'F')
  return sortRows(list)
})

const scopeCaption = computed(() => {
  if (lowGradesOnly.value) return 'graded D or F on composite'
  const parts = []
  if (searchText.value) parts.push(`matching "${searchText.value}"`)
  if (selectedModel.value) parts.push(selectedModel.value)
  if (selectedRAMTier.value) parts.push(`${selectedRAMTier.value} RAM`)
  if (selectedTeam.value) parts.push(teamLabel(selectedTeam.value))
  return parts.length ? parts.join(' · ') : 'no filters active — the whole fleet'
})

const unscored = computed(() => mergedRows.value.filter(d => d.composite_score == null).length)
const moversCovered = computed(() => movers.value.length)

// ─── Hero: distribution + why-fail (computed, not copywritten) ─
const gradeCounts = computed(() => {
  const c = {}
  for (const r of mergedRows.value) if (r.composite_grade) c[r.composite_grade] = (c[r.composite_grade] || 0) + 1
  return c
})
const totalGraded = computed(() => GRADES.reduce((s, g) => s + (gradeCounts.value[g] || 0), 0))
function distPct(g) {
  return totalGraded.value ? ((gradeCounts.value[g] || 0) / totalGraded.value) * 100 : 0
}

// Reasons are counted over hosts below the B line, from real fields only.
const whyRows = computed(() => {
  const low = mergedRows.value.filter(d => d.composite_score != null && d.composite_score < 75)
  if (!low.length) return []
  const reasons = [
    { label: 'Weakest signal: performance', count: low.filter(d => d.weakest?.label === 'Performance').length },
    { label: 'Weakest signal: software', count: low.filter(d => d.weakest?.label === 'Software').length },
    { label: 'Memory pressure over 70%', count: low.filter(d => d.mem_pressure != null && d.mem_pressure > 70).length },
    { label: 'Silicon 3+ generations old', count: low.filter(d => d.gens_behind != null && d.gens_behind >= 3).length },
    { label: '16 GB of RAM or less', count: low.filter(d => Number(d.memory_gb) > 0 && Number(d.memory_gb) <= 16).length },
  ]
  return reasons.filter(r => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 3)
})

// ─── Table helpers ────────────────────────────────────────────
function sortBy(col) {
  toggleSort(col, false)
}
function sortIcon(col) {
  if (sortKey.value !== col) return ''
  return sortAsc.value ? '▲' : '▼'
}
function deltaText(d) {
  if (d == null) return '—'
  if (d === 0) return '0'
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}`
}
function deltaClass(d) {
  if (d == null || d === 0) return 'delta-flat'
  return d > 0 ? 'delta-up' : 'delta-down'
}
function openHost(id) {
  if (id) router.push(`/hosts/${id}`)
}

// ─── Compare overlay ──────────────────────────────────────────
const compareMode = ref(false)
const compareInitialId = ref('')
const compareDevices = computed(() =>
  devices.value.map(d => ({ ...d, host_identifier: d.host_id }))
)
function openCompare(hostId) {
  compareInitialId.value = hostId
  compareMode.value = true
}
</script>

<style scoped>
.hosts-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: var(--pad-large);
}

/* ─── Header ───────────────────────────────────── */
.hp-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--pad-large);
}
.hp-title { margin: 0; font-size: 24px; font-weight: 700; color: var(--fleet-black); }
.hp-subtitle { font-size: var(--font-size-base); color: var(--fleet-black-75); margin-top: 3px; }
.hp-actions { display: flex; gap: 8px; }
.hp-btn-link { text-decoration: none; }

/* ─── Hero (briefing language) ─────────────────── */
.hp-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-large) 32px;
  display: grid;
  grid-template-columns: 240px 1fr 340px;
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

.hero-scope { display: flex; flex-direction: column; gap: 6px; }
.hero-count-row { display: flex; align-items: baseline; gap: 10px; }
.hero-count { font-size: 44px; font-weight: 700; line-height: 1; }
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
.hero-scope-caption { font-size: var(--font-size-base); color: var(--fleet-black-33); }

.hero-dist {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 1px solid var(--fleet-blue);
  padding-left: 40px;
}
.hero-dist-bar { display: flex; height: 10px; border-radius: var(--radius-full); overflow: hidden; }
.hero-dist-seg { transition: width 400ms ease-out; }
.hero-dist-counts { display: flex; gap: 20px; font-size: var(--font-size-base); color: var(--fleet-black-33); }
.hero-dist-counts strong { color: var(--fleet-white); }

.hero-why { display: flex; flex-direction: column; gap: 10px; }
.hero-why-list { display: flex; flex-direction: column; gap: 8px; }
.hero-why-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-base);
}
.hero-why-count { font-family: var(--font-mono); font-weight: 700; }
.hero-moved-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

/* ─── Queue ────────────────────────────────────── */
.grammar-section { display: flex; flex-direction: column; gap: var(--pad-smedium); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }

.queue-controls { display: flex; align-items: center; gap: 8px; }

.queue-filter-chip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--fleet-black-25);
  border-radius: var(--radius-medium);
  background: var(--fleet-white);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base);
}
.queue-filter-chip.is-active {
  border-color: var(--fleet-green);
  background: var(--fleet-accent-green-light);
  color: var(--fleet-green-down);
  font-weight: 600;
}
.queue-filter-chip:focus-visible { outline: 1px solid var(--fleet-focused-outline); outline-offset: 1px; }

.queue-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}

.queue-loading {
  text-align: center;
  color: var(--fleet-black-50);
  font-style: italic;
  padding: 28px;
}

.queue-table-wrap { overflow-x: auto; }

.queue-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-base);
}

.queue-table th {
  text-align: left;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
  background: var(--fleet-off-white);
  padding: 10px 13px;
  border-bottom: 1px solid var(--fleet-black-10);
  white-space: nowrap;
  user-select: none;
}
.queue-table th:first-child { padding-left: var(--pad-large); }
.queue-table th:last-child { padding-right: var(--pad-large); }
.queue-table th.sortable { cursor: pointer; }
.queue-table th.sortable:hover { color: var(--fleet-black); }
.queue-ram-col { min-width: 150px; }

.queue-table td {
  padding: 11px 13px;
  border-bottom: 1px solid var(--fleet-black-5);
  color: var(--fleet-black-75);
  vertical-align: middle;
}
.queue-table td:first-child { padding-left: var(--pad-large); }
.queue-table td:last-child { padding-right: var(--pad-large); }
.queue-table tbody tr:last-child td { border-bottom: 0; }

.queue-row { cursor: pointer; transition: background var(--transition-fast); }
.queue-row:hover { background: var(--fleet-off-white); }
.queue-row:hover .queue-hostname { color: var(--fleet-green-down); }

.queue-host { display: flex; flex-direction: column; }
.queue-hostname { font-weight: 600; color: var(--fleet-black); }
.queue-host-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }

.queue-muted { color: var(--fleet-black-75); }
.queue-nowrap { white-space: nowrap; }
.queue-none { color: var(--fleet-black-25); }

.queue-cpu-year { font-size: var(--font-size-xxsmall); margin-left: 4px; }
.age--neutral { color: var(--fleet-black-50); }
.age--fair { color: var(--status-fair-text); }
.age--elevated { color: var(--status-elevated); }
.age--critical { color: var(--status-critical); }

.queue-ram { display: flex; align-items: center; gap: 8px; }
.queue-ram-meter { flex: 1; height: 6px; background: var(--fleet-black-5); border-radius: var(--radius-full); overflow: hidden; }
.queue-ram-fill { height: 100%; transition: width 400ms ease-out; }
.queue-ram-pct { font-size: var(--font-size-sm); font-weight: 600; width: 38px; text-align: right; }

.num { text-align: right; }
.queue-delta { font-family: var(--font-mono); font-weight: 700; }
.delta-up { color: var(--status-good); }
.delta-down { color: var(--status-critical); }
.delta-flat { color: var(--fleet-black-50); }

.queue-composite { display: inline-flex; align-items: center; gap: 7px; }
.queue-score { font-weight: 700; color: var(--fleet-black); }

.queue-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px var(--pad-large);
  border-top: 1px solid var(--fleet-black-10);
  background: var(--fleet-off-white);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
}
.queue-footer-hint { font-style: italic; }

/* ─── Compare overlay (unchanged behavior) ─────── */
.compare-overlay {
  position: fixed;
  inset: 0;
  background: rgba(25, 33, 71, 0.4);
  z-index: 1000;
  overflow-y: auto;
  padding: 40px;
}
.compare-panel {
  max-width: 1200px;
  margin: 0 auto;
  background: var(--fleet-white);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-large);
}

@media (max-width: 1100px) {
  .hp-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-dist { border-left: none; padding-left: 0; }
}
</style>
