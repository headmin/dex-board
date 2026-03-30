/**
 * Network domain queries.
 *
 * Covers: WiFi quality per device and network signal averages.
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

export const networkQueries: QueryConfig[] = [
  {
    name: 'network.quality',
    domain: 'network',
    description: 'WiFi signal quality per device with RSSI classification',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 100, default: 20 },
    ],
    sql: `
      SELECT
        n.host_identifier,
        d.hostname,
        argMax(n.wifi_ssid, n.event_time) AS ssid,
        ROUND(toFloat64OrNull(argMax(n.wifi_rssi, n.event_time)), 0) AS rssi,
        argMax(
          multiIf(
            toFloat64OrNull(n.wifi_rssi) >= -50, 'excellent',
            toFloat64OrNull(n.wifi_rssi) >= -60, 'good',
            toFloat64OrNull(n.wifi_rssi) >= -70, 'fair',
            'poor'
          ), n.event_time
        ) AS quality
      FROM dex_network_quality n
      LEFT JOIN dex_devices d ON n.host_identifier = d.host_identifier
      WHERE n.{{TIME_FILTER}} {{FILTERS}}
      GROUP BY n.host_identifier, d.hostname
      ORDER BY rssi ASC
      {{LIMIT}}
    `,
  },
  {
    name: 'network.signals',
    domain: 'network',
    description: 'Fleet-wide network signal averages (for Experience Score)',
    params: [],
    sql: `
      SELECT
        avg(toFloat32OrZero(wifi_rssi)) AS avg_rssi,
        avg(toFloat32OrZero(wifi_noise)) AS avg_noise,
        avg(toFloat32OrZero(wifi_transmit_rate)) AS avg_tx
      FROM dex_network_quality
      WHERE event_time >= now() - INTERVAL 2 HOUR
    `,
  },
  {
    name: 'network.device_detail',
    domain: 'network',
    description: 'Single device latest network info',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT *
      FROM dex_network_quality
      WHERE host_identifier = {filterHostId:String}
      ORDER BY event_time DESC
      LIMIT 1
    `,
  },
]
