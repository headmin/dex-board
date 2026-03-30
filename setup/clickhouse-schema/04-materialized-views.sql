-- =============================================================================
-- Materialized tables for DEX views
-- JSON extraction happens once at insert time, not on every query
-- This is critical for performance at scale (15K+ devices, 10M+ rows)
-- =============================================================================

-- ─── Device Health (pre-extracted columns) ──────────────
CREATE TABLE IF NOT EXISTS fleet_logs.dex_device_health_mat (
    event_time DateTime64(3),
    host_identifier String,
    query_name LowCardinality(String),
    hostname String,
    serial_number String,
    computer_name String,
    os_name LowCardinality(String),
    os_version String,
    cpu_brand String,
    cpu_cores String,
    memory_total_gb String,
    memory_used_gb String,
    memory_percent String,
    disk_total_gb String,
    disk_free_gb String,
    disk_percent String,
    uptime_days String,
    hardware_model String DEFAULT ''
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, event_time)
TTL toDateTime(event_time) + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS fleet_logs.dex_device_health_mv TO fleet_logs.dex_device_health_mat AS
SELECT
    event_time, host_identifier, query_name,
    JSONExtractString(snapshot_item, 'hostname') AS hostname,
    JSONExtractString(snapshot_item, 'hardware_serial') AS serial_number,
    JSONExtractString(snapshot_item, 'computer_name') AS computer_name,
    JSONExtractString(snapshot_item, 'os_name') AS os_name,
    JSONExtractString(snapshot_item, 'os_version') AS os_version,
    JSONExtractString(snapshot_item, 'cpu_brand') AS cpu_brand,
    JSONExtractString(snapshot_item, 'cpu_cores') AS cpu_cores,
    JSONExtractString(snapshot_item, 'memory_total_gb') AS memory_total_gb,
    JSONExtractString(snapshot_item, 'memory_used_gb') AS memory_used_gb,
    JSONExtractString(snapshot_item, 'memory_percent') AS memory_percent,
    JSONExtractString(snapshot_item, 'disk_total_gb') AS disk_total_gb,
    JSONExtractString(snapshot_item, 'disk_free_gb') AS disk_free_gb,
    JSONExtractString(snapshot_item, 'disk_percent') AS disk_percent,
    JSONExtractString(snapshot_item, 'uptime_days') AS uptime_days,
    JSONExtractString(snapshot_item, 'hardware_model') AS hardware_model
FROM fleet_logs.osquery_result_logs
ARRAY JOIN JSONExtractArrayRaw(data, 'snapshot') AS snapshot_item
WHERE query_name LIKE '%device_health%';

-- ─── Top Processes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_logs.dex_top_processes_mat (
    event_time DateTime64(3),
    host_identifier String,
    query_name LowCardinality(String),
    process_name String,
    process_path String,
    pid String,
    memory_mb String,
    memory_percent String,
    state LowCardinality(String),
    threads String,
    uid String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, event_time)
TTL toDateTime(event_time) + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS fleet_logs.dex_top_processes_mv TO fleet_logs.dex_top_processes_mat AS
SELECT
    event_time, host_identifier, query_name,
    JSONExtractString(snapshot_item, 'process_name') AS process_name,
    JSONExtractString(snapshot_item, 'process_path') AS process_path,
    JSONExtractString(snapshot_item, 'pid') AS pid,
    JSONExtractString(snapshot_item, 'memory_mb') AS memory_mb,
    JSONExtractString(snapshot_item, 'memory_percent') AS memory_percent,
    JSONExtractString(snapshot_item, 'state') AS state,
    JSONExtractString(snapshot_item, 'threads') AS threads,
    JSONExtractString(snapshot_item, 'uid') AS uid
FROM fleet_logs.osquery_result_logs
ARRAY JOIN JSONExtractArrayRaw(data, 'snapshot') AS snapshot_item
WHERE query_name LIKE '%top_processes%';

-- ─── Security Posture ───────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_logs.dex_security_posture_mat (
    event_time DateTime64(3),
    host_identifier String,
    query_name LowCardinality(String),
    os_version String,
    os_build String,
    os_platform LowCardinality(String),
    disk_encrypted String,
    encryption_type String,
    secure_boot_enabled String,
    firewall_enabled String,
    sip_enabled String,
    gatekeeper_enabled String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (host_identifier, event_time)
TTL toDateTime(event_time) + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS fleet_logs.dex_security_posture_mv TO fleet_logs.dex_security_posture_mat AS
SELECT
    event_time, host_identifier, query_name,
    JSONExtractString(snapshot_item, 'os_version') AS os_version,
    JSONExtractString(snapshot_item, 'os_build') AS os_build,
    JSONExtractString(snapshot_item, 'os_platform') AS os_platform,
    JSONExtractString(snapshot_item, 'disk_encrypted') AS disk_encrypted,
    JSONExtractString(snapshot_item, 'encryption_type') AS encryption_type,
    JSONExtractString(snapshot_item, 'secure_boot_enabled') AS secure_boot_enabled,
    JSONExtractString(snapshot_item, 'firewall_enabled') AS firewall_enabled,
    JSONExtractString(snapshot_item, 'sip_enabled') AS sip_enabled,
    JSONExtractString(snapshot_item, 'gatekeeper_enabled') AS gatekeeper_enabled
FROM fleet_logs.osquery_result_logs
ARRAY JOIN JSONExtractArrayRaw(data, 'snapshot') AS snapshot_item
WHERE query_name LIKE '%security_posture%';

-- ─── Devices (ReplacingMergeTree — one row per device) ──
CREATE TABLE IF NOT EXISTS fleet_logs.dex_devices_mat (
    host_identifier String,
    hostname String,
    serial_number String,
    computer_name String,
    os_name LowCardinality(String),
    os_version String,
    hardware_model String,
    last_seen DateTime64(3)
) ENGINE = ReplacingMergeTree(last_seen)
ORDER BY (host_identifier);

CREATE MATERIALIZED VIEW IF NOT EXISTS fleet_logs.dex_devices_mv TO fleet_logs.dex_devices_mat AS
SELECT
    host_identifier,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'hostname') AS hostname,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'hardware_serial') AS serial_number,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'computer_name') AS computer_name,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'os_name') AS os_name,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'os_version') AS os_version,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'hardware_model') AS hardware_model,
    event_time AS last_seen
FROM fleet_logs.osquery_result_logs
WHERE query_name LIKE '%device_health%';

-- ─── Replace old views to read from materialized tables ─
DROP VIEW IF EXISTS fleet_logs.dex_device_health;
CREATE VIEW fleet_logs.dex_device_health AS SELECT * FROM fleet_logs.dex_device_health_mat;

DROP VIEW IF EXISTS fleet_logs.dex_top_processes;
CREATE VIEW fleet_logs.dex_top_processes AS SELECT * FROM fleet_logs.dex_top_processes_mat;

DROP VIEW IF EXISTS fleet_logs.dex_security_posture;
CREATE VIEW fleet_logs.dex_security_posture AS SELECT * FROM fleet_logs.dex_security_posture_mat;

DROP VIEW IF EXISTS fleet_logs.dex_devices;
CREATE VIEW fleet_logs.dex_devices AS SELECT * FROM fleet_logs.dex_devices_mat FINAL;

SELECT 'Materialized views created successfully' as message;
