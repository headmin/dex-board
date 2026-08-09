/**
 * Firehose Wi-Fi signal quality queries.
 *
 * Source: alt ClickHouse → wifi_signal (materialized from osquery result logs)
 */
import type { QueryConfig } from '../types'

export const firehoseWifiQueries: QueryConfig[] = [
  {
    name: 'firehose.wifi.summary',
    domain: 'network',
    client: 'core',
    description: 'Fleet-wide Wi-Fi signal stats from firehose data source',
    params: [],
    sql: `
      SELECT
        count() AS total_samples,
        countDistinct(host_id) AS unique_hosts,
        round(avg(rssi), 1) AS avg_rssi,
        round(avg(noise), 1) AS avg_noise,
        round(avg(snr), 1) AS avg_snr,
        round(avg(transmit_rate), 0) AS avg_transmit_rate
      FROM wifi_signal
      -- rssi = 0 is the "no reading" sentinel (real RSSI is negative dBm);
      -- averaging it in drags avg_rssi toward 0 and inflates the fleet stats
      WHERE rssi < 0
    `,
  },
  {
    name: 'firehose.wifi.quality',
    domain: 'network',
    client: 'core',
    description: 'Per-device latest Wi-Fi signal quality',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 50 },
    ],
    sql: `
      SELECT
        host_id,
        argMax(hostname, timestamp) AS hostname,
        argMax(rssi, timestamp) AS rssi,
        argMax(noise, timestamp) AS noise,
        argMax(snr, timestamp) AS snr,
        argMax(signal_quality, timestamp) AS signal_quality,
        argMax(transmit_rate, timestamp) AS transmit_rate,
        argMax(security_type, timestamp) AS security_type,
        argMax(channel, timestamp) AS channel,
        argMax(channel_width, timestamp) AS channel_width,
        max(timestamp) AS last_seen
      -- Sentinel guard in the subquery (the outer alias shadows the column):
      -- only real readings — hosts whose latest row is the rssi = 0
      -- "no reading" sentinel fall back to their last real reading.
      FROM (SELECT * FROM wifi_signal WHERE rssi < 0)
      GROUP BY host_id
      ORDER BY rssi ASC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.wifi.quality_distribution',
    domain: 'network',
    client: 'core',
    description: 'Distribution of signal quality ratings',
    params: [],
    sql: `
      SELECT
        signal_quality,
        count() AS cnt,
        round(count() * 100.0 / sum(count()) OVER (), 1) AS pct
      FROM wifi_signal
      WHERE rssi < 0
      GROUP BY signal_quality
      ORDER BY
        CASE signal_quality
          WHEN 'excellent' THEN 1
          WHEN 'good' THEN 2
          WHEN 'fair' THEN 3
          WHEN 'poor' THEN 4
          ELSE 5
        END
    `,
  },
  {
    name: 'firehose.wifi.timeseries',
    domain: 'network',
    client: 'core',
    description: 'Fleet-wide Wi-Fi signal strength over time (hourly avg)',
    params: [],
    sql: `
      SELECT
        toStartOfHour(timestamp) AS hour,
        round(avg(rssi), 1) AS avg_rssi,
        round(avg(noise), 1) AS avg_noise,
        round(avg(snr), 1) AS avg_snr,
        count() AS samples
      FROM wifi_signal
      WHERE rssi < 0
      GROUP BY hour
      ORDER BY hour
    `,
  },
  {
    name: 'firehose.wifi.device_timeseries',
    domain: 'network',
    client: 'core',
    description: 'Single device Wi-Fi signal over time',
    params: [
      { name: 'hostId', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        toStartOfHour(timestamp) AS hour,
        round(avg(rssi), 1) AS avg_rssi,
        round(avg(noise), 1) AS avg_noise,
        round(avg(snr), 1) AS avg_snr,
        count() AS samples
      FROM wifi_signal
      WHERE host_id = {filterHostId:String}
        -- rssi = 0 is the "no reading" sentinel (real RSSI is negative dBm);
        -- plotting it pins the chart at 0 and reads as perfect signal
        AND rssi < 0
      GROUP BY hour
      ORDER BY hour
    `,
  },
]
