<template>
  <div class="lifecycle-page page-stack">
    <!-- ─── Header ──────────────────────────────────────────── -->
    <div class="lc-header">
      <div>
        <h1 class="lc-title">Lifecycle</h1>
        <div class="lc-page-subtitle">Refresh candidates from endpoint telemetry — macOS hosts only today; procurement and warranty live outside this view</div>
      </div>
      <div class="lc-actions">
        <BaseButton variant="secondary" @click="exportShortlist">Export shortlist</BaseButton>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — the capex briefing hero ────────────────── -->
    <section class="lc-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">Refresh candidates</span>
        <div class="hero-count-row">
          <span class="hero-count">{{ groupCount('refresh') }}</span>
          <span class="hero-count-of">of {{ summary.total_hosts || candidates.length }} hosts</span>
        </div>
        <span v-if="estUplift != null" class="hero-chip">≈ +{{ estUplift }} composite pts if refreshed (est.)</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          <template v-if="groupCount('refresh')">Replacing the <span class="hl-critical">{{ groupCount('refresh') }} old-silicon host{{ groupCount('refresh') === 1 ? '' : 's' }} under sustained strain</span><template v-if="estUplift != null"> returns an estimated <span class="hl-good">+{{ estUplift }} composite points</span></template> — replacement is the fix for these.</template>
          <template v-else>No host currently earns a refresh verdict — old silicon in this fleet is holding up.</template>
        </p>
        <p v-if="groupCount('investigate')" class="hero-support">
          A further {{ groupCount('investigate') }} host{{ groupCount('investigate') === 1 ? ' is' : 's are' }} strained on <em>current</em> silicon.
          Those are workload or spec problems, not age problems — replacing them buys nothing.
        </p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">Dominant signals</span>
        <div v-if="dominantSignals.length" class="hero-rail-list">
          <div v-for="s in dominantSignals" :key="s.label" class="hero-rail-row">
            <span>{{ s.label }}</span>
            <span class="hero-rail-count">{{ s.count }}</span>
          </div>
        </div>
        <span v-else class="hero-rail-empty">No refresh signals in the fleet</span>
      </div>
    </section>

    <!-- ─── Why — the age cliff ─────────────────────────────── -->
    <section v-if="ageBands.length" class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Why — where experience falls off with silicon age</h2>
        <span class="grammar-hint">Composite score by chip generation age (minimum age — a host can't be newer than its chip)</span>
      </div>
      <div class="cliff-grid">
        <div v-for="b in ageBands" :key="b.label" class="cliff-card" :class="{ 'cliff-card--cliff': b.isCliff }">
          <div class="cliff-head">
            <span class="cliff-label">{{ b.label }}</span>
            <span class="cliff-count">{{ b.count }}</span>
          </div>
          <div class="cliff-grade-row">
            <span class="cliff-grade" :style="{ color: gradeColor(b.grade) }">{{ b.grade }}</span>
            <span class="cliff-score">{{ b.avg }}</span>
          </div>
          <div class="cliff-meter">
            <div class="cliff-meter-fill" :style="{ width: b.avg + '%', background: gradeColor(b.grade) }"></div>
          </div>
          <span class="cliff-caption" :class="{ 'cliff-caption--hot': b.isCliff }">
            {{ b.flaggedPct }}% flagged{{ b.isCliff ? ' · the cliff' : ' for refresh' }}
          </span>
        </div>
      </div>
    </section>

    <!-- ─── Who — where the old fleet sits ──────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Who — where the old fleet sits</h2>
      </div>
      <div class="who-grid">
        <div class="cohort-card" v-for="dim in cohortCards" :key="dim.title">
          <div class="cohort-head">
            <h3 class="cohort-title">{{ dim.title }}</h3>
            <span class="grammar-hint">{{ dim.caption }}</span>
          </div>
          <div class="cohort-rows">
            <div v-for="r in dim.rows" :key="r.name" class="cohort-row">
              <div class="cohort-row-label">
                <span class="cohort-name">{{ r.label }}</span>
                <span class="cohort-sub">{{ r.count }} host{{ r.count === 1 ? '' : 's' }}<template v-if="r.year"> · {{ r.year }}</template></span>
              </div>
              <div class="cohort-meter">
                <div class="cohort-meter-fill" :style="{ width: (r.score || 0) + '%', background: gradeColor(r.grade) }"></div>
              </div>
              <div class="cohort-score-group">
                <GradeBadge :grade="r.grade" />
                <span class="cohort-score">{{ r.score != null ? Math.round(r.score) : '—' }}</span>
              </div>
            </div>
          </div>
          <div v-if="dim.insight" class="cohort-insight">{{ dim.insight }}</div>
        </div>
      </div>
    </section>

    <!-- ─── Act — refresh shortlist ─────────────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — refresh shortlist</h2>
        <span class="grammar-hint">Ranked by refresh score<template v-if="hiddenHealthy > 0"> · {{ hiddenHealthy }} healthy host{{ hiddenHealthy === 1 ? '' : 's' }} with no signals hidden</template></span>
      </div>

      <div v-if="loading" class="lc-loading">Loading…</div>
      <EmptyState v-else-if="!visibleCount" small title="No hosts with refresh signals match the current filter." />
      <div v-else class="lc-table-wrapper">
        <table class="lc-table">
          <thead>
            <tr>
              <th class="sortable" @click="sortBy('_host')">Host {{ sortIcon('_host') }}</th>
              <th class="sortable" @click="sortBy('_age')">CPU · age {{ sortIcon('_age') }}</th>
              <th class="num sortable" @click="sortBy('_ram')">RAM {{ sortIcon('_ram') }}</th>
              <th class="sortable" @click="sortBy('_battery')">Battery {{ sortIcon('_battery') }}</th>
              <th class="sortable" @click="sortBy('_strain')">Strain, 30d {{ sortIcon('_strain') }}</th>
              <th class="num sortable" @click="sortBy('_pts')">Pts back {{ sortIcon('_pts') }}</th>
              <th class="num sortable" @click="sortBy('refresh_score')">Refresh score {{ sortIcon('refresh_score') }}</th>
            </tr>
          </thead>
          <tbody v-for="g in verdictGroups" :key="g.key">
            <tr class="lc-group-row" :class="`lc-group-row--${g.key}`">
              <td colspan="7">
                <span class="lc-group-label" :class="`lc-group-label--${g.tone}`">{{ g.label }}</span>
                <span class="lc-group-count">{{ g.rows.length }} host{{ g.rows.length === 1 ? '' : 's' }}</span>
                <span class="lc-group-hint">— {{ g.hint }}</span>
              </td>
            </tr>
            <tr v-for="h in g.rows" :key="h.host_id" class="lc-row" :title="`Open ${displayHost(h)} — full host detail`" @click="openHost(h.host_id)">
              <td>
                <div class="lc-host-cell">
                  <span class="lc-host">{{ displayHost(h) }}</span>
                  <span class="lc-host-sub">{{ h.hardware_model }}</span>
                </div>
              </td>
              <td class="lc-muted">
                {{ cpuLabel(h.cpu_class) }}<template v-if="chipInfo(h.cpu_class)"> ·
                <span class="lc-age" :class="`lc-age--${ageTone(chipInfo(h.cpu_class).gensBehind)}`"
                  :title="`Chip released ${chipInfo(h.cpu_class).year ?? '—'} — a host can't be newer than its chip`">≥{{ chipAgeYears(h.cpu_class) }} yrs, {{ chipInfo(h.cpu_class).gensBehind }} gen{{ chipInfo(h.cpu_class).gensBehind === 1 ? '' : 's' }}</span></template>
              </td>
              <td class="num" :class="{ 'lc-ram-low': String(h.ram_tier).toLowerCase() === '8gb' }">{{ String(h.ram_tier || '—').toUpperCase() }}</td>
              <td>
                <Badge :tone="batteryTone(h.battery_health_score)" :dot="false">
                  {{ h.battery_health_score || '—' }}<template v-if="h.battery_health_pct"> · {{ Math.min(100, Math.round(h.battery_health_pct)) }}%</template>
                </Badge>
              </td>
              <td>
                <span v-if="Number(h.days_reporting_30d) >= 5" class="lc-strain" :class="strainClass(h)">
                  {{ h.days_pressured_30d }} / {{ h.days_reporting_30d }} days · {{ h.days_severe_30d }} severe
                </span>
                <span v-else class="lc-none" title="Fewer than 5 reporting days in the window">not enough history</span>
              </td>
              <td class="num">
                <span v-if="ptsBack(h) != null" class="lc-pts" title="Estimate: gap to the fleet's current-silicon average composite">~+{{ ptsBack(h) }}</span>
                <span v-else class="lc-none">—</span>
              </td>
              <td class="num">
                <span class="lc-score" :class="`lc-score--${scoreTone(h.refresh_score)}`">{{ h.refresh_score }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!loading && visibleCount" class="lc-footnote">
        "Pts back" is the gap to the fleet's current-silicon average composite ({{ currentSiliconAvg ?? '—' }}) — an estimate, shown only for refresh candidates. No purchase-cost data is wired, so no dollar figures are shown.
      </p>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { query } from '../services/api'
import BaseButton from '../components/base/BaseButton.vue'
import Badge from '../components/base/Badge.vue'
import EmptyState from '../components/base/EmptyState.vue'
import GradeBadge from '../components/GradeBadge.vue'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useSort } from '../composables/useSort'
import { displayHost } from '../composables/displayName'
import { chipInfo, ageTone, verdictFor } from '../composables/chipAge'
import { gradeColor, scoreToGrade } from '../composables/gradeColors'
import { humanizeToken } from '../composables/humanize'

const router = useRouter()
const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const loading = ref(false)
const summary = ref({})
const candidates = ref([])
const scores = ref([])
const cpuDim = ref([])
const modelDim = ref([])

async function load() {
  error.value = null
  loading.value = true
  try {
    const [s, list, scoreRows, cpuRows, modelRows] = await Promise.all([
      query('firehose.lifecycle.refresh_summary', fp()),
      query('firehose.lifecycle.refresh_candidates', { ...fp(), limit: 200 }),
      query('firehose.scores.device_list', { timeRange: 720, limit: 500, ...fp() }).catch(() => []),
      query('firehose.scores.dimension_cpu', { timeRange: 720, ...fp() }).catch(() => []),
      query('firehose.scores.dimension_model', { timeRange: 720, ...fp() }).catch(() => []),
    ])
    summary.value = s[0] || {}
    candidates.value = list || []
    scores.value = scoreRows || []
    cpuDim.value = cpuRows || []
    modelDim.value = modelRows || []
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
}

onMounted(load)
watch(filterParams, load, { deep: true })

function openHost(id) {
  if (id) router.push(`/hosts/${id}`)
}

function cpuLabel(c) {
  if (!c) return '—'
  return humanizeToken(String(c))
}

function chipAgeYears(cpuClass) {
  const info = chipInfo(cpuClass)
  if (!info?.year) return '?'
  return Math.max(0, new Date().getFullYear() - info.year)
}

// ─── Verdicts (trend-earned) ──────────────────────────────────
function hostVerdict(h) {
  const info = chipInfo(h.cpu_class)
  const gensBehind = info?.gensBehind ?? null
  // A battery at end of life is an unambiguous hardware fact — it must land
  // in an action group on its own, without waiting for swap-day persistence
  // (the quadrant logic gates on workload strain, which a dead battery never
  // produces). Age picks WHICH action: old silicon with a dead battery is a
  // refresh; current silicon needs a battery service, not a new machine.
  if (h.battery_health_score === 'replace') {
    return gensBehind != null && gensBehind >= 3
      ? { key: 'refresh', label: 'Refresh candidate', tone: 'critical' }
      : { key: 'battery', label: 'Battery service', tone: 'critical' }
  }
  return verdictFor(Number(h.refresh_score) >= 30, gensBehind, {
    weakDays: Number(h.days_pressured_30d) || 0,
    reportDays: Number(h.days_reporting_30d) || 0,
    severeDays: Number(h.days_severe_30d) || 0,
  })
}

const GROUP_META = [
  { key: 'refresh', label: 'Refresh candidates', tone: 'critical', hint: 'old silicon + sustained strain; replacement is the fix' },
  { key: 'battery', label: 'Battery service', tone: 'critical', hint: 'battery at end of life on current silicon — a service call, not a replacement' },
  { key: 'investigate', label: 'Investigate', tone: 'fair', hint: 'current silicon under sustained strain; fix the workload or the spec, not the age' },
  { key: 'watch', label: 'Watch', tone: 'neutral', hint: 'signals present but not sustained; recheck next cycle' },
  { key: 'defer', label: 'Defer OK', tone: 'good', hint: 'aging silicon holding up fine — no action needed yet' },
]

// Column sorting applies WITHIN each verdict group — the grouping is the
// page's spine and stays put. Battery ranks replace > degraded > good.
const { sortKey, sortAsc, toggleSort, sortRows } = useSort('refresh_score', false)
const BATTERY_RANK = { replace: 2, degraded: 1, good: 0 }

function sortBy(col) {
  toggleSort(col, col !== '_host')
}
function sortIcon(col) {
  if (sortKey.value !== col) return ''
  return sortAsc.value ? '▲' : '▼'
}

const verdictGroups = computed(() => {
  const byKey = new Map(GROUP_META.map(g => [g.key, { ...g, rows: [] }]))
  for (const h of candidates.value) {
    const v = hostVerdict(h)
    // Derived sort fields so every visible column is orderable.
    const info = chipInfo(h.cpu_class)
    byKey.get(v.key)?.rows.push({
      ...h,
      _host: displayHost(h),
      _age: info?.gensBehind ?? null,
      _ram: Number(h.ram_gb) || null,
      _battery: (BATTERY_RANK[h.battery_health_score] ?? null),
      _strain: Number(h.days_reporting_30d) >= 5 ? Number(h.days_severe_30d) || 0 : null,
      _pts: ptsBack(h),
    })
  }
  return GROUP_META.map(g => ({ ...byKey.get(g.key), rows: sortRows(byKey.get(g.key).rows) })).filter(g => g.rows.length)
})

const visibleCount = computed(() => verdictGroups.value.reduce((s, g) => s + g.rows.length, 0))
const hiddenHealthy = computed(() => candidates.value.length - visibleCount.value)

function groupCount(key) {
  return verdictGroups.value.find(g => g.key === key)?.rows.length || 0
}

// ─── Composite join: "pts back" estimate ──────────────────────
// The fleet's current-silicon (≤1 gen behind) average composite is the
// honest reference for what a replaced host could score.
const scoreMap = computed(() => new Map(scores.value.map(s => [s.host_id, Number(s.composite_score)])))

const currentSiliconAvg = computed(() => {
  const current = scores.value.filter(s => {
    const info = chipInfo(s.cpu_class)
    return info && info.gensBehind <= 1 && s.composite_score != null
  })
  if (current.length < 3) return null
  return Math.round(current.reduce((sum, s) => sum + Number(s.composite_score), 0) / current.length)
})

function ptsBack(h) {
  if (hostVerdict(h).key !== 'refresh') return null
  const avg = currentSiliconAvg.value
  const own = scoreMap.value.get(h.host_id)
  if (avg == null || own == null) return null
  const gap = Math.round(avg - own)
  return gap > 0 ? gap : null
}

// Fleet-composite uplift if every refresh candidate scored like the
// current-silicon average — arithmetic on real scores, labeled est.
const estUplift = computed(() => {
  const total = scores.value.length
  if (!total || currentSiliconAvg.value == null) return null
  let gain = 0
  for (const g of verdictGroups.value) {
    if (g.key !== 'refresh') continue
    for (const h of g.rows) {
      const own = scoreMap.value.get(h.host_id)
      if (own != null) gain += Math.max(0, currentSiliconAvg.value - own)
    }
  }
  if (!gain) return null
  return Math.round((gain / total) * 10) / 10
})

// ─── Hero rail: dominant signals across flagged hosts ─────────
const dominantSignals = computed(() => {
  const flagged = verdictGroups.value.flatMap(g => (g.key === 'defer' ? [] : g.rows))
  if (!flagged.length) return []
  const rows = [
    { label: 'Silicon 3+ generations old', count: flagged.filter(h => (chipInfo(h.cpu_class)?.gensBehind ?? 0) >= 3).length },
    { label: 'Sustained severe swap', count: flagged.filter(h => Number(h.days_severe_30d) >= Math.max(3, Number(h.days_reporting_30d) * 0.5)).length },
    { label: '16 GB of RAM or less', count: flagged.filter(h => ['8gb', '16gb'].includes(String(h.ram_tier).toLowerCase())).length },
    { label: 'Battery degraded or replace', count: flagged.filter(h => ['degraded', 'replace'].includes(h.battery_health_score)).length },
  ]
  return rows.filter(r => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 3)
})

// ─── Why: composite by chip-age band ──────────────────────────
const ageBands = computed(() => {
  if (!scores.value.length) return []
  const year = new Date().getFullYear()
  const flaggedIds = new Set(verdictGroups.value.filter(g => g.key === 'refresh').flatMap(g => g.rows.map(r => r.host_id)))
  const BANDS = [
    { label: 'Under 2 years', min: 0, max: 1 },
    { label: '2 years', min: 2, max: 2 },
    { label: '3 years', min: 3, max: 3 },
    { label: '4 years', min: 4, max: 4 },
    { label: '5+ years', min: 5, max: 99 },
  ]
  const out = BANDS.map(b => ({ ...b, hosts: [] }))
  for (const s of scores.value) {
    const info = chipInfo(s.cpu_class)
    if (!info?.year || s.composite_score == null) continue
    const age = Math.max(0, year - info.year)
    const band = out.find(b => age >= b.min && age <= b.max)
    if (band) band.hosts.push(s)
  }
  const bands = out
    .filter(b => b.hosts.length > 0)
    .map(b => {
      const avg = Math.round(b.hosts.reduce((s, h) => s + Number(h.composite_score), 0) / b.hosts.length)
      const flagged = b.hosts.filter(h => flaggedIds.has(h.host_id)).length
      return {
        label: b.label,
        count: b.hosts.length,
        avg,
        grade: scoreToGrade(avg),
        flaggedPct: Math.round((flagged / b.hosts.length) * 100),
        isCliff: false,
      }
    })
  // The cliff = the band with the largest score drop from its predecessor.
  let worstDrop = 0, cliffIdx = -1
  for (let i = 1; i < bands.length; i++) {
    const drop = bands[i - 1].avg - bands[i].avg
    if (drop > worstDrop) { worstDrop = drop; cliffIdx = i }
  }
  if (cliffIdx >= 0 && worstDrop >= 5) bands[cliffIdx].isCliff = true
  return bands
})

// ─── Who: cohort cards from the dimension queries ─────────────
function mapDim(rows, withYear = false) {
  return rows
    .map(r => {
      const info = withYear ? chipInfo(r.dimension) : null
      return {
        name: r.dimension,
        label: humanizeToken(String(r.dimension)),
        count: Number(r.device_count) || 0,
        score: r.avg_score != null ? Number(r.avg_score) : null,
        grade: scoreToGrade(r.avg_score),
        year: info?.year ?? null,
      }
    })
    .filter(r => r.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

const cohortCards = computed(() => {
  const cards = []
  const cpu = mapDim(cpuDim.value, true)
  if (cpu.length >= 2) {
    const worst = cpu[cpu.length - 1], best = cpu[0]
    cards.push({
      title: 'By CPU generation',
      caption: 'composite score',
      rows: cpu,
      insight: `${worst.label} averages ${Math.round(best.score - worst.score)} points below ${best.label} (${worst.count} host${worst.count === 1 ? '' : 's'}).`,
    })
  }
  const model = mapDim(modelDim.value)
  if (model.length >= 2) {
    const worst = model[model.length - 1]
    cards.push({
      title: 'By hardware model',
      caption: 'composite score',
      rows: model,
      insight: `${worst.label} is the weakest model cohort at ${Math.round(worst.score)} (${worst.count} host${worst.count === 1 ? '' : 's'}).`,
    })
  }
  return cards
})

// ─── Table helpers ────────────────────────────────────────────
function batteryTone(s) {
  return s === 'replace' ? 'critical' : s === 'degraded' ? 'fair' : 'good'
}
function scoreTone(n) {
  return n >= 40 ? 'critical' : n >= 20 ? 'fair' : 'good'
}
function strainClass(h) {
  const severe = Number(h.days_severe_30d) || 0
  const report = Number(h.days_reporting_30d) || 1
  if (severe >= Math.max(3, report * 0.5)) return 'lc-strain--critical'
  if (Number(h.days_pressured_30d) >= report * 0.5) return 'lc-strain--elevated'
  return 'lc-strain--neutral'
}

// ─── Export shortlist (self-contained HTML, no fabricated cost) ─
function exportShortlist() {
  const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const groups = verdictGroups.value.map(g => `
    <h2 style="margin:18px 12px 6px;font-size:15px;">${esc(g.label)} — ${g.rows.length} host${g.rows.length === 1 ? '' : 's'}</h2>
    <p style="margin:0 12px 8px;font-size:12px;color:#8b8fa2;">${esc(g.hint)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="color:#8b8fa2;font-size:11px;text-align:left;"><th style="padding:6px 12px;">Host</th><th style="padding:6px 12px;">Model</th><th style="padding:6px 12px;">CPU</th><th style="padding:6px 12px;">RAM</th><th style="padding:6px 12px;">Battery</th><th style="padding:6px 12px;">Strain 30d</th><th style="padding:6px 12px;text-align:right;">Refresh score</th></tr>
      ${g.rows.map(h => `<tr>
        <td style="padding:7px 12px;border-bottom:1px solid #f4f4f6;font-weight:600;">${esc(displayHost(h))}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f4f4f6;">${esc(h.hardware_model || '—')}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f4f4f6;">${esc(cpuLabel(h.cpu_class))}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f4f4f6;">${esc(String(h.ram_tier || '—').toUpperCase())}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f4f4f6;">${esc(h.battery_health_score || '—')}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f4f4f6;">${Number(h.days_reporting_30d) >= 5 ? `${h.days_pressured_30d}/${h.days_reporting_30d}d · ${h.days_severe_30d} severe` : 'not enough history'}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #f4f4f6;text-align:right;font-weight:700;">${esc(h.refresh_score)}</td>
      </tr>`).join('')}
    </table>`).join('')
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Refresh shortlist · ${esc(new Date().toISOString().slice(0, 10))}</title></head>
<body style="margin:0;padding:32px;background:#f9fafc;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#192147;">
<div style="max-width:900px;margin:0 auto;">
  <h1 style="margin:0;font-size:22px;">Hardware refresh shortlist</h1>
  <p style="margin:4px 0 16px;font-size:13px;color:#515774;">Generated ${esc(new Date().toUTCString())} · ${visibleCount.value} flagged of ${candidates.value.length} assessed · verdicts are trend-earned over 30 days. No purchase-cost data — pricing lives in procurement.</p>
  <div style="background:#fff;border:1px solid #e2e4ea;border-radius:8px;padding:4px 0 12px;">${groups}</div>
</div></body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `refresh-shortlist-${new Date().toISOString().slice(0, 10)}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.lifecycle-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-large);
}

/* ─── Header ───────────────────────────────────── */
.lc-header { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--pad-large); }
.lc-title { margin: 0; font-size: 24px; font-weight: 700; color: var(--fleet-black); }
.lc-page-subtitle { font-size: var(--font-size-base); color: var(--fleet-black-75); margin-top: 3px; }
.lc-actions { display: flex; gap: 8px; }

/* ─── Hero ─────────────────────────────────────── */
.lc-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
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
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
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
.hl-critical { color: #ff9a9a; }
.hl-good { color: var(--status-good-soft); }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }

.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-base);
}
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }
.hero-rail-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

/* ─── Grammar sections ─────────────────────────── */
.grammar-section { display: flex; flex-direction: column; gap: var(--pad-smedium); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

/* ─── Why: cliff cards ─────────────────────────── */
.cliff-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--pad-smedium); }

.cliff-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cliff-card--cliff { border: 2px solid var(--fleet-black); padding: 15px; }

.cliff-head { display: flex; align-items: center; justify-content: space-between; }
.cliff-label { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black); }
.cliff-card--cliff .cliff-label { font-weight: 700; }
.cliff-count { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }

.cliff-grade-row { display: flex; align-items: baseline; gap: 8px; }
.cliff-grade { font-size: 28px; font-weight: 700; line-height: 1; }
.cliff-score { font-size: 18px; font-weight: 600; color: var(--fleet-black); }

.cliff-meter { height: 6px; background: var(--fleet-black-5); border-radius: var(--radius-full); overflow: hidden; }
.cliff-meter-fill { height: 100%; transition: width 400ms ease-out; }

.cliff-caption { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.cliff-caption--hot { color: var(--fleet-black); font-weight: 600; }

/* ─── Who: cohort cards ────────────────────────── */
.who-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--pad-medium); align-items: start; }

.cohort-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cohort-head { display: flex; align-items: center; justify-content: space-between; }
.cohort-title { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.cohort-rows { display: flex; flex-direction: column; gap: 11px; }
.cohort-row { display: grid; grid-template-columns: 150px 1fr 76px; align-items: center; gap: 14px; }
.cohort-row-label { display: flex; flex-direction: column; min-width: 0; }
.cohort-name { font-size: var(--font-size-base); font-weight: 500; color: var(--fleet-black); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cohort-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.cohort-meter { height: 8px; background: var(--fleet-black-5); border-radius: var(--radius-full); overflow: hidden; }
.cohort-meter-fill { height: 100%; transition: width 400ms ease-out; }
.cohort-score-group { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
.cohort-score { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black); }
.cohort-insight {
  padding-top: 12px;
  border-top: 1px solid var(--fleet-black-10);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  text-wrap: pretty;
}

/* ─── Act: shortlist table ─────────────────────── */
.lc-table-wrapper {
  width: 100%;
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.lc-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--font-size-base); }
.lc-table th {
  text-align: left;
  padding: 10px 13px;
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  font-weight: 600;
  border-bottom: 1px solid var(--fleet-black-10);
  background: var(--fleet-off-white);
  white-space: nowrap;
}
.lc-table th:first-child { padding-left: var(--pad-large); }
.lc-table th:last-child { padding-right: var(--pad-large); }
.lc-table th.sortable { cursor: pointer; user-select: none; }
.lc-table th.sortable:hover { color: var(--fleet-black); }
.lc-table td {
  padding: 11px 13px;
  color: var(--fleet-black-75);
  border-bottom: 1px solid var(--fleet-black-5);
  vertical-align: middle;
}
.lc-table td:first-child { padding-left: var(--pad-large); }
.lc-table td:last-child { padding-right: var(--pad-large); }
.lc-table tbody:last-child tr:last-child td { border-bottom: none; }

.lc-row { cursor: pointer; transition: background var(--transition-fast); }
.lc-row:hover td { background: var(--fleet-off-white); }
.lc-row:hover .lc-host { color: var(--fleet-green-down); }

.lc-host-cell { display: flex; flex-direction: column; }
.lc-host { font-weight: 600; color: var(--fleet-black); }
.lc-host-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); font-family: var(--font-mono); }
.lc-muted { color: var(--fleet-black-75); }
.num { text-align: right; }
.lc-ram-low { color: var(--status-critical-text); font-weight: 600; }

/* Verdict group header rows — tinted per verdict, per the mockup */
.lc-group-row td { padding: 9px var(--pad-large); }
.lc-group-row--refresh td { background: var(--status-critical-bg); }
.lc-group-row--investigate td { background: var(--status-fair-bg); }
.lc-group-row--watch td { background: var(--fleet-black-5); }
.lc-group-row--defer td { background: var(--status-good-bg); }
.lc-group-label { font-weight: 700; font-size: var(--font-size-sm); }
.lc-group-label--critical { color: var(--status-critical-text); }
.lc-group-label--fair { color: var(--status-fair-text); }
.lc-group-label--neutral { color: var(--fleet-black-75); }
.lc-group-label--good { color: var(--status-good-text); }
.lc-group-count { margin-left: 8px; font-size: var(--font-size-sm); color: var(--fleet-black-75); font-variant-numeric: tabular-nums; }
.lc-group-hint { margin-left: 8px; font-size: var(--font-size-xs); color: var(--fleet-black-50); }

.lc-age { font-size: var(--font-size-sm); font-weight: 600; font-variant-numeric: tabular-nums; }
.lc-age--neutral { color: var(--status-good); }
.lc-age--fair { color: var(--status-fair-text); }
.lc-age--elevated { color: var(--status-elevated); }
.lc-age--critical { color: var(--status-critical); }

.lc-strain {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 3px;
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
  white-space: nowrap;
}
.lc-strain--critical { background: var(--status-critical-bg); color: var(--status-critical-text); }
.lc-strain--elevated { background: var(--status-elevated-bg); color: var(--status-elevated-text); }
.lc-strain--neutral { background: var(--fleet-black-5); color: var(--fleet-black-75); }

.lc-pts { font-family: var(--font-mono); font-weight: 700; color: var(--status-good); }
.lc-none { color: var(--fleet-black-25); font-size: var(--font-size-sm); }

.lc-score { font-family: var(--font-mono); font-weight: 700; }
.lc-score--good { color: var(--status-good); }
.lc-score--fair { color: var(--status-fair-text); }
.lc-score--critical { color: var(--status-critical); }

.lc-footnote { margin: 0; font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

.lc-loading {
  text-align: center;
  color: var(--fleet-black-50);
  font-style: italic;
  padding: 28px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}

@media (max-width: 1100px) {
  .lc-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
  .cliff-grid { grid-template-columns: repeat(3, 1fr); }
  .who-grid { grid-template-columns: 1fr; }
}
</style>
