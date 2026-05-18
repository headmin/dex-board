<template>
  <div class="compare-container">
    <div class="compare-header">
      <h2>Host comparison</h2>
      <div class="compare-header-actions">
        <div class="mode-toggle">
          <button class="mode-btn" :class="{ active: mode === 'device' }" @click="mode = 'device'">vs Host</button>
          <button class="mode-btn" :class="{ active: mode === 'platform' }" @click="mode = 'platform'">vs Platform</button>
        </div>
        <button class="close-compare" @click="$emit('close')">Exit comparison</button>
      </div>
    </div>

    <!-- Device Selectors — both sides are pick-able -->
    <div class="compare-selectors">
      <div class="selector-card" :class="{ loaded: leftData }">
        <div class="selector-label">Host A</div>
        <div class="select-wrapper">
          <select v-model="selectedLeft" class="device-select" @change="onLeftChange">
            <option value="">Pick a host...</option>
            <option v-for="d in leftOptions" :key="d.host_identifier" :value="d.host_identifier">
              {{ displayHost(d) }} — {{ d.hardware_model }}
            </option>
          </select>
          <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div v-if="leftDevice" class="selector-meta">
          <GradeBadge v-if="leftData" :grade="leftData.composite_grade || '—'" />
          <span class="meta-score" v-if="leftData">{{ Math.round(leftData.composite_score) }} pts</span>
          <span class="meta-model">{{ leftDevice.os_name }} {{ leftDevice.os_version }}</span>
        </div>
      </div>

      <div v-if="mode === 'device'" class="selector-vs">
        <button class="swap-btn" @click="swapDevices" title="Swap devices">⇄</button>
      </div>

      <template v-if="mode === 'device'">
        <div class="selector-card" :class="{ loaded: rightData }">
          <div class="selector-label">Host B</div>
          <div class="select-wrapper">
            <select v-model="selectedRight" class="device-select" @change="onRightChange">
              <option value="">Pick a host...</option>
              <option v-for="d in rightOptions" :key="d.host_identifier" :value="d.host_identifier">
                {{ displayHost(d) }} — {{ d.hardware_model }}
              </option>
            </select>
            <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div v-if="rightDevice" class="selector-meta">
            <GradeBadge v-if="rightData" :grade="rightData.composite_grade || '—'" />
            <span class="meta-score" v-if="rightData">{{ Math.round(rightData.composite_score) }} pts</span>
            <span class="meta-model">{{ rightDevice.os_name }} {{ rightDevice.os_version }}</span>
          </div>
        </div>
      </template>

      <!-- Platform mode: cohort info card replaces Device B -->
      <template v-else>
        <div class="selector-card cohort-info-card" :class="{ loaded: leftData }">
          <div class="selector-label">Platform Cohort</div>
          <div v-if="leftDeviceMeta" class="cohort-meta">
            <div class="cohort-item"><span class="cohort-key">OS</span> {{ leftDeviceMeta.os_name }}</div>
            <div class="cohort-item"><span class="cohort-key">Model</span> {{ leftDeviceMeta.hardware_model }}</div>
            <div class="cohort-item"><span class="cohort-key">RAM</span> {{ leftDeviceMeta.ram_tier }}</div>
          </div>
          <div v-else class="cohort-meta-empty">Select a device to see cohort info</div>
        </div>
      </template>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="compare-loading">Loading device data...</div>

    <!-- Platform Benchmark mode -->
    <template v-if="mode === 'platform' && leftData">
      <div class="compare-platform-wrap">
        <!-- Host stat strip — meta + MTTP so the platform view has the
             same context as vs Host has on patch velocity. -->
        <div class="platform-stat-strip">
          <div class="platform-stat">
            <span class="platform-stat-label">Host MTTP</span>
            <span class="platform-stat-value">
              <template v-if="leftMttp && Number(leftMttp.n_patches)">{{ Number(leftMttp.avg_lag).toFixed(1) }}<span class="platform-stat-unit">d</span></template>
              <template v-else>—</template>
            </span>
            <span class="platform-stat-sub" v-if="leftMttp && Number(leftMttp.n_patches)">
              {{ leftMttp.n_patches }} patch{{ Number(leftMttp.n_patches) === 1 ? '' : 'es' }} · {{ leftMttp.min_lag }}–{{ leftMttp.max_lag }}d range
            </span>
            <span class="platform-stat-sub muted" v-else>no patches recorded</span>
          </div>
          <div class="platform-stat">
            <span class="platform-stat-label">Composite</span>
            <span class="platform-stat-value">
              {{ leftData?.composite_score != null ? Math.round(leftData.composite_score) : '—' }}
              <GradeBadge :grade="leftData?.composite_grade || '—'" />
            </span>
            <span class="platform-stat-sub muted">out of 100</span>
          </div>
        </div>

        <PlatformBenchmark
          :deviceScores="leftData"
          :benchmarkData="benchmarkData"
          :lifecycleLabel="lifecycleLabel"
          :loading="benchmarkLoading"
          :activeCohort="activeCohort"
          @update:activeCohort="activeCohort = $event"
        />
      </div>
    </template>

    <!-- Device Comparison — only shown when both devices loaded -->
    <template v-else-if="mode === 'device' && leftData && rightData">

      <!-- Score Comparison -->
      <div class="compare-section">
        <h3>Experience Score</h3>
        <div class="compare-grid">
          <div class="compare-row header">
            <span class="compare-label"></span>
            <span class="compare-col">{{ displayHost(leftDevice) }}</span>
            <span class="compare-col">{{ displayHost(rightDevice) }}</span>
            <span class="compare-diff">Diff</span>
          </div>
          <div v-for="row in scoreRows" :key="row.key" class="compare-row" :class="{ highlight: Math.abs(row.diff) >= 10 }">
            <span class="compare-label">{{ row.label }}</span>
            <span class="compare-col">
              <GradeBadge v-if="row.key === 'composite'" :grade="leftData?.composite_grade || '—'" />
              {{ formatScore(row.leftVal) }}
            </span>
            <span class="compare-col">
              <GradeBadge v-if="row.key === 'composite'" :grade="rightData?.composite_grade || '—'" />
              {{ formatScore(row.rightVal) }}
            </span>
            <span class="compare-diff" :class="diffClass(row.diff)">
              {{ row.diff !== null ? (row.diff > 0 ? '+' : '') + row.diff.toFixed(1) : '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Software Comparison (hidden in WC mode) -->
      <div v-if="softwareDiffs.length && !wcMode" class="compare-section">
        <h3>Software Differences <span class="diff-count">{{ softwareDiffs.length }} differences</span></h3>
        <div class="sw-diff-list">
          <div class="sw-diff-header">
            <span class="sw-diff-app">App</span>
            <span class="sw-diff-col">{{ displayHost(leftDevice) }}</span>
            <span class="sw-diff-col">{{ displayHost(rightDevice) }}</span>
          </div>
          <div v-for="d in softwareDiffs" :key="d.app_name" class="sw-diff-row">
            <span class="sw-diff-app">{{ d.app_name }}</span>
            <span class="sw-diff-col">
              <span v-if="d.leftUsage" class="usage-tag" :class="d.leftUsage">{{ d.leftUsage }}</span>
              <span v-else class="not-installed">—</span>
            </span>
            <span class="sw-diff-col">
              <span v-if="d.rightUsage" class="usage-tag" :class="d.rightUsage">{{ d.rightUsage }}</span>
              <span v-else class="not-installed">—</span>
            </span>
          </div>
        </div>
      </div>
      <div v-else-if="wcMode" class="compare-section wc-hidden-notice">
        <div class="wc-notice-content">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Software comparison hidden — Workers Council mode active
        </div>
      </div>

      <!-- Mean Time To Patch (MTTP) Comparison -->
      <div v-if="mttpSummary.leftAvg !== null || mttpSummary.rightAvg !== null || patchComparison.length" class="compare-section mttp-section">
        <h3>
          Mean time to patch
          <span class="mttp-hint">Lower is better — days between fleet-first sighting and per-host apply</span>
        </h3>

        <!-- Headline: side-by-side big numbers + diff -->
        <div class="mttp-headline">
          <div class="mttp-side" :class="{ winner: mttpSummary.leftAvg !== null && mttpSummary.rightAvg !== null && mttpSummary.leftAvg < mttpSummary.rightAvg }">
            <div class="mttp-side-label">{{ displayHost(leftDevice) }}</div>
            <div class="mttp-big">
              <span v-if="mttpSummary.leftAvg !== null">{{ mttpSummary.leftAvg.toFixed(1) }}<span class="mttp-unit">d</span></span>
              <span v-else class="mttp-empty">—</span>
            </div>
            <div class="mttp-substats" v-if="mttpSummary.leftN">
              <span class="mttp-stat"><span class="mttp-stat-num">{{ mttpSummary.leftN }}</span> patch{{ mttpSummary.leftN === 1 ? '' : 'es' }}</span>
              <span class="mttp-stat-sep">·</span>
              <span class="mttp-stat">range <span class="mttp-stat-num">{{ mttpSummary.leftMin }}–{{ mttpSummary.leftMax }}d</span></span>
            </div>
            <div v-else class="mttp-substats muted">no patches recorded</div>
          </div>

          <div class="mttp-vs">
            <div class="mttp-diff-pill" :class="diffClass(-(mttpSummary.diff ?? 0))" v-if="mttpSummary.diff !== null">
              <span class="mttp-diff-arrow">{{ mttpSummary.diff > 0 ? '↑' : mttpSummary.diff < 0 ? '↓' : '=' }}</span>
              {{ Math.abs(mttpSummary.diff).toFixed(1) }}d
            </div>
            <div class="mttp-diff-pill diff-neutral" v-else>—</div>
            <div class="mttp-diff-caption">vs Host A</div>
          </div>

          <div class="mttp-side" :class="{ winner: mttpSummary.leftAvg !== null && mttpSummary.rightAvg !== null && mttpSummary.rightAvg < mttpSummary.leftAvg }">
            <div class="mttp-side-label">{{ displayHost(rightDevice) }}</div>
            <div class="mttp-big">
              <span v-if="mttpSummary.rightAvg !== null">{{ mttpSummary.rightAvg.toFixed(1) }}<span class="mttp-unit">d</span></span>
              <span v-else class="mttp-empty">—</span>
            </div>
            <div class="mttp-substats" v-if="mttpSummary.rightN">
              <span class="mttp-stat"><span class="mttp-stat-num">{{ mttpSummary.rightN }}</span> patch{{ mttpSummary.rightN === 1 ? '' : 'es' }}</span>
              <span class="mttp-stat-sep">·</span>
              <span class="mttp-stat">range <span class="mttp-stat-num">{{ mttpSummary.rightMin }}–{{ mttpSummary.rightMax }}d</span></span>
            </div>
            <div v-else class="mttp-substats muted">no patches recorded</div>
          </div>
        </div>

        <!-- Per-app detail (collapsible) -->
        <div v-if="patchComparison.length" class="mttp-details">
          <button class="mttp-details-toggle" @click="showPatchDetails = !showPatchDetails">
            <span class="mttp-details-icon">{{ showPatchDetails ? '▾' : '▸' }}</span>
            {{ showPatchDetails ? 'Hide' : 'Show' }} per-app breakdown
            <span class="mttp-details-count">{{ patchComparison.length }} app{{ patchComparison.length === 1 ? '' : 's' }}</span>
          </button>
          <div v-if="showPatchDetails" class="compare-grid mttp-grid">
            <div class="compare-row header">
              <span class="compare-label">Software</span>
              <span class="compare-col">{{ displayHost(leftDevice) }}</span>
              <span class="compare-col">{{ displayHost(rightDevice) }}</span>
              <span class="compare-diff">Diff</span>
            </div>
            <div v-for="p in patchComparison" :key="p.software_name" class="compare-row" :class="{ highlight: Math.abs(p.diff) >= 5 }">
              <span class="compare-label">{{ p.software_name }}</span>
              <span class="compare-col">{{ p.leftDays !== null ? p.leftDays.toFixed(0) + 'd' : '—' }}</span>
              <span class="compare-col">{{ p.rightDays !== null ? p.rightDays.toFixed(0) + 'd' : '—' }}</span>
              <span class="compare-diff" :class="diffClass(-p.diff)">
                {{ p.diff !== null ? (p.diff > 0 ? '+' : '') + p.diff.toFixed(0) + 'd' : '—' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="compare-empty">
      Pick two hosts to see a side-by-side comparison of scores, software, and patch velocity.
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { query } from '../services/api'
import GradeBadge from './GradeBadge.vue'
import PlatformBenchmark from './PlatformBenchmark.vue'
import { usePlatformBenchmark } from '../composables/usePlatformBenchmark'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'
import { displayHost } from '../composables/displayName'

const props = defineProps({
  initialHostId: { type: String, default: '' },
  devices: { type: Array, default: () => [] }
})

defineEmits(['close'])

const mode = ref('device')
const selectedLeft = ref(props.initialHostId || '')
const selectedRight = ref('')
const loading = ref(false)

const leftData = ref(null)
const rightData = ref(null)
const leftDeviceMeta = ref(null)  // { os_name, hardware_model, ram_tier }

const { benchmarkData, lifecycleLabel, loading: benchmarkLoading, activeCohort, fetchBenchmarks, updateLifecycle } = usePlatformBenchmark()
const { wcMode } = useWorkersCouncil()
const leftApps = ref([])
const rightApps = ref([])
const leftPatches = ref([])
const rightPatches = ref([])
const leftMttp = ref(null)
const rightMttp = ref(null)
const showPatchDetails = ref(false)

const leftDevice = computed(() => props.devices.find(d => d.host_identifier === selectedLeft.value) || null)
const rightDevice = computed(() => props.devices.find(d => d.host_identifier === selectedRight.value) || null)

// Filter options so you can't pick the same device on both sides
const leftOptions = computed(() => props.devices.filter(d => d.host_identifier !== selectedRight.value))
const rightOptions = computed(() => props.devices.filter(d => d.host_identifier !== selectedLeft.value))

// Auto-load initial device
if (props.initialHostId) {
  loadSide('left', props.initialHostId)
}

async function onLeftChange() {
  if (!selectedLeft.value) { leftData.value = null; return }
  await loadSide('left', selectedLeft.value)
}

async function onRightChange() {
  if (!selectedRight.value) { rightData.value = null; return }
  await loadSide('right', selectedRight.value)
}

function swapDevices() {
  const tmpId = selectedLeft.value
  const tmpData = leftData.value
  const tmpApps = leftApps.value
  const tmpPatches = leftPatches.value
  const tmpMttp = leftMttp.value

  selectedLeft.value = selectedRight.value
  leftData.value = rightData.value
  leftApps.value = rightApps.value
  leftPatches.value = rightPatches.value
  leftMttp.value = rightMttp.value

  selectedRight.value = tmpId
  rightData.value = tmpData
  rightApps.value = tmpApps
  rightPatches.value = tmpPatches
  rightMttp.value = tmpMttp
}

async function loadSide(side, hostId) {
  loading.value = true
  try {
    const data = await loadDeviceData(hostId)
    if (side === 'left') {
      leftData.value = data.scores
      leftApps.value = data.apps
      leftPatches.value = data.patches
      leftMttp.value = data.mttp
      // Capture device meta for platform benchmark cohort queries
      if (data.scores) {
        leftDeviceMeta.value = {
          os_name: data.scores.os_name || '',
          hardware_model: data.scores.hardware_model || '',
          ram_tier: data.scores.ram_tier || ''
        }
      }
    } else {
      rightData.value = data.scores
      rightApps.value = data.apps
      rightPatches.value = data.patches
      rightMttp.value = data.mttp
    }
  } catch (e) {
    console.error(`Load ${side} failed:`, e)
  }
  loading.value = false
}

// Auto-fetch benchmarks when switching to platform mode with a loaded left device
watch(mode, async (newMode) => {
  if (newMode === 'platform' && leftData.value && leftDeviceMeta.value) {
    await fetchBenchmarks(
      selectedLeft.value,
      leftDeviceMeta.value.os_name,
      leftDeviceMeta.value.hardware_model,
      leftDeviceMeta.value.ram_tier
    )
    updateLifecycle(leftData.value)
  }
})

// Re-fetch benchmarks when left device changes while in platform mode
watch(leftData, async (newData) => {
  if (mode.value === 'platform' && newData && leftDeviceMeta.value) {
    await fetchBenchmarks(
      selectedLeft.value,
      leftDeviceMeta.value.os_name,
      leftDeviceMeta.value.hardware_model,
      leftDeviceMeta.value.ram_tier
    )
    updateLifecycle(newData)
  }
})

async function loadDeviceData(hostId) {
  const safe = hostId.replace(/'/g, "''")
  // All three queries now hit the alt instance (live firehose data). The
  // older main-side queries (scores.device_latest, software.device_apps,
  // software.device_patch_avg) read dex_device_scores_hourly / dex_app_usage /
  // dex_patch_events on MAIN, which are stale (last populated 2026-04-06).
  // - firehose.scores.device_latest  → per-category scores + meta
  // - firehose.adoption.per_device   → installed apps with usage_tier
  //                                    (aliased to usage_category to keep
  //                                    softwareDiffs computed unchanged)
  // - firehose.scores.device_patch_avg → avg days-to-patch per software
  //                                    from default.dex_patch_events on alt
  const [scores, appsRaw, patches, mttp] = await Promise.all([
    query('firehose.scores.device_latest', { hostIdentifier: safe }),
    query('firehose.adoption.per_device',  { hostId: safe }).catch(() => []),
    query('firehose.scores.device_patch_avg', { hostIdentifier: safe }).catch(() => []),
    query('firehose.scores.device_mttp',      { hostIdentifier: safe }).catch(() => [])
  ])
  // adoption_gap calls it `usage_tier`; the existing softwareDiffs compares
  // on `usage_category`. Map once at the boundary so downstream code stays
  // untouched.
  const apps = (appsRaw || []).map(a => ({ ...a, usage_category: a.usage_tier }))
  return { scores: scores[0] || null, apps, patches, mttp: (mttp || [])[0] || null }
}

// ─── Computed comparison data ─────────────────────────
const scoreRows = computed(() => {
  const l = leftData.value
  const r = rightData.value
  if (!l || !r) return []
  return [
    { key: 'composite', label: 'Composite', field: 'composite_score' },
    { key: 'performance', label: 'Performance', field: 'performance_score' },
    { key: 'device_health', label: 'Device Health', field: 'device_health_score' },
    { key: 'network', label: 'Network', field: 'network_score' },
    { key: 'security', label: 'Security', field: 'security_score' },
    { key: 'software', label: 'Software', field: 'software_score' }
  ].map(row => {
    const leftVal = l[row.field] ?? null
    const rightVal = r[row.field] ?? null
    const diff = (leftVal !== null && rightVal !== null && leftVal >= 0 && rightVal >= 0)
      ? rightVal - leftVal : null
    return { ...row, leftVal, rightVal, diff }
  })
})

const softwareDiffs = computed(() => {
  const lMap = {}
  for (const a of leftApps.value) lMap[a.app_name] = a
  const rMap = {}
  for (const a of rightApps.value) rMap[a.app_name] = a

  const allApps = new Set([...Object.keys(lMap), ...Object.keys(rMap)])
  const diffs = []
  for (const app of allApps) {
    const l = lMap[app]
    const r = rMap[app]
    if (l && r && l.usage_category === r.usage_category) continue
    diffs.push({
      app_name: app,
      leftUsage: l?.usage_category || null,
      rightUsage: r?.usage_category || null
    })
  }
  const order = { never: 0, stale: 1, monthly: 2, weekly: 3, daily: 4 }
  diffs.sort((a, b) => {
    const aGap = Math.abs((order[a.leftUsage] ?? 2) - (order[a.rightUsage] ?? 2))
    const bGap = Math.abs((order[b.leftUsage] ?? 2) - (order[b.rightUsage] ?? 2))
    return bGap - aGap
  })
  return diffs.slice(0, 15)
})

const mttpSummary = computed(() => {
  const l = leftMttp.value
  const r = rightMttp.value
  const leftAvg  = l && Number(l.n_patches) ? Number(l.avg_lag) : null
  const rightAvg = r && Number(r.n_patches) ? Number(r.avg_lag) : null
  const diff = (leftAvg !== null && rightAvg !== null) ? rightAvg - leftAvg : null
  return {
    leftAvg, rightAvg, diff,
    leftN:    l ? Number(l.n_patches) : 0,
    rightN:   r ? Number(r.n_patches) : 0,
    leftMin:  l ? Number(l.min_lag) : null,
    leftMax:  l ? Number(l.max_lag) : null,
    rightMin: r ? Number(r.min_lag) : null,
    rightMax: r ? Number(r.max_lag) : null,
  }
})

const patchComparison = computed(() => {
  const lMap = {}
  for (const p of leftPatches.value) lMap[p.software_name] = p.avg_lag
  const rMap = {}
  for (const p of rightPatches.value) rMap[p.software_name] = p.avg_lag

  const allSw = new Set([...Object.keys(lMap), ...Object.keys(rMap)])
  return [...allSw].map(sw => ({
    software_name: sw,
    leftDays: lMap[sw] ?? null,
    rightDays: rMap[sw] ?? null,
    diff: (lMap[sw] != null && rMap[sw] != null) ? rMap[sw] - lMap[sw] : null
  })).sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0))
})

// ─── Public API: set either side from parent ──────────
function setDeviceB(hostId) {
  selectedRight.value = hostId
  onRightChange()
}

function setDeviceA(hostId) {
  selectedLeft.value = hostId
  onLeftChange()
}

defineExpose({ setDeviceA, setDeviceB })

function formatScore(v) {
  if (v === null || v === undefined || v < 0) return '—'
  return Math.round(v).toString()
}

function diffClass(diff) {
  if (diff === null) return ''
  if (diff >= 5) return 'diff-good'
  if (diff <= -5) return 'diff-bad'
  return 'diff-neutral'
}
</script>

<style scoped>
.compare-container {
  display: flex;
  flex-direction: column;
  gap: var(--pad-large);
}

.compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.compare-header h2 {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--fleet-black);
}

.compare-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-toggle {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: #f0f0f0;
  border-radius: 8px;
}

.mode-btn {
  padding: 6px 14px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  font-family: var(--font-body);
}

.mode-btn:hover {
  color: var(--fleet-black-75);
  background: rgba(255, 255, 255, 0.5);
}

.mode-btn.active {
  color: var(--fleet-black);
  background: var(--fleet-white);
  box-shadow: var(--box-shadow);
  font-weight: 600;
}

.cohort-info-card .cohort-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.cohort-item {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
}

.cohort-key {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-right: 8px;
  min-width: 50px;
  display: inline-block;
}

.cohort-meta-empty {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-33);
  margin-top: 8px;
}

.close-compare {
  background: none;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: 6px 14px;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  cursor: pointer;
  transition: all 150ms ease-in-out;
}

.close-compare:hover {
  background: var(--fleet-black-5);
  border-color: var(--fleet-black-25);
}

/* ─── Selectors ───────────────────────────────── */
.compare-selectors {
  display: flex;
  align-items: stretch;
  gap: 0;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
}

.selector-card {
  flex: 1;
  background: var(--fleet-white);
  border: 2px solid var(--fleet-black-10);
  border-radius: var(--radius-medium);
  padding: var(--pad-medium);
  transition: border-color 200ms ease-in-out;
}

.selector-card.loaded {
  border-color: var(--fleet-vibrant-blue);
  background: rgba(106, 103, 254, 0.02);
}

.selector-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}

.selector-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--fleet-black-5);
}

.meta-score {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
}

.meta-model {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin-left: auto;
}

.selector-vs {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  flex-shrink: 0;
}

.swap-btn {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 18px;
  color: var(--fleet-black-50);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms ease-in-out;
}

.swap-btn:hover {
  background: var(--fleet-black-5);
  border-color: var(--fleet-black-25);
  color: var(--fleet-black);
}

.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.device-select {
  width: 100%;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: 8px 28px 8px 10px;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  background: var(--fleet-white);
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 150ms ease-in-out;
}

.device-select:focus { border-color: var(--fleet-black); }
.device-select:hover { border-color: var(--fleet-black-25); }

.select-arrow {
  position: absolute;
  right: 10px;
  pointer-events: none;
}

.compare-loading, .compare-empty {
  text-align: center;
  padding: var(--pad-xlarge) 0;
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
}

/* ─── Comparison Sections ─────────────────────── */
.compare-section {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
}

.compare-section h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  margin-bottom: var(--pad-medium);
  display: flex;
  align-items: center;
  gap: 8px;
}

.diff-count {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--fleet-black-50);
}

.compare-grid {
  display: flex;
  flex-direction: column;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
}

.compare-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 160px 160px 110px;
  gap: 28px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--fleet-black-5);
  border-radius: var(--radius);
}

.compare-row:last-child { border-bottom: none; }

.compare-row:nth-of-type(even):not(.header):not(.highlight) {
  background: rgba(0, 0, 0, 0.015);
}

.compare-row.header {
  border-bottom: 1px solid var(--fleet-black-10);
  padding-bottom: 10px;
  margin-bottom: 2px;
}

.compare-row.header span {
  font-size: 11px;
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.compare-row.header .compare-col {
  justify-content: flex-end;
}

.compare-row.highlight {
  background: rgba(106, 103, 254, 0.05);
}

.compare-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.compare-col {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono, var(--font-body));
}

.compare-diff {
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono, var(--font-body));
}

.diff-good { color: var(--fleet-status-success); }
.diff-bad { color: var(--fleet-status-error); }
.diff-neutral { color: var(--fleet-black-50); }

/* ─── Software Diff ───────────────────────────── */
.sw-diff-list {
  display: flex;
  flex-direction: column;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
}

.sw-diff-header, .sw-diff-row {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) 160px 160px;
  gap: 28px;
  align-items: center;
  padding: 10px 16px;
}

.sw-diff-header {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--fleet-black-10);
  margin-bottom: 2px;
}

.sw-diff-header span {
  font-size: 11px;
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.sw-diff-header .sw-diff-col { text-align: right; }

.sw-diff-row {
  border-bottom: 1px solid var(--fleet-black-5);
}

.sw-diff-row:last-child { border-bottom: none; }

.sw-diff-row:nth-of-type(even) { background: rgba(0, 0, 0, 0.015); }

.sw-diff-col { text-align: right; }

.sw-diff-app { font-size: var(--font-size-sm); color: var(--fleet-black); }

.usage-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.usage-tag.daily { background: #e8f8f0; color: var(--fleet-status-success); }
.usage-tag.weekly { background: #e8f0fe; color: #2d5fba; }
.usage-tag.monthly { background: #fef9e8; color: #9a7b1a; }
.usage-tag.stale { background: #fef0e8; color: #b05c1a; }
.usage-tag.never { background: #fee8ec; color: var(--fleet-status-error); }

.not-installed {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-33);
}

/* ─── Workers Council hidden notice ──────────── */
.wc-hidden-notice {
  background: #f0fdf4;
  border-color: #d1fae5;
}

.wc-notice-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: #065f46;
  padding: var(--pad-medium) 0;
}

.wc-notice-content svg {
  stroke: #065f46;
  flex-shrink: 0;
}

/* ─── Platform Benchmark wrap ─────────────────── */
.compare-platform-wrap {
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--pad-large);
}

.platform-stat-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.platform-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-medium);
  padding: var(--pad-medium) var(--pad-large);
  box-shadow: var(--box-shadow);
}

.platform-stat-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.platform-stat-value {
  font-family: var(--font-mono, var(--font-body));
  font-size: 28px;
  font-weight: 700;
  color: var(--fleet-black);
  line-height: 1.1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.platform-stat-unit {
  font-size: 16px;
  font-weight: 600;
  color: var(--fleet-black-50);
  margin-left: 2px;
}

.platform-stat-sub {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-75);
  font-family: var(--font-mono, var(--font-body));
}

.platform-stat-sub.muted { color: var(--fleet-black-33); font-style: italic; font-family: var(--font-body); }

/* ─── MTTP Section ────────────────────────────── */
.mttp-section h3 {
  flex-wrap: wrap;
  gap: 12px;
  align-items: baseline;
}

.mttp-hint {
  font-size: var(--font-size-xs);
  font-weight: 400;
  color: var(--fleet-black-50);
}

.mttp-headline {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 16px;
  align-items: stretch;
  padding: var(--pad-medium) 0;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
}


.mttp-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--pad-medium);
  border: 2px solid var(--fleet-black-10);
  border-radius: var(--radius-medium);
  background: var(--fleet-white);
  transition: border-color 180ms ease-in-out, background 180ms ease-in-out;
}

.mttp-side.winner {
  border-color: var(--fleet-status-success);
  background: rgba(34, 197, 94, 0.04);
}

.mttp-side-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mttp-big {
  font-family: var(--font-mono, var(--font-body));
  font-size: 36px;
  font-weight: 700;
  color: var(--fleet-black);
  line-height: 1;
}

.mttp-unit {
  font-size: 18px;
  font-weight: 600;
  color: var(--fleet-black-50);
  margin-left: 2px;
}

.mttp-empty {
  color: var(--fleet-black-25);
  font-weight: 500;
}

.mttp-substats {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.mttp-substats.muted { font-style: italic; color: var(--fleet-black-33); }
.mttp-stat-num { font-weight: 600; color: var(--fleet-black-75); font-family: var(--font-mono, var(--font-body)); }
.mttp-stat-sep { color: var(--fleet-black-25); }

.mttp-vs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 110px;
}

.mttp-diff-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 999px;
  font-family: var(--font-mono, var(--font-body));
  font-size: var(--font-size-sm);
  font-weight: 700;
  border: 1px solid currentColor;
}

.mttp-diff-pill.diff-good { background: rgba(34, 197, 94, 0.1); }
.mttp-diff-pill.diff-bad  { background: rgba(220, 38, 38, 0.1); }
.mttp-diff-pill.diff-neutral { background: var(--fleet-black-5); color: var(--fleet-black-50); }
.mttp-diff-arrow { font-size: 14px; line-height: 1; }

.mttp-diff-caption {
  font-size: 10px;
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.mttp-details {
  border-top: 1px solid var(--fleet-black-10);
  padding-top: var(--pad-medium);
  margin-top: var(--pad-small);
  max-width: 920px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}

.mttp-details-toggle {
  background: none;
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-vibrant-blue);
  cursor: pointer;
  transition: color 120ms;
}

.mttp-details-toggle:hover { filter: brightness(0.85); }

.mttp-details-icon {
  font-size: 12px;
  color: var(--fleet-black-50);
  min-width: 10px;
}

.mttp-details-count {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--fleet-black-50);
  margin-left: 4px;
}

.mttp-grid { margin-top: var(--pad-small); }

@media (max-width: 768px) {
  .compare-selectors { flex-direction: column; }
  .selector-vs { padding: 8px 0; }
  .swap-btn { transform: rotate(90deg); }
  .compare-row { grid-template-columns: 90px 1fr 1fr 60px; }
  .mttp-headline { grid-template-columns: 1fr; }
  .mttp-vs { flex-direction: row; padding: 8px 0; min-width: 0; }
}
</style>
