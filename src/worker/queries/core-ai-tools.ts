/**
 * Firehose AI tool inventory queries.
 *
 * Source: alt ClickHouse → ai_tools + ai_tools_scans
 *         (setup/clickhouse-schema/13-ai-tools.sql, materialized from the
 *         "DEX - AI Tools - Surfaces AI tools on the host" pack query)
 *
 * Hosts scan roughly hourly, so "current state" is the LATEST scan per host,
 * never a sum over the window — the same finding would otherwise be counted
 * once per hour. A host whose latest scan is empty still counts as scanned;
 * that is the denominator behind "N of M hosts have AI tooling".
 *
 * Fleet filter: FILTERED_HOSTS_CTE is rooted in hardware_inventory, which
 * 3 of the 76 AI-reporting hosts have never reached. Applying the CTE
 * unconditionally would drop them from an unfiltered page, so the CTE is
 * consulted only when at least one filter is set. Host search additionally
 * matches the AI table's own hostname, so a host missing from
 * hardware_inventory can still be found by name.
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

/** True when the fleet filter bar has nothing set. */
const NO_FILTER = `(
  {filterSearch:String} = '' AND {filterModel:String} = '' AND {filterRamTier:String} = ''
  AND {filterOs:String} = '' AND {filterTeam:String} = '' AND {filterHostId:String} = ''
)`

/** Host scope shared by both queries: unfiltered → every scanned host. */
const HOST_SCOPE = `(
  ${NO_FILTER}
  OR host_id IN (SELECT host_id FROM filtered_hosts)
  OR ({filterHostId:String} != '' AND host_id = {filterHostId:String})
  OR ({filterSearch:String} != '' AND {filterModel:String} = '' AND {filterRamTier:String} = ''
      AND {filterOs:String} = '' AND {filterTeam:String} = '' AND {filterHostId:String} = ''
      AND hostname ILIKE concat('%', {filterSearch:String}, '%'))
)`

/** Latest scan per host within the freshness window. */
const LATEST_SCANS = `
latest_scans AS (
  -- Alias must not be 'hostname': ClickHouse resolves aliases inside WHERE,
  -- and HOST_SCOPE matches the raw hostname column there.
  SELECT host_id, argMax(hostname, timestamp) AS scan_hostname, max(timestamp) AS scanned_at,
         argMax(finding_count, timestamp) AS finding_count
  FROM ai_tools_scans
  WHERE timestamp > now() - INTERVAL {windowDays:UInt16} DAY
    AND ${HOST_SCOPE}
  GROUP BY host_id
)`

const WINDOW_PARAM = { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 90, default: 7 }

/**
 * Daily state, for trends. For each day in the window and each host, the
 * host's latest scan up to the end of that day (and no older than 3 days, so
 * a host that stopped scanning drops out rather than being carried forever).
 * Today is therefore complete even while today's scans are still arriving.
 */
const DAILY_STATE = `
days AS (
  SELECT arrayJoin(arrayMap(i -> toDate(now()) - i, range({windowDays:UInt16}))) AS day
),
daily_state AS (
  SELECT d.day AS day, s.host_id AS host_id, max(s.timestamp) AS scanned_at,
         argMax(s.finding_count, s.timestamp) AS finding_count
  FROM ai_tools_scans s
  CROSS JOIN days d
  WHERE s.timestamp < toDateTime(d.day + 1) AND s.timestamp >= toDateTime(d.day - 2)
    AND s.timestamp > now() - INTERVAL ({windowDays:UInt16} + 3) DAY
    AND (
      ${NO_FILTER}
      OR s.host_id IN (SELECT host_id FROM filtered_hosts)
      OR ({filterHostId:String} != '' AND s.host_id = {filterHostId:String})
      OR ({filterSearch:String} != '' AND {filterModel:String} = '' AND {filterRamTier:String} = ''
          AND {filterOs:String} = '' AND {filterTeam:String} = '' AND {filterHostId:String} = ''
          AND s.hostname ILIKE concat('%', {filterSearch:String}, '%'))
    )
  GROUP BY day, host_id
)`

/**
 * Tool identity in SQL, mirroring aiInventory.toolLabel/mcpKey closely enough
 * that one tool is one group: Claude Code's versioned socket process name is
 * folded, MCP version suffixes are stripped. The client applies the real
 * labeller to any(detail)/any(identifier) for display.
 */
const TOOL_KEY = `
  multiIf(
    tool_type = 'sockets' AND match(tool_name, '^[0-9]+(\\.[0-9]+)+$')
      AND (startsWith(JSONExtractString(detail, 'cmdline'), 'claude') OR path LIKE '%/claude/%'), 'claude-code',
    tool_type = 'mcp_server', replaceRegexpOne(replaceRegexpOne(tool_name, '@latest$', ''), '==.*$', ''),
    tool_name
  )`

const TREND_WINDOW_PARAM = { name: 'windowDays', type: 'number' as const, required: false, min: 2, max: 60, default: 30 }

export const firehoseAiToolsQueries: QueryConfig[] = [
  {
    name: 'firehose.ai.daily_tools',
    domain: 'ai',
    client: 'core',
    description: 'Hosts per AI tool per day (state as of end of day), for adoption trends',
    params: [...FILTER_PARAMS, TREND_WINDOW_PARAM],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, ${DAILY_STATE}
      SELECT
        st.day AS day,
        t.tool_type AS tool_type,
        ${TOOL_KEY} AS tool_key,
        if(t.tool_type = 'sockets', t.origin, '') AS origin_key,
        uniqExact(t.host_id) AS hosts,
        count() AS findings,
        countIf(t.risk_indicators != '') AS flagged,
        -- Sampled columns for client-side labelling. Named sample_* so they
        -- cannot shadow the raw columns TOOL_KEY groups on.
        any(t.tool_name) AS sample_name,
        any(t.category) AS sample_category,
        any(t.identifier) AS sample_identifier,
        any(t.origin) AS sample_origin,
        any(t.detail) AS sample_detail,
        any(t.target_endpoint) AS sample_endpoint,
        any(t.path) AS sample_path
      FROM ai_tools t
      INNER JOIN daily_state st ON t.host_id = st.host_id AND t.timestamp = st.scanned_at
      GROUP BY day, tool_type, tool_key, origin_key
      ORDER BY day, hosts DESC
    `,
  },
  {
    name: 'firehose.ai.daily_surfaces',
    domain: 'ai',
    client: 'core',
    description: 'Distinct hosts per discovery surface (tool_type) per day, state as of end of day',
    params: [...FILTER_PARAMS, TREND_WINDOW_PARAM],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, ${DAILY_STATE}
      SELECT st.day AS day, t.tool_type AS tool_type, uniqExact(t.host_id) AS hosts, count() AS findings
      FROM ai_tools t
      INNER JOIN daily_state st ON t.host_id = st.host_id AND t.timestamp = st.scanned_at
      GROUP BY day, tool_type
      ORDER BY day, hosts DESC
    `,
  },
  {
    name: 'firehose.ai.daily_totals',
    domain: 'ai',
    client: 'core',
    description: 'Per day: hosts scanned, hosts with AI tooling, findings, flagged findings, distinct MCP servers (state as of end of day)',
    params: [...FILTER_PARAMS, TREND_WINDOW_PARAM],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, ${DAILY_STATE}
      SELECT
        st.day AS day,
        uniqExact(st.host_id) AS hosts_scanned,
        uniqExactIf(st.host_id, st.finding_count > 0) AS hosts_with_findings,
        countIf(t.tool_type != '') AS findings,
        countIf(t.risk_indicators != '') AS flagged,
        uniqExactIf(t.host_id, t.risk_indicators != '') AS flagged_hosts,
        uniqExactIf(${TOOL_KEY.replace(/\btool_type\b/g, 't.tool_type').replace(/\btool_name\b/g, 't.tool_name').replace(/\bdetail\b/g, 't.detail').replace(/\bpath\b/g, 't.path')}, t.tool_type = 'mcp_server') AS mcp_servers
      FROM daily_state st
      LEFT JOIN ai_tools t ON t.host_id = st.host_id AND t.timestamp = st.scanned_at
      GROUP BY day
      ORDER BY day
    `,
  },
  {
    name: 'firehose.ai.inventory',
    domain: 'ai',
    client: 'core',
    description: 'AI tool findings from the latest scan of every host scanned in the window (one row per finding)',
    params: [...FILTER_PARAMS, WINDOW_PARAM],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, ${LATEST_SCANS}
      SELECT
        t.host_id AS host_id,
        t.hostname AS hostname,
        t.timestamp AS timestamp,
        t.tool_type AS tool_type,
        t.tool_name AS tool_name,
        t.category AS category,
        t.identifier AS identifier,
        t.origin AS origin,
        t.location AS location,
        t.path AS path,
        t.version AS version,
        t.risk_indicators AS risk_indicators,
        t.target_endpoint AS target_endpoint,
        t.detail AS detail,
        t.sha256_hash AS sha256_hash
      FROM ai_tools t
      INNER JOIN latest_scans s ON t.host_id = s.host_id AND t.timestamp = s.scanned_at
      ORDER BY t.host_id, t.tool_type, t.tool_name
    `,
  },
  {
    name: 'firehose.ai.coverage',
    domain: 'ai',
    client: 'core',
    description: 'How many hosts the AI discovery query scanned in the window, how many had findings, and when',
    params: [...FILTER_PARAMS, WINDOW_PARAM],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, ${LATEST_SCANS}
      SELECT
        count() AS hosts_scanned,
        countIf(finding_count > 0) AS hosts_with_findings,
        min(scanned_at) AS oldest_scan,
        max(scanned_at) AS latest_scan,
        (SELECT min(timestamp) FROM ai_tools_scans) AS first_scan_ever,
        (SELECT count() FROM ai_tools_scans WHERE timestamp > now() - INTERVAL {windowDays:UInt16} DAY) AS scans_in_window
      FROM latest_scans
    `,
  },
]
