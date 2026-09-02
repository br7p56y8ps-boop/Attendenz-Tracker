import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storageSetItem, storageRemoveItem, storageSetItemChecked } from '@/lib/idb';
import { snapshotBeforeEdit, snapshotDayComplete } from '@/utils/snapshotUtils';
import { useCustomData } from '@/contexts/CustomDataContext';

export type AttendanceData = { attended: number; missed: number };
export type SelectionType = 'off' | 'missed' | 'attended';

const SGT_KEY_PREFIX = 'sgt:';
export const getSGTKey = (id: string) => `${SGT_KEY_PREFIX}${id}`;
export const getAcademicAttendanceKey = (subjectId: string) => `academic:${subjectId}`;
export const getWardAttendanceKey = (wardId: string) => `ward:${wardId}`;
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
  reopenFinishedIfPlanIncreased: (key: string, plannedTotal: number, isWard: boolean) => void;
  updateHomeSelection: (homeKey: string, subjectKey: string, selection: SelectionType, isWard: boolean, totalCardsOnScreen?: number) => void;
  resetAllData: () => void;
  renameSubjectData: (oldName: string, newName: string) => void;
  renameWardData: (oldName: string, newName: string) => void;
  removeSubjectData: (subjectName: string) => void;
  removeWardData: (wardName: string) => void;
  removeAttendanceByKey: (key: string) => void;
  removeAttendanceEntitiesForMode: (mode: 'preloaded' | 'custom', entities: Array<{ key: string; type: 'subject' | 'ward'; legacyKey?: string }>) => void;
  getHomeSelection: (dateStr: string, subjectKey: string, sessionId?: string, isWard?: boolean) => SelectionType | undefined;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

const LEGACY_SUBJECTS_KEY = 'attendance_tracker_subjects';
const LEGACY_WARD_KEY = 'attendance_tracker_ward';
const LEGACY_HOME_SELECTIONS_KEY = 'attendance_tracker_home_selections';
const LEGACY_FINISHED_MAP_KEY = 'attendance_tracker_finished_map';
const PREFERRED_PERCENTAGE_KEY = 'attendance_tracker_preferred_percentage';

const SUBJECTS_KEY_PRESET = 'attendance_tracker_subjects_preset';
const WARD_KEY_PRESET = 'attendance_tracker_ward_preset';
const HOME_SELECTIONS_KEY_PRESET = 'attendance_tracker_home_selections_preset';
const FINISHED_MAP_KEY_PRESET = 'attendance_tracker_finished_map_preset';

const SUBJECTS_KEY_CUSTOM = 'attendance_tracker_subjects_custom';
const WARD_KEY_CUSTOM = 'attendance_tracker_ward_custom';
const HOME_SELECTIONS_KEY_CUSTOM = 'attendance_tracker_home_selections_custom';
const FINISHED_MAP_KEY_CUSTOM = 'attendance_tracker_finished_map_custom';

const MODE_SEPARATION_FLAG = 'att_mode_separation_done_v1';
const ID_MIGRATION_FLAG_PREFIX = 'att_attendance_id_migration_v2_done_';
const ORPHANED_RECORDS_KEY = 'attendance_tracker_orphaned_records';

const USER_ADDED_SUBJECTS_STORAGE = 'att_user_added_subjects';
const CUSTOM_SUBJECTS_STORAGE = 'att_custom_subjects';

const getActualMode = (): 'preloaded' | 'custom' => {
  const m = localStorage.getItem('att_subject_mode');
  return m === 'custom' ? 'custom' : 'preloaded';
};

export const AttendanceProvider = ({ children }: { children: ReactNode }) => {
  const { subjectMode, subjectRegistry } = useCustomData();

  const [subjects, setSubjects] = useState<Record<string, AttendanceData>>({});
  const [wards, setWards] = useState<Record<string, AttendanceData>>({});
  const [homeSelections, setHomeSelections] = useState<Record<string, SelectionType>>({});
  const [finishedMap, setFinishedMap] = useState<Record<string, boolean>>({});
  const [preferredPercentage, setPreferredPercentage] = useState<number>(75);

  const getStorageKeys = (mode: 'preloaded' | 'custom') => {
    if (mode === 'preloaded') {
      return {
        subjectsKey: SUBJECTS_KEY_PRESET,
        wardsKey: WARD_KEY_PRESET,
        homeSelectionsKey: HOME_SELECTIONS_KEY_PRESET,
        finishedMapKey: FINISHED_MAP_KEY_PRESET,
      };
    } else {
      return {
        subjectsKey: SUBJECTS_KEY_CUSTOM,
        wardsKey: WARD_KEY_CUSTOM,
        homeSelectionsKey: HOME_SELECTIONS_KEY_CUSTOM,
        finishedMapKey: FINISHED_MAP_KEY_CUSTOM,
      };
    }
  };

  const loadDataForMode = (mode: 'preloaded' | 'custom') => {
    const keys = getStorageKeys(mode);
    const useLegacyFallback = !localStorage.getItem(MODE_SEPARATION_FLAG);
    try {
      const s = localStorage.getItem(keys.subjectsKey) || (useLegacyFallback ? localStorage.getItem(LEGACY_SUBJECTS_KEY) : null);
      setSubjects(s ? JSON.parse(s) : {});
    } catch {}
    try {
      const w = localStorage.getItem(keys.wardsKey) || (useLegacyFallback ? localStorage.getItem(LEGACY_WARD_KEY) : null);
      setWards(w ? JSON.parse(w) : {});
    } catch {}
    try {
      const h = localStorage.getItem(keys.homeSelectionsKey) || (useLegacyFallback ? localStorage.getItem(LEGACY_HOME_SELECTIONS_KEY) : null);
      if (h) {
        const raw = JSON.parse(h);
        const VALID = new Set(['attended', 'missed', 'off']);
        const migrated: Record<string, SelectionType> = {};
        for (const [k, v] of Object.entries(raw)) {
          const mapped = typeof v === 'string' ? (v === 'holiday' ? 'off' : v) : '';
          if (VALID.has(mapped)) migrated[k] = mapped as SelectionType;
        }
        setHomeSelections(migrated);
      } else {
        setHomeSelections({});
      }
    } catch {}
    try {
      const f = localStorage.getItem(keys.finishedMapKey) || (useLegacyFallback ? localStorage.getItem(LEGACY_FINISHED_MAP_KEY) : null);
      setFinishedMap(f ? JSON.parse(f) : {});
    } catch {}
  };

  const migrateModeSeparation = () => {
    try {
      if (localStorage.getItem(MODE_SEPARATION_FLAG)) return;
      const mode = getActualMode();
      const keys = getStorageKeys(mode);

      if (localStorage.getItem(LEGACY_SUBJECTS_KEY) && !localStorage.getItem(keys.subjectsKey)) {
        localStorage.setItem(keys.subjectsKey, localStorage.getItem(LEGACY_SUBJECTS_KEY)!);
        storageSetItem(keys.subjectsKey, localStorage.getItem(LEGACY_SUBJECTS_KEY)!);
      }
      if (localStorage.getItem(LEGACY_WARD_KEY) && !localStorage.getItem(keys.wardsKey)) {
        localStorage.setItem(keys.wardsKey, localStorage.getItem(LEGACY_WARD_KEY)!);
        storageSetItem(keys.wardsKey, localStorage.getItem(LEGACY_WARD_KEY)!);
      }
      if (localStorage.getItem(LEGACY_HOME_SELECTIONS_KEY) && !localStorage.getItem(keys.homeSelectionsKey)) {
        localStorage.setItem(keys.homeSelectionsKey, localStorage.getItem(LEGACY_HOME_SELECTIONS_KEY)!);
        storageSetItem(keys.homeSelectionsKey, localStorage.getItem(LEGACY_HOME_SELECTIONS_KEY)!);
      }
      if (localStorage.getItem(LEGACY_FINISHED_MAP_KEY) && !localStorage.getItem(keys.finishedMapKey)) {
        localStorage.setItem(keys.finishedMapKey, localStorage.getItem(LEGACY_FINISHED_MAP_KEY)!);
        storageSetItem(keys.finishedMapKey, localStorage.getItem(LEGACY_FINISHED_MAP_KEY)!);
      }

      localStorage.setItem(MODE_SEPARATION_FLAG, 'true');
      storageSetItem(MODE_SEPARATION_FLAG, 'true');
    } catch {}
  };

  useEffect(() => {
    migrateModeSeparation();
    const actualMode = getActualMode();
    loadDataForMode(actualMode);
    migrateSGTData(actualMode);
    try {
      const p = localStorage.getItem(PREFERRED_PERCENTAGE_KEY);
      if (p) setPreferredPercentage(JSON.parse(p));
    } catch {}
  }, []);

  useEffect(() => {
    loadDataForMode(subjectMode);
    if (subjectRegistry.length > 0) migrateAttendanceToIDs(subjectMode, subjectRegistry);
  }, [subjectMode, subjectRegistry]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const keys = getStorageKeys(subjectMode);
      const relevant = [keys.subjectsKey, keys.wardsKey, keys.homeSelectionsKey, keys.finishedMapKey, LEGACY_SUBJECTS_KEY, LEGACY_WARD_KEY, LEGACY_HOME_SELECTIONS_KEY, LEGACY_FINISHED_MAP_KEY];
      if (!event.key || relevant.includes(event.key)) loadDataForMode(subjectMode);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [subjectMode]);

  const persistSubjectsForMode = (mode: 'preloaded' | 'custom', data: Record<string, AttendanceData>) => {
    const key = getStorageKeys(mode).subjectsKey;
    void storageSetItemChecked(key, JSON.stringify(data));
  };
  const persistWardsForMode = (mode: 'preloaded' | 'custom', data: Record<string, AttendanceData>) => {
    const key = getStorageKeys(mode).wardsKey;
    void storageSetItemChecked(key, JSON.stringify(data));
  };
  const persistHomeSelectionsForMode = (mode: 'preloaded' | 'custom', data: Record<string, SelectionType>) => {
    const key = getStorageKeys(mode).homeSelectionsKey;
    void storageSetItemChecked(key, JSON.stringify(data));
  };
  const persistFinishedMapForMode = (mode: 'preloaded' | 'custom', data: Record<string, boolean>) => {
    const key = getStorageKeys(mode).finishedMapKey;
    void storageSetItemChecked(key, JSON.stringify(data));
  };

  const savePreferredPercentage = (p: number) => {
    setPreferredPercentage(p);
    void storageSetItemChecked(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
  };

  const updateSubject = (subjectKey: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${subjectKey}`);
    setSubjects(prev => {
      const updated = { ...prev, [subjectKey]: { attended, missed } };
      persistSubjectsForMode(subjectMode, updated);
      return updated;
    });
  };

  const updateWard = (wardKey: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${wardKey}`);
    setWards(prev => {
      const updated = { ...prev, [wardKey]: { attended, missed } };
      persistWardsForMode(subjectMode, updated);
      return updated;
    });
  };

  const toggleFinished = (key: string) => {
    snapshotBeforeEdit(`Toggle Finished ${key}`);
    setFinishedMap(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      persistFinishedMapForMode(subjectMode, updated);
      return updated;
    });
  };

  const reopenFinishedIfPlanIncreased = (key: string, plannedTotal: number, isWard: boolean) => {
    if (!key || !Number.isFinite(plannedTotal) || plannedTotal < 0 || !finishedMap[key]) return;
    const record = (isWard ? wards : subjects)[key];
    const conducted = (record?.attended || 0) + (record?.missed || 0);
    if (plannedTotal <= conducted) return;
    snapshotBeforeEdit(`Reopen ${key} After Planned Total Increase`);
    setFinishedMap(prev => {
      if (!prev[key]) return prev;
      const updated = { ...prev, [key]: false };
      persistFinishedMapForMode(subjectMode, updated);
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
    persistHomeSelectionsForMode(subjectMode, newSelections);

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
        persistWardsForMode(subjectMode, updated);
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
        persistSubjectsForMode(subjectMode, updated);
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
    const allKeys = [
      LEGACY_SUBJECTS_KEY, LEGACY_WARD_KEY, LEGACY_HOME_SELECTIONS_KEY, LEGACY_FINISHED_MAP_KEY,
      SUBJECTS_KEY_PRESET, WARD_KEY_PRESET, HOME_SELECTIONS_KEY_PRESET, FINISHED_MAP_KEY_PRESET,
      SUBJECTS_KEY_CUSTOM, WARD_KEY_CUSTOM, HOME_SELECTIONS_KEY_CUSTOM, FINISHED_MAP_KEY_CUSTOM
    ];
    allKeys.forEach(key => {
      localStorage.removeItem(key);
      storageRemoveItem(key);
    });
    setSubjects({});
    setWards({});
    setHomeSelections({});
    setFinishedMap({});
  };

  // Key matching helpers (unchanged)
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
    if (restL === oldL) return `${date}${sep}${newCand}`;
    if (restL.startsWith(oldL + sep)) return `${date}${sep}${newCand}${rest.slice(oldCand.length)}`;
    return key;
  };

  const renameStoreKey = <T,>(
    setter: React.Dispatch<React.SetStateAction<Record<string, T>>>,
    persist: (data: Record<string, T>) => void,
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
      persist(updated);
      return updated;
    });
  };

  const removeStoreKey = <T,>(
    setter: React.Dispatch<React.SetStateAction<Record<string, T>>>,
    persist: (data: Record<string, T>) => void,
    targetKey: string
  ) => {
    setter(prev => {
      const updated = { ...prev };
      for (const k of Object.keys(updated)) {
        if (k.toLowerCase() === targetKey.toLowerCase()) delete updated[k];
      }
      persist(updated);
      return updated;
    });
  };

  const renameHomeSelectionsFor = (oldAttendanceKey: string, newAttendanceKey: string) => {
    setHomeSelections(prev => {
      const updated: Record<string, SelectionType> = {};
      for (const [k, v] of Object.entries(prev)) {
        updated[rewriteHomeKey(k, oldAttendanceKey, newAttendanceKey)] = v;
      }
      persistHomeSelectionsForMode(subjectMode, updated);
      return updated;
    });
  };

  const removeHomeSelectionsFor = (attendanceKey: string) => {
    setHomeSelections(prev => {
      const updated: Record<string, SelectionType> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!homeKeyReferences(k, attendanceKey)) updated[k] = v;
      }
      persistHomeSelectionsForMode(subjectMode, updated);
      return updated;
    });
  };

  const renameSubjectData = (oldName: string, newName: string) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o === n) return;
    snapshotBeforeEdit(`Rename subject data: ${o} → ${n}`);
    renameStoreKey(setSubjects, (d) => persistSubjectsForMode(subjectMode, d), o, n);
    renameStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), o, n);
    renameHomeSelectionsFor(o, n);
  };

  const renameWardData = (oldName: string, newName: string) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o === n) return;
    snapshotBeforeEdit(`Rename ward data: ${o} → ${n}`);
    const oldKey = `ward-${o}`;
    const newKey = `ward-${n}`;
    renameStoreKey(setWards, (d) => persistWardsForMode(subjectMode, d), oldKey, newKey);
    renameStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), oldKey, newKey);
    renameHomeSelectionsFor(oldKey, newKey);
  };

  const removeSubjectData = (subjectName: string) => {
    const t = subjectName.trim();
    if (!t) return;
    snapshotBeforeEdit(`Delete subject data: ${t}`);
    removeStoreKey(setSubjects, (d) => persistSubjectsForMode(subjectMode, d), t);
    removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), t);
    removeHomeSelectionsFor(t);
  };

  const removeWardData = (wardName: string) => {
    const t = wardName.trim();
    if (!t) return;
    snapshotBeforeEdit(`Delete ward data: ${t}`);
    const wardKey = `ward-${t}`;
    removeStoreKey(setWards, (d) => persistWardsForMode(subjectMode, d), wardKey);
    removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), wardKey);
    removeHomeSelectionsFor(wardKey);
  };

  const removeAttendanceByKey = (key: string) => {
    if (!key) return;
    snapshotBeforeEdit(`Delete attendance key: ${key}`);
    if (isSGTKey(key) || !key.startsWith('ward-')) {
      removeStoreKey(setSubjects, (d) => persistSubjectsForMode(subjectMode, d), key);
      removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), key);
      removeHomeSelectionsFor(key);
    } else {
      removeStoreKey(setWards, (d) => persistWardsForMode(subjectMode, d), key);
      removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), key);
      removeHomeSelectionsFor(key);
    }
  };

  const migrateSGTData = (mode: 'preloaded' | 'custom') => {
    try {
      const keys = getStorageKeys(mode);
      const rawSubjects = JSON.parse(localStorage.getItem(keys.subjectsKey) || '{}');
      const rawHomeSelections = JSON.parse(localStorage.getItem(keys.homeSelectionsKey) || '{}');
      const sgtList: Array<{ id: string; name: string }> = [];
      const sourceKey = mode === 'preloaded' ? USER_ADDED_SUBJECTS_STORAGE : CUSTOM_SUBJECTS_STORAGE;
      const sourceRaw = localStorage.getItem(sourceKey);
      if (sourceRaw) {
        JSON.parse(sourceRaw).forEach((s: any) => {
          if (s.parentName === 'Small Group Teaching' && s.id) sgtList.push({ id: s.id, name: s.name });
        });
      }
      if (sgtList.length === 0) return;
      let newSubjects = { ...rawSubjects };
      let newHomeSelections = { ...rawHomeSelections };
      let changed = false;
      for (const sgt of sgtList) {
        const sgtKey = getSGTKey(sgt.id);
        let sgtAtt = 0, sgtMis = 0;
        for (const [homeKey, sel] of Object.entries(rawHomeSelections)) {
          if (homeKey.includes(`sgt-${sgt.id}`) || homeKey.includes(`sgt_${sgt.id}`)) {
            if (sel === 'attended') sgtAtt++;
            else if (sel === 'missed') sgtMis++;
          }
        }
        if (sgtAtt > 0 || sgtMis > 0) {
          newSubjects[sgtKey] = { attended: sgtAtt, missed: sgtMis };
          changed = true;
          if (newSubjects[sgt.name]) {
            const old = newSubjects[sgt.name];
            const newAtt = Math.max(0, old.attended - sgtAtt);
            const newMis = Math.max(0, old.missed - sgtMis);
            if (newAtt === 0 && newMis === 0) delete newSubjects[sgt.name];
            else newSubjects[sgt.name] = { attended: newAtt, missed: newMis };
          }
        }
      }
      for (const [homeKey, sel] of Object.entries(rawHomeSelections)) {
        for (const sgt of sgtList) {
          const oldToken = `sgt-${sgt.id}`;
          if (homeKey.includes(oldToken)) {
            const date = homeKey.slice(0, 10);
            const rest = homeKey.slice(11);
            const sep = homeKey.charAt(10);
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
        persistSubjectsForMode(mode, newSubjects);
        persistHomeSelectionsForMode(mode, newHomeSelections);
        setSubjects(newSubjects);
        setHomeSelections(newHomeSelections);
      }
    } catch {}
  };

  const migrateAttendanceToIDs = (mode: 'preloaded' | 'custom', registry: Array<{ id: string; name: string; domain: 'academic' | 'clinical'; kind: string }>) => {
    const flag = `${ID_MIGRATION_FLAG_PREFIX}${mode}`;
    if (localStorage.getItem(flag) === 'true') return;
    try {
      const keys = getStorageKeys(mode);
      const currentSubjects: Record<string, AttendanceData> = JSON.parse(localStorage.getItem(keys.subjectsKey) || '{}');
      const currentWards: Record<string, AttendanceData> = JSON.parse(localStorage.getItem(keys.wardsKey) || '{}');
      const currentSelections: Record<string, SelectionType> = JSON.parse(localStorage.getItem(keys.homeSelectionsKey) || '{}');
      const currentFinished: Record<string, boolean> = JSON.parse(localStorage.getItem(keys.finishedMapKey) || '{}');
      const nextSubjects = { ...currentSubjects };
      const nextWards = { ...currentWards };
      const nextSelections = { ...currentSelections };
      const nextFinished = { ...currentFinished };
      const migratedSubjectAliases = new Set<string>();
      const migratedWardAliases = new Set<string>();
      const knownSubjectKeys = new Set<string>();
      const knownWardKeys = new Set<string>();
      const orphaned: Array<{ originalKey: string; type: 'subject' | 'ward' | 'homeSelection' | 'finished'; data: unknown }> = [];

      for (const ref of registry) {
        const canonical = ref.kind === 'sgt'
          ? getSGTKey(ref.id)
          : ref.domain === 'clinical'
            ? getWardAttendanceKey(ref.id)
            : getAcademicAttendanceKey(ref.id);
        const aliases = ref.kind === 'sgt'
          ? [getSGTKey(ref.id), ref.name]
          : ref.domain === 'clinical'
            ? [canonical, `ward-${ref.name}`, ref.name]
            : [canonical, ref.name];
        if (ref.domain === 'clinical' && ref.kind !== 'sgt') knownWardKeys.add(canonical);
        else knownSubjectKeys.add(canonical);
        const source = aliases.find(k => (ref.domain === 'clinical' && ref.kind !== 'sgt' ? currentWards[k] : currentSubjects[k]) !== undefined);
        if (!source || source === canonical) continue;
        if (ref.domain === 'clinical' && ref.kind !== 'sgt') {
          if (nextWards[canonical] === undefined) nextWards[canonical] = currentWards[source];
          migratedWardAliases.add(source);
        } else {
          if (nextSubjects[canonical] === undefined) nextSubjects[canonical] = currentSubjects[source];
          migratedSubjectAliases.add(source);
        }
        for (const [homeKey, selection] of Object.entries(currentSelections)) {
          const rewritten = rewriteHomeKey(homeKey, source, canonical);
          if (rewritten !== homeKey) {
            if (nextSelections[rewritten] === undefined) nextSelections[rewritten] = selection;
            delete nextSelections[homeKey];
          }
        }
        if (nextFinished[canonical] === undefined && currentFinished[source] !== undefined) nextFinished[canonical] = currentFinished[source];
        delete nextFinished[source];
      }

      for (const key of Object.keys(currentSubjects)) {
        if (key.startsWith('academic:') || key.startsWith('sgt:') || migratedSubjectAliases.has(key)) continue;
        orphaned.push({ originalKey: key, type: 'subject', data: currentSubjects[key] });
        delete nextSubjects[key];
        delete nextFinished[key];
      }
      for (const key of Object.keys(currentWards)) {
        if (key.startsWith('ward:') || migratedWardAliases.has(key)) continue;
        orphaned.push({ originalKey: key, type: 'ward', data: currentWards[key] });
        delete nextWards[key];
        delete nextFinished[key];
      }
      const knownTokens = [...knownSubjectKeys, ...knownWardKeys, ...migratedSubjectAliases, ...migratedWardAliases].map(k => k.toLowerCase());
      for (const [homeKey, selection] of Object.entries(currentSelections)) {
        const rest = homeKey.slice(11).toLowerCase();
        const recognized = knownTokens.some(token => rest === token || rest.startsWith(`${token}-`) || rest.startsWith(`${token}_`));
        if (!recognized) {
          orphaned.push({ originalKey: homeKey, type: 'homeSelection', data: selection });
          delete nextSelections[homeKey];
        }
      }
      for (const [finishedKey, finished] of Object.entries(currentFinished)) {
        if (nextFinished[finishedKey] !== undefined && (finishedKey.startsWith('academic:') || finishedKey.startsWith('ward:') || finishedKey.startsWith('sgt:'))) continue;
        if (nextSubjects[finishedKey] === undefined && nextWards[finishedKey] === undefined) {
          orphaned.push({ originalKey: finishedKey, type: 'finished', data: finished });
          delete nextFinished[finishedKey];
        }
      }

      const oldOrphans = JSON.parse(localStorage.getItem(ORPHANED_RECORDS_KEY) || '[]');
      const orphanJson = JSON.stringify([...oldOrphans, ...orphaned]);
      persistSubjectsForMode(mode, nextSubjects);
      persistWardsForMode(mode, nextWards);
      persistHomeSelectionsForMode(mode, nextSelections);
      persistFinishedMapForMode(mode, nextFinished);
      localStorage.setItem(ORPHANED_RECORDS_KEY, orphanJson); storageSetItem(ORPHANED_RECORDS_KEY, orphanJson);
      setSubjects(nextSubjects); setWards(nextWards); setHomeSelections(nextSelections); setFinishedMap(nextFinished);
      localStorage.setItem(flag, 'true'); storageSetItem(flag, 'true');
    } catch {}
  };

  const removeAttendanceEntitiesForMode = (mode: 'preloaded' | 'custom', entities: Array<{ key: string; type: 'subject' | 'ward'; legacyKey?: string }>) => {
    if (entities.length === 0) return;
    const keys = getStorageKeys(mode);
    try {
      const subjectData: Record<string, AttendanceData> = JSON.parse(localStorage.getItem(keys.subjectsKey) || '{}');
      const wardData: Record<string, AttendanceData> = JSON.parse(localStorage.getItem(keys.wardsKey) || '{}');
      const selectionData: Record<string, SelectionType> = JSON.parse(localStorage.getItem(keys.homeSelectionsKey) || '{}');
      const finishedData: Record<string, boolean> = JSON.parse(localStorage.getItem(keys.finishedMapKey) || '{}');
      const aliases = entities.flatMap(entity => [entity.key, entity.legacyKey].filter((x): x is string => Boolean(x)));
      const matches = (storedKey: string, alias: string) => {
        const date = storedKey.slice(0, 10);
        if (!DATE_RE.test(date)) return false;
        const rest = storedKey.slice(11).toLowerCase();
        const a = alias.toLowerCase();
        return rest === a || rest.startsWith(`${a}-`) || rest.startsWith(`${a}_`);
      };
      for (const entity of entities) {
        const target = entity.type === 'ward' ? wardData : subjectData;
        for (const alias of [entity.key, entity.legacyKey].filter((x): x is string => Boolean(x))) delete target[alias];
      }
      for (const key of Object.keys(finishedData)) if (aliases.some(alias => key.toLowerCase() === alias.toLowerCase())) delete finishedData[key];
      for (const key of Object.keys(selectionData)) if (aliases.some(alias => matches(key, alias))) delete selectionData[key];
      const subjectJson = JSON.stringify(subjectData); const wardJson = JSON.stringify(wardData); const selectionJson = JSON.stringify(selectionData); const finishedJson = JSON.stringify(finishedData);
      localStorage.setItem(keys.subjectsKey, subjectJson); storageSetItem(keys.subjectsKey, subjectJson);
      localStorage.setItem(keys.wardsKey, wardJson); storageSetItem(keys.wardsKey, wardJson);
      localStorage.setItem(keys.homeSelectionsKey, selectionJson); storageSetItem(keys.homeSelectionsKey, selectionJson);
      localStorage.setItem(keys.finishedMapKey, finishedJson); storageSetItem(keys.finishedMapKey, finishedJson);
      if (mode === subjectMode) { setSubjects(subjectData); setWards(wardData); setHomeSelections(selectionData); setFinishedMap(finishedData); }
    } catch {}
  };

  const getHomeSelection = (
    dateStr: string,
    subjectKey: string,
    sessionId?: string
  ): SelectionType | undefined => {
    const candidates: string[] = [];
    if (sessionId) {
      candidates.push(`${dateStr}-${subjectKey}-${sessionId}`);
      candidates.push(`${dateStr}_${subjectKey}_${sessionId}`);
    } else {
      candidates.push(`${dateStr}-${subjectKey}`);
      candidates.push(`${dateStr}_${subjectKey}`);
    }
    for (const cand of candidates) if (homeSelections[cand]) return homeSelections[cand];
    if (sessionId) {
      for (const [key, sel] of Object.entries(homeSelections)) {
        if (key.startsWith(dateStr) && (key.endsWith(`-${sessionId}`) || key.endsWith(`_${sessionId}`))) return sel;
      }
    }
    return undefined;
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
    reopenFinishedIfPlanIncreased,
    updateHomeSelection,
      resetAllData,
      renameSubjectData,
      renameWardData,
      removeSubjectData,
      removeWardData,
      removeAttendanceByKey,
      removeAttendanceEntitiesForMode,
      getHomeSelection,
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
