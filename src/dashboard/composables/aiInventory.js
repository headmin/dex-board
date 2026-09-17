/**
 * AI tool inventory — pure row normalisation and roll-ups.
 *
 * Input is the row shape emitted by the Fleet "AI discovery" report: one row
 * per finding, where `type` names the osquery table that produced it and
 * `detail` carries that table's extra columns as a JSON string. The same
 * shape is what the firehose ClickHouse table will carry once the results
 * stream there, so every function here works on either source.
 *
 * No Vue, no DOM — runs under plain `node --test` (see aiInventory.test.js).
 */

/** Discovery surface per `type`, in the order the page presents them. */
export const SURFACES = [
  { type: 'mcp_server', label: 'MCP servers', short: 'MCP' },
  { type: 'agent_instruction', label: 'Agent instruction files', short: 'Instructions' },
  { type: 'ide_plugins', label: 'IDE plugins', short: 'IDE' },
  { type: 'browser_extension', label: 'Browser extensions', short: 'Extensions' },
  { type: 'apps', label: 'Desktop apps', short: 'Apps' },
  { type: 'agents', label: 'CLI agents', short: 'CLI' },
  { type: 'sockets', label: 'Network connections', short: 'Network' },
]
const SURFACE_LABEL = Object.fromEntries(SURFACES.map(s => [s.type, s.label]))

/** Surfaces that represent an AI *tool* on the host (vendor roll-up scope). */
export const TOOL_TYPES = new Set(['agents', 'apps', 'ide_plugins', 'browser_extension', 'sockets'])

/**
 * Risk-flag catalogue — the board's reading of each flag the discovery
 * queries emit. Severity is the ONLY judgement added on top of the data;
 * descriptions restate what the query checked, verified against the export
 * (remote_fetch_exec is npx/uvx/bunx launchers, cleartext_endpoint is
 * http:// or sse remote MCP endpoints, and so on).
 */
export const RISK_FLAGS = {
  plaintext_secret: {
    severity: 'critical', label: 'Plaintext secret',
    description: 'An API key or token sits in cleartext in the MCP server config.',
  },
  injection_markers: {
    severity: 'critical', label: 'Injection markers',
    description: 'The instruction file contains text that reads as prompt injection or exfiltration — a pipe to a shell, an .ssh path, or "system prompt".',
  },
  sideloaded_unverified: {
    severity: 'critical', label: 'Sideloaded extension',
    description: 'Browser extension installed outside the web store, so it was never reviewed and cannot be verified.',
  },
  remote_fetch_exec: {
    severity: 'elevated', label: 'Fetch-and-run launcher',
    description: 'The MCP server is started through npx, uvx or bunx, which downloads and runs the package at launch — what executes can change without a config change.',
  },
  broad_host_permissions: {
    severity: 'elevated', label: 'Broad host permissions',
    description: 'The extension can read and change every page the browser opens (<all_urls>).',
  },
  hidden_unicode: {
    severity: 'elevated', label: 'Hidden unicode',
    description: 'The instruction file contains invisible or bidirectional characters that can hide text from a reviewer.',
  },
  world_writable: {
    severity: 'elevated', label: 'World-writable file',
    description: 'Any local user or process can rewrite this instruction file.',
  },
  cleartext_endpoint: {
    severity: 'elevated', label: 'Cleartext endpoint',
    description: 'MCP server configured over http:// rather than https://.',
    // The query raises this for every http:// URL and today records neither
    // the URL nor its host, so a loopback server (127.0.0.1) is flagged the
    // same as one across the internet. Where a host IS recorded, loopback is
    // exempted below (waivedFlags); where it is not, the flag stays because
    // the board cannot verify the exemption. See docs/ai-discovery-gaps.md.
    caveat: 'Loopback endpoints (127.0.0.1, localhost, ::1) have nothing for TLS to protect and are exempted when the query records the endpoint host. Servers without a recorded host keep the flag unverified.',
  },
  skip_permissions_runtime: {
    severity: 'elevated', label: 'Permission prompts disabled',
    description: 'The CLI agent was observed running with its permission prompts turned off, so it can act on files and commands without asking.',
  },
  unpinned_dependency: {
    severity: 'fair', label: 'Unpinned dependency',
    description: 'The MCP package version is not pinned, so the next launch may run a different release.',
  },
  world_readable_config: {
    severity: 'fair', label: 'World-readable config',
    description: 'The MCP config file is readable by other local users.',
  },
}

/** Worst → mildest. `clean` is the absence of flags, used for distributions. */
export const SEVERITY_ORDER = ['critical', 'elevated', 'fair']
const SEVERITY_RANK = Object.fromEntries(SEVERITY_ORDER.map((s, i) => [s, i]))

/** Tone vocabulary (statusTones TINT_TONES) for each severity and for clean. */
export const SEVERITY_TONE = { critical: 'critical', elevated: 'elevated', fair: 'fair', clean: 'good' }

export function flagInfo(flag) {
  return RISK_FLAGS[flag] || {
    severity: 'fair',
    label: flag.replace(/_/g, ' '),
    description: 'Emitted by the discovery query; not yet described here.',
    uncatalogued: true,
  }
}

/** Worst severity across a flag list, or null when there are none. */
export function severityOf(flags) {
  let worst = null
  for (const f of flags || []) {
    const s = flagInfo(f).severity
    if (worst === null || SEVERITY_RANK[s] < SEVERITY_RANK[worst]) worst = s
  }
  return worst
}

// ─── Vendor + tool naming ─────────────────────────────────────────
// Substring rules over identifier/name/source/cmdline, first match wins.
// Order matters: "github-mcp-server" must hit GitHub before anything
// broader, and Codex must be recognised before the generic OpenAI rule so
// it keeps its own label.
const VENDOR_RULES = [
  // Order matters at the top: Roo Code's id is "rooveterinaryinc.roo-cline"
  // (must beat Cline), and Cline's is "saoudrizwan.claude-dev" (must beat
  // Anthropic).
  [/roo-cline|roo code|\broo\b/, 'Roo Code'],
  [/\bcline\b|claude-dev/, 'Cline'],
  [/anthropic|claude/, 'Anthropic'],
  [/openai|chatgpt|codex/, 'OpenAI'],
  [/gemini|antigravity|google/, 'Google'],
  // Microsoft before GitHub: "Edge Copilot Bridge" and the Azure MCP extension
  // mention copilot but are Microsoft's, not GitHub Copilot.
  [/microsoft|azure|ms-azuretools|edge copilot|windows copilot/, 'Microsoft'],
  [/copilot|github/, 'GitHub'],
  [/jetbrains|intellij/, 'JetBrains'],
  [/cursor|todesktop/, 'Cursor'],
  [/perplexity|comet/, 'Perplexity'],
  [/ollama/, 'Ollama'],
  [/kilocode|kilo code/, 'Kilo Code'],
  [/windsurf/, 'Windsurf'],
  [/opencode/, 'OpenCode'],
  [/goose/, 'Block (Goose)'],
  [/thebrowser|\bdia\b/, 'The Browser Company'],
  [/genieai/, 'Genie AI'],
  [/codegpt/, 'CodeGPT'],
]

export function vendorOf(row) {
  // The identifier (bundle id, extension id, agent id) is the most reliable
  // signal and is tried alone first: "Kilo Code: AI Coding Agent, Copilot…"
  // must not become GitHub because its display name mentions Copilot.
  const ident = String(row.identifier || '').toLowerCase()
  if (ident && ident !== 'unknown') {
    for (const [re, vendor] of VENDOR_RULES) if (re.test(ident)) return vendor
  }
  // An MCP server's `source` is the CLIENT that configured it (claude-code,
  // cursor…), not the server's vendor — leave it out for that type.
  const source = row.type === 'mcp_server' ? '' : row.source
  const hay = [row.name, source, row.detail?.cmdline, row.detail?.publisher, row.detail?.command]
    .filter(Boolean).join(' ').toLowerCase()
  for (const [re, vendor] of VENDOR_RULES) if (re.test(hay)) return vendor
  return 'Other'
}

const TOOL_ALIASES = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  'claude helper': 'Claude Desktop',
  'claude': 'Claude Desktop',
  'chatgpt': 'ChatGPT',
  'codex': 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
  'opencode': 'OpenCode',
  'goose': 'Goose',
  'cursor': 'Cursor',
  'antigravity': 'Antigravity',
  'ollama': 'Ollama',
  'dia': 'Dia',
  'comet': 'Comet',
  'copilot-language-server': 'GitHub Copilot',
  '%extension.displayname%': 'Roo Code',
}

/**
 * Display name for the tool a row belongs to. Socket rows are named after
 * the process, and Claude Code's process name is its version string
 * ("2.1.268" with cmdline `claude --…`), so that case is resolved from the
 * command line.
 */
export function toolLabel(row) {
  const name = String(row.name || '')
  const cmd = String(row.detail?.cmdline || '')
  // Claude Code's process is named by its version; the cmdline usually starts
  // with `claude`, and the binary path always sits under a claude/ directory.
  if (row.type === 'sockets' && /^\d+(\.\d+)+$/.test(name) && (/^claude\b/.test(cmd) || /\/claude\//.test(String(row.path || '')))) return 'Claude Code'
  if (row.type === 'browser_extension') return name || row.identifier || '—'
  if (row.type === 'mcp_server') return mcpKey(row)
  const alias = TOOL_ALIASES[name.toLowerCase()]
  if (alias && row.type !== 'ide_plugins') return alias
  if (row.type === 'ide_plugins' && name.startsWith('%')) return alias || row.identifier || name
  return name || row.identifier || '—'
}

/**
 * Version-agnostic identity for an MCP server
 * ("salesforce-mcp-server@latest" → "salesforce-mcp-server").
 *
 * Process-discovered servers are named after the script that runs them,
 * which is usually "index.js" — so for a generic script name the package is
 * recovered from the launch command line: the segment after `node_modules/`
 * (scoped packages included), else any path segment that mentions "mcp".
 * That keeps user home directories out of the server name, which matters
 * for demo mode as much as for readability.
 */
const GENERIC_SCRIPT = /^(index|server|main|cli|app)\.(m?js|cjs|ts|py)$/i
export function mcpKey(row) {
  const name = String(row.name || row.identifier || '')
  const stripped = name.replace(/@latest$/, '').replace(/==.*$/, '')
  if (!GENERIC_SCRIPT.test(stripped)) return stripped || '—'
  if (row.identifier && !GENERIC_SCRIPT.test(row.identifier) && !row.identifier.startsWith('/')) return row.identifier
  const hay = [row.detail?.command, ...parseJsonList(row.detail?.args)].filter(Boolean).join(' ')
  const pkg = hay.match(/node_modules\/((?:@[^/\s]+\/)?[^/\s]+)/)
  if (pkg) return pkg[1]
  const seg = hay.match(/\/([^/\s]*mcp[^/\s]*)(?:\/|\s|$)/i)
  if (seg) return seg[1]
  return `${stripped} (unresolved)`
}

// ─── Endpoint host ────────────────────────────────────────────────
// Consumes the fields the discovery-query change asks for
// (docs/ai-discovery-gaps.md): `endpoint_host` directly, else the host of
// `url` / `endpoint`. Absent in today's export — every reader below treats
// "unknown host" as a distinct state, never as "remote".
export function endpointHost(detail) {
  if (!detail) return null
  const direct = detail.endpoint_host || detail.host
  if (direct) return String(direct).trim().toLowerCase().replace(/^\[|\]$/g, '') || null
  const url = detail.url || detail.endpoint || detail.target_endpoint
  if (!url) return null
  return hostOfEndpoint(url)
}

/**
 * Host part of an endpoint string in any of the forms the query emits:
 * a URL ("http://127.0.0.1:8787/mcp"), "host:port" for sockets
 * ("160.79.104.10:443"), or a bracketed IPv6 with port ("[2607:6bc0::10]:443").
 */
export function hostOfEndpoint(value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
    try { return new URL(v).hostname.toLowerCase().replace(/^\[|\]$/g, '') || null } catch { return null }
  }
  const v6 = v.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (v6) return v6[1].toLowerCase()
  if (/^[0-9a-f:]+$/i.test(v) && v.includes('::')) return v.toLowerCase()   // bare IPv6, no port
  const hp = v.match(/^([^/:\s]+)(?::\d+)?(?:\/.*)?$/)
  return hp ? hp[1].toLowerCase() : null
}

/** Port of "host:port" / "[v6]:port" / URL forms, else null. */
export function portOfEndpoint(value) {
  const v = String(value || '').trim()
  if (!v) return null
  const m = v.match(/(?:\]|^[^:\[]+):(\d{1,5})(?:\/|$)/)
  if (m) return Number(m[1])
  try { const p = new URL(v).port; return p ? Number(p) : null } catch { return null }
}

/** 127/8, ::1 and the localhost name family — traffic that never leaves the host. */
export function isLoopback(host) {
  if (!host) return false
  const h = String(host).toLowerCase()
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
}

/** Flags that are not a finding when the endpoint never leaves the machine. */
const LOOPBACK_WAIVED = new Set(['cleartext_endpoint'])

// ─── Normalisation ────────────────────────────────────────────────
function parseDetail(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

function parseRunning(v) {
  if (v === 1 || v === '1' || v === true) return true
  if (v === 0 || v === '0' || v === false) return false
  return null
}

/**
 * One finding, with the CSV/ClickHouse strings turned into usable values.
 * `host` prefers host_display_name (Fleet's own display label) and falls back
 * to the firehose hostname/host_id columns once the data comes from there.
 */
export function normalizeRow(raw, index = 0) {
  const detail = parseDetail(raw.detail ?? raw.activity_details)
  const rawFlags = String(raw.risk_indicators ?? raw.risk_flags ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const targetEndpoint = raw.target_endpoint || ''
  const host = endpointHost(detail) || hostOfEndpoint(targetEndpoint)
  const loopback = isLoopback(host)
  const networkTransport = detail.transport === 'http' || detail.transport === 'sse'
  // A waived flag is kept, visibly, as a waiver — the query still said it,
  // the board just has evidence it does not apply. Nothing is silently dropped.
  const waivedFlags = loopback ? rawFlags.filter(f => LOOPBACK_WAIVED.has(f)) : []
  const flags = rawFlags.filter(f => !waivedFlags.includes(f))
  // Two input dialects: the Fleet CSV export (type/name/source/risk_flags,
  // host_display_name) and the ClickHouse table (tool_type/tool_name/origin/
  // risk_indicators, hostname + host_id). Live names win when both exist.
  const type = raw.tool_type ?? raw.type ?? ''
  const row = {
    host: raw.host_display_name || raw.computer_name || (raw.hostname && String(raw.hostname).replace(/\.local$/i, '')) || raw.host_id || '—',
    hostname: raw.hostname || null,
    hostId: raw.host_id || null,
    scannedAt: raw.timestamp || null,
    type,
    category: raw.category || '',
    name: raw.tool_name ?? raw.name ?? '',
    identifier: raw.identifier ?? raw.event_id ?? '',
    source: raw.origin ?? raw.source ?? '',
    // The query writes 'remote' for every http/sse transport without looking
    // at the host. A recorded loopback host overrides that.
    location: loopback ? 'loopback' : (raw.location || raw.file_location || ''),
    targetEndpoint: targetEndpoint,
    endpointHost: host,
    loopback,
    /** http/sse server whose endpoint host the query did not record. */
    endpointUnknown: networkTransport && !host,
    waivedFlags,
    path: raw.path || raw.executable_path || '',
    version: raw.version || '',
    pid: raw.pid ? Number(raw.pid) || null : null,
    port: raw.port && raw.port !== '0' ? Number(raw.port) || null : portOfEndpoint(targetEndpoint),
    // The CSV export had a `running` column; the ClickHouse stream does not.
    // For MCP servers a running process is still knowable: source_type
    // 'process' or 'both' means the scan saw it live. Everything else with no
    // column is null — unknown, never "not running".
    running: parseRunning(raw.running) ?? (type === 'mcp_server' && detail.source_type ? ['process', 'both'].includes(detail.source_type) : null),
    flags,
    severity: severityOf(flags),
    detail,
  }
  row.surface = SURFACE_LABEL[row.type] || row.type || '—'
  row.vendor = vendorOf(row)
  row.tool = toolLabel(row)
  row.tier = governanceTier(row)
  row.key = [index, row.hostId || row.host, row.type, row.identifier, row.name, row.path, row.pid, row.port].join('|')
  return row
}

export function normalizeRows(rows) {
  return (rows || []).map((r, i) => normalizeRow(r, i))
}

// ─── Governance tiers ─────────────────────────────────────────────
/**
 * Default "known" vendors — the mainstream, commercially supported AI
 * products a corporate IT team is expected to have an opinion about. This is
 * a recognisability list, NOT an approval list: the page labels it as such
 * and the deployment can replace it (KNOWN_AI_VENDORS in the Worker env,
 * surfaced through /api/config). Vendors not in the list are "explorative":
 * present on hosts, but outside the well-known set.
 */
export const DEFAULT_KNOWN_VENDORS = ['Anthropic', 'OpenAI', 'Google', 'GitHub', 'Microsoft', 'JetBrains', 'Cursor']

/** Local inference / self-hosted signals that make a tool "local" regardless of vendor. */
const LOCAL_CATEGORIES = new Set(['inference-api-local', 'mcp-server-local'])
const LOCAL_VENDORS = new Set(['Ollama'])

/**
 * Which governance tier a finding belongs to:
 *   known        a product from a known vendor (hosted, commercial)
 *   explorative  any other hosted AI tool — the long tail
 *   local        self-hosted / on-device inference and local AI services
 *   mcp          MCP servers (their own axis: local process, loopback, remote)
 *   null         not a product: agent instruction files
 */
export function governanceTier(row, knownVendors = DEFAULT_KNOWN_VENDORS) {
  if (row.type === 'agent_instruction') return null
  if (row.type === 'mcp_server') return 'mcp'
  if (
    LOCAL_CATEGORIES.has(row.category) ||
    LOCAL_VENDORS.has(row.vendor) ||
    (row.type === 'sockets' && row.source === 'listen') ||
    String(row.detail?.serves_local_api) === '1'
  ) return 'local'
  return knownVendors.includes(row.vendor) ? 'known' : 'explorative'
}

/**
 * The governance answer: how much of the fleet's AI tooling is known
 * product, how much is explorative, how much runs locally, and the MCP
 * footprint split by where the server actually runs.
 */
export function governance(rows, { knownVendors = DEFAULT_KNOWN_VENDORS } = {}) {
  const tiered = rows.map(r => ({ ...r, tier: governanceTier(r, knownVendors) }))
  const tierBlock = (tier) => {
    const sub = tiered.filter(r => r.tier === tier)
    const list = countBy(sub, r => r.tool).sort(byHostsDesc)
    return { tier, findings: sub.length, hosts: new Set(sub.map(r => r.host)).size, tools: list.length, list,
      vendors: countBy(sub, r => r.vendor).sort(byHostsDesc) }
  }
  const mcpRows = tiered.filter(r => r.tier === 'mcp')
  const servers = mcpServers(mcpRows)
  const mcp = {
    findings: mcpRows.length,
    hosts: new Set(mcpRows.map(r => r.host)).size,
    servers: servers.length,
    localProcess: servers.filter(s => !s.remote && !s.loopback).length,
    loopback: servers.filter(s => s.loopback).length,
    remote: servers.filter(s => s.remote).length,
    list: servers,
  }
  return { known: tierBlock('known'), explorative: tierBlock('explorative'), local: tierBlock('local'), mcp, knownVendors }
}

// ─── Roll-ups ─────────────────────────────────────────────────────
function countBy(rows, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (k == null || k === '') continue
    let e = m.get(k)
    if (!e) { e = { key: k, findings: 0, hosts: new Set() }; m.set(k, e) }
    e.findings++
    e.hosts.add(r.host)
  }
  return Array.from(m.values()).map(e => ({ key: e.key, findings: e.findings, hosts: e.hosts.size }))
}

const byHostsDesc = (a, b) => b.hosts - a.hosts || b.findings - a.findings || String(a.key).localeCompare(String(b.key))

/** Fleet-wide answer: who uses what, and what carries a flag. */
export function summarize(rows) {
  const hosts = new Set(rows.map(r => r.host))
  const toolRows = rows.filter(r => TOOL_TYPES.has(r.type))

  const surfaces = SURFACES.map(s => {
    const sub = rows.filter(r => r.type === s.type)
    return { ...s, findings: sub.length, hosts: new Set(sub.map(r => r.host)).size }
  })

  const vendors = countBy(toolRows, r => r.vendor).sort(byHostsDesc)

  const runningRows = rows.filter(r => r.running === true && (r.type === 'agents' || r.type === 'apps'))
  const running = {
    hosts: new Set(runningRows.map(r => r.host)).size,
    tools: countBy(runningRows, r => r.tool).sort(byHostsDesc),
  }

  const flaggedRows = rows.filter(r => r.flags.length)
  const flagCounts = new Map()
  for (const r of flaggedRows) {
    for (const f of r.flags) {
      let e = flagCounts.get(f)
      if (!e) { e = { flag: f, ...flagInfo(f), findings: 0, hosts: new Set(), types: new Set() }; flagCounts.set(f, e) }
      e.findings++
      e.hosts.add(r.host)
      e.types.add(r.type)
    }
  }
  // Per flag: how many carriers the board could NOT verify (http/sse server
  // with no recorded endpoint host), and how many findings were waived as
  // loopback. Both are disclosed next to the flag.
  const unverified = new Map()
  const waived = new Map()
  for (const r of rows) {
    if (r.endpointUnknown) for (const f of r.flags) unverified.set(f, (unverified.get(f) || 0) + 1)
    for (const f of r.waivedFlags) waived.set(f, (waived.get(f) || 0) + 1)
  }
  const flags = Array.from(flagCounts.values())
    .map(e => ({
      ...e,
      hosts: e.hosts.size,
      surfaces: Array.from(e.types).map(t => SURFACE_LABEL[t] || t),
      unverified: unverified.get(e.flag) || 0,
      waived: waived.get(e.flag) || 0,
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.findings - a.findings)
  const bySeverity = { critical: 0, elevated: 0, fair: 0, clean: 0 }
  for (const r of rows) bySeverity[r.severity || 'clean']++
  const worstPerHost = new Map()
  for (const r of flaggedRows) {
    const cur = worstPerHost.get(r.host)
    if (cur == null || SEVERITY_RANK[r.severity] < SEVERITY_RANK[cur]) worstPerHost.set(r.host, r.severity)
  }
  const hostsBySeverity = { critical: 0, elevated: 0, fair: 0 }
  for (const s of worstPerHost.values()) hostsBySeverity[s]++

  const mcpRows = rows.filter(r => r.type === 'mcp_server')
  const servers = mcpServers(mcpRows)
  const mcp = {
    findings: mcpRows.length,
    hosts: new Set(mcpRows.map(r => r.host)).size,
    servers: servers.length,
    remote: servers.filter(s => s.remote).length,
    withSecrets: servers.filter(s => s.envKeys.length).length,
    flagged: servers.filter(s => s.flags.length).length,
    loopback: servers.filter(s => s.loopback).length,
    endpointUnknown: servers.filter(s => s.endpointUnknown).length,
    waivedFindings: mcpRows.reduce((n, r) => n + r.waivedFlags.length, 0),
    clients: countBy(mcpRows.filter(r => r.source !== 'process'), r => r.source).sort(byHostsDesc),
    transports: countBy(mcpRows, r => r.detail.transport || 'unknown').sort(byHostsDesc),
  }

  const instrRows = rows.filter(r => r.type === 'agent_instruction')
  const instructions = {
    files: instrRows.length,
    hosts: new Set(instrRows.map(r => r.host)).size,
    flagged: instrRows.filter(r => r.flags.length).length,
    userScoped: instrRows.filter(r => r.detail.scope === 'user').length,
    byAgent: countBy(instrRows, r => r.identifier).sort(byHostsDesc),
    byFile: countBy(instrRows, r => r.name).sort(byHostsDesc),
  }

  const egressRows = rows.filter(r => r.type === 'sockets' && r.source !== 'listen')
  const listenRows = rows.filter(r => r.type === 'sockets' && r.source === 'listen')
  const network = {
    connections: egressRows.length,
    hosts: new Set(egressRows.map(r => r.host)).size,
    byTool: countBy(egressRows, r => r.tool).sort(byHostsDesc),
    listeners: listenRows.map(r => ({
      host: r.host, tool: r.tool, port: r.port, category: r.category,
      address: r.detail.local_address || '', key: r.key,
    })),
  }

  return {
    hosts: hosts.size,
    findings: rows.length,
    surfaces,
    vendors,
    running,
    risk: {
      flagged: flaggedRows.length,
      flaggedHosts: worstPerHost.size,
      bySeverity,
      hostsBySeverity,
      flags,
    },
    mcp,
    instructions,
    network,
  }
}

/**
 * Distinct MCP servers across the fleet, folded by version-agnostic name.
 * A server discovered both from a config file and from a running process on
 * the same host contributes one host but keeps both discovery kinds.
 */
export function mcpServers(rows) {
  const m = new Map()
  for (const r of rows) {
    if (r.type !== 'mcp_server') continue
    const key = mcpKey(r)
    let e = m.get(key)
    if (!e) {
      e = {
        key, name: key, hosts: new Set(), clients: new Set(), scopes: new Set(), transports: new Set(),
        flags: new Set(), envKeys: new Set(), commands: new Set(), running: false, remote: false,
        discovery: new Set(), findings: 0, rows: [],
        endpointHosts: new Set(), waivedFlags: new Set(), loopback: false, endpointUnknown: false,
      }
      m.set(key, e)
    }
    e.findings++
    e.rows.push(r)
    e.hosts.add(r.host)
    if (r.source && r.source !== 'process') e.clients.add(r.source)
    if (r.detail.scope) e.scopes.add(r.detail.scope)
    if (r.detail.transport) e.transports.add(r.detail.transport)
    if (r.detail.source_type) e.discovery.add(r.detail.source_type)
    for (const f of r.flags) e.flags.add(f)
    for (const k of parseJsonList(r.detail.env_keys)) e.envKeys.add(k)
    if (r.detail.command) e.commands.add(r.detail.command)
    if (r.running === true) e.running = true
    if (r.endpointHost) e.endpointHosts.add(r.endpointHost)
    for (const f of r.waivedFlags) e.waivedFlags.add(f)
    if (r.loopback) e.loopback = true
    if (r.endpointUnknown) e.endpointUnknown = true
    // Remote = leaves the machine. A loopback host is network transport that
    // does not; an unrecorded host is reported as such, not assumed remote.
    if (!r.loopback && (r.location === 'remote' || r.detail.transport === 'http' || r.detail.transport === 'sse')) e.remote = true
  }
  return Array.from(m.values()).map(e => {
    const flags = Array.from(e.flags)
    return {
      key: e.key,
      name: e.name,
      findings: e.findings,
      hosts: e.hosts.size,
      hostNames: Array.from(e.hosts).sort(),
      clients: Array.from(e.clients).sort(),
      scopes: Array.from(e.scopes).sort(),
      transports: Array.from(e.transports).sort(),
      discovery: Array.from(e.discovery).sort(),
      commands: Array.from(e.commands).sort(),
      envKeys: Array.from(e.envKeys).sort(),
      flags,
      waivedFlags: Array.from(e.waivedFlags),
      endpointHosts: Array.from(e.endpointHosts).sort(),
      loopback: e.loopback,
      endpointUnknown: e.endpointUnknown,
      severity: severityOf(flags),
      running: e.running,
      remote: e.remote,
      rows: e.rows,
    }
  }).sort((a, b) => {
    const sa = a.severity ? SEVERITY_RANK[a.severity] : 9
    const sb = b.severity ? SEVERITY_RANK[b.severity] : 9
    return sa - sb || b.hosts - a.hosts || a.name.localeCompare(b.name)
  })
}

function parseJsonList(v) {
  if (!v) return []
  if (Array.isArray(v)) return v
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
}

/** Per-host reading — the drill from the fleet answer to one machine. */
export function hostRollup(rows) {
  const m = new Map()
  for (const r of rows) {
    let e = m.get(r.host)
    if (!e) {
      e = {
        host: r.host, hostId: r.hostId, findings: 0, byType: {}, vendors: new Set(), tools: new Set(),
        runningTools: new Set(), flagged: 0, severity: null, flags: new Set(), rows: [],
      }
      m.set(r.host, e)
    }
    e.findings++
    e.rows.push(r)
    e.byType[r.type] = (e.byType[r.type] || 0) + 1
    if (TOOL_TYPES.has(r.type)) { e.vendors.add(r.vendor); e.tools.add(r.tool) }
    if (r.running === true && (r.type === 'agents' || r.type === 'apps')) e.runningTools.add(r.tool)
    if (r.flags.length) {
      e.flagged++
      for (const f of r.flags) e.flags.add(f)
      if (e.severity == null || SEVERITY_RANK[r.severity] < SEVERITY_RANK[e.severity]) e.severity = r.severity
    }
  }
  return Array.from(m.values()).map(e => ({
    host: e.host,
    hostId: e.hostId,
    findings: e.findings,
    mcp: e.byType.mcp_server || 0,
    instructions: e.byType.agent_instruction || 0,
    extensions: e.byType.browser_extension || 0,
    idePlugins: e.byType.ide_plugins || 0,
    apps: e.byType.apps || 0,
    agents: e.byType.agents || 0,
    connections: e.byType.sockets || 0,
    vendors: Array.from(e.vendors).sort(),
    tools: Array.from(e.tools).sort(),
    runningTools: Array.from(e.runningTools).sort(),
    flagged: e.flagged,
    severity: e.severity,
    flags: Array.from(e.flags),
    rows: e.rows,
  })).sort((a, b) => {
    const sa = a.severity ? SEVERITY_RANK[a.severity] : 9
    const sb = b.severity ? SEVERITY_RANK[b.severity] : 9
    return sa - sb || b.flagged - a.flagged || b.findings - a.findings || a.host.localeCompare(b.host)
  })
}
