import { useEffect, type ReactNode } from 'react';
import {
  DAY_ABBRS,
  useCustomData,
  type CustomSubject,
  type CustomWard,
  type UserAddedSubject,
} from '@/contexts/CustomDataContext';
import {
  getAcademicAttendanceKey,
  getSGTKey,
  getWardAttendanceKey,
  useAttendance,
  type AttendanceData,
} from '@/contexts/AttendanceContext';
import {
  getNotificationPreferences,
  getSystemNotificationsEnabled,
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
  type NotificationPreferences,
} from '@/lib/notifications';
import {
  getOneSignalSubscriptionId,
  isOneSignalConfiguredForCurrentOrigin,
  ONE_SIGNAL_STATE_CHANGED_EVENT,
} from '@/lib/onesignal';
import { parseRangeToMinutes } from '@/lib/utils';

const SERVICE_URL = (import.meta.env.VITE_REMINDER_SERVICE_URL || '').replace(/\/$/, '');
const DEVICE_ID_KEY = 'att_a1_reminder_device_id_v1';
const DEVICE_TOKEN_KEY = 'att_a1_reminder_device_token_v1';
const HORIZON_DAYS = 21;
const MAX_OCCURRENCES = 250;

type ReminderCategory = 'academic' | 'clinical' | 'sgt' | 'ward';

type ReminderOccurrence = {
  id: string;
  localDate: string;
  startMinute: number;
  subjectLabel: string;
  category: ReminderCategory;
  needsAttention: boolean;
};

type ReminderSyncPayload = {
  version: 1;
  deviceId: string;
  deviceToken: string;
  oneSignalSubscriptionId: string;
  timezone: string;
  notificationsEnabled: boolean;
  preferences: Pick<NotificationPreferences, 'midnightNeedAttention' | 'preClassNeedAttention' | 'allScheduledDigest' | 'leadMinutes'>;
  occurrences: ReminderOccurrence[];
};

function stableRandomToken(): string {
  const webCrypto = typeof window !== 'undefined' ? window.crypto : undefined;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID().replace(/-/g, '');
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(32);
    webCrypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

function getDeviceValue(key: string): string {
  const current = localStorage.getItem(key);
  if (current) return current;
  const created = stableRandomToken();
  localStorage.setItem(key, created);
  return created;
}

function localDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayAbbreviation(date: Date): string {
  return DAY_ABBRS[date.getDay()];
}

function parseTime(time: string): { startMinute: number; endMinute: number } | null {
  const range = parseRangeToMinutes(time);
  if (!range) return null;
  return { startMinute: range.start, endMinute: range.end };
}

function isInVacation(date: string, periods?: Array<{ start: string; end: string }>): boolean {
  return Boolean(periods?.some(period => date >= period.start && date <= period.end));
}

function isWithinDates(date: string, startDate?: string, endDate?: string, periods?: Array<{ start: string; end: string }>): boolean {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return !isInVacation(date, periods);
}

function rowsForSubject(subject: CustomSubject | UserAddedSubject): Array<{ day: string; time: string }> {
  if (subject.schedules?.length) {
    return subject.schedules.map(row => ({
      day: row.day,
      time: 'time' in row ? row.time : `${row.start}–${row.end}`,
    }));
  }
  const days = (subject.days || '').split(',').map(day => day.trim()).filter(Boolean);
  return days.map(day => ({ day, time: subject.time || '' }));
}

function attentionFor(
  attendance: AttendanceData | undefined,
  finished: boolean,
  planned: number,
  target: number,
): boolean {
  if (finished || planned <= 0) return false;
  const attended = attendance?.attended || 0;
  const missed = attendance?.missed || 0;
  const conducted = attended + missed;
  if (conducted === 0) return false;
  const percentage = (attended / conducted) * 100;
  const required = Math.max(0, Math.ceil(planned * (target / 100)) - attended);
  const remaining = Math.max(0, planned - conducted);
  const warningOrDanger = percentage <= target + 5;
  return warningOrDanger || required > remaining;
}

function subjectAttention(
  name: string,
  subjectRegistry: ReturnType<typeof useCustomData>['subjectRegistry'],
  subjectAttendance: Record<string, AttendanceData>,
  wardAttendance: Record<string, AttendanceData>,
  finishedMap: Record<string, boolean>,
  plannedFallback: number,
  target: number,
): boolean {
  const reference = subjectRegistry.find(item => item.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!reference) return false;
  const attendanceKey = reference.kind === 'sgt'
    ? getSGTKey(reference.id)
    : reference.domain === 'clinical'
      ? getWardAttendanceKey(reference.id)
      : getAcademicAttendanceKey(reference.id);
  const attendanceStore = reference.kind === 'sgt' || reference.domain === 'academic' ? subjectAttendance : wardAttendance;
  return attentionFor(attendanceStore[attendanceKey], Boolean(finishedMap[attendanceKey]), reference.planned || plannedFallback, target);
}

function buildOccurrences(input: {
  subjectMode: ReturnType<typeof useCustomData>['subjectMode'];
  customSubjects: CustomSubject[];
  customWards: CustomWard[];
  userAddedSubjects: UserAddedSubject[];
  presetTimetable: ReturnType<typeof useCustomData>['presetTimetable'];
  presetWardSchedule: ReturnType<typeof useCustomData>['presetWardSchedule'];
  subjectRegistry: ReturnType<typeof useCustomData>['subjectRegistry'];
  subjects: Record<string, AttendanceData>;
  wards: Record<string, AttendanceData>;
  finishedMap: Record<string, boolean>;
  preferredPercentage: number;
  getSubjectPlannedTotal: (name: string) => number;
  getPresetWardTotalPlanned: (name: string) => number;
  getCustomWardTotalPlanned: (startDate: string, endDate: string, vacationPeriods?: Array<{ start: string; end: string }>) => number;
  getPresetSubjectDisplayName: (name: string) => string;
  getPresetWardDisplayName: (name: string) => string;
}): ReminderOccurrence[] {
  const occurrences: ReminderOccurrence[] = [];
  const seen = new Set<string>();
  const add = (item: ReminderOccurrence) => {
    if (occurrences.length >= MAX_OCCURRENCES) return;
    const key = `${item.localDate}|${item.category}|${item.id}|${item.startMinute}|${item.subjectLabel}`;
    if (seen.has(key)) return;
    seen.add(key);
    occurrences.push(item);
  };

  const today = new Date();
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    const localDate = localDateString(date);
    const day = dayAbbreviation(date);

    if (input.subjectMode === 'custom') {
      for (const subject of input.customSubjects) {
        if (subject.subjectType === 'allied-parent' || !isWithinDates(localDate, subject.startDate, subject.endDate, subject.vacationPeriods)) continue;
        const registryItem = input.subjectRegistry.find(item => item.id === subject.id);
        const domain = registryItem?.domain || (subject.category?.toLowerCase().includes('clinical') ? 'clinical' : 'academic');
        const category: ReminderCategory = registryItem?.kind === 'sgt' ? 'sgt' : domain === 'clinical' ? 'clinical' : 'academic';
        const planned = registryItem?.planned ?? subject.plannedClasses;
        for (const row of rowsForSubject(subject)) {
          if (row.day !== day) continue;
          const parsed = parseTime(row.time);
          if (!parsed) continue;
          add({
            id: `custom-${subject.id}`,
            localDate,
            startMinute: parsed.startMinute,
            subjectLabel: subject.name,
            category,
            needsAttention: subjectAttention(subject.name, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, planned, input.preferredPercentage),
          });
        }
      }

      for (const ward of input.customWards) {
        if (!isWithinDates(localDate, ward.startDate, ward.endDate, ward.vacationPeriods)) continue;
        for (const [slot, time] of [['morning', ward.morningTime], ['evening', ward.eveningTime]] as const) {
          const parsed = parseTime(time || '');
          if (!parsed) continue;
          add({
            id: `custom-ward-${ward.id}-${slot}`,
            localDate,
            startMinute: parsed.startMinute,
            subjectLabel: ward.name,
            category: 'ward',
            needsAttention: subjectAttention(ward.name, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, input.getCustomWardTotalPlanned(ward.startDate, ward.endDate, ward.vacationPeriods), input.preferredPercentage),
          });
        }
      }
    } else {
      const slots = input.presetTimetable[date.getDay()] || [];
      for (const slot of slots) {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') continue;
        const parsed = parseTime(slot.time);
        if (!parsed) continue;
        for (const name of slot.subjects || []) {
          const label = input.getPresetSubjectDisplayName(name);
          const registryItem = input.subjectRegistry.find(item => item.name.trim().toLowerCase() === name.trim().toLowerCase() && item.domain === 'academic');
          const category: ReminderCategory = registryItem?.kind === 'sgt' ? 'sgt' : registryItem?.domain === 'clinical' ? 'clinical' : 'academic';
          add({
            id: `preset-${name}`,
            localDate,
            startMinute: parsed.startMinute,
            subjectLabel: label,
            category,
            needsAttention: subjectAttention(label, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, input.getSubjectPlannedTotal(name), input.preferredPercentage),
          });
        }
      }

      for (const subject of input.userAddedSubjects) {
        if (subject.subjectType !== 'allied' || subject.parentName !== 'Small Group Teaching') continue;
        for (const row of rowsForSubject(subject)) {
          if (row.day !== day) continue;
          const parsed = parseTime(row.time);
          if (!parsed) continue;
          add({
            id: `preset-sgt-${subject.id}`,
            localDate,
            startMinute: parsed.startMinute,
            subjectLabel: `${subject.name} (SGT)`,
            category: 'sgt',
            needsAttention: subjectAttention(subject.name, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, subject.plannedClasses, input.preferredPercentage),
          });
        }
      }

      for (const ward of input.presetWardSchedule) {
        if (localDate < ward.start || localDate > ward.end || isInVacation(localDate, ward.vacationPeriods)) continue;
        for (const [slot, time] of [['morning', ward.morningTime], ['evening', ward.eveningTime]] as const) {
          const parsed = parseTime(time || '');
          if (!parsed) continue;
          add({
            id: `preset-ward-${ward.ward}-${ward.start}-${slot}`,
            localDate,
            startMinute: parsed.startMinute,
            subjectLabel: input.getPresetWardDisplayName(ward.ward),
            category: 'ward',
            needsAttention: subjectAttention(ward.ward, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, input.getPresetWardTotalPlanned(ward.ward), input.preferredPercentage),
          });
        }
      }
    }
  }

  return occurrences.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.startMinute - b.startMinute || a.subjectLabel.localeCompare(b.subjectLabel));
}

async function syncReminderState(payload: ReminderSyncPayload): Promise<void> {
  if (!SERVICE_URL || !navigator.onLine) return;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    await fetch(`${SERVICE_URL}/v1/device/reminder-state`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${payload.deviceToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Reminder sync must never interrupt offline attendance use.
  } finally {
    window.clearTimeout(timeout);
  }
}

export function ReminderSyncProvider({ children }: { children: ReactNode }) {
  const custom = useCustomData();
  const attendance = useAttendance();

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      if (!alive || !custom.setupDone || !isOneSignalConfiguredForCurrentOrigin()) return;
      const oneSignalSubscriptionId = await getOneSignalSubscriptionId();
      if (!alive || !oneSignalSubscriptionId) return;
      const preferences = getNotificationPreferences();
      const payload: ReminderSyncPayload = {
        version: 1,
        deviceId: getDeviceValue(DEVICE_ID_KEY),
        deviceToken: getDeviceValue(DEVICE_TOKEN_KEY),
        oneSignalSubscriptionId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        notificationsEnabled: getSystemNotificationsEnabled(),
        preferences: {
          midnightNeedAttention: preferences.midnightNeedAttention,
          preClassNeedAttention: preferences.preClassNeedAttention,
          allScheduledDigest: preferences.allScheduledDigest,
          leadMinutes: preferences.leadMinutes,
        },
        occurrences: buildOccurrences({
          subjectMode: custom.subjectMode,
          customSubjects: custom.customSubjects,
          customWards: custom.customWards,
          userAddedSubjects: custom.userAddedSubjects,
          presetTimetable: custom.presetTimetable,
          presetWardSchedule: custom.presetWardSchedule,
          subjectRegistry: custom.subjectRegistry,
          subjects: attendance.subjects,
          wards: attendance.wards,
          finishedMap: attendance.finishedMap,
          preferredPercentage: attendance.preferredPercentage,
          getSubjectPlannedTotal: custom.getSubjectPlannedTotal,
          getPresetWardTotalPlanned: custom.getPresetWardTotalPlanned,
          getCustomWardTotalPlanned: custom.getCustomWardTotalPlanned,
          getPresetSubjectDisplayName: custom.getPresetSubjectDisplayName,
          getPresetWardDisplayName: custom.getPresetWardDisplayName,
        }),
      };
      await syncReminderState(payload);
    };

    void sync();
    const events = ['online', NOTIFICATION_SETTINGS_CHANGED_EVENT, ONE_SIGNAL_STATE_CHANGED_EVENT];
    events.forEach(event => window.addEventListener(event, sync));
    return () => {
      alive = false;
      events.forEach(event => window.removeEventListener(event, sync));
    };
  }, [
    attendance.finishedMap,
    attendance.preferredPercentage,
    attendance.subjects,
    attendance.wards,
    custom.customSubjects,
    custom.customWards,
    custom.presetTimetable,
    custom.presetWardSchedule,
    custom.setupDone,
    custom.subjectMode,
    custom.subjectRegistry,
    custom.userAddedSubjects,
  ]);

  return children;
}

export const __test = { attentionFor, buildOccurrences, parseTime };
