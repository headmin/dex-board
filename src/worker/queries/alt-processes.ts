/**
 * Firehose process health queries.
 *
 * Source: alt ClickHouse → process_health
 * (materialized from dex-queries.yml "process health" — top 25 by RSS per snapshot)
 */
import type { QueryConfig } from '../types'

export const firehoseProcessQueries: QueryConfig[] = [
  {
    name: 'firehose.processes.top_fleet',
    domain: 'processes',
    client: 'alt',
    description: 'Top processes by average RSS across the fleet',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 100, default: 25 },
    ],
    sql: `
      SELECT
        process_name,
        process_class,
        round(avg(rss_mb), 1) AS avg_rss_mb,
        round(max(rss_mb), 1) AS max_rss_mb,
        round(avg(threads), 0) AS avg_threads,
        countDistinct(host_id) AS device_count,
        count() AS sample_count
      FROM process_health
      WHERE process_name != ''
      GROUP BY process_name, process_class
      ORDER BY avg_rss_mb DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.processes.by_class',
    domain: 'processes',
    client: 'alt',
    description: 'Aggregate memory by process class (user_app, mgmt_agent, system, other)',
    params: [],
    sql: `
      SELECT
        process_class,
        countDistinct(process_name) AS unique_processes,
        countDistinct(host_id) AS device_count,
        round(avg(rss_mb), 1) AS avg_rss_mb,
        round(sum(rss_mb), 0) AS total_rss_mb,
        count() AS sample_count
      FROM process_health
      WHERE process_class != ''
      GROUP BY process_class
      ORDER BY total_rss_mb DESC
    `,
  },
  {
    name: 'firehose.processes.pressure_distribution',
    domain: 'processes',
    client: 'alt',
    description: 'Process count by memory pressure tier',
    params: [],
    sql: `
      SELECT
        mem_pressure,
        count() AS process_count,
        countDistinct(host_id) AS device_count,
        round(avg(rss_mb), 1) AS avg_rss_mb
      FROM process_health
      GROUP BY mem_pressure
      ORDER BY process_count DESC
    `,
  },
  {
    name: 'firehose.processes.per_device',
    domain: 'processes',
    client: 'alt',
    description: 'Latest process health snapshot for a specific device',
    params: [
      { name: 'hostId', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        process_name,
        path,
        process_class,
        rss_mb,
        vmem_gb,
        threads,
        mem_pressure,
        state,
        cpu_user_ms,
        cpu_sys_ms,
        disk_bytes_read,
        disk_bytes_written
      FROM process_health
      WHERE host_id = {filterHostId:String}
        AND timestamp = (SELECT max(timestamp) FROM process_health WHERE host_id = {filterHostId:String})
      ORDER BY rss_mb DESC
    `,
  },
  {
    name: 'firehose.processes.mgmt_agents',
    domain: 'processes',
    client: 'alt',
    description: 'Management/security agent processes across fleet (CrowdStrike, Jamf, etc.)',
    params: [],
    sql: `
      SELECT
        process_name,
        round(avg(rss_mb), 1) AS avg_rss_mb,
        round(max(rss_mb), 1) AS max_rss_mb,
        round(avg(threads), 0) AS avg_threads,
        countDistinct(host_id) AS device_count
      FROM process_health
      WHERE process_class = 'mgmt_agent'
      GROUP BY process_name
      ORDER BY avg_rss_mb DESC
    `,
  },
]
