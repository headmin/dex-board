-- ============================================================
-- Alt ClickHouse: Materialized Views for osquery result logs
-- Source: s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2
-- ============================================================
-- This file is NOT meant to be run as a single multi-statement file.
-- Use create-alt-views.sh which executes each statement individually.

-- ────────────────────────────────────────────────────────────
-- 1. WIFI SIGNAL QUALITY
-- ────────────────────────────────────────────────────────────

-- 1a. Destination table
CREATE TABLE IF NOT EXISTS wifi_signal
(
    host_id        String,
    hostname       String,
    timestamp      DateTime64(9),
    channel        UInt16,
    channel_band   UInt8,
    channel_width  UInt16,
    rssi           Int16,
    noise          Int16,
    snr            Int16,
    signal_quality LowCardinality(String),
    transmit_rate  Float64,
    security_type  LowCardinality(String),
    interface      LowCardinality(String)
)
ENGINE = MergeTree()
ORDER BY (host_id, timestamp);

-- 1b. Materialized view (auto-transforms new inserts)
CREATE MATERIALIZED VIEW IF NOT EXISTS wifi_signal_mv TO wifi_signal AS
SELECT
    hostIdentifier                                          AS host_id,
    decorations.hostname                                    AS hostname,
    calendarTime                                            AS timestamp,
    toUInt16OrZero(JSONExtractString(item, 'channel'))      AS channel,
    toUInt8OrZero(JSONExtractString(item, 'channel_band'))  AS channel_band,
    toUInt16OrZero(JSONExtractString(item, 'channel_width')) AS channel_width,
    toInt16OrZero(JSONExtractString(item, 'rssi'))          AS rssi,
    toInt16OrZero(JSONExtractString(item, 'noise'))         AS noise,
    toInt16OrZero(JSONExtractString(item, 'signal_to_noise_ratio')) AS snr,
    JSONExtractString(item, 'signal_quality')               AS signal_quality,
    toFloat64OrZero(JSONExtractString(item, 'transmit_rate')) AS transmit_rate,
    JSONExtractString(item, 'security_type')                AS security_type,
    JSONExtractString(item, 'interface')                    AS interface
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Wi-Fi signal quality%';

-- 1c. Backfill existing rows
INSERT INTO wifi_signal
SELECT
    hostIdentifier                                          AS host_id,
    decorations.hostname                                    AS hostname,
    calendarTime                                            AS timestamp,
    toUInt16OrZero(JSONExtractString(item, 'channel'))      AS channel,
    toUInt8OrZero(JSONExtractString(item, 'channel_band'))  AS channel_band,
    toUInt16OrZero(JSONExtractString(item, 'channel_width')) AS channel_width,
    toInt16OrZero(JSONExtractString(item, 'rssi'))          AS rssi,
    toInt16OrZero(JSONExtractString(item, 'noise'))         AS noise,
    toInt16OrZero(JSONExtractString(item, 'signal_to_noise_ratio')) AS snr,
    JSONExtractString(item, 'signal_quality')               AS signal_quality,
    toFloat64OrZero(JSONExtractString(item, 'transmit_rate')) AS transmit_rate,
    JSONExtractString(item, 'security_type')                AS security_type,
    JSONExtractString(item, 'interface')                    AS interface
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Wi-Fi signal quality%';


-- ────────────────────────────────────────────────────────────
-- 2. RUNNING APPS
-- ────────────────────────────────────────────────────────────

-- 2a. Destination table
CREATE TABLE IF NOT EXISTS running_apps
(
    host_id           String,
    hostname          String,
    timestamp         DateTime64(9),
    app_name          String,
    bundle_identifier String,
    memory_mb         Float64,
    threads           UInt32,
    pid               UInt32,
    is_active         Int8,
    path              String
)
ENGINE = MergeTree()
ORDER BY (host_id, timestamp, app_name);

-- 2b. Materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS running_apps_mv TO running_apps AS
SELECT
    hostIdentifier                                           AS host_id,
    decorations.hostname                                     AS hostname,
    calendarTime                                             AS timestamp,
    JSONExtractString(item, 'name')                          AS app_name,
    JSONExtractString(item, 'bundle_identifier')             AS bundle_identifier,
    toFloat64OrZero(JSONExtractString(item, 'memory_mb'))    AS memory_mb,
    toUInt32OrZero(JSONExtractString(item, 'threads'))       AS threads,
    toUInt32OrZero(JSONExtractString(item, 'pid'))           AS pid,
    toInt8OrZero(JSONExtractString(item, 'is_active'))       AS is_active,
    JSONExtractString(item, 'path')                          AS path
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%macOS Running Apps%' OR name ILIKE '%macOS running apps%';

-- 2c. Backfill
INSERT INTO running_apps
SELECT
    hostIdentifier                                           AS host_id,
    decorations.hostname                                     AS hostname,
    calendarTime                                             AS timestamp,
    JSONExtractString(item, 'name')                          AS app_name,
    JSONExtractString(item, 'bundle_identifier')             AS bundle_identifier,
    toFloat64OrZero(JSONExtractString(item, 'memory_mb'))    AS memory_mb,
    toUInt32OrZero(JSONExtractString(item, 'threads'))       AS threads,
    toUInt32OrZero(JSONExtractString(item, 'pid'))           AS pid,
    toInt8OrZero(JSONExtractString(item, 'is_active'))       AS is_active,
    JSONExtractString(item, 'path')                          AS path
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%macOS Running Apps%' OR name ILIKE '%macOS running apps%';


-- ────────────────────────────────────────────────────────────
-- 3. FLEETD INFO
-- ────────────────────────────────────────────────────────────

-- 3a. Destination table
CREATE TABLE IF NOT EXISTS fleetd_info
(
    host_id          String,
    hostname         String,
    timestamp        DateTime64(9),
    version          String,
    desktop_version  String,
    osquery_version  String,
    orbit_channel    LowCardinality(String),
    platform         LowCardinality(String),
    cpu_type         LowCardinality(String),
    uptime_seconds   UInt64,
    enrolled         Bool,
    last_error       String
)
ENGINE = MergeTree()
ORDER BY (host_id, timestamp);

-- 3b. Materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS fleetd_info_mv TO fleetd_info AS
SELECT
    hostIdentifier                                            AS host_id,
    decorations.hostname                                      AS hostname,
    calendarTime                                              AS timestamp,
    JSONExtractString(item, 'version')                        AS version,
    JSONExtractString(item, 'desktop_version')                AS desktop_version,
    JSONExtractString(item, 'osquery_version')                AS osquery_version,
    JSONExtractString(item, 'orbit_channel')                  AS orbit_channel,
    JSONExtractString(item, 'platform')                       AS platform,
    JSONExtractString(item, 'cpu_type')                       AS cpu_type,
    toUInt64OrZero(JSONExtractString(item, 'uptime'))         AS uptime_seconds,
    JSONExtractString(item, 'enrolled') = 'true'              AS enrolled,
    JSONExtractString(item, 'last_recorded_error')            AS last_error
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%fleetd information%';

-- 3c. Backfill
INSERT INTO fleetd_info
SELECT
    hostIdentifier                                            AS host_id,
    decorations.hostname                                      AS hostname,
    calendarTime                                              AS timestamp,
    JSONExtractString(item, 'version')                        AS version,
    JSONExtractString(item, 'desktop_version')                AS desktop_version,
    JSONExtractString(item, 'osquery_version')                AS osquery_version,
    JSONExtractString(item, 'orbit_channel')                  AS orbit_channel,
    JSONExtractString(item, 'platform')                       AS platform,
    JSONExtractString(item, 'cpu_type')                       AS cpu_type,
    toUInt64OrZero(JSONExtractString(item, 'uptime'))         AS uptime_seconds,
    JSONExtractString(item, 'enrolled') = 'true'              AS enrolled,
    JSONExtractString(item, 'last_recorded_error')            AS last_error
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%fleetd information%';


-- ────────────────────────────────────────────────────────────
-- 4. HARDWARE INVENTORY
-- ────────────────────────────────────────────────────────────

-- 4a. Destination table
CREATE TABLE IF NOT EXISTS hardware_inventory
(
    host_id            String,
    hostname           String,
    timestamp          DateTime64(9),
    computer_name      String,
    cpu_brand          LowCardinality(String),
    cpu_logical_cores  UInt8,
    cpu_physical_cores UInt8,
    cpu_type           LowCardinality(String),
    hardware_model     LowCardinality(String),
    hardware_serial    String,
    hardware_vendor    LowCardinality(String),
    memory_gb          Float64
)
ENGINE = MergeTree()
ORDER BY (host_id, timestamp);

-- 4b. Materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS hardware_inventory_mv TO hardware_inventory AS
SELECT
    hostIdentifier                                                AS host_id,
    decorations.hostname                                          AS hostname,
    calendarTime                                                  AS timestamp,
    JSONExtractString(item, 'computer_name')                      AS computer_name,
    JSONExtractString(item, 'cpu_brand')                          AS cpu_brand,
    toUInt8OrZero(JSONExtractString(item, 'cpu_logical_cores'))   AS cpu_logical_cores,
    toUInt8OrZero(JSONExtractString(item, 'cpu_physical_cores'))  AS cpu_physical_cores,
    JSONExtractString(item, 'cpu_type')                           AS cpu_type,
    JSONExtractString(item, 'hardware_model')                     AS hardware_model,
    JSONExtractString(item, 'hardware_serial')                    AS hardware_serial,
    JSONExtractString(item, 'hardware_vendor')                    AS hardware_vendor,
    toFloat64OrZero(JSONExtractString(item, 'memory_gb'))         AS memory_gb
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%System Information%' OR name ILIKE '%system information%';

-- 4c. Backfill
INSERT INTO hardware_inventory
SELECT
    hostIdentifier                                                AS host_id,
    decorations.hostname                                          AS hostname,
    calendarTime                                                  AS timestamp,
    JSONExtractString(item, 'computer_name')                      AS computer_name,
    JSONExtractString(item, 'cpu_brand')                          AS cpu_brand,
    toUInt8OrZero(JSONExtractString(item, 'cpu_logical_cores'))   AS cpu_logical_cores,
    toUInt8OrZero(JSONExtractString(item, 'cpu_physical_cores'))  AS cpu_physical_cores,
    JSONExtractString(item, 'cpu_type')                           AS cpu_type,
    JSONExtractString(item, 'hardware_model')                     AS hardware_model,
    JSONExtractString(item, 'hardware_serial')                    AS hardware_serial,
    JSONExtractString(item, 'hardware_vendor')                    AS hardware_vendor,
    toFloat64OrZero(JSONExtractString(item, 'memory_gb'))         AS memory_gb
FROM `s3-85c9c3ef-81e3-4c05-aead-a3dc9e6f90b2`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%System Information%' OR name ILIKE '%system information%';
