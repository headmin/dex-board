/**
 * Firehose VPN gate queries.
 *
 * Source: alt ClickHouse → vpn_gate
 * (materialized from dex-queries.yml "VPN gate" — network confidence signal)
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

export const firehoseVpnQueries: QueryConfig[] = [
  {
    name: 'firehose.vpn.summary',
    domain: 'network',
    client: 'core',
    description: 'Fleet VPN/network confidence overview',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        countDistinct(host_id) AS total_devices,
        countDistinctIf(host_id, network_confidence = 'tunnel_active') AS vpn_active,
        countDistinctIf(host_id, network_confidence = 'direct_connected') AS direct_connected,
        countDistinctIf(host_id, network_confidence = 'disconnected') AS disconnected,
        round(avg(vpn_tunnels_active), 1) AS avg_tunnels
      FROM vpn_gate
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM vpn_gate GROUP BY host_id
      )
      AND host_id IN (SELECT host_id FROM filtered_hosts)
    `,
  },
  {
    name: 'firehose.vpn.list',
    domain: 'network',
    client: 'core',
    description: 'Per-device VPN/network status. Pass hostId to fetch one host.',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
      { name: 'hostId', type: 'string' as const, required: false },
    ],
    sql: `
      SELECT
        host_id,
        hostname,
        vpn_tunnels_active,
        vpn_tunnels_total,
        vpn_default_route,
        primary_interface,
        primary_active,
        network_confidence,
        timestamp
      FROM vpn_gate
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM vpn_gate GROUP BY host_id
      )
        AND if({hostId:String} != '', host_id = {hostId:String}, true)
      ORDER BY hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.vpn.confidence_distribution',
    domain: 'network',
    client: 'core',
    description: 'Device count by network confidence level',
    params: [],
    sql: `
      SELECT
        network_confidence,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(network_confidence, timestamp) AS network_confidence
        FROM vpn_gate GROUP BY host_id
      )
      GROUP BY network_confidence
      ORDER BY device_count DESC
    `,
  },
]
