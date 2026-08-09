<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="Software usage"
      subtitle="Who actually uses what's installed — reclaim unused seats at renewal"
    />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — how much of the shelf is actually used? ── -->
    <section class="su-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">Seats unused 90d+</span>
        <div class="hero-count-row">
          <span class="hero-count">{{ summary.unused_seats != null ? Number(summary.unused_seats).toLocaleString() : '—' }}</span>
          <span class="hero-count-of">of {{ summary.total_seats != null ? Number(summary.total_seats).toLocaleString() : '—' }} installed</span>
        </div>
        <span v-if="summary.pct_unused != null" class="hero-chip">{{ summary.pct_unused }}% of the shelf is idle</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          <template v-if="summary.total_seats">
            <span :class="Number(summary.pct_unused) >= 40 ? 'hl-fair' : 'hl-good'">{{ summary.pct_unused }}% of installed third-party seats</span>
            haven't been opened in 90 days — across {{ summary.apps_with_waste }} apps. Every idle seat is renewal budget and patch surface spent on nothing.
          </template>
          <template v-else>No third-party usage telemetry in this window.</template>
        </p>
        <p class="hero-support">Opened-vs-installed from adoption telemetry. Apple built-ins and bundled support binaries (helpers, uninstallers, updaters) are excluded from these totals — support binaries stay visible in the list below, flagged. Per-host drill-down respects Workers Council mode.</p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">Most idle apps</span>
        <div v-if="topIdle.length" class="hero-rail-list">
          <div v-for="a in topIdle" :key="a.app_name" class="hero-rail-row">
            <span class="hero-rail-label">{{ a.app_name }}</span>
            <span class="hero-rail-count">{{ a.unused_hosts }}</span>
          </div>
        </div>
        <span v-else class="hero-rail-empty">—</span>
      </div>
    </section>

    <!-- ─── Where the waste concentrates (portfolio view) ────── -->
    <section v-if="categoryRows.length" class="section">
      <div class="grammar-head">
        <h2 class="grammar-title">Where the waste concentrates</h2>
        <span class="grammar-hint">Idle seats by App Store category — computed over every app, not the list below</span>
      </div>
      <div class="cat-strip">
        <div v-for="c in categoryRows" :key="c.category" class="cat-row" :title="`${c.apps} apps · ${c.unused_seats} of ${c.seats} seats idle`">
          <span class="cat-label">{{ prettyCategory(c.category) }}</span>
          <MeterBar class="cat-bar" height="var(--bar-height)" :value="c.barPct" :color="shareColor(c.pct_unused)" />
          <span class="cat-count">{{ c.unused_seats }} idle · {{ c.pct_unused }}% of {{ c.seats }}</span>
        </div>
      </div>
    </section>

    <!-- Reclaim list, clustered by the decision each app calls for -->
    <section class="section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — the reclaim list</h2>
        <span class="grammar-hint">Grouped by action · apps with 3+ installs · unused = opened 90d+ ago or never</span>
      </div>

      <!-- Cluster filter: chips carry live counts; 'All' restores the grouped view -->
      <div v-if="clusters.length > 1" class="sw-filters">
        <button
          type="button"
          class="sw-filter"
          :class="{ 'is-active': clusterFilter === null }"
          @click="clusterFilter = null"
        >All {{ apps.length }}</button>
        <button
          v-for="g in clusters"
          :key="g.key"
          type="button"
          class="sw-filter"
          :class="[{ 'is-active': clusterFilter === g.key }, `sw-filter--${g.tone}`]"
          @click="clusterFilter = clusterFilter === g.key ? null : g.key"
        >{{ g.label }} {{ g.rows.length }}</button>
      </div>

      <div v-if="loading" class="sw-loading">Loading…</div>
      <EmptyState v-else-if="!apps.length" small title="No third-party app usage matches the current filter." />
      <EmptyState v-else-if="!visibleClusters.length" small title="No apps in this group under the current fleet filter." />
      <div v-else class="sw-table-wrapper">
        <table class="sw-table">
          <thead>
            <tr>
              <th class="sortable" @click="sortBy('app_name')">App {{ sortIcon('app_name') }}</th>
              <th class="sortable" @click="sortBy('category')">Category {{ sortIcon('category') }}</th>
              <th class="num sortable" @click="sortBy('installs')">Installs {{ sortIcon('installs') }}</th>
              <th class="num sortable" @click="sortBy('unused_hosts')">Unused {{ sortIcon('unused_hosts') }}</th>
              <th class="sw-bar-col sortable" @click="sortBy('pct_unused')">Unused share {{ sortIcon('pct_unused') }}</th>
            </tr>
          </thead>
          <tbody v-for="g in visibleClusters" :key="g.key">
            <tr class="sw-group-row">
              <td colspan="5">
                <span class="sw-group-title" :class="`sw-group-title--${g.tone}`">{{ g.label }}</span>
                <span class="sw-group-count">{{ g.rows.length }} app{{ g.rows.length === 1 ? '' : 's' }}<template v-if="g.idleSeats != null"> · {{ g.idleSeats }} idle seat{{ g.idleSeats === 1 ? '' : 's' }}</template></span>
                <span class="sw-group-hint">{{ g.hint }}</span>
              </td>
            </tr>
            <tr v-for="a in g.rows" :key="a.app_name">
              <td class="sw-app">{{ a.app_name }}</td>
              <td class="sw-cat">{{ prettyCategory(a.category) }}</td>
              <td class="num">{{ a.installs }}</td>
              <td class="num"><strong>{{ a.unused_hosts }}</strong></td>
              <td class="sw-bar-col">
                <div class="sw-bar-row">
                  <MeterBar class="sw-bar" height="var(--bar-height)" :value="a.pct_unused" :color="shareColor(a.pct_unused)" />
                  <span class="sw-bar-label">{{ a.pct_unused }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { query } from '../services/api'
import PageHeader from '../components/base/PageHeader.vue'
import MeterBar from '../components/base/MeterBar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useSort } from '../composables/useSort'

const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const loading = ref(false)
const summary = ref({})
const apps = ref([])
const wasteByCategory = ref([])

// Rail always shows the top reclaim targets regardless of table sort.
const topIdle = computed(() => [...apps.value].sort((a, b) => Number(b.unused_hosts) - Number(a.unused_hosts)).slice(0, 3))

const { sortKey, sortAsc, toggleSort, sortRows } = useSort('unused_hosts', false)
function sortBy(col) {
  toggleSort(col, !['app_name', 'category'].includes(col))
}
function sortIcon(col) {
  if (sortKey.value !== col) return ''
  return sortAsc.value ? '▲' : '▼'
}

// ─── Action clusters ──────────────────────────────────────────
// The reclaim decision differs by idle *share*, not idle count alone:
// nearly-fully idle apps are removal candidates, partially idle apps are
// seat-count negotiations, and well-adopted apps are working software that
// only appears here because a few seats are stale. Column sorting applies
// WITHIN each cluster; the grouping is the page's spine.
const CLUSTER_META = [
  { key: 'remove', label: 'Remove or unassign', tone: 'critical', min: 80, hint: '80%+ of installs idle — nobody is using this; pull it from the image or the assignment group' },
  { key: 'rightsize', label: 'Right-size at renewal', tone: 'fair', min: 40, hint: '40–79% idle — the app earns its place for some; reclaim the idle seats, keep the rest' },
  { key: 'healthy', label: 'Healthy adoption', tone: 'good', min: 0, hint: 'under 40% idle — working software; listed for the stale-seat tail only' },
]

// Support binaries (helpers, uninstallers, updaters) are flagged by the
// query, not hidden: they're never opened by design, so their idle numbers
// are inventory signal, not reclaimable seats. They get their own group at
// the bottom and are excluded from every seat total.
const SUPPORT_META = {
  key: 'support', label: 'Support binaries — not seats', tone: 'neutral',
  hint: 'bundled helpers/uninstallers/updaters; never opened by design, no license cost — shown for the inventory signal, excluded from the totals above',
}

const clusters = computed(() => {
  const groups = CLUSTER_META.map(m => ({ ...m, rows: [], idleSeats: 0 }))
  const support = { ...SUPPORT_META, rows: [], idleSeats: null }
  for (const a of apps.value) {
    if (Number(a.is_support_binary) === 1) { support.rows.push(a); continue }
    const pct = Number(a.pct_unused) || 0
    const g = groups.find(m => pct >= m.min)
    if (g) { g.rows.push(a); g.idleSeats += Number(a.unused_hosts) || 0 }
  }
  for (const g of groups) g.rows = sortRows(g.rows)
  support.rows = sortRows(support.rows)
  return [...groups, support].filter(g => g.rows.length)   // never render an empty group
})

// Chip filter: null = all groups. A stale selection (group emptied by the
// fleet filter) renders the honest empty state rather than silently resetting.
const clusterFilter = ref(null)
const visibleClusters = computed(() =>
  clusterFilter.value === null
    ? clusters.value
    : clusters.value.filter(g => g.key === clusterFilter.value)
)

// Category rollup (server-side over ALL apps — not the capped list). Bars
// are scaled to the largest category so relative size reads at a glance.
const categoryRows = computed(() => {
  const rows = wasteByCategory.value.filter(c => Number(c.unused_seats) > 0)
  const max = Math.max(...rows.map(c => Number(c.unused_seats)), 1)
  return rows.slice(0, 8).map(c => ({
    ...c,
    unused_seats: Number(c.unused_seats),
    seats: Number(c.seats),
    pct_unused: Number(c.pct_unused),
    barPct: Math.max(2, (Number(c.unused_seats) / max) * 100),
  }))
})

// "public.app-category.developer-tools" → "Developer tools"
function prettyCategory(c) {
  if (!c) return '—'
  const tail = String(c).split('.').pop() || ''
  if (!tail) return '—'
  const words = tail.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
// Unused-share severity thresholds (same bands as the old shareClass).
function shareColor(pct) {
  return pct >= 80 ? 'var(--status-critical)' : pct >= 50 ? 'var(--status-fair)' : 'var(--status-good)'
}

async function load() {
  error.value = null
  loading.value = true
  try {
    const [s, list, cats] = await Promise.all([
      query('firehose.adoption.waste_summary', fp()),
      query('firehose.adoption.license_waste', { ...fp(), minInstalls: 3, limit: 100 }),
      query('firehose.adoption.waste_by_category', { ...fp(), minInstalls: 3 }).catch(() => []),
    ])
    summary.value = s[0] || {}
    apps.value = list || []
    wasteByCategory.value = cats || []
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

/* ─── Briefing hero ────────────────────────────── */
.su-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 300px 1fr 280px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}
.hero-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 56px; font-weight: 700; line-height: 0.9; }
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
.hero-chip { display: inline-flex; align-self: flex-start; padding: 3px 9px; border-radius: var(--radius); background: rgba(255,255,255,0.1); color: var(--fleet-black-10); font-size: var(--font-size-sm); font-weight: 600; }
.hero-narrative { display: flex; flex-direction: column; gap: 12px; border-left: 1px solid var(--fleet-blue); padding-left: 40px; }
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hl-fair { color: var(--status-fair); }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }
.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.06); border-radius: var(--radius-medium); font-size: var(--font-size-base); }
.hero-rail-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }
.hero-rail-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

.grammar-head { display: flex; align-items: baseline; justify-content: space-between; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

@media (max-width: 1100px) {
  .su-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
}

/* ─── Most-wasted apps table (kept hand-rolled: gauge cells) ─── */
.sw-table-wrapper {
  width: 100%;
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.sw-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: var(--table-font-size);
}
.sw-table th {
  text-align: left;
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  font-size: var(--table-header-font-size);
  color: var(--fleet-black);
  font-weight: 700;
  border-bottom: 1px solid var(--fleet-black-10);
  background: var(--fleet-off-white);
  white-space: nowrap;
}
.sw-table td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  color: var(--fleet-black-75);
  border-bottom: 1px solid var(--fleet-black-10);
  vertical-align: middle;
}
.sw-table tr:last-child td { border-bottom: none; }
.sw-table tbody tr:hover td { background: var(--fleet-off-white); }
.sw-table th.sortable { cursor: pointer; user-select: none; }
.sw-table th.sortable:hover { color: var(--fleet-black); }
.sw-table th.num { text-align: right; }
.sw-app { font-weight: 500; color: var(--fleet-black); }
.sw-cat { color: var(--fleet-black-50); font-size: var(--font-size-xs); }
.num { text-align: right; font-variant-numeric: tabular-nums; }

/* ─── Category concentration strip ─────────────── */
.cat-strip {
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium) var(--pad-large);
}
.cat-row {
  display: grid;
  grid-template-columns: 160px 1fr 200px;
  align-items: center;
  gap: 14px;
}
.cat-label {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cat-count {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ─── Cluster filter chips ─────────────────────── */
.sw-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.sw-filter {
  border: 1px solid var(--fleet-black-10);
  background: var(--fleet-white);
  border-radius: var(--radius-full);
  padding: 4px 12px;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
  cursor: pointer;
}
.sw-filter:hover { border-color: var(--fleet-black-25); }
.sw-filter.is-active { background: var(--fleet-black); border-color: var(--fleet-black); color: var(--fleet-white); }
.sw-filter--critical:not(.is-active) { color: var(--status-critical-text); }
.sw-filter--fair:not(.is-active) { color: var(--status-fair-text); }
.sw-filter--good:not(.is-active) { color: var(--status-good-text); }
.sw-filter--neutral:not(.is-active) { color: var(--fleet-black-50); }
.sw-filter:focus-visible { outline: 1px solid var(--fleet-focused-outline); outline-offset: 2px; }

/* ─── Cluster group rows ───────────────────────── */
.sw-group-row td {
  background: var(--fleet-off-white);
  padding-top: 10px;
  padding-bottom: 10px;
}
.sw-group-title {
  font-weight: 700;
  font-size: var(--font-size-sm);
  margin-right: 10px;
}
.sw-group-title--critical { color: var(--status-critical-text); }
.sw-group-title--fair { color: var(--status-fair-text); }
.sw-group-title--good { color: var(--status-good-text); }
.sw-group-title--neutral { color: var(--fleet-black-50); }
.sw-group-count {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-75);
  margin-right: 10px;
}
.sw-group-hint { font-size: var(--font-size-xs); color: var(--fleet-black-50); }

.sw-bar-col { width: 200px; }
.sw-bar-row { display: flex; align-items: center; gap: 10px; }
.sw-bar { flex: 1; }
.sw-bar-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-75);
  min-width: 38px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.sw-loading {
  text-align: center;
  color: var(--fleet-black-50);
  font-style: italic;
  padding: 28px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
</style>
