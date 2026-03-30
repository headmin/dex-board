-- =============================================================================
-- Software Detail Tables: Patch Velocity + App Usage
-- Supports two key exec metrics:
--   1. Patch velocity: how fast are devices patched after updates are available?
--   2. Software usage: which apps are actively used vs. installed shelfware?
-- =============================================================================

-- ─── App Usage: per-device, per-app usage tracking ────────────────────────────
-- Source: osquery `apps` table with last_opened_time
CREATE TABLE IF NOT EXISTS fleet_logs.dex_app_usage (
    event_time DateTime64(3),
    host_identifier String,
    app_name String,
    app_version String,
    app_bundle_id String,
    last_opened_time DateTime DEFAULT '1970-01-01 00:00:00',
    days_since_opened UInt32,
    usage_category LowCardinality(String)  -- 'daily', 'weekly', 'monthly', 'stale', 'never'
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, app_name, event_time)
TTL toDateTime(event_time) + INTERVAL 90 DAY;

-- ─── Patch Events: tracks version transitions per device ──────────────────────
-- Each row = one device updating from old_version to new_version
CREATE TABLE IF NOT EXISTS fleet_logs.dex_patch_events (
    event_time DateTime64(3),
    host_identifier String,
    hostname String,
    patch_type LowCardinality(String),   -- 'os' or 'app'
    software_name String,
    old_version String,
    new_version String,
    patch_available_date DateTime,        -- when first device in fleet got this version
    patch_applied_date DateTime,          -- when this device got it
    days_to_patch Float32                 -- gap in days
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, event_time)
TTL toDateTime(event_time) + INTERVAL 180 DAY;

-- ─── Fleet Patch Summary: daily fleet-wide patch velocity stats ───────────────
CREATE TABLE IF NOT EXISTS fleet_logs.dex_patch_summary_daily (
    day Date,
    software_name String,
    latest_version String,
    devices_on_latest UInt32,
    devices_total UInt32,
    pct_current Float32,                  -- % of fleet on latest
    avg_days_to_patch Float32,
    median_days_to_patch Float32,
    p90_days_to_patch Float32
) ENGINE = ReplacingMergeTree(day)
ORDER BY (software_name, day)
TTL day + INTERVAL 365 DAY;

SELECT 'Software detail tables created successfully' as message;
