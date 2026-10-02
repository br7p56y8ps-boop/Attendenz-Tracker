PRAGMA defer_foreign_keys=ON;
ALTER TABLE occurrences ADD COLUMN is_final_for_subject INTEGER NOT NULL DEFAULT 0;
PRAGMA defer_foreign_keys=OFF;
