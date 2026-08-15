import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  getCurrentDateStr,
  canonicalTimeRange,
  canonicalizeTimeRange,
  isCanonicalTimeRange,
  parseRangeToMinutes,
} from '@/lib/utils';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';
import { snapshotBeforeEdit } from '@/utils/snapshotUtils';
import { TIMETABLE, WARD_SCHEDULE, CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';
import { APP_VERSION } from '@/lib/appVersion';

export interface CustomSubject {
  id: string;
  name: string;
  subjectType: 'single' | 'allied' | 'allied-parent';
  parentName?: string;
  category?: string;
  plannedClasses: number;
  days: string;
  time: string;
  schedules?: Array<{ day: string; time: string }>;
  startDate?: string;
  endDate?: string;
  clinicalSubject?: string;
}
export interface CustomWard {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  morningTime?: string;
  eveningTime?: string;
}
export interface ScheduleRowInput {
  day: string;
  time?: string;
  start?: string;
  end?: string;
}
export interface UserAddedSubject {
  id: string;
  name: string;
  subjectType: 'single' | 'allied' | 'allied-parent';
  parentName?: string;
  category?: string;
  plannedClasses: number;
  days: string;
  time: string;
  schedules?: Array<{ day: string; start: string; end: string }>;
  startDate?: string;
  endDate?: string;
  clinicalSubject?: string;
}
export interface PresetWardEntry {
  start: string;
  end: string;
  ward: string;
  morningTime?: string;
  eveningTime?: string;
  addedByUser?: boolean;
}

export type SubjectMode = 'preloaded' | 'custom';
export type SubjectDomain = 'academic' | 'clinical';

export interface SubjectTimeConflict {
  day: string;
  time: string;
  subjects: string[];
  exact: boolean;
}
export interface WardDateConflict {
  ward: string;
  start: string;
  end: string;
}

export const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const CUSTOM_SUBJECTS_KEY = 'att_custom_subjects';
const CUSTOM_WARDS_KEY = 'att_custom_wards';
const SUBJECT_MODE_KEY = 'att_subject_mode';
const SETUP_DONE_KEY = 'att_setup_done';
const WHATS_NEW_KEY = `att_whats_new_v${APP_VERSION}`;
const USER_ADDED_SUBJECTS_KEY = 'att_user_added_subjects';
const PRESET_TIMETABLE_KEY = 'att_preset_timetable';
const PRESET_WARD_SCHEDULE_KEY = 'att_preset_ward_schedule';
const PRESET_SUBJECT_TOTALS_KEY = 'att_preset_subject_totals';
const PRESET_RENAMES_KEY = 'att_preset_subject_renames';
const DEFAULT_MORNING_TIME = '09:30 AM–11:30 AM';
const DEFAULT_EVENING_TIME = '07:00 PM–09:00 PM';
const genId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export const parseDayList = (days: string): string[] =>
  (days || '')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);
export const getEffectiveParentName = (
  s: { parentName?: string; category?: string }
): string | undefined => {
  const p = (s.parentName || s.category || '').trim();
  return p.length > 0 ? p : undefined;
};
export const normalizeTimeStr = (t: string): string =>
  (t || '')
    .replace(/\s+/g, ' ')
    .replace(/[–—−]/g, '-')
    .trim()
    .toLowerCase();
export const timesOverlap = (a: string, b: string): boolean => {
  const ra = parseRangeToMinutes(a);
  const rb = parseRangeToMinutes(b);
  if (!ra || !rb) return false;
  return ra.start < rb.end && rb.start < ra.end;
};
const sameRange = (a: string, b: string): boolean =>
  canonicalizeTimeRange(a) === canonicalizeTimeRange(b);
const canonTokens = (time: string): { start: string; end: string } => {
  const m = canonicalizeTimeRange(time).match(/^(\d{2}:\d{2} (?:AM|PM))–(\d{2}:\d{2} (?:AM|PM))$/);
  return m ? { start: m[1], end: m[2] } : { start: time, end: time };
};
const rowTime = (sch: ScheduleRowInput): string =>
  sch.time ? canonicalizeTimeRange(sch.time) : canonicalTimeRange(sch.start || '', sch.end || '');
interface MutableSlot {
  type?: string;
  time: string;
  subjects: string[];
  [k: string]: unknown;
}
const asMutable = (tt: typeof TIMETABLE): Record<number, MutableSlot[]> =>
  tt as unknown as Record<number, MutableSlot[]>;
const asTimetable = (tt: Record<number, MutableSlot[]>): typeof TIMETABLE =>
  tt as unknown as typeof TIMETABLE;
const isWardSlotType = (t?: string): boolean => t === 'ward' || t === 'ward_replacement';
const insertSubjectSlot = (
  base: typeof TIMETABLE,
  name: string,
  dayAbbr: string,
  time: string
): typeof TIMETABLE => {
  const src = asMutable(base);
  const next: Record<number, MutableSlot[]> = {};
  for (const key of Object.keys(src)) next[Number(key)] = [...src[Number(key)]];
  const dayIdx = DAY_ABBRS.indexOf(dayAbbr as (typeof DAY_ABBRS)[number]);
  if (dayIdx === -1) return base;
  const slots = [...(next[dayIdx] || [])];
  const exactIdx = slots.findIndex(
    s => !isWardSlotType(s.type) && sameRange(s.time, time)
  );
  if (exactIdx !== -1) {
    const slot = slots[exactIdx];
    if (!slot.subjects.some(s => s.toLowerCase() === name.toLowerCase())) {
      slots[exactIdx] = { ...slot, subjects: [...slot.subjects, name] };
    }
  } else {
    slots.push({ type: 'regular', time, subjects: [name] });
  }
  next[dayIdx] = slots;
  return asTimetable(next);
};
const insertSubjectIntoTimetable = (
  base: typeof TIMETABLE,
  name: string,
  days: string[],
  time: string
): typeof TIMETABLE => {
  let tt = base;
  for (const d of days) tt = insertSubjectSlot(tt, name, d, time);
  return tt;
};
const removeSubjectFromTimetable = (base: typeof TIMETABLE, name: string): typeof TIMETABLE => {
  const src = asMutable(base);
  const next: Record<number, MutableSlot[]> = {};
  const target = name.trim().toLowerCase();
  for (const key of Object.keys(src)) {
    const dayIdx = Number(key);
    next[dayIdx] = src[dayIdx]
      .map(slot =>
        slot.subjects.some(s => s.toLowerCase() === target)
          ? { ...slot, subjects: slot.subjects.filter(s => s.toLowerCase() !== target) }
          : slot
      )
      .filter(slot => isWardSlotType(slot.type) || slot.subjects.length > 0);
  }
  return asTimetable(next);
};
const syncSubjectSchedules = (
  base: typeof TIMETABLE,
  name: string,
  rows: ScheduleRowInput[]
): typeof TIMETABLE => {
  let tt = removeSubjectFromTimetable(base, name);
  for (const sch of rows) tt = insertSubjectSlot(tt, name, sch.day, rowTime(sch));
  return tt;
};
const sortWardEntries = (list: PresetWardEntry[]): PresetWardEntry[] =>
  [...list].sort((a, b) => a.start.localeCompare(b.start));
const defaultWardSchedule = (): PresetWardEntry[] =>
  WARD_SCHEDULE.map(ws => ({
    ...ws,
    morningTime: DEFAULT_MORNING_TIME,
    eveningTime: DEFAULT_EVENING_TIME,
  }));

const canonTime = (t?: string): { value?: string; changed: boolean } => {
  if (t === undefined || t === null || t === '') return { value: t, changed: false };
  if (isCanonicalTimeRange(t)) return { value: t, changed: false };
  const c = canonicalizeTimeRange(t);
  return { value: c, changed: c !== t };
};

function migrateStoredRoutines(): void {
  try {
    const writes: Array<{ key: string; value: string }> = [];

    const ptRaw = localStorage.getItem(PRESET_TIMETABLE_KEY);
    if (ptRaw) {
      const tt = JSON.parse(ptRaw);
      let changed = false;
      for (const key of Object.keys(tt || {})) {
        const slots = (tt as Record<string, MutableSlot[]>)[key];
        if (!Array.isArray(slots)) continue;
        for (const slot of slots) {
          const r = canonTime(slot?.time);
          if (r.changed) { slot.time = r.value; changed = true; }
        }
      }
      if (changed) writes.push({ key: PRESET_TIMETABLE_KEY, value: JSON.stringify(tt) });
    }

    const pwsRaw = localStorage.getItem(PRESET_WARD_SCHEDULE_KEY);
    if (pwsRaw) {
      const list = JSON.parse(pwsRaw);
      let changed = false;
      if (Array.isArray(list)) {
        for (const e of list) {
          const m = canonTime(e?.morningTime);
          if (m.changed) { e.morningTime = m.value; changed = true; }
          const ev = canonTime(e?.eveningTime);
          if (ev.changed) { e.eveningTime = ev.value; changed = true; }
        }
      }
      if (changed) writes.push({ key: PRESET_WARD_SCHEDULE_KEY, value: JSON.stringify(list) });
    }

    const csRaw = localStorage.getItem(CUSTOM_SUBJECTS_KEY);
    if (csRaw) {
      const list = JSON.parse(csRaw);
      let changed = false;
      if (Array.isArray(list)) {
        for (const s of list) {
          const t = canonTime(s?.time);
          if (t.changed) { s.time = t.value; changed = true; }
          if (Array.isArray(s?.schedules)) {
            for (const sch of s.schedules) {
              const r = canonTime(sch?.time);
              if (r.changed) { sch.time = r.value; changed = true; }
            }
          }
        }
      }
      if (changed) writes.push({ key: CUSTOM_SUBJECTS_KEY, value: JSON.stringify(list) });
    }

    const cwRaw = localStorage.getItem(CUSTOM_WARDS_KEY);
    if (cwRaw) {
      const list = JSON.parse(cwRaw);
      let changed = false;
      if (Array.isArray(list)) {
        for (const w of list) {
          const m = canonTime(w?.morningTime);
          if (m.changed) { w.morningTime = m.value; changed = true; }
          const ev = canonTime(w?.eveningTime);
          if (ev.changed) { w.eveningTime = ev.value; changed = true; }
        }
      }
      if (changed) writes.push({ key: CUSTOM_WARDS_KEY, value: JSON.stringify(list) });
    }

    const uaRaw = localStorage.getItem(USER_ADDED_SUBJECTS_KEY);
    if (uaRaw) {
      const list = JSON.parse(uaRaw);
      let changed = false;
      if (Array.isArray(list)) {
        for (const s of list) {
          const t = canonTime(s?.time);
          if (t.changed) { s.time = t.value; changed = true; }
          if (Array.isArray(s?.schedules)) {
            for (const sch of s.schedules) {
              const r1 = canonTime(sch?.start);
              if (r1.changed) { sch.start = r1.value; changed = true; }
              const r2 = canonTime(sch?.end);
              if (r2.changed) { sch.end = r2.value; changed = true; }
              const r3 = canonTime(sch?.time);
              if (r3.changed) { sch.time = r3.value; changed = true; }
            }
          }
        }
      }
      if (changed) writes.push({ key: USER_ADDED_SUBJECTS_KEY, value: JSON.stringify(list) });
    }

    if (writes.length > 0) {
      snapshotBeforeEdit('Time Format Migration');
      for (const w of writes) {
        localStorage.setItem(w.key, w.value);
        storageSetItem(w.key, w.value);
      }
    }
  } catch {
    /* ignore */
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   SGT timetable cleanup
──────────────────────────────────────────────────────────────────────────── */
const isSGTName = (name: string, sgtNames: Set<string>): boolean =>
  sgtNames.has(name.trim().toLowerCase());

const isAcademicName = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  for (const cat of CATEGORIES) for (const s of cat.subjects) if (s.name.toLowerCase() === n) return true;
  for (const s of INTEGRATED_SUBJECTS) if (s.name.toLowerCase() === n) return true;
  return false;
};

const removeSGTFromTimetable = (
  tt: typeof TIMETABLE,
  uaSubjects: UserAddedSubject[],
  csSubjects: CustomSubject[]
): { tt: typeof TIMETABLE; changed: boolean } => {
  const sgtNames = new Set<string>();
  for (const s of uaSubjects) {
    if (s.subjectType === 'allied' && s.parentName === 'Small Group Teaching') {
      sgtNames.add(s.name.trim().toLowerCase());
    }
  }
  for (const s of csSubjects) {
    if (s.subjectType === 'allied' && s.parentName === 'Small Group Teaching') {
      sgtNames.add(s.name.trim().toLowerCase());
    }
  }

  const src = asMutable(tt);
  const next: Record<number, MutableSlot[]> = {};
  let changed = false;

  for (let day = 0; day < 7; day++) {
    const slots = src[day] || [];
    const newSlots: MutableSlot[] = [];
    for (const slot of slots) {
      if (isWardSlotType(slot.type)) {
        newSlots.push(slot);
        continue;
      }
      const filteredSubjects = slot.subjects.filter(s => {
        const isSGTOnly = isSGTName(s, sgtNames) && !isAcademicName(s);
        return !isSGTOnly;
      });
      if (filteredSubjects.length !== slot.subjects.length) changed = true;
      if (filteredSubjects.length > 0) {
        newSlots.push({ ...slot, subjects: filteredSubjects });
      } else {
        changed = true; // remove slot entirely
      }
    }
    next[day] = newSlots;
  }
  return { tt: asTimetable(next), changed };
};

/* ────────────────────────────────────────────────────────────────────────────
   Context shape
──────────────────────────────────────────────────────────────────────────── */
interface CustomDataContextType {
  customSubjects: CustomSubject[];
  customWards: CustomWard[];
  addCustomSubject: (s: Omit<CustomSubject, 'id'>) => CustomSubject;
  addCustomSubjects: (items: Array<Omit<CustomSubject, 'id'>>) => CustomSubject[];
  updateCustomSubject: (id: string, patch: Partial<Omit<CustomSubject, 'id'>>) => void;
  removeCustomSubject: (id: string) => void;
  addCustomWard: (w: Omit<CustomWard, 'id'>) => CustomWard;
  addCustomWards: (items: Array<Omit<CustomWard, 'id'>>) => CustomWard[];
  updateCustomWard: (id: string, patch: Partial<Omit<CustomWard, 'id'>>) => void;
  removeCustomWard: (id: string) => void;
  getCurrentCustomWard: () => CustomWard | null;
  userAddedSubjects: UserAddedSubject[];
  addUserAddedSubject: (s: Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }) => UserAddedSubject;
  addUserAddedSubjects: (items: Array<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>) => UserAddedSubject[];
  updateUserAddedSubject: (id: string, patch: Partial<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>) => void;
  removeUserAddedSubject: (id: string) => void;
  isUserAddedName: (name: string) => boolean;
  presetTimetable: typeof TIMETABLE;
  presetWardSchedule: PresetWardEntry[];
  presetSubjectTotals: Record<string, number>;
  addPresetWardEntry: (entry: Omit<PresetWardEntry, 'addedByUser'> & { addedByUser?: boolean }) => void;
  updatePresetWardEntry: (index: number, patch: Partial<PresetWardEntry>) => void;
  removePresetWardEntry: (index: number) => void;
  renamePresetWard: (oldName: string, newName: string) => void;
  updatePresetTimetableSlot: (
   currentDay: number,
   slotIndex: number,
   updatedTime: string,
   updatedSubjects: string[],
   targetDay: number
   ) => void;
  addSubjectToSlot: (day: number, time: string, name: string) => void;
  updatePresetWardSchedule: (
    index: number,
    start: string,
    end: string,
    morningTime?: string,
    eveningTime?: string
  ) => void;
  updatePresetSubjectTotal: (subjectName: string, total: number) => void;
  getSubjectPlannedTotal: (subjectName: string) => number;
  getCurrentPresetWard: (date?: Date) => { ward: string; morningTime?: string; eveningTime?: string } | null;
  getPresetWardTotalPlanned: (wardName: string) => number;
  getCustomWardTotalPlanned: (startDateStr: string, endDateStr: string) => number;
  getParentOptions: () => string[];
  isExistingParent: (name: string) => boolean;
  getAlliedChildCount: (parentName: string) => number;
  getCustomAlliedChildren: (parentName: string) => CustomSubject[];
  getUserAddedAlliedChildren: (parentName: string) => UserAddedSubject[];
  isSubjectNameTaken: (name: string, excludeName?: string, domain?: SubjectDomain) => boolean;
  isWardNameTaken: (name: string, excludeWard?: string) => boolean;
  findSubjectTimeConflicts: (days: string[], time: string, excludeName?: string, domain?: SubjectDomain) => SubjectTimeConflict[];
  findWardDateConflicts: (startDate: string, endDate: string, excludeWard?: string) => WardDateConflict[];
  bulkUpdateSubjectHierarchy: (moves: Array<{
    id: string;
    store: 'userAdded' | 'custom';
    newSubjectType: 'single' | 'allied' | 'allied-parent';
    newParentName?: string;
  }>) => number;
  subjectMode: SubjectMode;
  setupDone: boolean;
  whatsNewOpen: boolean;
  setWhatsNewOpen: (b: boolean) => void;
  completeSetup: (mode: SubjectMode) => void;
  startFresh: () => void;
  changeSubjectMode: (mode: SubjectMode) => void;
  clearRoutineData: (mode: SubjectMode) => void;
  getPresetSubjectDisplayName: (originalName: string) => string;
  setPresetSubjectRename: (oldName: string, newName: string) => void;
}

const CustomDataContext = createContext<CustomDataContextType | undefined>(undefined);

/* ────────────────────────────────────────────────────────────────────────────
   Provider
──────────────────────────────────────────────────────────────────────────── */
export const CustomDataProvider = ({ children }: { children: ReactNode }) => {
  const [customSubjects, setCustomSubjects] = useState<CustomSubject[]>([]);
  const [customWards, setCustomWards] = useState<CustomWard[]>([]);
  const [userAddedSubjects, setUserAddedSubjects] = useState<UserAddedSubject[]>([]);
  const [subjectMode, setSubjectMode] = useState<SubjectMode>('preloaded');
  const [setupDone, setSetupDone] = useState(false);
  const [whatsNewOpen, setWhatsNewOpenState] = useState(false);
  const [presetTimetable, setPresetTimetable] = useState<typeof TIMETABLE>(TIMETABLE);
  const presetTimetableRef = useRef<typeof TIMETABLE>(TIMETABLE);
  const [presetWardSchedule, setPresetWardSchedule] = useState<PresetWardEntry[]>(defaultWardSchedule);
  const [presetSubjectTotals, setPresetSubjectTotals] = useState<Record<string, number>>({});
  const [renamedPresetSubjects, setRenamedPresetSubjects] = useState<Record<string, string>>({});

  useEffect(() => {
    migrateStoredRoutines();
    try {
      let uaParsed: UserAddedSubject[] = [];
      let csParsed: CustomSubject[] = [];

      const s = localStorage.getItem(CUSTOM_SUBJECTS_KEY);
      if (s) {
        csParsed = JSON.parse(s);
        let migrated = false;
        csParsed = csParsed.map(it => {
          if (it && it.subjectType === 'allied' && !it.parentName) {
            migrated = true;
            const legacyParent = (it.category || '').trim() || 'Uncategorised';
            return { ...it, parentName: legacyParent, category: legacyParent };
          }
          return it;
        });
        csParsed = csParsed.map(it => {
          if (it.subjectType === 'allied' && it.parentName === 'Small Group Teaching' && !it.clinicalSubject) {
            it.clinicalSubject = it.name.replace(/\s*SGT\s*$/i, '').trim() || it.name;
            migrated = true;
          }
          return it;
        });
        if (migrated) localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(csParsed));
        setCustomSubjects(csParsed);
      }

      const w = localStorage.getItem(CUSTOM_WARDS_KEY);
      if (w) setCustomWards(JSON.parse(w));

      const ua = localStorage.getItem(USER_ADDED_SUBJECTS_KEY);
      if (ua) {
        uaParsed = JSON.parse(ua);
        let uaMigrated = false;
        uaParsed = uaParsed.map(it => {
          if (it.subjectType === 'allied' && it.parentName === 'Small Group Teaching' && !it.clinicalSubject) {
            it.clinicalSubject = it.name.replace(/\s*SGT\s*$/i, '').trim() || it.name;
            uaMigrated = true;
          }
          return it;
        });
        if (uaMigrated) {
          localStorage.setItem(USER_ADDED_SUBJECTS_KEY, JSON.stringify(uaParsed));
          storageSetItem(USER_ADDED_SUBJECTS_KEY, JSON.stringify(uaParsed));
        }
        setUserAddedSubjects(uaParsed);
      }

      const m = localStorage.getItem(SUBJECT_MODE_KEY) as SubjectMode | null;
      if (m === 'preloaded' || m === 'custom') setSubjectMode(m);

      const done = localStorage.getItem(SETUP_DONE_KEY);
      if (done === 'true') setSetupDone(true);
      else setSetupDone(false);

      const seenWhatsNew = localStorage.getItem(WHATS_NEW_KEY);
      if (seenWhatsNew !== 'true') setWhatsNewOpenState(true);

      const ptRaw = localStorage.getItem(PRESET_TIMETABLE_KEY);
      if (ptRaw) {
        const parsed = JSON.parse(ptRaw);
        const cleanup = removeSGTFromTimetable(parsed, uaParsed, csParsed);
        if (cleanup.changed) {
          localStorage.setItem(PRESET_TIMETABLE_KEY, JSON.stringify(cleanup.tt));
          storageSetItem(PRESET_TIMETABLE_KEY, JSON.stringify(cleanup.tt));
          snapshotBeforeEdit('SGT Timetable Cleanup');
        }
        setPresetTimetable(cleanup.tt);
        presetTimetableRef.current = cleanup.tt;
      } else {
        setPresetTimetable(TIMETABLE);
        presetTimetableRef.current = TIMETABLE;
      }

      const pws = localStorage.getItem(PRESET_WARD_SCHEDULE_KEY);
      if (pws) setPresetWardSchedule(JSON.parse(pws));

      const pst = localStorage.getItem(PRESET_SUBJECT_TOTALS_KEY);
      if (pst) setPresetSubjectTotals(JSON.parse(pst));

      const renames = localStorage.getItem(PRESET_RENAMES_KEY);
      if (renames) setRenamedPresetSubjects(JSON.parse(renames));
    } catch {
      /* ignore */
    }
  }, []);

  const handleSetWhatsNewOpen = (open: boolean) => {
    if (!open) storageSetItem(WHATS_NEW_KEY, 'true');
    setWhatsNewOpenState(open);
  };

  const saveSubjects = (data: CustomSubject[]) => {
    setCustomSubjects(data);
    storageSetItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(data));
  };
  const saveWards = (data: CustomWard[]) => {
    setCustomWards(data);
    storageSetItem(CUSTOM_WARDS_KEY, JSON.stringify(data));
  };
  const saveUserAdded = (data: UserAddedSubject[]) => {
    setUserAddedSubjects(data);
    storageSetItem(USER_ADDED_SUBJECTS_KEY, JSON.stringify(data));
  };
  const saveTimetable = (data: typeof TIMETABLE) => {
    presetTimetableRef.current = data;
    setPresetTimetable(data);
    storageSetItem(PRESET_TIMETABLE_KEY, JSON.stringify(data));
  };
  const saveWardSchedule = (data: PresetWardEntry[]) => {
    setPresetWardSchedule(data);
    storageSetItem(PRESET_WARD_SCHEDULE_KEY, JSON.stringify(data));
  };
  const saveTotals = (data: Record<string, number>) => {
    setPresetSubjectTotals(data);
    storageSetItem(PRESET_SUBJECT_TOTALS_KEY, JSON.stringify(data));
  };
  const saveRenames = (data: Record<string, string>) => {
    setRenamedPresetSubjects(data);
    localStorage.setItem(PRESET_RENAMES_KEY, JSON.stringify(data));
    storageSetItem(PRESET_RENAMES_KEY, JSON.stringify(data));
  };

  // ── CUSTOM MODE ──
  const addCustomSubjects = (items: Array<Omit<CustomSubject, 'id'>>): CustomSubject[] => {
    const created: CustomSubject[] = items.map(it => {
      const base: CustomSubject = {
        ...it,
        time: canonicalizeTimeRange(it.time || ''),
        schedules: it.schedules
          ? it.schedules.map(sch => ({ ...sch, time: canonicalizeTimeRange(sch.time) }))
          : it.schedules,
        id: genId('cs'),
        startDate: (it as any).startDate,
        endDate: (it as any).endDate,
        clinicalSubject: (it as any).clinicalSubject,
      };
      if (base.subjectType === 'allied' && base.parentName && !base.category) {
        base.category = base.parentName;
      }
      return base;
    });
    saveSubjects([...customSubjects, ...created]);
    return created;
  };
  const addCustomSubject = (s: Omit<CustomSubject, 'id'>): CustomSubject => addCustomSubjects([s])[0];
  const updateCustomSubject = (id: string, patch: Partial<Omit<CustomSubject, 'id'>>) => {
    const existing = customSubjects.find(s => s.id === id);
    if (!existing) return;
    const normalized: Partial<Omit<CustomSubject, 'id'>> = { ...patch };
    if (normalized.time !== undefined) normalized.time = canonicalizeTimeRange(normalized.time);
    if (normalized.schedules !== undefined) {
      normalized.schedules = normalized.schedules.map(sch => ({
        ...sch,
        time: canonicalizeTimeRange(sch.time),
      }));
    }
    const merged: CustomSubject = { ...existing, ...normalized };
    if (merged.subjectType === 'allied' && merged.parentName) merged.category = merged.parentName;
    let next = customSubjects.map(s => (s.id === id ? merged : s));
    const oldName = existing.name.trim().toLowerCase();
    const renamed = patch.name !== undefined && patch.name.trim().toLowerCase() !== oldName;
    if (renamed) {
      next = next.map(s =>
        s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === oldName
          ? { ...s, parentName: patch.name, category: patch.name }
          : s
      );
    }
    saveSubjects(next);
  };
  const removeCustomSubject = (id: string) => {
    const target = customSubjects.find(s => s.id === id);
    if (!target) return;
    const idsToRemove = new Set<string>([id]);
    if (target.subjectType === 'allied-parent') {
      const tName = target.name.trim().toLowerCase();
      for (const s of customSubjects) {
        if (s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === tName) {
          idsToRemove.add(s.id);
        }
      }
    }
    saveSubjects(customSubjects.filter(s => !idsToRemove.has(s.id)));
  };
  const addCustomWards = (items: Array<Omit<CustomWard, 'id'>>): CustomWard[] => {
    const created = items.map(it => ({
      ...it,
      morningTime: canonicalizeTimeRange(it.morningTime ?? DEFAULT_MORNING_TIME),
      eveningTime: canonicalizeTimeRange(it.eveningTime ?? DEFAULT_EVENING_TIME),
      id: genId('cw'),
    }));
    saveWards([...customWards, ...created]);
    return created;
  };
  const addCustomWard = (w: Omit<CustomWard, 'id'>): CustomWard => addCustomWards([w])[0];
  const updateCustomWard = (id: string, patch: Partial<Omit<CustomWard, 'id'>>) => {
    const existing = customWards.find(w => w.id === id);
    if (!existing) return;
    const normalized: Partial<Omit<CustomWard, 'id'>> = { ...patch };
    if (normalized.morningTime !== undefined) normalized.morningTime = canonicalizeTimeRange(normalized.morningTime);
    if (normalized.eveningTime !== undefined) normalized.eveningTime = canonicalizeTimeRange(normalized.eveningTime);
    saveWards(customWards.map(w => (w.id === id ? { ...w, ...normalized } : w)));
  };
  const removeCustomWard = (id: string) => {
    saveWards(customWards.filter(w => w.id !== id));
  };
  const getCurrentCustomWard = (): CustomWard | null => {
    const today = getCurrentDateStr();
    return customWards.find(w => today >= w.startDate && today <= w.endDate) ?? null;
  };

  /* ── PRELOADED · user-added subjects ── */
  const addUserAddedSubjects = (
    items: Array<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>
  ): UserAddedSubject[] => {
    let nextUserAdded = [...userAddedSubjects];
    let nextTimetable = presetTimetableRef.current;
    const nextTotals = { ...presetSubjectTotals };
    const created: UserAddedSubject[] = [];
    for (const it of items) {
      const rows: ScheduleRowInput[] =
        it.schedules && it.schedules.length
          ? it.schedules
          : parseDayList(it.days || '').map(d => ({ day: d, time: it.time || '' }));
      const storedSchedules = rows.map(r => ({ day: r.day, ...canonTokens(rowTime(r)) }));
      const record: UserAddedSubject = {
        name: it.name,
        subjectType: it.subjectType,
        parentName: it.parentName,
        category: it.category ?? (it.subjectType === 'allied' && it.parentName ? it.parentName : undefined),
        plannedClasses: it.plannedClasses,
        days: rows.map(r => r.day).join(', '),
        time: rows.length ? rowTime(rows[0]) : canonicalizeTimeRange(it.time || ''),
        schedules: storedSchedules,
        startDate: (it as any).startDate,
        endDate: (it as any).endDate,
        clinicalSubject: (it as any).clinicalSubject,
        id: '',
      };
      const existingIdx = nextUserAdded.findIndex(
        e => e.name.trim().toLowerCase() === record.name.trim().toLowerCase()
      );
      if (existingIdx !== -1) {
        record.id = nextUserAdded[existingIdx].id;
        const existingRec = nextUserAdded[existingIdx];
        record.startDate = record.startDate ?? existingRec.startDate;
        record.endDate = record.endDate ?? existingRec.endDate;
        record.clinicalSubject = record.clinicalSubject ?? existingRec.clinicalSubject;
        nextUserAdded[existingIdx] = record;
      } else {
        record.id = genId('ua');
        nextUserAdded.push(record);
      }
      created.push(record);
      const isSGT = record.parentName === 'Small Group Teaching';
      if (record.subjectType !== 'allied-parent' && !isSGT) {
        nextTimetable = syncSubjectSchedules(nextTimetable, record.name, rows);
        nextTotals[record.name] = record.plannedClasses;
      }
    }
    saveUserAdded(nextUserAdded);
    saveTimetable(nextTimetable);
    saveTotals(nextTotals);
    return created;
  };
  const addUserAddedSubject = (
    s: Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }
  ): UserAddedSubject => addUserAddedSubjects([s])[0];
  const updateUserAddedSubject = (
    id: string,
    patch: Partial<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>
  ) => {
    const existing = userAddedSubjects.find(e => e.id === id);
    if (!existing) return;
    const normalized: Partial<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }> = { ...patch };
    const merged: UserAddedSubject = { ...existing };
    if (normalized.name !== undefined) merged.name = normalized.name;
    if (normalized.subjectType !== undefined) merged.subjectType = normalized.subjectType;
    if (normalized.parentName !== undefined) merged.parentName = normalized.parentName;
    if (normalized.category !== undefined) merged.category = normalized.category;
    if (normalized.plannedClasses !== undefined) merged.plannedClasses = normalized.plannedClasses;
    if ((normalized as any).startDate !== undefined) (merged as any).startDate = (normalized as any).startDate;
    if ((normalized as any).endDate !== undefined) (merged as any).endDate = (normalized as any).endDate;
    if ((normalized as any).clinicalSubject !== undefined) (merged as any).clinicalSubject = (normalized as any).clinicalSubject;
    if (merged.subjectType === 'allied' && merged.parentName) merged.category = merged.parentName;
    let rows: ScheduleRowInput[];
    if (normalized.schedules !== undefined) {
      rows = normalized.schedules;
    } else if (normalized.days !== undefined || normalized.time !== undefined) {
      if (normalized.days !== undefined) merged.days = normalized.days;
      if (normalized.time !== undefined) merged.time = canonicalizeTimeRange(normalized.time);
      rows = parseDayList(merged.days).map(d => ({ day: d, time: merged.time }));
    } else {
      rows = existing.schedules && existing.schedules.length
        ? existing.schedules.map(s => ({ day: s.day, start: s.start, end: s.end }))
        : parseDayList(existing.days).map(d => ({ day: d, time: existing.time }));
    }
    merged.schedules = rows.map(r => ({ day: r.day, ...canonTokens(rowTime(r)) }));
    merged.days = rows.map(r => r.day).join(', ');
    merged.time = rows.length ? rowTime(rows[0]) : merged.time;
    const nameChanged = merged.name.trim().toLowerCase() !== existing.name.trim().toLowerCase();
    let nextUserAdded = userAddedSubjects.map(e => (e.id === id ? merged : e));
    if (nameChanged) {
      const oldName = existing.name.trim().toLowerCase();
      nextUserAdded = nextUserAdded.map(e =>
        e.subjectType === 'allied' && getEffectiveParentName(e)?.toLowerCase() === oldName
          ? { ...e, parentName: merged.name, category: merged.name }
          : e
      );
    }
    saveUserAdded(nextUserAdded);
    const isSGT = merged.parentName === 'Small Group Teaching';
    if (existing.subjectType !== 'allied-parent' || merged.subjectType !== 'allied-parent') {
      let tt = presetTimetableRef.current;
      if (nameChanged) tt = removeSubjectFromTimetable(tt, existing.name);
      if (merged.subjectType !== 'allied-parent' && !isSGT) {
        tt = syncSubjectSchedules(tt, merged.name, rows);
      } else {
        tt = removeSubjectFromTimetable(tt, existing.name);
      }
      saveTimetable(tt);
      const totals = { ...presetSubjectTotals };
      if (nameChanged) {
        const prevVal = normalized.plannedClasses !== undefined ? normalized.plannedClasses : totals[existing.name];
        delete totals[existing.name];
        if (prevVal !== undefined && merged.subjectType !== 'allied-parent' && !isSGT) totals[merged.name] = prevVal;
        saveTotals(totals);
      } else if (normalized.plannedClasses !== undefined) {
        if (!isSGT) saveTotals({ ...presetSubjectTotals, [merged.name]: merged.plannedClasses });
      }
    }
  };
  const removeUserAddedSubject = (id: string) => {
    const target = userAddedSubjects.find(e => e.id === id);
    if (!target) return;
    const toRemove = new Set<string>([id]);
    if (target.subjectType === 'allied-parent') {
      const tName = target.name.trim().toLowerCase();
      for (const e of userAddedSubjects) {
        if (e.subjectType === 'allied' && getEffectiveParentName(e)?.toLowerCase() === tName) {
          toRemove.add(e.id);
        }
      }
    }
    const removedEntries = userAddedSubjects.filter(e => toRemove.has(e.id));
    saveUserAdded(userAddedSubjects.filter(e => !toRemove.has(e.id)));
    let tt = presetTimetableRef.current;
    const totals = { ...presetSubjectTotals };
    for (const r of removedEntries) {
      const isSGT = r.parentName === 'Small Group Teaching';
      if (r.subjectType === 'allied-parent' || isSGT) continue;
      tt = removeSubjectFromTimetable(tt, r.name);
      delete totals[r.name];
    }
    saveTimetable(tt);
    saveTotals(totals);
  };
  const isUserAddedName = (name: string): boolean => {
    const n = name.trim().toLowerCase();
    return userAddedSubjects.some(e => e.name.trim().toLowerCase() === n);
  };
  /* ── PRELOADED · ward schedule editing ── */
  const addPresetWardEntry = (
    entry: Omit<PresetWardEntry, 'addedByUser'> & { addedByUser?: boolean }
  ) => {
    const withDefaults: PresetWardEntry = {
      ...entry,
      morningTime: canonicalizeTimeRange(entry.morningTime ?? DEFAULT_MORNING_TIME),
      eveningTime: canonicalizeTimeRange(entry.eveningTime ?? DEFAULT_EVENING_TIME),
      addedByUser: entry.addedByUser ?? true,
    };
    saveWardSchedule(sortWardEntries([...presetWardSchedule, withDefaults]));
  };
  const updatePresetWardEntry = (index: number, patch: Partial<PresetWardEntry>) => {
    if (!presetWardSchedule[index]) return;
    const normalized: Partial<PresetWardEntry> = { ...patch };
    if (normalized.morningTime !== undefined) normalized.morningTime = canonicalizeTimeRange(normalized.morningTime);
    if (normalized.eveningTime !== undefined) normalized.eveningTime = canonicalizeTimeRange(normalized.eveningTime);
    const updated = presetWardSchedule.map((e, i) => (i === index ? { ...e, ...normalized } : e));
    saveWardSchedule(sortWardEntries(updated));
  };
  const removePresetWardEntry = (index: number) => {
    if (!presetWardSchedule[index]) return;
    saveWardSchedule(presetWardSchedule.filter((_, i) => i !== index));
  };
  const renamePresetWard = (oldName: string, newName: string) => {
    const oldL = oldName.trim().toLowerCase();
    const trimmedNew = newName.trim();
    if (!oldL || !trimmedNew) return;
    const updated = presetWardSchedule.map(e =>
      e.ward.trim().toLowerCase() === oldL ? { ...e, ward: trimmedNew } : e
    );
    saveWardSchedule(updated);
  };
  const updatePresetTimetableSlot = (
    currentDay: number,
    slotIndex: number,
    updatedTime: string,
    updatedSubjects: string[],
    targetDay: number
  ) => {
    const src = asMutable(presetTimetableRef.current);
    const slot = src[currentDay]?.[slotIndex];
    if (!slot) return;
    const canon = canonicalizeTimeRange(updatedTime);
    const newSlot: MutableSlot = { ...slot, time: canon, subjects: updatedSubjects };
    const next: Record<number, MutableSlot[]> = {};
    for (const key of Object.keys(src)) next[Number(key)] = [...src[Number(key)]];
    if (currentDay === targetDay) {
      next[currentDay] = [...(next[currentDay] || [])];
      next[currentDay][slotIndex] = newSlot;
    } else {
      next[currentDay] = (next[currentDay] || []).filter((_, i) => i !== slotIndex);
      next[targetDay] = [...(next[targetDay] || []), newSlot];
    }
    for (const k of Object.keys(next)) {
      next[Number(k)] = next[Number(k)].filter(s => isWardSlotType(s.type) || s.subjects.length > 0);
    }
    saveTimetable(asTimetable(next));
  };
  const addSubjectToSlot = (day: number, time: string, name: string) => {
    const canon = canonicalizeTimeRange(time);
    const tt = insertSubjectSlot(presetTimetableRef.current, name, DAY_ABBRS[day], canon);
    saveTimetable(tt);
  };
  const updatePresetWardSchedule = (
    index: number,
    start: string,
    end: string,
    morningTime?: string,
    eveningTime?: string
  ) => {
    updatePresetWardEntry(index, {
      start,
      end,
      ...(morningTime !== undefined ? { morningTime } : {}),
      ...(eveningTime !== undefined ? { eveningTime } : {}),
    });
  };
  const updatePresetSubjectTotal = (subjectName: string, total: number) => {
    saveTotals({ ...presetSubjectTotals, [subjectName]: total });
  };

  // ── PRESET SUBJECT RENAME OVERRIDE ──
  const getPresetSubjectDisplayName = (originalName: string): string => {
    return renamedPresetSubjects[originalName] ?? originalName;
  };

  const setPresetSubjectRename = (oldName: string, newName: string) => {
    const nextRenames = { ...renamedPresetSubjects };
    nextRenames[oldName] = newName;
    saveRenames(nextRenames);
    const currentTt = presetTimetableRef.current;
    const newTt: typeof TIMETABLE = JSON.parse(JSON.stringify(currentTt));
    let changed = false;
    for (let day = 0; day < 7; day++) {
      const slots = newTt[day] || [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.subjects && slot.subjects.some(s => s === oldName)) {
          slot.subjects = slot.subjects.map(s => s === oldName ? newName : s);
          changed = true;
        }
      }
    }
    if (changed) {
      saveTimetable(newTt);
    }
  };

  /* ── Setup / mode management ── */
  const completeSetup = (mode: SubjectMode) => {
    storageSetItem(SUBJECT_MODE_KEY, mode);
    storageSetItem(SETUP_DONE_KEY, 'true');
    setSubjectMode(mode);
    setSetupDone(true);
  };
  const startFresh = () => {
    storageRemoveItem(CUSTOM_SUBJECTS_KEY);
    storageRemoveItem(CUSTOM_WARDS_KEY);
    storageRemoveItem(USER_ADDED_SUBJECTS_KEY);
    setCustomSubjects([]);
    setCustomWards([]);
    setUserAddedSubjects([]);
    completeSetup('custom');
  };
  const changeSubjectMode = (mode: SubjectMode) => {
    storageSetItem(SUBJECT_MODE_KEY, mode);
    setSubjectMode(mode);
  };
  const clearRoutineData = (modeToClear: SubjectMode) => {
    if (modeToClear === 'preloaded') {
      storageRemoveItem(PRESET_TIMETABLE_KEY);
      storageRemoveItem(PRESET_WARD_SCHEDULE_KEY);
      storageRemoveItem(PRESET_SUBJECT_TOTALS_KEY);
      storageRemoveItem(USER_ADDED_SUBJECTS_KEY);
      presetTimetableRef.current = TIMETABLE;
      setPresetTimetable(TIMETABLE);
      setPresetWardSchedule(defaultWardSchedule());
      setPresetSubjectTotals({});
      setUserAddedSubjects([]);
    } else {
      storageRemoveItem(CUSTOM_SUBJECTS_KEY);
      storageRemoveItem(CUSTOM_WARDS_KEY);
      setCustomSubjects([]);
      setCustomWards([]);
    }
  };
  /* ── Lookups & validation ── */
  const getSubjectPlannedTotal = (subjectName: string): number => {
    if (!subjectName) return 40;
    if (presetSubjectTotals[subjectName] !== undefined) return presetSubjectTotals[subjectName];
    const matchKey = Object.keys(presetSubjectTotals).find(
      k => k.toLowerCase() === subjectName.toLowerCase()
    );
    if (matchKey !== undefined && presetSubjectTotals[matchKey] !== undefined) {
      return presetSubjectTotals[matchKey];
    }
    for (const cat of CATEGORIES) {
      const sub = cat.subjects.find(s => s.name.toLowerCase() === subjectName.toLowerCase());
      if (sub) return sub.total;
    }
    const intSub = INTEGRATED_SUBJECTS.find(s => s.name.toLowerCase() === subjectName.toLowerCase());
    if (intSub) return intSub.total;
    const wardSub = WARD_SUBJECTS.find(s => s.name.toLowerCase() === subjectName.toLowerCase());
    if (wardSub) return wardSub.total;
    return 40;
  };
  const getCurrentPresetWard = (
    date: Date = new Date()
  ): { ward: string; morningTime?: string; eveningTime?: string } | null => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    for (const schedule of presetWardSchedule) {
      if (dateStr >= schedule.start && dateStr <= schedule.end) {
        return { ward: schedule.ward, morningTime: schedule.morningTime, eveningTime: schedule.eveningTime };
      }
    }
    return null;
  };
  const getPresetWardTotalPlanned = (wardName: string): number => {
    let count = 0;
    for (const slot of presetWardSchedule) {
      if (slot.ward !== wardName) continue;
      try {
        const start = new Date(slot.start + 'T12:00:00');
        const end = new Date(slot.end + 'T12:00:00');
        const cur = new Date(start);
        while (cur <= end) {
          if (cur.getDay() !== 5) count++;
          cur.setDate(cur.getDate() + 1);
        }
      } catch { /* ignore */ }
    }
    return count * 2;
  };
  const getCustomWardTotalPlanned = (startDateStr: string, endDateStr: string): number => {
    let count = 0;
    try {
      const start = new Date(startDateStr + 'T12:00:00');
      const end = new Date(endDateStr + 'T12:00:00');
      const cur = new Date(start);
      while (cur <= end) {
        if (cur.getDay() !== 5) count++;
        cur.setDate(cur.getDate() + 1);
      }
    } catch { /* ignore */ }
    return count * 2;
  };
  const getParentOptions = (): string[] => {
    const opts: string[] = [];
    const push = (n: string) => {
      const t = n.trim();
      if (t && !opts.some(o => o.toLowerCase() === t.toLowerCase())) opts.push(t);
    };
    if (subjectMode === 'preloaded') {
      for (const cat of CATEGORIES) {
        push(cat.name);
        for (const s of cat.subjects) push(s.name);
      }
      push('Integrated Teaching');
      for (const s of userAddedSubjects) {
        if (s.subjectType === 'allied-parent') push(s.name);
      }
      for (const s of userAddedSubjects) {
        if (s.subjectType === 'allied') {
          const p = getEffectiveParentName(s);
          if (p) push(p);
        }
      }
    } else {
      push('Integrated Teaching');
      for (const s of customSubjects) {
        if (s.subjectType === 'allied-parent') push(s.name);
      }
      for (const s of customSubjects) {
        if (s.subjectType === 'allied') {
          const p = getEffectiveParentName(s);
          if (p) push(p);
        }
      }
      for (const s of customSubjects) {
        if (s.subjectType === 'single') push(s.name);
      }
    }
    return opts;
  };
  const isExistingParent = (name: string): boolean => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    return getParentOptions().some(o => o.toLowerCase() === n);
  };
  const getAlliedChildCount = (parentName: string): number => {
    const p = parentName.trim().toLowerCase();
    if (!p) return 0;
    let n = 0;
    for (const s of customSubjects) {
      if (s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p) n++;
    }
    for (const s of userAddedSubjects) {
      if (s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p) n++;
    }
    return n;
  };
  const getCustomAlliedChildren = (parentName: string): CustomSubject[] => {
    const p = parentName.trim().toLowerCase();
    return customSubjects.filter(
      s => s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p
    );
  };
  const getUserAddedAlliedChildren = (parentName: string): UserAddedSubject[] => {
    const p = parentName.trim().toLowerCase();
    return userAddedSubjects.filter(
      s => s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p
    );
  };
  const isSubjectNameTaken = (name: string, excludeName?: string, domain: SubjectDomain = 'academic'): boolean => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    const ex = excludeName?.trim().toLowerCase();
    const pool: string[] = [];
    if (subjectMode === 'preloaded') {
      if (domain === 'academic') {
        for (const cat of CATEGORIES) for (const s of cat.subjects) pool.push(s.name);
        for (const s of INTEGRATED_SUBJECTS) pool.push(s.name);
        for (const s of userAddedSubjects) {
          if (!(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')) pool.push(s.name);
        }
      } else if (domain === 'clinical') {
        for (const s of userAddedSubjects) {
          if (s.subjectType === 'allied' && s.parentName === 'Small Group Teaching') pool.push(s.name);
        }
      }
    }
    for (const s of customSubjects) {
      const isSGT = s.subjectType === 'allied' && s.parentName === 'Small Group Teaching';
      if (domain === 'academic' && isSGT) continue;
      if (domain === 'clinical' && !isSGT) continue;
      pool.push(s.name);
    }
    return pool.some(p => p.trim().toLowerCase() === n && p.trim().toLowerCase() !== ex);
  };
  const isWardNameTaken = (name: string, excludeWard?: string): boolean => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    const ex = excludeWard?.trim().toLowerCase();
    const pool: string[] = [];
    if (subjectMode === 'preloaded') {
      for (const e of presetWardSchedule) pool.push(e.ward);
      for (const s of WARD_SUBJECTS) pool.push(s.name);
    }
    for (const w of customWards) pool.push(w.name);
    return pool.some(p => p.trim().toLowerCase() === n && p.trim().toLowerCase() !== ex);
  };
  const findSubjectTimeConflicts = (
    days: string[],
    time: string,
    excludeName?: string,
    domain: SubjectDomain = 'academic'
  ): SubjectTimeConflict[] => {
    const conflicts: SubjectTimeConflict[] = [];
    const daySet = new Set(days.map(d => d.trim()).filter(Boolean));
    const ex = excludeName?.trim().toLowerCase();

    if (subjectMode === 'preloaded') {
      if (domain === 'academic') {
        const tt = asMutable(presetTimetableRef.current);
        for (let day = 0; day < 7; day++) {
          const abbr = DAY_ABBRS[day];
          if (!daySet.has(abbr)) continue;
          for (const slot of tt[day] || []) {
            if (isWardSlotType(slot.type)) continue;
            if (ex && slot.subjects.some(s => s.trim().toLowerCase() === ex)) continue;
            if (timesOverlap(slot.time, time)) {
              conflicts.push({ day: abbr, time: slot.time, subjects: [...slot.subjects], exact: sameRange(slot.time, time) });
            }
          }
        }
      } else { // clinical: check SGT schedules from userAddedSubjects
        const sgtSubjects = userAddedSubjects.filter(
          s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'
        );
        for (const s of sgtSubjects) {
          if (ex && s.name.trim().toLowerCase() === ex) continue;
          const sDays = new Set<string>([
            ...parseDayList(s.days),
            ...(s.schedules || []).map(sch => sch.day),
          ]);
          const hitDays = [...daySet].filter(d => sDays.has(d));
          if (hitDays.length === 0) continue;
          const ranges: string[] = [];
          if (parseDayList(s.days).length > 0 && s.time) ranges.push(s.time);
          for (const sch of s.schedules || []) ranges.push(sch.time);
          for (const r of ranges) {
            if (!timesOverlap(r, time)) continue;
            for (const d of hitDays) {
              conflicts.push({ day: d, time: r, subjects: [s.name], exact: sameRange(r, time) });
            }
          }
        }
      }
    } else { // custom mode
      if (domain === 'academic') {
        for (const s of customSubjects) {
          const isSGT = s.subjectType === 'allied' && s.parentName === 'Small Group Teaching';
          if (isSGT) continue;
          if (ex && s.name.trim().toLowerCase() === ex) continue;
          if (s.subjectType === 'allied-parent') continue;
          const sDays = new Set<string>([
            ...parseDayList(s.days),
            ...(s.schedules || []).map(sch => sch.day),
          ]);
          const hitDays = [...daySet].filter(d => sDays.has(d));
          if (hitDays.length === 0) continue;
          const ranges: string[] = [];
          if (parseDayList(s.days).length > 0 && s.time) ranges.push(s.time);
          for (const sch of s.schedules || []) ranges.push(sch.time);
          for (const r of ranges) {
            if (!timesOverlap(r, time)) continue;
            for (const d of hitDays) {
              conflicts.push({ day: d, time: r, subjects: [s.name], exact: sameRange(r, time) });
            }
          }
        }
      } else { // clinical
        const sgtSubjects = customSubjects.filter(
          s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'
        );
        for (const s of sgtSubjects) {
          if (ex && s.name.trim().toLowerCase() === ex) continue;
          const sDays = new Set<string>([
            ...parseDayList(s.days),
            ...(s.schedules || []).map(sch => sch.day),
          ]);
          const hitDays = [...daySet].filter(d => sDays.has(d));
          if (hitDays.length === 0) continue;
          const ranges: string[] = [];
          if (parseDayList(s.days).length > 0 && s.time) ranges.push(s.time);
          for (const sch of s.schedules || []) ranges.push(sch.time);
          for (const r of ranges) {
            if (!timesOverlap(r, time)) continue;
            for (const d of hitDays) {
              conflicts.push({ day: d, time: r, subjects: [s.name], exact: sameRange(r, time) });
            }
          }
        }
      }
    }
    return conflicts;
  };
  const findWardDateConflicts = (
    startDate: string,
    endDate: string,
    excludeWard?: string
  ): WardDateConflict[] => {
    if (!startDate || !endDate) return [];
    const ex = excludeWard?.trim().toLowerCase();
    const list: Array<{ ward: string; start: string; end: string }> =
      subjectMode === 'preloaded'
        ? presetWardSchedule.map(e => ({ ward: e.ward, start: e.start, end: e.end }))
        : customWards.map(w => ({ ward: w.name, start: w.startDate, end: w.endDate }));
    return list
      .filter(e => !(ex && e.ward.trim().toLowerCase() === ex))
      .filter(e => startDate <= e.end && e.start <= endDate)
      .map(e => ({ ward: e.ward, start: e.start, end: e.end }));
  };
  /** R7 · Apply hierarchy moves and auto-delete empty allied-parent containers. */
  const bulkUpdateSubjectHierarchy = (
    moves: Array<{
      id: string;
      store: 'userAdded' | 'custom';
      newSubjectType: 'single' | 'allied' | 'allied-parent';
      newParentName?: string;
    }>
  ): number => {
    let nextUA = userAddedSubjects.map(s => {
      const move = moves.find(m => m.store === 'userAdded' && m.id === s.id);
      if (!move) return s;
      let updated = { ...s };
      if (s.parentName === 'Small Group Teaching' && move.newParentName && move.newParentName !== 'Small Group Teaching') {
        updated = { ...updated, clinicalSubject: move.newParentName };
      }
      return {
        ...updated,
        subjectType: move.newSubjectType,
        parentName: move.newParentName,
        category: move.newSubjectType === 'allied' ? move.newParentName : undefined,
      } as UserAddedSubject;
    });
    let nextCS = customSubjects.map(s => {
      const move = moves.find(m => m.store === 'custom' && m.id === s.id);
      if (!move) return s;
      let updated = { ...s };
      if (s.parentName === 'Small Group Teaching' && move.newParentName && move.newParentName !== 'Small Group Teaching') {
        updated = { ...updated, clinicalSubject: move.newParentName };
      }
      return {
        ...updated,
        subjectType: move.newSubjectType,
        parentName: move.newParentName,
        category: move.newSubjectType === 'allied' ? move.newParentName : undefined,
      } as CustomSubject;
    });
    const filterEmptyParents = <T extends { id: string; name: string; subjectType: string; parentName?: string; category?: string }>(list: T[]): T[] => {
      const parents = list.filter(s => s.subjectType === 'allied-parent');
      const toDelete = new Set<string>();
      for (const p of parents) {
        const childCount = list.filter(
          s => s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p.name.toLowerCase()
        ).length;
        if (childCount === 0) toDelete.add(p.id);
      }
      return list.filter(s => !toDelete.has(s.id));
    };
    nextUA = filterEmptyParents(nextUA);
    nextCS = filterEmptyParents(nextCS);
    saveUserAdded(nextUA);
    saveSubjects(nextCS);
    return moves.length;
  };

  return (
    <CustomDataContext.Provider
      value={{
        customSubjects,
        customWards,
        addCustomSubject,
        addCustomSubjects,
        updateCustomSubject,
        removeCustomSubject,
        addCustomWard,
        addCustomWards,
        updateCustomWard,
        removeCustomWard,
        getCurrentCustomWard,
        userAddedSubjects,
        addUserAddedSubject,
        addUserAddedSubjects,
        updateUserAddedSubject,
        removeUserAddedSubject,
        isUserAddedName,
        presetTimetable,
        presetWardSchedule,
        presetSubjectTotals,
        addPresetWardEntry,
        updatePresetWardEntry,
        removePresetWardEntry,
        renamePresetWard,
        updatePresetTimetableSlot,
        addSubjectToSlot,
        updatePresetWardSchedule,
        updatePresetSubjectTotal,
        getSubjectPlannedTotal,
        getCurrentPresetWard,
        getPresetWardTotalPlanned,
        getCustomWardTotalPlanned,
        getParentOptions,
        isExistingParent,
        getAlliedChildCount,
        getCustomAlliedChildren,
        getUserAddedAlliedChildren,
        isSubjectNameTaken,
        isWardNameTaken,
        findSubjectTimeConflicts,
        findWardDateConflicts,
        bulkUpdateSubjectHierarchy,
        subjectMode,
        setupDone,
        whatsNewOpen,
        setWhatsNewOpen: handleSetWhatsNewOpen,
        completeSetup,
        startFresh,
        changeSubjectMode,
        clearRoutineData,
        getPresetSubjectDisplayName,
        setPresetSubjectRename,
      }}
    >
      {children}
    </CustomDataContext.Provider>
  );
};
export const useCustomData = () => {
  const ctx = useContext(CustomDataContext);
  if (!ctx) throw new Error('useCustomData must be used within CustomDataProvider');
  return ctx;
};