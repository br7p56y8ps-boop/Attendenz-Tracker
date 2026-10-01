import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { storageSetItem, storageRemoveItem, storageSetItemChecked, storageCommitChecked } from '@/lib/idb';
import { snapshotBeforeEdit, snapshotDayComplete } from '@/utils/snapshotUtils';
import { useCustomData } from '@/contexts/CustomDataContext';

export type AttendanceData = { attended: number; missed: number };
export type SelectionType = 'off' | 'missed' | 'attended';

const SGT_KEY_PREFIX = 'sgt:';
const stripRegistryPrefix = (id: string): string => id.trim().replace(/^(?:academic|acad|ward|sgt|int)[:\-_]/i, '');
export const getSGTKey = (id: string) => `${SGT_KEY_PREFIX}${stripRegistryPrefix(id)}`;
export const getAcademicAttendanceKey = (subjectId: string) => /^int[:\-_]/i.test(subjectId) ? `int:${stripRegistryPrefix(subjectId)}` : `academic:${stripRegistryPrefix(subjectId)}`;
export const getWardAttendanceKey = (wardId: string) => `ward:${stripRegistryPrefix(wardId)}`;
export const isSGTKey = (key: string) => key.startsWith(SGT_KEY_PREFIX);
export const getCanonicalAttendanceKey = (ref: { id: string; domain: 'academic' | 'clinical'; kind: string }): string =>
  ref.kind === 'sgt' ? getSGTKey(ref.id) : ref.domain === 'clinical' ? getWardAttendanceKey(ref.id) : getAcademicAttendanceKey(ref.id);

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
  removeSubjectData: (subjectName: string, canonicalKey?: string) => void;
  removeWardData: (wardName: string, canonicalKey?: string) => void;
  removeAttendanceByKey: (key: string) => void;
  removeAttendanceEntitiesForMode: (mode: 'preloaded' | 'custom', entities: Array<{ key: string; type: 'subject' | 'ward'; legacyKey?: string }>) => void;
  getHomeSelection: (dateStr: string, subjectKey: string, sessionId?: string, isWard?: boolean) => SelectionType | undefined;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}

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
const ID_MIGRATION_FLAG_PREFIX = 'att_attendance_key_migration_v5_done_';


const getActualMode = (): 'preloaded' | 'custom' => {
  const m = localStorage.getItem('att_subject_mode');
  return m === 'custom' ? 'custom' : 'preloaded';
};

export const AttendanceProvider = ({ children }: { children: ReactNode }) => {
  const { subjectMode, subjectRegistry, userAddedSubjectsHydrated } = useCustomData();

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
    } catch (error) {
      console.error('Attendance mode migration failed; existing data was preserved.', error);
    }
  };

  useEffect(() => {
    migrateModeSeparation();
    const actualMode = getActualMode();
    loadDataForMode(actualMode);
    try {
      const p = localStorage.getItem(PREFERRED_PERCENTAGE_KEY);
      if (p) setPreferredPercentage(JSON.parse(p));
    } catch {}
  }, []);

  useEffect(() => {
    loadDataForMode(subjectMode);
    if (userAddedSubjectsHydrated && subjectRegistry.length > 0) {
      void migrateCanonicalAttendanceKeys(subjectMode, subjectRegistry);
    }
  }, [subjectMode, subjectRegistry, userAddedSubjectsHydrated]);

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

  const savePreferredPercentage = useStableCallback((p: number) => {
    setPreferredPercentage(p);
    void storageSetItemChecked(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
  });

  const updateSubject = useStableCallback((subjectKey: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${subjectKey}`);
    setSubjects(prev => {
      const updated = { ...prev, [subjectKey]: { attended, missed } };
      persistSubjectsForMode(subjectMode, updated);
      return updated;
    });
  });

  const updateWard = useStableCallback((wardKey: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${wardKey}`);
    setWards(prev => {
      const updated = { ...prev, [wardKey]: { attended, missed } };
      persistWardsForMode(subjectMode, updated);
      return updated;
    });
  });

  const toggleFinished = useStableCallback((key: string) => {
    snapshotBeforeEdit(`Toggle Finished ${key}`);
    setFinishedMap(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      persistFinishedMapForMode(subjectMode, updated);
      return updated;
    });
  });

  const reopenFinishedIfPlanIncreased = useStableCallback((key: string, plannedTotal: number, isWard: boolean) => {
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
  });

  const updateHomeSelection = useStableCallback((
    homeKey: string,
    subjectKey: string,
    selection: SelectionType,
    isWard: boolean,
    totalCardsOnScreen?: number
  ) => {
    const previous = homeSelections[homeKey];
    const newSelections = previous === selection
      ? Object.fromEntries(Object.entries(homeSelections).filter(([key]) => key !== homeKey))
      : { ...homeSelections, [homeKey]: selection };
    const markedCount = Object.keys(newSelections).length;
    persistHomeSelectionsForMode(subjectMode, newSelections);
    setHomeSelections(newSelections);

    let deltaAttended = previous === 'attended' ? -1 : 0;
    let deltaMissed = previous === 'missed' ? -1 : 0;
    if (previous !== selection) {
      if (selection === 'attended') deltaAttended += 1;
      if (selection === 'missed') deltaMissed += 1;
    }
    if (isWard) {
      const current = wards[subjectKey] || { attended: 0, missed: 0 };
      const updated = { ...wards, [subjectKey]: {
        attended: Math.max(0, current.attended + deltaAttended),
        missed: Math.max(0, current.missed + deltaMissed),
      }};
      persistWardsForMode(subjectMode, updated);
      setWards(updated);
    } else {
      const current = subjects[subjectKey] || { attended: 0, missed: 0 };
      const updated = { ...subjects, [subjectKey]: {
        attended: Math.max(0, current.attended + deltaAttended),
        missed: Math.max(0, current.missed + deltaMissed),
      }};
      persistSubjectsForMode(subjectMode, updated);
      setSubjects(updated);
    }

    const targetCardCount = totalCardsOnScreen || (Object.keys(subjects).length + Object.keys(wards).length);
    if (targetCardCount > 0 && markedCount >= targetCardCount) {
      snapshotDayComplete(true);
    } else {
      snapshotDayComplete(false);
    }
  });

  const resetAllData = useStableCallback(() => {
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
  });

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

  const renameSubjectData = useStableCallback((oldName: string, newName: string) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o === n) return;
    snapshotBeforeEdit(`Rename subject data: ${o} → ${n}`);
    renameStoreKey(setSubjects, (d) => persistSubjectsForMode(subjectMode, d), o, n);
    renameStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), o, n);
    renameHomeSelectionsFor(o, n);
  });

  const renameWardData = useStableCallback((oldName: string, newName: string) => {
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o === n) return;
    snapshotBeforeEdit(`Rename ward data: ${o} → ${n}`);
    const oldKey = `ward-${o}`;
    const newKey = `ward-${n}`;
    renameStoreKey(setWards, (d) => persistWardsForMode(subjectMode, d), oldKey, newKey);
    renameStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), oldKey, newKey);
    renameHomeSelectionsFor(oldKey, newKey);
  });

  const removeSubjectData = useStableCallback((subjectName: string, canonicalKey?: string) => {
    const t = subjectName.trim();
    if (!t) return;
    snapshotBeforeEdit(`Delete subject data: ${t}`);
    removeStoreKey(setSubjects, (d) => persistSubjectsForMode(subjectMode, d), t);
    removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), t);
    removeHomeSelectionsFor(t);
    if (canonicalKey && canonicalKey !== t) removeAttendanceEntitiesForMode(subjectMode, [{ key: canonicalKey, type: 'subject', legacyKey: t }]);
  });

  const removeWardData = useStableCallback((wardName: string, canonicalKey?: string) => {
    const t = wardName.trim();
    if (!t) return;
    snapshotBeforeEdit(`Delete ward data: ${t}`);
    const wardKey = `ward-${t}`;
    removeStoreKey(setWards, (d) => persistWardsForMode(subjectMode, d), wardKey);
    removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), wardKey);
    removeHomeSelectionsFor(wardKey);
    if (canonicalKey && canonicalKey !== wardKey) removeAttendanceEntitiesForMode(subjectMode, [{ key: canonicalKey, type: 'ward', legacyKey: wardKey }]);
  });

  const removeAttendanceByKey = useStableCallback((key: string) => {
    if (!key) return;
    snapshotBeforeEdit(`Delete attendance key: ${key}`);
    if (isSGTKey(key) || (!key.startsWith('ward:') && !key.startsWith('ward-') && !key.startsWith('ward_'))) {
      removeStoreKey(setSubjects, (d) => persistSubjectsForMode(subjectMode, d), key);
      removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), key);
      removeHomeSelectionsFor(key);
    } else {
      removeStoreKey(setWards, (d) => persistWardsForMode(subjectMode, d), key);
      removeStoreKey(setFinishedMap, (d) => persistFinishedMapForMode(subjectMode, d), key);
      removeHomeSelectionsFor(key);
    }
  });

  const migrateCanonicalAttendanceKeys = async (mode: 'preloaded' | 'custom', registry: Array<{ id: string; name: string; domain: 'academic' | 'clinical'; kind: string }>) => {
    const flag = `${ID_MIGRATION_FLAG_PREFIX}${mode}`;
    try {
      const keys = getStorageKeys(mode);
      const refs = registry.filter(ref => Boolean(ref.id && ref.name));
      const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
      const canonicalFor = (ref: typeof refs[number]) => getCanonicalAttendanceKey(ref);
      const aliasesFor = (ref: typeof refs[number]) => {
        const canonical = canonicalFor(ref);
        const base = stripRegistryPrefix(ref.id);
        const kindAliases = ref.kind === 'sgt'
          ? [`sgt:${base}`, `sgt:${ref.id}`, `sgt-${base}`, `sgt_${base}`]
          : ref.kind === 'integrated'
            ? [`int:${base}`, `int-${base}`, `int_${base}`, `academic:int:${base}`, `academic-int:${base}`, `academic_int:${base}`]
            : ref.domain === 'clinical'
              ? [`ward:${base}`, `ward:${ref.id}`, `ward-${base}`, `ward_${base}`, ref.name]
              : [`academic:${base}`, `acad:${base}`, `academic:${ref.id}`, `acad:${ref.id}`, `academic-${base}`, `academic_${base}`, `acad-${base}`, `acad_${base}`, ref.name];
        return new Set([canonical, ref.id, ref.name, ...kindAliases].map(value => value.toLowerCase()));
      };
      const findRef = (raw: string, isWard: boolean) => {
        const key = raw.toLowerCase();
        return refs.find(ref => {
          if ((ref.domain === 'clinical' && ref.kind !== 'sgt') !== isWard) return false;
          const aliases = aliasesFor(ref);
          if (aliases.has(key)) return true;
          const normalized = normalize(raw);
          return [...aliases].some(alias => normalize(alias) === normalized);
        });
      };
      const splitHomeKey = (key: string) => {
        if (!/^\d{4}-\d{2}-\d{2}[-_]/.test(key)) return null;
        return { date: key.slice(0, 10), sep: key.charAt(10), rest: key.slice(11) };
      };
      const findHomeRef = (key: string) => {
        const split = splitHomeKey(key);
        if (!split) return undefined;
        const rest = split.rest.toLowerCase();
        return refs.find(ref => [...aliasesFor(ref)].some(alias => rest === alias || rest.startsWith(`${alias}-`) || rest.startsWith(`${alias}_`)));
      };
      if (localStorage.getItem(flag) === 'true') return;
      const adoptOrphans = async () => {
        let orphaned: Array<{ originalKey?: string; type?: string; data?: unknown }> = [];
        try {
          const parsed = JSON.parse(localStorage.getItem('attendance_tracker_orphaned_records') || '[]');
          if (Array.isArray(parsed)) orphaned = parsed.filter(item => item && typeof item === 'object');
        } catch { return; }
        if (orphaned.length === 0) return;

        const keys = getStorageKeys(mode);
        const readLocalMap = <T,>(key: string): T => {
          try { return JSON.parse(localStorage.getItem(key) || '{}') as T; } catch { return {} as T; }
        };
        const subjectsData = readLocalMap<Record<string, AttendanceData>>(keys.subjectsKey);
        const wardsData = readLocalMap<Record<string, AttendanceData>>(keys.wardsKey);
        const selectionsData = readLocalMap<Record<string, SelectionType>>(keys.homeSelectionsKey);
        const finishedData = readLocalMap<Record<string, boolean>>(keys.finishedMapKey);
        const retained: typeof orphaned = [];
        const seen = new Set<string>();
        let changed = false;
        const canonicalHomeKey = (originalKey: string, ref: typeof refs[number]): string => {
          const split = splitHomeKey(originalKey);
          if (!split) return canonicalFor(ref);
          const rest = split.rest;
          const alias = [...aliasesFor(ref)].sort((a, b) => b.length - a.length)
            .find(candidate => rest.toLowerCase() === candidate || rest.toLowerCase().startsWith(`${candidate}-`) || rest.toLowerCase().startsWith(`${candidate}_`));
          return alias ? `${split.date}${split.sep}${canonicalFor(ref)}${rest.slice(alias.length)}` : originalKey;
        };

        for (const orphan of orphaned) {
          const originalKey = typeof orphan.originalKey === 'string' ? orphan.originalKey : '';
          const type = typeof orphan.type === 'string' ? orphan.type : '';
          const dedupeKey = `${type}\u0000${originalKey.toLowerCase()}`;
          if (!originalKey || seen.has(dedupeKey)) { changed = true; continue; }
          seen.add(dedupeKey);
          const isWard = type === 'ward';
          const ref = type === 'homeSelection' ? findHomeRef(originalKey) : findRef(originalKey, isWard);
          if (!ref || !['subject', 'ward', 'homeSelection', 'finished'].includes(type)) {
            retained.push(orphan);
            continue;
          }
          const canonical = canonicalFor(ref);
          if (type === 'subject' || type === 'ward') {
            const value = orphan.data && typeof orphan.data === 'object' ? orphan.data as AttendanceData : null;
            if (!value || !Number.isFinite(value.attended) || !Number.isFinite(value.missed)) {
              retained.push(orphan);
              continue;
            }
            const target = type === 'ward' ? wardsData : subjectsData;
            const previous = target[canonical];
            if (previous) {
              changed = true;
              continue;
            }
            target[canonical] = value;
            changed = true;
          } else if (type === 'homeSelection') {
            if (orphan.data !== 'attended' && orphan.data !== 'missed' && orphan.data !== 'off') {
              retained.push(orphan);
              continue;
            }
            const homeKey = canonicalHomeKey(originalKey, ref);
            if (selectionsData[homeKey] !== undefined) {
              changed = true;
              continue;
            }
            selectionsData[homeKey] = orphan.data;
            changed = true;
          } else {
            if (finishedData[canonical] !== undefined) {
              changed = true;
              continue;
            }
            finishedData[canonical] = Boolean(orphan.data);
            changed = true;
          }
        }
        if (!changed) return;
        const nextOrphans = JSON.stringify(retained);
        await storageCommitChecked([
          [keys.subjectsKey, JSON.stringify(subjectsData)],
          [keys.wardsKey, JSON.stringify(wardsData)],
          [keys.homeSelectionsKey, JSON.stringify(selectionsData)],
          [keys.finishedMapKey, JSON.stringify(finishedData)],
          ['attendance_tracker_orphaned_records', nextOrphans],
        ]);
        setSubjects(subjectsData); setWards(wardsData); setHomeSelections(selectionsData); setFinishedMap(finishedData);
      };
      const migrateAttendanceMap = (raw: Record<string, AttendanceData>, isWard: boolean) => {
        const next: Record<string, AttendanceData> = {};
        let changed = false;
        for (const [storedKey, value] of Object.entries(raw)) {
          const ref = findRef(storedKey, isWard);
          if (!ref) { next[storedKey] = value; continue; }
          const canonical = canonicalFor(ref);
          if (canonical !== storedKey) changed = true;
          const previous = next[canonical];
          next[canonical] = previous
            ? { attended: previous.attended + value.attended, missed: previous.missed + value.missed }
            : value;
        }
        return { next, changed };
      };
      const migrateSelections = (raw: Record<string, SelectionType>) => {
        const next: Record<string, SelectionType> = {};
        let changed = false;
        for (const [storedKey, value] of Object.entries(raw)) {
          const split = splitHomeKey(storedKey);
          const ref = findHomeRef(storedKey);
          if (!split || !ref) { next[storedKey] = value; continue; }
          const canonical = canonicalFor(ref);
          const rest = split.rest;
          const aliases = [...aliasesFor(ref)].sort((a, b) => b.length - a.length);
          const alias = aliases.find(candidate => rest.toLowerCase() === candidate || rest.toLowerCase().startsWith(`${candidate}-`) || rest.toLowerCase().startsWith(`${candidate}_`));
          if (!alias) { next[storedKey] = value; continue; }
          const suffix = rest.slice(alias.length);
          const newKey = `${split.date}${split.sep}${canonical}${suffix}`;
          if (newKey !== storedKey) changed = true;
          if (next[newKey] === undefined) next[newKey] = value;
        }
        return { next, changed };
      };
      const migrateFinished = (raw: Record<string, boolean>) => {
        const next: Record<string, boolean> = {};
        let changed = false;
        for (const [storedKey, value] of Object.entries(raw)) {
          const ref = refs.find(candidate => [...aliasesFor(candidate)].includes(storedKey.toLowerCase()) || normalize(candidate.name) === normalize(storedKey));
          if (!ref) { next[storedKey] = value; continue; }
          const canonical = canonicalFor(ref);
          if (canonical !== storedKey) changed = true;
          next[canonical] = Boolean(next[canonical] || value);
        }
        return { next, changed };
      };
      const readMap = (key: string): any => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
      const subjectsResult = migrateAttendanceMap(readMap(keys.subjectsKey), false);
      const wardsResult = migrateAttendanceMap(readMap(keys.wardsKey), true);
      const selectionsResult = migrateSelections(readMap(keys.homeSelectionsKey));
      const finishedResult = migrateFinished(readMap(keys.finishedMapKey));
      const entries: Array<[string, string]> = [
        [keys.subjectsKey, JSON.stringify(subjectsResult.next)],
        [keys.wardsKey, JSON.stringify(wardsResult.next)],
        [keys.homeSelectionsKey, JSON.stringify(selectionsResult.next)],
        [keys.finishedMapKey, JSON.stringify(finishedResult.next)],
      ];
      for (const bundleKey of Object.keys(localStorage)) {
        if (!bundleKey.startsWith('att_curriculum_bundle_')) continue;
        try {
          const bundle = JSON.parse(localStorage.getItem(bundleKey) || '{}') as Record<string, string>;
          let bundleChanged = false;
          for (const [storeKey, isWard, migrate] of [
            ['attendance_tracker_subjects_preset', false, migrateAttendanceMap],
            ['attendance_tracker_subjects_custom', false, migrateAttendanceMap],
            ['attendance_tracker_ward_preset', true, migrateAttendanceMap],
            ['attendance_tracker_ward_custom', true, migrateAttendanceMap],
          ] as const) {
            if (bundle[storeKey] === undefined) continue;
            let parsed: Record<string, any>;
            try { parsed = JSON.parse(bundle[storeKey]); } catch { continue; }
            const result = migrate(parsed, isWard);
            if (result.changed) { bundle[storeKey] = JSON.stringify(result.next); bundleChanged = true; }
          }
          for (const storeKey of ['attendance_tracker_home_selections_preset', 'attendance_tracker_home_selections_custom']) {
            if (bundle[storeKey] === undefined) continue;
            let parsed: Record<string, SelectionType>;
            try { parsed = JSON.parse(bundle[storeKey]); } catch { continue; }
            const result = migrateSelections(parsed);
            if (result.changed) { bundle[storeKey] = JSON.stringify(result.next); bundleChanged = true; }
          }
          for (const storeKey of ['attendance_tracker_finished_map_preset', 'attendance_tracker_finished_map_custom']) {
            if (bundle[storeKey] === undefined) continue;
            let parsed: Record<string, boolean>;
            try { parsed = JSON.parse(bundle[storeKey]); } catch { continue; }
            const result = migrateFinished(parsed);
            if (result.changed) { bundle[storeKey] = JSON.stringify(result.next); bundleChanged = true; }
          }
          if (bundleChanged) entries.push([bundleKey, JSON.stringify(bundle)]);
        } catch { /* preserve malformed unrelated bundles */ }
      }
      await storageCommitChecked(entries);
      setSubjects(subjectsResult.next); setWards(wardsResult.next); setHomeSelections(selectionsResult.next); setFinishedMap(finishedResult.next);
      await adoptOrphans();
      await storageSetItemChecked(flag, 'true');
    } catch (error) {
      console.error('Canonical attendance-key migration failed; existing data was preserved.', error);
    }
  };
  const removeAttendanceEntitiesForMode = useStableCallback((mode: 'preloaded' | 'custom', entities: Array<{ key: string; type: 'subject' | 'ward'; legacyKey?: string }>) => {
    if (entities.length === 0) return;
    const keys = getStorageKeys(mode);
    try {
      const subjectData: Record<string, AttendanceData> = JSON.parse(localStorage.getItem(keys.subjectsKey) || '{}');
      const wardData: Record<string, AttendanceData> = JSON.parse(localStorage.getItem(keys.wardsKey) || '{}');
      const selectionData: Record<string, SelectionType> = JSON.parse(localStorage.getItem(keys.homeSelectionsKey) || '{}');
      const finishedData: Record<string, boolean> = JSON.parse(localStorage.getItem(keys.finishedMapKey) || '{}');
      const aliases = entities.flatMap(entity => [entity.key, entity.legacyKey].filter((x): x is string => Boolean(x)));
      let subjectsChanged = false;
      let wardsChanged = false;
      let selectionsChanged = false;
      let finishedChanged = false;
      const matches = (storedKey: string, alias: string) => {
        const date = storedKey.slice(0, 10);
        if (!DATE_RE.test(date)) return false;
        const rest = storedKey.slice(11).toLowerCase();
        const a = alias.toLowerCase();
        return rest === a || rest.startsWith(`${a}-`) || rest.startsWith(`${a}_`);
      };
      for (const entity of entities) {
        const target = entity.type === 'ward' ? wardData : subjectData;
        for (const alias of [entity.key, entity.legacyKey].filter((x): x is string => Boolean(x))) {
          const aliasLower = alias.toLowerCase();
          for (const storedKey of Object.keys(target)) {
            if (storedKey.toLowerCase() === aliasLower) {
              delete target[storedKey];
              if (entity.type === 'ward') wardsChanged = true;
              else subjectsChanged = true;
            }
          }
        }
      }
      for (const key of Object.keys(finishedData)) {
        if (aliases.some(alias => key.toLowerCase() === alias.toLowerCase())) {
          delete finishedData[key];
          finishedChanged = true;
        }
      }
      for (const key of Object.keys(selectionData)) {
        if (aliases.some(alias => matches(key, alias))) {
          delete selectionData[key];
          selectionsChanged = true;
        }
      }
      const entries: Array<[string, string]> = [];
      if (subjectsChanged) entries.push([keys.subjectsKey, JSON.stringify(subjectData)]);
      if (wardsChanged) entries.push([keys.wardsKey, JSON.stringify(wardData)]);
      if (selectionsChanged) entries.push([keys.homeSelectionsKey, JSON.stringify(selectionData)]);
      if (finishedChanged) entries.push([keys.finishedMapKey, JSON.stringify(finishedData)]);
      if (entries.length > 0) {
        void storageCommitChecked(entries).catch(error => {
          console.error('Attendance entity cleanup migration failed; existing data was preserved.', error);
        });
      }
      if (mode === subjectMode) { setSubjects(subjectData); setWards(wardData); setHomeSelections(selectionData); setFinishedMap(finishedData); }
    } catch (error) {
      console.error('Attendance entity cleanup failed; existing data was preserved.', error);
    }
  });

  const getHomeSelection = useStableCallback((
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
  });

  const contextValue = useMemo<AttendanceContextType>(() => ({
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
  }), [subjects, wards, homeSelections, finishedMap, preferredPercentage]);

  return (
    <AttendanceContext.Provider value={contextValue}>
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
