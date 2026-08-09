<template>
  <div class="pv-page page-stack">
    <!-- ─── Header ──────────────────────────────────────────── -->
    <div class="pv-header">
      <div>
        <h1 class="pv-title">Patch velocity</h1>
        <div class="pv-subtitle">How fast updates actually reach everyone</div>
      </div>
      <div class="pv-actions">
        <BaseButton variant="secondary" @click="showMethod = !showMethod">{{ showMethod ? 'Hide method' : 'How we measure this' }}</BaseButton>
      </div>
    </div>

    <!-- The rigor lives here, one click away — not as page furniture. -->
    <div v-if="showMethod" class="method-panel">
      <div class="method-col">
        <h3>How this is measured</h3>
        <p><strong>Clock starts:</strong> the fleet first sees a new version anywhere. <strong>Clock stops:</strong> this host reports it. Elapsed is wall clock.</p>
        <p><strong>Who is counted:</strong> only hosts observed completing an update. A host still on the old build has no event and is in none of these numbers — so the real picture is worse than shown, never better. Fresh installs after a fix are excluded by construction.</p>
        <p>Medians and percentiles are reported instead of the mean: patch times have a heavy tail, and the mean ({{ mean90 != null ? mean90.toFixed(1) + 'd' : '—' }}) would read as slower than the typical host actually is.</p>
      </div>
      <div class="method-col">
        <h3>How "did it help" is judged</h3>
        <p>A staged rollout is a natural experiment: hosts that got the update vs. hosts still waiting, compared on composite-score change over 7 days.</p>
        <ul>
          <li>Fewer than {{ RULES.MIN_CONTROL }} hosts waiting → "can't be measured" — a near-universal app has no control group left.</li>
          <li>Checked on the overall score and each sub-score (memory, security, device health, app health); the most-moved one is reported, so a fix the composite hides still shows.</li>
          <li>Other changes reaching the same hosts are named as confounders.</li>
          <li>"Likely" is the strongest word used — never "proved".</li>
        </ul>
      </div>
      <div class="method-col">
        <h3>Known blind spots</h3>
        <ul>
          <li>Timestamps are poll-bounded (±1h) — no install receipts yet.</li>
          <li>An update installed on disk counts as done even if the old build is still running; the relaunch gap isn't instrumented.</li>
          <li>No CVE/severity feed — all patches weigh the same.</li>
        </ul>
        <p>The full list with the queries that close each gap: <code>docs/docs/patch-velocity-gaps.md</code>.</p>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Two numbers ─────────────────────────────────────── -->
    <section class="pv-hero">
      <div class="hero-numbers">
        <div class="hero-num">
          <span class="hero-eyebrow">Half of updates land in</span>
          <div class="hero-count-row">
            <span class="hero-count hero-count--good">{{ p50_90 != null ? fmtDays(p50_90) : '—' }}</span>
            <span class="hero-count-of">{{ p50_90 != null ? unitFor(p50_90) : '' }}</span>
          </div>
        </div>
        <div class="hero-divider"></div>
        <div class="hero-num">
          <span class="hero-eyebrow">Nine in ten in</span>
          <div class="hero-count-row">
            <span class="hero-count" :class="p90_90 != null && p90_90 > config.patchSlaDays ? 'hero-count--bad' : 'hero-count--good'">{{ p90_90 != null ? fmtDays(p90_90) : '—' }}</span>
            <span class="hero-count-of">{{ p90_90 != null ? unitFor(p90_90) : '' }}</span>
          </div>
        </div>
      </div>
      <div class="hero-right">
        <p class="hero-headline">
          <template v-if="p50_90 != null && p90_90 != null">
            The first half is fine. <span class="hl-fair">The stragglers take {{ Math.round(p90_90 - p50_90) }} more days</span> — and that is where the risk lives.
          </template>
          <template v-else-if="!loading">No updates observed in the last 90 days — nothing to measure.</template>
          <template v-else>Measuring…</template>
        </p>
        <p v-if="weekTrend" class="hero-trend">
          <template v-if="weekTrend.flat">This week's typical patch is holding steady at {{ fmtLag(weekTrend.current) }}.</template>
          <template v-else>This week's typical patch is <span :class="weekTrend.faster ? 'hl-good' : 'hl-fair'">{{ Math.abs(weekTrend.delta).toFixed(1) }}d {{ weekTrend.faster ? 'faster' : 'slower' }}</span> than last week.</template>
        </p>
      </div>
    </section>

    <!-- ─── Stat band ───────────────────────────────────────── -->
    <section v-if="statBand.length" class="stat-band">
      <div v-for="s in statBand" :key="s.key" class="stat-cell">
        <span class="stat-value" :class="s.tone ? `stat-value--${s.tone}` : ''">{{ s.value }}</span>
        <span class="stat-label">{{ s.label }}</span>
        <span class="stat-sub">{{ s.sub }}</span>
      </div>
    </section>

    <!-- ─── Coverage after a version ships ──────────────────── -->
    <section class="curve-card">
      <div class="curve-head">
        <h2>Coverage after a new version ships</h2>
        <span class="curve-sub">{{ totalObserved ? totalObserved.toLocaleString() + ' updates observed · 90d' : '' }}</span>
      </div>
      <svg v-if="coveragePoints.length" viewBox="0 0 900 260" class="coverage-svg" role="img" aria-label="Share of observed updates completed over time">
        <line x1="60" y1="48" x2="860" y2="48" stroke="var(--fleet-black-25)" stroke-width="1" stroke-dasharray="5 4" />
        <text x="60" y="40" class="curve-label">90% — where we want to be by day {{ config.patchSlaDays }}</text>
        <line x1="60" y1="210" x2="860" y2="210" stroke="var(--fleet-black-10)" stroke-width="1" />
        <path :d="coverageAreaPath" :fill="'rgba(0,154,125,0.10)'" />
        <path :d="coverageLinePath" fill="none" :stroke="palette.good" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        <line :x1="covX(7)" y1="48" :x2="covX(7)" y2="210" stroke="var(--fleet-black-50)" stroke-width="1" stroke-dasharray="4 3" />
        <circle :cx="covX(7)" :cy="covY(coverageAt(7) || 0)" r="7" fill="var(--fleet-white)" stroke="var(--fleet-black)" stroke-width="3" />
        <g v-if="coverageAt(7) != null">
          <rect :x="covX(7) + 16" y="86" width="200" height="40" rx="6" fill="var(--fleet-black)" />
          <text :x="covX(7) + 28" y="103" class="curve-callout-main">{{ coverageAt(7) }}% by day 7</text>
          <text :x="covX(7) + 28" y="118" class="curve-callout-sub">{{ (totalObserved - Math.round(totalObserved * coverageAt(7) / 100)).toLocaleString() }} updates took longer</text>
        </g>
        <text v-for="d in [0, 7, 14, 21, 30]" :key="'cx' + d" :x="covX(d)" y="232" text-anchor="middle" class="curve-tick" :class="{ 'curve-tick--bold': d === 7 }">{{ d === 0 ? 'day 0' : d }}</text>
      </svg>
      <EmptyState v-else small title="No updates in the window." />
    </section>

    <!-- ─── OS vs app updates (only when both paths carry data) ─ -->
    <section v-if="osVsApp.length >= 2" class="type-grid">
      <div v-for="t in osVsApp" :key="t.type" class="type-card">
        <div class="type-head">
          <h3>{{ t.title }}</h3>
          <span class="type-count">{{ t.events.toLocaleString() }} update{{ t.events === 1 ? '' : 's' }} · {{ t.hosts }} host{{ t.hosts === 1 ? '' : 's' }}</span>
        </div>
        <div class="type-stats">
          <div class="type-stat">
            <span class="type-stat-value" :style="{ color: t.p50 != null ? lagColor(t.p50) : 'var(--fleet-black-50)' }">{{ t.p50 != null ? fmtLag(t.p50) : '—' }}</span>
            <span class="type-stat-key">typical (p50)</span>
          </div>
          <div class="type-stat">
            <span class="type-stat-value" :style="{ color: t.p90 != null ? lagColor(t.p90) : 'var(--fleet-black-50)' }">{{ t.p90 != null ? fmtLag(t.p90) : '—' }}</span>
            <span class="type-stat-key">slowest tenth (p90)</span>
          </div>
          <div class="type-stat">
            <span class="type-stat-value">{{ t.apps || '—' }}</span>
            <span class="type-stat-key">{{ t.type === 'os' ? 'OS builds' : 'titles' }}</span>
          </div>
        </div>
      </div>
      <p class="type-foot">OS updates and app updates travel different paths — OS waits on a reboot, apps on a relaunch. Split so one can't hide the other.</p>
    </section>

    <!-- ─── App by app ──────────────────────────────────────── -->
    <section class="apps-card">
      <div class="curve-head">
        <h2>App by app</h2>
        <span class="curve-sub">One dot per app — where it lands, not an average of averages</span>
      </div>
      <div class="dot-legend">
        <span class="dot-legend-item dot-legend-item--good"><span class="dot-swatch" :style="{ background: palette.good }"></span>{{ appsInside.length }} app{{ appsInside.length === 1 ? '' : 's' }} inside the {{ config.patchSlaDays }}-day target</span>
        <span class="dot-legend-item"><span class="dot-swatch" :style="{ background: palette.elevated }"></span>{{ appsOutside.length }} outside it</span>
      </div>
      <svg v-if="appDots.length" viewBox="0 0 900 130" class="dots-svg" role="img" aria-label="Each app plotted by its average days to patch">
        <rect x="60" :width="dotX(config.patchSlaDays) - 60" y="18" height="74" :fill="'rgba(0,154,125,0.06)'" />
        <line :x1="dotX(config.patchSlaDays)" y1="12" :x2="dotX(config.patchSlaDays)" y2="92" :stroke="palette.good" stroke-width="1" stroke-dasharray="4 3" />
        <line x1="60" y1="92" x2="860" y2="92" stroke="var(--fleet-black-10)" stroke-width="1" />
        <circle
          v-for="a in appDots" :key="a.software_name"
          :cx="dotX(a.lag)" :cy="a.cy" r="6"
          :fill="dotColor(a.lag)"
        >
          <title>{{ a.software_name }} — {{ a.lag.toFixed(1) }}d mean · {{ a.hosts }} hosts</title>
        </circle>
        <text v-if="slowestDot" :x="Math.min(dotX(slowestDot.lag), 840)" y="34" text-anchor="end" class="curve-label curve-label--bad">{{ slowestDot.software_name }} — {{ slowestDot.lag.toFixed(0) }}d</text>
        <text v-for="d in dotTicks" :key="'dx' + d" :x="dotX(d)" y="114" text-anchor="middle" class="curve-tick" :class="{ 'curve-tick--bold': d === config.patchSlaDays }">{{ d === 0 ? 'day 0' : d }}</text>
        <text x="460" y="128" text-anchor="middle" class="curve-tick">average days to patch, per app · hover a dot for the name</text>
      </svg>
      <EmptyState v-else small title="No apps with enough patch data in the window." />

      <div v-if="fastApps.length || slowApps.length" class="apps-split">
        <div class="apps-col">
          <h3 class="apps-col-title apps-col-title--good">Fastest five</h3>
          <div class="apps-rows">
            <div v-for="a in fastApps" :key="a.software_name" class="app-row">
              <div class="app-row-label">
                <span class="app-row-name">{{ a.software_name }}</span>
                <span class="app-row-sub">{{ a.hosts }} host{{ a.hosts === 1 ? '' : 's' }} · spread {{ Number(a.min_lag).toFixed(1) }}–{{ Number(a.max_lag).toFixed(1) }}d</span>
              </div>
              <span class="app-row-value mono" :style="{ color: palette.good }">{{ Number(a.avg_lag).toFixed(1) }}d</span>
            </div>
          </div>
        </div>
        <div class="apps-col">
          <h3 class="apps-col-title apps-col-title--bad">Slowest five</h3>
          <div class="apps-rows">
            <div v-for="a in slowApps" :key="a.software_name" class="app-row" :class="{ 'app-row--bad': Number(a.avg_lag) > config.patchSlaDays * 2 }">
              <div class="app-row-label">
                <span class="app-row-name">{{ a.software_name }}</span>
                <span class="app-row-sub">{{ a.hosts }} host{{ a.hosts === 1 ? '' : 's' }} · spread {{ Number(a.min_lag).toFixed(1) }}–{{ Number(a.max_lag).toFixed(1) }}d</span>
              </div>
              <span class="app-row-value mono" :style="{ color: lagColor(Number(a.avg_lag)) }">{{ Number(a.avg_lag).toFixed(1) }}d</span>
            </div>
          </div>
          <span class="apps-col-foot">Averaging these into one number would hide every one of them.</span>
        </div>
      </div>
      <p v-if="excludedLabel" class="apps-excluded">{{ excludedLabel }} is left out — it ships with macOS and updates on Apple's schedule, not the fleet's.</p>
    </section>

    <!-- ─── Machines dragging the tail ──────────────────────── -->
    <section class="who-card">
      <div class="who-head">
        <h3>Machines dragging the tail</h3>
        <span class="curve-sub">slowest to apply their updates · 30d · click through for the full host picture</span>
      </div>
      <div v-if="slowHosts.length" class="who-rows">
        <div v-for="h in slowHosts" :key="h.host_identifier" class="who-row" :title="`Open ${h.name} — full host detail`" @click="openHost(h.host_identifier)">
          <div class="who-row-label">
            <span class="who-name">{{ h.name }}</span>
            <span class="who-sub">{{ h.n_patches }} update{{ h.n_patches === 1 ? '' : 's' }} · {{ h.n_apps }} title{{ h.n_apps === 1 ? '' : 's' }}<span v-if="Number(h.n_patches) === 1" class="who-single"> · single event</span></span>
          </div>
          <div class="who-meter">
            <div class="who-fill" :style="{ width: hostBarPct(h) + '%', background: lagColor(h.avg) }"></div>
          </div>
          <span class="who-value mono" :style="{ color: lagColor(h.avg) }">{{ h.avg.toFixed(1) }}d</span>
        </div>
      </div>
      <EmptyState v-else small title="No per-host patch data in the window." />
      <div class="who-footer">Mean days-to-apply per machine — usually offline windows and deferred restarts, a pattern to chase rather than a verdict.</div>
    </section>

    <!-- ─── The blind spot, in plain words ──────────────────── -->
    <section class="blind-card">
      <div class="blind-count">
        <span class="blind-count-num">?</span>
        <span class="blind-count-sub">machines</span>
      </div>
      <div class="blind-body">
        <h2>Some machines have the fix but still run the old version</h2>
        <p>The update installed, nobody quit the app, so the old code is the one running. We can't count these machines yet — one osquery check would make them visible. Until then this page counts them as done, like every other tool does.</p>
      </div>
    </section>

    <!-- ─── Did recent rollouts help? ────────────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Did recent rollouts help?</h2>
        <span class="grammar-hint">Hosts that got the update vs. hosts still waiting · correlation, not attribution</span>
      </div>
      <div class="impact-card">
        <div v-if="impactLoading" class="impact-loading">Comparing…</div>
        <EmptyState v-else-if="!impactRows.length" small title="No rollouts in the 14-day window to judge." />
        <div v-for="row in impactRows" :key="row.id" class="impact-row">
          <div class="impact-main">
            <span class="impact-name">{{ row.label }}</span>
            <span class="impact-reading-text">{{ readingSentence(row) }}</span>
          </div>
          <div class="impact-side">
            <span class="verdict-badge" :class="`verdict--${row.verdict.key}`">{{ verdictLabel(row) }}<span v-if="metricTag(row)" class="verdict-metric"> · {{ metricTag(row) }}</span></span>
            <span v-if="row.exposedN != null" class="impact-counts mono">{{ row.exposedN }} updated · {{ row.controlN }} waiting</span>
          </div>
        </div>
        <div class="impact-foot">Judged over 7 days on the overall score and each sub-score (memory, security, device health, app health); the most-moved one is shown. "Likely" is the strongest word this list uses.</div>
      </div>
    </section>

    <!-- ─── What would speed this up ────────────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">What would speed this up</h2>
        <span class="grammar-hint">Only changes whose evidence computes from this fleet's data</span>
      </div>
      <div class="lever-rows">
        <div v-for="l in levers" :key="l.id" class="lever-row">
          <div class="lever-main">
            <span class="lever-name">{{ l.change }}</span>
            <span class="lever-sub">{{ l.evidence }}</span>
          </div>
          <div class="lever-effect-block">
            <span class="lever-effect-num" :class="l.kind === 'measurement' ? 'lever-effect-num--meta' : ''">{{ l.effect }}</span>
            <span class="lever-effect-sub">{{ l.effectSub }}</span>
          </div>
        </div>
        <EmptyState v-if="!levers.length" small title="No lever has computable evidence in this window." />
      </div>
    </section>

    <!-- ─── The one footer sentence ─────────────────────────── -->
    <div class="pv-footer">
      <span>Counted over machines seen completing an update — from the fleet first seeing a version to each machine reporting it, in wall-clock days. Machines that haven't updated yet aren't in the count, so the real picture is worse than shown, never better.</span>
      <button class="pv-footer-link" @click="showMethod = true">How we measure this ›</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '../components/base/BaseButton.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { useAppConfig } from '../composables/useAppConfig'
import { usePatchVelocity } from '../composables/usePatchVelocity'
import { usePatchEvents } from '../composables/usePatchEvents'
import { buildImpactRows, COHORT_RULES } from '../composables/useCohortImpact'
import { PATCH_EXCLUSIONS, PATCH_EXCLUSIONS_PARAM } from '../composables/patchExclusions'
import { query } from '../services/api'
import { displayHost } from '../composables/displayName'
import { palette } from '../composables/uiPalette'

const RULES = COHORT_RULES
const router = useRouter()
const { config } = useAppConfig()
const error = ref(null)
const showMethod = ref(false)

// ─── Core MTTP data ───────────────────────────────────────────
const { summary90, current7, prior7, byType, byApp, byHost, loading, fetchAll } = usePatchVelocity()
const { fetchPatchSummaryBucketed } = usePatchEvents()

const p50_90 = computed(() => summary90.value?.p50_lag != null ? Number(summary90.value.p50_lag) : null)
const p90_90 = computed(() => summary90.value?.p90_lag != null ? Number(summary90.value.p90_lag) : null)
const mean90 = computed(() => summary90.value?.avg_lag != null ? Number(summary90.value.avg_lag) : null)

// Big numbers read in whole units where possible: "22 hours" beats "0.9".
function fmtDays(d) { return d < 1.5 ? Math.round(d * 24) : (d < 10 ? d.toFixed(1) : Math.round(d)) }
function unitFor(d) { return d < 1.5 ? 'hours' : 'days' }
function fmtLag(d) { return d < 1.5 ? Math.round(d * 24) + 'h' : d.toFixed(1) + 'd' }

// ─── Stat band (volume + week-over-week, from data already fetched) ──
const excludedLabel = PATCH_EXCLUSIONS.map(s => s.replace(/\.app$/, '')).join(', ')

const weekTrend = computed(() => {
  const c = current7.value?.p50_lag
  const p = prior7.value?.p50_lag
  if (c == null || p == null) return null
  const delta = +(Number(c) - Number(p)).toFixed(1)
  return { current: Number(c), delta, faster: delta < 0, flat: Math.abs(delta) < 0.1 }
})

const statBand = computed(() => {
  const s = summary90.value
  if (!s) return []
  return [
    { key: 'events', label: 'Updates observed', value: s.n_events != null ? Number(s.n_events).toLocaleString() : '—', sub: '90 days' },
    { key: 'hosts', label: 'Machines patched', value: s.n_hosts != null ? Number(s.n_hosts).toLocaleString() : '—', sub: 'at least one update' },
    { key: 'apps', label: 'Titles updated', value: s.n_apps != null ? Number(s.n_apps).toLocaleString() : '—', sub: 'distinct apps + OS' },
    { key: 'sla', label: 'Within target', value: s.pct_within_sla != null ? s.pct_within_sla + '%' : '—', sub: `≤ ${config.value.patchSlaDays}-day SLA`, tone: s.pct_within_sla >= 90 ? 'good' : s.pct_within_sla >= 75 ? 'fair' : 'bad' },
  ]
})

// ─── OS updates vs app updates (byType, previously unused) ────
const osVsApp = computed(() => {
  const label = (t) => (t === 'os' ? 'OS updates' : t === 'app' ? 'App updates' : t)
  return byType.value
    .map(r => ({
      type: r.patch_type,
      title: label(r.patch_type),
      p50: r.p50_lag != null ? Number(r.p50_lag) : null,
      p90: r.p90_lag != null ? Number(r.p90_lag) : null,
      events: Number(r.n_events) || 0,
      hosts: Number(r.n_hosts) || 0,
      apps: Number(r.n_apps) || 0,
    }))
    .sort((a, b) => b.events - a.events)
})

// ─── Slowest machines (byHost, previously only used in a calc) ──
const slowHosts = computed(() => byHost.value
  .filter(h => Number(h.n_patches) >= 1)
  .slice(0, 6)
  .map(h => ({
    ...h,
    name: displayHost({ hostname: h.hostname, computer_name: h.computer_name, host_id: h.host_identifier }),
    avg: Number(h.avg_lag),
  })))
const slowHostMax = computed(() => Math.max(...slowHosts.value.map(h => h.avg), 0.1))
function hostBarPct(h) { return Math.max(3, (h.avg / slowHostMax.value) * 100) }
function openHost(id) { if (id) router.push(`/hosts/${id}`) }

// ─── Coverage curve (share of observed updates completed) ─────
const survivalRows = ref([])
const totalObserved = computed(() => survivalRows.value.reduce((s, r) => s + Number(r.n_events), 0))

function coverageAt(d) {
  if (!totalObserved.value) return null
  const done = survivalRows.value.filter(r => Number(r.day_bucket) < d).reduce((s, r) => s + Number(r.n_events), 0)
  return Math.round((done / totalObserved.value) * 100)
}

const CURVE_MAX_DAY = 30
const coveragePoints = computed(() => {
  if (!totalObserved.value) return []
  const pts = []
  for (let d = 0; d <= CURVE_MAX_DAY; d++) pts.push({ day: d, pct: coverageAt(d + 1) })
  return pts
})

// SVG geometry (viewBox 0 0 900 260; x 60..860; y: 100% → 30, 0% → 210)
const covX = (day) => 60 + (Math.min(day, CURVE_MAX_DAY) / CURVE_MAX_DAY) * 800
const covY = (pct) => 210 - (pct / 100) * 180
const coverageLinePath = computed(() => {
  if (!coveragePoints.value.length) return ''
  let p = `M${covX(0)},${covY(coveragePoints.value[0].pct)}`
  for (const pt of coveragePoints.value.slice(1)) p += ` L${covX(pt.day).toFixed(1)},${covY(pt.pct).toFixed(1)}`
  return p
})
const coverageAreaPath = computed(() =>
  coverageLinePath.value ? `${coverageLinePath.value} L${covX(CURVE_MAX_DAY)},210 L${covX(0)},210 Z` : ''
)

// ─── App dots ─────────────────────────────────────────────────
const DOT_MAX_DAY = 45
const appDots = computed(() => {
  const rows = byApp.value.filter(a => Number(a.hosts) >= 2)
  // three lanes so overlapping dots stay readable, like the design
  return rows.map((a, i) => ({
    ...a,
    lag: Math.min(Number(a.avg_lag), DOT_MAX_DAY),
    cy: [44, 60, 76][i % 3],
  }))
})
const appsInside = computed(() => appDots.value.filter(a => a.lag <= Number(config.value.patchSlaDays)))
const appsOutside = computed(() => appDots.value.filter(a => a.lag > Number(config.value.patchSlaDays)))
const slowestDot = computed(() => appDots.value.length ? appDots.value.reduce((m, a) => (a.lag > m.lag ? a : m)) : null)
const dotX = (d) => 60 + (Math.min(d, DOT_MAX_DAY) / DOT_MAX_DAY) * 800
const dotTicks = computed(() => [0, 7, 14, 21, 30, 45].filter(d => d !== 7 || Number(config.value.patchSlaDays) !== 7).concat(Number(config.value.patchSlaDays)).sort((a, b) => a - b))
function dotColor(lag) {
  const sla = Number(config.value.patchSlaDays) || 14
  if (lag <= sla) return palette.good
  if (lag <= sla * 2) return palette.fair
  return palette.elevated
}
function lagColor(days) {
  const sla = Number(config.value.patchSlaDays) || 14
  if (days <= sla / 2) return palette.good
  if (days <= sla) return palette.fair
  if (days <= sla * 2) return palette.elevated
  return palette.critical
}

// Top/bottom 5 from one sorted list, split without overlap when fewer
// than ten apps qualify.
const rankedApps = computed(() => byApp.value
  .filter(a => Number(a.hosts) >= 3)
  .sort((a, b) => Number(a.avg_lag) - Number(b.avg_lag)))
const fastApps = computed(() => rankedApps.value.slice(0, 5))
const slowApps = computed(() => rankedApps.value
  .slice(Math.max(5, rankedApps.value.length - 5))
  .reverse())

function median(xs) {
  const a = xs.filter(x => isFinite(x)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

// ─── Did recent rollouts help? ────────────────────────────────
const patchBuckets = ref([])
const impactRows = ref([])
const impactLoading = ref(false)

async function computeImpact() {
  impactLoading.value = true
  const seen = new Set()
  const candidates = []
  for (const b of [...patchBuckets.value].sort((x, y) => Number(y.hosts) - Number(x.hosts))) {
    if (candidates.length >= 6) break
    const sw = String(b.software_name)
    if (seen.has(sw.toLowerCase())) continue
    seen.add(sw.toLowerCase())
    candidates.push({ id: `rollout-${sw}`, label: `${sw} rollout`, software: sw })
  }
  impactRows.value = await buildImpactRows(candidates, 14)
  impactLoading.value = false
}

function verdictLabel(row) {
  switch (row.verdict.key) {
    case 'likely': return row.effect > 0 ? 'Likely helped' : 'Likely hurt'
    case 'wide': return 'Unclear'
    case 'none': return 'No effect found'
    default: return "Can't be measured"
  }
}

// Small metric tag shown next to a likely/wide verdict when the signal is
// in a category rather than the overall score.
function metricTag(row) {
  if (!row.metric || row.metric === 'delta') return ''
  if (row.verdict.key !== 'likely' && row.verdict.key !== 'wide') return ''
  return row.metricLabel
}

function readingSentence(row) {
  const v = row.verdict.key
  const metric = row.metricLabel || 'overall score'
  const dir = (row.effect || 0) > 0 ? 'up' : 'down'
  const mag = Math.abs(row.effect || 0).toFixed(1)
  const shared = row.confounders?.length ? ` — but ${row.confounders[0]} reached the same hosts, so the credit is shared` : ''
  if (v === 'likely') {
    // Name the sub-score when the signal is in a category the composite hid.
    if (row.metric && row.metric !== 'delta') {
      return `The ${metric} of updated hosts moved ${dir} ${mag} points vs. hosts still waiting, while the overall score barely changed${shared}.`
    }
    return `The overall score of updated hosts moved ${dir} ${mag} points vs. hosts still waiting${shared}.`
  }
  if (v === 'wide') {
    return `The ${metric} moved ${dir} ${mag} points, but too few hosts to say it with confidence.`
  }
  if (v === 'none') return 'No measurable difference on any score — overall or by category.'
  if (row.controlN != null && row.controlN > 0 && row.controlN < RULES.MIN_CONTROL) {
    return `Nearly everyone already has it — only ${row.controlN} host${row.controlN === 1 ? '' : 's'} left to compare against.`
  }
  return row.verdict.note + '.'
}

// ─── What would speed this up ─────────────────────────────────
const levers = computed(() => {
  const out = []

  const totalEvents = Number(summary90.value?.n_events) || 0
  const fleetAvg = Number(summary90.value?.avg_lag)
  if (totalEvents && isFinite(fleetAvg)) {
    const worst = byHost.value.filter(h => Number(h.avg_lag) > fleetAvg * 2 && Number(h.n_patches) >= 2).slice(0, 5)
    if (worst.length >= 2) {
      const gain = worst.reduce((s, h) => s + (Number(h.avg_lag) - fleetAvg) * Number(h.n_patches), 0) / totalEvents
      if (gain >= 0.1) {
        out.push({
          id: 'slow-tail',
          change: `Follow up with the ${worst.length} slowest machines`,
          evidence: `They average ${median(worst.map(h => Number(h.avg_lag))).toFixed(0)} days vs the fleet's ${fleetAvg.toFixed(1)} — usually offline windows and deferred restarts`,
          effect: `−${gain.toFixed(1)} days`,
          effectSub: 'off the fleet average',
        })
      }
    }
  }

  out.push({
    id: 'instrument-relaunch',
    change: 'Start counting restarts',
    evidence: 'One osquery check makes the still-running-old-code machines visible — today they count as done',
    effect: 'closes the blind spot',
    effectSub: 'measurement, not speed',
    kind: 'measurement',
  })

  return out
})

// ─── Load ─────────────────────────────────────────────────────
onMounted(async () => {
  const sla = Number(config.value.patchSlaDays) || 14
  const end = new Date()
  const start = new Date(end.getTime() - 14 * 24 * 3600 * 1000)
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')

  await Promise.all([
    fetchAll(sla),
    fetchPatchSummaryBucketed(fmt(start), fmt(end), 1).then(rows => { patchBuckets.value = rows || [] }).catch(() => {}),
    query('firehose.scores.mttp_survival', { windowDays: 90, excludeSoftware: PATCH_EXCLUSIONS_PARAM }).then(rows => { survivalRows.value = rows || [] }).catch(() => {}),
  ])
  await computeImpact()
})
</script>

<style scoped>
.pv-page { max-width: 1120px; margin: 0 auto; padding: var(--pad-large); }

/* ─── Header ───────────────────────────────────── */
.pv-header { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--pad-large); }
.pv-title { margin: 0; font-size: 26px; font-weight: 700; color: var(--fleet-black); }
.pv-subtitle { font-size: var(--font-size-base); color: var(--fleet-black-75); margin-top: 4px; }
.pv-actions { display: flex; gap: 8px; }

/* ─── Method panel ─────────────────────────────── */
.method-panel {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--pad-large);
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
}
.method-col h3 { margin: 0 0 8px; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.method-col p, .method-col li { font-size: var(--font-size-sm); color: var(--fleet-black-75); line-height: 1.6; margin: 0 0 6px; }
.method-col ul { margin: 0; padding-left: 18px; }

/* ─── Two-number hero ──────────────────────────── */
.pv-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: 32px 36px;
  display: flex;
  align-items: center;
  gap: 48px;
  color: var(--fleet-white);
}
.hero-numbers { display: flex; gap: 40px; }
.hero-num { display: flex; flex-direction: column; gap: 6px; }
.hero-divider { width: 1px; background: var(--fleet-blue); }
.hero-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; white-space: nowrap; }
.hero-count-row { display: flex; align-items: baseline; gap: 8px; }
.hero-count { font-size: 56px; font-weight: 700; line-height: 0.9; }
.hero-count--good { color: var(--status-good-soft); }
.hero-count--bad { color: #ff9a9a; }
.hero-count-of { font-size: 16px; color: var(--fleet-black-33); }
.hero-right { border-left: 1px solid var(--fleet-blue); padding-left: 40px; display: flex; flex-direction: column; gap: 10px; }
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.4; text-wrap: pretty; }
.hero-trend { margin: 0; font-size: var(--font-size-base); color: var(--fleet-black-33); }
.hl-fair { color: var(--status-fair); }
.hl-good { color: var(--status-good-soft); }

/* ─── Stat band ────────────────────────────────── */
.stat-band {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--fleet-black-10);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}
.stat-cell {
  background: var(--fleet-white);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-value { font-size: 24px; font-weight: 700; color: var(--fleet-black); font-variant-numeric: tabular-nums; }
.stat-value--good { color: var(--status-good); }
.stat-value--fair { color: var(--status-fair-text); }
.stat-value--bad { color: var(--status-critical); }
.stat-label { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black-75); }
.stat-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }

/* ─── OS vs app ────────────────────────────────── */
.type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--pad-medium); }
.type-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large) var(--pad-xlarge);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.type-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.type-head h3 { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.type-count { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.type-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.type-stat { display: flex; flex-direction: column; gap: 3px; }
.type-stat-value { font-family: var(--font-mono); font-size: 22px; font-weight: 700; color: var(--fleet-black); }
.type-stat-key { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.type-foot { grid-column: 1 / -1; margin: 0; font-size: var(--font-size-sm); color: var(--fleet-black-50); text-wrap: pretty; }

.apps-excluded { margin: 0; font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; text-wrap: pretty; }

/* ─── Machines dragging the tail ───────────────── */
.who-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large) var(--pad-xlarge);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.who-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.who-head h3 { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.who-rows { display: flex; flex-direction: column; gap: 11px; }
.who-row { display: grid; grid-template-columns: 220px 1fr 60px; align-items: center; gap: 16px; cursor: pointer; }
.who-row:hover .who-name { color: var(--fleet-green-down); }
.who-row-label { display: flex; flex-direction: column; min-width: 0; }
.who-name { font-size: var(--font-size-base); font-weight: 500; color: var(--fleet-black); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.who-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.who-single { color: var(--fleet-black-33); font-style: italic; }
.who-meter { height: 8px; background: var(--fleet-black-5); border-radius: var(--radius-full); overflow: hidden; }
.who-fill { height: 100%; transition: width 400ms ease-out; }
.who-value { font-size: var(--font-size-base); font-weight: 700; text-align: right; }
.who-footer { padding-top: 12px; border-top: 1px solid var(--fleet-black-10); font-size: var(--font-size-sm); color: var(--fleet-black-50); text-wrap: pretty; }

/* ─── Shared card heads ────────────────────────── */
.curve-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.curve-head h2 { margin: 0; font-size: 16px; font-weight: 700; color: var(--fleet-black); }
.curve-sub { font-size: var(--font-size-sm); color: var(--fleet-black-50); text-align: right; }

/* ─── Coverage curve ───────────────────────────── */
.curve-card, .apps-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large) var(--pad-xlarge);
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.coverage-svg, .dots-svg { width: 100%; height: auto; }
.curve-label { font-size: 12px; font-weight: 600; fill: var(--fleet-black-75); font-family: inherit; }
.curve-label--bad { fill: var(--status-critical); }
.curve-tick { font-size: 12px; fill: var(--fleet-black-50); font-family: inherit; }
.curve-tick--bold { fill: var(--fleet-black); font-weight: 600; }
.curve-callout-main { font-size: 13px; font-weight: 700; fill: #ffffff; font-family: inherit; }
.curve-callout-sub { font-size: 11px; fill: var(--fleet-black-33); font-family: inherit; }

/* ─── App dots + split lists ───────────────────── */
.dot-legend { display: flex; align-items: center; gap: 16px; }
.dot-legend-item { display: inline-flex; align-items: center; gap: 8px; font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black-75); }
.dot-legend-item--good { color: var(--status-good-text); }
.dot-swatch { width: 10px; height: 10px; border-radius: 50%; }
.apps-split { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; padding-top: 20px; border-top: 1px solid var(--fleet-black-10); }
.apps-col { display: flex; flex-direction: column; gap: 10px; }
.apps-col-title { margin: 0; font-size: var(--font-size-md); font-weight: 700; }
.apps-col-title--good { color: var(--status-good-text); }
.apps-col-title--bad { color: var(--status-critical-text); }
.apps-rows { display: flex; flex-direction: column; gap: 8px; }
.app-row {
  display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 14px;
  padding: 11px 14px; border: 1px solid var(--fleet-black-10); border-radius: var(--radius-medium);
}
.app-row--bad { border-color: var(--status-critical); }
.app-row-label { display: flex; flex-direction: column; min-width: 0; }
.app-row-name { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app-row-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.app-row-value { font-size: 16px; font-weight: 700; white-space: nowrap; }
.apps-col-foot { font-size: var(--font-size-sm); color: var(--fleet-black-50); line-height: 1.5; text-wrap: pretty; }
.mono { font-family: var(--font-mono); }

/* ─── Blind-spot callout ───────────────────────── */
.blind-card {
  background: var(--fleet-white);
  border: 1px solid var(--status-elevated);
  border-radius: var(--radius-large);
  padding: var(--pad-large) var(--pad-xlarge);
  display: flex;
  align-items: center;
  gap: 28px;
}
.blind-count { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 96px; }
.blind-count-num { font-family: var(--font-mono); font-size: 40px; font-weight: 700; line-height: 1; color: var(--status-elevated); }
.blind-count-sub { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.blind-body { display: flex; flex-direction: column; gap: 5px; }
.blind-body h2 { margin: 0; font-size: 16px; font-weight: 700; color: var(--fleet-black); }
.blind-body p { margin: 0; font-size: var(--font-size-base); line-height: 1.55; color: var(--fleet-black-75); text-wrap: pretty; }

/* ─── Grammar sections (impact + levers) ───────── */
.grammar-section { display: flex; flex-direction: column; gap: var(--pad-smedium); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.grammar-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); text-align: right; }

.impact-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}
.impact-loading { padding: 24px; text-align: center; color: var(--fleet-black-50); font-style: italic; }
.impact-row {
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  padding: 14px var(--pad-large);
  border-bottom: 1px solid var(--fleet-black-5);
}
.impact-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.impact-name { font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.impact-reading-text { font-size: var(--font-size-sm); color: var(--fleet-black-75); line-height: 1.5; text-wrap: pretty; }
.impact-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; white-space: nowrap; }
.impact-counts { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.verdict-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 3px; font-size: var(--font-size-xxsmall); font-weight: 700; }
.verdict-metric { font-weight: 500; opacity: 0.85; }
.verdict--likely { background: var(--status-good-bg); color: var(--status-good-text); }
.verdict--wide { background: var(--status-fair-bg); color: var(--status-fair-text); }
.verdict--none { background: var(--fleet-black-5); color: var(--fleet-black-75); }
.verdict--not-measurable { background: var(--fleet-black-10); color: var(--fleet-black-75); }
.impact-foot { padding: 12px var(--pad-large); background: var(--fleet-off-white); font-size: var(--font-size-sm); color: var(--fleet-black-50); }

/* ─── Lever rows ───────────────────────────────── */
.lever-rows { display: flex; flex-direction: column; gap: 10px; }
.lever-row {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: 18px var(--pad-xlarge);
  display: flex;
  align-items: center;
  gap: 24px;
}
.lever-main { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.lever-name { font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.lever-sub { font-size: var(--font-size-sm); color: var(--fleet-black-75); }
.lever-effect-block { text-align: right; min-width: 150px; }
.lever-effect-num { font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--status-good); display: block; }
.lever-effect-num--meta { font-family: inherit; font-size: var(--font-size-base); color: var(--fleet-black-75); }
.lever-effect-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); display: block; }

/* ─── Footer ───────────────────────────────────── */
.pv-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--fleet-black-5);
  border-radius: var(--radius-large);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  line-height: 1.55;
}
.pv-footer span { flex: 1; text-wrap: pretty; }
.pv-footer-link {
  border: none; background: none; padding: 0;
  font: inherit; font-weight: 600; color: var(--fleet-green);
  cursor: pointer; white-space: nowrap;
}
.pv-footer-link:hover { text-decoration: underline; }

@media (max-width: 1100px) {
  .pv-hero { flex-direction: column; align-items: flex-start; gap: 24px; }
  .hero-headline { border-left: none; padding-left: 0; }
  .apps-split { grid-template-columns: 1fr; }
  .method-panel { grid-template-columns: 1fr; }
}
</style>
