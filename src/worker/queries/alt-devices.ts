/**
 * Firehose device queries — combined view across all firehose tables.
 *
 * Source: alt ClickHouse → wifi_signal, running_apps, hardware_inventory, fleetd_info
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './alt-filters'

export const firehoseDeviceQueries: QueryConfig[] = [
  {
    name: 'firehose.devices.list',
    domain: 'devices',
    client: 'alt',
    description: 'Combined device list with latest data from all firehose tables',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      SELECT
        h.host_id AS host_id,
        h.hostname,
        h.computer_name,
        h.cpu_brand,
        h.cpu_logical_cores,
        h.hardware_model,
        h.hardware_serial,
        h.memory_gb,
        h.last_seen AS hw_last_seen,
        w.rssi,
        w.snr,
        w.signal_quality,
        w.transmit_rate,
        w.wifi_last_seen,
        a.app_count,
        a.total_memory_mb,
        f.version AS fleetd_version,
        f.osquery_version,
        f.uptime_seconds,
        f.platform
      FROM (
        SELECT host_id,
          argMax(hostname, timestamp) AS hostname,
          argMax(computer_name, timestamp) AS computer_name,
          argMax(cpu_brand, timestamp) AS cpu_brand,
          argMax(cpu_logical_cores, timestamp) AS cpu_logical_cores,
          argMax(hardware_model, timestamp) AS hardware_model,
          argMax(hardware_serial, timestamp) AS hardware_serial,
          argMax(memory_gb, timestamp) AS memory_gb,
          max(timestamp) AS last_seen
        FROM hardware_inventory
        GROUP BY host_id
      ) h
      LEFT JOIN (
        SELECT host_id,
          argMax(rssi, timestamp) AS rssi,
          argMax(snr, timestamp) AS snr,
          argMax(signal_quality, timestamp) AS signal_quality,
          argMax(transmit_rate, timestamp) AS transmit_rate,
          max(timestamp) AS wifi_last_seen
        FROM wifi_signal
        GROUP BY host_id
      ) w ON h.host_id = w.host_id
      LEFT JOIN (
        SELECT host_id,
          count() AS app_count,
          round(sum(memory_mb), 0) AS total_memory_mb
        FROM running_apps
        WHERE (host_id, timestamp) IN (
          SELECT host_id, max(timestamp) FROM running_apps GROUP BY host_id
        )
        GROUP BY host_id
      ) a ON h.host_id = a.host_id
      LEFT JOIN (
        SELECT host_id,
          argMax(version, timestamp) AS version,
          argMax(osquery_version, timestamp) AS osquery_version,
          argMax(uptime_seconds, timestamp) AS uptime_seconds,
          argMax(platform, timestamp) AS platform
        FROM fleetd_info
        GROUP BY host_id
      ) f ON h.host_id = f.host_id
      ORDER BY h.hostname ASC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.devices.count',
    domain: 'devices',
    client: 'alt',
    description: 'Total unique device count across all firehose tables',
    params: [],
    sql: `
      SELECT count() AS total FROM (
        SELECT host_id FROM wifi_signal
        UNION DISTINCT
        SELECT host_id FROM running_apps
        UNION DISTINCT
        SELECT host_id FROM hardware_inventory
        UNION DISTINCT
        SELECT host_id FROM fleetd_info
      )
    `,
  },
  {
    name: 'firehose.devices.overview',
    domain: 'devices',
    client: 'alt',
    description: 'Fleet-wide overview metrics across all firehose tables',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        (SELECT countDistinct(host_id) FROM wifi_signal WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS wifi_hosts,
        (SELECT countDistinct(host_id) FROM running_apps WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS app_hosts,
        (SELECT countDistinct(host_id) FROM hardware_inventory WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS hw_hosts,
        (SELECT countDistinct(host_id) FROM fleetd_info WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS fleetd_hosts,
        (SELECT round(avg(rssi), 1) FROM wifi_signal WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS avg_rssi,
        (SELECT round(avg(snr), 1) FROM wifi_signal WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS avg_snr,
        (SELECT countDistinct(app_name) FROM running_apps WHERE app_name != '' AND host_id IN (SELECT host_id FROM filtered_hosts)) AS unique_apps,
        (SELECT count() FROM wifi_signal WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS wifi_samples,
        (SELECT count() FROM running_apps WHERE host_id IN (SELECT host_id FROM filtered_hosts)) AS app_samples
    `,
  },
  {
    name: 'firehose.devices.detail',
    domain: 'devices',
    client: 'alt',
    description: 'Single device composite detail from all firehose tables',
    params: [
      { name: 'hostId', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        h.hostname, h.computer_name, h.cpu_brand, h.cpu_logical_cores,
        h.hardware_model, h.hardware_serial, h.memory_gb,
        toDateTime(lastseen.last_seen) AS last_seen,
        dateDiff('minute', lastseen.last_seen, now()) AS minutes_since_last_seen,
        dateDiff('hour', lastseen.last_seen, now()) AS hours_since_last_seen,
        w.rssi, w.noise, w.snr, w.signal_quality, w.transmit_rate,
        w.channel, w.channel_width, w.security_type,
        f.version, f.osquery_version, f.platform, f.uptime_seconds, f.last_error
      FROM (
        SELECT argMax(hostname, timestamp) AS hostname,
          argMax(computer_name, timestamp) AS computer_name,
          argMax(cpu_brand, timestamp) AS cpu_brand,
          argMax(cpu_logical_cores, timestamp) AS cpu_logical_cores,
          argMax(hardware_model, timestamp) AS hardware_model,
          argMax(hardware_serial, timestamp) AS hardware_serial,
          argMax(memory_gb, timestamp) AS memory_gb
        FROM hardware_inventory WHERE host_id = {filterHostId:String}
      ) h
      CROSS JOIN (
        -- last_seen = newest signal from any firehose table for this host.
        -- hardware_inventory alone is too coarse — it snapshots rarely, so
        -- an active host looks "stale" days early. Process / device / OS
        -- telemetry churn faster and reflect live activity.
        SELECT greatest(
          coalesce((SELECT max(timestamp) FROM hardware_inventory WHERE host_id = {filterHostId:String}), toDateTime64('1970-01-01', 9)),
          coalesce((SELECT max(timestamp) FROM device_health     WHERE host_id = {filterHostId:String}), toDateTime64('1970-01-01', 9)),
          coalesce((SELECT max(timestamp) FROM process_health    WHERE host_id = {filterHostId:String}), toDateTime64('1970-01-01', 9)),
          coalesce((SELECT max(timestamp) FROM os_health         WHERE host_id = {filterHostId:String}), toDateTime64('1970-01-01', 9)),
          coalesce((SELECT max(timestamp) FROM running_apps      WHERE host_id = {filterHostId:String}), toDateTime64('1970-01-01', 9)),
          coalesce((SELECT max(timestamp) FROM fleetd_info       WHERE host_id = {filterHostId:String}), toDateTime64('1970-01-01', 9))
        ) AS last_seen
      ) lastseen
      CROSS JOIN (
        SELECT argMax(rssi, timestamp) AS rssi,
          argMax(noise, timestamp) AS noise,
          argMax(snr, timestamp) AS snr,
          argMax(signal_quality, timestamp) AS signal_quality,
          argMax(transmit_rate, timestamp) AS transmit_rate,
          argMax(channel, timestamp) AS channel,
          argMax(channel_width, timestamp) AS channel_width,
          argMax(security_type, timestamp) AS security_type
        FROM wifi_signal WHERE host_id = {filterHostId:String}
      ) w
      CROSS JOIN (
        SELECT argMax(version, timestamp) AS version,
          argMax(osquery_version, timestamp) AS osquery_version,
          argMax(platform, timestamp) AS platform,
          argMax(uptime_seconds, timestamp) AS uptime_seconds,
          argMax(last_error, timestamp) AS last_error
        FROM fleetd_info WHERE host_id = {filterHostId:String}
      ) f
    `,
  },
  {
    name: 'firehose.devices.filter_options',
    domain: 'devices',
    client: 'alt',
    description: 'Dropdown filter options from firehose hardware inventory',
    params: [],
    sql: `
      SELECT 'model' AS type, hardware_model AS value
      FROM hardware_inventory
      GROUP BY hardware_model
      HAVING hardware_model != ''
      ORDER BY count() DESC

      UNION ALL

      SELECT 'platform' AS type, platform AS value
      FROM fleetd_info
      GROUP BY platform
      HAVING platform != ''
      ORDER BY count() DESC
    `,
  },
  {
    name: 'firehose.devices.filtered_count',
    domain: 'devices',
    client: 'alt',
    description: 'Filtered device count for firehose data',
    params: [
      { name: 'search', type: 'string' as const, required: false },
      { name: 'model', type: 'string' as const, required: false },
      { name: 'ramTier', type: 'string' as const, required: false },
    ],
    sql: `
      SELECT count() AS cnt FROM (
        SELECT host_id,
          argMax(hostname, timestamp) AS hostname,
          argMax(hardware_model, timestamp) AS hardware_model,
          argMax(hardware_serial, timestamp) AS hardware_serial,
          argMax(memory_gb, timestamp) AS memory_gb
        FROM hardware_inventory
        GROUP BY host_id
      )
      WHERE 1=1
        AND if({filterSearch:String} != '', hostname LIKE concat('%', {filterSearch:String}, '%') OR hardware_serial LIKE concat('%', {filterSearch:String}, '%') OR hardware_model LIKE concat('%', {filterSearch:String}, '%'), true)
        AND if({filterModel:String} != '', hardware_model = {filterModel:String}, true)
        AND if({filterRamTier:String} != '', memory_gb <= multiIf(
          {filterRamTier:String} = '8GB', 8,
          {filterRamTier:String} = '16GB', 16,
          {filterRamTier:String} = '18GB', 18,
          {filterRamTier:String} = '24GB', 24,
          {filterRamTier:String} = '32GB', 32,
          {filterRamTier:String} = '36GB', 36,
          {filterRamTier:String} = '48GB', 48,
          {filterRamTier:String} = '64GB', 64,
          999999
        ), true)
    `,
  },
]
