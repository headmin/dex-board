import { ref, computed } from 'vue'
import { query } from '../services/api'
import { wtdMttp, aggregatePatchRowsBySoftware } from './patchAggregation'

// Per-category signal breakdown + software detail (patch velocity, usage
// tables, app drill-down) for the Experience Score page. These queries are
// fleet-wide and carry no filter/time-range params — same as the original
// view wiring.
export function useSignalDetails() {
  const signals = ref([])

  // Software detail state
  const patchStats = ref({})
  const patchTimeline = ref([])
  const mostUsedApps = ref([])
  const leastUsedApps = ref([])
  const softwarePatchMovers = ref([])
  // Fleet MTTP this 7d vs prior 7d — "are we faster?"
  const patchTrend = ref({ current: null, prior: null, delta: null })
  const patchTrendView = computed(() => {
    const { current, prior, delta } = patchTrend.value
    if (current == null || delta == null) return null
    const dir = delta < 0 ? 'faster' : delta > 0 ? 'slower' : 'flat'
    const txt = dir === 'faster' ? `${Math.abs(delta)}d faster` : dir === 'slower' ? `${delta}d slower` : 'unchanged'
    return { current, prior, dir, txt }
  })

  // App drill-down state
  const drillApp = ref(null)
  const drillDevices = ref([])
  const drillLoading = ref(false)

  async function fetchSignals(categoryKey) {
    try {
      let signalDefs = []

      if (categoryKey === 'device_health') {
        const [dhRows, cpuRows, ramRows] = await Promise.all([
          query('firehose.health.device_summary'),
          query('firehose.health.cpu_distribution'),
          query('firehose.hardware.memory_tiers'),
        ])
        const dh = dhRows[0] || {}
        const total = dh.total_devices || 1
        const swapOkPct = Math.round(((total - (dh.severe_swap || 0) - (dh.elevated_swap || 0)) / total) * 100)
        const battOkPct = Math.round(((total - (dh.degraded_battery || 0) - (dh.replace_battery || 0)) / total) * 100)
        const modernCpu = cpuRows.filter(r => ['apple_m3', 'apple_m4', 'apple_m5'].includes(r.cpu_class)).reduce((s, r) => s + Number(r.device_count), 0)
        const cpuPct = Math.round((modernCpu / total) * 100)
        // RAM: % of fleet at 16 GB+ from hardware.memory_tiers
        const ramTotal = ramRows.reduce((s, r) => s + Number(r.device_count || 0), 0) || 1
        const ramGood = ramRows.filter(r => {
          const gb = parseInt(r.ram_tier) || 0
          return gb >= 16 || r.ram_tier === '16 GB' || r.ram_tier === '32 GB' || r.ram_tier === '64 GB' || r.ram_tier === '128+ GB'
        }).reduce((s, r) => s + Number(r.device_count), 0)
        const ramPct = Math.round((ramGood / ramTotal) * 100)
        signalDefs = [
          { name: 'CPU Generation', weight: 0.30, score: cpuPct, detail: `${cpuPct}% on M3 or newer` },
          { name: 'RAM Tier', weight: 0.25, score: ramPct, detail: `${ramPct}% at 16 GB or higher (${ramTotal} devices)` },
          { name: 'Battery Health', weight: 0.25, score: battOkPct, detail: `${battOkPct}% good or better` },
          { name: 'Swap Pressure', weight: 0.20, score: swapOkPct, detail: `${swapOkPct}% not elevated/severe` },
        ]
      } else if (categoryKey === 'performance') {
        const [dhRows, procRows, osRows] = await Promise.all([
          query('firehose.health.device_summary'),
          query('firehose.processes.by_class'),
          query('firehose.health.os_summary'),
        ])
        const dh = dhRows[0] || {}
        const os = osRows[0] || {}
        const total = dh.total_devices || 1
        const swapOkPct = Math.round(((total - (dh.severe_swap || 0) - (dh.elevated_swap || 0)) / total) * 100)
        // Compression: show the SQL-aligned score (65 for high, 85 for moderate, 100 for low)
        const highComp = dh.high_compression || 0
        const modComp = dh.moderate_compression || 0
        const lowComp = total - highComp - modComp
        const compScore = Math.round((lowComp * 100 + modComp * 85 + highComp * 65) / total)
        const avgRss = procRows.reduce((s, r) => s + (Number(r.avg_rss_mb) || 0), 0) / (procRows.length || 1)
        const rssScore = avgRss < 200 ? 100 : avgRss < 500 ? 80 : avgRss < 1000 ? 60 : 40
        const avgUptime = os.avg_uptime_days || 0
        const uptimeScore = avgUptime < 3 ? 100 : avgUptime < 7 ? 90 : avgUptime < 14 ? 60 : 30
        signalDefs = [
          { name: 'Swap Pressure', weight: 0.35, score: swapOkPct, detail: `${swapOkPct}% fleet not pressured (${dh.severe_swap || 0} severe, ${dh.elevated_swap || 0} elevated)` },
          { name: 'Compression', weight: 0.30, score: compScore, detail: `Score ${compScore}: ${highComp} high, ${modComp} moderate, ${lowComp} low (macOS compression is normal)` },
          { name: 'Process Memory', weight: 0.20, score: rssScore, detail: `Avg ${avgRss.toFixed(0)} MB per process class` },
          { name: 'Uptime Staleness', weight: 0.15, score: uptimeScore, detail: `Fleet avg ${avgUptime.toFixed(1)} days uptime` },
        ]
      } else if (categoryKey === 'network') {
        const [wifiRows, vpnRows] = await Promise.all([
          query('firehose.wifi.summary'),
          query('firehose.vpn.summary'),
        ])
        const w = wifiRows[0] || {}
        const v = vpnRows[0] || {}
        const rssi = w.avg_rssi || -70
        const snr = w.avg_snr || 20
        const tx = w.avg_transmit_rate || 100
        const vpnTotal = v.total_devices || 1
        const vpnConnPct = Math.round(((v.vpn_active || 0) + (v.direct_connected || 0)) / vpnTotal * 100)

        const rssiScore = rssi >= -50 ? 100 : rssi >= -60 ? 85 : rssi >= -70 ? 65 : rssi >= -80 ? 40 : 20
        const snrScore = snr >= 30 ? 100 : snr >= 20 ? 80 : snr >= 10 ? 50 : 25
        const txScore = tx >= 400 ? 100 : tx >= 200 ? 85 : tx >= 100 ? 60 : 30

        signalDefs = [
          { name: 'WiFi Signal (RSSI)', weight: 0.40, score: rssiScore, detail: `Fleet avg ${rssi.toFixed(1)} dBm across ${w.unique_hosts || 0} hosts on WiFi` },
          { name: 'Signal-to-Noise', weight: 0.30, score: snrScore, detail: `Fleet avg ${snr.toFixed(1)} dB` },
          { name: 'Transmit Rate', weight: 0.20, score: txScore, detail: `Fleet avg ${Math.round(tx)} Mbps` },
          { name: 'Network Confidence', weight: 0.10, score: vpnConnPct, detail: `${vpnConnPct}% connected — ${v.vpn_active || 0} VPN, ${v.direct_connected || 0} direct, ${v.disconnected || 0} disconnected` },
        ]
      } else if (categoryKey === 'security') {
        const [osRows, fleetRows, postureRows] = await Promise.all([
          query('firehose.health.os_summary'),
          query('firehose.scores.fleet_summary'),
          query('firehose.security.posture_summary').catch(() => []),
        ])
        const os = osRows[0] || {}
        const fleet = fleetRows[0] || {}
        const posture = postureRows[0] || {}
        const reporting = os.total_devices || 0
        const fleetTotal = fleet.device_count || 1
        const postureHosts = Number(posture.posture_hosts || 0)
        const currentPct = reporting ? Math.round((os.os_current || 0) / reporting * 100) : 0
        const healthyPct = reporting ? Math.round((os.healthy || 0) / reporting * 100) : 0

        // 6 signal slots always rendered for transparency — config-based ones
        // (FileVault/Firewall/Gatekeeper/SIP) flip to `inactive` when the
        // Fleet posture schedule is paused. Weights below match the SQL
        // formula and sum to 100%.
        const hasPosture = postureHosts > 0
        const pct = (n) => Math.round((Number(n) || 0) / postureHosts * 100)
        const inactiveDetail = `Requires Fleet "DEX - Device security posture" schedule — currently paused, so this signal is not counted in the live Security score.`

        const sig = (name, type, weight, active, score, detail) => ({
          name, type, weight, score: active ? score : 0,
          detail: active ? detail : inactiveDetail,
          inactive: !active,
        })

        signalDefs = [
          sig('FileVault (disk encryption)', 'config', 0.25, hasPosture,
              hasPosture ? pct(posture.disk_encrypted_count) : 0,
              `${posture.disk_encrypted_count || 0}/${postureHosts} hosts encrypted`),
          sig('Firewall', 'config', 0.20, hasPosture,
              hasPosture ? pct(posture.firewall_enabled_count) : 0,
              `${posture.firewall_enabled_count || 0}/${postureHosts} hosts with firewall on`),
          sig('Gatekeeper', 'config', 0.15, hasPosture,
              hasPosture ? pct(posture.gatekeeper_enabled_count) : 0,
              `${posture.gatekeeper_enabled_count || 0}/${postureHosts} hosts with Gatekeeper active`),
          sig('SIP (System Integrity Protection)', 'config', 0.10, hasPosture,
              hasPosture ? pct(posture.sip_enabled_count) : 0,
              `${posture.sip_enabled_count || 0}/${postureHosts} hosts with SIP enabled`),
          sig('OS Currency', 'time', 0.15, true, currentPct,
              `${os.os_current || 0}/${reporting} reporting hosts on current OS (${fleetTotal - reporting} not reporting — scored as current)`),
          sig('DEX OS Health', 'time', 0.15, true, healthyPct,
              `${os.healthy || 0}/${reporting} reporting hosts rated healthy (${fleetTotal - reporting} not reporting — scored as acceptable)`),
        ]
      } else if (categoryKey === 'software') {
        const [crashRows, adoptRows, tierRows] = await Promise.all([
          query('firehose.crashes.summary'),
          query('firehose.adoption.summary'),
          query('firehose.adoption.tier_distribution'),
        ])
        const cr = crashRows[0] || {}
        const ad = adoptRows[0] || {}

        // Crash score — aligned with SQL: 0→100, 1→85, 2-4→65, 5-9→40, 10+→20
        const totalCrashes = cr.total_crashes_7d || 0
        const crashScore = totalCrashes === 0 ? 100 : totalCrashes === 1 ? 85 : totalCrashes <= 4 ? 65 : totalCrashes <= 9 ? 40 : 20

        // Adoption — use tier distribution for unique_apps per tier (not app-device pair counts)
        const staleRow = tierRows.find(r => r.usage_tier === 'stale_90d_plus') || {}
        const totalUniqueApps = ad.unique_apps || 1
        const staleUniqueApps = staleRow.unique_apps || 0
        const stalePct = Math.round(staleUniqueApps / totalUniqueApps * 100)
        const staleScore = stalePct < 20 ? 100 : stalePct < 40 ? 75 : stalePct < 60 ? 50 : 30

        // Active % — app-device pairs active this week / total pairs
        const totalPairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0) + (Number(ad.stale_30d) || 0) + (Number(ad.stale_90d) || 0) + (Number(ad.stale_90d_plus) || 0)
        const activePairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0)
        const activePct = totalPairs ? Math.round(activePairs / totalPairs * 100) : 70
        const adoptScore = activePct >= 80 ? 100 : activePct >= 60 ? 80 : activePct >= 40 ? 60 : 40

        signalDefs = [
          { name: 'Crash Frequency', weight: 0.40, score: crashScore, detail: `${totalCrashes} crashes across ${cr.devices_with_crashes || 0} devices in 7d` },
          { name: 'App Adoption', weight: 0.35, score: adoptScore, detail: `${activePct}% of app installs used this week` },
          { name: 'Shelfware', weight: 0.25, score: staleScore, detail: `${staleUniqueApps} of ${totalUniqueApps} unique apps (${stalePct}%) stale 90d+` },
        ]

        fetchSoftwareDetail()
      }

      signals.value = signalDefs
    } catch (e) {
      console.error('Signal breakdown fetch failed:', e)
      signals.value = []
    }
  }

  async function fetchSoftwareDetail() {
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000)
      const prevStart = new Date(start.getTime() - 7 * 24 * 3600 * 1000)
      const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')

      const [adoptRows, tierRows, osRows, crashTopRows, staleRows, patchSummaryRows, patchPrevRows] = await Promise.all([
        query('firehose.adoption.summary'),
        query('firehose.adoption.tier_distribution'),
        query('firehose.health.os_summary'),
        query('firehose.crashes.top_crashers', { limit: 8 }),
        query('firehose.adoption.stale_apps', { limit: 8 }),
        query('firehose.scores.timeline_patches_summary', { startDate: fmt(start), endDate: fmt(end), minHosts: 1 }).catch(() => []),
        query('firehose.scores.timeline_patches_summary', { startDate: fmt(prevStart), endDate: fmt(start), minHosts: 1 }).catch(() => []),
      ])

      // "Are we faster?" — host-weighted fleet MTTP, this 7d vs the prior 7d.
      // Lower MTTP = faster, so a negative delta is an improvement.
      const curMttp = wtdMttp(patchSummaryRows)
      const prevMttp = wtdMttp(patchPrevRows)
      patchTrend.value = {
        current: curMttp,
        prior: prevMttp,
        delta: (curMttp != null && prevMttp != null) ? +(curMttp - prevMttp).toFixed(2) : null,
      }

      softwarePatchMovers.value = aggregatePatchRowsBySoftware(patchSummaryRows, 10)

      const ad = adoptRows[0] || {}
      const os = osRows[0] || {}
      const osTotal = os.total_devices || 1
      const osPct = Math.round((os.os_current || 0) / osTotal * 100)
      const totalPairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0) + (Number(ad.stale_30d) || 0) + (Number(ad.stale_90d) || 0) + (Number(ad.stale_90d_plus) || 0)
      const activePairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0)
      const activePct = totalPairs ? Math.round(activePairs / totalPairs * 100) : 0

      patchStats.value = {
        avgDays: null,          // No patch velocity data in firehose yet
        pctCurrent: osPct,      // % fleet on current OS
        p90Days: null
      }
      patchTimeline.value = []

      // Most used: top crashers as a proxy for actively-used-but-problematic apps
      mostUsedApps.value = crashTopRows.filter(r => r.crashed_identifier).map(r => ({
        app_name: r.crashed_identifier,
        device_count: r.affected_devices,
        usage_grade: r.total_crashes_7d >= 5 ? 'F' : r.total_crashes_7d >= 2 ? 'C' : 'B'
      }))

      leastUsedApps.value = staleRows.map(r => ({
        app_name: r.app_name,
        bundle_identifier: r.bundle_identifier,
        stale_count: r.installed_on,
        avg_days: r.avg_days_stale
      }))
    } catch (e) {
      console.error('Software detail fetch failed:', e)
    }
  }

  // ─── App Drill-down: show devices for a specific app ──────────
  async function toggleAppDrill(appName, mode) {
    if (drillApp.value === appName) {
      drillApp.value = null
      drillDevices.value = []
      return
    }
    drillApp.value = appName
    drillLoading.value = true
    drillDevices.value = []

    try {
      // Find the bundle_identifier for this app from the stale list
      const staleApp = leastUsedApps.value.find(a => a.app_name === appName)
      if (staleApp && staleApp.bundle_identifier) {
        const rows = await query('firehose.adoption.by_app', { bundleId: staleApp.bundle_identifier })
        drillDevices.value = rows.map(r => ({
          host_identifier: r.host_id,
          hostname: r.hostname,
          app_version: r.version,
          usage_category: r.usage_tier,
          days_since_opened: r.days_since_opened
        }))
      } else {
        // Fallback: search stale_apps for this app name
        const rows = await query('firehose.adoption.stale_apps', { limit: 200 })
        drillDevices.value = rows.filter(r => r.app_name === appName).map(r => ({
          hostname: `${r.installed_on} devices`,
          app_version: r.version,
          usage_category: r.usage_tier,
          days_since_opened: r.avg_days_stale
        }))
      }
    } catch (e) {
      console.error('App drill-down failed:', e)
    }
    drillLoading.value = false
  }

  return {
    signals,
    patchStats,
    patchTimeline,
    mostUsedApps,
    leastUsedApps,
    softwarePatchMovers,
    patchTrend,
    patchTrendView,
    drillApp,
    drillDevices,
    drillLoading,
    fetchSignals,
    fetchSoftwareDetail,
    toggleAppDrill,
  }
}
