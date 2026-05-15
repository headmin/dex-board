<template>
  <table class="mttp-table">
    <thead>
      <tr>
        <th class="mttp-col-app">App</th>
        <th class="mttp-col-num">Hosts</th>
        <th class="mttp-col-num">MTTP</th>
        <th class="mttp-col-range">Range</th>
        <th class="mttp-col-num" v-if="showDistinct">Distinct</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="rowKey(r)">
        <td class="mttp-col-app">{{ r.software_name }}</td>
        <td class="mttp-col-num"><strong>{{ r.hosts }}</strong></td>
        <td class="mttp-col-num">{{ r.avg_lag }}d</td>
        <td class="mttp-col-range mono">{{ r.min_lag }}–{{ r.max_lag }}d</td>
        <td class="mttp-col-num" v-if="showDistinct">{{ r.distinct_lags }}</td>
      </tr>
      <tr v-if="!rows.length">
        <td :colspan="showDistinct ? 5 : 4" class="mttp-empty">{{ emptyText }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
defineProps({
  rows: { type: Array, required: true },
  showDistinct: { type: Boolean, default: true },
  emptyText: { type: String, default: 'No patch activity in this window.' },
})

function rowKey(r) {
  return r.software_name + '|' + (r.day || '')
}
</script>

<style scoped>
.mttp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  overflow: hidden;
}
.mttp-table th {
  text-align: left;
  padding: 10px 14px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--fleet-black-10);
  background: var(--fleet-off-white);
}
.mttp-table td {
  padding: 8px 14px;
  color: var(--fleet-black-75);
  border-bottom: 1px solid var(--fleet-black-5);
}
.mttp-table tr:last-child td { border-bottom: none; }
.mttp-table tr:hover td { background: var(--fleet-off-white); }
.mttp-table .mttp-col-app { font-weight: 500; color: var(--fleet-black); }
.mttp-table .mttp-col-num { text-align: right; font-family: var(--font-mono); white-space: nowrap; }
.mttp-table .mttp-col-num strong { color: #6a67fe; font-weight: 700; }
.mttp-table .mttp-col-range { text-align: right; font-family: var(--font-mono); color: var(--fleet-black-50); white-space: nowrap; }
.mttp-table .mono { font-family: var(--font-mono); }
.mttp-empty {
  text-align: center;
  font-family: var(--font-mono);
  color: var(--fleet-black-50);
  font-style: italic;
  padding: 20px;
}
</style>
