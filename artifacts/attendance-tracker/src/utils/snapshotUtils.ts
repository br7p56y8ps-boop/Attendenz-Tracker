import { idbRemove, idbSet, storageSetItem, storageRemoveItem } from '@/lib/idb';

import { CURRICULUM_KEYS, getActiveCurriculumName } from '@/lib/curriculumStore';

export interface Snapshot {
  id: string;
  timestamp: string;
  label: string;
  data: Record<string, string>;
}

const SNAPSHOTS_KEY = 'attendenz_snapshots_v1';
const MAX_SNAPSHOTS = 5;

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
export function createSnapshot(label: string = 'Auto Snapshot'): void {
  try {
    const snapshots = getSnapshots();
    const data: Record<string, string> = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !key.startsWith('attendenz_snapshots')) {
        const val = localStorage.getItem(key);
        if (val !== null) data[key] = val;
      }
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newSnapshot: Snapshot = {
      id: Date.now().toString(),
      timestamp: `${formatDateDDMMYY()} ${timeStr}`,
      label: `${getActiveCurriculumName()} — ${label}`,
      data
    };

    const updated = [newSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
    const jsonStr = JSON.stringify(updated);

    localStorage.setItem(SNAPSHOTS_KEY, jsonStr);
    storageSetItem(SNAPSHOTS_KEY, jsonStr);
  } catch (err) {
     // console.error('Failed to create snapshot:', err);
  }
}

/**
 * Triggered when all cards for today are marked.
 * Updates today's existing snapshot in-place if edited later in the day.
 */
export function snapshotDayComplete(isComplete: boolean): void {
  try {
    const todayStr = formatDateDDMMYY();
      const label = `${getActiveCurriculumName()} — Day Complete (${todayStr})`;
    const LAST_DAY_COMPLETE_KEY = 'attendenz_last_day_complete_date';

    if (isComplete) {
      const snapshots = getSnapshots();
      const data: Record<string, string> = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !key.startsWith('attendenz_snapshots')) {
          const val = localStorage.getItem(key);
          if (val !== null) data[key] = val;
        }
      }

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
      localStorage.setItem(SNAPSHOTS_KEY, jsonStr);
      storageSetItem(SNAPSHOTS_KEY, jsonStr);
      localStorage.setItem(LAST_DAY_COMPLETE_KEY, todayStr);
      storageSetItem(LAST_DAY_COMPLETE_KEY, todayStr);
    } else {
      // Unmarked a card - clear completion flag
      localStorage.removeItem(LAST_DAY_COMPLETE_KEY);
      storageRemoveItem(LAST_DAY_COMPLETE_KEY);
    }
  } catch (err) {
     // console.error('Failed day-complete snapshot:', err);
  }
}

/**
 * Pre-edit backup trigger before major actions (resetting, deleting subjects)
 */
export function snapshotBeforeEdit(actionName: string): void {
  try {
    createSnapshot(`Pre-Edit (${actionName})`);
  } catch (err) {
     // console.error('Failed pre-edit snapshot:', err);
  }
}

/**
 * Prepare environment before restoring data:
 * - Creates a safety snapshot of current state
 * - Clears mode-specific attendance keys to avoid stale conflicts
 * - Removes mode-separation flag so migration can run again on next load
 */
async function prepareRestoreEnvironment(): Promise<void> {
  try {
    createSnapshot('Pre-Restore Safety');

    const MODE_SPECIFIC_ATTENDANCE_KEYS = [
      'attendance_tracker_subjects', 'attendance_tracker_ward', 'attendance_tracker_home_selections', 'attendance_tracker_finished_map',
      'attendance_tracker_subjects_preset', 'attendance_tracker_ward_preset', 'attendance_tracker_home_selections_preset', 'attendance_tracker_finished_map_preset',
      'attendance_tracker_subjects_custom', 'attendance_tracker_ward_custom', 'attendance_tracker_home_selections_custom', 'attendance_tracker_finished_map_custom',
      'att_attendance_id_migration_v2_done_preloaded',       'att_attendance_id_migration_v2_done_custom',
      'att_mode_separation_done_v1',
      CURRICULUM_KEYS.CURRICULA_KEY,
      CURRICULUM_KEYS.ACTIVE_CURRICULUM_KEY,
      CURRICULUM_KEYS.CURRICULUM_MIGRATION_KEY,
    ];

    await Promise.all(MODE_SPECIFIC_ATTENDANCE_KEYS.map(async key => {
      localStorage.removeItem(key);
      await idbRemove(key);
    }));

    localStorage.removeItem('att_mode_separation_done_v1');
    await idbRemove('att_mode_separation_done_v1');
  } catch (err) {
     // console.error('Failed to prepare restore environment:', err);
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

    // Clear mode-specific keys and remove migration flag first
    await prepareRestoreEnvironment();

    await Promise.all(Object.entries(target.data).map(async ([k, v]) => {
      localStorage.setItem(k, v);
      await idbSet(k, v);
    }));

    // Force startup migration after any snapshot restore, including newer snapshots.
    for (const flag of ['att_mode_separation_done_v1', 'att_attendance_id_migration_v2_done_preloaded', 'att_attendance_id_migration_v2_done_custom']) {
      localStorage.removeItem(flag);
      await idbRemove(flag);
    }

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
export function exportDataAsJSON(returnData: boolean = false): string | void {
  try {
    const backupData: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        backupData[key] = localStorage.getItem(key) || '';
      }
    }
    
    const jsonData = JSON.stringify(backupData, null, 2);
    if (returnData) {
      return jsonData;
    }

    const dateStr = formatDateDDMMYY().replace(/\//g, '-');
    const blob = new Blob([jsonData], { type: "application/json" });
    const filename = `attendenz_backup_${dateStr}.json`;
    const file = new File([blob], filename, { type: "application/json" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: "Attendenz Backup",
        text: "Backup file for Attendenz-Tracker",
      }).catch(err => {
        if (err.name !== "AbortError") console.error("Share failed:", err);
      });
    } else {
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", url);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
     // console.error('Failed to export JSON backup:', err);
    import("sonner").then(({ toast }) => toast.info('Failed to export data backup.'));
  }
}

export async function shareDataAsJSON(): Promise<boolean> {
  try {
    const jsonData = exportDataAsJSON(true) as string;
    const blob = new Blob([jsonData], { type: 'application/json' });
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
      exportDataAsJSON();
      return true;
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
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const content = event.target?.result as string;
      const parsedData = JSON.parse(content);
      
      if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
        throw new Error('Invalid backup file format.');
      }

      // Prepare environment: safety snapshot, clear mode-specific keys, remove migration flag
      await prepareRestoreEnvironment();

      await Promise.all(Object.entries(parsedData).map(async ([key, value]) => {
        if (value !== null && value !== undefined) {
          const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, stringVal);
          await idbSet(key, stringVal);
        }
      }));

      // Force startup migration after any uploaded backup restore.
      for (const flag of ['att_mode_separation_done_v1', 'att_attendance_id_migration_v2_done_preloaded', 'att_attendance_id_migration_v2_done_custom']) {
        localStorage.removeItem(flag);
        await idbRemove(flag);
      }

      callback(true);
    } catch (err) {
       // console.error('Failed to parse backup file:', err);
      callback(false);
    }
  };
  reader.onerror = () => callback(false);
  reader.readAsText(file);
}