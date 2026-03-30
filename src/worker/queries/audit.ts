/**
 * Audit domain queries.
 *
 * Covers: admin activity overview, timeline, event types,
 * top users, recent events, and day×hour heatmap.
 * No fleet filters — audit logs are not device-scoped.
 */
import type { QueryConfig } from '../types'

export const auditQueries: QueryConfig[] = [
  {
    name: 'audit.overview',
    domain: 'audit',
    description: 'Total events, unique users, event types, peak hour',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
    ],
    sql: `
      SELECT
        count() AS total_events,
        uniqExact(JSONExtractString(data, 'actor_email')) AS unique_users,
        uniqExact(JSONExtractString(data, 'type')) AS event_types,
        max(peak_count) AS peak_hour_events
      FROM fleet_audit_logs
      LEFT JOIN (
        SELECT max(cnt) AS peak_count FROM (
          SELECT toStartOfHour(event_time) AS hour, count() AS cnt
          FROM fleet_audit_logs
          WHERE {{TIME_FILTER}}
          GROUP BY hour
        )
      ) AS peak ON 1=1
      WHERE {{TIME_FILTER}}
    `,
  },
  {
    name: 'audit.timeline',
    domain: 'audit',
    description: 'Hourly event counts over time',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
    ],
    sql: `
      SELECT
        formatDateTime(toStartOfHour(event_time), '%m-%d %H:00') AS time,
        count() AS event_count
      FROM fleet_audit_logs
      WHERE {{TIME_FILTER}}
      GROUP BY toStartOfHour(event_time)
      ORDER BY toStartOfHour(event_time)
    `,
  },
  {
    name: 'audit.event_types',
    domain: 'audit',
    description: 'Event type breakdown with counts',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
    ],
    sql: `
      SELECT
        JSONExtractString(data, 'type') AS event_type,
        count() AS count
      FROM fleet_audit_logs
      WHERE {{TIME_FILTER}}
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 15
    `,
  },
  {
    name: 'audit.top_users',
    domain: 'audit',
    description: 'Most active users by event count',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
    ],
    sql: `
      SELECT
        JSONExtractString(data, 'actor_email') AS user_email,
        count() AS count
      FROM fleet_audit_logs
      WHERE {{TIME_FILTER}}
        AND JSONExtractString(data, 'actor_email') != ''
      GROUP BY user_email
      ORDER BY count DESC
      LIMIT 10
    `,
  },
  {
    name: 'audit.recent_events',
    domain: 'audit',
    description: 'Latest audit events with details',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 100 },
    ],
    sql: `
      SELECT
        formatDateTime(event_time, '%Y-%m-%d %H:%M:%S') AS event_time,
        JSONExtractString(data, 'type') AS event_type,
        JSONExtractString(data, 'actor_email') AS user_email,
        substring(JSONExtractString(data, 'details'), 1, 120) AS detail
      FROM fleet_audit_logs
      WHERE {{TIME_FILTER}}
      ORDER BY event_time DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'audit.heatmap',
    domain: 'audit',
    description: 'Day × hour activity heatmap',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
    ],
    sql: `
      SELECT
        formatDateTime(toDate(event_time), '%m-%d') AS day,
        toHour(event_time) AS hour,
        count() AS cnt
      FROM fleet_audit_logs
      WHERE {{TIME_FILTER}}
      GROUP BY day, hour
      ORDER BY day, hour
    `,
  },
]
