/**
 * Processes domain queries.
 *
 * Covers: top processes by memory, peak memory, process trends,
 * state distribution, latest snapshots, process sequences (Gantt),
 * and per-device process data.
 */
import type { QueryConfig } from '../types'

const COMMON_PARAMS = [
  { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
  { name: 'os', type: 'string' as const, required: false },
  { name: 'model', type: 'string' as const, required: false },
  { name: 'search', type: 'string' as const, required: false },
  { name: 'encryption', type: 'enum' as const, values: ['', 'encrypted', 'not-encrypted'], required: false, default: '' },
  { name: 'ramTier', type: 'string' as const, required: false },
]

export const processQueries: QueryConfig[] = [
  {
    name: 'processes.metrics',
    domain: 'processes',
    description: 'Process summary: unique count, avg threads, heaviest process, P95 memory',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        uniqExact(process_name) AS unique_count,
        ROUND(AVG(toFloat64OrNull(threads)), 0) AS avg_threads,
        argMax(process_name, toFloat64OrNull(memory_mb)) AS heaviest,
        ROUND(quantile(0.95)(toFloat64OrNull(memory_mb)), 1) AS p95_memory
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} {{FILTERS}}
    `,
  },
  {
    name: 'processes.top',
    domain: 'processes',
    description: 'Top N processes by average memory (MB)',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 10 },
    ],
    sql: `
      SELECT
        process_name,
        ROUND(AVG(toFloat64OrNull(memory_mb)), 1) AS avg_mb
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} AND process_name != '' {{FILTERS}}
      GROUP BY process_name
      ORDER BY avg_mb DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'processes.top_peak',
    domain: 'processes',
    description: 'Top N processes by peak memory (MB)',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 10 },
    ],
    sql: `
      SELECT
        process_name,
        ROUND(MAX(toFloat64OrNull(memory_mb)), 1) AS peak_mb
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} AND process_name != '' {{FILTERS}}
      GROUP BY process_name
      ORDER BY peak_mb DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'processes.trend',
    domain: 'processes',
    description: 'Top 5 process average memory over time',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        formatDateTime(toStartOfHour(event_time), '%m-%d %H:00') AS time,
        ROUND(AVG(toFloat64OrNull(memory_mb)), 1) AS avg_mb
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} AND process_name != '' {{FILTERS}}
        AND process_name IN (
          SELECT process_name FROM dex_top_processes
          WHERE {{TIME_FILTER}}
          GROUP BY process_name
          ORDER BY AVG(toFloat64OrNull(memory_mb)) DESC
          LIMIT 5
        )
      GROUP BY toStartOfHour(event_time)
      ORDER BY toStartOfHour(event_time)
    `,
  },
  {
    name: 'processes.states',
    domain: 'processes',
    description: 'Process state distribution (running, sleeping, etc.)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        if(state = '', 'unknown', state) AS state,
        count() AS count
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY state
      ORDER BY count DESC
    `,
  },
  {
    name: 'processes.distribution',
    domain: 'processes',
    description: 'Process occurrence distribution (top 10 by count)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        process_name,
        COUNT(*) AS count
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} AND process_name != '' {{FILTERS}}
      GROUP BY process_name
      ORDER BY count DESC
      LIMIT 10
    `,
  },
  {
    name: 'processes.snapshot',
    domain: 'processes',
    description: 'Latest process snapshot per device',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 100 },
    ],
    sql: `
      SELECT
        p.host_identifier,
        d.hostname AS hostname,
        p.process_name,
        ROUND(toFloat64OrNull(p.memory_mb), 1) AS memory_mb,
        ROUND(toFloat64OrNull(p.memory_percent), 1) AS memory_percent,
        toUInt32OrNull(p.threads) AS threads,
        p.state
      FROM dex_top_processes p
      LEFT JOIN dex_devices d ON p.host_identifier = d.host_identifier
      WHERE p.{{TIME_FILTER}} {{FILTERS}}
        AND (p.host_identifier, p.event_time) IN (
          SELECT host_identifier, max(event_time)
          FROM dex_top_processes
          WHERE {{TIME_FILTER}}
          GROUP BY host_identifier
        )
      ORDER BY toFloat64OrNull(p.memory_mb) DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'processes.recent',
    domain: 'processes',
    description: 'Recent process events (fleet-wide or per-device)',
    params: [
      ...COMMON_PARAMS,
      { name: 'hostIdentifier', type: 'string' as const, required: false },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 50 },
    ],
    sql: `
      SELECT
        p.event_time,
        d.hostname,
        p.process_name,
        p.memory_mb,
        p.pid,
        p.state
      FROM dex_top_processes p
      LEFT JOIN dex_devices d ON p.host_identifier = d.host_identifier
      WHERE p.{{TIME_FILTER}} {{FILTERS}}
      ORDER BY p.event_time DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'processes.sequence',
    domain: 'processes',
    description: 'Process activity timeline (Gantt chart data)',
    params: [
      ...COMMON_PARAMS,
      { name: 'hostIdentifier', type: 'string' as const, required: false },
    ],
    sql: `
      SELECT
        process_name,
        formatDateTime(toStartOfHour(event_time), '%m-%d %H:00') AS hour_label,
        ROUND(AVG(toFloat64OrNull(memory_mb)), 1) AS avg_mb,
        count() AS event_count
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} {{FILTERS}}
        AND process_name IN (
          SELECT process_name FROM dex_top_processes
          WHERE {{TIME_FILTER}} {{FILTERS}}
          GROUP BY process_name
          ORDER BY AVG(toFloat64OrNull(memory_mb)) DESC
          LIMIT 8
        )
      GROUP BY process_name, toStartOfHour(event_time)
      ORDER BY process_name, toStartOfHour(event_time)
    `,
  },
  {
    name: 'processes.device_top',
    domain: 'processes',
    description: 'Top processes for a single device',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 15 },
    ],
    sql: `
      SELECT process_name, memory_mb, pid, state
      FROM dex_top_processes
      WHERE host_identifier = {filterHostId:String}
        AND event_time = (
          SELECT MAX(event_time) FROM dex_top_processes
          WHERE host_identifier = {filterHostId:String}
        )
      ORDER BY toFloat64OrNull(memory_mb) DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'processes.event_count',
    domain: 'processes',
    description: 'Total process event count (for dashboard metrics)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT count() AS cnt
      FROM dex_top_processes
      WHERE {{TIME_FILTER}} {{FILTERS}}
    `,
  },
]
