/**
 * Firehose VPN gate queries.
 *
 * Source: alt ClickHouse → vpn_gate
 * (materialized from dex-queries.yml "VPN gate" — network confidence signal)
 */
import type { QueryConfig } from '../types'

export const firehoseVpnQueries: QueryConfig[] = [
  {
    name: 'firehose.vpn.summary',
    domain: 'network',
    client: 'alt',
    description: 'Fleet VPN/network confidence overview',
    params: [],
    sql: `
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
    `,
  },
  {
    name: 'firehose.vpn.list',
    domain: 'network',
    client: 'alt',
    description: 'Per-device VPN/network status',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
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
      ORDER BY hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.vpn.confidence_distribution',
    domain: 'network',
    client: 'alt',
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
