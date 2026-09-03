CREATE TABLE IF NOT EXISTS devices (
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
  need_attention_subjects INTEGER NOT NULL DEFAULT 1,
  safe_to_miss INTEGER NOT NULL DEFAULT 0,
  unmarked_attendance_today INTEGER NOT NULL DEFAULT 1,
  app_version TEXT NOT NULL DEFAULT '1.6.6',
  update_available INTEGER NOT NULL DEFAULT 1,
  last_sync_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS occurrences (
  occurrence_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  start_minute INTEGER NOT NULL,
  subject_label TEXT NOT NULL,
  category TEXT NOT NULL,
  needs_attention INTEGER NOT NULL DEFAULT 0,
  attention_level TEXT NOT NULL DEFAULT 'onTrack',
  attendance_marked INTEGER NOT NULL DEFAULT 0,
  end_minute INTEGER NOT NULL DEFAULT 0,
  is_final_for_subject INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, occurrence_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS occurrences_due_idx
  ON occurrences (device_id, local_date, start_minute);

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_key TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  push_message_id TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS deliveries_device_idx
  ON deliveries (device_id, sent_at);
