<template>
  <!-- ─── Act — hosts needing attention (design 1a briefing) ──── -->
  <section v-if="!wcMode" class="full-width">
    <div class="act-card">
      <div class="act-header">
        <div v-if="totalGraded > 0" class="act-distribution" :title="distributionTooltip">
          <div
            v-for="g in GRADES"
            :key="g"
            class="act-dist-segment"
            :style="{ width: distributionPct(g) + '%', background: gradeColor(g) }"
          ></div>
        </div>
        <div v-if="totalGraded > 0" class="act-dist-counts">
          <span v-for="g in GRADES" :key="g"><strong>{{ distribution[g] || 0 }}</strong> {{ g }}</span>
        </div>
        <div class="act-header-actions">
          <button
            type="button"
            class="act-filter-chip"
            :class="{ 'is-active': lowGradesOnly }"
            @click="lowGradesOnly = !lowGradesOnly"
          >Grade D or F</button>
          <SearchInput v-model="deviceSearch" class="act-search" placeholder="Search hostname..." />
        </div>
      </div>

      <SkeletonLoader v-if="loading" variant="chart" height="280px" />
      <EmptyState v-else-if="!filteredDeviceList.length" title="No hosts match the current filter" small />
      <div v-else class="act-table-wrap">
        <table class="act-table">
          <thead>
            <tr>
              <th @click="deviceSortBy('hostname')" class="sortable">Host {{ deviceSortIcon('hostname') }}</th>
              <th>Hardware</th>
              <th @click="deviceSortBy('composite_grade')" class="sortable">Grade {{ deviceSortIcon('composite_grade') }}</th>
              <th @click="deviceSortBy('composite_score')" class="sortable">Score {{ deviceSortIcon('composite_score') }}</th>
              <th>Weakest signal</th>
              <th>Recommended action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in filteredDeviceList" :key="d.host_id"
                class="act-row"
                :title="`Open ${displayHost(d)} in host details`"
                @click="$emit('inspect-host', d.host_id)">
              <td class="act-hostname">{{ displayHost(d) }}</td>
              <td class="act-muted">{{ hardwareLabel(d) }}</td>
              <td><GradeBadge :grade="d.composite_grade" /></td>
              <td class="act-score">{{ d.composite_score }}</td>
              <td class="act-muted">
                <template v-if="weakest(d)">{{ weakest(d).label }} · {{ weakest(d).score }}</template>
                <template v-else>—</template>
              </td>
              <td class="act-muted">{{ actionFor(d) }}</td>
              <td class="act-cta">→</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
  <section v-else class="full-width">
    <div class="wc-drill-notice">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      Per-host score table hidden — Workers Council mode active
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import GradeBadge from '../GradeBadge.vue'
import SearchInput from '../base/SearchInput.vue'
import SkeletonLoader from '../base/SkeletonLoader.vue'
import EmptyState from '../base/EmptyState.vue'
import { displayHost } from '../../composables/displayName'
import { useSort } from '../../composables/useSort'
import { gradeColor } from '../../composables/gradeColors'
import { humanizeToken } from '../../composables/humanize'
import { useWorkersCouncil } from '../../composables/useWorkersCouncil'

const GRADES = ['A', 'B', 'C', 'D', 'F']

// Weakest category → what to actually do about it. Honest, generic
// playbook entries — procurement/MDM specifics live outside this view.
const SIGNALS = [
  { key: 'software_score', label: 'Software', action: 'Patch & update apps' },
  { key: 'security_score', label: 'Security', action: 'Re-apply security profile' },
  { key: 'performance_score', label: 'Performance', action: 'Investigate workload / RAM' },
  { key: 'device_health_score', label: 'Device health', action: 'Hardware check (battery / RAM)' },
]

const props = defineProps({
  deviceList: { type: Array, default: () => [] },
  distribution: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
})

defineEmits(['inspect-host'])

const { wcMode } = useWorkersCouncil()

const deviceSearch = ref('')
const lowGradesOnly = ref(false)

// Act reads worst-first by default: the top of the table is the work queue.
const {
  sortKey: deviceSortCol,
  sortAsc: deviceSortAsc,
  toggleSort: deviceToggleSort,
  sortRows: deviceSortRows,
} = useSort('composite_score', true)

const filteredDeviceList = computed(() => {
  let list = props.deviceList
  if (lowGradesOnly.value) {
    list = list.filter(d => d.composite_grade === 'D' || d.composite_grade === 'F')
  }
  if (deviceSearch.value) {
    const s = deviceSearch.value.toLowerCase()
    list = list.filter(d =>
      (d.hostname || '').toLowerCase().includes(s) ||
      (d.host_id || '').toLowerCase().includes(s) ||
      (d.cpu_class || '').toLowerCase().includes(s) ||
      (d.ram_tier || '').toLowerCase().includes(s)
    )
  }
  return deviceSortRows(list)
})

function hardwareLabel(d) {
  const cpu = d.cpu_class ? humanizeToken(String(d.cpu_class)) : ''
  const ram = d.ram_tier ? String(d.ram_tier).toUpperCase() : ''
  return [cpu, ram].filter(Boolean).join(' · ') || '—'
}

function weakest(d) {
  let worst = null
  for (const s of SIGNALS) {
    const v = d[s.key]
    if (v == null || v === '') continue
    const n = Number(v)
    if (!worst || n < worst.score) worst = { ...s, score: n }
  }
  return worst
}

// Only recommend work where a signal is actually weak — a healthy host's
// "weakest" signal at 86 doesn't need a playbook entry.
function actionFor(d) {
  const w = weakest(d)
  if (!w || w.score >= 75) return '—'
  return w.action
}

const totalGraded = computed(() =>
  GRADES.reduce((s, g) => s + (props.distribution[g] || 0), 0)
)

function distributionPct(grade) {
  const total = totalGraded.value
  if (!total) return 0
  return ((props.distribution[grade] || 0) / total) * 100
}

const distributionTooltip = computed(() => {
  const parts = GRADES.map(g => `${g}: ${props.distribution[g] || 0}`)
  return `Grade distribution — ${parts.join(', ')}`
})

function deviceSortBy(col) {
  // hostname starts ascending; score columns start ascending too (worst first)
  deviceToggleSort(col, false)
}

function deviceSortIcon(col) {
  if (deviceSortCol.value !== col) return ''
  return deviceSortAsc.value ? '▲' : '▼'
}
</script>

<style scoped>
.full-width { width: 100%; }

.act-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}

/* ─── Header: distribution strip + counts + quick filter ── */
.act-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px var(--pad-large);
  border-bottom: 1px solid var(--fleet-black-10);
  flex-wrap: wrap;
}

.act-distribution {
  display: flex;
  height: 8px;
  border-radius: var(--radius-full);
  overflow: hidden;
  flex: 1;
  max-width: 420px;
  min-width: 200px;
}
.act-dist-segment { transition: width 400ms ease-out; }

.act-dist-counts {
  display: flex;
  gap: 14px;
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  white-space: nowrap;
}
.act-dist-counts strong { color: var(--fleet-black); }

.act-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.act-filter-chip {
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
  white-space: nowrap;
  transition: border-color var(--transition-base), background var(--transition-base);
}
.act-filter-chip.is-active {
  border-color: var(--fleet-green);
  background: var(--fleet-accent-green-light);
  color: var(--fleet-green-down);
  font-weight: 600;
}
.act-filter-chip:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 1px;
}

.act-search { width: 200px; }

/* ─── Table ─────────────────────────────────── */
.act-table-wrap { overflow-x: auto; }

.act-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-base);
}

.act-table th {
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
.act-table th:first-child { padding-left: var(--pad-large); }
.act-table th:last-child { padding-right: var(--pad-large); }
.act-table th.sortable { cursor: pointer; }
.act-table th.sortable:hover { color: var(--fleet-black); }

.act-table td {
  padding: 12px 13px;
  border-bottom: 1px solid var(--fleet-black-5);
  color: var(--fleet-black-75);
}
.act-table td:first-child { padding-left: var(--pad-large); }
.act-table td:last-child { padding-right: var(--pad-large); }
.act-table tbody tr:last-child td { border-bottom: 0; }

.act-row { cursor: pointer; transition: background var(--transition-fast); }
.act-row:hover { background: var(--fleet-off-white); }
.act-row:hover .act-hostname { color: var(--fleet-black); }
.act-row:hover .act-cta { color: var(--fleet-green); }

.act-hostname { font-weight: 600; color: var(--fleet-black); }
.act-score { font-weight: 600; color: var(--fleet-black); }
.act-muted { color: var(--fleet-black-75); }
.act-cta {
  text-align: right;
  color: var(--fleet-black-25);
  font-weight: 600;
  transition: color var(--transition-fast);
}

/* ─── Workers Council notice ─────────────────── */
.wc-drill-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: var(--status-good-bg);
  border: 1px solid var(--fleet-status-success-border);
  border-radius: var(--radius-large);
  padding: 9px 14px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--status-good-text);
}
.wc-drill-notice svg { stroke: var(--status-good-text); flex-shrink: 0; }
</style>
