-- =============================================================================
-- AI tool inventory on the ALT (firehose) instance.
--
-- Source: the Fleet pack query "DEX - AI Tools - Surfaces AI tools on the
-- host". Each snapshot is one scan of one host: an array of findings, one per
-- AI surface discovered (CLI agents, desktop apps, browser extensions, IDE
-- plugins, MCP servers, agent-instruction files, AI network connections).
-- Hosts report roughly hourly, and a host with nothing to report sends an
-- EMPTY array — which is the denominator the page needs ("N of M hosts
-- scanned"), so scans are recorded separately from findings.
--
-- Two row shapes coexist in the raw stream (two versions of the query, both
-- live on the same hosts as of 2026-09-17):
--   shape A: identifier, path, location, detail, sha256_hash
--   shape B: event_id, executable_path, file_location, activity_details, file_hash
-- Both carry tool_name, tool_type, origin, risk_indicators, target_endpoint.
-- The MV folds B into A's names so consumers see one contract.
--
-- Conventions (match setup-clickhouse-firehose.sh):
--   host_id = hostIdentifier, hostname = decorations.hostname,
--   timestamp = calendarTime, rows exploded via
--   ARRAY JOIN JSONExtractArrayRaw(snapshot).
-- MVs only see rows arriving after creation, so applying this file must be
-- followed by a one-time backfill per table over the raw history:
--   INSERT INTO ai_tools        <the ai_tools_mv SELECT>
--   INSERT INTO ai_tools_scans  <the ai_tools_scans_mv SELECT>
-- Both tables are plain MergeTree, so only backfill an empty table.
-- =============================================================================

-- ── 1. Findings: one row per discovered AI surface per scan ─────────────────
CREATE TABLE IF NOT EXISTS default.ai_tools (
    host_id          String,
    hostname         String,
    timestamp        DateTime64(9),
    tool_type        LowCardinality(String),   -- agents | apps | browser_extension | ide_plugins | mcp_server | agent_instruction | sockets
    tool_name        String,
    category         LowCardinality(String),   -- ai-tool | mcp-server | agent-instruction | ai-api-egress | …
    identifier       String,                   -- bundle id / extension id / server key / agent id
    origin           LowCardinality(String),   -- where it was found: chrome, vscode, claude-code, process, homebrew, established, listen …
    location         LowCardinality(String),   -- local | remote ('' in shape-B rows)
    path             String,
    version          String,
    risk_indicators  String,                   -- comma list emitted by the query
    target_endpoint  String,                   -- URL for http/sse MCP servers, ip:port for sockets
    detail           String,                   -- per-type JSON (transport, scope, cmdline, host_perms, …)
    sha256_hash      String
) ENGINE = MergeTree ORDER BY (host_id, timestamp, tool_type);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.ai_tools_mv TO default.ai_tools AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'tool_type') AS tool_type,
    JSONExtractString(item, 'tool_name') AS tool_name,
    JSONExtractString(item, 'category') AS category,
    if(JSONHas(item, 'identifier'), JSONExtractString(item, 'identifier'), JSONExtractString(item, 'event_id')) AS identifier,
    JSONExtractString(item, 'origin') AS origin,
    if(JSONHas(item, 'location'), JSONExtractString(item, 'location'), JSONExtractString(item, 'file_location')) AS location,
    if(JSONHas(item, 'path'), JSONExtractString(item, 'path'), JSONExtractString(item, 'executable_path')) AS path,
    JSONExtractString(item, 'version') AS version,
    JSONExtractString(item, 'risk_indicators') AS risk_indicators,
    JSONExtractString(item, 'target_endpoint') AS target_endpoint,
    if(JSONHas(item, 'detail'), JSONExtractString(item, 'detail'), JSONExtractString(item, 'activity_details')) AS detail,
    if(JSONHas(item, 'sha256_hash'), JSONExtractString(item, 'sha256_hash'), JSONExtractString(item, 'file_hash')) AS sha256_hash
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%DEX - AI Tools%';

-- ── 2. Scans: one row per host per snapshot, including empty ones ───────────
CREATE TABLE IF NOT EXISTS default.ai_tools_scans (
    host_id        String,
    hostname       String,
    timestamp      DateTime64(9),
    finding_count  UInt32
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.ai_tools_scans_mv TO default.ai_tools_scans AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    toUInt32(JSONLength(snapshot)) AS finding_count
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
WHERE name ILIKE '%DEX - AI Tools%';
