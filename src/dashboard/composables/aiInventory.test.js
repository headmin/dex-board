/**
 * Unit tests for the AI tool inventory roll-ups.
 *
 * Runs on plain `node --test` like chipTier.test.js — no Vue, no DOM.
 * Fixture rows mirror the Fleet report export column-for-column.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeRows,
  summarize,
  mcpServers,
  hostRollup,
  severityOf,
  toolLabel,
  vendorOf,
  mcpKey,
  flagInfo,
  endpointHost,
  isLoopback,
  hostOfEndpoint,
  portOfEndpoint,
  governance,
  fleetRiskRating,
  hostRiskScore,
} from './aiInventory.js'

const raw = (over) => ({
  host_display_name: 'Host A', category: '', detail: '', identifier: '', location: 'local',
  name: '', path: '', pid: '', port: '', risk_flags: '', running: '', sha256: '', source: '',
  type: '', uid: '501', version: '', ...over,
})

const FIXTURE = [
  raw({ type: 'apps', name: 'claude-desktop', identifier: 'com.anthropic.claudefordesktop', source: 'applications', running: '1', detail: '{"bundle_id":"com.anthropic.claudefordesktop","scope":"system"}' }),
  raw({ type: 'agents', name: 'claude-code', identifier: 'claude', source: 'homebrew', running: '0', detail: '{"binary":"claude","runtime":"node"}' }),
  raw({ type: 'sockets', name: '2.1.268', identifier: 'unknown', source: 'established', location: 'remote', port: '443', running: '1', category: 'ai-api-egress', detail: '{"cmdline":"claude --enable-auto-mode","protocol":"tcp"}' }),
  raw({ type: 'sockets', name: 'ollama', identifier: 'ollama', source: 'listen', port: '11434', category: 'inference-api-local', detail: '{"cmdline":"ollama serve","local_address":"127.0.0.1"}' }),
  raw({ type: 'browser_extension', name: 'Claude', identifier: 'fcoe', source: 'chrome', category: 'ai-tool', risk_flags: 'broad_host_permissions,sideloaded_unverified', detail: '{"browser":"chrome","from_webstore":"false"}' }),
  raw({ type: 'mcp_server', name: 'salesforce-mcp-server@latest', identifier: 'salesforce-mcp-server', source: 'claude-code', category: 'mcp-server', risk_flags: 'remote_fetch_exec,unpinned_dependency', detail: '{"command":"npx","transport":"stdio","scope":"user","source_type":"config","env_keys":"[\\"SF_TOKEN\\"]"}' }),
  raw({ host_display_name: 'Host B', type: 'mcp_server', name: 'salesforce-mcp-server', identifier: 'salesforce-mcp-server', source: 'process', category: 'mcp-server', running: '1', detail: '{"command":"npm","transport":"stdio","scope":"global","source_type":"process"}' }),
  raw({ host_display_name: 'Host B', type: 'mcp_server', name: 'com.figma.mcp/mcp', identifier: 'com.figma.mcp/mcp', source: 'claude-code', location: 'remote', category: 'mcp-server', risk_flags: 'world_readable_config', detail: '{"transport":"http","scope":"user","source_type":"config"}' }),
  raw({ host_display_name: 'Host B', type: 'agent_instruction', name: 'CLAUDE.md', identifier: 'claude', source: 'claude', category: 'agent-instruction', risk_flags: 'injection_markers', detail: '{"scope":"project","size":"1454","markers":"| sh"}' }),
  raw({ host_display_name: 'Host C', type: 'agent_instruction', name: 'AGENTS.md', identifier: 'codex', source: 'codex', category: 'agent-instruction', detail: '{"scope":"project","size":"900"}' }),
  raw({ host_display_name: 'Host C', type: 'ide_plugins', name: '%extension.displayName%', identifier: 'rooveterinaryinc.roo-cline', source: 'vscode', category: 'agent-runtime', detail: '{"editor_family":"vscode"}' }),
]

test('normalises strings into typed fields and parses detail JSON', () => {
  const rows = normalizeRows(FIXTURE)
  assert.equal(rows.length, FIXTURE.length)
  assert.equal(rows[0].running, true)
  assert.equal(rows[1].running, false)
  assert.equal(rows[4].running, null)
  assert.equal(rows[3].port, 11434)
  assert.equal(rows[0].port, null, '"0"/"" ports read as no port')
  assert.deepEqual(rows[4].flags, ['broad_host_permissions', 'sideloaded_unverified'])
  assert.equal(rows[5].detail.command, 'npx')
  assert.equal(rows[0].surface, 'Desktop apps')
})

test('severity is the worst flag; clean rows have none', () => {
  assert.equal(severityOf([]), null)
  assert.equal(severityOf(['world_readable_config']), 'fair')
  assert.equal(severityOf(['unpinned_dependency', 'remote_fetch_exec']), 'elevated')
  assert.equal(severityOf(['world_readable_config', 'plaintext_secret']), 'critical')
  assert.equal(flagInfo('brand_new_flag').uncatalogued, true, 'unknown flags degrade honestly')
})

test('tool and vendor naming resolves the awkward cases', () => {
  const rows = normalizeRows(FIXTURE)
  assert.equal(toolLabel(rows[2]), 'Claude Code', 'versioned socket process name resolved from cmdline')
  assert.equal(toolLabel(rows[0]), 'Claude Desktop')
  assert.equal(toolLabel(rows[10]), 'Roo Code', 'unresolved i18n placeholder falls back to the identifier alias')
  assert.equal(vendorOf(rows[2]), 'Anthropic')
  assert.equal(vendorOf(rows[3]), 'Ollama')
  assert.equal(vendorOf(rows[10]), 'Roo Code')
  assert.equal(mcpKey(rows[5]), 'salesforce-mcp-server', '@latest stripped')
  assert.equal(mcpKey(normalizeRows([raw({ type: 'mcp_server', name: 'mcp-server-linkedin==4.22.0' })])[0]), 'mcp-server-linkedin')
  const generic = (detail) => mcpKey(normalizeRows([raw({ type: 'mcp_server', name: 'index.js', identifier: 'index.js', detail: JSON.stringify(detail) })])[0])
  assert.equal(generic({ command: '/opt/homebrew/bin/node', args: '["/opt/homebrew/lib/node_modules/reclaim-mcp-server/dist/index.js"]' }), 'reclaim-mcp-server', 'package recovered from node_modules path')
  assert.equal(generic({ command: 'node', args: '["/x/node_modules/@scope/pkg-mcp/dist/index.js"]' }), '@scope/pkg-mcp', 'scoped package kept whole')
  assert.equal(generic({ command: '/Users/someone/Library/Application', args: '["Support/Zed/extensions/work/mcp-server-context7/bin/index.js"]' }), 'mcp-server-context7', 'falls back to the path segment naming the server')
  assert.equal(generic({ command: 'node', args: '["/tmp/index.js"]' }), 'index.js (unresolved)', 'never names a server after a bare script')
})

test('summarize counts hosts once per surface and rolls up flags by severity', () => {
  const s = summarize(normalizeRows(FIXTURE))
  assert.equal(s.hosts, 3)
  assert.equal(s.findings, FIXTURE.length)
  const mcp = s.surfaces.find(x => x.type === 'mcp_server')
  assert.equal(mcp.findings, 3)
  assert.equal(mcp.hosts, 2)
  assert.deepEqual(s.risk.bySeverity, { critical: 2, elevated: 1, fair: 1, clean: 7 })
  assert.deepEqual(s.risk.hostsBySeverity, { critical: 2, elevated: 0, fair: 0 })
  assert.equal(s.risk.flaggedHosts, 2)
  assert.equal(s.risk.flags[0].severity, 'critical', 'flags list is worst-first')
  assert.equal(s.vendors[0].key, 'Anthropic')
  assert.equal(s.vendors[0].hosts, 1, 'a host with four Anthropic findings is one host')
  assert.equal(s.running.tools[0].key, 'Claude Desktop')
  assert.equal(s.network.connections, 1, 'listeners are not egress')
  assert.equal(s.network.listeners.length, 1)
  assert.equal(s.instructions.flagged, 1)
  assert.equal(s.mcp.servers, 2)
  assert.equal(s.mcp.remote, 1)
  assert.equal(s.mcp.withSecrets, 1)
})

test('mcpServers folds config and process discoveries of one server', () => {
  const list = mcpServers(normalizeRows(FIXTURE))
  const sf = list.find(x => x.key === 'salesforce-mcp-server')
  assert.equal(sf.hosts, 2)
  assert.deepEqual(sf.discovery, ['config', 'process'])
  assert.deepEqual(sf.clients, ['claude-code'], 'the process source is not a client')
  assert.equal(sf.running, true)
  assert.equal(sf.severity, 'elevated')
  assert.deepEqual(sf.envKeys, ['SF_TOKEN'])
  assert.equal(list[0].key, 'salesforce-mcp-server', 'worst severity first')
  assert.equal(list.find(x => x.key === 'com.figma.mcp/mcp').remote, true)
})

test('hostRollup orders by worst severity then flagged count', () => {
  const hosts = hostRollup(normalizeRows(FIXTURE))
  assert.deepEqual(hosts.map(h => h.host), ['Host A', 'Host B', 'Host C'])
  assert.equal(hosts[0].severity, 'critical')
  assert.equal(hosts[2].severity, null)
  assert.equal(hosts[0].mcp, 1)
  assert.equal(hosts[1].instructions, 1)
  assert.deepEqual(hosts[0].runningTools, ['Claude Desktop'])
  assert.deepEqual(hosts[0].vendors, ['Anthropic', 'Ollama'])
})

test('loopback endpoints waive the cleartext flag; unrecorded hosts keep it unverified', () => {
  const mcp = (over) => normalizeRows([raw({ type: 'mcp_server', name: 'wedge', identifier: 'wedge', source: 'claude-code', location: 'remote', risk_flags: 'cleartext_endpoint,world_readable_config', ...over })])[0]

  // Today's export: http transport, no url/host recorded.
  const today = mcp({ detail: '{"transport":"http","scope":"project","source_type":"config"}' })
  assert.deepEqual(today.flags, ['cleartext_endpoint', 'world_readable_config'], 'nothing waived without evidence')
  assert.equal(today.endpointUnknown, true)
  assert.equal(today.location, 'remote', 'the query\'s own reading stands when there is nothing to override it with')

  // After the query change: url recorded, loopback.
  const local = mcp({ detail: '{"transport":"http","url":"http://127.0.0.1:8787/mcp"}' })
  assert.deepEqual(local.flags, ['world_readable_config'], 'cleartext waived, the other flag stays')
  assert.deepEqual(local.waivedFlags, ['cleartext_endpoint'])
  assert.equal(local.location, 'loopback')
  assert.equal(local.severity, 'fair')
  assert.equal(local.endpointUnknown, false)

  // endpoint_host field, IPv6 loopback in brackets.
  const v6 = mcp({ detail: '{"transport":"sse","endpoint_host":"[::1]"}' })
  assert.equal(v6.loopback, true)

  // Real remote host keeps the flag and stays remote.
  const remote = mcp({ detail: '{"transport":"http","url":"http://mcp.example.internal/mcp"}' })
  assert.deepEqual(remote.flags, ['cleartext_endpoint', 'world_readable_config'])
  assert.equal(remote.location, 'remote')

  const s = summarize([today, local, remote])
  const ct = s.risk.flags.find(f => f.flag === 'cleartext_endpoint')
  assert.equal(ct.findings, 2, 'waived findings are not counted as flagged')
  assert.equal(ct.unverified, 1)
  assert.equal(ct.waived, 1)
  assert.equal(s.mcp.loopback, 1)
  assert.equal(s.mcp.endpointUnknown, 1)
  assert.equal(s.mcp.remote, 1, 'loopback is not remote; unknown host is not assumed remote either')
  assert.equal(mcpServers([local])[0].remote, false)
})

test('endpoint host parsing and loopback detection', () => {
  assert.equal(endpointHost({ url: 'http://localhost:3845/mcp' }), 'localhost')
  assert.equal(endpointHost({ url: 'https://api.example.com/x' }), 'api.example.com')
  assert.equal(endpointHost({ endpoint_host: '127.0.0.1' }), '127.0.0.1')
  assert.equal(endpointHost({ url: 'not a url' }), null)
  assert.equal(endpointHost({ transport: 'http' }), null)
  for (const h of ['127.0.0.1', '127.1.2.3', 'localhost', 'app.localhost', '::1']) assert.equal(isLoopback(h), true, h)
  for (const h of ['0.0.0.0', '10.0.0.1', '128.0.0.1', 'localhost.example.com', null]) assert.equal(isLoopback(h), false, String(h))
})

test('accepts the ClickHouse dialect and the second query shape', () => {
  const live = normalizeRows([
    { host_id: 'UUID-1', hostname: 'mi5.localdomain', timestamp: '2026-09-17 08:00:00', tool_type: 'mcp_server', tool_name: 'wedge', category: 'mcp-server', identifier: 'wedge', origin: 'claude-code', location: 'remote', path: '/Users/someone/.claude.json', version: '', risk_indicators: 'cleartext_endpoint', target_endpoint: 'http://127.0.0.1:8787/mcp', detail: '{"transport":"http","scope":"project","source_type":"config"}', sha256_hash: '' },
    { host_id: 'UUID-1', hostname: 'mi5.localdomain', timestamp: '2026-09-17 08:00:00', tool_type: 'sockets', tool_name: '2.1.270', category: 'ai-api-egress', identifier: 'unknown', origin: 'established', location: 'remote', path: '', version: '', risk_indicators: '', target_endpoint: '160.79.104.10:443', detail: '{"cmdline":"claude","protocol":"tcp"}', sha256_hash: '' },
    { host_id: 'UUID-1', hostname: 'mi5.localdomain', timestamp: '2026-09-17 08:00:00', tool_type: 'mcp_server', tool_name: 'salesforce-mcp-server', category: 'mcp-server', identifier: 'salesforce-mcp-server', origin: 'process', location: 'local', path: '', version: '', risk_indicators: '', target_endpoint: '', detail: '{"transport":"stdio","source_type":"process"}', sha256_hash: '' },
    { host_id: 'UUID-1', hostname: 'mi5.localdomain', timestamp: '2026-09-17 08:00:00', tool_type: 'agents', tool_name: 'claude-code', category: '', identifier: 'claude', origin: 'homebrew', location: 'local', path: '/opt/homebrew/bin/claude', version: '', risk_indicators: 'skip_permissions_runtime', target_endpoint: '', detail: '{"binary":"claude"}', sha256_hash: '' },
    // Shape B: event_id / executable_path / file_location / activity_details
    { host_id: 'UUID-2', hostname: 'miso', timestamp: '2026-09-17 08:00:00', tool_type: 'ide_plugins', tool_name: 'Windsurf', origin: 'windsurf', event_id: 'codeium.windsurf', executable_path: 'C:\\Program Files\\Windsurf', file_location: 'local', activity_details: '{"editor_family":"vscode","publisher":"codeium"}', risk_indicators: '', target_endpoint: '' },
  ])
  const [wedge, sock, sf, agent, win] = live
  assert.equal(wedge.host, 'mi5.localdomain', 'only a .local suffix is trimmed, matching displayHost')
  assert.equal(wedge.hostId, 'UUID-1')
  assert.equal(wedge.name, 'wedge')
  assert.equal(wedge.source, 'claude-code')
  assert.equal(wedge.loopback, true, 'target_endpoint is read as the endpoint')
  assert.deepEqual(wedge.flags, [])
  assert.deepEqual(wedge.waivedFlags, ['cleartext_endpoint'])
  assert.equal(wedge.location, 'loopback')
  assert.equal(wedge.port, 8787)
  assert.equal(sock.endpointHost, '160.79.104.10')
  assert.equal(sock.port, 443)
  assert.equal(sock.tool, 'Claude Code', 'versioned process name resolved from cmdline in the live dialect too')
  assert.equal(sf.running, true, 'a process-discovered MCP server is known to be running')
  assert.equal(wedge.running, false, 'a config-only MCP server was not seen as a process')
  assert.equal(agent.running, null, 'agents have no running signal in the stream')
  assert.equal(agent.severity, 'elevated')
  assert.equal(win.identifier, 'codeium.windsurf')
  assert.equal(win.path, 'C:\\Program Files\\Windsurf')
  assert.equal(win.location, 'local')
  assert.equal(win.detail.publisher, 'codeium')
  assert.equal(win.vendor, 'Windsurf')
})

test('endpoint forms: URL, host:port, bracketed IPv6', () => {
  assert.equal(hostOfEndpoint('http://localhost:3000/mcp'), 'localhost')
  assert.equal(hostOfEndpoint('160.79.104.10:443'), '160.79.104.10')
  assert.equal(hostOfEndpoint('[2607:6bc0::10]:443'), '2607:6bc0::10')
  assert.equal(hostOfEndpoint('https://mcp.notion.com/mcp'), 'mcp.notion.com')
  assert.equal(hostOfEndpoint(''), null)
  assert.equal(portOfEndpoint('160.79.104.10:443'), 443)
  assert.equal(portOfEndpoint('[2607:6bc0::10]:443'), 443)
  assert.equal(portOfEndpoint('http://127.0.0.1:3845/mcp'), 3845)
  assert.equal(portOfEndpoint('https://mcp.notion.com/mcp'), null)
})

test('governance tiers: known products, explorative tools, local and MCP', () => {
  const rows = normalizeRows([
    raw({ type: 'apps', name: 'claude-desktop', identifier: 'com.anthropic.claudefordesktop' }),
    raw({ type: 'ide_plugins', name: 'GitHub Copilot Chat', identifier: 'github.copilot-chat', detail: '{"publisher":"GitHub"}' }),
    raw({ host_display_name: 'Host B', type: 'ide_plugins', name: 'Kilo Code: AI Coding Agent', identifier: 'kilocode.kilo-code' }),
    raw({ host_display_name: 'Host B', type: 'agents', name: 'goose', identifier: 'goose' }),
    raw({ host_display_name: 'Host B', type: 'apps', name: 'ollama', identifier: 'com.electron.ollama', detail: '{"serves_local_api":"1"}' }),
    raw({ host_display_name: 'Host C', type: 'sockets', name: 'python3.13', identifier: 'unknown', source: 'listen', category: 'mcp-server-local', port: '8000', detail: '{"local_address":"127.0.0.1"}' }),
    raw({ host_display_name: 'Host C', type: 'mcp_server', name: 'fleet-qa', identifier: 'fleet-qa', source: 'cursor', detail: '{"transport":"stdio","source_type":"config"}' }),
    raw({ host_display_name: 'Host C', type: 'mcp_server', name: 'wedge', identifier: 'wedge', source: 'claude-code', location: 'remote', target_endpoint: 'http://127.0.0.1:8787/mcp', detail: '{"transport":"http"}' }),
    raw({ host_display_name: 'Host C', type: 'mcp_server', name: 'notion', identifier: 'notion', source: 'claude-code', location: 'remote', target_endpoint: 'https://mcp.notion.com/mcp', detail: '{"transport":"http"}' }),
    raw({ host_display_name: 'Host C', type: 'agent_instruction', name: 'CLAUDE.md', identifier: 'claude' }),
    raw({ host_display_name: 'Host C', type: 'sockets', name: '2.1.270', identifier: 'unknown', source: 'established', location: 'remote', target_endpoint: '160.79.104.10:443', detail: '{"cmdline":"claude"}' }),
  ])
  assert.equal(rows[0].tier, 'known')
  assert.equal(rows[1].tier, 'known')
  assert.equal(rows[2].tier, 'explorative')
  assert.equal(rows[3].tier, 'explorative')
  assert.equal(rows[4].tier, 'local', 'an app serving a local inference API is local')
  assert.equal(rows[5].tier, 'local', 'a local listener is local')
  assert.equal(rows[6].tier, 'mcp')
  assert.equal(rows[9].tier, null, 'instruction files are not products')
  assert.equal(rows[10].tier, 'known', 'a live connection from a known tool counts toward that tool')

  const g = governance(rows)
  assert.equal(g.known.tools, 3, 'Claude Desktop, Copilot Chat, Claude Code (from its live connection)')
  assert.equal(g.known.hosts, 2, 'Host A (desktop + copilot) and Host C (Claude Code connection)')
  assert.equal(g.explorative.tools, 2)
  assert.equal(g.explorative.hosts, 1)
  assert.equal(g.local.tools, 2)
  assert.equal(g.local.hosts, 2)
  assert.equal(g.mcp.servers, 3)
  assert.equal(g.mcp.localProcess, 1)
  assert.equal(g.mcp.loopback, 1)
  assert.equal(g.mcp.remote, 1)
  assert.deepEqual(g.known.list.map(t => t.key).sort(), ['Claude Code', 'Claude Desktop', 'GitHub Copilot Chat'])

  // Override the known list: Kilo Code becomes known, Copilot does not.
  const g2 = governance(rows, { knownVendors: ['Anthropic', 'Kilo Code'] })
  assert.equal(g2.known.tools, 3, 'Claude Desktop, Claude Code, Kilo Code')
  assert.equal(g2.explorative.list.some(t => t.key === 'GitHub Copilot Chat'), true)
})

test('vendor prefers the identifier and ignores the MCP client', () => {
  const v = (over) => vendorOf(normalizeRows([raw(over)])[0])
  assert.equal(v({ type: 'ide_plugins', name: 'Kilo Code: AI Coding Agent, Copilot, and Autocomplete', identifier: 'kilocode.kilo-code' }), 'Kilo Code')
  assert.equal(v({ type: 'ide_plugins', name: 'Cline', identifier: 'saoudrizwan.claude-dev' }), 'Cline')
  assert.equal(v({ type: 'mcp_server', name: 'playwright', identifier: 'playwright', source: 'claude-code' }), 'Other', 'client is not vendor')
  assert.equal(v({ type: 'mcp_server', name: 'github-mcp-server', identifier: 'github-mcp-server', source: 'claude-code' }), 'GitHub')
  assert.equal(v({ type: 'agent_instruction', name: 'CLAUDE.md', identifier: 'claude', source: 'claude' }), 'Anthropic')
  assert.equal(v({ type: 'sockets', name: '2.1.270', identifier: 'unknown', detail: '{"cmdline":"claude"}' }), 'Anthropic', '"unknown" identifier falls through to the cmdline')
})

test('preliminary risk rating: fleet from scanned-host shares, host from weighted findings', () => {
  assert.equal(hostRiskScore({}), 100)
  assert.equal(hostRiskScore({ critical: 1 }), 70, 'one plaintext secret is a C')
  assert.equal(hostRiskScore({ critical: 3, elevated: 2 }), 0, 'floored at zero')
  assert.equal(hostRiskScore({ fair: 2, elevated: 1 }), 84)

  const rows = normalizeRows(FIXTURE)          // Host A + Host B critical, Host C clean
  const s = summarize(rows)
  const r = fleetRiskRating(s, 10)             // 10 scanned, 2 critical hosts
  assert.equal(r.denominator, 10)
  assert.equal(r.score, 88, '100 - 60 * 0.2')
  assert.equal(r.grade, 'B')
  const noScan = fleetRiskRating(s)            // CSV: hosts with findings as denominator
  assert.equal(noScan.denominator, 3)
  assert.equal(noScan.score, 60)
  assert.equal(noScan.grade, 'C')
  assert.deepEqual(fleetRiskRating(summarize([]), 0), { score: null, grade: null, denominator: 0, shares: null })

  const hosts = hostRollup(rows)
  assert.equal(hosts[0].riskScore, 60, 'Host A: one critical extension (30) + one elevated MCP server (10)')
})

test('configFile is the last path segment and firstSeen passes through', () => {
  const [r] = normalizeRows([raw({ type: 'mcp_server', name: 'x', path: '/Users/someone/.claude.json', first_seen: '2026-09-16 14:02:49' })])
  assert.equal(r.configFile, '.claude.json')
  assert.equal(r.firstSeen, '2026-09-16 14:02:49')
  const [w] = normalizeRows([raw({ type: 'ide_plugins', name: 'y', executable_path: 'C:\\Program Files\\Windsurf' })])
  assert.equal(w.configFile, 'Windsurf')
})
