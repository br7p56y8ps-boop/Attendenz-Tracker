import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react';
import {
  getCurrentDateStr,
  canonicalTimeRange,
  canonicalizeTimeRange,
  isCanonicalTimeRange,
  parseRangeToMinutes,
} from '@/lib/utils';
import { idbGetAllChecked, INSTALLATION_METADATA_KEYS, storageSetItem, storageRemoveItemChecked, storageSetItemChecked } from '@/lib/idb';
import { snapshotBeforeEdit } from '@/utils/snapshotUtils';
import { TIMETABLE, WARD_SCHEDULE, CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';
import { APP_VERSION } from '@/lib/appVersion';
import { activateCurriculum, ensureCurriculumMigration, getCurricula, getCurriculumForKind, renameCurriculumChecked, CURRICULUM_KEYS } from '@/lib/curriculumStore';

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
  vacationPeriods?: Array<{ start: string; end: string }>;
}

export interface CustomWard {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  morningTime?: string;
  eveningTime?: string;
  vacationPeriods?: Array<{ start: string; end: string }>;
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
  vacationPeriods?: Array<{ start: string; end: string }>;
}

export interface PresetWardEntry {
  start: string;
  end: string;
  ward: string;
  morningTime?: string;
  eveningTime?: string;
  addedByUser?: boolean;
  vacationPeriods?: Array<{ start: string; end: string }>;
}

export type SubjectMode = 'preloaded' | 'custom';
export type SubjectDomain = 'academic' | 'clinical';

export type SubjectKind =
  | 'preset-academic'
  | 'integrated'
  | 'preset-ward'
  | 'user-added'
  | 'custom'
  | 'sgt'
  | 'ward-rotation';

export interface SubjectRef {
  id: string;
  name: string;
  domain: SubjectDomain;
  kind: SubjectKind;
  parentName?: string;
  planned: number;
}

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
const PRESET_WARD_RENAMES_KEY = 'att_preset_ward_renames';
const SGT_REPAIR_DONE_KEY = 'att_sgt_repair_v1_done';

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

/* ── SINGLE-SUBJECT PER SLOT + CHRONOLOGICAL ORDER ── */
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
  slots.push({ type: 'regular', time, subjects: [name] });

  slots.sort((a, b) => {
    const ta = parseRangeToMinutes(a.time)?.start ?? Number.MAX_SAFE_INTEGER;
    const tb = parseRangeToMinutes(b.time)?.start ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  next[dayIdx] = slots;
  return asTimetable(next);
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

const migrateToSingleSubjectSlots = (base: typeof TIMETABLE): { tt: typeof TIMETABLE; changed: boolean } => {
  const src = asMutable(base);
  let changed = false;

  for (let day = 0; day < 7; day++) {
    const slots = src[day] || [];
    const newSlots: MutableSlot[] = [];

    for (const slot of slots) {
      if (isWardSlotType(slot.type) || !slot.subjects || slot.subjects.length <= 1) {
        newSlots.push(slot);
        continue;
      }
      for (const subj of slot.subjects) {
        newSlots.push({ ...slot, subjects: [subj] });
      }
      changed = true;
    }
    newSlots.sort((a, b) => {
      const ta = parseRangeToMinutes(a.time)?.start ?? Number.MAX_SAFE_INTEGER;
      const tb = parseRangeToMinutes(b.time)?.start ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
    src[day] = newSlots;
  }

  return { tt: asTimetable(src), changed };
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

function migrateStoredRoutines(mode: 'preloaded' | 'custom'): void {
  try {
    const writes: Array<{ key: string; value: string }> = [];

    if (mode === 'preloaded') {
      const ptRaw = localStorage.getItem(PRESET_TIMETABLE_KEY);
      if (ptRaw) {
        const tt = JSON.parse(ptRaw);
        let changed = false;
        for (const key of Object.keys(tt || {})) {
          const slots = (tt as Record<string, MutableSlot[]>)[key];
          if (!Array.isArray(slots)) continue;
          for (const slot of slots) {
            const r = canonTime(slot?.time);
            if (r.changed && r.value !== undefined) { slot.time = r.value; changed = true; }
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
    } else {
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
    }

    if (writes.length > 0) {
      snapshotBeforeEdit(`Time Format Migration (${mode})`);
      for (const w of writes) {
        localStorage.setItem(w.key, w.value);
        storageSetItem(w.key, w.value);
      }
    }
  } catch {
    /* ignore */
  }
}

export const isSGTSubjectRecord = (s: { subjectType: string; parentName?: string }): boolean =>
  s.subjectType === 'allied' && s.parentName === 'Small Group Teaching';

const removeSGTFromTimetable = (
  tt: typeof TIMETABLE,
  uaSubjects: UserAddedSubject[],
  csSubjects: CustomSubject[]
): { tt: typeof TIMETABLE; changed: boolean } => {
  const sgtNames = new Set<string>();
  const academicNames = new Set<string>();

  for (const s of uaSubjects) {
    if (isSGTSubjectRecord(s)) sgtNames.add(s.name.trim().toLowerCase());
    else academicNames.add(s.name.trim().toLowerCase());
  }
  for (const s of csSubjects) {
    if (isSGTSubjectRecord(s)) sgtNames.add(s.name.trim().toLowerCase());
    else academicNames.add(s.name.trim().toLowerCase());
  }
  for (const cat of CATEGORIES) {
    for (const subj of cat.subjects) academicNames.add(subj.name.trim().toLowerCase());
  }
  for (const subj of INTEGRATED_SUBJECTS) {
    academicNames.add(subj.name.trim().toLowerCase());
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
        const nameKey = s.trim().toLowerCase();
        return !(sgtNames.has(nameKey) && !academicNames.has(nameKey));
      });
      if (filteredSubjects.length !== slot.subjects.length) changed = true;
      if (filteredSubjects.length > 0) {
        newSlots.push({ ...slot, subjects: filteredSubjects });
      } else {
        changed = true;
      }
    }
    next[day] = newSlots;
  }

  return { tt: asTimetable(next), changed };
};

const repairSGTDamage = (
  tt: typeof TIMETABLE,
  uaSubjects: UserAddedSubject[],
  csSubjects: CustomSubject[]
): { tt: typeof TIMETABLE; changed: boolean } => {
  let repaired = tt;
  let changed = false;

  const sgtNames = new Set<string>();
  for (const s of uaSubjects) if (isSGTSubjectRecord(s)) sgtNames.add(s.name.trim().toLowerCase());
  for (const s of csSubjects) if (isSGTSubjectRecord(s)) sgtNames.add(s.name.trim().toLowerCase());
  if (sgtNames.size === 0) return { tt, changed: false };

  const tryRepair = (
    list: Array<{
      name: string;
      subjectType: string;
      parentName?: string;
      schedules?: Array<{ day: string; start: string; end: string }>;
    }>,
    _hasTimeField: boolean
  ) => {
    for (const s of list) {
      if (isSGTSubjectRecord(s)) continue;
      if (s.subjectType === 'allied-parent') continue;
      const key = s.name.trim().toLowerCase();
      if (!sgtNames.has(key)) continue;

      const schedules = s.schedules || [];
      if (schedules.length === 0) continue;

      for (const sch of schedules) {
        const dayIdx = DAY_ABBRS.indexOf(sch.day as (typeof DAY_ABBRS)[number]);
        if (dayIdx === -1) continue;
        const time = canonicalTimeRange(sch.start, sch.end);
        const slots = asMutable(repaired)[dayIdx] || [];
        const exists = slots.some(
          slot =>
            !isWardSlotType(slot.type) &&
            sameRange(slot.time, time) &&
            slot.subjects.some(sub => sub.toLowerCase() === key)
        );
        if (!exists) {
          repaired = insertSubjectSlot(repaired, s.name, sch.day, time);
          changed = true;
        }
      }
    }
  };

  tryRepair(uaSubjects as any, true);

  const csAdapted = csSubjects.map(s => ({
    name: s.name,
    subjectType: s.subjectType,
    parentName: s.parentName,
    schedules: (s.schedules || []).map(sch => {
      const { start, end } = canonTokens(sch.time);
      return { day: sch.day, start, end };
    }),
  }));
  tryRepair(csAdapted as any, false);

  return { tt: repaired, changed };
};

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
  addUserAddedSubject: (
    s: Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }
  ) => UserAddedSubject;
  addUserAddedSubjects: (
    items: Array<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>
  ) => UserAddedSubject[];
  updateUserAddedSubject: (
    id: string,
    patch: Partial<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>
  ) => void;
  removeUserAddedSubject: (id: string) => void;
  isUserAddedName: (name: string) => boolean;
  presetTimetable: typeof TIMETABLE;
  presetWardSchedule: PresetWardEntry[];
  presetSubjectTotals: Record<string, number>;
  addPresetWardEntry: (
    entry: Omit<PresetWardEntry, 'addedByUser'> & { addedByUser?: boolean }
  ) => void;
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
  getCurrentPresetWard: (
    date?: Date
  ) => { ward: string; morningTime?: string; eveningTime?: string } | null;
  getPresetWardTotalPlanned: (wardName: string) => number;
  getCustomWardTotalPlanned: (
    startDateStr: string,
    endDateStr: string,
    vacationPeriods?: Array<{ start: string; end: string }>
  ) => number;
  countSGTPlannedDays: (
    startDateStr: string,
    endDateStr: string,
    weekdays: string[],
    vacationPeriods?: Array<{ start: string; end: string }>
  ) => number;
  getParentOptions: () => string[];
  isExistingParent: (name: string) => boolean;
  getAlliedChildCount: (parentName: string) => number;
  getCustomAlliedChildren: (parentName: string) => CustomSubject[];
  getUserAddedAlliedChildren: (parentName: string) => UserAddedSubject[];
  isSubjectNameTaken: (
    name: string,
    excludeName?: string,
    domain?: SubjectDomain
  ) => boolean;
  isWardNameTaken: (name: string, excludeWard?: string) => boolean;
  findSubjectTimeConflicts: (
    days: string[],
    time: string,
    excludeName?: string,
    domain?: SubjectDomain
  ) => SubjectTimeConflict[];
  findWardDateConflicts: (
    startDate: string,
    endDate: string,
    excludeWard?: string
  ) => WardDateConflict[];
  bulkUpdateSubjectHierarchy: (
    moves: Array<{
      id: string;
      store: 'userAdded' | 'custom';
      newSubjectType: 'single' | 'allied' | 'allied-parent';
      newParentName?: string;
    }>
  ) => number;
  subjectMode: SubjectMode;
  setupDone: boolean;
  whatsNewOpen: boolean;
  setWhatsNewOpen: (b: boolean) => void;
  completeSetup: (mode: SubjectMode, customRoutineName?: string) => Promise<void>;
  startFresh: () => Promise<void>;
  changeSubjectMode: (mode: SubjectMode) => void;
  clearRoutineData: (mode: SubjectMode) => void | Promise<void>;
  getPresetSubjectDisplayName: (originalName: string) => string;
  setPresetSubjectRename: (oldName: string, newName: string) => void;
  getPresetWardDisplayName: (originalName: string) => string;
  subjectRegistry: SubjectRef[];
  getSubjectById: (id: string) => SubjectRef | undefined;
  getSubjectIdByName: (name: string, domain: SubjectDomain) => string | undefined;
}

const CustomDataContext = createContext<CustomDataContextType | undefined>(undefined);



function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}
export const CustomDataProvider = ({ children }: { children: ReactNode }) => {
  const [customSubjects, setCustomSubjects] = useState<CustomSubject[]>([]);
  const [customWards, setCustomWards] = useState<CustomWard[]>([]);
  const [userAddedSubjects, setUserAddedSubjects] = useState<UserAddedSubject[]>([]);
  const [subjectMode, setSubjectMode] = useState<SubjectMode>('preloaded');
  const [setupDone, setSetupDone] = useState(false);
  const [whatsNewOpen, setWhatsNewOpenState] = useState(false);
  const [presetTimetable, setPresetTimetable] = useState<typeof TIMETABLE>(TIMETABLE);
  const presetTimetableRef = useRef<typeof TIMETABLE>(TIMETABLE);
  const [presetWardSchedule, setPresetWardSchedule] =
    useState<PresetWardEntry[]>(defaultWardSchedule);
  const [presetSubjectTotals, setPresetSubjectTotals] = useState<Record<string, number>>({});
  const [renamedPresetSubjects, setRenamedPresetSubjects] = useState<Record<string, string>>({});
  const [renamedPresetWards, setRenamedPresetWards] = useState<Record<string, string>>({});

  useEffect(() => {
    const storedMode = localStorage.getItem(SUBJECT_MODE_KEY);
    const initialMode: 'preloaded' | 'custom' = storedMode === 'custom' ? 'custom' : 'preloaded';
    migrateStoredRoutines(initialMode);
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
          if (isSGTSubjectRecord(it) && !it.clinicalSubject) {
            it.clinicalSubject = it.name.replace(/\s*SGT\s*$/i, '').trim() || it.name;
            migrated = true;
          }
          return it;
        });
        if (migrated) {
          localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(csParsed));
          storageSetItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(csParsed));
        }
        setCustomSubjects(csParsed);
      }

      const w = localStorage.getItem(CUSTOM_WARDS_KEY);
      if (w) setCustomWards(JSON.parse(w));

      const ua = localStorage.getItem(USER_ADDED_SUBJECTS_KEY);
      if (ua) {
        uaParsed = JSON.parse(ua);
        let uaMigrated = false;
        uaParsed = uaParsed.map(it => {
          if (isSGTSubjectRecord(it) && !it.clinicalSubject) {
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
      setSetupDone(done === 'true');

      const seenWhatsNew = localStorage.getItem(WHATS_NEW_KEY);
      if (seenWhatsNew !== 'true') setWhatsNewOpenState(true);

      const ptRaw = localStorage.getItem(PRESET_TIMETABLE_KEY);
      let loadedTimetable: typeof TIMETABLE;
      if (ptRaw) {
        loadedTimetable = JSON.parse(ptRaw);
      } else {
        loadedTimetable = TIMETABLE;
      }

      const splitResult = migrateToSingleSubjectSlots(loadedTimetable);
      loadedTimetable = splitResult.tt;
      if (splitResult.changed) {
        snapshotBeforeEdit('Single-Subject Slot Migration');
        localStorage.setItem(PRESET_TIMETABLE_KEY, JSON.stringify(loadedTimetable));
        storageSetItem(PRESET_TIMETABLE_KEY, JSON.stringify(loadedTimetable));
      }

      if (initialMode === 'preloaded') {
        const cleanup = removeSGTFromTimetable(loadedTimetable, uaParsed, []);
        loadedTimetable = cleanup.tt;
        if (cleanup.changed) {
          snapshotBeforeEdit('SGT Timetable Cleanup');
          localStorage.setItem(PRESET_TIMETABLE_KEY, JSON.stringify(loadedTimetable));
          storageSetItem(PRESET_TIMETABLE_KEY, JSON.stringify(loadedTimetable));
        }

        try {
          const repairDone = localStorage.getItem(SGT_REPAIR_DONE_KEY);
          if (repairDone !== 'true') {
            const repair = repairSGTDamage(loadedTimetable, uaParsed, []);
            if (repair.changed) {
              snapshotBeforeEdit('SGT Damage Repair');
              loadedTimetable = repair.tt;
              localStorage.setItem(PRESET_TIMETABLE_KEY, JSON.stringify(loadedTimetable));
              storageSetItem(PRESET_TIMETABLE_KEY, JSON.stringify(loadedTimetable));
            }
            localStorage.setItem(SGT_REPAIR_DONE_KEY, 'true');
            storageSetItem(SGT_REPAIR_DONE_KEY, 'true');
          }
        } catch {
          /* ignore */
        }
      }

      setPresetTimetable(loadedTimetable);
      presetTimetableRef.current = loadedTimetable;

      const pws = localStorage.getItem(PRESET_WARD_SCHEDULE_KEY);
      if (pws) setPresetWardSchedule(JSON.parse(pws));

      const pst = localStorage.getItem(PRESET_SUBJECT_TOTALS_KEY);
      if (pst) setPresetSubjectTotals(JSON.parse(pst));

      const renames = localStorage.getItem(PRESET_RENAMES_KEY);
      if (renames) setRenamedPresetSubjects(JSON.parse(renames));

      const wardRenames = localStorage.getItem(PRESET_WARD_RENAMES_KEY);
      if (wardRenames) setRenamedPresetWards(JSON.parse(wardRenames));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || [CUSTOM_SUBJECTS_KEY, CUSTOM_WARDS_KEY, USER_ADDED_SUBJECTS_KEY, SUBJECT_MODE_KEY, PRESET_TIMETABLE_KEY, PRESET_WARD_SCHEDULE_KEY, PRESET_SUBJECT_TOTALS_KEY, PRESET_RENAMES_KEY, PRESET_WARD_RENAMES_KEY].includes(event.key)) {
        try {
          const cs = localStorage.getItem(CUSTOM_SUBJECTS_KEY); if (cs) setCustomSubjects(JSON.parse(cs));
          const cw = localStorage.getItem(CUSTOM_WARDS_KEY); if (cw) setCustomWards(JSON.parse(cw));
          const ua = localStorage.getItem(USER_ADDED_SUBJECTS_KEY); if (ua) setUserAddedSubjects(JSON.parse(ua));
          const m = localStorage.getItem(SUBJECT_MODE_KEY); if (m === 'preloaded' || m === 'custom') setSubjectMode(m);
          const tt = localStorage.getItem(PRESET_TIMETABLE_KEY); if (tt) setPresetTimetable(JSON.parse(tt));
          const ws = localStorage.getItem(PRESET_WARD_SCHEDULE_KEY); if (ws) setPresetWardSchedule(JSON.parse(ws));
          const totals = localStorage.getItem(PRESET_SUBJECT_TOTALS_KEY); if (totals) setPresetSubjectTotals(JSON.parse(totals));
          const rn = localStorage.getItem(PRESET_RENAMES_KEY); if (rn) setRenamedPresetSubjects(JSON.parse(rn));
          const wrn = localStorage.getItem(PRESET_WARD_RENAMES_KEY); if (wrn) setRenamedPresetWards(JSON.parse(wrn));
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const subjectRegistry = useMemo<SubjectRef[]>(() => {
    const refs: SubjectRef[] = [];

    if (subjectMode === 'preloaded') {
      for (const cat of CATEGORIES) {
        for (const s of cat.subjects) {
          refs.push({
            id: (s as any).id || `acad:${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            name: renamedPresetSubjects[s.name] ?? s.name,
            domain: 'academic',
            kind: 'preset-academic',
            parentName: cat.name,
            planned: presetSubjectTotals[s.name] ?? s.total,
          });
        }
      }

      for (const s of INTEGRATED_SUBJECTS) {
        refs.push({
          id: (s as any).id || `int:${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          name: renamedPresetSubjects[s.name] ?? s.name,
          domain: 'academic',
          kind: 'integrated',
          parentName: 'Integrated Teaching',
          planned: presetSubjectTotals[s.name] ?? s.total,
        });
      }

      for (const w of WARD_SUBJECTS) {
        refs.push({
          id: (w as any).id || `ward:${w.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          name: renamedPresetWards[w.name] ?? w.name,
          domain: 'clinical',
          kind: 'preset-ward',
          planned: getPresetWardTotalPlannedLocal(w.name),
        });
      }

      for (const s of userAddedSubjects) {
        const isSGT = isSGTSubjectRecord(s);
        refs.push({
          id: s.id,
          name: s.name,
          domain: isSGT ? 'clinical' : 'academic',
          kind: isSGT ? 'sgt' : 'user-added',
          parentName: isSGT ? (s as any).clinicalSubject : getEffectiveParentName(s),
          planned: s.plannedClasses,
        });
      }
    } else {
      for (const s of customSubjects) {
        const isSGT = isSGTSubjectRecord(s);
        refs.push({
          id: s.id,
          name: s.name,
          domain: isSGT ? 'clinical' : 'academic',
          kind: isSGT ? 'sgt' : 'custom',
          parentName: isSGT ? (s as any).clinicalSubject : getEffectiveParentName(s),
          planned: s.plannedClasses,
        });
      }

      for (const w of customWards) {
        refs.push({
          id: w.id,
          name: w.name,
          domain: 'clinical',
          kind: 'ward-rotation',
          planned: getCustomWardTotalPlannedLocal(w.startDate, w.endDate, w.vacationPeriods),
        });
      }
    }

    return refs;
  }, [
    customSubjects,
    customWards,
    userAddedSubjects,
    subjectMode,
    renamedPresetSubjects,
    renamedPresetWards,
    presetSubjectTotals,
    presetWardSchedule,
  ]);

  const getSubjectById = useStableCallback((id: string): SubjectRef | undefined =>
    subjectRegistry.find(r => r.id === id));

  const getSubjectIdByName = useStableCallback((name: string, domain: SubjectDomain): string | undefined => {
    const n = name.trim().toLowerCase();
    return subjectRegistry.find(r => r.domain === domain && r.name.trim().toLowerCase() === n)?.id;
  });

  const isExcludedClinicalDay = (
    d: Date,
    vacationPeriods?: Array<{ start: string; end: string }>,
    includePresetHolidays = subjectMode === 'preloaded',
  ): boolean => {
    if (includePresetHolidays && d.getDay() === 5) return true;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const ds = `${y}-${m}-${dd}`;

    if (includePresetHolidays) {
      for (const h of WARD_SCHEDULE) {
        if ((h as any).ward === 'Holiday' && ds >= h.start && ds <= h.end) return true;
      }

      for (const h of presetWardSchedule) {
        if (h.ward === 'Holiday' && ds >= h.start && ds <= h.end) return true;
      }
    }

    for (const v of vacationPeriods || []) {
      if (v.start && v.end && ds >= v.start && ds <= v.end) return true;
    }

    return false;
  };

  function getPresetWardTotalPlannedLocal(wardName: string): number {
    const daysSet = new Set<string>();
    for (const slot of presetWardSchedule) {
      if (slot.ward !== wardName) continue;
      try {
        const start = new Date(slot.start + 'T12:00:00');
        const end = new Date(slot.end + 'T12:00:00');
        const cur = new Date(start);
        while (cur <= end) {
          if (!isExcludedClinicalDay(cur, slot.vacationPeriods, true)) {
            const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
            daysSet.add(key);
          }
          cur.setDate(cur.getDate() + 1);
        }
      } catch {
        /* ignore */
      }
    }
    return daysSet.size * 2;
  }

  function getCustomWardTotalPlannedLocal(
    startDateStr: string,
    endDateStr: string,
    vacationPeriods?: Array<{ start: string; end: string }>
  ): number {
    let count = 0;
    try {
      const start = new Date(startDateStr + 'T12:00:00');
      const end = new Date(endDateStr + 'T12:00:00');
      const cur = new Date(start);
      while (cur <= end) {
        if (!isExcludedClinicalDay(cur, vacationPeriods, false)) count++;
        cur.setDate(cur.getDate() + 1);
      }
    } catch {
      /* ignore */
    }
    return count * 2;
  }

  function countSGTPlannedDaysLocal(
    startDateStr: string,
    endDateStr: string,
    weekdays: string[],
    vacationPeriods?: Array<{ start: string; end: string }>
  ): number {
    let count = 0;
    try {
      const start = new Date(startDateStr + 'T12:00:00');
      const end = new Date(endDateStr + 'T12:00:00');
      const cur = new Date(start);
      const set = new Set(weekdays);
      while (cur <= end) {
        if (set.has(DAY_ABBRS[cur.getDay()]) && !isExcludedClinicalDay(cur, vacationPeriods, subjectMode === 'preloaded')) {
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    } catch {
      /* ignore */
    }
    return count;
  }

  const handleSetWhatsNewOpen = useStableCallback((open: boolean) => {
    if (!open) {
      localStorage.setItem(WHATS_NEW_KEY, 'true');
      storageSetItem(WHATS_NEW_KEY, 'true');
    }
    setWhatsNewOpenState(open);
  });

  const saveSubjects = (data: CustomSubject[]) => {
    setCustomSubjects(data);
    localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(data));
    storageSetItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(data));
  };

  const saveWards = (data: CustomWard[]) => {
    setCustomWards(data);
    localStorage.setItem(CUSTOM_WARDS_KEY, JSON.stringify(data));
    storageSetItem(CUSTOM_WARDS_KEY, JSON.stringify(data));
  };

  const saveUserAdded = (data: UserAddedSubject[]) => {
    setUserAddedSubjects(data);
    localStorage.setItem(USER_ADDED_SUBJECTS_KEY, JSON.stringify(data));
    storageSetItem(USER_ADDED_SUBJECTS_KEY, JSON.stringify(data));
  };

  const saveTimetable = (data: typeof TIMETABLE) => {
    presetTimetableRef.current = data;
    setPresetTimetable(data);
    localStorage.setItem(PRESET_TIMETABLE_KEY, JSON.stringify(data));
    storageSetItem(PRESET_TIMETABLE_KEY, JSON.stringify(data));
  };

  const saveWardSchedule = (data: PresetWardEntry[]) => {
    setPresetWardSchedule(data);
    localStorage.setItem(PRESET_WARD_SCHEDULE_KEY, JSON.stringify(data));
    storageSetItem(PRESET_WARD_SCHEDULE_KEY, JSON.stringify(data));
  };

  const saveTotals = (data: Record<string, number>) => {
    setPresetSubjectTotals(data);
    localStorage.setItem(PRESET_SUBJECT_TOTALS_KEY, JSON.stringify(data));
    storageSetItem(PRESET_SUBJECT_TOTALS_KEY, JSON.stringify(data));
  };

  const saveRenames = (data: Record<string, string>) => {
    setRenamedPresetSubjects(data);
    localStorage.setItem(PRESET_RENAMES_KEY, JSON.stringify(data));
    storageSetItem(PRESET_RENAMES_KEY, JSON.stringify(data));
  };

  const saveWardRenames = (data: Record<string, string>) => {
    setRenamedPresetWards(data);
    localStorage.setItem(PRESET_WARD_RENAMES_KEY, JSON.stringify(data));
    storageSetItem(PRESET_WARD_RENAMES_KEY, JSON.stringify(data));
  };

  const addCustomSubjects = useStableCallback((items: Array<Omit<CustomSubject, 'id'>>): CustomSubject[] => {
    if (subjectMode !== 'custom') return [];
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
  });

  const addCustomSubject = useStableCallback((s: Omit<CustomSubject, 'id'>): CustomSubject =>
    addCustomSubjects([s])[0]);

  const updateCustomSubject = useStableCallback((id: string, patch: Partial<Omit<CustomSubject, 'id'>>) => {
    if (subjectMode !== 'custom') return;
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
    if (merged.subjectType === 'allied' && merged.parentName) {
      merged.category = merged.parentName;
    }

    let next = customSubjects.map(s => (s.id === id ? merged : s));

    const oldName = existing.name.trim().toLowerCase();
    const renamed =
      patch.name !== undefined && patch.name.trim().toLowerCase() !== oldName;

    if (renamed) {
      next = next.map(s =>
        s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === oldName
          ? { ...s, parentName: patch.name, category: patch.name }
          : s
      );
    }

    saveSubjects(next);
  });

  const removeCustomSubject = useStableCallback((id: string) => {
    if (subjectMode !== 'custom') return;
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
  });

  const addCustomWards = useStableCallback((items: Array<Omit<CustomWard, 'id'>>): CustomWard[] => {
    if (subjectMode !== 'custom') return [];
    const created = items.map(it => ({
      ...it,
      morningTime: canonicalizeTimeRange(it.morningTime ?? DEFAULT_MORNING_TIME),
      eveningTime: canonicalizeTimeRange(it.eveningTime ?? DEFAULT_EVENING_TIME),
      id: genId('cw'),
    }));
    saveWards([...customWards, ...created]);
    return created;
  });

  const addCustomWard = useStableCallback((w: Omit<CustomWard, 'id'>): CustomWard => addCustomWards([w])[0]);

  const updateCustomWard = useStableCallback((id: string, patch: Partial<Omit<CustomWard, 'id'>>) => {
    if (subjectMode !== 'custom') return;
    const existing = customWards.find(w => w.id === id);
    if (!existing) return;

    const normalized: Partial<Omit<CustomWard, 'id'>> = { ...patch };
    if (normalized.morningTime !== undefined) {
      normalized.morningTime = canonicalizeTimeRange(normalized.morningTime);
    }
    if (normalized.eveningTime !== undefined) {
      normalized.eveningTime = canonicalizeTimeRange(normalized.eveningTime);
    }

    saveWards(customWards.map(w => (w.id === id ? { ...w, ...normalized } : w)));
  });

  const removeCustomWard = useStableCallback((id: string) => {
    if (subjectMode !== 'custom') return;
    saveWards(customWards.filter(w => w.id !== id));
  });

  const getCurrentCustomWard = useStableCallback((): CustomWard | null => {
    if (subjectMode !== 'custom') return null;
    const today = getCurrentDateStr();
    return customWards.find(w => today >= w.startDate && today <= w.endDate) ?? null;
  });

  const addUserAddedSubjects = useStableCallback((
    items: Array<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>
  ): UserAddedSubject[] => {
    if (subjectMode !== 'preloaded') return [];
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
        category:
          it.category ?? (it.subjectType === 'allied' && it.parentName ? it.parentName : undefined),
        plannedClasses: it.plannedClasses,
        days: rows.map(r => r.day).join(', '),
        time: rows.length ? rowTime(rows[0]) : canonicalizeTimeRange(it.time || ''),
        schedules: storedSchedules,
        startDate: (it as any).startDate,
        endDate: (it as any).endDate,
        clinicalSubject: (it as any).clinicalSubject,
        vacationPeriods: (it as any).vacationPeriods,
        id: '',
      };

      const isRecordSGT = isSGTSubjectRecord(record);
      const existingIdx = nextUserAdded.findIndex(
        e =>
          e.name.trim().toLowerCase() === record.name.trim().toLowerCase() &&
          isSGTSubjectRecord(e) === isRecordSGT
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

      if (record.subjectType !== 'allied-parent' && !isRecordSGT) {
        nextTimetable = syncSubjectSchedules(nextTimetable, record.name, rows);
        nextTotals[record.name] = record.plannedClasses;
      }
    }

    saveUserAdded(nextUserAdded);
    saveTimetable(nextTimetable);
    saveTotals(nextTotals);
    return created;
  });

  const addUserAddedSubject = useStableCallback((
    s: Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }
  ): UserAddedSubject => addUserAddedSubjects([s])[0]);

  const updateUserAddedSubject = useStableCallback((
    id: string,
    patch: Partial<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }>
  ) => {
    if (subjectMode !== 'preloaded') return;
    const existing = userAddedSubjects.find(e => e.id === id);
    if (!existing) return;

    const normalized: Partial<Omit<UserAddedSubject, 'id'> & { schedules?: ScheduleRowInput[] }> =
      { ...patch };
    const merged: UserAddedSubject = { ...existing };

    if (normalized.name !== undefined) merged.name = normalized.name;
    if (normalized.subjectType !== undefined) merged.subjectType = normalized.subjectType;
    if (normalized.parentName !== undefined) merged.parentName = normalized.parentName;
    if (normalized.category !== undefined) merged.category = normalized.category;
    if (normalized.plannedClasses !== undefined) merged.plannedClasses = normalized.plannedClasses;
    if ((normalized as any).startDate !== undefined) (merged as any).startDate = (normalized as any).startDate;
    if ((normalized as any).endDate !== undefined) (merged as any).endDate = (normalized as any).endDate;
    if ((normalized as any).clinicalSubject !== undefined) {
      (merged as any).clinicalSubject = (normalized as any).clinicalSubject;
    }
    if ((normalized as any).vacationPeriods !== undefined) (merged as any).vacationPeriods = (normalized as any).vacationPeriods;

    if (merged.subjectType === 'allied' && merged.parentName) {
      merged.category = merged.parentName;
    }

    let rows: ScheduleRowInput[];
    if (normalized.schedules !== undefined) {
      rows = normalized.schedules;
    } else if (normalized.days !== undefined || normalized.time !== undefined) {
      if (normalized.days !== undefined) merged.days = normalized.days;
      if (normalized.time !== undefined) merged.time = canonicalizeTimeRange(normalized.time);
      rows = parseDayList(merged.days).map(d => ({ day: d, time: merged.time }));
    } else {
      rows =
        existing.schedules && existing.schedules.length
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

    const isSGT = isSGTSubjectRecord(merged);
    const wasSGT = isSGTSubjectRecord(existing);
    const isAcademicNow = merged.subjectType !== 'allied-parent' && !isSGT;
    const wasAcademic = existing.subjectType !== 'allied-parent' && !wasSGT;

    if (wasAcademic || isAcademicNow) {
      let tt = presetTimetableRef.current;
      const totals = { ...presetSubjectTotals };

      if (wasAcademic) {
        if (nameChanged || !isAcademicNow) {
          tt = removeSubjectFromTimetable(tt, existing.name);
          delete totals[existing.name];
        }
      }

      if (isAcademicNow) {
        tt = syncSubjectSchedules(tt, merged.name, rows);

        if (!wasAcademic) {
          totals[merged.name] = merged.plannedClasses;
        } else if (nameChanged) {
          const prevTotal = presetSubjectTotals[existing.name] ?? merged.plannedClasses;
          if (normalized.plannedClasses !== undefined) {
            totals[merged.name] = normalized.plannedClasses;
          } else if (prevTotal !== undefined) {
            totals[merged.name] = prevTotal;
          }
        } else if (normalized.plannedClasses !== undefined) {
          totals[merged.name] = merged.plannedClasses;
        }
      }

      saveTimetable(tt);
      saveTotals(totals);
    }
  });

  const removeUserAddedSubject = useStableCallback((id: string) => {
    if (subjectMode !== 'preloaded') return;
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
      const isSGT = isSGTSubjectRecord(r);
      if (r.subjectType === 'allied-parent' || isSGT) continue;
      tt = removeSubjectFromTimetable(tt, r.name);
      delete totals[r.name];
    }

    saveTimetable(tt);
    saveTotals(totals);
  });

  const isUserAddedName = useStableCallback((name: string): boolean => {
    const n = name.trim().toLowerCase();
    return userAddedSubjects.some(e => e.name.trim().toLowerCase() === n);
  });

  const addPresetWardEntry = useStableCallback((
    entry: Omit<PresetWardEntry, 'addedByUser'> & { addedByUser?: boolean }
  ) => {
    if (subjectMode !== 'preloaded') return;
    const withDefaults: PresetWardEntry = {
      ...entry,
      morningTime: canonicalizeTimeRange(entry.morningTime ?? DEFAULT_MORNING_TIME),
      eveningTime: canonicalizeTimeRange(entry.eveningTime ?? DEFAULT_EVENING_TIME),
      vacationPeriods: entry.vacationPeriods || [],
      addedByUser: entry.addedByUser ?? true,
    };
    saveWardSchedule(sortWardEntries([...presetWardSchedule, withDefaults]));
  });

  const updatePresetWardEntry = useStableCallback((index: number, patch: Partial<PresetWardEntry>) => {
    if (subjectMode !== 'preloaded' || !presetWardSchedule[index]) return;

    const normalized: Partial<PresetWardEntry> = { ...patch };
    if (normalized.morningTime !== undefined) {
      normalized.morningTime = canonicalizeTimeRange(normalized.morningTime);
    }
    if (normalized.eveningTime !== undefined) {
      normalized.eveningTime = canonicalizeTimeRange(normalized.eveningTime);
    }
    if (normalized.vacationPeriods !== undefined) {
      normalized.vacationPeriods = normalized.vacationPeriods.map(v => ({ ...v }));
    }

    const updated = presetWardSchedule.map((e, i) => (i === index ? { ...e, ...normalized } : e));
    saveWardSchedule(sortWardEntries(updated));
  });

  const removePresetWardEntry = useStableCallback((index: number) => {
    if (subjectMode !== 'preloaded' || !presetWardSchedule[index]) return;
    saveWardSchedule(presetWardSchedule.filter((_, i) => i !== index));
  });

  const renamePresetWard = useStableCallback((oldName: string, newName: string) => {
    if (subjectMode !== 'preloaded') return;
    const o = oldName.trim();
    const n = newName.trim();
    if (!o || !n || o === n) return;

    const next = { ...renamedPresetWards };
    next[o] = n;
    saveWardRenames(next);
  });

  const updatePresetTimetableSlot = useStableCallback((
    currentDay: number,
    slotIndex: number,
    updatedTime: string,
    updatedSubjects: string[],
    targetDay: number
  ) => {
    if (subjectMode !== 'preloaded') return;
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
      next[Number(k)].sort((a, b) => {
        const ta = parseRangeToMinutes(a.time)?.start ?? Number.MAX_SAFE_INTEGER;
        const tb = parseRangeToMinutes(b.time)?.start ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
    }

    saveTimetable(asTimetable(next));
  });

  const addSubjectToSlot = useStableCallback((day: number, time: string, name: string) => {
    if (subjectMode !== 'preloaded') return;
    const canon = canonicalizeTimeRange(time);
    const tt = insertSubjectSlot(presetTimetableRef.current, name, DAY_ABBRS[day], canon);
    saveTimetable(tt);
  });

  const updatePresetWardSchedule = useStableCallback((
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
  });

  const updatePresetSubjectTotal = useStableCallback((subjectName: string, total: number) => {
    if (subjectMode !== 'preloaded') return;
    saveTotals({ ...presetSubjectTotals, [subjectName]: total });
  });

  const getPresetSubjectDisplayName = useStableCallback((originalName: string): string =>
    subjectMode === 'preloaded' ? (renamedPresetSubjects[originalName] ?? originalName) : originalName);

  const setPresetSubjectRename = useStableCallback((oldName: string, newName: string) => {
    if (subjectMode !== 'preloaded') return;
    const nextRenames = { ...renamedPresetSubjects };
    nextRenames[oldName] = newName;
    saveRenames(nextRenames);
  });

  const getPresetWardDisplayName = useStableCallback((originalName: string): string =>
    subjectMode === 'preloaded' ? (renamedPresetWards[originalName] ?? originalName) : originalName);

  const completeSetup = useStableCallback(async (mode: SubjectMode, customRoutineName?: string) => {
    ensureCurriculumMigration();
    const targetKind = mode === 'custom' ? 'custom' : 'preset';
    const target = getCurriculumForKind(targetKind);
    if (target) {
      if (targetKind === 'custom' && customRoutineName?.trim() && target.name !== customRoutineName.trim()) {
        await renameCurriculumChecked(target.id, customRoutineName.trim());
      }
      await activateCurriculum(target.id);
    }
    await storageSetItemChecked(SUBJECT_MODE_KEY, mode);
    await storageSetItemChecked(SETUP_DONE_KEY, 'true');
    setSubjectMode(mode);
    setSetupDone(true);
  });

  const clearAllStorage = async () => {
    const durableData = await idbGetAllChecked();
    const localKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key));
    const discoveredUserKeys = [...Object.keys(durableData), ...localKeys].filter(key => key !== 'att_idb_migrated_v1' && !INSTALLATION_METADATA_KEYS.has(key));
    const durableCurriculumBundleKeys = Object.keys(durableData).filter(key => key.startsWith('att_curriculum_bundle_'));
    const keys = [
      CUSTOM_SUBJECTS_KEY,
      CUSTOM_WARDS_KEY,
      USER_ADDED_SUBJECTS_KEY,
      SUBJECT_MODE_KEY,
      SETUP_DONE_KEY,
      WHATS_NEW_KEY,
      PRESET_TIMETABLE_KEY,
      PRESET_WARD_SCHEDULE_KEY,
      PRESET_SUBJECT_TOTALS_KEY,
      PRESET_RENAMES_KEY,
      PRESET_WARD_RENAMES_KEY,
      SGT_REPAIR_DONE_KEY,
      'attendance_tracker_subjects',
      'attendance_tracker_ward',
      'attendance_tracker_home_selections',
      'attendance_tracker_finished_map',
      'attendance_tracker_preferred_percentage',
      'attendance_tracker_subjects_preset',
      'attendance_tracker_ward_preset',
      'attendance_tracker_home_selections_preset',
      'attendance_tracker_finished_map_preset',
      'attendance_tracker_subjects_custom',
      'attendance_tracker_ward_custom',
      'attendance_tracker_home_selections_custom',
      'attendance_tracker_finished_map_custom',
      'attendance_tracker_orphaned_records',
      'att_history',
      'att_manage_history',
      'attendenz_snapshots_v1',
      CURRICULUM_KEYS.CURRICULA_KEY,
      CURRICULUM_KEYS.ACTIVE_CURRICULUM_KEY,
      CURRICULUM_KEYS.CURRICULUM_MIGRATION_KEY,
      ...getCurricula().map(curriculum => `att_curriculum_bundle_${curriculum.id}`),
      ...durableCurriculumBundleKeys,
      ...discoveredUserKeys,
    ];
    const results = await Promise.allSettled([...new Set(keys)].map(key => storageRemoveItemChecked(key)));
    if (results.some(result => result.status === 'rejected')) throw new Error('Some local data could not be deleted. Nothing was reported as complete.');
    await storageSetItemChecked('att_idb_migrated_v1', 'true');
  };

  const startFresh = useStableCallback(async () => {
    await clearAllStorage();
    setCustomSubjects([]);
    setCustomWards([]);
    setUserAddedSubjects([]);
    setRenamedPresetSubjects({});
    setRenamedPresetWards({});
    presetTimetableRef.current = TIMETABLE;
    setPresetTimetable(TIMETABLE);
    setPresetWardSchedule(defaultWardSchedule());
    setPresetSubjectTotals({});
    await completeSetup('custom');
  });

  const changeSubjectMode = useStableCallback((mode: SubjectMode) => {
    ensureCurriculumMigration();
    const target = getCurriculumForKind(mode === 'custom' ? 'custom' : 'preset');
    if (target) void activateCurriculum(target.id);
    localStorage.setItem(SUBJECT_MODE_KEY, mode);
    storageSetItem(SUBJECT_MODE_KEY, mode);
    setSubjectMode(mode);
  });

  const clearRoutineData = useStableCallback(async (modeToClear: SubjectMode) => {
    if (modeToClear === 'preloaded') {
      const keys = [
        PRESET_TIMETABLE_KEY,
        PRESET_WARD_SCHEDULE_KEY,
        PRESET_SUBJECT_TOTALS_KEY,
        USER_ADDED_SUBJECTS_KEY,
        PRESET_RENAMES_KEY,
        PRESET_WARD_RENAMES_KEY,
      ];
      for (const key of keys) {
        await storageRemoveItemChecked(key);
      }
      presetTimetableRef.current = TIMETABLE;
      setPresetTimetable(TIMETABLE);
      setPresetWardSchedule(defaultWardSchedule());
      setPresetSubjectTotals({});
      setUserAddedSubjects([]);
      setRenamedPresetSubjects({});
      setRenamedPresetWards({});
    } else {
      await storageRemoveItemChecked(CUSTOM_SUBJECTS_KEY);
      await storageRemoveItemChecked(CUSTOM_WARDS_KEY);
      setCustomSubjects([]);
      setCustomWards([]);
    }
  });

  const getSubjectPlannedTotal = useStableCallback((subjectName: string): number => {
    if (subjectMode === 'custom') {
      const custom = customSubjects.find(
        s => s.name.trim().toLowerCase() === subjectName.trim().toLowerCase()
      );
      return custom?.plannedClasses ?? 0;
    }

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
  });

  const getCurrentPresetWard = useStableCallback((
    date: Date = new Date()
  ): { ward: string; morningTime?: string; eveningTime?: string } | null => {
    if (subjectMode !== 'preloaded') return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    for (const schedule of presetWardSchedule) {
      if (dateStr >= schedule.start && dateStr <= schedule.end) {
        return {
          ward: schedule.ward,
          morningTime: schedule.morningTime,
          eveningTime: schedule.eveningTime,
        };
      }
    }
    return null;
  });

  const getPresetWardTotalPlanned = useStableCallback((wardName: string): number =>
    subjectMode === 'preloaded' ? getPresetWardTotalPlannedLocal(wardName) : 0);

  const getCustomWardTotalPlanned = useStableCallback((
    startDateStr: string,
    endDateStr: string,
    vacationPeriods?: Array<{ start: string; end: string }>
  ): number => subjectMode === 'custom'
    ? getCustomWardTotalPlannedLocal(startDateStr, endDateStr, vacationPeriods)
    : 0);

  const countSGTPlannedDays = useStableCallback((
    startDateStr: string,
    endDateStr: string,
    weekdays: string[],
    vacationPeriods?: Array<{ start: string; end: string }>
  ): number => countSGTPlannedDaysLocal(startDateStr, endDateStr, weekdays, vacationPeriods));

  const getParentOptions = useStableCallback((): string[] => {
    const opts: string[] = [];
    const push = (n: string) => {
      const t = n.trim();
      if (t && !opts.some(o => o.toLowerCase() === t.toLowerCase())) opts.push(t);
    };

    if (subjectMode === 'preloaded') {
      for (const cat of CATEGORIES) {
        push(cat.name);
        for (const s of cat.subjects) {
          push(s.name);
          const rn = renamedPresetSubjects[s.name];
          if (rn) push(rn);
        }
      }
      push('Integrated Teaching');
      for (const s of INTEGRATED_SUBJECTS) {
        const rn = renamedPresetSubjects[s.name];
        if (rn) push(rn);
      }

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
  });

  const isExistingParent = useStableCallback((name: string): boolean => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    return getParentOptions().some(o => o.toLowerCase() === n);
  });

  const getAlliedChildCount = useStableCallback((parentName: string): number => {
    const p = parentName.trim().toLowerCase();
    if (!p) return 0;

    const store = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    return store.filter(
      s => s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p
    ).length;
  });

  const getCustomAlliedChildren = useStableCallback((parentName: string): CustomSubject[] => {
    if (subjectMode !== 'custom') return [];
    const p = parentName.trim().toLowerCase();
    return customSubjects.filter(
      s => s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p
    );
  });

  const getUserAddedAlliedChildren = useStableCallback((parentName: string): UserAddedSubject[] => {
    if (subjectMode !== 'preloaded') return [];
    const p = parentName.trim().toLowerCase();
    return userAddedSubjects.filter(
      s => s.subjectType === 'allied' && getEffectiveParentName(s)?.toLowerCase() === p
    );
  });

  const isSubjectNameTaken = useStableCallback((
    name: string,
    excludeName?: string,
    domain: SubjectDomain = 'academic'
  ): boolean => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    const ex = excludeName?.trim().toLowerCase();

    const pool: string[] = [];

    if (subjectMode === 'preloaded') {
      if (domain === 'academic') {
        for (const cat of CATEGORIES) {
          for (const s of cat.subjects) {
            pool.push(s.name);
            const rn = renamedPresetSubjects[s.name];
            if (rn) pool.push(rn);
          }
        }
        for (const s of INTEGRATED_SUBJECTS) {
          pool.push(s.name);
          const rn = renamedPresetSubjects[s.name];
          if (rn) pool.push(rn);
        }
        for (const s of userAddedSubjects) {
          if (!isSGTSubjectRecord(s)) pool.push(s.name);
        }
      } else if (domain === 'clinical') {
        for (const s of userAddedSubjects) {
          if (isSGTSubjectRecord(s)) pool.push(s.name);
        }
        for (const w of WARD_SUBJECTS) {
          pool.push(w.name);
          const rn = renamedPresetWards[w.name];
          if (rn) pool.push(rn);
        }
      }
    }

    for (const s of customSubjects) {
      const isSGT = isSGTSubjectRecord(s);
      if (domain === 'academic' && isSGT) continue;
      if (domain === 'clinical' && !isSGT) continue;
      pool.push(s.name);
    }

    return pool.some(p => p.trim().toLowerCase() === n && p.trim().toLowerCase() !== ex);
  });

  const isWardNameTaken = useStableCallback((name: string, excludeWard?: string): boolean => {
    const n = name.trim().toLowerCase();
    if (!n) return false;
    const ex = excludeWard?.trim().toLowerCase();

    const pool: string[] = [];

    if (subjectMode === 'preloaded') {
      for (const e of presetWardSchedule) {
        pool.push(e.ward);
        const rn = renamedPresetWards[e.ward];
        if (rn) pool.push(rn);
      }
      for (const w of WARD_SUBJECTS) {
        pool.push(w.name);
        const rn = renamedPresetWards[w.name];
        if (rn) pool.push(rn);
      }
    }

    for (const w of customWards) pool.push(w.name);

    return pool.some(p => p.trim().toLowerCase() === n && p.trim().toLowerCase() !== ex);
  });

  const findSubjectTimeConflicts = useStableCallback((
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

            const filteredSubjects = slot.subjects.filter(
              s => !(ex && s.trim().toLowerCase() === ex)
            );
            if (filteredSubjects.length === 0) continue;

            if (timesOverlap(slot.time, time)) {
              conflicts.push({
                day: abbr,
                time: slot.time,
                subjects: [...filteredSubjects],
                exact: sameRange(slot.time, time),
              });
            }
          }
        }
      } else {
        const sgtSubjects = userAddedSubjects.filter(s => isSGTSubjectRecord(s));
        for (const s of sgtSubjects) {
          if (ex && s.name.trim().toLowerCase() === ex) continue;

          const sDays = new Set<string>(parseDayList(s.days));
          const ranges: string[] = [];
          if (s.schedules && s.schedules.length) {
            for (const sch of s.schedules) {
              const range = (sch as any).time
                ? canonicalizeTimeRange((sch as any).time)
                : canonicalTimeRange(sch.start || '', sch.end || '');
              if (range) ranges.push(range);
              sDays.add(sch.day);
            }
          } else if (s.time) {
            ranges.push(s.time);
          }

          const hitDays = [...daySet].filter(d => sDays.has(d));
          if (hitDays.length === 0) continue;

          for (const r of ranges) {
            if (!timesOverlap(r, time)) continue;
            for (const d of hitDays) {
              conflicts.push({ day: d, time: r, subjects: [s.name], exact: sameRange(r, time) });
            }
          }
        }
      }
    } else {
      if (domain === 'academic') {
        for (const s of customSubjects) {
          const isSGT = isSGTSubjectRecord(s);
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
      } else {
        const sgtSubjects = customSubjects.filter(s => isSGTSubjectRecord(s));
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
  });

  const findWardDateConflicts = useStableCallback((
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
  });

  const bulkUpdateSubjectHierarchy = useStableCallback((
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

      const wasSGT = isSGTSubjectRecord(s);
      if (wasSGT) {
        let updated = { ...s };
        if (move.newParentName && move.newParentName !== 'Small Group Teaching') {
          updated = { ...updated, clinicalSubject: move.newParentName };
        }
        return {
          ...updated,
          subjectType: 'allied' as const,
          parentName: 'Small Group Teaching',
          category: 'Small Group Teaching',
        } as UserAddedSubject;
      }

      return {
        ...s,
        subjectType: move.newSubjectType,
        parentName: move.newParentName,
        category: move.newSubjectType === 'allied' ? move.newParentName : undefined,
      } as UserAddedSubject;
    });

    let nextCS = customSubjects.map(s => {
      const move = moves.find(m => m.store === 'custom' && m.id === s.id);
      if (!move) return s;

      const wasSGT = isSGTSubjectRecord(s);
      if (wasSGT) {
        let updated = { ...s };
        if (move.newParentName && move.newParentName !== 'Small Group Teaching') {
          updated = { ...updated, clinicalSubject: move.newParentName };
        }
        return {
          ...updated,
          subjectType: 'allied' as const,
          parentName: 'Small Group Teaching',
          category: 'Small Group Teaching',
        } as CustomSubject;
      }

      return {
        ...s,
        subjectType: move.newSubjectType,
        parentName: move.newParentName,
        category: move.newSubjectType === 'allied' ? move.newParentName : undefined,
      } as CustomSubject;
    });

    const filterEmptyParents = <
      T extends { id: string; name: string; subjectType: string; parentName?: string; category?: string }
    >(
      list: T[]
    ): T[] => {
      const parents = list.filter(s => s.subjectType === 'allied-parent');
      const toDelete = new Set<string>();
      for (const p of parents) {
        const childCount = list.filter(
          s =>
            s.subjectType === 'allied' &&
            getEffectiveParentName(s)?.toLowerCase() === p.name.toLowerCase()
        ).length;
        if (childCount === 0) toDelete.add(p.id);
      }
      return list.filter(s => !toDelete.has(s.id));
    };

    nextUA = filterEmptyParents(nextUA);
    nextCS = filterEmptyParents(nextCS);

    let tt = presetTimetableRef.current;
    const totals = { ...presetSubjectTotals };

    for (const move of moves) {
      if (move.store !== 'userAdded') continue;
      const oldRec = userAddedSubjects.find(s => s.id === move.id);
      const newRec = nextUA.find(s => s.id === move.id);
      if (!oldRec || !newRec) continue;

      const wasAcademic =
        oldRec.subjectType !== 'allied-parent' && !isSGTSubjectRecord(oldRec);
      const isAcademicNow =
        newRec.subjectType !== 'allied-parent' && !isSGTSubjectRecord(newRec);

      if (wasAcademic && !isAcademicNow) {
        tt = removeSubjectFromTimetable(tt, oldRec.name);
        delete totals[oldRec.name];
      } else if (!wasAcademic && isAcademicNow) {
        const rows: ScheduleRowInput[] =
          newRec.schedules && newRec.schedules.length
            ? newRec.schedules.map(s => ({ day: s.day, start: s.start, end: s.end }))
            : parseDayList(newRec.days).map(d => ({ day: d, time: newRec.time }));
        tt = syncSubjectSchedules(tt, newRec.name, rows);
        totals[newRec.name] = newRec.plannedClasses;
      } else if (wasAcademic && isAcademicNow && oldRec.name !== newRec.name) {
        tt = removeSubjectFromTimetable(tt, oldRec.name);
        delete totals[oldRec.name];
        const rows: ScheduleRowInput[] =
          newRec.schedules && newRec.schedules.length
            ? newRec.schedules.map(s => ({ day: s.day, start: s.start, end: s.end }))
            : parseDayList(newRec.days).map(d => ({ day: d, time: newRec.time }));
        tt = syncSubjectSchedules(tt, newRec.name, rows);
        totals[newRec.name] = newRec.plannedClasses;
      }
    }

    saveUserAdded(nextUA);
    saveSubjects(nextCS);
    saveTimetable(tt);
    saveTotals(totals);

    return moves.length;
  });

  const exposedCustomSubjects = useMemo(
    () => subjectMode === 'custom' ? customSubjects : [],
    [subjectMode, customSubjects]
  );
  const exposedCustomWards = useMemo(
    () => subjectMode === 'custom' ? customWards : [],
    [subjectMode, customWards]
  );
  const exposedUserAddedSubjects = useMemo(
    () => subjectMode === 'preloaded' ? userAddedSubjects : [],
    [subjectMode, userAddedSubjects]
  );
  const exposedPresetTimetable = useMemo(
    () => subjectMode === 'preloaded' ? presetTimetable : ({} as typeof TIMETABLE),
    [subjectMode, presetTimetable]
  );
  const exposedPresetWardSchedule = useMemo(
    () => subjectMode === 'preloaded' ? presetWardSchedule : [],
    [subjectMode, presetWardSchedule]
  );
  const exposedPresetSubjectTotals = useMemo(
    () => subjectMode === 'preloaded' ? presetSubjectTotals : {},
    [subjectMode, presetSubjectTotals]
  );
  const contextValue = useMemo(() => ({
    customSubjects: exposedCustomSubjects,
    customWards: exposedCustomWards,
    addCustomSubject, addCustomSubjects, updateCustomSubject, removeCustomSubject,
    addCustomWard, addCustomWards, updateCustomWard, removeCustomWard,
    getCurrentCustomWard, userAddedSubjects: exposedUserAddedSubjects,
    addUserAddedSubject, addUserAddedSubjects, updateUserAddedSubject, removeUserAddedSubject,
    isUserAddedName, presetTimetable: exposedPresetTimetable,
    presetWardSchedule: exposedPresetWardSchedule, presetSubjectTotals: exposedPresetSubjectTotals,
    addPresetWardEntry, updatePresetWardEntry, removePresetWardEntry, renamePresetWard,
    updatePresetTimetableSlot, addSubjectToSlot, updatePresetWardSchedule, updatePresetSubjectTotal,
    getSubjectPlannedTotal, getCurrentPresetWard, getPresetWardTotalPlanned, getCustomWardTotalPlanned,
    countSGTPlannedDays, getParentOptions, isExistingParent, getAlliedChildCount,
    getCustomAlliedChildren, getUserAddedAlliedChildren, isSubjectNameTaken, isWardNameTaken,
    findSubjectTimeConflicts, findWardDateConflicts, bulkUpdateSubjectHierarchy,
    subjectMode, setupDone, whatsNewOpen, setWhatsNewOpen: handleSetWhatsNewOpen,
    completeSetup, startFresh, changeSubjectMode, clearRoutineData, getPresetSubjectDisplayName,
    setPresetSubjectRename, getPresetWardDisplayName, subjectRegistry, getSubjectById, getSubjectIdByName,
  }), [
    exposedCustomSubjects, exposedCustomWards, exposedUserAddedSubjects, exposedPresetTimetable,
    exposedPresetWardSchedule, exposedPresetSubjectTotals, subjectMode, setupDone, whatsNewOpen,
    subjectRegistry,
  ]);

  return (
    <CustomDataContext.Provider
      value={contextValue}

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
