import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HomeCard } from '@/components/HomeCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey } from '@/contexts/AttendanceContext';
import { useLocation } from 'wouter';
import { cn, rangeStartMinutes, getPresetAcademicSessionId, getPresetWardSessionId, getCustomSubjectSessionId } from '@/lib/utils';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { CATEGORIES, INTEGRATED_SUBJECTS, PRESET_PARENTS, WARD_SUBJECTS } from '@/lib/constants';
import { ArrowUpCircle, X, MoonStar, ClipboardCheck, Pencil, Plus, Minus, CalendarDays, Percent, Tag } from 'lucide-react';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { useAuth } from '@/contexts/AuthContext';
import { idbGet } from '@/lib/idb';
import { mergeDashboardActivities, type DashboardActivityItem } from '@/lib/activity';
import { shortenSubject } from '@/components/HomeCard';

const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
// Returns 1 if a>b, -1 if a<b, 0 if equal
function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}


interface HomeCardSpec {
  subject: string;
  time: string;
  isWard?: boolean;
  title?: string;
  subtitle?: string;
  tag?: string;
  tagColor?: string;
  sessionId: string;
  isSGT?: boolean;
  sgtId?: string;
}
interface DayEntry {
  id: string;
  time: string;
  kind: 'card' | 'holiday';
  card?: HomeCardSpec;
  holidayTime?: string;
}
type ActivityKind = 'attendance' | 'missed' | 'edit' | 'slot' | 'vacation' | 'percentage' | 'neutral';
interface ActivityItem extends DashboardActivityItem { kind: ActivityKind; }

export default function Home() {
  const today = new Date();
  const todayStr = toDateString(today);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const { customSubjects, customWards, userAddedSubjects, subjectMode, presetTimetable, presetWardSchedule, getCurrentPresetWard, getSubjectIdByName, getSubjectPlannedTotal, getPresetSubjectDisplayName, getPresetWardDisplayName, getPresetWardTotalPlanned, getCustomWardTotalPlanned } = useCustomData();
  const { homeSelections, finishedMap, subjects, wards, preferredPercentage } = useAttendance();
  const [, setLocation] = useLocation();
  const { username } = useAuth();
  const [showMarkAttendance, setShowMarkAttendance] = useState(false);
  const [dashboardActivities, setDashboardActivities] = useState<ActivityItem[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);

  /* ── Update notice ── */
  const [installedVersion] = useState<string>(() => {
    localStorage.setItem('att_app_version', APP_VERSION);
    return APP_VERSION;
  });

  const [, setPwaReady] = useState<boolean>(() => localStorage.getItem('att_pwa_update_ready') === 'true');
  const [serverVersion, setServerVersion] = useState<string>(() => localStorage.getItem('att_pwa_latest_version') || LATEST_VERSION);
  const [serverSummary, setServerSummary] = useState<string>(() => localStorage.getItem('att_pwa_update_summary') || '');
  useEffect(() => {
    const onReady = () => setPwaReady(true);
    const onCleared = () => {
      setPwaReady(false);
      setServerVersion(APP_VERSION);
      setServerSummary('');
    };
    window.addEventListener('attendenz:update-ready', onReady);
    window.addEventListener('attendenz:update-cleared', onCleared);
    return () => {
      window.removeEventListener('attendenz:update-ready', onReady);
      window.removeEventListener('attendenz:update-cleared', onCleared);
    };
  }, []);
  const isUpdateAvailable = compareVersions(serverVersion, installedVersion) > 0;
  const [updateNoticeDismissed, setUpdateNoticeDismissed] = useState<boolean>(() => sessionStorage.getItem('att_update_notice_dismissed') === 'true');
  const [updateInfoOpen, setUpdateInfoOpen] = useState(false);
  const showUpdatePill = isUpdateAvailable && !updateNoticeDismissed;
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Earliest recorded date
  const earliestDateStr = useMemo(() => {
    let earliest: Date | null = null;
    for (const key of Object.keys(homeSelections)) {
      const dateStr = key.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const d = new Date(dateStr + 'T12:00:00');
        if (!earliest || d < earliest) earliest = d;
      }
    }
    return earliest ? toDateString(earliest) : todayStr;
  }, [homeSelections, todayStr]);

  // Date wheel range
  const wheelDates = useMemo(() => {
    const start = new Date(earliestDateStr + 'T12:00:00');
    const end = addDays(today, 14);
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      dates.push(toDateString(d));
    }
    return dates;
  }, [earliestDateStr, today]);

  // Swipe state
  const wheelContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const velocity = useRef(0);
  const momentumId = useRef<number | null>(null);
  const currentOffset = useRef(0);
  const [offset, setOffset] = useState(0);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth);
  useEffect(() => {
    const el = wheelContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const ITEM_WIDTH = 80;
  const selectedIndex = wheelDates.indexOf(selectedDateStr);
  const effectiveIndex = selectedIndex !== -1 ? selectedIndex : wheelDates.indexOf(todayStr);
  const initialOffset = containerWidth / 2 - (effectiveIndex + 0.5) * ITEM_WIDTH;
  const wheelTranslateX = initialOffset + offset;

  const startMomentum = () => {
    if (momentumId.current) cancelAnimationFrame(momentumId.current);
    const step = () => {
      if (Math.abs(velocity.current) < 0.5) {
        const rawOffset = currentOffset.current;
        const snapped = Math.round(rawOffset / ITEM_WIDTH) * ITEM_WIDTH;
        const indexChange = Math.round(snapped / ITEM_WIDTH);
        let newIndex = effectiveIndex - indexChange;
        newIndex = Math.max(0, Math.min(wheelDates.length - 1, newIndex));
        setSelectedDateStr(wheelDates[newIndex]);
        setOffset(0);
        currentOffset.current = 0;
        momentumId.current = null;
        return;
      }
      velocity.current *= 0.97;
      currentOffset.current += velocity.current;
      setOffset(currentOffset.current);
      momentumId.current = requestAnimationFrame(step);
    };
    momentumId.current = requestAnimationFrame(step);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDragging.current = true;
    if (momentumId.current) {
      cancelAnimationFrame(momentumId.current);
      momentumId.current = null;
    }
    lastX.current = e.clientX;
    velocity.current = 0;
    currentOffset.current = offset;
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    velocity.current = dx * 0.5;
    currentOffset.current += dx;
    setOffset(currentOffset.current);
  };
  const handlePointerUp = (e?: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (Math.abs(velocity.current) > 20) {
      startMomentum();
    } else {
      const rawOffset = currentOffset.current;
      const snapped = Math.round(rawOffset / ITEM_WIDTH) * ITEM_WIDTH;
      const indexChange = Math.round(snapped / ITEM_WIDTH);
      let newIndex = effectiveIndex - indexChange;
      newIndex = Math.max(0, Math.min(wheelDates.length - 1, newIndex));
      setSelectedDateStr(wheelDates[newIndex]);
      setOffset(0);
      currentOffset.current = 0;
    }
  };

  const isTodaySelected = selectedDateStr === todayStr;
  const selectedDate = new Date(selectedDateStr + 'T12:00:00');
  const isPast = selectedDate < new Date(todayStr + 'T00:00:00');
  const isFuture = selectedDate > new Date(todayStr + 'T23:59:59.999');
  const selectedDayOfWeek = selectedDate.getDay();
  const selectedTodayAbbr = DAY_ABBRS[selectedDayOfWeek];

  const customWard = useMemo(() => {
    if (subjectMode !== 'custom') return undefined;
    for (const w of customWards) {
      if (selectedDateStr >= w.startDate && selectedDateStr <= w.endDate) return w;
    }
    return undefined;
  }, [subjectMode, customWards, selectedDateStr]);

  const presetWardObj = useMemo(() => {
    if (subjectMode === 'preloaded') return getCurrentPresetWard(selectedDate);
    return null;
  }, [subjectMode, getCurrentPresetWard, selectedDate]);

  const currentWard = subjectMode === 'custom'
    ? (customWard ? customWard.name : null)
    : (presetWardObj ? presetWardObj.ward : null);
  const isWardHoliday = currentWard === 'Holiday';

  const todayCustomSubjects = useMemo(() => {
    if (subjectMode !== 'custom') return [];
    return customSubjects.flatMap(s => {
      const isSGT = s.subjectType === 'allied' && s.parentName === 'Small Group Teaching';
      if (isSGT && ((s.startDate && selectedDateStr < s.startDate) || (s.endDate && selectedDateStr > s.endDate))) {
        return [];
      }
      if (s.schedules && s.schedules.length > 0) {
        const daySchedules = s.schedules.filter(sch => sch.day === selectedTodayAbbr);
        return daySchedules.map(sch => ({
          id: `${s.id}-${sch.day}-${sch.time}`,
          name: s.name,
          time: sch.time,
          isSGT: s.subjectType === 'allied' && s.parentName === 'Small Group Teaching',
          sgtId: s.id,
        }));
      }
      if (s.days) {
        const assigned = s.days.split(',').map(d => d.trim());
        if (assigned.includes(selectedTodayAbbr)) {
          return [{
            id: s.id,
            name: s.name,
            time: s.time || 'Time not set',
            isSGT: s.subjectType === 'allied' && s.parentName === 'Small Group Teaching',
            sgtId: s.id,
          }];
        }
      }
      return [];
    });
  }, [customSubjects, selectedTodayAbbr, subjectMode]);

  const schedule = subjectMode === 'preloaded' ? (presetTimetable[selectedDayOfWeek] || []) : [];
  const isFridayPreset = subjectMode === 'preloaded' && selectedDayOfWeek === 5;
  const hasAnything = !isFridayPreset && (schedule.length > 0 || todayCustomSubjects.length > 0 || (currentWard && !isWardHoliday));
  const fullDateDisplay = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const dayEntries = useMemo<DayEntry[]>(() => {
    const entries: DayEntry[] = [];
    if (subjectMode === 'preloaded') {
      schedule.forEach((slot, idx) => {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') {
          const effectiveTime =
            slot.type === 'ward_replacement'
              ? presetWardObj?.eveningTime || slot.time
              : presetWardObj?.morningTime || slot.time;
          if (isWardHoliday || !currentWard) {
            entries.push({ id: `holiday-${idx}`, time: effectiveTime, kind: 'holiday', holidayTime: effectiveTime });
          } else {
            entries.push({
              id: `ward-${idx}`,
              time: effectiveTime,
              kind: 'card',
              card: {
                title: 'Clinical Rotation',
                subtitle: currentWard,
                tag: slot.type === 'ward_replacement' ? 'Evening' : 'Morning',
                tagColor: 'primary',
                subject: currentWard,
                time: effectiveTime,
                isWard: true,
                sessionId: getPresetWardSessionId(idx),
              },
            });
          }
          return;
        }
        slot.subjects.forEach((subject, subIdx) => {
          entries.push({
            id: `${idx}-${subIdx}`,
            time: slot.time,
            kind: 'card',
            card: {
              subject,
              time: slot.time,
              sessionId: getPresetAcademicSessionId(idx, subIdx),
            },
          });
        });
      });

      // SGT subjects
      userAddedSubjects.forEach(u => {
        if (u.subjectType !== 'allied' || !u.parentName || !PRESET_PARENTS.includes(u.parentName)) return;
        if (u.startDate && u.endDate) {
          if (selectedDateStr < u.startDate || selectedDateStr > u.endDate) return;
        }
        const sch = (u.schedules || []).find(s => s.day === selectedTodayAbbr);
        if (!sch) return;
        const time = `${sch.start}–${sch.end}`;
        const sessionId = `${u.id}:${sch.day}:${sch.start}:${sch.end}`;
        entries.push({
          id: `sgt-${u.id}`,
          time,
          kind: 'card',
          card: {
            subject: u.name,
            time,
            tag: 'Small Group',
            tagColor: 'primary',
            isSGT: true,
            sgtId: u.id,
            sessionId,
          },
        });
      });
    } else {
      // CUSTOM MODE
      if (currentWard && !isWardHoliday) {
        entries.push({
          id: 'custom-ward-am',
          time: customWard?.morningTime || 'Morning Ward',
          kind: 'card',
          card: {
            title: 'Clinical Rotation',
            subtitle: currentWard,
            tag: 'Morning',
            tagColor: 'primary',
            subject: currentWard,
            time: customWard?.morningTime || 'Morning Ward',
            isWard: true,
            sessionId: 'custom-ward-am',
          },
        });
        entries.push({
          id: 'custom-ward-pm',
          time: customWard?.eveningTime || 'Evening Ward',
          kind: 'card',
          card: {
            title: 'Clinical Rotation',
            subtitle: currentWard,
            tag: 'Evening',
            tagColor: 'primary',
            subject: currentWard,
            time: customWard?.eveningTime || 'Evening Ward',
            isWard: true,
            sessionId: 'custom-ward-pm',
          },
        });
      }
      todayCustomSubjects.forEach(s => {
        const sessionId = getCustomSubjectSessionId(s.id, selectedTodayAbbr, s.time, Boolean(s.isSGT), s.sgtId);
        entries.push({
          id: s.id,
          time: s.time || 'Time not set',
          kind: 'card',
          card: {
            subject: s.name,
            time: s.time || 'Time not set',
            isSGT: s.isSGT,
            sgtId: s.sgtId,
            sessionId,
          },
        });
      });
    }
    entries.sort(
      (a, b) => (rangeStartMinutes(a.time) ?? 1440) - (rangeStartMinutes(b.time) ?? 1440)
    );
    return entries;
  }, [
    schedule,
    subjectMode,
    presetWardObj,
    currentWard,
    isWardHoliday,
    isPast,
    isTodaySelected,
    selectedDateStr,
    customWard,
    todayCustomSubjects,
    userAddedSubjects,
    selectedTodayAbbr,
  ]);

  const cardMode: 'today' | 'past' | 'future' = isTodaySelected ? 'today' : isPast ? 'past' : 'future';
  const isCompletedPlannedEntry = (entry: DayEntry): boolean => {
    if (entry.kind !== 'card' || !entry.card) return false;
    const c = entry.card;
    const id = c.isSGT && c.sgtId
      ? getSGTKey(c.sgtId)
      : (() => {
          const resolved = getSubjectIdByName(c.isWard ? (c.subtitle || c.subject) : c.subject, c.isWard ? 'clinical' : 'academic');
          return resolved ? (c.isWard ? getWardAttendanceKey(resolved) : getAcademicAttendanceKey(resolved)) : null;
        })();
    if (!id) return false;
    const record = c.isWard ? wards[id] : subjects[id];
    const conducted = (record?.attended || 0) + (record?.missed || 0);
    const planned = c.isWard
      ? subjectMode === 'custom'
        ? (() => { const ward = customWards.find(w => w.name.toLowerCase() === (c.subtitle || c.subject).toLowerCase()); return ward ? getCustomWardTotalPlanned(ward.startDate, ward.endDate, ward.vacationPeriods) : 0; })()
        : getPresetWardTotalPlanned(c.subtitle || c.subject)
      : c.isSGT && c.sgtId
        ? (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects).find(item => item.id === c.sgtId)?.plannedClasses || 0
        : getSubjectPlannedTotal(c.subject);
    return !!finishedMap[id] || (planned > 0 && conducted >= planned);
  };
  const visibleEntries = useMemo(() => {
    if (!isTodaySelected) return { pending: dayEntries, completed: [] as DayEntry[] };
    const pending: DayEntry[] = [];
    const completed: DayEntry[] = [];
    dayEntries.forEach(entry => (isCompletedPlannedEntry(entry) ? completed : pending).push(entry));
    return { pending, completed };
  }, [dayEntries, isTodaySelected, finishedMap, subjects, wards, subjectMode, customWards, customSubjects, userAddedSubjects]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([idbGet('att_dashboard_activity_v1'), idbGet('att_manage_history')]).then(async ([raw, historyRaw]) => {
      let stored: ActivityItem[] = [];
      try { stored = raw ? (JSON.parse(raw) as Array<any>).map(item => ({ ...item, kind: item.kind || 'neutral' as ActivityKind })) : []; } catch { stored = []; }
      const fallbackTimestamp = (text: string) => stored.find(item => item.text === text)?.timestamp || Date.now();
      const derived: ActivityItem[] = Object.entries(homeSelections)
        .filter(([key]) => key.startsWith(todayStr))
        .map(([key, value]) => {
          const matched = dayEntries.find(entry => entry.card?.sessionId && key.includes(entry.card.sessionId));
          const subject = matched?.card?.subject ? shortenSubject(matched.card.subject) : 'Unknown subject';
          const kindLabel = matched?.card?.isWard ? 'Clinical Rotation' : matched?.card?.tag === 'Small Group' ? 'Small Group Teaching' : 'Lecture';
          const text = `Marked ${subject} (${kindLabel}) as ${value === 'off' ? 'Off' : value === 'missed' ? 'Bunked' : 'Attended'}`;
          return { id: `attendance-fallback-${key}`, text, timestamp: fallbackTimestamp(text), kind: (value === 'missed' ? 'missed' : 'attendance') as ActivityKind };
        });
      let history: ActivityItem[] = [];
      try {
        const entries = historyRaw ? JSON.parse(historyRaw) as Array<any> : [];
        history = entries.map(entry => {
          const type = String(entry.type || 'Updated routine');
          const data = entry.data || {};
          const rawTarget = data.name || data.subject || data.ward || data.names?.join(', ') || data.clinicalSubject || 'routine';
          const target = /ua_|^academic:|^ward:|^sgt:/.test(String(rawTarget)) ? 'Unknown subject' : shortenSubject(String(rawTarget));
          const kind: ActivityKind = /vacation|exam/i.test(type) ? 'vacation' : /percentage|planned/i.test(type) ? 'percentage' : /slot/i.test(type) ? 'slot' : /edit|move|add|delete/i.test(type) ? 'edit' : 'neutral';
          return { id: `history-${entry.id}`, text: `${type}: ${target}`, timestamp: Date.parse(entry.timestamp) || Date.now(), kind };
        });
      } catch { history = []; }
      const merged = await mergeDashboardActivities([...history, ...derived]);
      if (!cancelled) setDashboardActivities(merged as ActivityItem[]);
    });
    return () => { cancelled = true; };
  }, [homeSelections, todayStr, dayEntries]);
  const overallAttended = Object.values(subjects).concat(Object.values(wards)).reduce((sum, item) => sum + item.attended, 0);
  const overallMissed = Object.values(subjects).concat(Object.values(wards)).reduce((sum, item) => sum + item.missed, 0);
  const overallTotal = overallAttended + overallMissed;
  const overallPercentage = overallTotal === 0 ? 0 : Math.round((overallAttended / overallTotal) * 100);
  const dashboardClassEntries = dayEntries.filter(entry => entry.kind === 'card');
  const tomorrowDate = addDays(today, 1);
  const tomorrowDateStr = toDateString(tomorrowDate);
  const tomorrowDay = tomorrowDate.getDay();
  const tomorrowEntries = useMemo(() => {
    const entries: Array<{ subject?: string; time: string; holiday?: string }> = [];
    if (subjectMode === 'preloaded') {
      if (tomorrowDay === 5) return [{ time: '', holiday: 'Detox Day' }];
      (presetTimetable[tomorrowDay] || []).forEach((slot: any) => {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') {
          const ward = getCurrentPresetWard(tomorrowDate);
          if (ward?.ward && ward.ward !== 'Holiday') entries.push({ subject: ward.ward, time: ward.morningTime || slot.time });
          else entries.push({ time: slot.time || '', holiday: 'Detox Day' });
        } else (slot.subjects || []).forEach((subject: string) => entries.push({ subject, time: slot.time || '' }));
      });
      userAddedSubjects.forEach(subject => {
        if (subject.subjectType !== 'allied' || subject.parentName !== 'Small Group Teaching') return;
        const scheduleForDay = (subject.schedules || []).find((scheduleItem: any) => scheduleItem.day === DAY_ABBRS[tomorrowDay]);
        if (scheduleForDay) entries.push({ subject: subject.name, time: `${scheduleForDay.start}–${scheduleForDay.end}` });
      });
    } else {
      customWards.forEach(ward => {
        if (tomorrowDateStr >= ward.startDate && tomorrowDateStr <= ward.endDate && ward.name !== 'Holiday') entries.push({ subject: ward.name, time: ward.morningTime || 'Morning Ward' });
      });
      customSubjects.forEach(subject => {
        const schedules = (subject.schedules || []).filter((scheduleItem: any) => scheduleItem.day === DAY_ABBRS[tomorrowDay]);
        schedules.forEach((scheduleItem: any) => entries.push({ subject: subject.name, time: scheduleItem.time || `${scheduleItem.start}–${scheduleItem.end}` }));
      });
    }
    return entries.sort((a, b) => (rangeStartMinutes(a.time) ?? 1440) - (rangeStartMinutes(b.time) ?? 1440));
  }, [customSubjects, customWards, getCurrentPresetWard, presetTimetable, subjectMode, tomorrowDate, tomorrowDateStr, tomorrowDay, userAddedSubjects]);
  const tomorrowPreview = tomorrowEntries[0]?.holiday ? tomorrowEntries[0].holiday : tomorrowEntries[0]?.subject ? `First: ${shortenSubject(tomorrowEntries[0].subject)}` : 'No classes scheduled for tomorrow.';
  const isEntryVacation = (entry: DayEntry) => {
    const card = entry.card;
    if (!card) return false;
    if (card.isWard) {
      if (subjectMode === 'custom') return Boolean(customWards.find(item => item.name.toLowerCase() === card.subject.toLowerCase())?.vacationPeriods?.some(period => selectedDateStr >= period.start && selectedDateStr <= period.end));
      return presetWardSchedule.some(entry => entry.vacationPeriods?.some(period => selectedDateStr >= period.start && selectedDateStr <= period.end) ?? false);
    }
    if (card.isSGT && card.sgtId) {
      const source = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
      return Boolean(source.find(item => item.id === card.sgtId)?.vacationPeriods?.some(period => selectedDateStr >= period.start && selectedDateStr <= period.end));
    }
    return false;
  };
  const glanceEntries = dashboardClassEntries.filter(entry => !isCompletedPlannedEntry(entry) && !isEntryVacation(entry));
  const makePqrstPath = (points: number[]) => {
    const width = 268 / Math.max(1, points.length);
    return points.map((value, index) => {
      const x = 24 + index * width;
      const baseline = 76 - (value * 0.22);
      const next = points[index + 1] ?? value;
      const nextBaseline = 76 - (next * 0.22);
      return `M ${x.toFixed(1)} ${baseline.toFixed(1)} L ${(x + width * 0.22).toFixed(1)} ${baseline.toFixed(1)} L ${(x + width * 0.32).toFixed(1)} ${(baseline - 5).toFixed(1)} L ${(x + width * 0.42).toFixed(1)} ${(baseline + 4).toFixed(1)} L ${(x + width * 0.52).toFixed(1)} ${(baseline - 29).toFixed(1)} L ${(x + width * 0.62).toFixed(1)} ${(baseline + 14).toFixed(1)} L ${(x + width * 0.72).toFixed(1)} ${baseline.toFixed(1)} L ${(x + width * 0.79).toFixed(1)} ${(baseline - 7).toFixed(1)} Q ${(x + width * 0.85).toFixed(1)} ${(baseline - 11).toFixed(1)} ${(x + width * 0.91).toFixed(1)} ${(baseline - 7).toFixed(1)} L ${(x + width).toFixed(1)} ${nextBaseline.toFixed(1)}`;
    }).join(' ');
  };
  const groupedEcgPaths = useMemo(() => {
    const groups = [{ label: 'Medicine & Allied', color: '#38bdf8', values: [] as number[] }, { label: 'Surgery & Allied', color: '#a78bfa', values: [] as number[] }, { label: 'Ward', color: '#34d399', values: [] as number[] }, { label: 'SGT', color: '#f59e0b', values: [] as number[] }];
    Object.entries(subjects).concat(Object.entries(wards)).forEach(([key, item]) => {
      const conducted = item.attended + item.missed;
      if (!conducted) return;
      const raw = key.replace(/^(academic:|ward:|sgt:)/, '');
      const userAdded = userAddedSubjects.find(subject => subject.id === raw);
      const presetCategory = CATEGORIES.find(category => category.subjects.some(subject => subject.id === raw || subject.name === raw))?.name || '';
      const group = key.startsWith('ward:') ? groups[2] : key.startsWith('sgt:') || userAdded?.parentName === 'Small Group Teaching' ? groups[3] : /surg/i.test(`${presetCategory} ${userAdded?.parentName || ''}`) ? groups[1] : groups[0];
      group.values.push((item.attended / conducted) * 100);
    });
    return groups.filter(group => group.values.length > 0).map(group => ({ ...group, path: makePqrstPath(Array.from({ length: 10 }, (_, index) => group.values[index % group.values.length])) }));
  }, [overallPercentage, subjects]);
  const restoredSubjectFallback = (raw: string) => {
    const suffix = raw.replace(/^(ua_|academic:|subject:)/, '').replace(/[_-]+/g, ' ').trim();
    return suffix ? `Restored Subject ${suffix}` : 'Restored Subject';
  };
  const resolveSubjectAlert = (storageKey: string) => {
    const raw = storageKey.replace(/^(academic:|ward:|sgt:)/, '');
    if (storageKey.startsWith('sgt:')) {
      const source = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
      return { name: source.find(item => item.id === storageKey.slice(4))?.name || 'Small Group Teaching', category: 'SGT' };
    }
    if (storageKey.startsWith('ward:')) return { name: getPresetWardDisplayName(storageKey.slice(5)), category: 'Ward' };
    const userAdded = userAddedSubjects.find(item => item.id === raw);
    const preset = [...CATEGORIES.flatMap(category => category.subjects), ...INTEGRATED_SUBJECTS, ...WARD_SUBJECTS].find(item => item.id === raw || item.name === raw);
    const readable = userAdded?.name || preset?.name;
    return { name: readable ? getPresetSubjectDisplayName(readable) : restoredSubjectFallback(raw), category: userAdded?.parentName === 'Small Group Teaching' ? 'SGT' : 'Lecture' };
  };
  const subjectPotentialMetrics = useMemo(() => Object.entries(subjects).map(([storageKey, item]) => {
    const resolved = resolveSubjectAlert(storageKey);
    const planned = Math.max(item.attended + item.missed, getSubjectPlannedTotal(resolved.name));
    const conducted = item.attended + item.missed;
    const remaining = Math.max(0, planned - conducted);
    const current = conducted === 0 ? 0 : (item.attended / conducted) * 100;
    const maximum = planned > 0 ? ((item.attended + remaining) / planned) * 100 : current;
    return { ...resolved, attended: item.attended, missed: item.missed, current, maximum, remaining, planned };
  }).filter(item => item.remaining > 0 && item.current < preferredPercentage).sort((a, b) => a.current - b.current).slice(0, 6), [customSubjects, getPresetSubjectDisplayName, getPresetWardDisplayName, getSubjectPlannedTotal, preferredPercentage, subjectMode, subjects, userAddedSubjects]);
  const statusForEntry = (entry: DayEntry) => {
    const sessionId = entry.card?.sessionId;
    if (!sessionId) return undefined;
    return Object.entries(homeSelections).find(([key]) => key.startsWith(todayStr) && key.includes(sessionId))?.[1];
  };
  const timeOfDay = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 18 ? 'Good Afternoon' : 'Good Evening';
  const shortDate = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

  const dateWheel = (
    <div className="pt-1 pb-1">
      <div
        ref={wheelContainerRef}
        className="date-wheel-surface relative z-[3] bg-background border border-border rounded-3xl shadow-md select-none overflow-hidden"
        style={{ height: '4rem' }}
      >
        <div
          className="relative w-full h-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'pan-y' }}
        >
          <div
            className="absolute top-0 bottom-0 flex items-center"
            style={{
              transform: `translateX(${wheelTranslateX}px)`,
              transition: isDragging.current ? 'none' : 'transform 0.2s ease-out',
              willChange: 'transform',
            }}
          >
            {wheelDates.map((dateStr, idx) => {
              const date = new Date(dateStr + 'T12:00:00');
              const day = date.getDate();
              const month = date.toLocaleDateString('en-US', { month: 'short' });
              const isCenter = idx === effectiveIndex;
              const distance = idx - effectiveIndex;
              const scale = 1 - Math.abs(distance) * 0.12;
              const opacity = 1 - Math.abs(distance) * 0.35;
              const rotateY = distance * 12;
              return (
                <div
                  key={dateStr}
                  className="flex-shrink-0 flex flex-col items-center justify-center cursor-pointer rounded-xl"
                  style={{
                    width: ITEM_WIDTH,
                    height: '4rem',
                    transform: `perspective(500px) rotateY(${rotateY}deg) scale(${scale})`,
                    opacity: Math.max(0.35, opacity),
                    transition: isDragging.current ? 'none' : 'all 0.2s ease-out',
                    zIndex: isCenter ? 10 : 0,
                    backgroundColor: isCenter ? 'var(--color-primary, #3b82f6)' : 'transparent',
                  }}
                  onClick={() => setSelectedDateStr(dateStr)}
                >
                  <span className={cn('text-sm font-bold', isCenter ? 'text-primary-foreground' : 'text-foreground', !isCenter && 'font-semibold')}>
                    {day} {month}
                  </span>
                  <span className={cn('text-[10px]', isCenter ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {DAY_ABBRS[date.getDay()]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
  const dashboard = (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex items-end justify-between gap-3 pb-3">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">{timeOfDay},</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{username}</h1>
        </div>
        <p className="text-xs font-bold text-muted-foreground">{shortDate}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 pb-4 scroll-fade-viewport scroll-reachability">
      <div className="grid grid-cols-[1.2fr_1fr] gap-3">
          <button type="button" onClick={() => setLocation('/subjects')} className="glass-card rounded-2xl border border-border p-4 text-left transition-transform active:scale-[0.98]">
          <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Overall Attendance</span></div>
          {overallTotal === 0 ? <p className="mt-3 py-8 text-center text-xs text-muted-foreground">No attendance data yet.</p> : <svg viewBox="0 0 300 112" className="mt-1 h-24 w-full" role="img" aria-label="Grouped PQRST attendance ECG chart"><path d="M24 8V92H292" fill="none" stroke="currentColor" strokeOpacity=".35" /><path d="M24 71H292M24 50H292M24 29H292" fill="none" stroke="currentColor" strokeOpacity=".1" strokeDasharray="2 3" /><text x="2" y="12" fontSize="7" fill="currentColor">100%</text><text x="7" y="53" fontSize="7" fill="currentColor">50%</text><text x="13" y="94" fontSize="7" fill="currentColor">0%</text>{groupedEcgPaths.map(group => <path key={group.label} d={group.path} fill="none" stroke={group.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />)}</svg>}
          {overallTotal > 0 && <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[8px] font-bold text-muted-foreground">{groupedEcgPaths.map(group => <span key={group.label} className="inline-flex min-w-0 items-center gap-1"><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />{group.label}</span>)}</div>}
        </button>
        <div className="grid min-h-0 grid-rows-2 gap-3">
          <button type="button" onClick={() => setShowMarkAttendance(true)} className="min-h-11 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-left transition-transform active:scale-[0.98]"><ClipboardCheck className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-extrabold text-foreground">Mark Attendance</p><p className="mt-1 text-[11px] text-muted-foreground">{dashboardClassEntries.filter(entry => !isCompletedPlannedEntry(entry)).length > 0 ? `${dashboardClassEntries.filter(entry => !isCompletedPlannedEntry(entry)).length} Classes today` : 'No classes scheduled today.'}</p></button>
          <button type="button" onClick={() => { setSelectedDateStr(toDateString(addDays(today, 1))); setShowMarkAttendance(true); }} className="min-h-11 rounded-2xl border border-border bg-card p-3 text-left transition-transform active:scale-[0.98]"><MoonStar className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xs font-extrabold text-foreground">Tomorrow Class</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{tomorrowPreview}</p></button>
        </div>
      </div>
      <section className="glass-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Today’s Activity</h2></div>
        {dashboardActivities.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">No activity yet today.</p> : <div className="relative mt-3 space-y-2 before:absolute before:bottom-2 before:left-[4.25rem] before:top-2 before:w-px before:bg-border">{(activityExpanded ? dashboardActivities : dashboardActivities.slice(0, 4)).map(item => { const Icon = item.kind === 'attendance' ? ClipboardCheck : item.kind === 'missed' ? Minus : item.kind === 'slot' ? Plus : item.kind === 'vacation' ? CalendarDays : item.kind === 'percentage' ? Percent : item.kind === 'edit' ? Pencil : Tag; const color = item.kind === 'attendance' ? 'bg-emerald-500 text-white' : item.kind === 'missed' ? 'bg-rose-500 text-white' : item.kind === 'vacation' ? 'bg-amber-500 text-white' : item.kind === 'edit' || item.kind === 'slot' || item.kind === 'percentage' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'; return <div key={item.id} className="relative grid grid-cols-[3rem_1.5rem_minmax(0,1fr)] items-center gap-2 text-xs"><time className="text-right text-[9px] font-bold text-muted-foreground">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span className={cn('relative z-10 flex h-6 w-6 items-center justify-center rounded-full', color)}><Icon className="h-3 w-3" /></span><span className="min-w-0 font-semibold text-foreground">{item.text}</span></div>; })}</div>}
        <button type="button" onClick={() => setActivityExpanded(value => !value)} className="mt-4 w-full text-left text-xs font-bold text-primary">{activityExpanded ? 'Collapse activity ↑' : 'View all activity →'}</button>
      </section>
      <section className="glass-card rounded-2xl border border-border p-4"><h2 className="text-sm font-extrabold">Today at a Glance</h2><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{glanceEntries.length === 0 ? <p className="text-xs text-muted-foreground">No remaining classes today.</p> : glanceEntries.map(entry => { const status = statusForEntry(entry); const label = status === 'attended' ? 'Attended' : status === 'missed' ? 'Bunked' : status === 'off' ? 'Off' : 'Not Marked Yet'; const color = status === 'attended' ? 'text-emerald-500' : status === 'missed' ? 'text-rose-500' : status === 'off' ? 'text-amber-500' : 'text-muted-foreground'; return <button type="button" key={entry.id} onClick={() => setShowMarkAttendance(true)} className="min-w-[132px] rounded-xl border border-border bg-muted/30 p-3 text-left shadow-[0_2px_8px_rgba(0,0,0,0.22)]"><p className="truncate text-xs font-bold">{entry.card?.subject}</p><p className="mt-1 text-[10px] text-muted-foreground">{entry.time}</p><span className={cn('mt-2 block text-[10px] font-extrabold', color)}>{label}</span></button>; })}</div></section>
      <section className="glass-card rounded-2xl border border-border p-4"><h2 className="text-sm font-extrabold">Subject Alerts</h2><div className="mt-3 space-y-2">{subjectPotentialMetrics.length === 0 ? <p className="text-xs text-muted-foreground">No subjects need attention right now.</p> : subjectPotentialMetrics.slice(0, 3).map(metric => <button type="button" key={`${metric.category}-${metric.name}`} onClick={() => setLocation('/subjects')} className="flex w-full items-center gap-2 text-left"><span className={cn('h-2 w-2 rounded-full', metric.current < preferredPercentage ? 'bg-rose-500' : 'bg-emerald-500')} /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{metric.name} <span className="text-[9px] font-bold text-muted-foreground">({metric.category})</span></span><span className="text-xs font-bold text-muted-foreground">{Math.round(metric.current)}% ({metric.attended}/{metric.attended + metric.missed})</span></button>)}</div></section>
      <section className="glass-card rounded-2xl border border-border p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Maximum Percentage Possible</h2><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-extrabold text-emerald-500">If attended</span></div><div className="mt-3 space-y-3">{subjectPotentialMetrics.length === 0 ? <p className="text-[10px] text-muted-foreground">Not enough data yet.</p> : subjectPotentialMetrics.map(metric => { const currentWidth = Math.min(100, Math.max(0, metric.current)); const maxWidth = Math.min(100, Math.max(currentWidth, metric.maximum)); const maxColor = metric.maximum >= preferredPercentage ? '#34d399' : '#f87171'; return <button type="button" key={`${metric.category}-${metric.name}`} onClick={() => setLocation('/subjects')} className="block w-full text-left"><div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold"><span className="truncate">{metric.name} <span className="text-[9px] text-muted-foreground">({metric.category})</span></span><span className="shrink-0" style={{ color: maxColor }}>Max: {Math.round(metric.maximum)}%</span></div><svg viewBox="0 0 100 8" className="h-2.5 w-full" preserveAspectRatio="none" aria-label={`${metric.name} current and maximum percentage`}><rect x="0" y="0" width={maxWidth} height="8" rx="4" fill={maxColor} fillOpacity=".5" /><rect x="0" y="0" width={currentWidth} height="8" rx="4" fill="#94a3b8" /></svg></button>; })}<p className="text-[10px] text-muted-foreground">Grey shows current attendance; the second segment shows maximum possible attendance.</p></div></section>
      </div>
    </motion.div>
  );
  return (
    <Layout
      mainClassName="flex-1 min-h-0 overflow-hidden"
      headerTitle={showMarkAttendance ? 'Attendance' : 'Dashboard'}
      headerDescription={showMarkAttendance ? 'Mark and review classes for the selected date' : 'Your attendance overview and daily class pulse'}
      headerRight={showUpdatePill ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setUpdateInfoOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[10px] font-extrabold uppercase tracking-wide hover:bg-amber-500/25 transition-all cursor-pointer"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            <span>Update Available · v{serverVersion}</span>
          </button>
          <button
            type="button"
            onClick={() => { setUpdateNoticeDismissed(true); sessionStorage.setItem('att_update_notice_dismissed', 'true'); }}
            className="w-5 h-5 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : undefined}
    >
      {showMarkAttendance ? <motion.div key="attendance-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="min-h-0 flex flex-col">
        <div className="home-date-wheel-float" aria-label="Choose date">
          {dateWheel}
        </div>
        <button type="button" onClick={() => setShowMarkAttendance(false)} className="mb-2 self-start text-xs font-bold text-primary">← Dashboard</button>
        <div className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-0 scroll-fade-viewport scroll-reachability">
        {/* ── Content ── */}
        {!hasAnything ? (
          <div className="mt-2 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="flex flex-col items-center">
              <ClipboardCheck className="mb-3 h-10 w-10 text-primary" />
              <h3 className="mb-2 text-lg font-semibold text-foreground">
                {isFridayPreset ? 'Detox Day' : subjectMode === 'custom' && customSubjects.length === 0 ? 'No Subjects Yet' : 'No Classes Scheduled'}
              </h3>
                {subjectMode === 'custom' && customSubjects.length === 0 ? (
                  <p className="mb-0 max-w-xs px-4 text-sm leading-relaxed text-muted-foreground">
                    No subjects added yet.{' '}
                    <button
                      onClick={() => setLocation('/add-new')}
                      className="text-primary font-semibold underline-offset-2 hover:underline"
                    >
                      Add subjects
                    </button>{' '}
                    from the Manage Tab to get started.
                  </p>
                ) : (
                  <p className="mb-0 max-w-xs px-4 text-sm leading-relaxed text-muted-foreground">
                    {isTodaySelected
                      ? 'Enjoy your rest day! No lectures or clinical ward postings are scheduled for today.'
                      : isFuture
                        ? `No lectures or clinical ward postings are scheduled for ${fullDateDisplay}.`
                        : `No lectures or clinical ward postings were scheduled for ${fullDateDisplay}.`}
                  </p>
                )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {visibleEntries.pending.map(entry => {
              if (entry.kind === 'holiday') {
                return (
                  <div key={entry.id} className="bg-card rounded-2xl p-5 border border-border">
                    <h3 className="text-lg font-semibold text-foreground">
                      Clinical Rotation: {isWardHoliday ? 'Holiday' : 'Not scheduled'}
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1">{entry.holidayTime}</p>
                  </div>
                );
              }
              const c = entry.card!;
              return (
                <HomeCard
                  key={entry.id}
                  subject={c.subject}
                  time={c.time}
                  isWard={c.isWard}
                  title={c.title}
                  subtitle={c.subtitle}
                  tag={c.tag}
                  tagColor={c.tagColor}
                  sessionId={c.sessionId}
                  dateStr={selectedDateStr}
                  mode={cardMode}
                  isSGT={c.isSGT}
                  sgtId={c.sgtId}
                />
              );
            })}
            {visibleEntries.completed.length > 0 && (
              <section className="space-y-3 pt-2">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Completed Planned Class</h2>
                <div className="space-y-4 opacity-75">
                  {visibleEntries.completed.map(entry => {
                    if (entry.kind === 'holiday') return null;
                    const c = entry.card!;
                    return <HomeCard key={entry.id} subject={c.subject} time={c.time} isWard={c.isWard} title={c.title} subtitle={c.subtitle} tag={c.tag} tagColor={c.tagColor} sessionId={c.sessionId} dateStr={selectedDateStr} mode={cardMode} isSGT={c.isSGT} sgtId={c.sgtId} />;
                  })}
                </div>
              </section>
            )}
          </div>
        )}
        </div>

        {/* ── Back to Today ── */}
        <AnimatePresence>
          {!isTodaySelected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-[calc(var(--app-bottom-nav-height)+env(safe-area-inset-bottom)+0.5rem)] left-1/2 -translate-x-1/2 z-50"
            >
              <button
                onClick={() => setSelectedDateStr(todayStr)}
                className="px-3.5 py-1.5 bg-primary/20 backdrop-blur-md border border-primary/30 text-primary rounded-full font-bold text-[10px] shadow-lg hover:bg-primary/30 transition-all"
              >
                Back to Today
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div> : dashboard}

        {/* ── Update notice modal ── */}
        <ModalSheet open={updateInfoOpen} onClose={() => setUpdateInfoOpen(false)} ariaLabel="Update information" maxWidth="max-w-sm" header={<div className="text-center"><h3 className="text-sm font-extrabold text-foreground">New Version Available <span className="text-emerald-400">(v{serverVersion})</span></h3><p className="mt-1 text-[10px] text-muted-foreground">{serverSummary || 'Bug fixes and refinements are ready to install.'}</p></div>} bodyClassName="p-5 space-y-3">
                {!online && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
                    <p className="text-[10px] font-bold text-amber-500">You're offline — connect to the internet once to install the update.</p>
                  </div>
                )}
                <div className="bg-muted/30 border border-border/50 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1">How to Update</p>
                  <p className="text-[10px] text-muted-foreground">1. Go to the <strong className="text-foreground">Settings Tab</strong></p>
                  <p className="text-[10px] text-muted-foreground">2. Scroll to <strong className="text-foreground">App Info</strong></p>
                  <p className="text-[10px] text-muted-foreground">3. Click <strong className="text-foreground">Update App</strong></p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setUpdateInfoOpen(false)} className="action-button action-button--neutral flex-1">Remind Later</button>
                  <button type="button" onClick={() => { setUpdateInfoOpen(false); setLocation('/account'); }} className="action-button action-button--update flex-1">Go to Account</button>
                </div>
        </ModalSheet>
    </Layout>
  );
}
