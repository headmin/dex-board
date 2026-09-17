/**
 * Unit tests for the AI trend roll-ups. Plain `node --test`, no Vue.
 * Fixture rows mirror firehose.ai.daily_tools / daily_surfaces / daily_totals.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolTrends, surfaceSeries, totalsSeries, labelDailyRow } from './aiTrends.js'

const row = (day, tool_type, tool_key, hosts, over = {}) => ({
  day, tool_type, tool_key, origin_key: '', hosts, findings: hosts, flagged: 0,
  sample_name: tool_key, sample_category: '', sample_identifier: '', sample_origin: '', sample_detail: '',
  sample_endpoint: '', sample_path: '', ...over,
})

const DAILY = [
  row('2026-09-16', 'apps', 'claude-desktop', 60, { sample_identifier: 'com.anthropic.claudefordesktop' }),
  row('2026-09-17', 'apps', 'claude-desktop', 62, { sample_identifier: 'com.anthropic.claudefordesktop' }),
  row('2026-09-16', 'agents', 'goose', 4),
  row('2026-09-17', 'agents', 'goose', 3),
  row('2026-09-17', 'ide_plugins', 'Agentforce Vibes', 1),          // appeared
  row('2026-09-16', 'browser_extension', 'ChatGPT search', 2),       // disappeared
  row('2026-09-16', 'sockets', 'claude-code', 9, { origin_key: 'established', sample_name: '2.1.268', sample_detail: '{"cmdline":"claude"}', sample_origin: 'established' }),
  row('2026-09-17', 'sockets', 'claude-code', 11, { origin_key: 'established', sample_name: '2.1.270', sample_detail: '{"cmdline":"claude"}', sample_origin: 'established' }),
  row('2026-09-16', 'agent_instruction', 'CLAUDE.md', 37, { sample_identifier: 'claude' }),
  row('2026-09-17', 'agent_instruction', 'CLAUDE.md', 38, { sample_identifier: 'claude' }),
]

test('labels daily rows with the same tool names and tiers as the overview', () => {
  const p = labelDailyRow(DAILY[6])
  assert.equal(p.tool, 'Claude Code', 'versioned socket name resolved from the sampled cmdline')
  assert.equal(p.vendor, 'Anthropic')
  assert.equal(p.tier, 'known')
  assert.equal(labelDailyRow(DAILY[2]).tier, 'explorative')
  assert.equal(labelDailyRow(DAILY[8]).tier, null, 'instruction files have no tier')
})

test('toolTrends compares first and latest day present, no smoothing', () => {
  const t = toolTrends(DAILY)
  assert.equal(t.historyDays, 2)
  assert.equal(t.firstDay, '2026-09-16')
  assert.equal(t.latestDay, '2026-09-17')
  const desk = t.tools.find(x => x.tool === 'Claude Desktop')
  assert.equal(desk.firstHosts, 60)
  assert.equal(desk.latestHosts, 62)
  assert.equal(desk.delta, 2)
  assert.deepEqual(desk.series.map(s => s.hosts), [60, 62])
  assert.deepEqual(t.gaining.map(x => x.tool), ['Claude Desktop', 'Claude Code', 'CLAUDE.md', 'Agentforce Vibes'], 'largest gain first, ties by latest hosts')
  assert.deepEqual(t.losing.map(x => x.tool), ['ChatGPT search', 'Goose'])
  assert.deepEqual(t.appeared.map(x => x.tool), ['Agentforce Vibes'])
  assert.deepEqual(t.disappeared.map(x => x.tool), ['ChatGPT search'])
  assert.equal(t.tools[0].tool, 'Claude Desktop', 'sorted by latest hosts')
})

test('toolTrends merges two groups that label to one tool by max, not sum', () => {
  const t = toolTrends([
    row('2026-09-17', 'agents', 'claude-code', 5, { sample_origin: 'homebrew' }),
    { ...row('2026-09-17', 'agents', 'claude-code', 3, { sample_origin: 'native' }), origin_key: 'x' },
  ])
  assert.equal(t.tools.length, 1)
  assert.equal(t.tools[0].latestHosts, 5)
})

test('toolTrends on empty input reports zero history rather than throwing', () => {
  const t = toolTrends([])
  assert.equal(t.historyDays, 0)
  assert.equal(t.firstDay, null)
  assert.deepEqual(t.tools, [])
})

test('surfaceSeries and totalsSeries coerce and order by day', () => {
  const s = surfaceSeries([
    { day: '2026-09-17', tool_type: 'mcp_server', hosts: '31', findings: '196' },
    { day: '2026-09-16', tool_type: 'mcp_server', hosts: '30', findings: '190' },
    { day: '2026-09-16', tool_type: 'apps', hosts: '64', findings: '88' },
  ])
  assert.equal(s[0].type, 'mcp_server', 'largest latest-day count first; apps has no 09-17 row so reads 0')
  const mcp = s.find(x => x.type === 'mcp_server')
  assert.deepEqual(mcp.series.map(p => p.hosts), [30, 31])
  assert.equal(mcp.delta, 1)
  const tot = totalsSeries([{ day: '2026-09-17', hosts_scanned: '76' }, { day: '2026-09-16', hosts_scanned: '75' }])
  assert.deepEqual(tot.map(x => x.hosts_scanned), [75, 76])
})
