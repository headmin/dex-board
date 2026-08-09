/**
 * Firehose hardware inventory queries.
 *
 * Source: alt ClickHouse → hardware_inventory (materialized from osquery result logs)
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

export const firehoseHardwareQueries: QueryConfig[] = [
  {
    name: 'firehose.hardware.summary',
    domain: 'devices',
    client: 'core',
    description: 'Fleet-wide hardware aggregates: host count, avg RAM, avg cores, model count',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        count() AS device_count,
        round(avg(memory_gb)) AS avg_memory_gb,
        round(avg(cpu_logical_cores)) AS avg_logical_cores,
        countDistinct(hardware_model) AS model_count
      FROM (
        SELECT host_id,
          argMax(memory_gb, timestamp) AS memory_gb,
          argMax(cpu_logical_cores, timestamp) AS cpu_logical_cores,
          argMax(hardware_model, timestamp) AS hardware_model
        FROM hardware_inventory
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
        GROUP BY host_id
      )
    `,
  },
  {
    name: 'firehose.hardware.inventory',
    domain: 'devices',
    client: 'core',
    description: 'Latest hardware info per device',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 100 },
    ],
    sql: `
      SELECT
        host_id,
        argMax(hostname, timestamp) AS hostname,
        argMax(computer_name, timestamp) AS computer_name,
        argMax(cpu_brand, timestamp) AS cpu_brand,
        argMax(cpu_logical_cores, timestamp) AS cpu_logical_cores,
        argMax(cpu_physical_cores, timestamp) AS cpu_physical_cores,
        argMax(hardware_model, timestamp) AS hardware_model,
        argMax(hardware_serial, timestamp) AS hardware_serial,
        argMax(memory_gb, timestamp) AS memory_gb,
        max(timestamp) AS last_seen
      FROM hardware_inventory
      GROUP BY host_id
      ORDER BY hostname ASC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.hardware.model_distribution',
    domain: 'devices',
    client: 'core',
    description: 'Hardware model distribution across fleet',
    params: [],
    sql: `
      SELECT
        hardware_model,
        any(cpu_brand) AS cpu_brand,
        count() AS device_count
      FROM (
        SELECT host_id,
          argMax(hardware_model, timestamp) AS hardware_model,
          argMax(cpu_brand, timestamp) AS cpu_brand
        FROM hardware_inventory
        GROUP BY host_id
      )
      GROUP BY hardware_model
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.hardware.memory_tiers',
    domain: 'devices',
    client: 'core',
    description: 'Device count by RAM tier',
    params: [],
    sql: `
      SELECT
        multiIf(
          mem <= 8, '8 GB',
          mem <= 16, '16 GB',
          mem <= 32, '32 GB',
          mem <= 64, '64 GB',
          '128+ GB'
        ) AS ram_tier,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(memory_gb, timestamp) AS mem
        FROM hardware_inventory
        GROUP BY host_id
      )
      GROUP BY ram_tier
      ORDER BY
        CASE ram_tier
          WHEN '8 GB' THEN 1
          WHEN '16 GB' THEN 2
          WHEN '32 GB' THEN 3
          WHEN '64 GB' THEN 4
          ELSE 5
        END
    `,
  },
]
