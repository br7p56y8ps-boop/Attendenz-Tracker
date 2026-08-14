import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';
import { snapshotBeforeEdit, snapshotDayComplete } from '@/utils/snapshotUtils';

export type AttendanceData = { attended: number; missed: number };
export type SelectionType = 'off' | 'missed' | 'attended';

// New prefix for SGT subject keys
const SGT_KEY_PREFIX = 'sgt:';
export const getSGTKey = (id: string) => `${SGT_KEY_PREFIX}${id}`;
export const isSGTKey = (key: string) => key.startsWith(SGT_KEY_PREFIX);

interface AttendanceContextType {
  subjects: Record<string, AttendanceData>;
  wards: Record<string, AttendanceData>;
  homeSelections: Record<string, SelectionType>;
  finishedMap: Record<string, boolean>;
  preferredPercentage: number;
  setPreferredPercentage: (p: number) => void;
  updateSubject: (subjectKey: string, attended: number, missed: number) => void;
  updateWard: (wardKey: string, attended: number, missed: number) => void;
  toggleFinished: (key: string) => void;
  updateHomeSelection: (homeKey: string, subjectKey: string, selection: SelectionType, isWard: boolean, totalCardsOnScreen?: number) => void;
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
  /** Removes attendance data by exact key (e.g., sgt:id, name, ward-name). */
  removeAttendanceByKey: (key: string) => void;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

const SUBJECTS_KEY = 'attendance_tracker_subjects';
const WARD_KEY = 'attendance_tracker_ward';
const HOME_SELECTIONS_KEY = 'attendance_tracker_home_selections';
const PREFERRED_PERCENTAGE_KEY = 'attendance_tracker_preferred_percentage';
const FINISHED_MAP_KEY = 'attendance_tracker_finished_map';

// Storage keys where SGT subject definitions live (from CustomDataContext)
const USER_ADDED_SUBJECTS_STORAGE = 'att_user_added_subjects';
const CUSTOM_SUBJECTS_STORAGE = 'att_custom_subjects';

export const AttendanceProvider = ({ children }: { children: ReactNode }) => {
  const [subjects, setSubjects] = useState<Record<string, AttendanceData>>({});
  const [wards, setWards] = useState<Record<string, AttendanceData>>({});
  const [homeSelections, setHomeSelections] = useState<Record<string, SelectionType>>({});
  const [finishedMap, setFinishedMap] = useState<Record<string, boolean>>({});
  const [preferredPercentage, setPreferredPercentage] = useState<number>(75);

  // Load initial data, then perform SGT migration
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

    // After initial load, run SGT migration
    migrateSGTData();
  }, []);

  const savePreferredPercentage = (p: number) => {
    setPreferredPercentage(p);
    localStorage.setItem(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
    storageSetItem(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
  };

  const updateSubject = (subjectKey: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${subjectKey}`);
    setSubjects(prev => {
      const updated = { ...prev, [subjectKey]: { attended, missed } };
      localStorage.setItem(SUBJECTS_KEY, JSON.stringify(updated));
      storageSetItem(SUBJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const updateWard = (wardKey: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${wardKey}`);
    setWards(prev => {
      const updated = { ...prev, [wardKey]: { attended, missed } };
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
    subjectKey: string,
    selection: SelectionType,
    isWard: boolean,
    totalCardsOnScreen?: number
  ) => {
    const previous = homeSelections[homeKey];
    let newSelections: Record<string, SelectionType>;
    if (previous === selection) {
      const { [homeKey]: _removed, ...rest } = homeSelections;
      newSelections = rest;
    } else {
      newSelections = { ...homeSelections, [homeKey]: selection };
    }

    setHomeSelections(newSelections);
    localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(newSelections));
    storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(newSelections));

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
        const current = prev[subjectKey] || { attended: 0, missed: 0 };
        const updated = {
          ...prev,
          [subjectKey]: {
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
        const current = prev[subjectKey] || { attended: 0, missed: 0 };
        const updated = {
          ...prev,
          [subjectKey]: {
            attended: Math.max(0, current.attended + deltaAttended),
            missed: Math.max(0, current.missed + deltaMissed)
          }
        };
        localStorage.setItem(SUBJECTS_KEY, JSON.stringify(updated));
        storageSetItem(SUBJECTS_KEY, JSON.stringify(updated));
        return updated;
      });
    }

    const targetCardCount = totalCardsOnScreen || (Object.keys(subjects).length + Object.keys(wards).length);
    const markedCount = Object.keys(newSelections).length;
    if (targetCardCount > 0 && markedCount >= targetCardCount) {
      snapshotDayComplete(true);
    } else {
      snapshotDayComplete(false);
    }
  };

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

  /* ──────────────── Key matching helpers (unchanged) ──────────────── */
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  /** New method to remove data by exact key (covers sgt:id, names, ward-key). */
  const removeAttendanceByKey = (key: string) => {
    if (!key) return;
    snapshotBeforeEdit(`Delete attendance key: ${key}`);
    if (isSGTKey(key) || !key.startsWith('ward-')) {
      // Subject-like key (normal or SGT)
      removeStoreKey(setSubjects, SUBJECTS_KEY, key);
      removeStoreKey(setFinishedMap, FINISHED_MAP_KEY, key);
      removeHomeSelectionsFor(key);
    } else {
      // Ward key
      removeStoreKey(setWards, WARD_KEY, key);
      removeStoreKey(setFinishedMap, FINISHED_MAP_KEY, key);
      removeHomeSelectionsFor(key);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     SGT MIGRATION (executed once after initial load)
     Splits old merged subject data using daily homeSelections tags.
     ───────────────────────────────────────────────────────────── */
  const migrateSGTData = () => {
    try {
      // Read raw current data from localStorage (freshly loaded)
      const rawSubjects = JSON.parse(localStorage.getItem(SUBJECTS_KEY) || '{}');
      const rawHomeSelections = JSON.parse(localStorage.getItem(HOME_SELECTIONS_KEY) || '{}');

      // Get SGT subjects from CustomData storage
      const sgtList: Array<{ id: string; name: string }> = [];
      const uaRaw = localStorage.getItem(USER_ADDED_SUBJECTS_STORAGE);
      if (uaRaw) {
        const uaArr = JSON.parse(uaRaw);
        uaArr.forEach((s: any) => {
          if (s.parentName === 'Small Group Teaching' && s.id) {
            sgtList.push({ id: s.id, name: s.name });
          }
        });
      }
      const csRaw = localStorage.getItem(CUSTOM_SUBJECTS_STORAGE);
      if (csRaw) {
        const csArr = JSON.parse(csRaw);
        csArr.forEach((s: any) => {
          if (s.parentName === 'Small Group Teaching' && s.id) {
            sgtList.push({ id: s.id, name: s.name });
          }
        });
      }

      if (sgtList.length === 0) return; // nothing to migrate

      let newSubjects = { ...rawSubjects };
      let newHomeSelections = { ...rawHomeSelections };
      let changed = false;

      // Compute SGT totals from old homeSelections keys
      for (const sgt of sgtList) {
        const sgtKey = getSGTKey(sgt.id);
        let sgtAtt = 0;
        let sgtMis = 0;

        // Scan homeSelections for keys containing `sgt-${sgt.id}` (old format)
        for (const [homeKey, sel] of Object.entries(rawHomeSelections)) {
          if (homeKey.includes(`sgt-${sgt.id}`) || homeKey.includes(`sgt_${sgt.id}`)) {
            if (sel === 'attended') sgtAtt++;
            else if (sel === 'missed') sgtMis++;
          }
        }

        // If we found any SGT marks, create separate SGT subject data
        if (sgtAtt > 0 || sgtMis > 0) {
          newSubjects[sgtKey] = { attended: sgtAtt, missed: sgtMis };
          changed = true;

          // Subtract from old name-keyed subject (academic)
          if (newSubjects[sgt.name]) {
            const old = newSubjects[sgt.name];
            const newAtt = Math.max(0, old.attended - sgtAtt);
            const newMis = Math.max(0, old.missed - sgtMis);
            if (newAtt === 0 && newMis === 0) {
              delete newSubjects[sgt.name];
            } else {
              newSubjects[sgt.name] = { attended: newAtt, missed: newMis };
            }
          }
        }
      }

      // Migrate homeSelections keys: convert old `${date}-${name}-sgt-${id}` to `${date}-sgt:${id}`
      for (const [homeKey, sel] of Object.entries(rawHomeSelections)) {
        for (const sgt of sgtList) {
          const oldToken = `sgt-${sgt.id}`;
          if (homeKey.includes(oldToken)) {
            // Reconstruct: replace the subject name part with sgt key
            const date = homeKey.slice(0, 10);
            const rest = homeKey.slice(11);
            const sep = homeKey.charAt(10);
            // New rest will be `sgt:${sgt.id}` plus any suffix after old token
            const tokenIndex = rest.indexOf(oldToken);
            const suffix = rest.slice(tokenIndex + oldToken.length);
            const newRest = `${getSGTKey(sgt.id)}${suffix}`;
            const newHomeKey = `${date}${sep}${newRest}`;
            if (newHomeKey !== homeKey) {
              delete newHomeSelections[homeKey];
              newHomeSelections[newHomeKey] = sel;
              changed = true;
            }
            break;
          }
        }
      }

      if (changed) {
        // Persist migrated data
        localStorage.setItem(SUBJECTS_KEY, JSON.stringify(newSubjects));
        storageSetItem(SUBJECTS_KEY, JSON.stringify(newSubjects));
        localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(newHomeSelections));
        storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(newHomeSelections));
        setSubjects(newSubjects);
        setHomeSelections(newHomeSelections);
      }
    } catch (e) {
      // Ignore migration errors; data remains as before
    }
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
      removeAttendanceByKey,
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