<template>
  <div class="table-container">
    <h3 v-if="title">{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="table" :rows="6" :columns="columns.length || 5" height="260px" />
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in data"
            :key="index"
            :class="{ clickable: clickable }"
            @click="clickable && $emit('row-click', row)"
          >
            <td v-for="col in columns" :key="col.key" :class="{ mono: col.type === 'number' }">
              {{ formatCell(row[col.key], col) }}
            </td>
          </tr>
          <tr v-if="data.length === 0">
            <td :colspan="columns.length" class="empty">No data available</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import dayjs from 'dayjs'
import SkeletonLoader from './SkeletonLoader.vue'

const props = defineProps({
  title: { type: String, default: '' },
  data: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false }
})

defineEmits(['row-click'])

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
</script>

<style scoped>
.table-container {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-medium);
  overflow: hidden;
}

h3 {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  padding: var(--pad-large);
  padding-bottom: var(--pad-medium);
  margin: 0;
  letter-spacing: 0.2px;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

th, td {
  padding: 10px var(--pad-large);
  text-align: left;
}

th {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  border-bottom: 1px solid var(--fleet-black-10);
  letter-spacing: 0.2px;
}

td {
  color: var(--fleet-black-75);
  border-bottom: 1px solid var(--fleet-black-5);
  font-size: var(--font-size-sm);
}

td.mono {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

tbody tr:last-child td {
  border-bottom: none;
}

tr:hover td {
  background: var(--fleet-black-5);
}

tr.clickable {
  cursor: pointer;
}

tr.clickable:hover td {
  background: #f0f1ff;
}

.empty {
  text-align: center;
  color: var(--fleet-black-50);
  padding: 40px;
  font-family: var(--font-mono);
}
</style>
