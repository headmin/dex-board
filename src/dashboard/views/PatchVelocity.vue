<template>
  <div class="pv-page page-stack">
    <!-- ─── Header ──────────────────────────────────────────── -->
    <div class="pv-header">
      <div>
        <h1 class="pv-title">Patch velocity</h1>
        <div class="pv-subtitle">How long a fix takes to reach the fleet, and what each change measurably did</div>
      </div>
      <div class="pv-actions">
        <BaseButton variant="secondary" @click="showMethod = !showMethod">{{ showMethod ? 'Hide method' : 'Method & data shapes' }}</BaseButton>
      </div>
    </div>

    <div v-if="showMethod" class="method-panel">
      <div class="method-col">
        <h3>Two clocks, never mixed</h3>
        <p><strong>Fleet-internal MTTP (days)</strong> — first fleet sighting of a version → this host applies it (<code>days_to_patch</code>). Every MTTP number on this page uses this clock.</p>
        <p><strong>Vendor lag (hours)</strong> — vendor publication (RSS) → first fleet apply (<code>hours_to_first_patch</code>). Appears only in the stage breakdown, labeled.</p>
        <p>The velocity target is <strong>{{ config.patchSlaDays }} days</strong>, set by the <code>PATCH_SLA_DAYS</code> worker variable.</p>
      </div>
      <div class="method-col">
        <h3>Cohort rules</h3>
        <p>A staged rollout is an experiment the fleet already ran: patched hosts are the exposed cohort, hosts still waiting are the control. Effect = difference in mean composite-score change (7d window), with a 95% interval.</p>
        <ul>
          <li>Control cohort ≥ {{ RULES.MIN_CONTROL }} hosts, or the row says "not measurable".</li>
          <li>Any other change reaching ≥{{ RULES.CONFOUNDER_OVERLAP * 100 }}% of the same exposed hosts is named as a confounder.</li>
          <li>"Likely caused" is the strongest verdict this page will use.</li>
        </ul>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — the number and the target ──────────────── -->
    <section class="pv-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">Median time to patch · 90d</span>
        <div class="hero-count-row">
          <span class="hero-count" :style="{ color: heroColor }">{{ p50_90 != null ? p50_90.toFixed(1) : '—' }}</span>
          <span class="hero-count-of">days · target {{ config.patchSlaDays }}</span>
        </div>
        <span v-if="summary90 && summary90.n_events" class="hero-chip">{{ summary90.n_events.toLocaleString() }} patch events · {{ summary90.pct_within_sla }}% within target</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          <template v-if="p50_90 != null">
            The median fix reaches a host in <span :class="p50_90 <= config.patchSlaDays ? 'hl-good' : 'hl-fair'">{{ p50_90.toFixed(1) }} days</span><template v-if="p90_90 != null"> — but the slowest tenth waits <span :class="p90_90 > config.patchSlaDays * 2 ? 'hl-critical' : 'hl-fair'">{{ p90_90.toFixed(1) }} days</span>; the tail is where the risk lives</template>.
        </template>
          <template v-else-if="!loading">No patch events in the last 90 days — nothing to measure.</template>
          <template v-else>Measuring…</template>
        </p>
        <p class="hero-support">
          <template v-if="weekTrend">This week the fleet averages {{ weekTrend.current }}d, {{ Math.abs(weekTrend.delta) }}d {{ weekTrend.delta < 0 ? 'faster' : 'slower' }} than the prior week. </template>
          Clock: fleet-first sighting → host applies — not vendor-disclosure-to-patched. Hosts that never applied a patch are not in this clock.
        </p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">By patch type · 90d</span>
        <div v-if="byType.length" class="hero-rail-list">
          <div v-for="t in byType" :key="t.patch_type" class="hero-rail-row">
            <span>{{ t.patch_type === 'os' ? 'OS updates' : 'App updates' }}</span>
            <span class="hero-rail-count">{{ t.p50_lag }}d <span class="hero-rail-sub">median · {{ t.n_events }} events</span></span>
          </div>
        </div>
        <span v-else class="hero-rail-empty">—</span>
        <span class="hero-rail-note">No urgency/CVE feed is wired — split by patch type instead.</span>
      </div>
    </section>

    <!-- ─── Why — where the days go ─────────────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Why — where the days go</h2>
        <span class="grammar-hint">Stages are measured on different samples and windows — labeled per row, not a strict sum</span>
      </div>
      <div class="stages-card">
        <div v-for="s in stages" :key="s.label" class="stage-row" :class="{ 'stage-row--na': s.value == null }">
          <div class="stage-label">
            <span class="stage-name">{{ s.label }}</span>
            <span class="stage-sub">{{ s.sub }}</span>
          </div>
          <div class="stage-bar">
            <div v-if="s.value != null" class="stage-fill" :style="{ width: s.pct + '%', background: s.color }"></div>
            <span v-else class="stage-na">not measurable — {{ s.reason }}</span>
          </div>
          <div class="stage-value">
            <template v-if="s.value != null">
              <span class="stage-days" :style="{ color: s.color }">{{ s.value.toFixed(1) }}d</span>
              <span class="stage-note">{{ s.note }}</span>
            </template>
            <span v-else class="stage-note">—</span>
          </div>
        </div>
        <div class="stages-footer">
          <span class="stages-insight">{{ stagesInsight }}</span>
        </div>
      </div>
    </section>

    <!-- ─── Change impact — measured, not inferred ──────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Change impact — measured, not inferred</h2>
        <span class="grammar-hint">Hosts that got the change vs. hosts still waiting · 95% interval · correlation, not attribution</span>
      </div>
      <div class="impact-grid">
        <div class="impact-card">
          <div class="impact-head-row">
            <span>Change & metric</span><span>Cohorts</span><span class="center">Effect on score · 95% CI</span><span class="right">Reading</span>
          </div>
          <div v-if="impactLoading" class="impact-loading">Comparing cohorts…</div>
          <EmptyState v-else-if="!impactRows.length" small title="No changes with rollouts in the 14-day window to measure." />
          <div v-for="row in impactRows" :key="row.id" class="impact-row" :class="{ 'impact-row--na': row.verdict.key === 'not-measurable' }">
            <div class="impact-change">
              <span class="impact-name">{{ row.label }}</span>
              <span class="impact-sub">composite score change · 7d window<template v-if="row.sha"> · <span class="mono">{{ row.sha }}</span></template></span>
            </div>
            <div class="impact-cohorts">
              <span><span class="dim">exposed</span> <strong class="mono">{{ row.exposedN ?? '—' }}</strong></span>
              <span><span class="dim">control</span> <strong class="mono" :class="{ 'cohort-zero': row.controlN === 0 }">{{ row.controlN ?? '—' }}</strong></span>
            </div>
            <div class="impact-ci">
              <template v-if="row.effect != null && row.verdict.key !== 'not-measurable'">
                <div class="ci-track">
                  <div class="ci-zero"></div>
                  <div class="ci-range" :style="ciRangeStyle(row)"></div>
                  <div class="ci-dot" :style="ciDotStyle(row)"></div>
                </div>
                <div class="ci-text" :style="{ color: effectColor(row) }">
                  {{ row.effect > 0 ? '+' : '' }}{{ row.effect }} <span class="dim">({{ row.ciLow > 0 ? '+' : '' }}{{ row.ciLow }} to {{ row.ciHigh > 0 ? '+' : '' }}{{ row.ciHigh }})</span>
                </div>
              </template>
              <div v-else class="ci-empty">{{ row.effect != null ? 'reading withheld by rule' : 'no comparison possible' }}</div>
            </div>
            <div class="impact-reading">
              <span class="verdict-badge" :class="`verdict--${row.verdict.key}`">{{ row.verdict.label }}</span>
              <span class="verdict-note">{{ row.verdict.note }}<template v-if="row.confounders.length"> · confounder: {{ row.confounders.slice(0, 3).join(', ') }}{{ row.confounders.length > 3 ? ` +${row.confounders.length - 3} more` : '' }}</template><template v-else-if="row.verdict.key === 'likely'"> · no confounder detected</template></span>
            </div>
          </div>
        </div>

        <div class="engine-card">
          <h3>What the engine emits</h3>
          <p>One reading per change. Nothing renders unless every field computes — that's why rows can say "not measurable".</p>
          <pre v-if="engineSample">{{ engineSample }}</pre>
          <div class="engine-rules">
            <span class="engine-rules-label">Rules</span>
            <span>Control cohort ≥ {{ RULES.MIN_CONTROL }} hosts, or the row is withheld.</span>
            <span>Changes reaching ≥{{ RULES.CONFOUNDER_OVERLAP * 100 }}% of the same hosts are named as confounders.</span>
            <span>"Likely caused" is the strongest word this page will use.</span>
            <span>Metric limit: composite-score change is the only per-host before/after available — per-metric effects (memory, crashes) aren't wired yet.</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── Who — who waits longest ─────────────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Who — who waits longest</h2>
      </div>
      <div class="who-grid">
        <div class="who-card">
          <div class="who-head">
            <h3>Time to patch by hardware model</h3>
            <span class="grammar-hint">mean days · target {{ config.patchSlaDays }} · no team field on hosts, so model is the cohort</span>
          </div>
          <div v-if="byModel.length" class="who-rows">
            <div v-for="m in byModel" :key="m.model" class="who-row">
              <div class="who-row-label">
                <span class="who-name mono">{{ m.model }}</span>
                <span class="who-sub">{{ m.hosts }} host{{ m.hosts === 1 ? '' : 's' }} · {{ m.events }} events</span>
              </div>
              <div class="who-meter">
                <div class="who-fill" :style="{ width: modelPct(m) + '%', background: lagColor(m.avgLag) }"></div>
              </div>
              <span class="who-value mono" :style="{ color: lagColor(m.avgLag) }">{{ m.avgLag.toFixed(1) }}d</span>
            </div>
          </div>
          <EmptyState v-else small title="No per-model patch data in the window." />
        </div>

        <div class="who-card">
          <div class="who-head">
            <h3>Hosts dragging MTTP</h3>
            <span class="grammar-hint">mean days over 30d, worst first</span>
          </div>
          <div v-if="slowHosts.length" class="who-rows">
            <div v-for="h in slowHosts" :key="h.host_identifier" class="who-row who-row--click" :title="`Open ${hostName(h)} — full host detail`" @click="openHost(h.host_identifier)">
              <div class="who-row-label">
                <span class="who-name">{{ hostName(h) }}</span>
                <span class="who-sub">{{ h.n_patches }} patch{{ h.n_patches === 1 ? '' : 'es' }} · {{ h.n_apps }} app{{ h.n_apps === 1 ? '' : 's' }}<span v-if="Number(h.n_patches) === 1" class="who-single"> · single event</span></span>
              </div>
              <div class="who-meter">
                <div class="who-fill" :style="{ width: hostPct(h) + '%', background: lagColor(Number(h.avg_lag)) }"></div>
              </div>
              <span class="who-value mono" :style="{ color: lagColor(Number(h.avg_lag)) }">{{ h.avg_lag }}d</span>
            </div>
          </div>
          <EmptyState v-else small title="No per-host patch data in the window." />
          <div class="who-footer">Ranked by mean days-to-patch — correlation with host behavior (offline windows, deferred restarts), not a verdict.</div>
        </div>
      </div>
    </section>

    <!-- ─── Act — changes that would move the number ────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — what would move the number</h2>
        <span class="grammar-hint">Only levers whose evidence computes from this fleet's data are listed — effects are estimates</span>
      </div>
      <div v-if="levers.length" class="act-card">
        <table class="act-table">
          <thead>
            <tr>
              <th>Change</th>
              <th>Stage it fixes</th>
              <th class="num">Hosts</th>
              <th>Evidence behind the estimate</th>
              <th class="num">MTTP effect</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in levers" :key="l.id">
              <td>
                <div class="lever-name">{{ l.change }}</div>
                <div class="lever-sub">{{ l.sub }}</div>
              </td>
              <td class="act-muted">{{ l.stage }}</td>
              <td class="num mono">{{ l.hosts }}</td>
              <td class="act-muted">{{ l.evidence }}</td>
              <td class="num lever-effect">~{{ l.effect }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-else small title="No lever has computable evidence in this window." />
    </section>
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
import { useChangelog, fileTags } from '../composables/useChangelog'
import { useFmaReleases, loadFmaReleaseDevices } from '../composables/useFmaReleases'
import { useDailyScoreSeries } from '../composables/useDailyScoreSeries'
import { buildChangeImpact } from '../composables/useChangeImpact'
import { buildImpactRows, COHORT_RULES } from '../composables/useCohortImpact'
import { query } from '../services/api'
import { displayHost } from '../composables/displayName'
import { palette } from '../composables/uiPalette'
import dayjs from 'dayjs'

const RULES = COHORT_RULES
const router = useRouter()
const { config } = useAppConfig()
const error = ref(null)
const showMethod = ref(false)

// ─── Core MTTP data ───────────────────────────────────────────
const { summary90, current7, prior7, byType, byApp, byHost, loading, fetchAll } = usePatchVelocity()
const byHostAll = ref([])

const p50_90 = computed(() => summary90.value?.p50_lag != null ? Number(summary90.value.p50_lag) : null)
const p90_90 = computed(() => summary90.value?.p90_lag != null ? Number(summary90.value.p90_lag) : null)

const heroColor = computed(() => {
  if (p50_90.value == null) return 'var(--fleet-black-50)'
  const sla = Number(config.value.patchSlaDays) || 14
  if (p50_90.value <= sla / 2) return 'var(--status-good-soft)'
  if (p50_90.value <= sla) return 'var(--fleet-white)'
  if (p50_90.value <= sla * 2) return 'var(--status-fair)'
  return '#ff9a9a'
})

const weekTrend = computed(() => {
  const c = current7.value?.avg_lag
  const p = prior7.value?.avg_lag
  if (c == null || p == null) return null
  return { current: Number(c).toFixed(1), delta: +(Number(c) - Number(p)).toFixed(1) }
})

// ─── Chains (for stage B + impact candidates) ─────────────────
const { commits, fetchChangelog } = useChangelog()
const { releases: fmaReleases, fetchFmaReleases } = useFmaReleases()
const { fetchPatchSummaryBucketed } = usePatchEvents()
const { fetchDailySeries, deltaAfter, judgementFor } = useDailyScoreSeries()

const patchBuckets = ref([])
const fmaDeviceCounts = ref({})
const fmaDeviceLoading = ref({})

const impact = computed(() => buildChangeImpact({
  commits: commits.value,
  releases: fmaReleases.value,
  patchBuckets: patchBuckets.value,
  fileTags,
  deltaAfter,
  judgementFor,
}))

// ─── Stages — each measured on its own labeled sample ─────────
function median(xs) {
  const a = xs.filter(x => isFinite(x)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

const vendorStage = computed(() => {
  const hours = []
  for (const r of fmaReleases.value) {
    const rows = fmaDeviceCounts.value[r.id]
    if (!rows?.length) continue
    const first = Math.min(...rows.map(x => Number(x.hours_to_first_patch)).filter(isFinite))
    if (isFinite(first)) hours.push(first)
  }
  return hours.length ? { days: median(hours) / 24, n: hours.length } : null
})

const commitStage = computed(() => {
  const gaps = impact.value.chains
    .filter(ch => ch.release)
    .map(ch => dayjs(ch.anchorDay).diff(dayjs(String(ch.release.timestamp).slice(0, 10)), 'day'))
    .filter(g => g >= 0)
  return gaps.length ? { days: median(gaps), n: gaps.length } : null
})

const stages = computed(() => {
  const raw = [
    {
      label: 'Vendor ships → first host patched',
      sub: 'vendor clock, in hours',
      value: vendorStage.value?.days ?? null,
      note: vendorStage.value ? `median of ${vendorStage.value.n} release${vendorStage.value.n === 1 ? '' : 's'} with patch data` : null,
      reason: 'needs releases matched to fleet patch events',
      color: palette.good,
    },
    {
      label: 'Vendor ships → someone commits',
      sub: 'human review queue',
      value: commitStage.value?.days ?? null,
      note: commitStage.value ? `median of ${commitStage.value.n} name-matched release→commit chain${commitStage.value.n === 1 ? '' : 's'}` : null,
      reason: 'no name-matched release→commit chains in the window',
      color: palette.critical,
    },
    {
      label: 'First host → half of hosts patched',
      sub: 'fleet median (p50), 90d',
      value: p50_90.value,
      note: 'all patch events',
      reason: 'no patch events in 90d',
      color: palette.fair,
    },
    {
      label: 'Half → the slowest tenth',
      sub: 'p90 − p50, 90d',
      value: (p90_90.value != null && p50_90.value != null) ? p90_90.value - p50_90.value : null,
      note: 'deferrals, offline hosts, restarts',
      reason: 'no patch events in 90d',
      color: palette.elevated,
    },
  ]
  const max = Math.max(...raw.map(s => s.value ?? 0), 0.1)
  return raw.map(s => ({ ...s, pct: s.value != null ? Math.max(2, (s.value / max) * 100) : 0 }))
})

const stagesInsight = computed(() => {
  const measurable = stages.value.filter(s => s.value != null)
  if (!measurable.length) return 'No stage is measurable yet — the clocks need patch events and matched chains.'
  const worst = measurable.reduce((a, b) => (b.value > a.value ? b : a))
  return `The largest measured delay is "${worst.label.toLowerCase()}" at ${worst.value.toFixed(1)} days (${worst.note}). Stages come from different samples — they don't sum to one number.`
})

// ─── Impact rows (cohort comparisons) ─────────────────────────
const impactRows = ref([])
const impactLoading = ref(false)

async function computeImpact() {
  impactLoading.value = true
  const candidates = []
  for (const ch of impact.value.chains.slice(0, 5)) {
    candidates.push({
      id: ch.id,
      label: ch.release ? `${ch.release.app} ${ch.release.version_to} promotion` : `${ch.software} rollout (committed)`,
      software: ch.software,
      sha: ch.commits[0]?.short_sha,
    })
  }
  const chained = new Set(impact.value.chains.map(c => c.software.toLowerCase()))
  const topBuckets = [...patchBuckets.value].sort((a, b) => Number(b.hosts) - Number(a.hosts))
  for (const b of topBuckets) {
    if (candidates.length >= 8) break
    if (chained.has(String(b.software_name).toLowerCase())) continue
    if (candidates.some(c => c.software === b.software_name)) continue
    candidates.push({
      id: `rollout-${b.software_name}`,
      label: `${b.software_name} rollout`,
      software: b.software_name,
      sha: null,
    })
  }
  impactRows.value = await buildImpactRows(candidates, 14)
  impactLoading.value = false
}

// CI bar on a fixed [-3, +3] pts scale, clamped.
const ciPct = (x) => Math.max(0, Math.min(100, ((x + 3) / 6) * 100))
function ciRangeStyle(row) {
  const l = ciPct(row.ciLow), r = ciPct(row.ciHigh)
  const color = effectColor(row)
  return { left: l + '%', width: Math.max(2, r - l) + '%', background: color, opacity: 0.3 }
}
function ciDotStyle(row) {
  return { left: ciPct(row.effect) + '%', background: effectColor(row) }
}
function effectColor(row) {
  if (row.verdict.key === 'none' || row.verdict.key === 'not-measurable') return palette.ink50
  return row.effect > 0 ? palette.good : row.effect < 0 ? palette.critical : 'var(--fleet-black-50)'
}

const engineSample = computed(() => {
  const r = impactRows.value.find(x => x.effect != null && x.verdict.key !== 'not-measurable')
    || impactRows.value.find(x => x.effect != null)
  if (!r) return ''
  return [
    `change      ${r.label}`,
    `metric      composite score Δ · 7d`,
    `exposed     ${r.exposedN} hosts`,
    `control     ${r.controlN} hosts`,
    `effect      ${r.effect > 0 ? '+' : ''}${r.effect} pts`,
    `ci95        ${r.ciLow} … ${r.ciHigh}`,
    `p           ${r.p}`,
    `confounders ${r.confounders.length ? r.confounders.join(', ') : 'none detected'}`,
  ].join('\n')
})

// ─── Who ──────────────────────────────────────────────────────
const byModel = computed(() => {
  const groups = new Map()
  for (const h of byHostAll.value) {
    const model = h.hardware_model || 'unknown'
    if (!groups.has(model)) groups.set(model, { model, hosts: 0, events: 0, lagSum: 0 })
    const g = groups.get(model)
    g.hosts++
    g.events += Number(h.n_patches) || 0
    g.lagSum += (Number(h.avg_lag) || 0) * (Number(h.n_patches) || 0)
  }
  return [...groups.values()]
    .filter(g => g.events >= 3 && g.model !== 'unknown')
    .map(g => ({ ...g, avgLag: g.lagSum / g.events }))
    .sort((a, b) => b.avgLag - a.avgLag)
    .slice(0, 6)
})
const modelPct = (m) => {
  const max = Math.max(...byModel.value.map(x => x.avgLag), 0.1)
  return Math.max(2, (m.avgLag / max) * 100)
}

const slowHosts = computed(() => byHost.value.slice(0, 8))
const hostPct = (h) => {
  const max = Math.max(...slowHosts.value.map(x => Number(x.avg_lag)), 0.1)
  return Math.max(2, (Number(h.avg_lag) / max) * 100)
}
const hostName = (h) => displayHost({ hostname: h.hostname, computer_name: h.computer_name, host_id: h.host_identifier })
function openHost(id) { if (id) router.push(`/hosts/${id}`) }

function lagColor(days) {
  const sla = Number(config.value.patchSlaDays) || 14
  if (days <= sla / 2) return palette.good
  if (days <= sla) return palette.fair
  if (days <= sla * 2) return palette.elevated
  return palette.critical
}

// ─── Act — levers whose evidence computes ─────────────────────
const levers = computed(() => {
  const out = []

  // 1. Auto-promotion evidence: apps whose rollout is name-linked to a
  // commit (human-promoted) vs apps that roll out with no matching commit.
  const chainedSw = new Set(impact.value.chains.map(c => c.software.toLowerCase()))
  const withCommit = byApp.value.filter(a => chainedSw.has(String(a.software_name).toLowerCase()))
  const withoutCommit = byApp.value.filter(a => !chainedSw.has(String(a.software_name).toLowerCase()))
  if (withCommit.length >= 3 && withoutCommit.length >= 3) {
    const mWith = median(withCommit.map(a => Number(a.avg_lag)))
    const mWithout = median(withoutCommit.map(a => Number(a.avg_lag)))
    if (mWith != null && mWithout != null && mWith - mWithout >= 0.5) {
      out.push({
        id: 'auto-promote',
        change: 'Auto-promote routine app updates',
        sub: 'skip the human commit for low-risk titles',
        stage: 'Review queue',
        hosts: summary90.value?.n_hosts ?? '—',
        evidence: `${withoutCommit.length} titles already roll out without a commit; they run ${(mWith - mWithout).toFixed(1)}d faster (median) than the ${withCommit.length} committed ones`,
        effect: `−${(mWith - mWithout).toFixed(1)}d`,
      })
    }
  }

  // 2. Chase the slow tail: fleet-average effect of the slowest hosts.
  const totalEvents = Number(summary90.value?.n_events) || 0
  const fleetAvg = Number(summary90.value?.avg_lag)
  if (totalEvents && isFinite(fleetAvg)) {
    const worst = byHost.value.filter(h => Number(h.avg_lag) > fleetAvg * 2 && Number(h.n_patches) >= 2).slice(0, 5)
    if (worst.length >= 2) {
      const gain = worst.reduce((s, h) => s + (Number(h.avg_lag) - fleetAvg) * Number(h.n_patches), 0) / totalEvents
      if (gain >= 0.1) {
        out.push({
          id: 'slow-tail',
          change: `Follow up with the ${worst.length} slowest hosts`,
          sub: 'offline windows and deferred restarts, not downloads',
          stage: 'The long tail',
          hosts: worst.length,
          evidence: `They average ${median(worst.map(h => Number(h.avg_lag))).toFixed(0)}d vs the fleet's ${fleetAvg.toFixed(1)}d — if they matched the fleet mean, the 90d average falls by ~${gain.toFixed(1)}d`,
          effect: `−${gain.toFixed(1)}d`,
        })
      }
    }
  }

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
    fetchChangelog(),
    fetchFmaReleases(),
    fetchDailySeries(),
    fetchPatchSummaryBucketed(fmt(start), fmt(end), 1).then(rows => { patchBuckets.value = rows || [] }).catch(() => {}),
    query('firehose.scores.mttp_by_host', { windowDays: 30, limit: 200 }).then(rows => { byHostAll.value = rows || [] }).catch(() => {}),
  ])

  // Eager-load patch matches for the top releases (vendor stage sample).
  const top = fmaReleases.value.slice(0, 24)
  await Promise.all(top.map(r => loadFmaReleaseDevices(query, r, {
    deviceCounts: fmaDeviceCounts,
    deviceLoading: fmaDeviceLoading,
    windowDays: 30,
  })))

  await computeImpact()
})
</script>

<style scoped>
.pv-page { max-width: 1280px; margin: 0 auto; padding: var(--pad-large); }

/* ─── Header ───────────────────────────────────── */
.pv-header { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--pad-large); }
.pv-title { margin: 0; font-size: 24px; font-weight: 700; color: var(--fleet-black); }
.pv-subtitle { font-size: var(--font-size-base); color: var(--fleet-black-75); margin-top: 3px; }
.pv-actions { display: flex; gap: 8px; }

/* ─── Method panel ─────────────────────────────── */
.method-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pad-large);
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
}
.method-col h3 { margin: 0 0 8px; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.method-col p, .method-col li { font-size: var(--font-size-sm); color: var(--fleet-black-75); line-height: 1.6; margin: 0 0 6px; }
.method-col ul { margin: 0; padding-left: 18px; }

/* ─── Hero ─────────────────────────────────────── */
.pv-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 300px 1fr 320px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}
.hero-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 60px; font-weight: 700; line-height: 0.9; }
.hero-count-of { font-size: 15px; color: var(--fleet-black-33); }
.hero-chip { display: inline-flex; align-self: flex-start; padding: 3px 9px; border-radius: var(--radius); background: rgba(255,255,255,0.1); color: var(--fleet-black-10); font-size: var(--font-size-sm); font-weight: 600; }
.hero-narrative { display: flex; flex-direction: column; gap: 12px; border-left: 1px solid var(--fleet-blue); padding-left: 40px; }
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hl-fair { color: var(--status-fair); }
.hl-critical { color: #ff9a9a; }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }
.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.06); border-radius: var(--radius-medium); font-size: var(--font-size-base); }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }
.hero-rail-sub { font-weight: 400; color: var(--fleet-black-50); font-size: var(--font-size-xxsmall); }
.hero-rail-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }
.hero-rail-note { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }

/* ─── Grammar ──────────────────────────────────── */
.grammar-section { display: flex; flex-direction: column; gap: var(--pad-smedium); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); text-align: right; }

/* ─── Stages ───────────────────────────────────── */
.stages-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large) var(--pad-xlarge);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stage-row { display: grid; grid-template-columns: 230px 1fr 190px; align-items: center; gap: 18px; }
.stage-row--na { opacity: 0.65; }
.stage-label { display: flex; flex-direction: column; }
.stage-name { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black); }
.stage-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.stage-bar { height: 22px; background: var(--fleet-black-5); border-radius: var(--radius); overflow: hidden; display: flex; align-items: center; }
.stage-fill { height: 100%; transition: width 400ms ease-out; }
.stage-na { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; padding: 0 10px; }
.stage-value { text-align: right; }
.stage-days { font-family: var(--font-mono); font-size: 15px; font-weight: 700; }
.stage-note { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); display: block; }
.stages-footer { padding-top: 14px; border-top: 1px solid var(--fleet-black-10); }
.stages-insight { font-size: var(--font-size-sm); color: var(--fleet-black-50); text-wrap: pretty; }

/* ─── Impact ───────────────────────────────────── */
.impact-grid { display: grid; grid-template-columns: 1fr 300px; gap: var(--pad-medium); align-items: start; }
.impact-card { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); overflow: hidden; }
.impact-head-row, .impact-row {
  display: grid;
  grid-template-columns: 1fr 130px 240px 170px;
  gap: 16px;
  padding: 14px var(--pad-large);
  align-items: center;
}
.impact-head-row {
  padding: 10px var(--pad-large);
  background: var(--fleet-off-white);
  border-bottom: 1px solid var(--fleet-black-10);
  font-size: var(--font-size-xxsmall);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.impact-head-row .center { text-align: center; }
.impact-head-row .right { text-align: right; }
.impact-row { border-bottom: 1px solid var(--fleet-black-5); }
.impact-row:last-child { border-bottom: 0; }
.impact-row--na { background: var(--fleet-off-white); }
.impact-loading { padding: 24px; text-align: center; color: var(--fleet-black-50); font-style: italic; }
.impact-change { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.impact-name { font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.impact-sub { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.impact-cohorts { display: flex; flex-direction: column; gap: 2px; font-size: var(--font-size-sm); color: var(--fleet-black); }
.cohort-zero { color: var(--status-elevated); }
.dim { color: var(--fleet-black-50); }
.mono { font-family: var(--font-mono); }
.impact-ci { display: flex; flex-direction: column; gap: 6px; }
.ci-track { position: relative; height: 22px; }
.ci-track::before { content: ''; position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: var(--fleet-black-5); }
.ci-zero { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--fleet-black-25); }
.ci-range { position: absolute; top: 8px; height: 6px; border-radius: 3px; }
.ci-dot { position: absolute; top: 5px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; }
.ci-text { text-align: center; font-family: var(--font-mono); font-size: var(--font-size-base); font-weight: 700; }
.ci-empty {
  display: flex; align-items: center; justify-content: center; height: 40px;
  border: 1px dashed var(--fleet-black-25); border-radius: var(--radius-medium);
  font-size: var(--font-size-sm); color: var(--fleet-black-50);
}
.impact-reading { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; text-align: right; }
.verdict-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 3px; font-size: var(--font-size-xxsmall); font-weight: 700; }
.verdict--likely { background: var(--status-good-bg); color: var(--status-good-text); }
.verdict--wide { background: var(--status-fair-bg); color: var(--status-fair-text); }
.verdict--none { background: var(--fleet-black-5); color: var(--fleet-black-75); }
.verdict--not-measurable { background: var(--fleet-black-10); color: var(--fleet-black-75); }
.verdict-note { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }

.engine-card {
  background: var(--fleet-black);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--fleet-white);
}
.engine-card h3 { margin: 0; font-size: var(--font-size-base); font-weight: 700; }
.engine-card p { margin: 0; font-size: var(--font-size-sm); line-height: 1.5; color: var(--fleet-black-33); text-wrap: pretty; }
.engine-card pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xxsmall);
  line-height: 1.7;
  color: #e8eaf0;
  white-space: pre-wrap;
}
.engine-rules { padding-top: 12px; border-top: 1px solid var(--fleet-blue); display: flex; flex-direction: column; gap: 6px; }
.engine-rules-label { font-size: var(--font-size-xxsmall); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.engine-rules span:not(.engine-rules-label) { font-size: var(--font-size-sm); color: var(--fleet-black-33); line-height: 1.5; }

/* ─── Who ──────────────────────────────────────── */
.who-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--pad-medium); align-items: start; }
.who-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.who-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.who-head h3 { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.who-rows { display: flex; flex-direction: column; gap: 11px; }
.who-row { display: grid; grid-template-columns: 170px 1fr 60px; align-items: center; gap: 14px; }
.who-row--click { cursor: pointer; }
.who-row--click:hover .who-name { color: var(--fleet-green-down); }
.who-row-label { display: flex; flex-direction: column; min-width: 0; }
.who-name { font-size: var(--font-size-base); font-weight: 500; color: var(--fleet-black); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.who-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.who-single { color: var(--fleet-black-33); font-style: italic; }
.who-meter { height: 8px; background: var(--fleet-black-5); border-radius: var(--radius-full); overflow: hidden; }
.who-fill { height: 100%; transition: width 400ms ease-out; }
.who-value { font-size: var(--font-size-base); font-weight: 700; text-align: right; }
.who-footer { padding-top: 12px; border-top: 1px solid var(--fleet-black-10); font-size: var(--font-size-sm); color: var(--fleet-black-50); text-wrap: pretty; }

/* ─── Act ──────────────────────────────────────── */
.act-card { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius-large); overflow: hidden; }
.act-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-base); }
.act-table th {
  text-align: left; font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-75);
  background: var(--fleet-off-white); padding: 10px 13px; border-bottom: 1px solid var(--fleet-black-10); white-space: nowrap;
}
.act-table th:first-child { padding-left: var(--pad-large); }
.act-table th:last-child { padding-right: var(--pad-large); }
.act-table td { padding: 12px 13px; border-bottom: 1px solid var(--fleet-black-5); color: var(--fleet-black-75); vertical-align: middle; }
.act-table td:first-child { padding-left: var(--pad-large); }
.act-table td:last-child { padding-right: var(--pad-large); }
.act-table tbody tr:last-child td { border-bottom: 0; }
.act-muted { color: var(--fleet-black-75); }
.num { text-align: right; }
.lever-name { font-weight: 700; color: var(--fleet-black); }
.lever-sub { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }
.lever-effect { font-family: var(--font-mono); font-weight: 700; color: var(--status-good); }

@media (max-width: 1100px) {
  .pv-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
  .impact-grid, .who-grid { grid-template-columns: 1fr; }
  .method-panel { grid-template-columns: 1fr; }
}
</style>
