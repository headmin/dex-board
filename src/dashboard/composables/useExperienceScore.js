import { ref } from 'vue'
import { query } from '../services/api'
import { scoreToGrade as sharedScoreToGrade } from './gradeColors'

// ─── Grade helper ─────────────────────────────────────────────
// Thresholds live in composables/gradeColors; this wrapper keeps the view's
// "—" placeholder for missing/negative scores.
export function scoreToGrade(score) {
  if (score === null || score === undefined || score < 0) return '—'
  return sharedScoreToGrade(score) || '—'
}

// Data layer for the Experience Score page: fleet/composite snapshot, tile
// deltas, categories, per-fleet (team) breakdown, grade distribution, movers,
// dimension breakdowns, device list and readiness.
//
// Reactive dependency contract (mirrors the original view wiring):
//   • snapshotParams (filter-only)  → fleet, categories, team breakdown, tile deltas
//   • queryParams (filter + range)  → distribution, movers, dimensions, device list
//   • timeRangeHours                → the "before" snapshot of the tile deltas
export function useExperienceScore({ queryParams, snapshotParams, timeRangeHours, wcMode }) {
  // ─── State ────────────────────────────────────────────────────
  const loading = ref({
    fleet: false,
    categories: false,
    distribution: false,
    movers: false,
    dimensions: false,
    deviceList: false
  })

  const fleet = ref({ grade: '—', score: null, delta: null, sparkline: [], deviceCount: 0 })

  // Now-vs-window deltas for the top tiles: each tile's "now" score minus its
  // score at the start of the selected window. Keyed by category key + composite.
  // Recomputed on range change; the tiles' main scores never move.
  const tileDeltas = ref({ composite: null, device_health: null, performance: null, network: null, security: null, software: null })

  const categories = ref([
    { key: 'device_health', label: 'Device Health', grade: '—', score: null, delta: null, sparkline: [] },
    { key: 'software', label: 'Software', grade: '—', score: null, delta: null, sparkline: [] },
    { key: 'performance', label: 'Performance', grade: '—', score: null, delta: null, sparkline: [] },
    { key: 'security', label: 'Security', grade: '—', score: null, delta: null, sparkline: [] },
    { key: 'network', label: 'Network', grade: '—', score: null, delta: null, sparkline: [] }
  ])
  const distribution = ref({})
  const movers = ref([])
  const dimensionData = ref({ os: [], model: [], ram: [], team: [] })
  const missingSignals = ref([])
  const coverage = ref({})

  // Device list state
  const deviceList = ref([])

  // ─── Per-fleet (team) breakdown ───────────────────────────
  // teamRows is the UNION of:
  //   • scored teams (real composite + categories from firehose.scores.by_team)
  //   • known-but-unscored teams (named placeholder card from filter_options)
  // so every fleet visible in the team list gets its own card with status.
  const teamRows = ref([])

  async function fetchTeamBreakdown() {
    try {
      const [scored, allTeams] = await Promise.all([
        query('firehose.scores.by_team', snapshotParams.value).catch(() => []),
        query('firehose.devices.filter_options').catch(() => []),
      ])
      const scoredMap = new Map(
        (scored || []).map(r => [r.team_id, {
          team_id: r.team_id,
          hosts: Number(r.hosts || 0),
          avg_composite: r.avg_composite != null ? Number(r.avg_composite) : null,
          avg_device_health: r.avg_device_health != null ? Number(r.avg_device_health) : null,
          avg_performance: r.avg_performance != null ? Number(r.avg_performance) : null,
          avg_security: r.avg_security != null ? Number(r.avg_security) : null,
          avg_software: r.avg_software != null ? Number(r.avg_software) : null,
          unscorable: false,
        }])
      )
      const knownTeams = (allTeams || []).filter(r => r.type === 'team').map(r => r.value)
      const merged = []
      // First: every known team — scored or not — in the order from filter_options
      for (const t of knownTeams) {
        if (scoredMap.has(t)) {
          merged.push(scoredMap.get(t))
          scoredMap.delete(t)
        } else {
          merged.push({ team_id: t, hosts: 0, avg_composite: null, unscorable: true })
        }
      }
      // Then: any "unassigned" or otherwise-scored teams not in filter_options (defensive)
      for (const row of scoredMap.values()) merged.push(row)
      teamRows.value = merged
    } catch (e) {
      console.error('Team breakdown fetch failed:', e)
      teamRows.value = []
    }
  }

  // ─── Fetch Fleet Score (now + 7d ago for Δ tile + 30d sparkline) ──
  async function fetchFleetScore() {
    loading.value.fleet = true
    try {
      // 30 daily samples (asOfDaysAgo 0..29). Each call wrapped in .catch so a
      // single failure doesn't blank the whole sparkline — the bad day just
      // shows as null (ECharts skips it).
      const trendDays = 30
      const trendRequests = Array.from({ length: trendDays }, (_, i) =>
        query('firehose.scores.fleet_summary', { ...snapshotParams.value, asOfDaysAgo: i })
          .catch(() => [])
      )
      const trendRows = await Promise.all(trendRequests)

      const todayRow = trendRows[0]?.[0]
      const score = todayRow?.avg_score ?? null
      const count = todayRow?.device_count ?? 0
      // The now-vs-window Δ badge is owned by fetchTileDeltas (range-aware); the
      // hero just shows the current score + 30-day sparkline.

      // Sparkline: newest → oldest from trendRequests, so reverse to oldest → newest.
      const sparkline = trendRows
        .map(rows => {
          const s = rows?.[0]?.avg_score
          return (typeof s === 'number') ? s : null
        })
        .reverse()

      fleet.value = {
        grade: scoreToGrade(score),
        score,
        delta: null,
        sparkline,
        deviceCount: count,
      }
    } catch (e) {
      console.error('Fleet score fetch failed:', e)
    }
    loading.value.fleet = false
  }

  // ─── Fetch Category Scores ────────────────────────────────────
  async function fetchCategoryScores() {
    loading.value.categories = true
    try {
      const [rows] = await Promise.all([
        query('firehose.scores.categories', snapshotParams.value),
      ])

      categories.value = categories.value.map(cat => {
        const score = rows[0]?.[`avg_${cat.key}`] ?? null
        return {
          ...cat,
          score,
          grade: scoreToGrade(score),
          delta: null,  // No comparison period in firehose yet
          sparkline: []
        }
      })
    } catch (e) {
      console.error('Category scores fetch failed:', e)
    }
    loading.value.categories = false
  }

  // ─── Fetch now-vs-window tile deltas ──────────────────────────
  // One categories row carries avg_composite + all 5 category averages, so two
  // calls (now, and asOfHoursAgo = the selected window) yield every tile's delta
  // from a consistent snapshot pair. Main scores are owned by the snapshot
  // fetches; this only writes the delta badges.
  const DELTA_KEYS = ['composite', 'device_health', 'performance', 'network', 'security', 'software']
  async function fetchTileDeltas() {
    try {
      const [nowRows, beforeRows] = await Promise.all([
        query('firehose.scores.categories', { ...snapshotParams.value, asOfHoursAgo: 0 }).catch(() => []),
        query('firehose.scores.categories', { ...snapshotParams.value, asOfHoursAgo: timeRangeHours.value }).catch(() => []),
      ])
      const now = nowRows[0] || {}
      const before = beforeRows[0] || {}
      const deltas = {}
      for (const key of DELTA_KEYS) {
        const n = now[`avg_${key}`]
        const b = before[`avg_${key}`]
        deltas[key] = (n != null && b != null) ? Math.round((n - b) * 10) / 10 : null
      }
      tileDeltas.value = deltas
    } catch (e) {
      console.error('Tile delta fetch failed:', e)
    }
  }

  // ─── Fetch Grade Distribution ─────────────────────────────────
  async function fetchDistribution(category = null) {
    loading.value.distribution = true
    try {
      let rows
      if (category) {
        rows = await query('firehose.scores.grade_distribution_category', { ...queryParams.value, category })
      } else {
        rows = await query('firehose.scores.grade_distribution', queryParams.value)
      }
      const dist = {}
      for (const r of rows) {
        if (r.grade) dist[r.grade] = Number(r.cnt)
      }
      distribution.value = dist
    } catch (e) {
      console.error('Distribution fetch failed:', e)
    }
    loading.value.distribution = false
  }

  // ─── Fetch Biggest Movers ─────────────────────────────────────
  async function fetchMovers() {
    loading.value.movers = true
    try {
      const rows = await query('firehose.scores.biggest_movers', { ...queryParams.value, limit: 10 })
      // The query now returns per-category curr_*/prev_* so the expansion panel
      // doesn't need a second query — we pass the whole row through.
      movers.value = rows.map(r => ({
        host_identifier: r.host_id,
        hostname: r.hostname,
        computer_name: r.computer_name,
        hardware_model: '',
        prev_grade: r.prev_grade,
        curr_grade: r.curr_grade,
        delta: Number(r.delta),
        _raw: r,
      }))
    } catch (e) {
      console.error('Movers fetch failed:', e)
      movers.value = []
    }
    loading.value.movers = false
  }

  // ─── Build Mover Detail (category breakdown) from cached row ──
  // No second fetch needed — biggest_movers already returns per-category
  // curr_*/prev_* for the same host. Previously this called a query twice
  // with identical params (so every delta rendered as "—").
  function buildMoverDetail(hostId) {
    const mover = movers.value.find(m => m.host_identifier === hostId)
    const row = mover ? mover._raw : null

    const num = (v) => (v === null || v === undefined || v === '') ? null : Number(v)

    // Weights mirror the canonical composite (core-scores.ts):
    // 0.25*DH + 0.35*Perf + 0.20*Sec + 0.20*SW. Network is informational —
    // shown for context but excluded from the composite (see SCORE-IDEA.md).
    const cats = [
      { key: 'performance',   label: 'Performance',   weight: 35 },
      { key: 'device_health', label: 'Device Health', weight: 25 },
      { key: 'security',      label: 'Security',      weight: 20 },
      { key: 'software',      label: 'Software',      weight: 20 },
      { key: 'network',       label: 'Network',       weight: null },
    ].map(c => {
      const currVal = row ? num(row[`curr_${c.key}`]) : null
      const prevVal = row ? num(row[`prev_${c.key}`]) : null
      const delta = (currVal !== null && prevVal !== null) ? +(currVal - prevVal).toFixed(1) : null
      return { ...c, curr: currVal, prev: prevVal, delta, isDriver: false }
    })

    // Primary driver = largest weighted contribution to the composite.
    // Network has no composite weight, so it can never be the driver —
    // badging it as one would attribute a change to a category that
    // doesn't feed the number that changed.
    let maxContribution = 0
    let driverIdx = -1
    cats.forEach((c, i) => {
      if (c.weight === null || c.delta === null) return
      const contribution = Math.abs(c.delta) * c.weight / 100
      if (contribution > maxContribution) {
        maxContribution = contribution
        driverIdx = i
      }
    })
    if (driverIdx >= 0) cats[driverIdx].isDriver = true

    // Generate insight text — every clause below is checked against the
    // category rows; no narrative that the data doesn't establish.
    let insight = ''
    const driver = driverIdx >= 0 ? cats[driverIdx] : null
    if (driver && driver.delta !== null) {
      const dir = driver.delta > 0 ? 'improved' : 'declined'
      insight = `${driver.label} ${dir} by ${Math.abs(driver.delta).toFixed(1)} points (${driver.weight}% weight), `
      if (Math.abs(driver.delta) > 5) {
        insight += `which was the primary driver of this device's score change.`
      } else {
        const sameDir = cats.filter(c =>
          c.weight !== null && c.delta !== null && c.delta !== 0 &&
          (c.delta > 0) === (driver.delta > 0)
        ).length
        insight += sameDir >= 2
          ? `with ${sameDir} scored categories moving in the same direction.`
          : `contributing to a small overall shift.`
      }
    }

    return { categories: cats, insight }
  }

  // ─── Fetch Dimension Breakdowns ───────────────────────────────
  async function fetchDimensions() {
    loading.value.dimensions = true
    try {
      const [cpuRows, modelRows, ramRows, swapRows] = await Promise.all([
        query('firehose.scores.dimension_cpu', queryParams.value),
        query('firehose.scores.dimension_model', queryParams.value),
        query('firehose.scores.dimension_ram', queryParams.value),
        query('firehose.scores.dimension_swap', queryParams.value),
      ])

      const mapDim = rows => rows.map(r => ({
        name: r.dimension,
        score: r.avg_score,
        count: r.device_count,
        grade: scoreToGrade(r.avg_score)
      }))
      dimensionData.value = {
        os: mapDim(cpuRows),       // CPU class (full coverage, replaces sparse OS)
        model: mapDim(modelRows),
        ram: mapDim(ramRows),
        team: mapDim(swapRows),    // Swap pressure (actionable dimension)
      }
    } catch (e) {
      console.error('Dimensions fetch failed:', e)
    }
    loading.value.dimensions = false
  }

  // ─── Fetch Device Scores List ────────────────────────────
  async function fetchDeviceList() {
    if (wcMode.value) return
    loading.value.deviceList = true
    try {
      const rows = await query('firehose.scores.device_list', { ...queryParams.value, limit: 200 })
      deviceList.value = rows.map(r => ({
        host_id: r.host_id,
        hostname: r.hostname,
        cpu_class: r.cpu_class,
        ram_tier: r.ram_tier,
        device_health_score: Number(r.device_health_score),
        performance_score: Number(r.performance_score),
        network_score: Number(r.network_score),
        security_score: Number(r.security_score),
        software_score: Number(r.software_score),
        composite_score: Number(r.composite_score),
        composite_grade: r.composite_grade,
        data_sources: r.data_sources
      }))
    } catch (e) {
      console.error('Device list fetch failed:', e)
    }
    loading.value.deviceList = false
  }

  // Post-setup sanity check: scoring tables must be non-empty or the grade is
  // built on ifNull() defaults. security_posture is excluded here — the score
  // has an explicit OS-layer fallback for it (see SCORE-IDEA.md, Security).
  async function fetchReadiness() {
    try {
      const rows = await query('firehose.scores.readiness')
      missingSignals.value = rows
        .filter(r => Number(r.row_count) === 0 && r.tbl !== 'security_posture')
        .map(r => r.tbl)
    } catch (e) {
      console.error('Readiness check failed:', e)
    }
  }

  // Coverage disclosure: scored hosts vs all hosts seen in any telemetry
  // table (7d, fleet-wide). The gap is the unscored population — today the
  // non-macOS hosts, which never land in device_health.
  async function fetchCoverage() {
    try {
      const rows = await query('firehose.scores.coverage')
      coverage.value = rows?.[0] || {}
    } catch (e) {
      console.error('Coverage check failed:', e)
    }
  }

  return {
    loading,
    fleet,
    tileDeltas,
    categories,
    distribution,
    movers,
    dimensionData,
    deviceList,
    teamRows,
    missingSignals,
    coverage,
    fetchCoverage,
    fetchFleetScore,
    fetchCategoryScores,
    fetchTileDeltas,
    fetchDistribution,
    fetchMovers,
    fetchDimensions,
    fetchDeviceList,
    fetchTeamBreakdown,
    fetchReadiness,
    buildMoverDetail,
  }
}
