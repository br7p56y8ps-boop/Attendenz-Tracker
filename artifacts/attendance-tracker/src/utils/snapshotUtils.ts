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
  'user_profile'
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
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to create snapshot:', err);
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
      localStorage.setItem(k, v);
    });

    return true;
  } catch (err) {
    console.error('Failed to restore snapshot:', err);
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
    if (key && !DATA_KEYS_TO_KEEP.includes(key) && !key.startsWith('attendenz_')) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(k => {
    localStorage.removeItem(k);
    clearedCount++;
  });

  return clearedCount;
}
