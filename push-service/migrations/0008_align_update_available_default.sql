PRAGMA foreign_keys=OFF;

CREATE TABLE devices_rebuilt (
  device_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  subscription_json TEXT NOT NULL,
  timezone TEXT NOT NULL,
  notifications_enabled INTEGER NOT NULL DEFAULT 0,
  midnight_need_attention INTEGER NOT NULL DEFAULT 1,
  final_class_today INTEGER NOT NULL DEFAULT 1,
  first_class_today INTEGER NOT NULL DEFAULT 0,
  pre_class_need_attention INTEGER NOT NULL DEFAULT 1,
  all_scheduled_digest INTEGER NOT NULL DEFAULT 0,
  lead_minutes INTEGER NOT NULL DEFAULT 30,
  nightly_reminder_time TEXT NOT NULL DEFAULT '23:30',
  need_attention_subjects INTEGER NOT NULL DEFAULT 1,
  safe_to_miss INTEGER NOT NULL DEFAULT 0,
  unmarked_attendance_today INTEGER NOT NULL DEFAULT 1,
  app_version TEXT NOT NULL DEFAULT 'unknown',
  update_available INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO devices_rebuilt (
  device_id, token_hash, subscription_json, timezone, notifications_enabled,
  midnight_need_attention, final_class_today, first_class_today, pre_class_need_attention,
  all_scheduled_digest, lead_minutes, nightly_reminder_time, need_attention_subjects,
  safe_to_miss, unmarked_attendance_today, app_version, update_available, last_sync_at, expires_at
)
SELECT
  device_id, token_hash, subscription_json, timezone, notifications_enabled,
  midnight_need_attention, final_class_today, first_class_today, pre_class_need_attention,
  all_scheduled_digest, lead_minutes, nightly_reminder_time, need_attention_subjects,
  safe_to_miss, unmarked_attendance_today, app_version, update_available, last_sync_at, expires_at
FROM devices;

DROP TABLE devices;
ALTER TABLE devices_rebuilt RENAME TO devices;
PRAGMA foreign_keys=ON;
