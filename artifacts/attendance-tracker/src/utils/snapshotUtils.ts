import { storageSetItem, storageRemoveItem } from '@/lib/idb';

export interface Snapshot {
  id: string;
  timestamp: string;
  label: string;
  data: Record<string, string>;
}

const SNAPSHOTS_KEY = 'attendenz_snapshots_v1';
const MAX_SNAPSHOTS = 5;

// Keys to preserve during Cache Clear
const DATA_KEYS_TO_KEEP = [
  'attendenz_snapshots_v1',
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
 * Capture a snapshot of current local storage state
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

    const newSnapshot: Snapshot = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString(),
      label,
      data
    };

    const updated = [newSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
    storageSetItem(SNAPSHOTS_KEY, JSON.stringify(updated));
  } catch (err) {
     // console.error('Failed to create snapshot:', err);
  }
}

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
 * Restore a specific snapshot
 */
export function restoreSnapshot(snapshotId: string): boolean {
  try {
    const snapshots = getSnapshots();
    const target = snapshots.find(s => s.id === snapshotId);
    if (!target) return false;

    Object.entries(target.data).forEach(([k, v]) => {
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
    if (key && !DATA_KEYS_TO_KEEP.includes(key) && !key.startsWith('attendenz_') && !key.startsWith('att_')) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(k => {
    storageRemoveItem(k);
    clearedCount++;
  });

  return clearedCount;
}


/**
 * Automatically create a daily snapshot in the background on app open
 */
export function autoSnapshotOnLoad(): void {
  try {
    const LAST_AUTO_KEY = 'attendenz_last_auto_snapshot_date';
    const today = new Date().toLocaleDateString();
    const lastAuto = localStorage.getItem(LAST_AUTO_KEY);

    if (lastAuto !== today) {
      createSnapshot(`Auto Backup (${today})`);
      storageSetItem(LAST_AUTO_KEY, today);
    }
  } catch (err) {
     // console.error('Failed background auto-snapshot:', err);
  }
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

    const dateStr = new Date().toISOString().split("T")[0];
    const blob = new Blob([jsonData], { type: "application/json" });
    const filename = `attendenz_backup_${dateStr}.json`;
    const file = new File([blob], filename, { type: "application/json" });

    // iOS PWA Share Sheet Fix for File Backup
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: "Attendenz Backup",
        text: "Backup file for Attendenz-Tracker",
      }).catch(err => {
        if (err.name !== "AbortError") console.error("Share failed:", err);
      });
    } else {
      // Desktop fallback
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
    const dateStr = new Date().toISOString().split('T')[0];
    const file = new File([blob], `attendenz_backup_${dateStr}.json`, { type: 'application/json' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Attendenz Tracker Backup',
        text: 'Here is my Attendenz Tracker app data backup.',
        files: [file]
      });
      return true;
    } else {
      // Fallback
      exportDataAsJSON();
      return true;
    }
  } catch (err) {
     // console.error('Failed to share:', err);
    return false;
  }
}

/**
 * Import and restore data from an uploaded JSON file to IndexedDB and LocalStorage
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

      // Restore items safely to IndexedDB and LocalStorage
      for (const [key, value] of Object.entries(parsedData)) {
        if (value !== null && value !== undefined) {
          const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
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
