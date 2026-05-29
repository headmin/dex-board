/**
 * Firehose security-posture queries.
 *
 * Aggregates over the `security_posture` table (populated by the Fleet
 * "DEX - Device security posture" schedule). When the schedule is paused
 * the table will be empty and these queries return zero rows / NULLs —
 * callers should branch on `posture_hosts > 0`.
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

export const firehoseSecurityQueries: QueryConfig[] = [
  {
    name: 'firehose.security.posture_summary',
    domain: 'security',
    client: 'core',
    description: 'Fleet-wide posture: how many hosts have each binary security setting enabled',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      latest_posture AS (
        SELECT
          host_id,
          argMax(disk_encrypted,     timestamp) AS disk_encrypted,
          argMax(firewall_enabled,   timestamp) AS firewall_enabled,
          argMax(gatekeeper_enabled, timestamp) AS gatekeeper_enabled,
          argMax(sip_enabled,        timestamp) AS sip_enabled
        FROM security_posture
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
        GROUP BY host_id
      )
      SELECT
        count() AS posture_hosts,
        countIf(disk_encrypted     = 1) AS disk_encrypted_count,
        countIf(firewall_enabled   = 1) AS firewall_enabled_count,
        countIf(gatekeeper_enabled = 1) AS gatekeeper_enabled_count,
        countIf(sip_enabled        = 1) AS sip_enabled_count
      FROM latest_posture
    `,
  },
  {
    name: 'firehose.security.posture_breakdown',
    domain: 'security',
    client: 'core',
    description: 'Per-control adoption % (encryption/firewall/Gatekeeper/SIP) as of N days ago — drives the exposure breakdown',
    params: [
      ...FILTER_PARAMS,
      { name: 'asOfDaysAgo', type: 'number' as const, required: false, min: 0, max: 365, default: 0 },
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      latest_posture AS (
        SELECT
          host_id,
          argMax(disk_encrypted,     timestamp) AS disk_encrypted,
          argMax(firewall_enabled,   timestamp) AS firewall_enabled,
          argMax(gatekeeper_enabled, timestamp) AS gatekeeper_enabled,
          argMax(sip_enabled,        timestamp) AS sip_enabled
        FROM security_posture
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
          AND timestamp <= now() - toIntervalDay({asOfDaysAgo:UInt32})
        GROUP BY host_id
      )
      SELECT
        count() AS posture_hosts,
        round(100.0 * countIf(disk_encrypted     = 1) / count(), 1) AS pct_encrypted,
        round(100.0 * countIf(firewall_enabled   = 1) / count(), 1) AS pct_firewall,
        round(100.0 * countIf(gatekeeper_enabled = 1) / count(), 1) AS pct_gatekeeper,
        round(100.0 * countIf(sip_enabled        = 1) / count(), 1) AS pct_sip
      FROM latest_posture
    `,
  },
]
