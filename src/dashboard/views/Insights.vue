<template>
  <div class="insights-page page-stack">
    <!-- ─── Header ──────────────────────────────────────────── -->
    <div class="in-header">
      <div>
        <h1 class="in-title">Insights</h1>
        <div class="in-page-subtitle">Findings the telemetry supports — every claim carries its evidence and its population</div>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — what's on the table ────────────────────── -->
    <section class="in-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">Open findings</span>
        <div class="hero-count-row">
          <span class="hero-count">{{ findings.length }}</span>
          <span class="hero-count-of">{{ totalPopulation }} host-signals affected</span>
        </div>
        <span v-if="configCount" class="hero-chip">{{ configCount }} of {{ findings.length }} are config or policy — no hardware spend</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          <template v-if="findings.length">
            <template v-if="configCount === findings.length">Every open finding is <span class="hl-good">configuration or policy, not hardware</span> — they cost nothing but a change window.</template>
            <template v-else-if="configCount">{{ configCount }} of {{ findings.length }} findings are <span class="hl-good">configuration or policy, not hardware</span> — they cost nothing but a change window.</template>
            <template v-else>The open findings need investigation or spend — none is a pure config fix.</template>
          </template>
          <template v-else>No findings pass their evidence thresholds right now — the telemetry doesn't support a claim.</template>
        </p>
        <p v-if="overlapNote" class="hero-support">{{ overlapNote }}</p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">Largest populations</span>
        <div v-if="railRows.length" class="hero-rail-list">
          <div v-for="r in railRows" :key="r.id" class="hero-rail-row">
            <span class="hero-rail-label">{{ r.short }}</span>
            <span class="hero-rail-count">{{ r.population }}</span>
          </div>
        </div>
        <span v-else class="hero-rail-empty">—</span>
      </div>
    </section>

    <!-- ─── Why — the findings and their evidence ───────────── -->
    <section class="grammar-section" id="findings">
      <div class="grammar-head">
        <h2 class="grammar-title">Why — the findings and their evidence</h2>
        <div class="in-filters">
          <button type="button" class="in-filter" :class="{ 'is-active': categoryFilter === null }" @click="categoryFilter = null">All {{ findings.length }}</button>
          <button
            v-for="c in categoryCounts"
            :key="c.key"
            type="button"
            class="in-filter"
            :class="{ 'is-active': categoryFilter === c.key }"
            @click="categoryFilter = categoryFilter === c.key ? null : c.key"
          >{{ c.label }} {{ c.count }}</button>
        </div>
      </div>

      <div v-if="loading" class="in-loading">Analyzing telemetry…</div>
      <EmptyState
        v-else-if="!visibleFindings.length"
        small
        :title="failedCount
          ? 'Findings can\'t be evaluated — some telemetry queries failed.'
          : 'No findings pass their evidence thresholds in this window.'"
      />

      <div
        v-for="f in visibleFindings"
        :key="f.id"
        class="finding-card"
        :class="{ 'finding-card--open': expandedId === f.id }"
        @click="expandedId = expandedId === f.id ? null : f.id"
      >
        <div class="finding-head">
          <div class="finding-title-group">
            <div class="finding-title-row">
              <span class="finding-cat">{{ categoryLabel(f.category) }}</span>
              <h3 class="finding-title">{{ f.title }}</h3>
              <span v-if="f.overlap" class="finding-overlap">{{ f.overlap }}</span>
            </div>
            <p class="finding-body">{{ f.body }}</p>
          </div>
          <div class="finding-side">
            <span class="finding-pop">{{ f.population }}</span>
            <span class="finding-pop-label">{{ f.populationLabel }}</span>
            <span class="finding-effort">{{ f.effort }} effort · {{ f.kind }}</span>
          </div>
          <span class="finding-caret">{{ expandedId === f.id ? '▾' : '▸' }}</span>
        </div>

        <template v-if="expandedId === f.id">
          <div v-if="f.evidence && f.evidence.length" class="finding-evidence" @click.stop>
            <div v-for="panel in f.evidence" :key="panel.label" class="evidence-panel">
              <span class="evidence-label">{{ panel.label }}</span>
              <div v-for="row in panel.rows" :key="row.label" class="evidence-row">
                <span class="evidence-row-label" :title="row.label">{{ row.label }}</span>
                <div class="evidence-meter">
                  <div class="evidence-fill" :style="{ width: row.pct + '%', background: row.color }"></div>
                </div>
                <span class="evidence-value"><strong>{{ row.value }}</strong> <span class="evidence-unit">{{ row.unit }}</span></span>
              </div>
              <span v-if="panel.note" class="evidence-note">{{ panel.note }}</span>
            </div>
          </div>
          <div class="finding-rec" @click.stop>
            <span class="finding-rec-text"><strong>Recommended:</strong> {{ f.recommendation }}</span>
            <router-link v-if="f.link" :to="f.link.to" custom v-slot="{ navigate }">
              <BaseButton variant="secondary" size="small" @click="navigate">{{ f.link.label }}</BaseButton>
            </router-link>
          </div>
        </template>
      </div>
    </section>

    <!-- ─── Act — ranked by effort ──────────────────────────── -->
    <section v-if="findings.length" class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — ranked by effort</h2>
        <span class="grammar-hint">Low-effort configuration and policy changes first — impact lives in each finding's evidence</span>
      </div>
      <div class="act-card">
        <table class="act-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Category</th>
              <th class="num">Population</th>
              <th>Effort</th>
              <th>Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in actRows" :key="f.id" class="act-row" @click="expandFinding(f.id)">
              <td class="act-action">{{ f.action }}</td>
              <td class="act-muted">{{ categoryLabel(f.category) }}</td>
              <td class="num act-hosts">{{ f.population }}</td>
              <td><span class="effort-badge" :class="`effort--${f.effort}`">{{ f.effort }}</span></td>
              <td class="act-muted">{{ f.cost }}</td>
              <td class="act-caret">→</td>
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
import BaseButton from '../components/base/BaseButton.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { useFleetFilter } from '../composables/useFleetFilter'
import { chipInfo, verdictFor } from '../composables/chipAge'
import { palette } from '../composables/uiPalette'

const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const failedCount = ref(0)
const loading = ref(false)
const expandedId = ref(null)
const categoryFilter = ref(null)

const agents = ref([])
const ramTiers = ref([])
const crashers = ref([])
const crashSummary = ref({})
const waste = ref({})
const uptimeDist = ref([])
const lifecycleRows = ref([])

async function load() {
  loading.value = true
  error.value = null
  try {
    // Catch to null (not []) so a failed query is distinguishable from an
    // empty result — "no findings" must never be how an outage renders.
    const results = await Promise.all([
      query('firehose.insights.agent_overhead', { limit: 8, ...fp() }).catch(() => null),
      query('firehose.insights.pressure_by_ram_tier', fp()).catch(() => null),
      query('firehose.crashes.top_crashers', { limit: 5, ...fp() }).catch(() => null),
      query('firehose.crashes.summary', fp()).catch(() => null),
      query('firehose.adoption.waste_summary', fp()).catch(() => null),
      query('firehose.health.uptime_distribution', fp()).catch(() => null),
      query('firehose.lifecycle.refresh_candidates', { limit: 200, ...fp() }).catch(() => null),
    ])
    const [ag, tiers, top, cs, ws, up, lc] = results
    failedCount.value = results.filter(r => r === null).length
    if (failedCount.value) {
      error.value = `${failedCount.value} of ${results.length} data queries failed — findings below may be incomplete.`
    }
    agents.value = ag || []
    ramTiers.value = tiers || []
    crashers.value = top || []
    crashSummary.value = (cs || [])[0] || {}
    waste.value = (ws || [])[0] || {}
    uptimeDist.value = up || []
    lifecycleRows.value = lc || []
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
}

onMounted(load)
watch(filterParams, load, { deep: true })

// ─── The findings engine ──────────────────────────────────────
// Each finding computes its claim from live query results and only emits
// when its own evidence threshold passes. Effort/kind/cost are playbook
// metadata describing the ACTION; every number in a claim is queried.

const CATEGORY_LABELS = { performance: 'Performance', software: 'Software', device_health: 'Device health' }
function categoryLabel(key) {
  return CATEGORY_LABELS[key] || key
}

// Second evidence panel for the agent finding: headroom in GB by RAM tier.
function headroomPanel() {
  const tiers = ramTiers.value.filter(t => Number(t.device_count) > 0 && Number(t.avg_total_ram_gb) > 0)
  if (tiers.length < 2) return null
  const rows = tiers.map(t => {
    const free = Math.round((Number(t.avg_total_ram_gb) - Number(t.avg_used_gb)) * 10) / 10
    const usedPct = Math.min(100, Math.round((Number(t.avg_used_gb) / Number(t.avg_total_ram_gb)) * 100))
    return {
      label: t.ram_tier,
      pct: Math.max(2, usedPct),
      color: free < 2 ? palette.critical : free < 6 ? palette.fair : palette.good,
      value: `${free} GB`,
      unit: `free · ${t.device_count} host${Number(t.device_count) === 1 ? '' : 's'}`,
    }
  })
  return {
    label: 'Evidence — app-memory headroom by RAM tier',
    rows,
    note: 'Bars show the share of RAM held by apps on average. Headroom in gigabytes is the honest measure — percentages punish big machines for doing big work.',
  }
}

const findings = computed(() => {
  const out = []

  // 1 — Management agent overhead (firehose.insights.agent_overhead)
  if (agents.value.length >= 2) {
    const top = [...agents.value].sort((a, b) => Number(b.avg_mem_mb) - Number(a.avg_mem_mb)).slice(0, 5)
    const combined = Math.round(top.reduce((s, a) => s + Number(a.avg_mem_mb), 0))
    const fleetGb = Math.round(agents.value.reduce((s, a) => s + Number(a.fleet_cost_mb || 0), 0) / 1024 * 10) / 10
    const pop = Math.max(...agents.value.map(a => Number(a.device_count) || 0))
    if (combined >= 500) {
      const maxAvg = Number(top[0].avg_mem_mb) || 1
      out.push({
        id: 'agent-overhead',
        category: 'performance',
        title: `Management agents hold ~${(combined / 1024).toFixed(1)} GB resident per host`,
        short: 'Agent overhead',
        body: `The top ${top.length} management agents average ${combined} MB resident combined on hosts that run them — fleet-wide, agents hold ~${fleetGb} GB of RAM. On a 16 GB host that is roughly ${Math.round((combined / 1024 / 16) * 100)}% of total memory before any user app opens.`,
        population: pop,
        populationLabel: 'hosts running agents',
        effort: 'low',
        kind: 'config',
        cost: 'none',
        action: 'Review agent set and scan frequency on low-RAM hosts',
        recommendation: 'review which agents low-RAM hosts actually need and lower inventory/scan frequency where policy allows — the same agent set costs a 16 GB machine a far larger share of its memory than a 48 GB one.',
        link: { to: '/hosts', label: 'View hosts' },
        evidence: [
          {
            label: 'Evidence — agent RAM, fleet-wide',
            rows: top.map(a => ({
              label: a.app_name || a.bundle_identifier,
              pct: Math.round((Number(a.avg_mem_mb) / maxAvg) * 100),
              color: Number(a.avg_mem_mb) >= 400 ? palette.critical : Number(a.avg_mem_mb) >= 250 ? palette.elevated : Number(a.avg_mem_mb) >= 150 ? palette.fair : palette.good,
              value: `${Math.round(a.avg_mem_mb)} MB`,
              unit: `avg · ${a.device_count} hosts`,
            })),
          },
          headroomPanel(),
        ].filter(Boolean),
      })
    }
  }

  // 2 — Sustained severe swap on current silicon (lifecycle verdicts)
  const investigate = lifecycleRows.value.filter(h => {
    const info = chipInfo(h.cpu_class)
    return verdictFor(Number(h.refresh_score) >= 30, info?.gensBehind ?? null, {
      weakDays: Number(h.days_pressured_30d) || 0,
      reportDays: Number(h.days_reporting_30d) || 0,
      severeDays: Number(h.days_severe_30d) || 0,
    }).key === 'investigate'
  })
  if (investigate.length >= 3) {
    const severeDaysSorted = investigate.map(h => Number(h.days_severe_30d)).sort((a, b) => a - b)
    const medianSevere = severeDaysSorted[Math.floor(severeDaysSorted.length / 2)]
    out.push({
      id: 'current-silicon-strain',
      category: 'performance',
      title: `${investigate.length} current-silicon hosts run in severe swap most days`,
      short: 'Current-silicon strain',
      body: `${investigate.length} hosts on current silicon spend at least half their reporting days under severe swap pressure — the median is ${medianSevere} severe days in 30. Their hardware age is not the problem; the workload or the RAM spec is.`,
      population: investigate.length,
      populationLabel: 'hosts',
      effort: 'medium',
      kind: 'investigation',
      cost: 'none',
      action: 'Investigate workload / spec on strained current-silicon hosts',
      recommendation: 'investigate what these hosts run before any purchase — replacing current silicon buys nothing. The same hosts appear on the Lifecycle page under "Investigate".',
      overlap: 'Overlaps Lifecycle',
      link: { to: '/lifecycle', label: 'Open Lifecycle' },
      evidence: null,
    })
  }

  // 3 — Reboot hygiene (firehose.health.uptime_distribution)
  const stale14 = uptimeDist.value.filter(r => ['stale_14d', 'stale_30d'].includes(r.uptime_risk)).reduce((s, r) => s + Number(r.device_count), 0)
  const stale7 = uptimeDist.value.filter(r => r.uptime_risk === 'stale_7d').reduce((s, r) => s + Number(r.device_count), 0)
  if (stale14 >= 3) {
    const maxCount = Math.max(...uptimeDist.value.map(r => Number(r.device_count) || 0), 1)
    out.push({
      id: 'reboot-hygiene',
      category: 'device_health',
      title: `${stale14} hosts have not rebooted in 14+ days`,
      short: 'Reboot hygiene',
      body: `${stale14} hosts sit past the 14-day uptime threshold the OS-health classifier treats as degraded${stale7 ? `, and another ${stale7} are past 7 days` : ''}. Long uptimes hold back patches and let memory fragmentation accumulate.`,
      population: stale14,
      populationLabel: 'hosts',
      effort: 'low',
      kind: 'policy',
      cost: 'none',
      action: 'Scheduled reboot nudge past 14 days of uptime',
      recommendation: 'a scheduled reboot nudge (or a forced restart window) for hosts past 14 days of uptime — the OS-health classifier already marks them degraded at that point.',
      link: { to: '/hosts', label: 'View hosts' },
      evidence: [{
        label: 'Evidence — uptime distribution',
        rows: uptimeDist.value.map(r => ({
          label: String(r.uptime_risk).replace(/_/g, ' '),
          pct: Math.max(2, Math.round((Number(r.device_count) / maxCount) * 100)),
          color: ['stale_14d', 'stale_30d'].includes(r.uptime_risk) ? palette.critical : r.uptime_risk === 'stale_7d' ? palette.fair : palette.good,
          value: r.device_count,
          unit: 'hosts',
        })),
      }],
    })
  }

  // 4 — Crash concentration (firehose.crashes.top_crashers)
  const totalCrashes = Number(crashSummary.value.total_crashes_7d) || 0
  if (crashers.value.length && totalCrashes >= 10) {
    const top = crashers.value[0]
    const topN = Number(top.total_crashes_7d) || 0
    const pct = Math.round((topN / totalCrashes) * 100)
    if (pct >= 25) {
      const maxN = topN || 1
      out.push({
        id: 'crash-concentration',
        category: 'software',
        title: `${top.crashed_identifier} accounts for ${pct}% of fleet crashes this week`,
        short: 'Crash concentration',
        body: `${topN} of ${totalCrashes} crashes in the last 7 days come from ${top.crashed_identifier} (${top.affected_devices} host${Number(top.affected_devices) === 1 ? '' : 's'}, worst severity ${top.worst_severity}). One identifier owns most of the fleet's crash budget.`,
        population: Number(top.affected_devices) || 0,
        populationLabel: 'hosts affected',
        effort: 'medium',
        kind: 'investigation',
        cost: 'none',
        action: `Investigate ${top.crashed_identifier} on affected hosts`,
        recommendation: `investigate ${top.crashed_identifier} on the affected host${Number(top.affected_devices) === 1 ? '' : 's'} — with ${pct}% of all crashes in one identifier, one fix moves the whole software category.`,
        link: { to: '/analytics', label: 'Open Analytics' },
        evidence: [{
          label: 'Evidence — top crashers, 7 days',
          rows: crashers.value.map(c => ({
            label: c.crashed_identifier,
            pct: Math.max(2, Math.round((Number(c.total_crashes_7d) / maxN) * 100)),
            color: c.worst_severity === 'critical' ? palette.critical : c.worst_severity === 'elevated' ? palette.elevated : palette.fair,
            value: c.total_crashes_7d,
            unit: `crashes · ${c.affected_devices} host${Number(c.affected_devices) === 1 ? '' : 's'}`,
          })),
        }],
      })
    }
  }

  // 5 — License waste (firehose.adoption.waste_summary)
  const unused = Number(waste.value.unused_seats) || 0
  const totalSeats = Number(waste.value.total_seats) || 0
  if (totalSeats >= 50 && unused / totalSeats >= 0.2) {
    out.push({
      id: 'license-waste',
      category: 'software',
      title: `${Math.round((unused / totalSeats) * 100)}% of installed seats sit unused for 90+ days`,
      short: 'License waste',
      body: `${unused.toLocaleString()} of ${totalSeats.toLocaleString()} installed app seats have not been opened in 90 days, across ${waste.value.apps_with_waste} apps. Every unused seat is renewal budget and update surface spent on nothing.`,
      population: unused,
      populationLabel: 'unused seats',
      effort: 'low',
      kind: 'process',
      cost: 'reclaims budget',
      action: 'Reclaim seats unused 90+ days at renewal',
      recommendation: 'take the shelfware list into the next renewal cycle — the Software usage page ranks apps by reclaimable seats.',
      link: { to: '/software-usage', label: 'Open Software usage' },
      evidence: null,
    })
  }

  return out
})

// ─── Derived UI state ─────────────────────────────────────────
const visibleFindings = computed(() =>
  categoryFilter.value ? findings.value.filter(f => f.category === categoryFilter.value) : findings.value
)

const categoryCounts = computed(() => {
  const counts = new Map()
  for (const f of findings.value) counts.set(f.category, (counts.get(f.category) || 0) + 1)
  return [...counts.entries()].map(([key, count]) => ({ key, label: categoryLabel(key), count }))
})

const configCount = computed(() => findings.value.filter(f => ['config', 'policy', 'process'].includes(f.kind)).length)
const totalPopulation = computed(() => findings.value.reduce((s, f) => s + (f.population || 0), 0).toLocaleString())

const overlapNote = computed(() => {
  const o = findings.value.find(f => f.overlap)
  return o ? `"${o.short}" overlaps the Lifecycle shortlist — the same hosts appear there. Don't count it twice.` : ''
})

const railRows = computed(() =>
  [...findings.value].sort((a, b) => (b.population || 0) - (a.population || 0)).slice(0, 3)
)

const EFFORT_RANK = { low: 0, medium: 1, high: 2 }
const actRows = computed(() =>
  [...findings.value].sort((a, b) =>
    (EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort]) || (b.population || 0) - (a.population || 0)
  )
)

function expandFinding(id) {
  categoryFilter.value = null
  expandedId.value = id
  document.getElementById('findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<style scoped>
.insights-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-large);
}

/* ─── Header ───────────────────────────────────── */
.in-header { display: flex; align-items: flex-end; justify-content: space-between; }
.in-title { margin: 0; font-size: 24px; font-weight: 700; color: var(--fleet-black); }
.in-page-subtitle { font-size: var(--font-size-base); color: var(--fleet-black-75); margin-top: 3px; }

/* ─── Hero ─────────────────────────────────────── */
.in-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 300px 1fr 300px;
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

.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 60px; font-weight: 700; line-height: 0.9; }
.hero-count-of { font-size: 14px; color: var(--fleet-black-33); }
.hero-chip {
  display: inline-flex;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.1);
  color: var(--fleet-black-10);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.hero-narrative {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 1px solid var(--fleet-blue);
  padding-left: 40px;
}
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }

.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-base);
}
.hero-rail-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }
.hero-rail-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

/* ─── Grammar ──────────────────────────────────── */
.grammar-section { display: flex; flex-direction: column; gap: var(--pad-smedium); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

.in-filters { display: flex; gap: 6px; }
.in-filter {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--fleet-black-25);
  border-radius: var(--radius);
  background: var(--fleet-white);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  cursor: pointer;
}
.in-filter.is-active {
  background: var(--fleet-black);
  border-color: var(--fleet-black);
  color: var(--fleet-white);
  font-weight: 600;
}
.in-filter:focus-visible { outline: 1px solid var(--fleet-focused-outline); outline-offset: 1px; }

.in-loading { text-align: center; color: var(--fleet-black-50); font-style: italic; padding: 28px; }

/* ─── Finding cards ────────────────────────────── */
.finding-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: 18px var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: 16px;
  cursor: pointer;
  transition: border-color var(--transition-base);
}
.finding-card:hover { border-color: var(--fleet-black-25); }
.finding-card--open { border: 2px solid var(--fleet-black); padding: 17px calc(var(--pad-large) - 1px); cursor: default; }

.finding-head { display: flex; align-items: flex-start; gap: 24px; }
.finding-title-group { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.finding-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.finding-cat {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 3px;
  background: var(--info-tint);
  color: var(--fleet-vibrant-blue);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  white-space: nowrap;
}

.finding-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.finding-card--open .finding-title { font-size: 16px; }

.finding-overlap {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 3px;
  background: var(--status-fair-bg);
  color: var(--status-fair-text);
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
}

.finding-body {
  margin: 0;
  font-size: var(--font-size-base);
  line-height: 1.6;
  color: var(--fleet-black-75);
  max-width: 820px;
  text-wrap: pretty;
}

.finding-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
  flex-shrink: 0;
}
.finding-pop { font-size: 24px; font-weight: 700; line-height: 1; color: var(--fleet-black); }
.finding-pop-label { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.finding-effort { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); margin-top: 4px; }

.finding-caret { font-size: 16px; color: var(--fleet-black-25); flex-shrink: 0; align-self: center; }

/* ─── Evidence panels ──────────────────────────── */
.finding-evidence {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  cursor: default;
}

.evidence-panel { display: flex; flex-direction: column; gap: 10px; }
.evidence-label {
  font-size: var(--font-size-xxsmall);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.evidence-row {
  display: grid;
  grid-template-columns: 150px 1fr 130px;
  align-items: center;
  gap: 12px;
}
.evidence-row-label {
  font-size: var(--font-size-base);
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.evidence-meter { height: 8px; background: var(--fleet-black-5); border-radius: var(--radius-full); overflow: hidden; }
.evidence-fill { height: 100%; transition: width 400ms ease-out; }
.evidence-value { font-size: var(--font-size-sm); text-align: right; color: var(--fleet-black); }
.evidence-unit { color: var(--fleet-black-50); font-weight: 400; }
.evidence-note { font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.5; text-wrap: pretty; }

.finding-rec {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--fleet-off-white);
  border-radius: var(--radius-medium);
  cursor: default;
}
.finding-rec-text { font-size: var(--font-size-base); color: var(--fleet-black-75); text-wrap: pretty; }
.finding-rec-text strong { color: var(--fleet-black); }
.finding-rec > :last-child { margin-left: auto; flex-shrink: 0; }

/* ─── Act table ────────────────────────────────── */
.act-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}
.act-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-base); }
.act-table th {
  text-align: left;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
  background: var(--fleet-off-white);
  padding: 10px 13px;
  border-bottom: 1px solid var(--fleet-black-10);
  white-space: nowrap;
}
.act-table th:first-child { padding-left: var(--pad-large); }
.act-table th:last-child { padding-right: var(--pad-large); }
.act-table td {
  padding: 11px 13px;
  border-bottom: 1px solid var(--fleet-black-5);
  color: var(--fleet-black-75);
}
.act-table td:first-child { padding-left: var(--pad-large); }
.act-table td:last-child { padding-right: var(--pad-large); }
.act-table tbody tr:last-child td { border-bottom: 0; }

.act-row { cursor: pointer; transition: background var(--transition-fast); }
.act-row:hover { background: var(--fleet-off-white); }
.act-action { font-weight: 600; color: var(--fleet-black); }
.act-muted { color: var(--fleet-black-75); }
.act-hosts { font-weight: 600; color: var(--fleet-black); }
.num { text-align: right; }
.act-caret { text-align: right; color: var(--fleet-black-25); font-weight: 600; }

.effort-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 3px;
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
}
.effort--low { background: var(--status-good-bg); color: var(--status-good-text); }
.effort--medium { background: var(--status-fair-bg); color: var(--status-fair-text); }
.effort--high { background: var(--status-critical-bg); color: var(--status-critical-text); }

@media (max-width: 1100px) {
  .in-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
  .finding-head { flex-direction: column; gap: 10px; }
  .finding-side { align-items: flex-start; }
}
</style>
