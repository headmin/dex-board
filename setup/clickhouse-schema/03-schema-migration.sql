-- =============================================================================
-- Schema Migration: Add structured columns to existing tables
-- This migration is idempotent — safe to run on both new and existing deployments.
-- =============================================================================

-- Add query_name and action columns to all log tables
ALTER TABLE fleet_logs.osquery_status_logs ADD COLUMN IF NOT EXISTS query_name LowCardinality(String) DEFAULT '';
ALTER TABLE fleet_logs.osquery_status_logs ADD COLUMN IF NOT EXISTS action LowCardinality(String) DEFAULT '';

ALTER TABLE fleet_logs.osquery_result_logs ADD COLUMN IF NOT EXISTS query_name LowCardinality(String) DEFAULT '';
ALTER TABLE fleet_logs.osquery_result_logs ADD COLUMN IF NOT EXISTS action LowCardinality(String) DEFAULT '';

ALTER TABLE fleet_logs.fleet_audit_logs ADD COLUMN IF NOT EXISTS query_name LowCardinality(String) DEFAULT '';
ALTER TABLE fleet_logs.fleet_audit_logs ADD COLUMN IF NOT EXISTS action LowCardinality(String) DEFAULT '';

ALTER TABLE fleet_logs.fleet_logs ADD COLUMN IF NOT EXISTS query_name LowCardinality(String) DEFAULT '';
ALTER TABLE fleet_logs.fleet_logs ADD COLUMN IF NOT EXISTS action LowCardinality(String) DEFAULT '';

SELECT 'Schema migration completed successfully' as message;
