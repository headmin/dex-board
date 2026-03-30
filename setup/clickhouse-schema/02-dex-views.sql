-- =============================================================================
-- DEX Dashboard Views
-- These views extract and flatten data from osquery_result_logs JSON
-- for use by the Vue dashboard and Superset
--
-- NOTE: Views use the native query_name column (populated by Fleet's
-- ClickHouse logger) instead of JSONExtractString(data, 'name') for
-- better query performance. The query_name column is extracted at
-- write-time, eliminating repeated JSON parsing.
-- =============================================================================

-- Devices View: Unique devices with hostname and serial number
CREATE OR REPLACE VIEW fleet_logs.dex_devices AS
SELECT DISTINCT
    host_identifier,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'hostname') AS hostname,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'hardware_serial') AS serial_number,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'computer_name') AS computer_name,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'os_name') AS os_name,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'os_version') AS os_version,
    JSONExtractString(arrayElement(JSONExtractArrayRaw(data, 'snapshot'), 1), 'hardware_model') AS hardware_model,
    max(event_time) AS last_seen
FROM fleet_logs.osquery_result_logs
WHERE query_name LIKE '%device_health%'
GROUP BY host_identifier, hostname, serial_number, computer_name, os_name, os_version, hardware_model;

-- Device Health View: Memory, disk, uptime metrics
CREATE OR REPLACE VIEW fleet_logs.dex_device_health AS
SELECT
    event_time,
    host_identifier,
    query_name,
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
    JSONExtractString(snapshot_item, 'uptime_days') AS uptime_days
FROM fleet_logs.osquery_result_logs
ARRAY JOIN JSONExtractArrayRaw(data, 'snapshot') AS snapshot_item
WHERE query_name LIKE '%device_health%';

-- Top Processes View: Process memory usage
CREATE OR REPLACE VIEW fleet_logs.dex_top_processes AS
SELECT
    event_time,
    host_identifier,
    query_name,
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

-- Security Posture View: Encryption, firewall, secure boot
CREATE OR REPLACE VIEW fleet_logs.dex_security_posture AS
SELECT
    event_time,
    host_identifier,
    query_name,
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

-- Network Quality View (for macOS WiFi data)
CREATE OR REPLACE VIEW fleet_logs.dex_network_quality AS
SELECT
    event_time,
    host_identifier,
    query_name,
    JSONExtractString(snapshot_item, 'wifi_ssid') AS wifi_ssid,
    JSONExtractString(snapshot_item, 'wifi_rssi') AS wifi_rssi,
    JSONExtractString(snapshot_item, 'wifi_noise') AS wifi_noise,
    JSONExtractString(snapshot_item, 'wifi_channel') AS wifi_channel,
    JSONExtractString(snapshot_item, 'wifi_transmit_rate') AS wifi_transmit_rate,
    JSONExtractString(snapshot_item, 'signal_quality') AS signal_quality
FROM fleet_logs.osquery_result_logs
ARRAY JOIN JSONExtractArrayRaw(data, 'snapshot') AS snapshot_item
WHERE query_name LIKE '%network_quality%';

-- App Inventory View
CREATE OR REPLACE VIEW fleet_logs.dex_app_inventory AS
SELECT
    event_time,
    host_identifier,
    query_name,
    JSONExtractString(snapshot_item, 'app_name') AS app_name,
    JSONExtractString(snapshot_item, 'app_version') AS app_version,
    JSONExtractString(snapshot_item, 'app_bundle_id') AS app_bundle_id,
    JSONExtractString(snapshot_item, 'app_path') AS app_path,
    JSONExtractString(snapshot_item, 'platform') AS platform
FROM fleet_logs.osquery_result_logs
ARRAY JOIN JSONExtractArrayRaw(data, 'snapshot') AS snapshot_item
WHERE query_name LIKE '%app_inventory%';

-- Browser Extensions View
CREATE OR REPLACE VIEW fleet_logs.dex_browser_extensions AS
SELECT
    event_time,
    host_identifier,
    query_name,
    JSONExtractString(snapshot_item, 'name') AS extension_name,
    JSONExtractString(snapshot_item, 'version') AS version,
    JSONExtractString(snapshot_item, 'identifier') AS identifier,
    JSONExtractString(snapshot_item, 'description') AS description,
    JSONExtractString(snapshot_item, 'browser') AS browser
FROM fleet_logs.osquery_result_logs
ARRAY JOIN JSONExtractArrayRaw(data, 'snapshot') AS snapshot_item
WHERE query_name LIKE '%browser_extensions%';

SELECT 'DEX views created successfully' as message;
