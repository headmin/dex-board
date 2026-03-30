-- =============================================================================
-- DEX Experience Score Materialized Views
-- Computes 5 category scores + weighted composite from existing telemetry tables
-- Triggers on inserts to dex_device_health_mat (most frequent telemetry source)
-- =============================================================================

-- ─── Scoring MV: dex_device_health_mat inserts → dex_device_scores_hourly ─────
CREATE MATERIALIZED VIEW IF NOT EXISTS fleet_logs.dex_device_scores_mv
TO fleet_logs.dex_device_scores_hourly AS
WITH
    -- ─── Latest device health for each device in this hour ─────
    health AS (
        SELECT
            host_identifier,
            hostname,
            os_name,
            hardware_model,
            toFloat32OrZero(memory_percent) AS mem_pct,
            toFloat32OrZero(disk_percent) AS disk_pct,
            toFloat32OrZero(disk_total_gb) AS disk_total,
            toFloat32OrZero(uptime_days) AS uptime,
            toFloat32OrZero(memory_total_gb) AS ram_gb,
            event_time
        FROM fleet_logs.dex_device_health_mat
        WHERE event_time >= now() - INTERVAL 2 HOUR
        ORDER BY event_time DESC
        LIMIT 1 BY host_identifier
    ),
    -- ─── Top process pressure per device ──────────────────────
    procs AS (
        SELECT
            host_identifier,
            sum(toFloat32OrZero(memory_mb)) AS top5_mb
        FROM (
            SELECT host_identifier, memory_mb
            FROM fleet_logs.dex_top_processes_mat
            WHERE event_time >= now() - INTERVAL 2 HOUR
            ORDER BY event_time DESC, toFloat32OrZero(memory_mb) DESC
            LIMIT 5 BY host_identifier
        )
        GROUP BY host_identifier
    ),
    -- ─── Latest security posture per device ───────────────────
    sec AS (
        SELECT
            host_identifier,
            disk_encrypted,
            firewall_enabled,
            sip_enabled,
            gatekeeper_enabled,
            os_version
        FROM fleet_logs.dex_security_posture_mat
        WHERE event_time >= now() - INTERVAL 24 HOUR
        ORDER BY event_time DESC
        LIMIT 1 BY host_identifier
    ),
    -- ─── Latest network quality per device ────────────────────
    net AS (
        SELECT
            host_identifier,
            toFloat32OrZero(wifi_rssi) AS rssi,
            toFloat32OrZero(wifi_noise) AS noise,
            toFloat32OrZero(wifi_transmit_rate) AS tx_rate
        FROM fleet_logs.dex_network_quality
        WHERE event_time >= now() - INTERVAL 2 HOUR
        ORDER BY event_time DESC
        LIMIT 1 BY host_identifier
    ),
    -- ─── App count per device ─────────────────────────────────
    apps AS (
        SELECT
            host_identifier,
            uniqExact(app_name) AS app_count
        FROM fleet_logs.dex_app_inventory
        WHERE event_time >= now() - INTERVAL 24 HOUR
        GROUP BY host_identifier
    ),
    -- ─── Browser extension count per device ───────────────────
    exts AS (
        SELECT
            host_identifier,
            uniqExact(extension_name) AS ext_count
        FROM fleet_logs.dex_browser_extensions
        WHERE event_time >= now() - INTERVAL 24 HOUR
        GROUP BY host_identifier
    )
SELECT
    toStartOfHour(h.event_time) AS hour,
    h.host_identifier,
    h.hostname,
    0 AS team_id,
    h.os_name,
    h.hardware_model,
    -- RAM tier classification
    multiIf(
        h.ram_gb >= 64, '64GB+',
        h.ram_gb >= 32, '32GB',
        h.ram_gb >= 16, '16GB',
        '8GB'
    ) AS ram_tier,

    -- ═══ DEVICE HEALTH SCORE (0-100) ═══
    -- Device age: not available from telemetry, use 80 as default (assume 2-3yr)
    -- Disk capacity: 33% weight
    -- Battery: not consistently available, skip
    -- Simplified: disk_total (50%) + default_age (50%)
    toFloat32(
        0.5 * multiIf(
            h.disk_total >= 512, 100,
            h.disk_total >= 256, 70,
            40
        )
        + 0.5 * 80
    ) AS device_health_score,

    -- ═══ PERFORMANCE SCORE (0-100) ═══
    toFloat32(
        0.35 * multiIf(
            h.mem_pct < 60, 100,
            h.mem_pct < 75, 80,
            h.mem_pct < 85, 60,
            h.mem_pct < 95, 40,
            20
        )
        + 0.30 * multiIf(
            h.disk_pct < 70, 100,
            h.disk_pct < 80, 80,
            h.disk_pct < 90, 60,
            h.disk_pct < 95, 40,
            20
        )
        + 0.20 * multiIf(
            isNull(p.top5_mb) OR p.top5_mb < 2048, 100,
            p.top5_mb < 4096, 80,
            p.top5_mb < 6144, 60,
            40
        )
        + 0.15 * multiIf(
            h.uptime < 7, 100,
            h.uptime < 14, 80,
            h.uptime < 30, 60,
            30
        )
    ) AS performance_score,

    -- ═══ NETWORK SCORE (0-100) ═══
    toFloat32(
        IF(n.host_identifier != '',
            0.40 * multiIf(
                n.rssi > -50, 100,
                n.rssi > -60, 80,
                n.rssi > -70, 60,
                n.rssi > -80, 40,
                20
            )
            + 0.30 * multiIf(
                n.noise < -85, 100,
                n.noise < -75, 70,
                40
            )
            + 0.30 * multiIf(
                n.tx_rate > 400, 100,
                n.tx_rate > 200, 80,
                n.tx_rate > 100, 60,
                40
            ),
            -1
        )
    ) AS network_score,

    -- ═══ SECURITY SCORE (0-100) ═══
    toFloat32(
        IF(s.host_identifier != '',
            0.25 * IF(s.disk_encrypted = '1', 100, 0)
            + 0.25 * IF(s.firewall_enabled = '1', 100, 0)
            + 0.20 * IF(s.sip_enabled = '1', 100, 0)
            + 0.15 * IF(s.gatekeeper_enabled = '1', 100, 0)
            + 0.15 * 80,
            -1
        )
    ) AS security_score,

    -- ═══ SOFTWARE SCORE (0-100) ═══
    toFloat32(
        IF(a.host_identifier != '' OR e.host_identifier != '',
            0.50 * multiIf(
                isNull(a.app_count) OR a.app_count < 80, 100,
                a.app_count < 120, 80,
                a.app_count < 160, 60,
                40
            )
            + 0.50 * multiIf(
                isNull(e.ext_count) OR e.ext_count < 10, 100,
                e.ext_count < 20, 70,
                e.ext_count < 30, 50,
                20
            ),
            -1
        )
    ) AS software_score,

    -- ═══ COMPOSITE SCORE (weighted average — network excluded) ═══
    -- Weights: Performance 35%, Device Health 25%, Security 20%, Software 20%
    -- Network is tracked separately as informational — too volatile for scoring
    toFloat32(
        (
            0.25 * multiIf(h.disk_total >= 512, 100, h.disk_total >= 256, 70, 40) * 0.5 + 0.25 * 80 * 0.5
            + 0.35 * (
                0.35 * multiIf(h.mem_pct < 60, 100, h.mem_pct < 75, 80, h.mem_pct < 85, 60, h.mem_pct < 95, 40, 20)
                + 0.30 * multiIf(h.disk_pct < 70, 100, h.disk_pct < 80, 80, h.disk_pct < 90, 60, h.disk_pct < 95, 40, 20)
                + 0.20 * multiIf(isNull(p.top5_mb) OR p.top5_mb < 2048, 100, p.top5_mb < 4096, 80, p.top5_mb < 6144, 60, 40)
                + 0.15 * multiIf(h.uptime < 7, 100, h.uptime < 14, 80, h.uptime < 30, 60, 30)
            )
            + IF(s.host_identifier != '', 0.20 * (
                0.25 * IF(s.disk_encrypted = '1', 100, 0)
                + 0.25 * IF(s.firewall_enabled = '1', 100, 0)
                + 0.20 * IF(s.sip_enabled = '1', 100, 0)
                + 0.15 * IF(s.gatekeeper_enabled = '1', 100, 0)
                + 0.15 * 80
            ), 0)
            + IF(a.host_identifier != '' OR e.host_identifier != '', 0.20 * (
                0.50 * multiIf(isNull(a.app_count) OR a.app_count < 80, 100, a.app_count < 120, 80, a.app_count < 160, 60, 40)
                + 0.50 * multiIf(isNull(e.ext_count) OR e.ext_count < 10, 100, e.ext_count < 20, 70, e.ext_count < 30, 50, 20)
            ), 0)
        ) / (
            0.25 + 0.35
            + IF(s.host_identifier != '', 0.20, 0)
            + IF(a.host_identifier != '' OR e.host_identifier != '', 0.20, 0)
        )
    ) AS composite_score,

    -- ═══ COMPOSITE GRADE (with F-drag rule) ═══
    -- F-drag checks only scored categories (excludes network)
    multiIf(
        least(
            multiIf(h.disk_total >= 512, 100, h.disk_total >= 256, 70, 40) * 0.5 + 80 * 0.5,
            0.35 * multiIf(h.mem_pct < 60, 100, h.mem_pct < 75, 80, h.mem_pct < 85, 60, h.mem_pct < 95, 40, 20)
            + 0.30 * multiIf(h.disk_pct < 70, 100, h.disk_pct < 80, 80, h.disk_pct < 90, 60, h.disk_pct < 95, 40, 20)
            + 0.20 * multiIf(isNull(p.top5_mb) OR p.top5_mb < 2048, 100, p.top5_mb < 4096, 80, p.top5_mb < 6144, 60, 40)
            + 0.15 * multiIf(h.uptime < 7, 100, h.uptime < 14, 80, h.uptime < 30, 60, 30),
            IF(s.host_identifier != '',
                0.25 * IF(s.disk_encrypted = '1', 100, 0)
                + 0.25 * IF(s.firewall_enabled = '1', 100, 0)
                + 0.20 * IF(s.sip_enabled = '1', 100, 0)
                + 0.15 * IF(s.gatekeeper_enabled = '1', 100, 0)
                + 0.15 * 80,
                999),
            IF(a.host_identifier != '' OR e.host_identifier != '',
                0.50 * multiIf(isNull(a.app_count) OR a.app_count < 80, 100, a.app_count < 120, 80, a.app_count < 160, 60, 40)
                + 0.50 * multiIf(isNull(e.ext_count) OR e.ext_count < 10, 100, e.ext_count < 20, 70, e.ext_count < 30, 50, 20),
                999)
        ) < 40,
        -- Has an F category: drop composite grade by one level
        multiIf(
            composite_score >= 90, 'B',
            composite_score >= 75, 'C',
            composite_score >= 60, 'D',
            'F'
        ),
        -- Normal grading
        multiIf(
            composite_score >= 90, 'A',
            composite_score >= 75, 'B',
            composite_score >= 60, 'C',
            composite_score >= 40, 'D',
            'F'
        )
    ) AS composite_grade,

    -- ═══ LOWEST CATEGORY (excludes network — not scored) ═══
    multiIf(
        least(
            device_health_score,
            performance_score,
            IF(security_score >= 0, security_score, 999),
            IF(software_score >= 0, software_score, 999)
        ) = device_health_score, 'Device Health',
        least(
            device_health_score,
            performance_score,
            IF(security_score >= 0, security_score, 999),
            IF(software_score >= 0, software_score, 999)
        ) = performance_score, 'Performance',
        least(
            device_health_score,
            performance_score,
            IF(security_score >= 0, security_score, 999),
            IF(software_score >= 0, software_score, 999)
        ) = security_score AND security_score >= 0, 'Security',
        'Software'
    ) AS lowest_category,

    -- ═══ COUNT OF SCORED CATEGORIES WITH DATA (network excluded) ═══
    toUInt8(
        2  -- device_health + performance always available
        + IF(s.host_identifier != '', 1, 0)
        + IF(a.host_identifier != '' OR e.host_identifier != '', 1, 0)
    ) AS categories_with_data

FROM health h
LEFT JOIN procs p ON h.host_identifier = p.host_identifier
LEFT JOIN sec s ON h.host_identifier = s.host_identifier
LEFT JOIN net n ON h.host_identifier = n.host_identifier
LEFT JOIN apps a ON h.host_identifier = a.host_identifier
LEFT JOIN exts e ON h.host_identifier = e.host_identifier;

SELECT 'DEX score materialized views created successfully' as message;
