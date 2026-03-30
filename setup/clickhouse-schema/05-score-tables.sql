-- =============================================================================
-- DEX Experience Score Tables
-- Pre-computed device scores: 5 categories + composite grade
-- Scores computed from existing materialized tables (device_health, security,
-- network, processes, app_inventory, browser_extensions)
-- =============================================================================

-- ─── Per-device hourly scores ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_logs.dex_device_scores_hourly (
    hour DateTime,
    host_identifier String,
    hostname String,
    team_id UInt32 DEFAULT 0,
    os_name LowCardinality(String),
    hardware_model String,
    ram_tier LowCardinality(String),
    device_health_score Float32,
    performance_score Float32,
    network_score Float32,
    security_score Float32,
    software_score Float32,
    composite_score Float32,
    composite_grade LowCardinality(String),
    lowest_category LowCardinality(String),
    categories_with_data UInt8
) ENGINE = ReplacingMergeTree(hour)
PARTITION BY toYYYYMM(hour)
ORDER BY (host_identifier, hour)
TTL hour + INTERVAL 180 DAY;

-- ─── Per-team daily scores ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_logs.dex_team_scores_daily (
    day Date,
    team_id UInt32,
    device_count UInt32,
    avg_composite_score Float32,
    composite_grade LowCardinality(String),
    avg_device_health Float32,
    avg_performance Float32,
    avg_network Float32,
    avg_security Float32,
    avg_software Float32,
    grade_distribution String,
    prev_week_score Float32,
    prev_week_grade LowCardinality(String)
) ENGINE = ReplacingMergeTree(day)
ORDER BY (team_id, day)
TTL day + INTERVAL 730 DAY;

-- ─── Fleet-wide daily scores ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_logs.dex_fleet_scores_daily (
    day Date,
    device_count UInt32,
    avg_composite_score Float32,
    composite_grade LowCardinality(String),
    avg_device_health Float32,
    avg_performance Float32,
    avg_network Float32,
    avg_security Float32,
    avg_software Float32,
    grade_distribution String,
    prev_week_score Float32,
    prev_week_grade LowCardinality(String)
) ENGINE = ReplacingMergeTree(day)
ORDER BY (day)
TTL day + INTERVAL 730 DAY;

SELECT 'DEX score tables created successfully' as message;
