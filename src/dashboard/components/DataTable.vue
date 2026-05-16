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
      <table class="table" :class="{ 'table--clickable': clickable }">
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
              >{{ sortKey === col.key && !sortAsc ? '▼' : '▲' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in sortedData"
            :key="index"
            @click="clickable && $emit('row-click', row)"
          >
            <td v-for="col in columns" :key="col.key" :class="getCellClass(col)">
              <span v-if="col.type === 'status'" class="badge" :class="getStatusClass(row[col.key])">
                {{ row[col.key] }}
              </span>
              <span v-else>{{ formatCell(row[col.key], col) }}</span>
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
import SkeletonLoader from './SkeletonLoader.vue'

const props = defineProps({
  title: { type: String, default: '' },
  data: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
  // Default sort: column key + direction. Either is optional.
  defaultSortKey: { type: String, default: '' },
  defaultSortAsc: { type: Boolean, default: true },
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

const sortedData = computed(() => {
  if (!sortKey.value || !props.data.length) return props.data
  const col = props.columns.find(c => c.key === sortKey.value)
  const isNum = col && (col.type === 'number' || col.type === 'datetime')
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return props.data.slice().sort((a, b) => {
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

const getStatusClass = (value) => {
  const v = String(value).toLowerCase()
  if (v === 'active' || v === 'enabled' || v === 'yes' || v === 'healthy') return 'badge--success'
  if (v === 'inactive' || v === 'disabled' || v === 'no' || v === 'unhealthy') return 'badge--critical'
  if (v === 'pending' || v === 'warning') return 'badge--medium'
  return 'badge--neutral'
}
</script>

<style scoped>
.table-container {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--pad-medium);
  border-bottom: 1px solid var(--fleet-black-10);
}

.table-header h3 {
  font-size: var(--font-size-small);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-xsmall);
}

.table th,
.table td {
  padding: var(--pad-small) var(--pad-medium);
  text-align: left;
  vertical-align: middle;
}

.table thead th {
  padding: var(--pad-smedium) var(--pad-medium);
  background-color: var(--fleet-black-5);
  color: var(--fleet-black-75);
  text-transform: uppercase;
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
  letter-spacing: var(--letter-spacing-wide);
  border-bottom: 1px solid var(--fleet-black-10);
  user-select: none;
}
.table thead th.sortable { cursor: pointer; }
.table thead th.sortable:hover { background-color: var(--fleet-black-10); color: var(--fleet-black); }
.table thead th.sort-active { color: var(--fleet-black); }
.table thead th .sort-indicator {
  display: inline-block;
  width: 9px;            /* reserve space so layout doesn't shift on toggle */
  margin-left: 4px;
  font-size: 9px;
  font-weight: 700;
  color: var(--fleet-black-25);
  text-align: center;
  transition: color 100ms;
}
.table thead th .sort-indicator-active { color: var(--fleet-vibrant-blue); }
.table thead th.sortable:hover .sort-indicator { color: var(--fleet-black-50); }
.table thead th.sortable:hover .sort-indicator-active { color: var(--fleet-vibrant-blue); }

.table tbody tr {
  border-bottom: 1px solid var(--fleet-black-5);
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
  color: var(--fleet-black);
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

/* Badge styles matching Fleet */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--pad-xxsmall) var(--pad-small);
  border-radius: var(--radius-xxlarge);
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
  text-transform: capitalize;
  color: var(--fleet-white);
  line-height: 1;
}

.badge--critical {
  background-color: var(--fleet-vibrant-red);
}

.badge--high {
  background-color: var(--rainbow-orange);
  color: var(--fleet-black);
}

.badge--medium {
  background-color: var(--fleet-warning);
  color: var(--fleet-black);
}

.badge--low {
  background-color: var(--fleet-info);
}

.badge--success {
  background-color: var(--fleet-success);
}

.badge--info {
  background-color: var(--fleet-vibrant-blue);
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
  margin: 0 auto 12px;
  color: var(--fleet-black-25);
}

.table-empty span {
  font-size: var(--font-size-xsmall);
}
</style>
