export const BACKUP_FORMAT = 'attendenz-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const EXCLUDED_KEYS = new Set([
  'att_auth',
  'att_session',
  'att_idb_migrated_v1',
  'att_curriculum_migration_v1_done',
  'att_mode_separation_done_v1',
  'att_attendance_id_migration_v2_done_preloaded',
  'att_attendance_id_migration_v2_done_custom',
  'att_pwa_build_revision',
  'att_pwa_release_type',
  'att_pwa_update_mode',
  'att_pwa_update_ready',
  'att_pwa_latest_version',
  'att_pwa_update_summary',
  'att_pending_update_restore',
  'att_just_updated',
  'att_app_version',
  'att_last_day_complete_date',
]);

const ALLOWED_EXACT_KEYS = new Set([
  'theme',
  'user_profile',
  'att_profile_image',
  'att_subject_mode',
  'att_custom_subjects',
  'att_custom_wards',
  'att_user_added_subjects',
  'att_preset_timetable',
  'att_preset_ward_schedule',
  'att_preset_subject_totals',
  'att_preset_subject_renames',
  'att_preset_ward_renames',
  'att_curricula_v1',
  'att_active_curriculum_id_v1',
  'att_manage_history',
  'att_history',
  'att_last_active_at',
  'att_setup_done',
  'att_has_seen_welcome_v1',
  'att_timetable',
  'att_ward_schedule',
  'att_curriculum_status',
  'attendenz_snapshots_v1',
  'attendance_data',
  'preferred_percentage',
  'custom_subjects',
  'custom_wards',
  'subject_mode',
  'att_feedback_vibration_v1',
  'att_feedback_vibration_style_v1',
  'att_feedback_sound_v1',
  'att_feedback_sound_volume_v1',
  'att_feedback_sound_style_v1',
  'att_system_notifications_enabled_v1',
  'att_system_notification_prefs_v1',
  'att_theme_preference_v1',
  'att_notification_preferences_v1',
]);

const ALLOWED_PREFIXES = [
  'attendance_tracker_',
  'att_curriculum_bundle_',
  'att_',
  'attendenz_',
];

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: Record<string, string>;
}

export function isAllowedBackupKey(key: string): boolean {
  if (!key || EXCLUDED_KEYS.has(key)) return false;
  return ALLOWED_EXACT_KEYS.has(key) || ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseStoredValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_BACKUP_BYTES) return null;
    return serialized;
  } catch {
    return null;
  }
}

export function makeBackupEnvelope(data: Record<string, string>): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function sanitizeSnapshotsValue(value: string): string | null {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const snapshots = parsed
      .filter(isPlainObject)
      .map(snapshot => {
        const rawData = isPlainObject(snapshot.data) ? snapshot.data : {};
        const nestedData: Record<string, string> = {};
        for (const [key, nestedValue] of Object.entries(rawData)) {
          if (key === 'attendenz_snapshots_v1' || !isAllowedBackupKey(key)) continue;
          const stringValue = parseStoredValue(nestedValue);
          if (stringValue !== null) nestedData[key] = stringValue;
        }
        return { ...snapshot, data: nestedData };
      });
    return JSON.stringify(snapshots);
  } catch {
    return null;
  }
}

export function validateBackupPayload(payload: unknown): Record<string, string> {
  if (!isPlainObject(payload)) throw new Error('Invalid backup file format.');

  const candidate = payload.format === BACKUP_FORMAT && isPlainObject(payload.data)
    ? payload.data
    : payload;

  if (!isPlainObject(candidate)) throw new Error('Invalid backup data.');

  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (!isAllowedBackupKey(key)) {
      throw new Error(`Unsupported backup field: ${key}`);
    }
    const stringValue = parseStoredValue(value);
    if (stringValue === null) throw new Error(`Invalid backup value: ${key}`);
    const safeValue = key === 'attendenz_snapshots_v1' ? sanitizeSnapshotsValue(stringValue) : stringValue;
    if (safeValue === null) throw new Error(`Invalid backup value: ${key}`);
    data[key] = safeValue;
  }

  if (Object.keys(data).length === 0) throw new Error('Backup contains no supported Attendenz data.');
  return data;
}

export function assertBackupSize(text: string): void {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) {
    throw new Error('Backup file is too large. Please choose a file under 5 MB.');
  }
}

export function filterStoredData(data: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => isAllowedBackupKey(key)));
}
