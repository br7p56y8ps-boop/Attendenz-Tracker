import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HomeCard } from '@/components/HomeCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/Layout';
import { isSGTSubjectRecord, useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey, getCanonicalAttendanceKey } from '@/contexts/AttendanceContext';
import { useLocation } from 'wouter';
import { cn, rangeStartMinutes, getPresetAcademicSessionId, getPresetWardSessionId, getCustomSubjectSessionId } from '@/lib/utils';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { CATEGORIES, INTEGRATED_SUBJECTS, PRESET_PARENTS, WARD_SUBJECTS } from '@/lib/constants';
import { ArrowUpCircle, X, MoonStar, ClipboardCheck, Pencil, Plus, Minus, CalendarDays, Percent, Tag } from 'lucide-react';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { useAuth } from '@/contexts/AuthContext';
import { idbGet } from '@/lib/idb';
import { DASHBOARD_ACTIVITY_UPDATED_EVENT, mergeDashboardActivities, type DashboardActivityItem } from '@/lib/activity';
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
  isIntegrated?: boolean;
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

function getDashboardSubjectKind(
  subject: string,
  card: { isWard?: boolean; isSGT?: boolean; isIntegrated?: boolean } | undefined,
  subjectMode: 'preloaded' | 'custom',
  userAddedSubjects: Array<{ name: string; subjectType: string; parentName?: string; category?: string }>,
  customSubjects: Array<{ name: string; subjectType: string; parentName?: string; category?: string }>,
  subjectRegistry: Array<{ name: string; id: string; kind: string; domain?: string }>,
): string {
  if (card?.isSGT) return 'SGT';
  if (card?.isWard) return 'Ward';
  if (card?.isIntegrated) return 'Integrated';
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const source = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
  const stored = source.find(item => normalize(item.name) === normalize(subject));
  if (stored && isSGTSubjectRecord(stored)) return 'SGT';
  const registry = subjectRegistry.find(item => normalize(item.name) === normalize(subject) || normalize(item.id) === normalize(subject));
  if (registry?.kind === 'integrated') return 'Integrated';
  if (registry?.kind === 'sgt') return 'SGT';
  if (registry?.kind === 'preset-ward' || registry?.kind === 'ward-rotation') return 'Ward';
  return 'Lecture';
}

function wrapDashboardSvgLabel(value: string, maxChars = 22): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach(word => {
    if (current && `${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function renderActivityText(text: string): React.ReactNode {
  return text.split(/(Attended|Bunked|Missed|Off|Holiday)/g).map((part, index) => {
    const color = part === 'Attended' ? 'text-emerald-500' : part === 'Bunked' || part === 'Missed' ? 'text-rose-500' : part === 'Off' || part === 'Holiday' ? 'text-amber-500' : null;
    return color ? <span key={`${part}-${index}`} className={color}>{part}</span> : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

export default function Home() {
  const today = new Date();
  const todayStr = toDateString(today);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const { customSubjects, customWards, userAddedSubjects, subjectMode, presetTimetable, presetWardSchedule, subjectRegistry, getCurrentPresetWard, getSubjectIdByName, getSubjectPlannedTotal, getPresetSubjectDisplayName, getPresetWardDisplayName, getPresetWardTotalPlanned, getCustomWardTotalPlanned } = useCustomData();
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
  const isKnownAcademicEntry = (name: string) => {
    const normalized = name.trim().toLowerCase();
    return [...CATEGORIES.flatMap(category => category.subjects), ...INTEGRATED_SUBJECTS].some(subject => subject.name.trim().toLowerCase() === normalized)
      || userAddedSubjects.some(subject => subject.name.trim().toLowerCase() === normalized)
      || customSubjects.some(subject => subject.name.trim().toLowerCase() === normalized)
      || subjectRegistry.some(subject => subject.name.trim().toLowerCase() === normalized)
      || Boolean(getSubjectIdByName(name, 'academic'));
  };
  const isKnownWardEntry = (name: string) => Boolean(getSubjectIdByName(name, 'clinical')) || customWards.some(ward => ward.name.trim().toLowerCase() === name.trim().toLowerCase());

  const buildDayEntries = (targetDateStr: string, targetDate: Date, targetDayOfWeek: number, targetDayAbbr: string): DayEntry[] => {
    const targetCustomWard = subjectMode === 'custom'
      ? customWards.find(w => targetDateStr >= w.startDate && targetDateStr <= w.endDate)
      : undefined;
    const targetPresetWardObj = subjectMode === 'preloaded' ? getCurrentPresetWard(targetDate) : null;
    const targetCurrentWard = subjectMode === 'custom'
      ? (targetCustomWard ? targetCustomWard.name : null)
      : (targetPresetWardObj ? targetPresetWardObj.ward : null);
    const targetIsWardHoliday = targetCurrentWard === 'Holiday';
    const targetCustomSubjects = subjectMode === 'custom'
      ? customSubjects.flatMap(subject => {
          const isSGT = subject.subjectType === 'allied' && subject.parentName === 'Small Group Teaching';
          if (isSGT && ((subject.startDate && targetDateStr < subject.startDate) || (subject.endDate && targetDateStr > subject.endDate))) return [];
          if (subject.schedules?.length) return subject.schedules.filter(item => item.day === targetDayAbbr).map(item => ({ id: `${subject.id}-${item.day}-${item.time}`, name: subject.name, time: item.time, isSGT, sgtId: subject.id }));
          if (subject.days?.split(',').map(day => day.trim()).includes(targetDayAbbr)) return [{ id: subject.id, name: subject.name, time: subject.time || 'Time not set', isSGT, sgtId: subject.id }];
          return [];
        })
      : [];
    const targetSchedule = subjectMode === 'preloaded' ? (presetTimetable[targetDayOfWeek] || []) : [];
    const entries: DayEntry[] = [];
    if (subjectMode === 'preloaded') {
      targetSchedule.forEach((slot, idx) => {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') {
          const effectiveTime = slot.type === 'ward_replacement' ? targetPresetWardObj?.eveningTime || slot.time : targetPresetWardObj?.morningTime || slot.time;
          if (targetIsWardHoliday || !targetCurrentWard || !isKnownWardEntry(targetCurrentWard)) entries.push({ id: `holiday-${idx}`, time: effectiveTime, kind: 'holiday', holidayTime: effectiveTime });
          else entries.push({ id: `ward-${idx}`, time: effectiveTime, kind: 'card', card: { title: 'Clinical Rotation', subtitle: targetCurrentWard, tag: slot.type === 'ward_replacement' ? 'Evening' : 'Morning', tagColor: 'primary', subject: targetCurrentWard, time: effectiveTime, isWard: true, sessionId: getPresetWardSessionId(idx) } });
          return;
        }
        slot.subjects.filter(isKnownAcademicEntry).forEach((subject, subIdx) => entries.push({ id: `${idx}-${subIdx}`, time: slot.time, kind: 'card', card: { subject, time: slot.time, isIntegrated: slot.type === 'integrated', sessionId: getPresetAcademicSessionId(idx, subIdx) } }));
      });
      userAddedSubjects.forEach(u => {
        if (u.subjectType !== 'allied' || !u.parentName || !PRESET_PARENTS.includes(u.parentName)) return;
        if (u.startDate && u.endDate && (targetDateStr < u.startDate || targetDateStr > u.endDate)) return;
        const sch = (u.schedules || []).find(item => item.day === targetDayAbbr);
        if (!sch) return;
        const time = `${sch.start}–${sch.end}`;
        entries.push({ id: `sgt-${u.id}`, time, kind: 'card', card: { subject: u.name, time, tag: 'Small Group', tagColor: 'primary', isSGT: true, sgtId: u.id, sessionId: `${u.id}:${sch.day}:${sch.start}:${sch.end}` } });
      });
    } else {
      if (targetCurrentWard && !targetIsWardHoliday) {
        entries.push({ id: 'custom-ward-am', time: targetCustomWard?.morningTime || 'Morning Ward', kind: 'card', card: { title: 'Clinical Rotation', subtitle: targetCurrentWard, tag: 'Morning', tagColor: 'primary', subject: targetCurrentWard, time: targetCustomWard?.morningTime || 'Morning Ward', isWard: true, sessionId: 'custom-ward-am' } });
        entries.push({ id: 'custom-ward-pm', time: targetCustomWard?.eveningTime || 'Evening Ward', kind: 'card', card: { title: 'Clinical Rotation', subtitle: targetCurrentWard, tag: 'Evening', tagColor: 'primary', subject: targetCurrentWard, time: targetCustomWard?.eveningTime || 'Evening Ward', isWard: true, sessionId: 'custom-ward-pm' } });
      }
      targetCustomSubjects.forEach(item => {
        const sessionId = getCustomSubjectSessionId(item.id, targetDayAbbr, item.time, Boolean(item.isSGT), item.sgtId);
        entries.push({ id: item.id, time: item.time || 'Time not set', kind: 'card', card: { subject: item.name, time: item.time || 'Time not set', isSGT: item.isSGT, sgtId: item.sgtId, sessionId } });
      });
    }
    return entries.sort((a, b) => (rangeStartMinutes(a.time) ?? 1440) - (rangeStartMinutes(b.time) ?? 1440));
  };

  const dayEntries = buildDayEntries(selectedDateStr, selectedDate, selectedDayOfWeek, selectedTodayAbbr);
  const todayDayEntries = buildDayEntries(todayStr, today, today.getDay(), DAY_ABBRS[today.getDay()]);

  const cardMode: 'today' | 'past' | 'future' = isTodaySelected ? 'today' : isPast ? 'past' : 'future';
  const isCompletedPlannedEntry = (entry: DayEntry, dateStr = selectedDateStr): boolean => {
    if (entry.kind !== 'card' || !entry.card) return false;
    const c = entry.card;
    const vacationPeriods = c.isWard
      ? subjectMode === 'custom'
        ? customWards.find(w => w.name.toLowerCase() === (c.subtitle || c.subject).toLowerCase())?.vacationPeriods || []
        : presetWardSchedule.filter(w => w.ward.toLowerCase() === (c.subtitle || c.subject).toLowerCase()).flatMap(w => w.vacationPeriods || [])
      : c.isSGT && c.sgtId
        ? (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects).find(item => item.id === c.sgtId)?.vacationPeriods || []
        : [];
    if (vacationPeriods.some(period => dateStr >= period.start && dateStr <= period.end)) return false;
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
    const loadActivities = async () => {
      const [raw, historyRaw] = await Promise.all([idbGet('att_dashboard_activity_v1'), idbGet('att_manage_history')]);
      let stored: ActivityItem[] = [];
      try { stored = raw ? (JSON.parse(raw) as Array<any>).map(item => ({ ...item, kind: item.kind || 'neutral' as ActivityKind })) : []; } catch { stored = []; }
      let history: ActivityItem[] = [];
      try {
        const entries = historyRaw ? JSON.parse(historyRaw) as Array<any> : [];
        history = entries.map(entry => {
          const type = String(entry.type || 'Updated routine');
          const data = entry.data || {};
          const rawTarget = data.name || data.new?.name || data.subject || data.ward || data.names?.join(', ') || data.clinicalSubject || 'routine';
          const target = /ua_|^academic:|^ward:|^sgt:/.test(String(rawTarget)) ? 'Unknown subject' : shortenSubject(String(rawTarget));
          const kind: ActivityKind = /vacation|exam/i.test(type) ? 'vacation' : /percentage|planned/i.test(type) ? 'percentage' : /slot/i.test(type) ? 'slot' : /edit|move|add|delete/i.test(type) ? 'edit' : 'neutral';
          return { id: `history-${entry.id}`, text: `${type}: ${target}`, timestamp: Date.parse(entry.timestamp) || Date.now(), kind };
        });
      } catch { history = []; }
      const merged = await mergeDashboardActivities([...stored, ...history]);
      if (!cancelled) setDashboardActivities(merged as ActivityItem[]);
    };
    const onActivityUpdated = () => { void loadActivities(); };
    window.addEventListener(DASHBOARD_ACTIVITY_UPDATED_EVENT, onActivityUpdated);
    void loadActivities();
    return () => {
      cancelled = true;
      window.removeEventListener(DASHBOARD_ACTIVITY_UPDATED_EVENT, onActivityUpdated);
    };
  }, [todayStr]);
  const visibleActivities = activityExpanded ? dashboardActivities : dashboardActivities.slice(0, 4);
  const yesterdayStr = toDateString(addDays(today, -1));
  const activityGroups = [
    { label: 'Today', items: visibleActivities.filter(item => toDateString(new Date(item.timestamp)) === todayStr) },
    { label: 'Yesterday', items: visibleActivities.filter(item => toDateString(new Date(item.timestamp)) === yesterdayStr) },
  ];
  const hasRecentActivity = activityGroups.some(group => group.items.length > 0);
  const isTodayDetoxDay = subjectMode === 'preloaded' && today.getDay() === 5;

  const dashboardClassEntries = todayDayEntries.filter(entry => entry.kind === 'card');
  const tomorrowDate = addDays(today, 1);
  const tomorrowDateStr = toDateString(tomorrowDate);
  const tomorrowDay = tomorrowDate.getDay();
  const tomorrowEntries = useMemo(() => {
    const entries: Array<{ subject?: string; time: string; holiday?: string; isWard?: boolean; isSGT?: boolean; isIntegrated?: boolean }> = [];
    if (subjectMode === 'preloaded') {
      if (tomorrowDay === 5) return [{ time: '', holiday: 'Detox Day' }];
      (presetTimetable[tomorrowDay] || []).forEach((slot: any) => {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') {
          const ward = getCurrentPresetWard(tomorrowDate);
          if (ward?.ward && ward.ward !== 'Holiday') entries.push({ subject: ward.ward, time: ward.morningTime || slot.time, isWard: true });
          else entries.push({ time: slot.time || '', holiday: 'Detox Day' });
        } else (slot.subjects || []).forEach((subject: string) => entries.push({ subject, time: slot.time || '', isWard: false }));
      });
      userAddedSubjects.forEach(subject => {
        if (subject.subjectType !== 'allied' || subject.parentName !== 'Small Group Teaching') return;
        const scheduleForDay = (subject.schedules || []).find((scheduleItem: any) => scheduleItem.day === DAY_ABBRS[tomorrowDay]);
        if (scheduleForDay) entries.push({ subject: subject.name, time: `${scheduleForDay.start}–${scheduleForDay.end}`, isSGT: true });
      });
    } else {
      customWards.forEach(ward => {
        if (tomorrowDateStr >= ward.startDate && tomorrowDateStr <= ward.endDate && ward.name !== 'Holiday') entries.push({ subject: ward.name, time: ward.morningTime || 'Morning Ward', isWard: true });
      });
      customSubjects.forEach(subject => {
        const schedules = (subject.schedules || []).filter((scheduleItem: any) => scheduleItem.day === DAY_ABBRS[tomorrowDay]);
        schedules.forEach((scheduleItem: any) => entries.push({ subject: subject.name, time: scheduleItem.time || `${scheduleItem.start}–${scheduleItem.end}`, isSGT: isSGTSubjectRecord(subject) }));
      });
    }
    const remaining = entries.filter(entry => {
      if (!entry.subject) return true;
      const source = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
      const sgt = source.find(item => item.name === entry.subject && isSGTSubjectRecord(item));
      const ward = subjectMode === 'custom'
        ? customWards.find(item => item.name.toLowerCase() === entry.subject!.toLowerCase())
        : getCurrentPresetWard(tomorrowDate)?.ward.toLowerCase() === entry.subject!.toLowerCase() ? getCurrentPresetWard(tomorrowDate) : undefined;
      const id = sgt
        ? getSGTKey(sgt.id)
        : ward
          ? (() => { const resolved = getSubjectIdByName(entry.subject!, 'clinical'); return resolved ? getWardAttendanceKey(resolved) : null; })()
          : (() => { const resolved = getSubjectIdByName(entry.subject!, 'academic'); return resolved ? getAcademicAttendanceKey(resolved) : null; })();
      if (!id) return false;
      const rangeSource: { startDate?: string; endDate?: string } | undefined = sgt
        ? sgt
        : subjectMode === 'custom' && ward
          ? ward as { startDate?: string; endDate?: string }
          : undefined;
      if (rangeSource && ((rangeSource.startDate && tomorrowDateStr < rangeSource.startDate) || (rangeSource.endDate && tomorrowDateStr > rangeSource.endDate))) return false;
      const record = ward ? wards[id] : subjects[id];
      const conducted = (record?.attended || 0) + (record?.missed || 0);
      const planned = ward
        ? subjectMode === 'custom'
          ? (() => { const custom = customWards.find(item => item.name.toLowerCase() === entry.subject!.toLowerCase()); return custom ? getCustomWardTotalPlanned(custom.startDate, custom.endDate, custom.vacationPeriods) : 0; })()
          : getPresetWardTotalPlanned(entry.subject!)
        : sgt
          ? sgt.plannedClasses || 0
          : getSubjectPlannedTotal(entry.subject!);
      const finished = Boolean(finishedMap[id]);
      return !finished && !(planned > 0 && conducted >= planned);
    });
    return remaining.sort((a, b) => (rangeStartMinutes(a.time) ?? 1440) - (rangeStartMinutes(b.time) ?? 1440));
  }, [customSubjects, customWards, finishedMap, getCurrentPresetWard, getSubjectIdByName, getSubjectPlannedTotal, getCustomWardTotalPlanned, getPresetWardTotalPlanned, presetTimetable, subjectMode, subjects, tomorrowDate, tomorrowDateStr, tomorrowDay, userAddedSubjects, wards]);
  const tomorrowSubject = tomorrowEntries[0]?.subject;
  const tomorrowIsWard = Boolean(tomorrowEntries[0]?.isWard);
  const tomorrowPreview = tomorrowEntries[0]?.holiday ? tomorrowEntries[0].holiday : tomorrowSubject ? `First: ${shortenSubject(tomorrowSubject)} (${getDashboardSubjectKind(tomorrowSubject, { isWard: tomorrowIsWard, isSGT: tomorrowEntries[0]?.isSGT, isIntegrated: tomorrowEntries[0]?.isIntegrated }, subjectMode, userAddedSubjects, customSubjects, subjectRegistry)})` : 'No classes scheduled for tomorrow.';
  const isEntryVacation = (entry: DayEntry, dateStr = selectedDateStr) => {
    const card = entry.card;
    if (!card) return false;
    if (card.isWard) {
      if (subjectMode === 'custom') return Boolean(customWards.find(item => item.name.toLowerCase() === card.subject.toLowerCase())?.vacationPeriods?.some(period => dateStr >= period.start && dateStr <= period.end));
      return presetWardSchedule.some(entry => entry.vacationPeriods?.some(period => dateStr >= period.start && dateStr <= period.end) ?? false);
    }
    if (card.isSGT && card.sgtId) {
      const source = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
      return Boolean(source.find(item => item.id === card.sgtId)?.vacationPeriods?.some(period => dateStr >= period.start && dateStr <= period.end));
    }
    return false;
  };
  const glanceEntries = dashboardClassEntries
    .sort((a, b) => {
      const completedOrder = Number(isCompletedPlannedEntry(a, todayStr)) - Number(isCompletedPlannedEntry(b, todayStr));
      return completedOrder || ((rangeStartMinutes(a.time) ?? 1440) - (rangeStartMinutes(b.time) ?? 1440));
    });
  const resolveSubjectAlert = (storageKey: string) => {
    const registryRef = subjectRegistry.find(ref => getCanonicalAttendanceKey(ref).toLowerCase() === storageKey.trim().toLowerCase());
    if (!registryRef) {
      return { name: '', category: 'Lecture', isResolved: false, plannedHint: undefined, rawId: storageKey };
    }
    const source = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const sourceItem = source.find(item => item.id === registryRef.id);
    const customWard = registryRef.domain === 'clinical' && registryRef.kind !== 'sgt'
      ? customWards.find(item => item.id === registryRef.id)
      : undefined;
    const category = registryRef.kind === 'sgt'
      ? 'SGT'
      : registryRef.kind === 'integrated'
        ? 'Integrated'
        : registryRef.domain === 'clinical'
          ? 'Ward'
          : 'Lecture';
    const plannedHint = customWard
      ? getCustomWardTotalPlanned(customWard.startDate, customWard.endDate, customWard.vacationPeriods)
      : sourceItem?.plannedClasses ?? registryRef.planned;
    return { name: registryRef.name, category, isResolved: true, plannedHint, rawId: registryRef.id };
  };
  const allPotentialMetrics = useMemo(() => {
    const metrics = new Map<string, {
      name: string;
      category: string;
      attended: number;
      missed: number;
      manuallyFinished: boolean;
      resolved: boolean;
      isWard: boolean;
      plannedHint?: number;
      rawId: string;
      storageKey: string;
    }>();
    const addCanonical = (ref: typeof subjectRegistry[number]) => {
      const isWard = ref.kind === 'preset-ward' || ref.kind === 'ward-rotation';
      const canonicalKey = ref.kind === 'sgt' ? getSGTKey(ref.id) : isWard ? getWardAttendanceKey(ref.id) : getAcademicAttendanceKey(ref.id);
      const category = ref.kind === 'sgt' ? 'SGT' : isWard ? 'Ward' : ref.kind === 'integrated' ? 'Integrated' : 'Lecture';
      const metricKey = `${category}:${ref.id.trim().toLowerCase()}`;
      if (!metrics.has(metricKey)) metrics.set(metricKey, { name: ref.name, category, attended: 0, missed: 0, manuallyFinished: false, resolved: true, isWard, plannedHint: ref.planned, rawId: ref.id, storageKey: canonicalKey });
    };
    const canonicalRefs = [...subjectRegistry];
    const addMissingRef = (ref: typeof subjectRegistry[number]) => {
      if (!canonicalRefs.some(existing => existing.id === ref.id && existing.kind === ref.kind)) canonicalRefs.push(ref);
    };
    if (subjectMode === 'preloaded') {
      CATEGORIES.forEach(category => category.subjects.forEach(subject => addMissingRef({ id: subject.id, name: subject.name, domain: 'academic', kind: 'preset-academic', planned: subject.total })));
      INTEGRATED_SUBJECTS.forEach(subject => addMissingRef({ id: subject.id, name: subject.name, domain: 'academic', kind: 'integrated', planned: subject.total }));
      WARD_SUBJECTS.forEach(ward => addMissingRef({ id: ward.id, name: ward.name, domain: 'clinical', kind: 'preset-ward', planned: getPresetWardTotalPlanned(ward.name) }));
      userAddedSubjects.forEach(subject => addMissingRef({ id: subject.id, name: subject.name, domain: isSGTSubjectRecord(subject) ? 'clinical' : 'academic', kind: isSGTSubjectRecord(subject) ? 'sgt' : 'user-added', planned: subject.plannedClasses }));
    } else {
      customSubjects.forEach(subject => addMissingRef({ id: subject.id, name: subject.name, domain: isSGTSubjectRecord(subject) ? 'clinical' : 'academic', kind: isSGTSubjectRecord(subject) ? 'sgt' : 'custom', planned: subject.plannedClasses }));
      customWards.forEach(ward => addMissingRef({ id: ward.id, name: ward.name, domain: 'clinical', kind: 'ward-rotation', planned: getCustomWardTotalPlanned(ward.startDate, ward.endDate, ward.vacationPeriods) }));
    }
    canonicalRefs.forEach(addCanonical);
    const addRecords = (records: Record<string, { attended: number; missed: number }>, isWard: boolean) => Object.entries(records).forEach(([storageKey, item]) => {
      const resolved = resolveSubjectAlert(storageKey);
      if (!resolved.isResolved) return;
      const metricKey = `${resolved.category}:${resolved.rawId.trim().toLowerCase()}`;
      const previous = metrics.get(metricKey);
      metrics.set(metricKey, {
        name: resolved.name,
        category: resolved.category,
        attended: (previous?.attended || 0) + item.attended,
        missed: (previous?.missed || 0) + item.missed,
        manuallyFinished: false,
        resolved: true,
        isWard,
        plannedHint: previous?.plannedHint ?? resolved.plannedHint,
        rawId: previous?.rawId ?? resolved.rawId,
        storageKey: previous?.storageKey ?? getCanonicalAttendanceKey(subjectRegistry.find(ref => ref.id === resolved.rawId)! ),
      });
    });
    addRecords(subjects, false);
    addRecords(wards, true);
    const calculated = Array.from(metrics.values()).map(metric => {
      const source = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
      const rawId = metric.rawId.trim().toLowerCase();
      const nameKey = metric.name.trim().toLowerCase();
      const sourceItem = source.find(item => item.id.trim().toLowerCase() === rawId);
      const customWardItem = customWards.find(item => item.id.trim().toLowerCase() === rawId);
      const registryItem = subjectRegistry.find(item => {
        const itemCategory = item.kind === 'sgt' ? 'SGT' : item.kind === 'preset-ward' || item.kind === 'ward-rotation' ? 'Ward' : item.kind === 'integrated' ? 'Integrated' : 'Lecture';
        return itemCategory === metric.category && getCanonicalAttendanceKey(item).toLowerCase() === metric.storageKey.trim().toLowerCase();
      });
      const preset = [...CATEGORIES.flatMap(category => category.subjects), ...INTEGRATED_SUBJECTS, ...WARD_SUBJECTS]
        .find(item => ('id' in item && item.id.trim().toLowerCase() === rawId) || item.name.trim().toLowerCase() === nameKey);
      const presetPlanned = preset && 'total' in preset ? preset.total : undefined;
      const planned = metric.plannedHint ?? registryItem?.planned ?? (metric.isWard
        ? subjectMode === 'custom' && customWardItem
          ? getCustomWardTotalPlanned(customWardItem.startDate, customWardItem.endDate, customWardItem.vacationPeriods)
          : getPresetWardTotalPlanned(metric.name)
        : sourceItem?.plannedClasses ?? presetPlanned ?? (preset ? getSubjectPlannedTotal(metric.name) : undefined));
      const conducted = metric.attended + metric.missed;
      const remaining = planned === undefined ? 0 : Math.max(0, planned - conducted);
      const current = conducted === 0 ? 0 : (metric.attended / conducted) * 100;
      const maximum = planned && planned > 0 ? ((metric.attended + remaining) / planned) * 100 : current;
      const placementEligible = (() => {
        if (metric.category === 'Lecture' || metric.category === 'Integrated') return true;
        const range = metric.category === 'SGT'
          ? source.find(item => item.id.trim().toLowerCase() === rawId || item.name.trim().toLowerCase() === nameKey)
          : subjectMode === 'custom'
            ? customWardItem
            : undefined;
        if (range && ('startDate' in range || 'endDate' in range)) {
          return (!range.startDate || todayStr >= range.startDate) && (!range.endDate || todayStr <= range.endDate);
        }
        if (metric.category === 'Ward' && subjectMode === 'preloaded') {
          const presetWard = WARD_SUBJECTS.find(item => item.id.trim().toLowerCase() === rawId || item.name.trim().toLowerCase() === nameKey);
          const wardName = presetWard?.name.trim().toLowerCase() || nameKey;
          const entries = presetWardSchedule.filter(entry => entry.ward.trim().toLowerCase() === wardName);
          return entries.length === 0 || entries.some(entry => todayStr >= entry.start && todayStr <= entry.end);
        }
        return true;
      })();
      return { ...metric, current, maximum, remaining, planned: planned ?? 0, conducted, placementEligible };
    });
    if (!calculated.some(item => item.conducted > 0)) return [];
    return calculated
      .filter(item => item.planned > 0 && item.remaining > 0 && item.placementEligible)
      .sort((a, b) => a.current - b.current);
  }, [customSubjects, customWards, finishedMap, getCustomWardTotalPlanned, getPresetSubjectDisplayName, getPresetWardDisplayName, getPresetWardTotalPlanned, getSubjectPlannedTotal, preferredPercentage, presetWardSchedule, subjectMode, subjects, subjectRegistry, todayStr, userAddedSubjects, wards]);
  const subjectAlertMetrics = allPotentialMetrics.filter(item => item.current < preferredPercentage);
  const statusForEntry = (entry: DayEntry) => {
    if (entry.kind !== 'card' || !entry.card?.sessionId) return undefined;
    const card = entry.card;
    const attendanceKey = card.isSGT && card.sgtId
      ? getSGTKey(card.sgtId)
      : (() => {
          const resolved = getSubjectIdByName(
            card.isWard ? (card.subtitle || card.subject) : card.subject,
            card.isWard ? 'clinical' : 'academic'
          );
          return resolved
            ? (card.isWard ? getWardAttendanceKey(resolved) : getAcademicAttendanceKey(resolved))
            : null;
        })();
    if (!attendanceKey) return undefined;
    return homeSelections[`${todayStr}-${attendanceKey}-${card.sessionId}`];
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
      <div className="relative grid grid-cols-[1.2fr_1fr] gap-3">
        <section className="glass-card absolute inset-y-0 left-0 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border p-3 text-left" style={{ width: 'calc((100% - 0.75rem) * 0.5454545)' }}>
          <h2 className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Today at a Glance</h2>
          <div className="relative mt-2 min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {glanceEntries.length === 0 ? <p className="py-2 text-xs text-muted-foreground">No remaining classes today.</p> : <div className="relative space-y-2 pl-4 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-px before:bg-border">
              {glanceEntries.map(entry => {
                const status = statusForEntry(entry);
                const completed = isCompletedPlannedEntry(entry, todayStr);
                const vacation = isEntryVacation(entry, todayStr);
                const label = vacation ? 'Vacation / Exam Period' : completed ? 'Completed' : status === 'attended' ? 'Attended' : status === 'missed' ? 'Bunked' : status === 'off' ? 'Off' : 'Not Marked Yet';
                const color = vacation ? 'text-amber-500' : completed ? 'text-muted-foreground' : status === 'attended' ? 'text-emerald-500' : status === 'missed' ? 'text-rose-500' : status === 'off' ? 'text-amber-500' : 'text-muted-foreground';
                const rowMuted = completed ? 'opacity-55' : '';
                const subject = entry.card?.subject || 'Unknown subject';
                const kind = getDashboardSubjectKind(subject, entry.card, subjectMode, userAddedSubjects, customSubjects, subjectRegistry);
                return <button type="button" key={entry.id} onClick={() => setShowMarkAttendance(true)} className={cn('relative flex w-full min-w-0 items-center gap-x-2 text-left', rowMuted)}>
                  <span className={cn('absolute -left-[0.6875rem] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-card', completed ? 'bg-muted-foreground' : 'bg-primary')} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0">
                    <span className="min-w-0 break-words text-[10px] font-bold leading-3 text-foreground">{subject}</span>
                    <span className="min-w-0 text-[8px] font-semibold leading-3 text-muted-foreground">({kind})</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0 text-right">
                    <span className="min-w-0 text-[8px] text-muted-foreground">{entry.time}</span>
                    <span className={cn('min-w-0 text-[8px] font-extrabold', color)}>{label}</span>
                  </span>
                </button>;
              })}
            </div>}
          </div>
        </section>
        <div className="col-start-2 flex flex-col gap-3">
          <button type="button" onClick={() => setShowMarkAttendance(true)} className="min-h-11 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-left transition-transform active:scale-[0.98]"><ClipboardCheck className="h-5 w-5 text-primary" /><p className="mt-2 text-sm font-extrabold text-foreground">Mark Attendance</p><p className="mt-1 text-[11px] text-muted-foreground">{dashboardClassEntries.filter(entry => !isCompletedPlannedEntry(entry)).length > 0 ? `${dashboardClassEntries.filter(entry => !isCompletedPlannedEntry(entry)).length} Classes today` : 'No classes scheduled today.'}</p></button>
          <button type="button" onClick={() => { setSelectedDateStr(toDateString(addDays(today, 1))); setShowMarkAttendance(true); }} className="min-h-11 rounded-2xl border border-border bg-card p-3 text-left transition-transform active:scale-[0.98]"><MoonStar className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xs font-extrabold text-foreground">Tomorrow Class</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{tomorrowPreview}</p></button>
        </div>
      </div>
      <section className="glass-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">Recent Activity</h2></div>
        {!hasRecentActivity ? (
          <p className="mt-4 text-xs text-muted-foreground">{isTodayDetoxDay ? 'Detox Day — no activity is expected today.' : 'No recent activity in the last 48 hours.'}</p>
        ) : (
          <div className="relative mt-3 space-y-3">
            {activityGroups.map((group, groupIndex) => (
              <div key={group.label} className={cn(groupIndex > 0 && 'border-t border-border/60 pt-3')}>
                <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{group.label}</h3>
                {group.items.length === 0 ? <p className="text-xs text-muted-foreground">{group.label === 'Today' ? 'No activity for today yet.' : 'No activity was recorded yesterday.'}</p> : (
                  <div className="relative space-y-2 before:absolute before:bottom-2 before:left-[4.5rem] before:top-2 before:w-px before:bg-border">
                    {group.items.map(item => { const Icon = item.kind === 'attendance' ? ClipboardCheck : item.kind === 'missed' ? Minus : item.kind === 'slot' ? Plus : item.kind === 'vacation' ? CalendarDays : item.kind === 'percentage' ? Percent : item.kind === 'edit' ? Pencil : Tag; const color = item.kind === 'attendance' ? 'bg-emerald-500 text-white' : item.kind === 'missed' ? 'bg-rose-500 text-white' : item.kind === 'vacation' ? 'bg-amber-500 text-white' : item.kind === 'edit' || item.kind === 'slot' || item.kind === 'percentage' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'; return <div key={item.id} className="relative grid grid-cols-[3.25rem_1.25rem_minmax(0,1fr)] items-center gap-2.5 py-0.5 text-xs"><time className="w-[3.25rem] text-right text-[8px] font-semibold tracking-tight text-muted-foreground">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span className={cn('relative z-10 flex h-5 w-5 items-center justify-center rounded-full', color)}><Icon className="h-2.5 w-2.5" /></span><span className="min-w-0 font-semibold text-foreground">{renderActivityText(item.text.replace(/\(Small Group Teaching\)/g, '(SGT)'))}</span></div>; })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setActivityExpanded(value => !value)} className="mt-4 w-full text-left text-xs font-bold text-primary">{activityExpanded ? 'Collapse activity ↑' : 'View all activity →'}</button>
      </section>
      <section className="glass-card rounded-2xl border border-border p-4"><h2 className="text-sm font-extrabold">Subject Alerts</h2><div className="mt-3 space-y-2">{subjectAlertMetrics.length === 0 ? <p className="text-xs text-muted-foreground">No subjects need attention right now.</p> : subjectAlertMetrics.map(metric => <button type="button" key={`${metric.category}-${metric.name}`} onClick={() => setLocation('/subjects')} className="flex w-full items-center gap-2 text-left"><span className="h-2 w-2 rounded-full bg-rose-500" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{shortenSubject(metric.name)} <span className="text-[9px] font-bold text-muted-foreground">({metric.category || 'Lecture'})</span></span><span className="text-xs font-bold text-muted-foreground">{Math.round(metric.current)}% ({metric.attended}/{metric.attended + metric.missed})</span></button>)}</div></section>
      <section className="glass-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold">Maximum Percentage Possible</h2>
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-extrabold text-emerald-500">If attended</span>
        </div>
        {allPotentialMetrics.length === 0 ? <p className="mt-3 text-[10px] text-muted-foreground">Not enough data yet.</p> : (
          <div className="mt-3">
            <svg viewBox={`0 0 560 ${allPotentialMetrics.length * 46 + 34}`} className="h-auto max-h-[22rem] w-full" role="img" aria-label="Per-subject attendance ECG waveforms">
              <line x1="112" x2="112" y1="10" y2={allPotentialMetrics.length * 46 + 24} stroke="currentColor" strokeOpacity=".45" />
              <line x1="112" x2="540" y1={allPotentialMetrics.length * 46 + 24} y2={allPotentialMetrics.length * 46 + 24} stroke="currentColor" strokeOpacity=".45" />
              {[0, 20, 40, 60, 80, 100].map(tick => <text key={tick} x={112 + (428 * tick) / 100} y={allPotentialMetrics.length * 46 + 34} textAnchor={tick === 0 ? 'start' : tick === 100 ? 'end' : 'middle'} fontSize="8" fill="currentColor" opacity=".7">{tick === 0 ? '0' : `${tick}%`}</text>)}
              {allPotentialMetrics.map((metric, index) => {
                const rowY = 34 + index * 46;
                const left = 112;
                const width = 428;
                const baseline = rowY;
                const currentX = left + (width * Math.min(100, Math.max(0, metric.current))) / 100;
                const maxX = left + (width * Math.min(100, Math.max(metric.current, metric.maximum))) / 100;
                const extension = Math.max(24, maxX - currentX);
                const peakX = currentX + extension * 0.48;
                const tX = currentX + extension * 0.78;
                const currentColor = '#94a3b8';
                const maxColor = metric.maximum >= preferredPercentage ? '#34d399' : '#ef4444';
                const waveform = `M ${currentX.toFixed(1)} ${baseline.toFixed(1)} C ${(currentX + extension * 0.12).toFixed(1)} ${baseline.toFixed(1)}, ${(currentX + extension * 0.16).toFixed(1)} ${(baseline - 5).toFixed(1)}, ${(currentX + extension * 0.24).toFixed(1)} ${(baseline - 5).toFixed(1)} C ${(currentX + extension * 0.3).toFixed(1)} ${(baseline - 5).toFixed(1)}, ${(currentX + extension * 0.34).toFixed(1)} ${(baseline + 5).toFixed(1)}, ${(currentX + extension * 0.38).toFixed(1)} ${baseline.toFixed(1)} C ${(currentX + extension * 0.42).toFixed(1)} ${(baseline - 8).toFixed(1)}, ${(peakX - extension * 0.05).toFixed(1)} ${(baseline - 8).toFixed(1)}, ${peakX.toFixed(1)} ${(baseline - 26).toFixed(1)} C ${(peakX + extension * 0.04).toFixed(1)} ${(baseline - 8).toFixed(1)}, ${(currentX + extension * 0.56).toFixed(1)} ${(baseline + 10).toFixed(1)}, ${(currentX + extension * 0.62).toFixed(1)} ${baseline.toFixed(1)} C ${(currentX + extension * 0.7).toFixed(1)} ${(baseline - 9).toFixed(1)}, ${(tX - extension * 0.04).toFixed(1)} ${(baseline - 9).toFixed(1)}, ${tX.toFixed(1)} ${(baseline - 9).toFixed(1)} C ${(tX + extension * 0.08).toFixed(1)} ${(baseline - 9).toFixed(1)}, ${(tX + extension * 0.14).toFixed(1)} ${(baseline - 3).toFixed(1)}, ${maxX.toFixed(1)} ${baseline.toFixed(1)}`;
                const nameLines = wrapDashboardSvgLabel(shortenSubject(metric.name), 18);
                return <g key={`${metric.category}-${metric.name}`}>
                  <text x="2" y={rowY - 4} fontSize="9" fontWeight="700" fill="currentColor">
                    {nameLines.map((line, lineIndex) => <tspan key={lineIndex} x="2" dy={lineIndex === 0 ? 0 : 10}>{line}</tspan>)}
                    <tspan x="2" dy="10" fontSize="8" fontWeight="600" fill="currentColor" opacity=".75">({metric.category})</tspan>
                  </text>
                  <line x1={left} x2={currentX} y1={baseline} y2={baseline} stroke={currentColor} strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx={currentX} cy={baseline} r="2.5" fill={currentColor} />
                  <text x={currentX} y={baseline - 7} textAnchor="middle" fontSize="8" fill={currentColor}>{Math.round(metric.current)}%</text>
                  {metric.current < 100 && <>
                    <path d={waveform} fill="none" stroke={maxColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx={maxX} cy={baseline} r="2.5" fill={maxColor} />
                    <text x={maxX} y={baseline + 13} textAnchor="middle" fontSize="8" fontWeight="700" fill={maxColor}>{Math.round(metric.maximum)}%</text>
                  </>}
                </g>;
              })}
            </svg>
            <div className="mt-1 flex items-center justify-center gap-4 text-[9px] font-bold text-muted-foreground">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#94a3b8]" />Current</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#34d399]" />Maximum possible</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#ef4444]" />Below target</span>
            </div>
          </div>
        )}
      </section>
      </div>
    </motion.div>
  );
  return (
    <Layout
      mainClassName="!overflow-hidden"
      contentClassName="h-full min-h-0 flex flex-col"
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
      {showMarkAttendance ? <motion.div key="attendance-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="min-h-0 flex flex-1 flex-col">
        <div className="home-date-wheel-float" aria-label="Choose date">
          {dateWheel}
        </div>
        <button type="button" onClick={() => setShowMarkAttendance(false)} className="mb-2 self-start text-xs font-bold text-primary">← Dashboard</button>
        <div className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-0 scroll-fade-viewport scroll-reachability">
        {/* ── Content ── */}
        {!hasAnything ? (
          <div className="flex min-h-full items-center justify-center text-center">
            <div className="flex flex-col items-center">
              <ClipboardCheck className="mb-4 h-12 w-12 text-primary" />
              <h3 className="mb-3 text-xl font-semibold text-foreground">
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
                  <p className="mb-0 max-w-sm px-4 text-base leading-relaxed text-muted-foreground">
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
