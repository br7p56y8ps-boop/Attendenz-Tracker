PRAGMA foreign_keys=OFF;

CREATE TABLE devices_direct (
  device_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  subscription_json TEXT,
  timezone TEXT NOT NULL,
  notifications_enabled INTEGER NOT NULL DEFAULT 0,
  midnight_need_attention INTEGER NOT NULL DEFAULT 1,
  final_class_today INTEGER NOT NULL DEFAULT 1,
  first_class_today INTEGER NOT NULL DEFAULT 0,
  pre_class_need_attention INTEGER NOT NULL DEFAULT 1,
  all_scheduled_digest INTEGER NOT NULL DEFAULT 0,
  lead_minutes INTEGER NOT NULL DEFAULT 30,
  last_sync_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO devices_direct (
  device_id, token_hash, subscription_json, timezone, notifications_enabled,
  midnight_need_attention, final_class_today, first_class_today,
  pre_class_need_attention, all_scheduled_digest, lead_minutes, last_sync_at, expires_at
)
SELECT device_id, token_hash, NULL, timezone, notifications_enabled,
  midnight_need_attention, final_class_today, first_class_today,
  pre_class_need_attention, all_scheduled_digest, lead_minutes, last_sync_at, expires_at
FROM devices;

DROP TABLE devices;
ALTER TABLE devices_direct RENAME TO devices;

CREATE TABLE deliveries_direct (
  delivery_key TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  push_message_id TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

INSERT INTO deliveries_direct (delivery_key, device_id, sent_at, push_message_id)
SELECT delivery_key, device_id, sent_at, COALESCE(onesignal_message_id, 'legacy')
FROM deliveries;

DROP TABLE deliveries;
ALTER TABLE deliveries_direct RENAME TO deliveries;

CREATE INDEX IF NOT EXISTS occurrences_due_idx
  ON occurrences (device_id, local_date, start_minute);
CREATE INDEX IF NOT EXISTS deliveries_device_idx
  ON deliveries (device_id, sent_at);

PRAGMA foreign_keys=ON;
