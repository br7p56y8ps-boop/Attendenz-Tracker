PRAGMA defer_foreign_keys=ON;

CREATE TABLE occurrences_backup AS
SELECT
  occurrence_id, device_id, local_date, start_minute, subject_label, category,
  needs_attention, attention_level, attendance_marked, status, end_minute,
  is_final_for_subject, created_at
FROM occurrences;

CREATE TABLE deliveries_backup AS
SELECT
  delivery_key, device_id, sent_at, push_message_id
FROM deliveries;

DROP TABLE occurrences;
DROP TABLE deliveries;

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

CREATE TABLE occurrences (
  occurrence_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  start_minute INTEGER NOT NULL,
  subject_label TEXT NOT NULL,
  category TEXT NOT NULL,
  needs_attention INTEGER NOT NULL DEFAULT 0,
  attention_level TEXT NOT NULL DEFAULT 'onTrack',
  attendance_marked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unmarked',
  end_minute INTEGER NOT NULL DEFAULT 0,
  is_final_for_subject INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, occurrence_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

INSERT INTO occurrences (
  occurrence_id, device_id, local_date, start_minute, subject_label, category,
  needs_attention, attention_level, attendance_marked, status, end_minute,
  is_final_for_subject, created_at
)
SELECT
  occurrence_id, device_id, local_date, start_minute, subject_label, category,
  needs_attention, attention_level, attendance_marked, status, end_minute,
  is_final_for_subject, created_at
FROM occurrences_backup;

CREATE INDEX occurrences_due_idx
  ON occurrences (device_id, local_date, start_minute);

CREATE TABLE deliveries (
  delivery_key TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  push_message_id TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

INSERT INTO deliveries (delivery_key, device_id, sent_at, push_message_id)
SELECT delivery_key, device_id, sent_at, push_message_id
FROM deliveries_backup;

CREATE INDEX deliveries_device_idx
  ON deliveries (device_id, sent_at);

DROP TABLE occurrences_backup;
DROP TABLE deliveries_backup;

PRAGMA defer_foreign_keys=OFF;
