import { idbGetAllChecked, storageClearChecked, storageCommitChecked, storageRemoveItem, storageRemoveItemChecked, flushStorageWrites, INSTALLATION_METADATA_KEYS } from '@/lib/idb';
import { getActiveCurriculumName } from '@/lib/curriculumStore';
import { APP_VERSION } from '@/lib/appVersion';
import { assertBackupSize, filterStoredData, makeBackupEnvelope, validateBackupPayload, MAX_BACKUP_BYTES } from '@/utils/dataTransferSecurity';

export interface Snapshot {
  id: string;
  timestamp: string;
  label: string;
  data: Record<string, string>;
}

const SNAPSHOTS_KEY = 'attendenz_snapshots_v1';
const MAX_SNAPSHOTS = 5;
const RESTORE_PRESERVED_KEYS = [
  ...INSTALLATION_METADATA_KEYS,
  SNAPSHOTS_KEY,
  'att_auth',
  'att_session',
  'att_idb_migrated_v1',
];

async function collectUserData(includeSnapshots = false): Promise<Record<string, string>> {
  const localData: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value !== null) localData[key] = value;
    }
  }

  await flushStorageWrites();
  const indexedData = await idbGetAllChecked();
  const data = { ...filterStoredData(localData), ...filterStoredData(indexedData) };
  if (!includeSnapshots) delete data[SNAPSHOTS_KEY];
  return data;
}

/**
 * Format date strictly as dd/mm/yy (e.g., 26/07/26)
 */
export function formatDateDDMMYY(d: Date = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

// Keys to preserve during Cache Clear
const DATA_KEYS_TO_KEEP = [
  'attendenz_snapshots_v1',
  'attendance_tracker_subjects',
  'attendance_tracker_ward',
  'attendance_tracker_home_selections',
  'attendance_tracker_preferred_percentage',
  'attendance_data',
  'custom_subjects',
  'custom_wards',
  'subject_mode',
  'preferred_percentage',
  'user_profile',
  'att_auth',
  'att_setup_done',
  'att_subject_mode',
  'att_home_selections',
  'att_custom_subjects',
  'att_custom_wards',
  'att_timetable',
  'att_ward_schedule',
  'att_history',
  'att_last_active_at',
  'att_profile_image'
];

/**
 * Get all saved snapshots
 */
export function getSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Capture a snapshot of current storage state
 */
export async function createSnapshot(label: string = 'Auto Snapshot'): Promise<boolean> {
  try {
    const snapshots = getSnapshots();
    const data = await collectUserData();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newSnapshot: Snapshot = {
      id: Date.now().toString(),
      timestamp: `${formatDateDDMMYY()} ${timeStr}`,
      label: `${getActiveCurriculumName()} — ${label}`,
      data,
    };

    const updated = [newSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
    const jsonStr = JSON.stringify(updated);
    await storageCommitChecked([[SNAPSHOTS_KEY, jsonStr]]);
    return true;
  } catch (err) {
    // Callers can decide whether a safety-critical operation should proceed.
    return false;
  }
}

/**
 * Triggered when all cards for today are marked.
 * Updates today's existing snapshot in-place if edited later in the day.
 */
export async function snapshotDayComplete(isComplete: boolean): Promise<boolean> {
  try {
    const todayStr = formatDateDDMMYY();
      const label = `${getActiveCurriculumName()} — Day Complete (${todayStr})`;
    const LAST_DAY_COMPLETE_KEY = 'attendenz_last_day_complete_date';

    if (isComplete) {
      const snapshots = getSnapshots();
      const data = await collectUserData();

      // Find if today's snapshot already exists
      const existingIndex = snapshots.findIndex(s => s.label === label);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const updatedSnapshot: Snapshot = {
        id: existingIndex !== -1 ? snapshots[existingIndex].id : Date.now().toString(),
        timestamp: `${todayStr} ${timeStr}`,
        label,
        data
      };

      let updated: Snapshot[];
      if (existingIndex !== -1) {
        // Update in-place with latest corrected totals
        updated = [...snapshots];
        updated[existingIndex] = updatedSnapshot;
      } else {
        // Prepend new snapshot and enforce 5-item cap
        updated = [updatedSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
      }

      const jsonStr = JSON.stringify(updated);
    await storageCommitChecked([[SNAPSHOTS_KEY, jsonStr], [LAST_DAY_COMPLETE_KEY, todayStr]]);
    } else {
      // Unmarked a card - clear completion flag
      await storageRemoveItemChecked(LAST_DAY_COMPLETE_KEY);
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Pre-edit backup trigger before major actions (resetting, deleting subjects)
 */
export async function snapshotBeforeEdit(actionName: string): Promise<boolean> {
  return createSnapshot(`Pre-Edit (${actionName})`);
}

/**
 * Prepare environment before restoring data:
 * - Creates a safety snapshot of current state
 * - Clears mode-specific attendance keys to avoid stale conflicts
 * - Removes mode-separation flag so migration can run again on next load
 */
async function prepareRestoreEnvironment(): Promise<boolean> {
  try {
    await flushStorageWrites();
    return await createSnapshot('Pre-Restore Safety');
  } catch {
    return false;
  }
}

/**
 * Restore a specific snapshot directly to localStorage and IndexedDB
 */
export async function restoreSnapshot(snapshotId: string): Promise<boolean> {
  try {
    const snapshots = getSnapshots();
    const target = snapshots.find(s => s.id === snapshotId);
    if (!target) return false;

    // Clear mode-specific keys only after a safety snapshot succeeds.
    if (!await prepareRestoreEnvironment()) return false;

    const entries = Object.entries(target.data);
    await storageClearChecked(RESTORE_PRESERVED_KEYS);
    await storageCommitChecked([...entries, ['att_app_version', APP_VERSION]]);

    await flushStorageWrites();
    // Force startup migration after any snapshot restore, including newer snapshots.
    const migrationFlags = ['att_mode_separation_done_v1', 'att_attendance_id_migration_v2_done_preloaded', 'att_attendance_id_migration_v2_done_custom'];
    for (const key of migrationFlags) await storageRemoveItemChecked(key);

    return true;
  } catch (err) {
     // console.error('Failed to restore snapshot:', err);
    return false;
  }
}

/**
 * Clear temporary cache without losing core app data or snapshots
 */
export function clearLocalCache(): number {
  let clearedCount = 0;
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key && 
      !DATA_KEYS_TO_KEEP.includes(key) && 
      !key.startsWith('attendenz_') && 
      !key.startsWith('att_') && 
      !key.startsWith('attendance_tracker_')
    ) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(k => {
    localStorage.removeItem(k);
    storageRemoveItem(k);
    clearedCount++;
  });

  return clearedCount;
}

/**
 * App launch auto-snapshot is disabled (snapshots trigger on Day Complete & Pre-Edits only)
 */
export function autoSnapshotOnLoad(): void {
  // Intentionally empty
}

/**
 * Export all localStorage & IndexedDB data as a downloadable JSON file
 */
export async function exportDataAsJSON(returnData: boolean = false): Promise<string | boolean> {
  try {
    const backupData = await collectUserData(true);
    const jsonData = JSON.stringify(makeBackupEnvelope(backupData), null, 2);
    if (returnData) return jsonData;

    const dateStr = formatDateDDMMYY().replace(/\//g, '-');
    const blob = new Blob([jsonData], { type: 'application/json' });
    const filename = `attendenz_backup_${dateStr}.json`;
    const file = new File([blob], filename, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Attendenz Backup',
        text: 'Backup file for Attendenz-Tracker',
      });
    } else {
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', url);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
    }
    return true;
  } catch (err) {
    return false;
  }
}

export async function shareDataAsJSON(): Promise<boolean> {
  try {
    const exported = await exportDataAsJSON(true);
    if (typeof exported !== 'string') return false;
    const blob = new Blob([exported], { type: 'application/json' });
    const dateStr = formatDateDDMMYY().replace(/\//g, '-');
    const file = new File([blob], `attendenz_backup_${dateStr}.json`, { type: 'application/json' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Attendenz Tracker Backup',
        text: 'Here is my Attendenz Tracker app data backup.',
        files: [file]
      });
      return true;
    } else {
      return await exportDataAsJSON() === true;
    }
  } catch (err) {
     // console.error('Failed to share:', err);
    return false;
  }
}

/**
 * Import and restore data from an uploaded JSON file
 */
export function importDataFromJSON(file: File, callback: (success: boolean) => void): void {
  if (file.size > MAX_BACKUP_BYTES) { callback(false); return; }
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const content = event.target?.result as string;
      assertBackupSize(content);
      const parsedData = JSON.parse(content);
      const validatedData = validateBackupPayload(parsedData);

      // Validate the complete payload before preparing or writing any current data.
      if (!await prepareRestoreEnvironment()) {
        callback(false);
        return;
      }

      await flushStorageWrites();
      const entries = Object.entries(validatedData);
      await storageClearChecked(RESTORE_PRESERVED_KEYS);
      await storageCommitChecked([...entries, ['att_app_version', APP_VERSION]]);

      // Force startup migration after any uploaded backup restore.
      const migrationFlags = ['att_mode_separation_done_v1', 'att_attendance_id_migration_v2_done_preloaded', 'att_attendance_id_migration_v2_done_custom'];
      for (const key of migrationFlags) await storageRemoveItemChecked(key);

      callback(true);
    } catch (err) {
       // console.error('Failed to parse backup file:', err);
      callback(false);
    }
  };
  reader.onerror = () => callback(false);
  reader.readAsText(file);
}
