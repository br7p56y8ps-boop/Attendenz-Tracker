ALTER TABLE devices ADD COLUMN block_placement_reminder_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN block_reminder_id TEXT;
ALTER TABLE devices ADD COLUMN block_reminder_date TEXT;
ALTER TABLE devices ADD COLUMN block_reminder_end_date TEXT;
ALTER TABLE devices ADD COLUMN block_reminder_label TEXT;
