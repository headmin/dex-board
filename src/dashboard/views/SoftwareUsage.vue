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
        <div
          v-for="c in categoryRows"
          :key="c.category"
          class="cat-row cat-row--clickable"
          :class="{ 'cat-row--active': categoryFilter === c.category }"
          role="button"
          tabindex="0"
          :title="`${c.apps} apps · ${c.unused_seats} of ${c.seats} seats idle — click to filter the list below`"
          @click="toggleCategory(c.category)"
          @keydown.enter="toggleCategory(c.category)"
        >
          <span class="cat-label">{{ prettyCategory(c.category) }}</span>
          <MeterBar class="cat-bar" height="var(--bar-height)" :value="c.barPct" :color="shareColor(c.pct_unused)" />
          <span class="cat-count">{{ c.unused_seats }} idle · {{ c.pct_unused }}% of {{ c.seats }}</span>
        </div>
      </div>
    </section>

    <!-- Reclaim list, clustered by the decision each app calls for -->
    <section class="section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — the reclaim list<template v-if="categoryFilter"> · {{ prettyCategory(categoryFilter) }}</template></h2>
        <span class="grammar-hint">
          <template v-if="categoryFilter">every app in this category · <button type="button" class="sw-clear-cat" @click="toggleCategory(categoryFilter)">show all categories ✕</button></template>
          <template v-else>Grouped by action · apps with 3+ installs · unused = opened 90d+ ago or never</template>
        </span>
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
            <template v-for="a in g.rows" :key="a.app_name">
              <tr
                :class="{ 'sw-row--clickable': !wcMode, 'sw-row--open': drillApp === a.app_name }"
                :title="wcMode ? undefined : `Show the ${a.unused_hosts} hosts with an idle seat`"
                @click="!wcMode && toggleDrill(a.app_name)"
              >
                <td class="sw-app"><span v-if="!wcMode" class="sw-drill-arrow">{{ drillApp === a.app_name ? '▾' : '▸' }}</span>{{ a.app_name }}</td>
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
              <tr v-if="drillApp === a.app_name && !wcMode" class="sw-drill-row">
                <td colspan="5">
                  <div v-if="drillLoading" class="sw-drill-loading">Loading hosts…</div>
                  <div v-else-if="drillHosts === null" class="sw-drill-loading">Host list unavailable — the query failed.</div>
                  <template v-else>
                    <div class="sw-drill-list">
                      <router-link
                        v-for="h in drillHosts.slice(0, drillShown)"
                        :key="h.host_id"
                        :to="`/hosts/${h.host_id}`"
                        class="sw-drill-host"
                      >
                        <span class="sw-drill-name">{{ displayHost(h) }}</span>
                        <span class="sw-drill-version">{{ h.version ? 'v' + h.version : '—' }}</span>
                        <span class="sw-drill-days">{{ drillDaysLabel(h) }}</span>
                      </router-link>
                    </div>
                    <div v-if="drillHosts.length > drillShown || drillCapped(a) || drillHosts.length > DRILL_PAGE" class="sw-drill-actions">
                      <button v-if="drillHosts.length > drillShown" type="button" class="sw-drill-btn" @click="drillShown += DRILL_PAGE">
                        Show {{ Math.min(DRILL_PAGE, drillHosts.length - drillShown) }} more ({{ drillShown }} of {{ drillHosts.length }} shown)
                      </button>
                      <button type="button" class="sw-drill-btn" @click="exportDrillCsv(a)">
                        Export CSV ({{ drillHosts.length }} hosts)
                      </button>
                      <span v-if="drillCapped(a)" class="sw-drill-cap">
                        fetched the first {{ drillHosts.length.toLocaleString() }} of {{ Number(a.unused_hosts).toLocaleString() }} — the export contains only these
                      </span>
                    </div>
                  </template>
                </td>
              </tr>
            </template>
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
import { useWorkersCouncil } from '../composables/useWorkersCouncil'
import { displayHost } from '../composables/displayName'

const { wcMode } = useWorkersCouncil()
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

// ─── Per-app drill-down: who holds the idle seats? ────────────
// Hidden entirely in Workers Council mode — the drill is a per-host list.
// drillHosts: null = fetch failed (distinct from an empty list).
// Scale: the fetch is capped at DRILL_FETCH_CAP hosts (disclosed when the
// row's count is larger) and the render pages in DRILL_PAGE steps — a
// thousand-host drill must not become a thousand DOM rows at once. At that
// size the actionable artifact is the CSV export, not the on-screen list.
const DRILL_PAGE = 50
const DRILL_FETCH_CAP = 2000
const drillApp = ref(null)
const drillHosts = ref([])
const drillLoading = ref(false)
const drillShown = ref(DRILL_PAGE)

async function toggleDrill(appName) {
  if (drillApp.value === appName) { drillApp.value = null; return }
  drillApp.value = appName
  drillShown.value = DRILL_PAGE
  drillLoading.value = true
  drillHosts.value = await query('firehose.adoption.unused_hosts_for_app', { ...fp(), appName, limit: DRILL_FETCH_CAP })
    .catch(() => null)
  drillLoading.value = false
}

function drillCapped(appRow) {
  return Array.isArray(drillHosts.value) && Number(appRow.unused_hosts) > drillHosts.value.length
}

// CSV of the fetched host list — the at-scale artifact for MDM/ticketing.
function exportDrillCsv(appRow) {
  if (!Array.isArray(drillHosts.value) || !drillHosts.value.length) return
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    ['hostname', 'host_id', 'version', 'days_since_opened', 'usage_tier'].join(','),
    ...drillHosts.value.map(h =>
      [esc(displayHost(h)), esc(h.host_id), esc(h.version), esc(h.days_since_opened), esc(h.usage_tier)].join(',')
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const safe = String(appRow.app_name).replace(/\.app$/, '').replace(/[^\w-]+/g, '-').toLowerCase()
  a.download = `idle-seats-${safe}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Category filter (the strip is the control) ───────────────
// Selecting a category refetches the list scoped server-side, so it shows
// EVERY app in that category — not the slice that survived the global
// top-100 — and the action clusters recompute within it.
const categoryFilter = ref('')
function toggleCategory(cat) {
  categoryFilter.value = categoryFilter.value === cat ? '' : cat
}
watch(categoryFilter, load)

function drillDaysLabel(h) {
  if (h.usage_tier === 'never_opened') return 'never opened'
  const d = Number(h.days_since_opened)
  // days = 0 with a stale tier means the app has no last-opened timestamp
  // at all — say that, instead of a dash that reads like missing data.
  return isFinite(d) && d > 0 ? `${Math.round(d)}d since opened` : 'no open on record'
}

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
    // The hero totals and the category strip stay fleet-wide; only the
    // reclaim list scopes to the selected category (server-side, at a
    // higher limit so a category drill shows EVERY app in it).
    const [s, list, cats] = await Promise.all([
      query('firehose.adoption.waste_summary', fp()),
      query('firehose.adoption.license_waste', {
        ...fp(),
        minInstalls: 3,
        limit: categoryFilter.value ? 500 : 100,
        category: categoryFilter.value,
      }),
      query('firehose.adoption.waste_by_category', { ...fp(), minInstalls: 3 }).catch(() => []),
    ])
    summary.value = s[0] || {}
    apps.value = list || []
    wasteByCategory.value = cats || []
    // A drill fetched under the previous fleet filter no longer matches the
    // row counts — close it rather than show a stale host list.
    drillApp.value = null
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
  padding: 3px 8px;
  border-radius: var(--radius-medium);
}
.cat-row--clickable { cursor: pointer; }
.cat-row--clickable:hover { background: var(--fleet-off-white); }
.cat-row--clickable:focus-visible { outline: 1px solid var(--fleet-focused-outline); outline-offset: 1px; }
.cat-row--active { background: var(--fleet-black-5); box-shadow: inset 2px 0 0 var(--fleet-black); }

.sw-clear-cat {
  border: 0;
  background: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.sw-clear-cat:hover { color: var(--fleet-black); }
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

/* ─── Idle-seat drill-down ─────────────────────── */
.sw-row--clickable { cursor: pointer; }
.sw-row--open td { background: var(--fleet-off-white); }
.sw-drill-arrow { display: inline-block; width: 16px; color: var(--fleet-black-33); font-size: var(--font-size-xs); }
.sw-drill-row td { background: var(--fleet-off-white); padding: 6px 14px 12px 30px; }
.sw-drill-loading { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }
.sw-drill-list { display: flex; flex-direction: column; gap: 2px; }
.sw-drill-host {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 120px 160px;
  gap: 12px;
  align-items: baseline;
  padding: 3px 8px;
  border-radius: var(--radius);
  text-decoration: none;
}
.sw-drill-host:hover { background: var(--fleet-white); }
.sw-drill-name { font-size: var(--font-size-sm); font-weight: 500; color: var(--fleet-black); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sw-drill-version { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.sw-drill-days { font-size: var(--font-size-xs); color: var(--fleet-black-50); text-align: right; font-variant-numeric: tabular-nums; }
.sw-drill-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
.sw-drill-btn {
  border: 1px solid var(--fleet-black-10);
  background: var(--fleet-white);
  border-radius: var(--radius-full);
  padding: 3px 11px;
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-75);
  cursor: pointer;
}
.sw-drill-btn:hover { border-color: var(--fleet-black-25); color: var(--fleet-black); }
.sw-drill-cap { font-size: var(--font-size-xs); color: var(--status-fair-text); }

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
