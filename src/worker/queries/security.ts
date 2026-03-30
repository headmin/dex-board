/**
 * Security domain queries.
 *
 * Covers: fleet security summary, per-device posture, encryption breakdown,
 * OS version distribution, and compliance signals for Experience Score.
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

export const securityQueries: QueryConfig[] = [
  {
    name: 'security.summary',
    domain: 'security',
    description: 'Fleet security percentages: encryption, firewall, SIP, gatekeeper',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        count() AS total,
        ROUND(100.0 * countIf(encrypted = '1') / count(), 0) AS encrypted_pct,
        ROUND(100.0 * countIf(firewall = '1') / count(), 0) AS firewall_pct,
        ROUND(100.0 * countIf(sip = '1') / count(), 0) AS sip_pct,
        ROUND(100.0 * countIf(gatekeeper = '1') / count(), 0) AS gatekeeper_pct
      FROM (
        SELECT
          host_identifier,
          argMax(disk_encrypted, event_time) AS encrypted,
          argMax(firewall_enabled, event_time) AS firewall,
          argMax(sip_enabled, event_time) AS sip,
          argMax(gatekeeper_enabled, event_time) AS gatekeeper
        FROM dex_security_posture
        WHERE {{TIME_FILTER}} {{FILTERS}}
        GROUP BY host_identifier
      )
    `,
  },
  {
    name: 'security.stats',
    domain: 'security',
    description: 'Security counts: total devices, encrypted, firewall, SIP, secure boot',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        COUNT(DISTINCT host_identifier) AS total,
        SUM(toUInt8(encrypted = '1')) AS encrypted,
        SUM(toUInt8(secure_boot = '1')) AS secure_boot,
        SUM(toUInt8(firewall = '1')) AS firewall,
        SUM(toUInt8(sip = '1')) AS sip
      FROM (
        SELECT
          host_identifier,
          argMax(disk_encrypted, event_time) AS encrypted,
          argMax(secure_boot_enabled, event_time) AS secure_boot,
          argMax(firewall_enabled, event_time) AS firewall,
          argMax(sip_enabled, event_time) AS sip
        FROM dex_security_posture
        WHERE {{TIME_FILTER}} {{FILTERS}}
        GROUP BY host_identifier
      )
    `,
  },
  {
    name: 'security.posture',
    domain: 'security',
    description: 'Per-device security posture table',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      SELECT
        s.host_identifier,
        d.hostname,
        s.os_version,
        if(s.encrypted = '1', 'Yes', 'No') AS encrypted,
        s.encryption_type,
        if(s.firewall = '1', 'Yes', 'No') AS firewall,
        if(s.sip = '1', 'Yes', 'No') AS sip,
        if(s.gatekeeper = '1', 'Yes', 'No') AS gatekeeper,
        formatDateTime(s.last_seen, '%Y-%m-%d %H:%M') AS last_seen
      FROM (
        SELECT
          host_identifier,
          argMax(os_version, event_time) AS os_version,
          argMax(disk_encrypted, event_time) AS encrypted,
          argMax(encryption_type, event_time) AS encryption_type,
          argMax(firewall_enabled, event_time) AS firewall,
          argMax(sip_enabled, event_time) AS sip,
          argMax(gatekeeper_enabled, event_time) AS gatekeeper,
          max(event_time) AS last_seen
        FROM dex_security_posture
        WHERE {{TIME_FILTER}} {{FILTERS}}
        GROUP BY host_identifier
      ) s
      LEFT JOIN dex_devices d ON s.host_identifier = d.host_identifier
      ORDER BY d.hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'security.status_table',
    domain: 'security',
    description: 'Security status per device (for Dashboard security section)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        d.hostname,
        s.os_platform,
        s.os_version,
        s.disk_encrypted,
        s.secure_boot_enabled,
        formatDateTime(s.event_time, '%Y-%m-%d %H:%M') AS event_time
      FROM dex_security_posture s
      LEFT JOIN dex_devices d ON s.host_identifier = d.host_identifier
      WHERE (s.host_identifier, s.event_time) IN (
        SELECT host_identifier, MAX(event_time)
        FROM dex_security_posture
        WHERE {{TIME_FILTER}} {{FILTERS}}
        GROUP BY host_identifier
      )
      ORDER BY d.hostname
      LIMIT 200
    `,
  },
  {
    name: 'security.encryption_breakdown',
    domain: 'security',
    description: 'Encryption status breakdown (type or Not Encrypted)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        if(argMax(disk_encrypted, event_time) = '1',
          argMax(encryption_type, event_time),
          'Not Encrypted'
        ) AS status,
        count() AS count
      FROM dex_security_posture
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY host_identifier
    `,
  },
  {
    name: 'security.os_versions',
    domain: 'security',
    description: 'OS version distribution from security posture data',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        argMax(os_version, event_time) AS os_version,
        count() AS count
      FROM dex_security_posture
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY host_identifier
    `,
  },
  {
    name: 'security.device_posture',
    domain: 'security',
    description: 'Single device latest security posture (drill-down)',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        argMax(disk_encrypted, event_time) AS encrypted,
        argMax(firewall_enabled, event_time) AS firewall,
        argMax(sip_enabled, event_time) AS sip,
        argMax(gatekeeper_enabled, event_time) AS gatekeeper,
        argMax(secure_boot_enabled, event_time) AS secure_boot
      FROM dex_security_posture
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY host_identifier
    `,
  },
  {
    name: 'security.compliance',
    domain: 'security',
    description: 'Compliance percentages for Experience Score signal details',
    params: [],
    sql: `
      SELECT
        countIf(disk_encrypted = '1') * 100.0 / count() AS pct_encrypted,
        countIf(firewall_enabled = '1') * 100.0 / count() AS pct_firewall,
        countIf(sip_enabled = '1') * 100.0 / count() AS pct_sip,
        countIf(gatekeeper_enabled = '1') * 100.0 / count() AS pct_gatekeeper
      FROM (
        SELECT host_identifier,
          argMax(disk_encrypted, event_time) AS disk_encrypted,
          argMax(firewall_enabled, event_time) AS firewall_enabled,
          argMax(sip_enabled, event_time) AS sip_enabled,
          argMax(gatekeeper_enabled, event_time) AS gatekeeper_enabled
        FROM dex_security_posture
        WHERE event_time >= now() - INTERVAL 24 HOUR
        GROUP BY host_identifier
      )
    `,
  },
]
