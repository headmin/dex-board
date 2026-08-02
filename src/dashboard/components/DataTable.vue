<template>
  <div class="table-container">
    <div v-if="title" class="table-header">
      <h3>{{ title }}</h3>
      <slot name="actions"></slot>
    </div>
    <SkeletonLoader v-if="loading" variant="table" :rows="6" :columns="columns.length || 5" height="280px" />
    <div v-else-if="data.length === 0" class="table-empty">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="8" width="32" height="24" rx="2" stroke="currentColor" stroke-width="1.5"/>
        <path d="M4 14h32M12 20h16M12 26h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>No data available</span>
    </div>
    <div v-else class="table-wrapper">
      <table class="table" :class="{ 'table--clickable': clickable, 'table--compact': density === 'compact' }">
        <thead>
          <tr>
            <th
              v-for="col in columns" :key="col.key"
              :class="{ sortable: isSortable(col), 'sort-active': sortKey === col.key }"
              @click="isSortable(col) && toggleSort(col.key)"
            >
              {{ col.label }}<span
                v-if="isSortable(col)"
                class="sort-indicator"
                :class="{ 'sort-indicator-active': sortKey === col.key }"
              >{{ sortKey === col.key ? (sortAsc ? '▲' : '▼') : '⇅' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in visibleData"
            :key="index"
            @click="clickable && $emit('row-click', row)"
          >
            <td v-for="col in columns" :key="col.key" :class="getCellClass(col)">
              <span v-if="col.type === 'status'" class="badge" :class="getStatusClass(row[col.key])">
                {{ row[col.key] }}
              </span>
              <span v-else :class="cellToneClass(col, row)">{{ formatCell(row[col.key], col) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import SkeletonLoader from './base/SkeletonLoader.vue'

const props = defineProps({
  title: { type: String, default: '' },
  data: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
  // Default sort: column key + direction. Either is optional.
  defaultSortKey: { type: String, default: '' },
  defaultSortAsc: { type: Boolean, default: true },
  // 'compact' tightens cell padding and drops the font a step.
  density: { type: String, default: 'default' },
  // Case-insensitive substring match against every column's value.
  filter: { type: String, default: '' },
  // 0 = unlimited; otherwise the final (filtered + sorted) list is sliced.
  maxRows: { type: Number, default: 0 },
})

defineEmits(['row-click'])

// Every column is sortable unless explicitly opted out with sortable: false.
function isSortable(col) {
  return col.sortable !== false
}

const sortKey = ref(props.defaultSortKey || '')
const sortAsc = ref(props.defaultSortAsc)

function toggleSort(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    // Numeric and datetime columns start descending — outliers / freshest
    // entries first, which is usually what you want for diagnostic tables.
    const col = props.columns.find(c => c.key === key)
    sortAsc.value = !(col && (col.type === 'number' || col.type === 'datetime'))
  }
}

// Filter first (cheap substring test per row), then sort the survivors.
const filteredData = computed(() => {
  const f = props.filter.trim().toLowerCase()
  if (!f) return props.data
  const keys = props.columns.map(c => c.key)
  return props.data.filter(row => keys.some(k => {
    const v = row[k]
    return v != null && String(v).toLowerCase().includes(f)
  }))
})

const sortedData = computed(() => {
  if (!sortKey.value || !filteredData.value.length) return filteredData.value
  const col = props.columns.find(c => c.key === sortKey.value)
  const isNum = col && (col.type === 'number' || col.type === 'datetime')
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return filteredData.value.slice().sort((a, b) => {
    const av = a[key]; const bv = b[key]
    if (av == null && bv == null) return 0
    if (av == null) return 1   // nulls sort to bottom regardless of direction
    if (bv == null) return -1
    if (isNum) {
      const an = Number(av), bn = Number(bv)
      if (isFinite(an) && isFinite(bn)) return (an - bn) * dir
    }
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
  })
})

const visibleData = computed(() =>
  props.maxRows > 0 ? sortedData.value.slice(0, props.maxRows) : sortedData.value
)

const formatCell = (value, col) => {
  if (value === null || value === undefined) return '-'

  if (col.type === 'datetime') {
    const d = dayjs(value)
    return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(value)
  }

  if (col.type === 'number') {
    return Number(value).toLocaleString()
  }

  if (typeof value === 'string' && value.length > 50) {
    return value.substring(0, 50) + '...'
  }

  return value
}

const getCellClass = (col) => {
  const classes = []
  if (col.type === 'number') classes.push('mono')
  if (col.type === 'datetime') classes.push('mono', 'text-muted')
  if (col.align === 'right') classes.push('text-right')
  return classes
}

// Opt-in per-cell threshold coloring, matching the mockup pressure/health
// tables. A column may set `tone: (value, row) => 'good'|'fair'|'elevated'
// |'critical'|null` to tint its numeric value on the canonical scale.
const cellToneClass = (col, row) => {
  if (typeof col.tone !== 'function') return []
  const t = col.tone(row[col.key], row)
  return t ? ['cell-tone', `cell-tone--${t}`] : []
}

const getStatusClass = (value) => {
  const v = String(value).toLowerCase()
  if (v === 'active' || v === 'enabled' || v === 'yes' || v === 'healthy') return 'badge--success'
  if (v === 'inactive' || v === 'disabled' || v === 'no' || v === 'unhealthy') return 'badge--critical'
  if (v === 'pending' || v === 'warning') return 'badge--medium'
  return 'badge--neutral'
}
</script>

<style scoped>
/* Aligned with the capex-savings DEX mockups: a rounded, bordered table
   card with a soft-grey header, sentence-case navy header labels in the
   body font, and roomy rows with light dividers. Used across /reports and
   any view that picks up <DataTable>. */
.table-container {
  background: transparent;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-small);
}

.table-header h3 {
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-large);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: var(--table-font-size);
}

.table th,
.table td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  text-align: left;
  vertical-align: middle;
}

.table thead th {
  background: var(--fleet-off-white);
  color: var(--fleet-black);
  font-size: var(--table-header-font-size);
  font-weight: 700;
  border-bottom: 1px solid var(--fleet-black-10);
  user-select: none;
  white-space: nowrap;
}
.table thead th:first-child { border-top-left-radius: var(--radius-large); }
.table thead th:last-child { border-top-right-radius: var(--radius-large); }
.table thead th.sortable { cursor: pointer; }
.table thead th.sortable:hover { color: var(--fleet-black); }
.table thead th.sortable:hover .sort-indicator { color: var(--fleet-black-50); }
.table thead th .sort-indicator {
  display: inline-block;
  width: 12px;           /* reserve space so layout doesn't shift on toggle */
  margin-left: 5px;
  font-size: 10px;
  font-weight: 700;
  color: var(--fleet-black-25);
  text-align: center;
  transition: color 100ms;
}
.table thead th .sort-indicator-active { color: var(--fleet-black-75); }

/* Compact density */
.table--compact {
  font-size: var(--font-size-sm);
}
.table--compact th,
.table--compact td {
  padding: 6px 12px;
}
.table--compact thead th {
  font-size: var(--font-size-xs);
}

.table tbody tr {
  border-bottom: 1px solid var(--fleet-black-10);
}

.table tbody tr:last-child {
  border-bottom: 0;
}

.table tbody tr:hover {
  background-color: var(--fleet-off-white);
}

.table--clickable tbody tr {
  cursor: pointer;
}

.table td {
  color: var(--fleet-black-75);
}

.table td.mono {
  font-family: var(--font-mono);
}

.table td.text-muted {
  color: var(--fleet-black-50);
}

.table td.text-right {
  text-align: right;
}

/* Opt-in threshold coloring (col.tone) — canonical status scale */
.cell-tone { font-weight: 600; font-variant-numeric: tabular-nums; }
.cell-tone--good { color: var(--status-good); }
.cell-tone--fair { color: var(--status-fair-text); }
.cell-tone--elevated { color: var(--fleet-ui-orange); }
.cell-tone--critical { color: var(--status-critical); }

/* Badge styles — tinted pills on the canonical status scale */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--pad-xxsmall) var(--pad-small);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: capitalize;
  line-height: 1;
}

.badge--critical {
  background-color: var(--status-critical-bg);
  color: var(--status-critical);
}

.badge--high {
  background-color: var(--status-elevated-bg);
  color: var(--status-elevated);
}

.badge--medium {
  background-color: var(--status-fair-bg);
  color: var(--status-fair-text);
}

.badge--low {
  background-color: var(--info-tint);
  color: var(--fleet-status-info);
}

.badge--success {
  background-color: var(--status-good-bg);
  color: var(--status-good-text);
}

.badge--info {
  background-color: var(--info-tint);
  color: var(--fleet-status-info);
}

.badge--neutral {
  background-color: var(--fleet-black-10);
  color: var(--fleet-black);
}

/* Empty state */
.table-empty {
  padding: var(--pad-large);
  text-align: center;
  color: var(--fleet-black-50);
  background-color: var(--fleet-white);
}

.table-empty svg {
  display: block;
  margin: 0 auto 11px;
  color: var(--fleet-black-25);
}

.table-empty span {
  font-size: var(--font-size-xsmall);
}
</style>
