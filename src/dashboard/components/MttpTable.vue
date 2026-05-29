<template>
  <div class="mttp-wrap">
    <div v-if="slaSummary" class="mttp-sla-headline">
      <span class="mttp-sla-pct" :class="slaSummary.pctClass">{{ slaSummary.pct }}%</span>
      of patched hosts met the {{ slaDays }}-day SLA
      <span class="mttp-sla-apps">({{ slaSummary.metApps }}/{{ slaSummary.totalApps }} apps within target)</span>
    </div>
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
          <td class="mttp-col-num"><span :class="lagClass(r)">{{ r.avg_lag }}d</span></td>
          <td class="mttp-col-range mono">{{ r.min_lag }}–{{ r.max_lag }}d</td>
          <td class="mttp-col-num" v-if="showDistinct">{{ r.distinct_lags }}</td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="showDistinct ? 5 : 4" class="mttp-empty">{{ emptyText }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="slaDays" class="mttp-caption">
      MTTP is fleet-internal adoption lag (first host patched → this host patched),
      not vendor-disclosure-to-patched. Severity weighting needs a CVE feed (not integrated).
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rows: { type: Array, required: true },
  showDistinct: { type: Boolean, default: true },
  emptyText: { type: String, default: 'No patch activity in this window.' },
  // Committed patch-SLA target in days. When set (>0), the MTTP cell is colored
  // met/missed against it and a host-weighted "% met SLA" headline is shown.
  slaDays: { type: Number, default: null },
})

function rowKey(r) {
  return r.software_name + '|' + (r.day || '')
}

function lagClass(r) {
  if (!props.slaDays) return ''
  return Number(r.avg_lag) <= props.slaDays ? 'lag-met' : 'lag-missed'
}

// Host-weighted SLA attainment: share of patched hosts on apps whose mean
// time-to-patch is within the committed target. App-count shown alongside so a
// single high-volume laggard reads honestly.
const slaSummary = computed(() => {
  if (!props.slaDays || !props.rows.length) return null
  let totalHosts = 0
  let metHosts = 0
  let metApps = 0
  for (const r of props.rows) {
    const hosts = Number(r.hosts) || 0
    totalHosts += hosts
    if (Number(r.avg_lag) <= props.slaDays) {
      metHosts += hosts
      metApps += 1
    }
  }
  if (!totalHosts) return null
  const pct = Math.round((metHosts / totalHosts) * 100)
  return {
    pct,
    metApps,
    totalApps: props.rows.length,
    pctClass: pct >= 90 ? 'lag-met' : pct >= 70 ? 'lag-warn' : 'lag-missed',
  }
})
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

/* SLA attainment headline + per-cell met/missed coloring */
.mttp-sla-headline {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  margin-bottom: 10px;
}
.mttp-sla-pct {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: var(--font-size-md);
}
.mttp-sla-apps { color: var(--fleet-black-50); }
.mttp-table .lag-met,
.mttp-table .lag-warn,
.mttp-table .lag-missed {
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-sm, 4px);
}
.lag-met { background: #e8f8f0; color: #1a7a4c; }
.lag-warn { background: #fef9e8; color: #9a7b1a; }
.lag-missed { background: #fdecec; color: #b3261e; }
.mttp-caption {
  margin: 8px 0 0;
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  line-height: 1.4;
}
</style>
