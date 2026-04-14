/**
 * Firehose DEX Insights queries.
 *
 * Memory pressure, architecture comparison, agent overhead, risk scoring.
 * Joins running_apps + hardware_inventory + fleetd_info for composite signals.
 */
import type { QueryConfig } from '../types'

export const firehoseInsightQueries: QueryConfig[] = [
  {
    name: 'firehose.insights.summary',
    domain: 'scores',
    client: 'alt',
    description: 'Fleet-wide DEX summary: device count, avg pressure, high-pressure count, agent overhead',
    params: [],
    sql: `
      SELECT
        count() AS total_devices,
        round(avg(avg_pressure), 1) AS avg_mem_pressure_pct,
        countIf(avg_pressure > 50) AS high_pressure_devices,
        countIf(avg_pressure > 70) AS critical_pressure_devices
      FROM (
        SELECT h.host_id, avg(a.total_mem / (h.memory_gb * 1024) * 100) AS avg_pressure
        FROM (
          SELECT host_id, argMax(memory_gb, timestamp) AS memory_gb
          FROM hardware_inventory GROUP BY host_id
        ) h
        INNER JOIN (
          SELECT host_id, timestamp, sum(memory_mb) AS total_mem
          FROM running_apps GROUP BY host_id, timestamp
        ) a ON h.host_id = a.host_id
        GROUP BY h.host_id
      )
    `,
  },
  {
    name: 'firehose.insights.memory_pressure',
    domain: 'scores',
    client: 'alt',
    description: 'Per-device memory pressure with hardware context',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 100 },
    ],
    sql: `
      SELECT
        h.host_id,
        h.hostname,
        h.cpu_brand,
        h.hardware_model,
        h.memory_gb,
        h.cpu_type,
        round(avg(a.total_mem), 0) AS avg_total_app_mem_mb,
        round(max(a.total_mem), 0) AS peak_total_app_mem_mb,
        round(avg(a.total_mem) / (h.memory_gb * 1024) * 100, 1) AS avg_mem_pressure_pct,
        round(max(a.total_mem) / (h.memory_gb * 1024) * 100, 1) AS peak_mem_pressure_pct
      FROM (
        SELECT host_id,
          argMax(hostname, timestamp) AS hostname,
          argMax(cpu_brand, timestamp) AS cpu_brand,
          argMax(hardware_model, timestamp) AS hardware_model,
          argMax(memory_gb, timestamp) AS memory_gb,
          argMax(cpu_type, timestamp) AS cpu_type
        FROM hardware_inventory GROUP BY host_id
      ) h
      INNER JOIN (
        SELECT host_id, timestamp, sum(memory_mb) AS total_mem
        FROM running_apps GROUP BY host_id, timestamp
      ) a ON h.host_id = a.host_id
      GROUP BY h.host_id, h.hostname, h.cpu_brand, h.hardware_model, h.memory_gb, h.cpu_type
      ORDER BY avg_mem_pressure_pct DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.insights.pressure_by_arch',
    domain: 'scores',
    client: 'alt',
    description: 'Memory pressure comparison: Intel vs Apple Silicon',
    params: [],
    sql: `
      SELECT
        if(cpu_type = 'arm64e', 'Apple Silicon', 'Intel') AS arch,
        count() AS device_count,
        round(avg(memory_gb), 0) AS avg_ram_gb,
        round(avg(avg_pressure), 1) AS avg_mem_pressure_pct,
        round(max(avg_pressure), 1) AS max_mem_pressure_pct,
        round(avg(avg_uptime_hrs), 0) AS avg_uptime_hours
      FROM (
        SELECT h.host_id, h.cpu_type, h.memory_gb,
          avg(a.total_mem / (h.memory_gb * 1024) * 100) AS avg_pressure,
          any(f.uptime_hrs) AS avg_uptime_hrs
        FROM (
          SELECT host_id, argMax(cpu_type, timestamp) AS cpu_type, argMax(memory_gb, timestamp) AS memory_gb
          FROM hardware_inventory GROUP BY host_id
        ) h
        LEFT JOIN (
          SELECT host_id, timestamp, sum(memory_mb) AS total_mem
          FROM running_apps GROUP BY host_id, timestamp
        ) a ON h.host_id = a.host_id
        LEFT JOIN (
          SELECT host_id, argMax(uptime_seconds, timestamp) / 3600 AS uptime_hrs
          FROM fleetd_info GROUP BY host_id
        ) f ON h.host_id = f.host_id
        GROUP BY h.host_id, h.cpu_type, h.memory_gb
      )
      GROUP BY arch
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.insights.pressure_by_ram_tier',
    domain: 'scores',
    client: 'alt',
    description: 'Memory pressure by RAM tier',
    params: [],
    sql: `
      SELECT
        multiIf(memory_gb <= 8, '8 GB', memory_gb <= 16, '16 GB', memory_gb <= 18, '18 GB', memory_gb <= 24, '24 GB', memory_gb <= 32, '32 GB', memory_gb <= 36, '36 GB', memory_gb <= 48, '48 GB', memory_gb <= 64, '64 GB', '128+ GB') AS ram_tier,
        count() AS device_count,
        round(avg(memory_gb), 0) AS avg_total_ram_gb,
        round(avg(avg_used_gb), 1) AS avg_used_gb,
        round(avg(avg_pressure), 1) AS avg_mem_pressure_pct,
        round(max(avg_pressure), 1) AS max_mem_pressure_pct
      FROM (
        SELECT h.host_id, h.memory_gb,
          avg(a.total_mem / 1024) AS avg_used_gb,
          avg(a.total_mem / (h.memory_gb * 1024) * 100) AS avg_pressure
        FROM (
          SELECT host_id, argMax(memory_gb, timestamp) AS memory_gb
          FROM hardware_inventory GROUP BY host_id
        ) h
        INNER JOIN (
          SELECT host_id, timestamp, sum(memory_mb) AS total_mem
          FROM running_apps GROUP BY host_id, timestamp
        ) a ON h.host_id = a.host_id
        GROUP BY h.host_id, h.memory_gb
      )
      GROUP BY ram_tier
      ORDER BY CASE ram_tier WHEN '8 GB' THEN 1 WHEN '16 GB' THEN 2 WHEN '18 GB' THEN 3 WHEN '24 GB' THEN 4 WHEN '32 GB' THEN 5 WHEN '36 GB' THEN 6 WHEN '48 GB' THEN 7 WHEN '64 GB' THEN 8 ELSE 9 END
    `,
  },
  {
    name: 'firehose.insights.pressure_by_cpu',
    domain: 'scores',
    client: 'alt',
    description: 'Memory pressure by CPU generation',
    params: [],
    sql: `
      SELECT
        cpu_brand,
        count() AS device_count,
        round(avg(memory_gb), 0) AS avg_ram_gb,
        round(avg(avg_pressure), 1) AS avg_mem_pressure_pct,
        round(max(avg_pressure), 1) AS max_mem_pressure_pct
      FROM (
        SELECT h.host_id, h.cpu_brand, h.memory_gb,
          avg(a.total_mem / (h.memory_gb * 1024) * 100) AS avg_pressure
        FROM (
          SELECT host_id, argMax(cpu_brand, timestamp) AS cpu_brand, argMax(memory_gb, timestamp) AS memory_gb
          FROM hardware_inventory GROUP BY host_id
        ) h
        INNER JOIN (
          SELECT host_id, timestamp, sum(memory_mb) AS total_mem
          FROM running_apps GROUP BY host_id, timestamp
        ) a ON h.host_id = a.host_id
        GROUP BY h.host_id, h.cpu_brand, h.memory_gb
      )
      GROUP BY cpu_brand
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.insights.agent_overhead',
    domain: 'scores',
    client: 'alt',
    description: 'Management and security agent memory overhead',
    params: [],
    sql: `
      SELECT
        app_name,
        bundle_identifier,
        round(avg(memory_mb), 1) AS avg_mem_mb,
        round(max(memory_mb), 1) AS peak_mem_mb,
        round(quantile(0.95)(memory_mb), 1) AS p95_mem_mb,
        countDistinct(host_id) AS device_count,
        round(avg(memory_mb) * countDistinct(host_id), 0) AS fleet_cost_mb
      FROM running_apps
      WHERE bundle_identifier LIKE '%crowdstrike%'
        OR bundle_identifier LIKE '%jamf%'
        OR bundle_identifier LIKE '%zscaler%'
        OR bundle_identifier LIKE '%sentinelone%'
        OR bundle_identifier LIKE '%1password%'
        OR bundle_identifier LIKE '%fleetdm%'
        OR bundle_identifier LIKE '%kandji%'
        OR bundle_identifier LIKE '%mosyle%'
        OR app_name IN ('falcon-sensor', 'JamfAgent', 'Jamf Connect', 'ZscalerTunnel', 'osqueryd', 'orbit', 'fleet-desktop')
        OR path LIKE '%/opt/orbit/%'
        OR path LIKE '%CrowdStrike%'
        OR path LIKE '%Jamf%'
        OR path LIKE '%Zscaler%'
        OR path LIKE '%SentinelOne%'
      GROUP BY app_name, bundle_identifier
      ORDER BY fleet_cost_mb DESC
    `,
  },
  {
    name: 'firehose.insights.top_user_apps',
    domain: 'scores',
    client: 'alt',
    description: 'Top user-facing apps by fleet memory cost (excludes system processes)',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 20 },
    ],
    sql: `
      SELECT
        app_name,
        bundle_identifier,
        countDistinct(host_id) AS device_count,
        round(avg(memory_mb), 1) AS avg_mem_mb,
        round(max(memory_mb), 1) AS peak_mem_mb,
        round(avg(memory_mb) * countDistinct(host_id), 0) AS fleet_cost_mb
      FROM running_apps
      WHERE app_name != ''
        AND bundle_identifier NOT LIKE 'com.apple.%'
        AND bundle_identifier != ''
        AND app_name NOT IN ('loginwindow', 'universalaccessd', 'softwareupdated', 'AppSSODaemon')
      GROUP BY app_name, bundle_identifier
      HAVING device_count >= 3
      ORDER BY fleet_cost_mb DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.insights.risk_devices',
    domain: 'scores',
    client: 'alt',
    description: 'Composite DEX risk score: Intel + low RAM + high pressure',
    params: [],
    sql: `
      SELECT
        h.host_id,
        h.hostname,
        h.cpu_brand,
        h.cpu_type,
        h.hardware_model,
        h.memory_gb,
        round(avg(a.total_mem / (h.memory_gb * 1024) * 100), 1) AS avg_mem_pressure_pct,
        if(h.cpu_type != 'arm64e', 1, 0) AS is_intel,
        if(h.memory_gb <= 8, 1, 0) AS is_low_ram,
        if(avg(a.total_mem / (h.memory_gb * 1024) * 100) > 50, 1, 0) AS is_high_pressure,
        if(h.cpu_type != 'arm64e', 1, 0) + if(h.memory_gb <= 8, 1, 0) + if(avg(a.total_mem / (h.memory_gb * 1024) * 100) > 50, 1, 0) AS risk_score
      FROM (
        SELECT host_id, argMax(hostname, timestamp) AS hostname, argMax(cpu_brand, timestamp) AS cpu_brand,
          argMax(cpu_type, timestamp) AS cpu_type, argMax(hardware_model, timestamp) AS hardware_model,
          argMax(memory_gb, timestamp) AS memory_gb
        FROM hardware_inventory GROUP BY host_id
      ) h
      INNER JOIN (
        SELECT host_id, timestamp, sum(memory_mb) AS total_mem
        FROM running_apps GROUP BY host_id, timestamp
      ) a ON h.host_id = a.host_id
      GROUP BY h.host_id, h.hostname, h.cpu_brand, h.cpu_type, h.hardware_model, h.memory_gb
      ORDER BY risk_score DESC, avg_mem_pressure_pct DESC
    `,
  },
]
