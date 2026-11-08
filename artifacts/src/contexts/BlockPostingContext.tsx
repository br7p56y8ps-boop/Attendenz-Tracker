import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storageSetItemChecked } from '@/lib/idb';

export type AttendanceMark = 'attended' | 'missed' | 'off';
export type BlockSessionKind = 'posting' | 'roster-duty';

export interface BlockDepartment {
  id: string;
  name: string;
}

export const BLOCK_POSTING_DEPARTMENTS: BlockDepartment[] = [
  { id: 'medicine', name: 'Medicine' },
  { id: 'surgery', name: 'Surgery' },
  { id: 'obgyn', name: 'Obstetrics & Gynaecology' },
  { id: 'pediatrics', name: 'Pediatrics' },
  { id: 'dermatology', name: 'Dermatology' },
  { id: 'psychiatry', name: 'Psychiatry' },
  { id: 'ophthalmology', name: 'Ophthalmology (EYE)' },
  { id: 'ent', name: 'Otolaryngology (ENT)' },
  { id: 'orthopedics', name: 'Orthopedics' },
];

export interface RosterDutyRule {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface BlockPlacement {
  id: string;
  departmentId: string;
  startDate: string;
  endDate: string;
  rosterDutyEnabled: boolean;
  rosterDutyRules: RosterDutyRule[];
}

export interface BlockPostingConfig {
  initialized: boolean;
  placements: BlockPlacement[];
}

export interface BlockPostingAttendance {
  status: AttendanceMark;
  updatedAt: number;
}

export interface BlockProgress {
  departmentId: string;
  departmentName: string;
  attended: number;
  missed: number;
  conducted: number;
  planned: number;
  remaining: number;
  currentPercentage: number;
  predictedMaximum: number;
}

export interface BlockPlacementReminder {
  id: string;
  departmentName: string;
  endDate: string;
  reminderDate: string;
}

const CONFIG_KEY = 'att_block_posting_config_v2';
const ATTENDANCE_KEY = 'att_block_posting_attendance_v2';
const EMPTY_CONFIG: BlockPostingConfig = { initialized: false, placements: [] };

type BlockPostingContextValue = {
  config: BlockPostingConfig;
  attendance: Record<string, BlockPostingAttendance>;
  hydrated: boolean;
  updateConfig: (updater: (current: BlockPostingConfig) => BlockPostingConfig) => void;
  setAttendance: (key: string, value: BlockPostingAttendance | null) => void;
};

const BlockPostingContext = createContext<BlockPostingContextValue | null>(null);

function readObject<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

export function BlockPostingProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BlockPostingConfig>(EMPTY_CONFIG);
  const [attendance, setAttendance] = useState<Record<string, BlockPostingAttendance>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedConfig = readObject<Partial<BlockPostingConfig>>(CONFIG_KEY, {});
    const placements = Array.isArray(savedConfig.placements)
      ? savedConfig.placements.filter((item): item is BlockPlacement => Boolean(
        item && typeof item.id === 'string' && BLOCK_POSTING_DEPARTMENTS.some(dept => dept.id === item.departmentId)
        && /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(item.endDate)
        && item.startDate <= item.endDate,
      )).map(item => ({
        ...item,
        rosterDutyEnabled: item.rosterDutyEnabled === true,
        rosterDutyRules: Array.isArray(item.rosterDutyRules) ? item.rosterDutyRules : [],
      }))
      : [];
    setConfig({ initialized: savedConfig.initialized === true, placements });
    setAttendance(readObject<Record<string, BlockPostingAttendance>>(ATTENDANCE_KEY, {}));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) void storageSetItemChecked(CONFIG_KEY, JSON.stringify(config)).catch(error => console.error('Block Posting settings could not be saved.', error));
  }, [config, hydrated]);
  useEffect(() => {
    if (hydrated) void storageSetItemChecked(ATTENDANCE_KEY, JSON.stringify(attendance)).catch(error => console.error('Block Posting attendance could not be saved.', error));
  }, [attendance, hydrated]);

  const updateConfig = useCallback((updater: (current: BlockPostingConfig) => BlockPostingConfig) => {
    setConfig(current => updater(current));
  }, []);
  const setAttendanceRecord = useCallback((key: string, value: BlockPostingAttendance | null) => {
    setAttendance(current => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);

  const value = useMemo(() => ({ config, attendance, hydrated, updateConfig, setAttendance: setAttendanceRecord }), [config, attendance, hydrated, updateConfig, setAttendanceRecord]);
  return <BlockPostingContext.Provider value={value}>{children}</BlockPostingContext.Provider>;
}

export function useBlockPosting() {
  const context = useContext(BlockPostingContext);
  if (!context) throw new Error('useBlockPosting must be used inside BlockPostingProvider');
  return context;
}

export const createBlockPostingId = (prefix: string): string => {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
};

export const blockAttendanceKey = (placementId: string, date: string, kind: BlockSessionKind): string => `${placementId}:${date}:${kind}`;

export function placementIsActive(placement: BlockPlacement, date: string): boolean {
  return Boolean(placement.startDate && placement.endDate && date >= placement.startDate && date <= placement.endDate);
}

export function getRosterRulesForDate(placement: BlockPlacement, date: string): RosterDutyRule[] {
  if (!placement.rosterDutyEnabled) return [];
  const day = new Date(`${date}T12:00:00`).getDay();
  return placement.rosterDutyRules.filter(rule => rule.weekday === day);
}

export function getBlockPlannedSessions(placement: BlockPlacement, subjectMode: 'preloaded' | 'custom'): Array<{ date: string; kind: BlockSessionKind }> {
  const sessions: Array<{ date: string; kind: BlockSessionKind }> = [];
  const start = new Date(`${placement.startDate}T12:00:00`);
  const end = new Date(`${placement.endDate}T12:00:00`);
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const isGlobalRestDay = subjectMode === 'preloaded' && cursor.getDay() === 5;
    if (!isGlobalRestDay) sessions.push({ date, kind: 'posting' });
    getRosterRulesForDate(placement, date).forEach(() => sessions.push({ date, kind: 'roster-duty' }));
  }
  return sessions;
}

export function calculateBlockProgress(
  config: BlockPostingConfig,
  attendance: Record<string, BlockPostingAttendance>,
  subjectMode: 'preloaded' | 'custom',
): BlockProgress[] {
  const departmentMap = new Map(BLOCK_POSTING_DEPARTMENTS.map(department => [department.id, department.name]));
  const grouped = new Map<string, { attended: number; missed: number; planned: number; off: number }>();
  config.placements.forEach(placement => {
    const item = grouped.get(placement.departmentId) || { attended: 0, missed: 0, planned: 0, off: 0 };
    getBlockPlannedSessions(placement, subjectMode).forEach(session => {
      item.planned += 1;
      const mark = attendance[blockAttendanceKey(placement.id, session.date, session.kind)];
      if (mark?.status === 'attended') item.attended += 1;
      else if (mark?.status === 'missed') item.missed += 1;
      else if (mark?.status === 'off') item.off += 1;
    });
    grouped.set(placement.departmentId, item);
  });
  return Array.from(grouped.entries()).map(([departmentId, values]) => {
    const planned = Math.max(0, values.planned - values.off);
    const conducted = values.attended + values.missed;
    const remaining = Math.max(0, planned - conducted);
    return {
      departmentId,
      departmentName: departmentMap.get(departmentId) || 'Department',
      attended: values.attended,
      missed: values.missed,
      conducted,
      planned,
      remaining,
      currentPercentage: conducted > 0 ? (values.attended / conducted) * 100 : 0,
      predictedMaximum: planned > 0 ? ((values.attended + remaining) / planned) * 100 : 100,
    };
  }).sort((a, b) => a.departmentName.localeCompare(b.departmentName));
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function getNextBlockPlacementReminder(config: BlockPostingConfig, today: string): BlockPlacementReminder | null {
  const candidates = config.placements
    .filter(placement => placement.endDate > today)
    .filter(placement => !config.placements.some(next => next.startDate > placement.endDate))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  const placement = candidates[0];
  if (!placement) return null;
  const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement.departmentId);
  return {
    id: placement.id,
    departmentName: department?.name || 'Block Posting',
    endDate: placement.endDate,
    reminderDate: addCalendarDays(placement.endDate, -1),
  };
}
