import { storageSetItem, storageRemoveItem } from '@/lib/idb';

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
      label,
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
    const label = `Day Complete (${todayStr})`;
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
 * Restore a specific snapshot directly to localStorage and IndexedDB
 */
export function restoreSnapshot(snapshotId: string): boolean {
  try {
    const snapshots = getSnapshots();
    const target = snapshots.find(s => s.id === snapshotId);
    if (!target) return false;

    Object.entries(target.data).forEach(([k, v]) => {
      localStorage.setItem(k, v);
      storageSetItem(k, v);
    });

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
  reader.onload = (event) => {
    try {
      const content = event.target?.result as string;
      const parsedData = JSON.parse(content);
      
      if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) {
        throw new Error('Invalid backup file format.');
      }

      snapshotBeforeEdit('Before File Import');

      for (const [key, value] of Object.entries(parsedData)) {
        if (value !== null && value !== undefined) {
          const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, stringVal);
          storageSetItem(key, stringVal);
        }
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
