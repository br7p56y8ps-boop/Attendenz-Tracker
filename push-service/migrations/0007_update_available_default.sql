-- Migration 0004 used DEFAULT 1. New syncs already write an explicit boolean;
-- normalize rows that were created without a known app version before syncing.
UPDATE devices
SET update_available = 0
WHERE app_version IS NULL OR app_version = '' OR app_version IN ('legacy', 'unknown');
