-- =============================================================================
-- Thermal health on the ALT (firehose) instance.
--
-- Source: pack query "DEX - Hardware experience - Thermal" (macOS, hourly).
-- One row per host per scan: fan RPM (actual / target / min / max for the
-- first fan, plus the max across fans), the hottest sensor, the heatsink and
-- battery temperatures, 1m/5m load for idle-vs-busy context, and the battery
-- wear fields, so thermal wear and battery wear can be correlated per host
-- without a second join.
--
-- Why: dust buildup does not show as one hot reading. It shows as drift — a
-- host needing more RPM at idle to hold the same temperature, and spending
-- more time at max fan. That needs a per-host baseline over weeks, which is
-- what this table accumulates.
--
-- Apple silicon (verified on Mac17,2 / M5, 2026-09-17): fan_speed_sensors
-- reports actual/min/max/target; temperature_sensors reports heatsink,
-- battery and power-supply sensors but NO CPU die sensor, so cpu_c is
-- usually empty there. Intel Macs report CPU sensors. Fanless models
-- (MacBook Air) report fan_count = 0 and are excluded from RPM baselines.
--
-- Conventions match setup-clickhouse-firehose.sh. The MV sees only rows
-- arriving after creation; when the pack ships there is nothing to backfill.
-- =============================================================================

CREATE TABLE IF NOT EXISTS default.thermal_health (
    host_id             String,
    hostname            String,
    timestamp           DateTime64(9),
    hardware_model      LowCardinality(String),
    cpu_brand           LowCardinality(String),
    fan_count           UInt8,
    fan0_rpm            UInt16,
    fan0_target_rpm     UInt16,
    fan0_min_rpm        UInt16,
    fan0_max_rpm        UInt16,
    fan_max_rpm_now     UInt16,
    temp_max_c          Float32,
    temp_max_sensor     LowCardinality(String),
    heatsink_c          Float32,          -- 0 when no heatsink sensor
    battery_temp_c      Float32,
    cpu_c               Float32,          -- 0 when no CPU die sensor (Apple silicon)
    sensor_count        UInt8,
    load_1m             Float32,
    load_5m             Float32,
    battery_cycles      UInt32,
    battery_health      LowCardinality(String),
    battery_health_pct  Float32,
    battery_charging    Int8,
    uptime_s            UInt64
) ENGINE = MergeTree ORDER BY (host_id, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS default.thermal_health_mv TO default.thermal_health AS
SELECT
    hostIdentifier AS host_id,
    decorations.hostname AS hostname,
    calendarTime AS timestamp,
    JSONExtractString(item, 'hardware_model') AS hardware_model,
    JSONExtractString(item, 'cpu_brand') AS cpu_brand,
    toUInt8OrZero(JSONExtractString(item, 'fan_count')) AS fan_count,
    toUInt16OrZero(JSONExtractString(item, 'fan0_rpm')) AS fan0_rpm,
    toUInt16OrZero(JSONExtractString(item, 'fan0_target_rpm')) AS fan0_target_rpm,
    toUInt16OrZero(JSONExtractString(item, 'fan0_min_rpm')) AS fan0_min_rpm,
    toUInt16OrZero(JSONExtractString(item, 'fan0_max_rpm')) AS fan0_max_rpm,
    toUInt16OrZero(JSONExtractString(item, 'fan_max_rpm_now')) AS fan_max_rpm_now,
    toFloat32OrZero(JSONExtractString(item, 'temp_max_c')) AS temp_max_c,
    JSONExtractString(item, 'temp_max_sensor') AS temp_max_sensor,
    toFloat32OrZero(JSONExtractString(item, 'heatsink_c')) AS heatsink_c,
    toFloat32OrZero(JSONExtractString(item, 'battery_temp_c')) AS battery_temp_c,
    toFloat32OrZero(JSONExtractString(item, 'cpu_c')) AS cpu_c,
    toUInt8OrZero(JSONExtractString(item, 'sensor_count')) AS sensor_count,
    toFloat32OrZero(JSONExtractString(item, 'load_1m')) AS load_1m,
    toFloat32OrZero(JSONExtractString(item, 'load_5m')) AS load_5m,
    toUInt32OrZero(JSONExtractString(item, 'battery_cycles')) AS battery_cycles,
    JSONExtractString(item, 'battery_health') AS battery_health,
    toFloat32OrZero(JSONExtractString(item, 'battery_health_pct')) AS battery_health_pct,
    toInt8OrZero(JSONExtractString(item, 'battery_charging')) AS battery_charging,
    toUInt64OrZero(JSONExtractString(item, 'uptime_s')) AS uptime_s
FROM `s3-625dcbb6-7804-4672-8d83-c621b10a4679`
ARRAY JOIN JSONExtractArrayRaw(snapshot) AS item
WHERE name ILIKE '%Hardware experience - Thermal%';
