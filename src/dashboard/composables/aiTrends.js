/**
 * AI tool trends — pure roll-ups over the daily state queries.
 *
 * Input rows come from `firehose.ai.daily_tools`: one row per (day, tool
 * group) with `hosts` = distinct hosts whose end-of-day state included the
 * tool. Labelling reuses aiInventory (toolLabel, vendorOf, governanceTier)
 * on the sampled columns so a tool is named the same here and on the
 * overview page.
 *
 * Honesty rules baked in:
 *   • `historyDays` is the number of days that actually have data. The page
 *     reads it before saying anything about movement.
 *   • A "mover" is a plain difference between the first and the latest day
 *     present — no smoothing, no extrapolation, no "trend" adjectives.
 *
 * No Vue, no DOM — runs under plain `node --test`.
 */
import { normalizeRow, governanceTier, DEFAULT_KNOWN_VENDORS } from './aiInventory.js'

/** Turn a daily_tools row into a labelled series point. */
export function labelDailyRow(r, knownVendors = DEFAULT_KNOWN_VENDORS) {
  const norm = normalizeRow({
    tool_type: r.tool_type,
    tool_name: r.sample_name,
    category: r.sample_category,
    identifier: r.sample_identifier,
    origin: r.sample_origin,
    detail: r.sample_detail,
    target_endpoint: r.sample_endpoint,
    path: r.sample_path,
    risk_indicators: '',
  })
  return {
    day: String(r.day),
    type: r.tool_type,
    key: `${r.tool_type}|${r.tool_key}|${r.origin_key || ''}`,
    tool: norm.tool,
    vendor: norm.vendor,
    tier: governanceTier(norm, knownVendors),
    surface: norm.surface,
    hosts: Number(r.hosts) || 0,
    findings: Number(r.findings) || 0,
    flagged: Number(r.flagged) || 0,
  }
}

/**
 * Per-tool series and movers between the first and latest day present.
 * Tools are identified by display label + type, so two SQL groups that label
 * to the same tool (rare) are merged by taking the max hosts per day — a
 * host with both would otherwise be counted twice.
 */
export function toolTrends(rows, { knownVendors = DEFAULT_KNOWN_VENDORS } = {}) {
  const points = rows.map(r => labelDailyRow(r, knownVendors))
  const days = Array.from(new Set(points.map(p => p.day))).sort()
  const first = days[0] || null
  const latest = days[days.length - 1] || null

  const tools = new Map()
  for (const p of points) {
    const id = `${p.type}|${p.tool}`
    let t = tools.get(id)
    if (!t) {
      t = { id, tool: p.tool, type: p.type, surface: p.surface, vendor: p.vendor, tier: p.tier, byDay: new Map() }
      tools.set(id, t)
    }
    t.byDay.set(p.day, Math.max(t.byDay.get(p.day) || 0, p.hosts))
  }

  const list = Array.from(tools.values()).map(t => {
    const series = days.map(d => ({ day: d, hosts: t.byDay.get(d) || 0 }))
    const firstHosts = first ? (t.byDay.get(first) || 0) : 0
    const latestHosts = latest ? (t.byDay.get(latest) || 0) : 0
    return {
      ...t,
      byDay: undefined,
      series,
      firstHosts,
      latestHosts,
      delta: latestHosts - firstHosts,
      isNew: firstHosts === 0 && latestHosts > 0,
      isGone: firstHosts > 0 && latestHosts === 0,
      peakHosts: Math.max(0, ...series.map(s => s.hosts)),
    }
  }).sort((a, b) => b.latestHosts - a.latestHosts || a.tool.localeCompare(b.tool))

  const gaining = list.filter(t => t.delta > 0).sort((a, b) => b.delta - a.delta || b.latestHosts - a.latestHosts)
  const losing = list.filter(t => t.delta < 0).sort((a, b) => a.delta - b.delta || b.firstHosts - a.firstHosts)

  return {
    days,
    historyDays: days.length,
    firstDay: first,
    latestDay: latest,
    tools: list,
    gaining,
    losing,
    appeared: list.filter(t => t.isNew),
    disappeared: list.filter(t => t.isGone),
  }
}

/**
 * Distinct hosts per surface per day, from `firehose.ai.daily_surfaces`.
 * Exact (uniqExact in SQL), unlike anything summed over tool groups.
 */
export function surfaceSeries(rows) {
  const days = Array.from(new Set((rows || []).map(r => String(r.day)))).sort()
  const byType = new Map()
  for (const r of rows || []) {
    const t = r.tool_type
    if (!byType.has(t)) byType.set(t, new Map())
    byType.get(t).set(String(r.day), Number(r.hosts) || 0)
  }
  return Array.from(byType.entries()).map(([type, m]) => ({
    type,
    series: days.map(d => ({ day: d, hosts: m.get(d) || 0 })),
    latestHosts: days.length ? (m.get(days[days.length - 1]) || 0) : 0,
    firstHosts: days.length ? (m.get(days[0]) || 0) : 0,
  })).map(s => ({ ...s, delta: s.latestHosts - s.firstHosts }))
    .sort((a, b) => b.latestHosts - a.latestHosts)
}

/** Totals series from `firehose.ai.daily_totals`, numbers coerced. */
export function totalsSeries(rows) {
  return (rows || []).map(r => ({
    day: String(r.day),
    hosts_scanned: Number(r.hosts_scanned) || 0,
    hosts_with_findings: Number(r.hosts_with_findings) || 0,
    findings: Number(r.findings) || 0,
    flagged: Number(r.flagged) || 0,
    flagged_hosts: Number(r.flagged_hosts) || 0,
    mcp_servers: Number(r.mcp_servers) || 0,
  })).sort((a, b) => a.day.localeCompare(b.day))
}
