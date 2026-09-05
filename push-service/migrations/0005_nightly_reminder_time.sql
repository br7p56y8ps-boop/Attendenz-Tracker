ALTER TABLE devices ADD COLUMN nightly_reminder_time TEXT NOT NULL DEFAULT '23:30';

UPDATE devices
SET nightly_reminder_time = '23:30'
WHERE nightly_reminder_time IS NULL OR nightly_reminder_time = '';

-- Existing devices retain their prior notification behavior except that the
-- nightly batch now has an explicit, validated local-time trigger.

