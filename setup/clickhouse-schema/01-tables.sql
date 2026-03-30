-- =============================================================================
-- Fleet ClickHouse DEX Analytics - Base Tables
-- =============================================================================

-- Database
CREATE DATABASE IF NOT EXISTS fleet_logs;

-- =============================================================================
-- RAW DATA TABLES (populated by Fleet's ClickHouse logger)
-- =============================================================================

-- Osquery status logs (agent health, errors, warnings)
CREATE TABLE IF NOT EXISTS fleet_logs.osquery_status_logs (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime64(3),
    ingest_time DateTime64(3) DEFAULT now64(3),
    log_type LowCardinality(String),
    host_identifier String DEFAULT '',
    team_id UInt32 DEFAULT 0,
    data String,
    query_name LowCardinality(String) DEFAULT '',
    action LowCardinality(String) DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, event_time)
TTL toDateTime(event_time) + INTERVAL 90 DAY;

-- Osquery scheduled query results (main DEX data source)
CREATE TABLE IF NOT EXISTS fleet_logs.osquery_result_logs (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime64(3),
    ingest_time DateTime64(3) DEFAULT now64(3),
    log_type LowCardinality(String),
    host_identifier String DEFAULT '',
    team_id UInt32 DEFAULT 0,
    data String,
    query_name LowCardinality(String) DEFAULT '',
    action LowCardinality(String) DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, event_time)
TTL toDateTime(event_time) + INTERVAL 90 DAY;

-- Fleet audit logs (user activities)
CREATE TABLE IF NOT EXISTS fleet_logs.fleet_audit_logs (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime64(3),
    ingest_time DateTime64(3) DEFAULT now64(3),
    log_type LowCardinality(String),
    host_identifier String DEFAULT '',
    team_id UInt32 DEFAULT 0,
    data String,
    query_name LowCardinality(String) DEFAULT '',
    action LowCardinality(String) DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (event_time)
TTL toDateTime(event_time) + INTERVAL 365 DAY;

-- General fleet logs
CREATE TABLE IF NOT EXISTS fleet_logs.fleet_logs (
    event_id UUID DEFAULT generateUUIDv4(),
    event_time DateTime64(3),
    ingest_time DateTime64(3) DEFAULT now64(3),
    log_type LowCardinality(String),
    host_identifier String DEFAULT '',
    team_id UInt32 DEFAULT 0,
    data String,
    query_name LowCardinality(String) DEFAULT '',
    action LowCardinality(String) DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (event_time)
TTL toDateTime(event_time) + INTERVAL 90 DAY;

SELECT 'Base tables created successfully' as message;
