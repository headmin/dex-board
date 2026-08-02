<template>
  <!-- ─── Device Scores Table (with inline grade distribution) -->
  <section v-if="!wcMode" class="full-width">
    <div class="chart-container">
      <div class="device-table-header">
        <div class="device-table-title-group">
          <h3>Host scores ({{ filteredDeviceList.length }})</h3>
          <div v-if="totalGraded > 0" class="mini-distribution" :title="distributionTooltip">
            <div
              v-for="g in ['A','B','C','D','F']"
              :key="g"
              class="mini-dist-segment"
              :class="'grade-' + g"
              :style="{ width: distributionPct(g) + '%' }"
            >
              <span v-if="distributionPct(g) >= 8" class="mini-dist-label">{{ g }} {{ distribution[g] || 0 }}</span>
            </div>
          </div>
        </div>
        <SearchInput
          v-model="deviceSearch"
          class="device-search"
          placeholder="Search hostname..."
        />
      </div>
      <SkeletonLoader v-if="loading" variant="chart" height="280px" />
      <EmptyState v-else-if="!filteredDeviceList.length" title="No hosts match your search" small />
      <div v-else class="device-table-wrap">
        <table class="device-table">
          <thead>
            <tr>
              <th @click="deviceSortBy('hostname')" class="sortable">Hostname {{ deviceSortIcon('hostname') }}</th>
              <th @click="deviceSortBy('composite_score')" class="sortable">Score {{ deviceSortIcon('composite_score') }}</th>
              <th @click="deviceSortBy('composite_grade')" class="sortable">Grade {{ deviceSortIcon('composite_grade') }}</th>
              <th @click="deviceSortBy('device_health_score')" class="sortable">Health {{ deviceSortIcon('device_health_score') }}</th>
              <th @click="deviceSortBy('software_score')" class="sortable">Software {{ deviceSortIcon('software_score') }}</th>
              <th @click="deviceSortBy('performance_score')" class="sortable">Perf {{ deviceSortIcon('performance_score') }}</th>
              <th @click="deviceSortBy('security_score')" class="sortable">Security {{ deviceSortIcon('security_score') }}</th>
              <th @click="deviceSortBy('network_score')" class="sortable">Network {{ deviceSortIcon('network_score') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in filteredDeviceList" :key="d.host_id"
                class="device-row-clickable"
                :title="`Open ${displayHost(d)} in host details`"
                @click="$emit('inspect-host', d.host_id)">
              <td class="device-hostname">
                {{ displayHost(d) }}
                <span class="device-row-cta">→</span>
              </td>
              <td class="device-score-cell">{{ d.composite_score }}</td>
              <td><GradeBadge :grade="d.composite_grade" /></td>
              <td class="device-score-cell" :style="{ color: scoreTextColor(d.device_health_score) }">{{ d.device_health_score }}</td>
              <td class="device-score-cell" :style="{ color: scoreTextColor(d.software_score) }">{{ d.software_score }}</td>
              <td class="device-score-cell" :style="{ color: scoreTextColor(d.performance_score) }">{{ d.performance_score }}</td>
              <td class="device-score-cell" :style="{ color: scoreTextColor(d.security_score) }">{{ d.security_score }}</td>
              <td class="device-score-cell" :style="{ color: scoreTextColor(d.network_score) }">{{ d.network_score }}</td>
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
import { scoreTextColor } from '../../composables/gradeColors'
import { useWorkersCouncil } from '../../composables/useWorkersCouncil'

const props = defineProps({
  deviceList: { type: Array, default: () => [] },
  distribution: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
})

defineEmits(['inspect-host'])

const { wcMode } = useWorkersCouncil()

// Device list state
const deviceSearch = ref('')
const {
  sortKey: deviceSortCol,
  sortAsc: deviceSortAsc,
  toggleSort: deviceToggleSort,
  sortRows: deviceSortRows,
} = useSort('composite_score', true)

const filteredDeviceList = computed(() => {
  let list = props.deviceList
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

const totalGraded = computed(() =>
  ['A','B','C','D','F'].reduce((s, g) => s + (props.distribution[g] || 0), 0)
)

function distributionPct(grade) {
  const total = totalGraded.value
  if (!total) return 0
  return ((props.distribution[grade] || 0) / total) * 100
}

const distributionTooltip = computed(() => {
  const parts = ['A','B','C','D','F'].map(g => `${g}: ${props.distribution[g] || 0}`)
  return `Grade distribution — ${parts.join(', ')}`
})

function deviceSortBy(col) {
  // hostname starts ascending; every score column starts descending
  deviceToggleSort(col, col !== 'hostname')
}

function deviceSortIcon(col) {
  if (deviceSortCol.value !== col) return ''
  return deviceSortAsc.value ? '▲' : '▼'
}
</script>

<style scoped>
.full-width {
  width: 100%;
}

/* ─── Device scores table ────────────────────── */
.device-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
  flex-wrap: wrap;
  gap: 11px;
}

.device-table-title-group {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.device-table-header h3 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  white-space: nowrap;
}

/* Mini stacked grade distribution (replaces the full GradeDistribution component) */
.mini-distribution {
  display: flex;
  height: 8px;
  border-radius: var(--radius-full);
  overflow: hidden;
  flex: 1;
  max-width: 360px;
  min-width: 180px;
}

.mini-dist-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 400ms ease-out;
  overflow: hidden;
}

.mini-dist-segment.grade-A { background: var(--fleet-success); }
.mini-dist-segment.grade-B { background: var(--status-good-soft); }
.mini-dist-segment.grade-C { background: var(--status-fair); }
.mini-dist-segment.grade-D { background: var(--fleet-ui-orange); }
.mini-dist-segment.grade-F { background: var(--fleet-error); }

.mini-dist-label {
  display: none;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  padding: 0 4px;
  letter-spacing: 0.3px;
}

.device-table-header .device-search {
  width: 220px;
}

.device-table-wrap {
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-large);
}

.device-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.device-table th {
  text-align: left;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  background: var(--fleet-off-white);
  padding: 9px 13px;
  border-bottom: 1px solid var(--fleet-black-10);
  white-space: nowrap;
  user-select: none;
}
.device-table th:first-child { border-top-left-radius: var(--radius-large); }
.device-table th:last-child { border-top-right-radius: var(--radius-large); }

.device-table th.sortable {
  cursor: pointer;
}

.device-table th.sortable:hover {
  color: var(--fleet-black);
}

.device-table td {
  padding: 9px 13px;
  border-bottom: 1px solid var(--fleet-black-10);
  color: var(--fleet-black-75);
}

.device-table tbody tr:last-child td {
  border-bottom: 0;
}

.device-table tbody tr:hover {
  background: var(--fleet-off-white);
}

.device-row-clickable {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.device-row-clickable:hover {
  background: var(--fleet-off-white);
}

.device-row-clickable:hover .device-hostname {
  color: var(--fleet-black);
}

.device-row-cta {
  display: inline-block;
  margin-left: 5px;
  font-weight: 600;
  color: var(--fleet-black-25);
  transition: color var(--transition-fast), transform var(--transition-fast);
}

.device-row-clickable:hover .device-row-cta {
  color: var(--fleet-green);
  transform: translateX(2px);
}

.device-hostname {
  font-weight: 700;
  color: var(--fleet-black);
}

.device-score-cell {
  font-weight: 600;
  text-align: left;
}

/* ─── Workers Council drill-down notice ──────── */
.wc-drill-notice {
  grid-column: 1 / -1;
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
  margin-top: var(--pad-medium);
}

.wc-drill-notice svg {
  stroke: var(--status-good-text);
  flex-shrink: 0;
}
</style>
