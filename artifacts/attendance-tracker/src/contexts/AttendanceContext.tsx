import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';
import { snapshotBeforeEdit, snapshotDayComplete } from '@/utils/snapshotUtils';

export type AttendanceData = { attended: number; missed: number };
export type SelectionType = 'off' | 'missed' | 'attended';

interface AttendanceContextType {
  subjects: Record<string, AttendanceData>;
  wards: Record<string, AttendanceData>;
  homeSelections: Record<string, SelectionType>;
  finishedMap: Record<string, boolean>;
  preferredPercentage: number;
  setPreferredPercentage: (p: number) => void;
  updateSubject: (subject: string, attended: number, missed: number) => void;
  updateWard: (ward: string, attended: number, missed: number) => void;
  toggleFinished: (key: string) => void;
  updateHomeSelection: (homeKey: string, subject: string, selection: SelectionType, isWard: boolean, totalCardsOnScreen?: number) => void;
  resetAllData: () => void;
  /** Renames a subject's attendance everywhere (subjects + finishedMap + homeSelections). */
  renameSubjectData: (oldName: string, newName: string) => void;
  /**
   * Renames a ward's attendance everywhere (wards + finishedMap + homeSelections).
   * Covers BOTH preset-entry renames and custom ward renames.
   */
  renameWardData: (oldName: string, newName: string) => void;
  /** Removes a subject's attendance everywhere (spec 4 full delete). */
  removeSubjectData: (subjectName: string) => void;
  /** Removes a ward's attendance everywhere (spec 4 full delete). */
  removeWardData: (wardName: string) => void;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

const SUBJECTS_KEY = 'attendance_tracker_subjects';
const WARD_KEY = 'attendance_tracker_ward';
const HOME_SELECTIONS_KEY = 'attendance_tracker_home_selections';
const PREFERRED_PERCENTAGE_KEY = 'attendance_tracker_preferred_percentage';
const FINISHED_MAP_KEY = 'attendance_tracker_finished_map';

export const AttendanceProvider = ({ children }: { children: ReactNode }) => {
  const [subjects, setSubjects] = useState<Record<string, AttendanceData>>({});
  const [wards, setWards] = useState<Record<string, AttendanceData>>({});
  const [homeSelections, setHomeSelections] = useState<Record<string, SelectionType>>({});
  const [finishedMap, setFinishedMap] = useState<Record<string, boolean>>({});
  const [preferredPercentage, setPreferredPercentage] = useState<number>(75);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SUBJECTS_KEY);
      if (s) setSubjects(JSON.parse(s));
      const w = localStorage.getItem(WARD_KEY);
      if (w) setWards(JSON.parse(w));
      const f = localStorage.getItem(FINISHED_MAP_KEY);
      if (f) setFinishedMap(JSON.parse(f));
      const p = localStorage.getItem(PREFERRED_PERCENTAGE_KEY);
      if (p) setPreferredPercentage(JSON.parse(p));
      const h = localStorage.getItem(HOME_SELECTIONS_KEY);
      if (h) {
        const raw: Record<string, string> = JSON.parse(h);
        const VALID: ReadonlySet<string> = new Set(['attended', 'missed', 'off']);
        const migrated: Record<string, SelectionType> = {};
        for (const [k, v] of Object.entries(raw)) {
          const mapped = v === 'holiday' ? 'off' : v;
          if (VALID.has(mapped)) migrated[k] = mapped as SelectionType;
        }
        if (Object.keys(migrated).length !== Object.keys(raw).length ||
            Object.entries(migrated).some(([k, v]) => raw[k] !== v)) {
          localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(migrated));
          storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(migrated));
        }
        setHomeSelections(migrated);
      }
    } catch (e) {
      // console.error('Failed to load attendance data', e);
    }
  }, []);

  const savePreferredPercentage = (p: number) => {
    setPreferredPercentage(p);
    localStorage.setItem(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
    storageSetItem(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
  };

  const updateSubject = (subject: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${subject}`);
    setSubjects(prev => {
      const updated = { ...prev, [subject]: { attended, missed } };
      localStorage.setItem(SUBJECTS_KEY, JSON.stringify(updated));
      storageSetItem(SUBJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const updateWard = (ward: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${ward}`);
    setWards(prev => {
      const updated = { ...prev, [ward]: { attended, missed } };
      localStorage.setItem(WARD_KEY, JSON.stringify(updated));
      storageSetItem(WARD_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const toggleFinished = (key: string) => {
    snapshotBeforeEdit(`Toggle Finished ${key}`);
    setFinishedMap(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem(FINISHED_MAP_KEY, JSON.stringify(updated));
      storageSetItem(FINISHED_MAP_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const updateHomeSelection = (
    homeKey: string,
    subject: string,
    selection: SelectionType,
    isWard: boolean,
    totalCardsOnScreen?: number
  ) => {
    const previous = homeSelections[homeKey];
    let newSelections: Record<string, SelectionType>;
    if (previous === selection) {
      // Toggle off selection
      const { [homeKey]: _removed, ...rest } = homeSelections;
      newSelections = rest;
    } else {
      // Toggle to new selection
      newSelections = { ...homeSelections, [homeKey]: selection };
    }

    // Persist home selections synchronously first
    setHomeSelections(newSelections);
    localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(newSelections));
    storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(newSelections));

    // Calculate count diffs
    let deltaAttended = 0;
    let deltaMissed = 0;
    if (previous === 'attended') deltaAttended -= 1;
    if (previous === 'missed')   deltaMissed   -= 1;
    if (previous !== selection) {
      if (selection === 'attended') deltaAttended += 1;
      if (selection === 'missed')   deltaMissed   += 1;
    }

    if (isWard) {
      setWards(prev => {
        const current = prev[subject] || { attended: 0, missed: 0 };
        const updated = {
          ...prev,
          [subject]: {
            attended: Math.max(0, current.attended + deltaAttended),
            missed: Math.max(0, current.missed + deltaMissed)
          }
        };
        localStorage.setItem(WARD_KEY, JSON.stringify(updated));
        storageSetItem(WARD_KEY, JSON.stringify(updated));
        return updated;
      });
    } else {
      setSubjects(prev => {
        const current = prev[subject] || { attended: 0, missed: 0 };
        const updated = {
          ...prev,
          [subject]: {
            attended: Math.max(0, current.attended + deltaAttended),
            missed: Math.max(0, current.missed + deltaMissed)
          }
        };
        localStorage.setItem(SUBJECTS_KEY, JSON.stringify(updated));
        storageSetItem(SUBJECTS_KEY, JSON.stringify(updated));
        return updated;
      });
    }

    // Evaluate Day Completion status correctly based on total card count
    const targetCardCount = totalCardsOnScreen || (Object.keys(subjects).length + Object.keys(wards).length);
    const markedCount = Object.keys(newSelections).length;
    if (targetCardCount > 0 && markedCount >= targetCardCount) {
      snapshotDayComplete(true);
    } else {
      snapshotDayComplete(false);
    }
  };

  /** Wipes all attendance data from state and IndexedDB/localStorage. Called when starting fresh. */
  const resetAllData = () => {
    snapshotBeforeEdit('Reset All Data');
    localStorage.removeItem(SUBJECTS_KEY);
    localStorage.removeItem(WARD_KEY);
    localStorage.removeItem(HOME_SELECTIONS_KEY);
    storageRemoveItem(SUBJECTS_KEY);
    storageRemoveItem(WARD_KEY);
    storageRemoveItem(HOME_SELECTIONS_KEY);
    setSubjects({});
    setWards({});
    setHomeSelections({});
  };

  /* ─────────────────────────────────────────────────────────────────────────
     Rename / delete helpers (spec 4 + flag 5)

     Home-selection keys look like:
       `${date}-${attendanceKey}`                 (no session)
       `${date}-${attendanceKey}-${sessionId}`    (with session)
     ...using either '-' or '_' as separators. The `attendanceKey` is
     `ward-${wardName}` for wards or `${subjectName}` for subjects.

     All matching below is ANCHORED on the attendance key with a separator
     boundary, so a name that is a substring of another name is never
     falsely matched or rewritten.
  ───────────────────────────────────────────────────────────────────────── */

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /** Does this home-selection key belong to the given attendance key? */
  const homeKeyReferences = (key: string, attendanceKey: string): boolean => {
    const date = key.slice(0, 10);
    if (!DATE_RE.test(date)) return false;
    const sep = key.charAt(10);
    if (sep !== '-' && sep !== '_') return false;
    const rest = key.slice(11);
    const candidate = sep === '_' ? attendanceKey.replace(/-/g, '_') : attendanceKey;
    const restL = rest.toLowerCase();
    const candL = candidate.toLowerCase();
    return restL === candL || restL.startsWith(candL + sep);
  };

  /** Rewrite the attendance-key portion of a home-selection key. */
  const rewriteHomeKey = (key: string, oldAttendanceKey: string, newAttendanceKey: string): string => {
    const date = key.slice(0, 10);
    if (!DATE_RE.test(date)) return key;
    const sep = key.charAt(10);
    if (sep !== '-' && sep !== '_') return key;
    const rest = key.slice(11);
    const oldCand = sep === '_' ? oldAttendanceKey.replace(/-/g, '_') : oldAttendanceKey;
    const newCand = sep === '_' ? newAttendanceKey.replace(/-/g, '_') : newAttendanceKey;
    const restL = rest.toLowerCase();
    const oldL = oldCand.toLowerCase();
    if (restL === oldL) {
      return `${date}${sep}${newCand}`;
    }
    if (restL.startsWith(oldL + sep)) {
      return `${date}${sep}${newCand}${rest.slice(oldCand.length)}`;
    }
    return key;
  };

  /** Rename a key inside a flat Record store (case-insensitive match). */
  const renameStoreKey = <T,>(
    setter: React.Dispatch<React.SetStateAction<Record<string, T>>>,
    storageKey: string,
    oldKey: string,
    newKey: string
  ) => {
    setter(prev => {
      const updated = { ...prev };
      const existing = Object.keys(updated).find(k => k.toLowerCase() === oldKey.toLowerCase());
      if (existing) {
        const val = updated[existing];
        delete updated[existing];
        updated[newKey] = val;
      }
      localStorage.setItem(storageKey, JSON.stringify(updated));
      storageSetItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  };

  /** Remove a key from a flat Record store (case-insensitive match). */
  const removeStoreKey = <T,>(
    setter: React.Dispatch<React.SetStateAction<Record<string, T>>>,
    storageKey: string,
    targetKey: string
  ) => {
    setter(prev => {
      const updated = { ...prev };
      for (const k of Object.keys(updated)) {
        if (k.toLowerCase() === targetKey.toLowerCase()) delete updated[k];
      }
      localStorage.setItem(storageKey, JSON.stringify(updated));
      storageSetItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  };

  /** Rewrite every home-selection key that references oldAttendanceKey. */
  const renameHomeSelectionsFor = (oldAttendanceKey: string, newAttendanceKey: string) => {
    setHomeSelections(prev => {
      const updated: Record<string, SelectionType> = {};
      for (const [k, v] of Object.entries(prev)) {
        updated[rewriteHomeKey(k, oldAttendanceKey, newAttendanceKey)] = v;
      }
      localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(updated));
      storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  /** Drop every home-selection key that references attendanceKey. */
  const removeHomeSelectionsFor = (attendanceKey: string) => {
    setHomeSelections(prev => {
      const updated: Record<string, SelectionType> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!homeKeyReferences(k, attendanceKey)) updated[k] = v;
      }
      localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(updated));
      storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  /* ── Public rename / delete API ── */

  const renameSubjectData = (oldName: string, newName: string) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o === n) return;
    snapshotBeforeEdit(`Rename subject data: ${o} → ${n}`);
    renameStoreKey(setSubjects, SUBJECTS_KEY, o, n);
    renameStoreKey(setFinishedMap, FINISHED_MAP_KEY, o, n);
    renameHomeSelectionsFor(o, n);
  };

  const renameWardData = (oldName: string, newName: string) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o === n) return;
    snapshotBeforeEdit(`Rename ward data: ${o} → ${n}`);
    const oldKey = `ward-${o}`;
    const newKey = `ward-${n}`;
    renameStoreKey(setWards, WARD_KEY, oldKey, newKey);
    renameStoreKey(setFinishedMap, FINISHED_MAP_KEY, oldKey, newKey);
    renameHomeSelectionsFor(oldKey, newKey);
  };

  const removeSubjectData = (subjectName: string) => {
    const t = subjectName.trim();
    if (!t) return;
    snapshotBeforeEdit(`Delete subject data: ${t}`);
    removeStoreKey(setSubjects, SUBJECTS_KEY, t);
    removeStoreKey(setFinishedMap, FINISHED_MAP_KEY, t);
    removeHomeSelectionsFor(t);
  };

  const removeWardData = (wardName: string) => {
    const t = wardName.trim();
    if (!t) return;
    snapshotBeforeEdit(`Delete ward data: ${t}`);
    const wardKey = `ward-${t}`;
    removeStoreKey(setWards, WARD_KEY, wardKey);
    removeStoreKey(setFinishedMap, FINISHED_MAP_KEY, wardKey);
    removeHomeSelectionsFor(wardKey);
  };

  return (
    <AttendanceContext.Provider value={{
      subjects,
      wards,
      homeSelections,
      finishedMap,
      preferredPercentage,
      setPreferredPercentage: savePreferredPercentage,
      updateSubject,
      updateWard,
      toggleFinished,
      updateHomeSelection,
      resetAllData,
      renameSubjectData,
      renameWardData,
      removeSubjectData,
      removeWardData,
    }}>
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (context === undefined) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
};
