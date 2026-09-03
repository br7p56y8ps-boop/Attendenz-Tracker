import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { StickySectionLabel } from '@/components/StickySectionLabel';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey } from '@/contexts/AttendanceContext';
import { useCustomData, parseDayList } from '@/contexts/CustomDataContext';
import { cn, getSubjectColor, formatISODateDDMMYY, parseRangeToMinutes, canonicalizeTimeRange, pctColor, getAttendanceStatus } from '@/lib/utils';
import { CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';

const DEFAULT_DAYS_ORDER = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_INDEX_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_AFTER_HOLIDAY_INDEX = 6; // Saturday follows the app-wide Friday holiday boundary.

function getDisplayDayOrder(
  subjectMode: 'preloaded' | 'custom',
  activeTimetable: Record<number, any[]> | any[][],
  sgtEntries: Array<{ day: string }>,
): string[] {
  if (subjectMode === 'preloaded') return DEFAULT_DAYS_ORDER;

  let firstDayIndex = DAY_AFTER_HOLIDAY_INDEX;
  for (let offset = 0; offset < 7; offset += 1) {
    const dayIndex = (DAY_AFTER_HOLIDAY_INDEX + offset) % 7;
    const day = Object.keys(DAY_INDEX_MAP).find(name => DAY_INDEX_MAP[name] === dayIndex) || 'Sat';
    const hasAcademicSlot = (activeTimetable[dayIndex] || []).some(slot =>
      slot?.type !== 'ward' && slot?.type !== 'ward_replacement' && Array.isArray(slot?.subjects) && slot.subjects.length > 0,
    );
    const hasSGTSlot = sgtEntries.some(entry => entry.day === day);
    if (hasAcademicSlot || hasSGTSlot) {
      firstDayIndex = dayIndex;
      break;
    }
  }

  return Array.from({ length: 7 }, (_, offset) => {
    const dayIndex = (firstDayIndex + offset) % 7;
    return Object.keys(DAY_INDEX_MAP).find(name => DAY_INDEX_MAP[name] === dayIndex) || 'Sat';
  });
}

function shortenSubject(name: string) {
  const map: Record<string, string> = {
    'Surgery': 'Surg.', 'Obstetrics & Gynaecology': 'Obs & Gyn.', 'Pediatrics': 'Peds.',
    'Orthopedics': 'Ortho.', 'Ophthalmology': 'Ophtha.', 'Otolaryngology': 'ENT',
    'Dermatology': 'Derm.', 'Psychiatry': 'Psych.', 'Physical Medicine': 'PMR',
    'Radiology': 'Radio.', 'Radiotherapy': 'RadioT.', 'Nuclear Medicine': 'Nuc Med.',
    'Neurosurgery': 'NeuroS.', 'Pediatric Surgery': 'Peds Surg.', 'Burn & Plastic Surgery': 'Plastic S.',
    'Internal Medicine': 'Medicine', 'Phase Integrated Teaching': 'Phase Integrated',
    'Departmental Integrated Teaching': 'Dept. Integrated'
  };
  const short = map[name] || name;
  return short.length > 24 ? `${short.slice(0, 23)}…` : short;
}

const categoryBadgeClass = (category: 'Lecture' | 'Ward' | 'SGT') => category === 'SGT'
  ? 'bg-purple-500/10 text-purple-500 border-purple-500/25'
  : category === 'Ward'
    ? 'bg-sky-500/10 text-sky-500 border-sky-500/25'
    : 'bg-primary/10 text-primary border-primary/25';

/* ── Minute-based grid columns ── */
interface GridColumn { id: string; start: number; end: number; base: boolean; }
const BASE_PRESET_COLS = [
  { start: 420, end: 480 },
  { start: 510, end: 570 },
  { start: 690, end: 720 },
  { start: 720, end: 780 },
  { start: 780, end: 840 },
];
const fmtHourMin = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60) % 12;
  if (h === 0) h = 12;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const meridiemOf = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  return Math.floor(m / 60) >= 12 ? 'PM' : 'AM';
};
const columnHeader = (col: GridColumn): { nums: string; period: string } => {
  const s = meridiemOf(col.start);
  const e = meridiemOf(col.end);
  return { nums: `${fmtHourMin(col.start)}–${fmtHourMin(col.end)}`, period: s === e ? s : `${s}–${e}` };
};
const coveredByBase = (r: { start: number; end: number }): boolean => {
  const within = BASE_PRESET_COLS.filter(c => c.start < r.end && c.end > r.start);
  if (!within.length) return false;
  const sorted = [...within].sort((a, b) => a.start - b.start);
  if (sorted[0].start !== r.start) return false;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start !== sorted[i - 1].end) return false;
  return true;
};

export default function Timetable() {
  const { subjects, wards, homeSelections, preferredPercentage } = useAttendance();
  const {
    customSubjects, customWards, userAddedSubjects,
    subjectMode, presetTimetable, presetWardSchedule,
    getCurrentPresetWard, getCurrentCustomWard,
    getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned, getSubjectIdByName,
  } = useCustomData();
  const today = new Date();
  const target = preferredPercentage || 75;
  const [monthSel, setMonthSel] = useState<number | null>(null);
  const [attnOpen, setAttnOpen] = useState(false);

  /* ── SGT entries for the weekly grid ── */
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const sgtEntries = useMemo(() => {
    const store = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const entries: Array<{ day: string; range: string; name: string; start: number; end: number }> = [];
    store.forEach(s => {
      if (!(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')) return;
      const start = (s as any).startDate;
      const end = (s as any).endDate;
      if ((start && todayStr < start) || (end && todayStr > end)) return;
      const scheds: Array<{ day: string; range: string }> = [];
      (s.schedules || []).forEach((sch: any) => {
        const range = sch.time ? canonicalizeTimeRange(sch.time) : `${sch.start}–${sch.end}`;
        if (range) scheds.push({ day: sch.day, range });
      });
      if (scheds.length === 0 && s.days) {
        s.days.split(',').map((d: string) => d.trim()).filter(Boolean)
          .forEach((d: string) => scheds.push({ day: d, range: s.time }));
      }
      scheds.forEach(sch => {
        const m = parseRangeToMinutes(sch.range);
        if (m) entries.push({ day: sch.day, range: sch.range, name: s.name, start: m.start, end: m.end });
      });
    });
    return entries;
  }, [subjectMode, userAddedSubjects, customSubjects, todayStr]);

  /* ── STATISTICS ── */
  const allEntities = useMemo(() => {
    const list: Array<{ name: string; id?: string; isWard: boolean; planned: number; category: 'Lecture' | 'Ward' | 'SGT'; isSGT?: boolean; sgtId?: string; periodEnd?: string }> = [];
    if (subjectMode === 'preloaded') {
      const wardPeriodEnds = new Map<string, string>();
      presetWardSchedule.forEach(e => {
        const currentEnd = wardPeriodEnds.get(e.ward);
        if (!currentEnd || e.end > currentEnd) wardPeriodEnds.set(e.ward, e.end);
      });
      CATEGORIES.forEach(c => c.subjects.forEach(s => list.push({ name: s.name, isWard: false, planned: getSubjectPlannedTotal(s.name), category: 'Lecture' })));
      INTEGRATED_SUBJECTS.forEach(s => list.push({ name: s.name, isWard: false, planned: getSubjectPlannedTotal(s.name), category: 'Lecture' }));
      WARD_SUBJECTS.forEach(w => list.push({ name: w.name, isWard: true, planned: getPresetWardTotalPlanned(w.name), category: 'Ward', periodEnd: wardPeriodEnds.get(w.name) }));
      userAddedSubjects.forEach(u => {
        if (u.subjectType === 'allied-parent') return;
        if (u.parentName === 'Small Group Teaching') {
          list.push({ name: u.name, id: u.id, isWard: false, planned: u.plannedClasses, category: 'SGT', isSGT: true, sgtId: u.id, periodEnd: (u as any).endDate });
        } else {
          list.push({ name: u.name, id: u.id, isWard: false, planned: u.plannedClasses, category: 'Lecture', periodEnd: (u as any).endDate });
        }
      });
      presetWardSchedule.forEach(e => {
        if (!list.some(x => x.isWard && x.name === e.ward)) {
          list.push({ name: e.ward, isWard: true, planned: getPresetWardTotalPlanned(e.ward), category: 'Ward', periodEnd: wardPeriodEnds.get(e.ward) || e.end });
        }
      });
    } else {
      customSubjects.forEach(s => {
        if (s.subjectType === 'allied-parent') return;
        if (s.parentName === 'Small Group Teaching') {
          list.push({ name: s.name, id: s.id, isWard: false, planned: s.plannedClasses, category: 'SGT', isSGT: true, sgtId: s.id, periodEnd: (s as any).endDate });
        } else {
          list.push({ name: s.name, id: s.id, isWard: false, planned: s.plannedClasses, category: 'Lecture', periodEnd: (s as any).endDate });
        }
      });
      customWards.forEach(w => list.push({ name: w.name, isWard: true, planned: getCustomWardTotalPlanned(w.startDate, w.endDate), category: 'Ward', periodEnd: w.endDate }));
    }
    return list;
  }, [subjectMode, customSubjects, customWards, userAddedSubjects, presetWardSchedule, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned]);

  const getEntityAttendanceKey = (e: { name: string; id?: string; isWard: boolean; isSGT?: boolean; sgtId?: string }): string | null => {
    if (e.isSGT && e.sgtId) return getSGTKey(e.sgtId);
    const id = e.id || getSubjectIdByName(e.name, e.isWard ? 'clinical' : 'academic');
    if (!id) return null;
    return e.isWard ? getWardAttendanceKey(id) : getAcademicAttendanceKey(id);
  };

  const overall = useMemo(() => {
    let att = 0, mis = 0, planned = 0, off = 0;
    allEntities.forEach(e => {
      const key = getEntityAttendanceKey(e);
      const d = key ? (e.isWard ? wards : subjects)[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
      att += Number(d.attended) || 0; mis += Number(d.missed) || 0; planned += Number(e.planned) || 0;
    });
    for (const sel of Object.values(homeSelections)) if (sel === 'off') off += 1;
    const conducted = att + mis;
    const pct = conducted === 0 ? 0 : (att / conducted) * 100;
    const maxMissable = Math.floor(planned * (1 - target / 100));
    const canMiss = Math.max(0, maxMissable - mis);
    return { att, mis, off, planned, pct, conducted, canMiss };
  }, [allEntities, subjects, wards, homeSelections, target]);

  const attention = useMemo(() => {
    const out: Array<{ name: string; category: 'Lecture' | 'Ward' | 'SGT'; pct: number; needed: number }> = [];
    allEntities.forEach(e => {
      const key = getEntityAttendanceKey(e);
      const d = key ? (e.isWard ? wards : subjects)[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
      const conducted = d.attended + d.missed;
      if (conducted === 0) return;
      const remaining = Math.max(0, e.planned - conducted);
      if (remaining <= 0) return; // exclude completed subjects
      if ((e.isWard || e.category === 'SGT') && e.periodEnd && e.periodEnd < todayStr) return; // exclude finished clinical placements
      const pct = (d.attended / conducted) * 100;
      const rawReq = Math.max(0, Math.ceil(e.planned * (target / 100)) - d.attended);
      if (pct < target || rawReq > remaining) out.push({ name: e.name, category: e.category, pct, needed: rawReq });
    });
    return out.sort((a, b) => a.pct - b.pct).slice(0, 6);
  }, [allEntities, subjects, wards, target, todayStr]);

  /* ── NEW: Prediction of Maximum Possible Attendance ── */
  const predictionItems = useMemo(() => {
    const result: Array<{ name: string; category: 'Lecture' | 'Ward' | 'SGT'; currentPct: number; remaining: number; maxPossiblePct: number; planned: number; attended: number }> = [];
    allEntities.forEach(e => {
      const key = getEntityAttendanceKey(e);
      const d = key ? (e.isWard ? wards : subjects)[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
      const conducted = d.attended + d.missed;
      const remaining = Math.max(0, e.planned - conducted);
        if (remaining <= 0) return;
        if ((e.isWard || e.category === 'SGT') && e.periodEnd && e.periodEnd < todayStr) return;
        const currentPct = conducted === 0 ? 0 : (d.attended / conducted) * 100;
      const maxPossiblePct = (d.attended + remaining) / e.planned * 100;
      result.push({
        name: e.name,
        category: e.category,
        currentPct,
        remaining,
        maxPossiblePct,
        planned: e.planned,
        attended: d.attended,
      });
    });
    return result.sort((a, b) => a.maxPossiblePct - b.maxPossiblePct);
  }, [allEntities, subjects, wards, todayStr]);

  const months = useMemo(() => {
    const now = new Date();
    const buckets: Array<{ key: string; label: string; att: number; mis: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.push({ key, label: d.toLocaleString('en-US', { month: 'short' }), att: 0, mis: 0 });
    }
    for (const [k, sel] of Object.entries(homeSelections)) {
      const mKey = k.slice(0, 7);
      const b = buckets.find(x => x.key === mKey);
      if (!b) continue;
      if (sel === 'attended') b.att += 1;
      else if (sel === 'missed') b.mis += 1;
    }
    return buckets.map(b => ({ ...b, pct: b.att + b.mis === 0 ? null : (b.att / (b.att + b.mis)) * 100 }));
  }, [homeSelections]);

  /* ── ROTATION WHEEL ── */
  const allRotations = useMemo(() => {
    const list: { name: string; start: string; end: string }[] = [];
    if (subjectMode === 'preloaded') {
      presetWardSchedule.forEach(ws => list.push({ name: ws.ward, start: ws.start, end: ws.end }));
    } else {
      customWards.forEach(w => list.push({ name: w.name, start: w.startDate, end: w.endDate }));
    }
    list.sort((a, b) => a.start.localeCompare(b.start));
    return list;
  }, [subjectMode, customWards, presetWardSchedule]);

  const currentRotationInfo = useMemo(() => {
    if (subjectMode === 'preloaded') {
      const cur = getCurrentPresetWard(today);
      if (!cur || cur.ward === 'Holiday') return null;
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const todayStr2 = `${y}-${m}-${d}`;
      const entry = presetWardSchedule.find(e => todayStr2 >= e.start && todayStr2 <= e.end);
      if (!entry) return null;
      return { name: cur.ward, start: entry.start, end: entry.end };
    } else {
      const cur = getCurrentCustomWard();
      if (!cur || cur.name === 'Holiday') return null;
      return { name: cur.name, start: cur.startDate, end: cur.endDate };
    }
  }, [subjectMode, getCurrentPresetWard, getCurrentCustomWard, presetWardSchedule, today]);

  const rotation = useMemo(() => {
    if (!currentRotationInfo) return null;
    const start = new Date(currentRotationInfo.start + 'T12:00:00');
    const end = new Date(currentRotationInfo.end + 'T12:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const done = Math.min(total, Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000) + 1));
    return { name: currentRotationInfo.name, total, done, pct: (done / total) * 100 };
  }, [currentRotationInfo, today]);

  const currentIndex = useMemo(() => {
    if (allRotations.length === 0) return 0;
    for (let i = 0; i < allRotations.length; i++) {
      const s = new Date(allRotations[i].start + 'T12:00:00');
      const e = new Date(allRotations[i].end + 'T12:00:00');
      if (today >= s && today <= e) return i;
    }
    for (let i = 0; i < allRotations.length; i++) if (today < new Date(allRotations[i].start + 'T12:00:00')) return i;
    return allRotations.length - 1;
  }, [allRotations, today]);

  const [activeIndex, setActiveIndex] = useState(currentIndex);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const [settling, setSettling] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const gestureAxis = useRef<'horizontal' | 'vertical' | null>(null);
  const totalItems = allRotations.length;
  const wrapIndex = (idx: number) => ((idx % totalItems) + totalItems) % totalItems;

  useEffect(() => { setActiveIndex(currentIndex); }, [currentIndex]);
  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (wheelRef.current && !wheelRef.current.contains(e.target as Node)) {
        setSettling(true);
        setActiveIndex(currentIndex);
        offsetRef.current = 0;
        setOffset(0);
      }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [currentIndex]);

  const CARD_STEP = 240;
  const onMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    const dy = e.clientY - lastY.current;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (!gestureAxis.current) {
      if (absX < 8 && absY < 8) return;
      gestureAxis.current = absX >= absY ? 'horizontal' : 'vertical';
    }
    if (gestureAxis.current === 'vertical') {
      dragging.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      return;
    }
    offsetRef.current += dx;
    setOffset(offsetRef.current);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    const steps = Math.round(-offsetRef.current / CARD_STEP);
    setSettling(true);
    if (steps !== 0) setActiveIndex(i => wrapIndex(i + steps));
    offsetRef.current = 0;
    setOffset(0);
  };
  const moveWheel = (step: number) => {
    if (totalItems === 0) return;
    setSettling(true);
    setActiveIndex(i => wrapIndex(i + step));
    offsetRef.current = 0;
    setOffset(0);
  };
  const onWheelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveWheel(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveWheel(1); }
    else if (e.key === 'Home') { e.preventDefault(); setSettling(true); setActiveIndex(0); offsetRef.current = 0; setOffset(0); }
    else if (e.key === 'End') { e.preventDefault(); setSettling(true); setActiveIndex(totalItems - 1); offsetRef.current = 0; setOffset(0); }
  };
  const onDown = (e: React.PointerEvent) => {
    if (totalItems === 0) return;
    dragging.current = true;
    setSettling(false);
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    gestureAxis.current = null;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  useEffect(() => () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }, []);

  const wheelItems = totalItems === 0 ? [] : [
    { item: allRotations[wrapIndex(activeIndex - 1)], position: 'left' },
    { item: allRotations[wrapIndex(activeIndex)], position: 'center' },
    { item: allRotations[wrapIndex(activeIndex + 1)], position: 'right' },
  ];
  const todayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()];

  const activeTimetable = useMemo(() => {
    if (subjectMode === 'preloaded') return presetTimetable;
    const days: any[][] = Array.from({ length: 7 }, () => []);
    customSubjects.forEach(s => {
      if (s.parentName === 'Small Group Teaching' || s.subjectType === 'allied-parent') return;
      const schedules = s.schedules?.length
        ? s.schedules
        : parseDayList(s.days || '').map((day: string) => ({ day, time: s.time || '' }));
      schedules.forEach((sch: any) => {
        const dayIndex = DAY_INDEX_MAP[sch.day] ?? -1;
        if (dayIndex < 0) return;
        const time = sch.time || (sch.start && sch.end ? `${sch.start}–${sch.end}` : '');
        if (time) days[dayIndex].push({ type: 'custom', subjects: [s.name], time });
      });
    });
    return days;
  }, [subjectMode, presetTimetable, customSubjects]);

  const hasCustomSchedule = subjectMode === 'custom' && (Object.values(activeTimetable).some((day: any[]) => day.length > 0) || sgtEntries.length > 0);
  const displayDaysOrder = useMemo(
    () => getDisplayDayOrder(subjectMode, activeTimetable, sgtEntries),
    [subjectMode, activeTimetable, sgtEntries],
  );

  /* ── Columns: base preset + extra (custom + SGT), chronological ── */
  const columns = useMemo<GridColumn[]>(() => {
    const extra: GridColumn[] = [];
    const push = (r: { start: number; end: number }) => {
      if (coveredByBase(r)) return;
      if (!extra.some(c => c.start === r.start && c.end === r.end)) extra.push({ ...r, base: false, id: `x${r.start}-${r.end}` });
    };
    displayDaysOrder.forEach(day => {
      (activeTimetable[DAY_INDEX_MAP[day]] || []).forEach(slot => {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') return;
        if (!slot.subjects || slot.subjects.length === 0) return;
        const m = parseRangeToMinutes(slot.time);
        if (m) push(m);
      });
    });
    sgtEntries.forEach(e => push({ start: e.start, end: e.end }));
    const base = subjectMode === 'preloaded' ? BASE_PRESET_COLS.map((c, i) => ({ ...c, base: true, id: `b${i}` })) : [];
    return [...base, ...extra].sort((a, b) => a.start - b.start);
  }, [activeTimetable, subjectMode, sgtEntries, displayDaysOrder]);

  /* ── Grid cells ── */
  const timetableGrid = useMemo(() => {
    const rows = displayDaysOrder.map(day => {
      if (subjectMode === 'preloaded' && day === 'Fri') return { day, cells: [{ key: 'hol', colStart: 0, span: columns.length, subjects: [], sgt: [], isRest: false, isHoliday: true, rowspan: 1, hidden: false }] };
      const dayIdx = DAY_INDEX_MAP[day];

      // Group single-subject slots by canonical time
      const timeMap = new Map<string, { time: string; subjects: string[]; sgt: string[] }>();
      (activeTimetable[dayIdx] || [])
        .filter(s => s.type !== 'ward' && s.type !== 'ward_replacement' && s.subjects && s.subjects.length > 0)
        .forEach(s => {
          const canon = canonicalizeTimeRange(s.time);
          const entry = timeMap.get(canon) || { time: canon, subjects: [], sgt: [] };
          entry.subjects.push(...s.subjects);
          timeMap.set(canon, entry);
        });

      // Merge SGT entries
      sgtEntries.filter(e => e.day === day).forEach(e => {
        const host = Array.from(timeMap.values()).find(v => {
          const m = parseRangeToMinutes(v.time);
          return m && m.start === e.start;
        });
        if (host) host.sgt.push(e.name);
        else timeMap.set(canonicalizeTimeRange(e.range), { time: canonicalizeTimeRange(e.range), subjects: [], sgt: [e.name] });
      });

      const slots = Array.from(timeMap.values());

      const consumed = new Set<string>();
      const cells: Array<{ key: string; colStart: number; span: number; subjects: string[]; sgt: string[]; isRest: boolean; isHoliday?: boolean; rowspan: number; hidden: boolean }> = [];
      columns.forEach((col, ci) => {
        if (consumed.has(col.id)) return;
        const covering = slots.find(s => {
          const m = parseRangeToMinutes(s.time);
          return m && m.start === col.start;
        });
        if (!covering) { consumed.add(col.id); cells.push({ key: col.id, colStart: ci, span: 1, subjects: [], sgt: [], isRest: false, rowspan: 1, hidden: false }); return; }
        const m = parseRangeToMinutes(covering.time)!;
        let span = 1;
        for (let k = ci + 1; k < columns.length; k++) {
          if (columns[k].end <= m.end) { span++; consumed.add(columns[k].id); } else break;
        }
        consumed.add(col.id);
        cells.push({ key: col.id, colStart: ci, span, subjects: covering.subjects, sgt: covering.sgt, isRest: covering.subjects[0] === 'Rest', rowspan: 1, hidden: false });
      });
      return { day, cells };
    });

    const sig = (c: { isHoliday?: boolean; subjects: string[]; sgt: string[]; colStart: number; span: number; isRest: boolean }) =>
      (c.isHoliday || (c.subjects.length === 0 && c.sgt.length === 0)) ? null : `${c.colStart}|${c.span}|${c.isRest ? 'REST' : [...c.subjects, ...c.sgt.map(n => `SGT:${n}`)].join('/')}`;
    for (let r = 1; r < rows.length; r++) {
      for (const cell of rows[r].cells) {
        const s = sig(cell);
        if (!s) continue;
        let rr = r - 1;
        let target: typeof cell | null = null;
        while (rr >= 0) {
          const cand = rows[rr].cells.find(c => sig(c) === s);
          if (!cand) break;
          if (!cand.hidden) { target = cand; break; }
          rr--;
        }
        if (target) { target.rowspan += 1; cell.hidden = true; }
      }
    }
    return rows;
  }, [activeTimetable, subjectMode, columns, sgtEntries, displayDaysOrder]);

  const dense = columns.length >= 6;
  const overallStatus = getAttendanceStatus(overall.pct, target, {
    isFinished: overall.planned > 0 && overall.conducted >= overall.planned,
    hasPlannedClasses: overall.planned > 0,
  });
  const overallColor = overallStatus === 'green' ? 'text-success' : overallStatus === 'yellow' ? 'text-warning' : overallStatus === 'neutral' ? 'text-muted-foreground' : 'text-destructive';
  const overallHex = pctColor(overall.pct, target, {
    isFinished: overall.planned > 0 && overall.conducted >= overall.planned,
    hasPlannedClasses: overall.planned > 0,
  });
  const rotationStatus = (r: { start: string; end: string }) => {
    const s = new Date(r.start + 'T12:00:00');
    const e = new Date(r.end + 'T12:00:00');
    if (today > e) return 'Completed';
    if (today >= s && today <= e) return 'Ongoing';
    return 'Upcoming';
  };

  return (
    <Layout>
      <div className="space-y-4 pb-8 scroll-reachability">
        {/* ═══════════ WEEKLY TIME TABLE ═══════════ */}
        <StickySectionLabel label="Academic" stackIndex={0} zClass="z-40" />
        <section className="bg-card border border-border rounded-2xl p-3.5 shadow-sm space-y-3">
          {subjectMode === 'custom' && !hasCustomSchedule ? (
            <p className="text-xs text-muted-foreground text-center py-8">No custom schedule yet. Add Subjects in the Manage Tab.</p>
          ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-left border-collapse table-fixed" style={{ minWidth: `${40 + columns.length * 56}px` }}>
              <thead>
                <tr>
                  <th className="w-10 border border-border/40 px-1 py-1.5 text-[8px] font-bold text-muted-foreground text-center">DAY</th>
                  {columns.map(col => {
                    const h = columnHeader(col);
                    return (
                      <th key={col.id} className="border border-border/40 px-1 py-1.5 text-center align-top">
                        <div className={cn('font-bold text-foreground/80 whitespace-nowrap', dense ? 'text-[7px]' : 'text-[8px]')}>{h.nums}</div>
                        <div className={cn('text-muted-foreground font-semibold whitespace-nowrap', dense ? 'text-[6px]' : 'text-[7px]')}>{h.period}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {timetableGrid.map(row => {
                  const isToday = row.day === todayAbbr;
                  return (
                    <tr key={row.day}>
                      <td className={cn('border border-border/40 px-1.5 py-2 text-[10px] font-bold text-foreground text-center', isToday && 'bg-primary/15 dark:bg-primary/20 text-primary')}>
                        {row.day}
                      </td>
                      {row.cells.filter(cell => !cell.hidden).map(cell => cell.isHoliday ? (
                        <td key={cell.key} colSpan={cell.span} className={cn('border border-border/40 text-center text-[10px] font-bold text-muted-foreground tracking-[0.3em] py-4', isToday && 'bg-primary/15 dark:bg-primary/20')}>HOLIDAY</td>
                      ) : (
                        <td key={cell.key} colSpan={cell.span} rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined} className={cn('border border-border/40 p-1 text-center align-middle', cell.isRest && 'bg-muted/20', isToday && cell.rowspan <= 1 && 'bg-primary/15 dark:bg-primary/20')}>
                          {cell.subjects.length === 0 && cell.sgt.length === 0 ? (
                            <span className="text-muted-foreground/40 text-[9px]">—</span>
                          ) : cell.isRest ? (
                            <span className="text-[9px] font-bold text-muted-foreground">Rest</span>
                          ) : (
                            <span className="text-[9px] font-semibold leading-tight flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                              {cell.subjects.length > 0 && (
                                <span style={{ color: getSubjectColor(cell.subjects[0]) }}>
                                  {cell.subjects.map(shortenSubject).join(' / ')}
                                </span>
                              )}
                              {cell.sgt.map(n => (
                                <span key={n} className="inline-flex items-center gap-0.5" style={{ color: getSubjectColor(n) }}>
                                  {shortenSubject(n)}
                                  <span className="text-[6px] font-extrabold uppercase tracking-wider px-1 py-px rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/30">SGT</span>
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </section>

        {/* ═══════════ CLINICAL / WARD ROTATION WHEEL ═══════════ */}
        <StickySectionLabel label="Clinical / Ward Rotation" stackIndex={1} zClass="z-40" />
        <section className="bg-card border border-border rounded-2xl p-3.5 shadow-sm space-y-2">
          {totalItems === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No Rotations scheduled.</p>
          ) : (
            <div
              ref={wheelRef}
              className="relative overflow-hidden select-none py-2"
              style={{ touchAction: 'pan-y' }}
              onPointerDown={onDown}
              onKeyDown={onWheelKeyDown}
              tabIndex={0}
              role="region"
              aria-label="Clinical and ward rotation wheel"
              aria-roledescription="carousel"
            >
              <div
                className="relative h-36"
                style={{ transform: `translateX(${offset}px)`, transition: settling && !dragging.current ? 'transform 0.25s ease-out' : 'none' }}
              >
                {wheelItems.map(({ item, position }) => {
                  const status = rotationStatus(item);
                  const posCls = position === 'center'
                    ? 'left-1/2 -translate-x-1/2 z-10 scale-100 opacity-100'
                    : position === 'left'
                      ? 'left-1/2 -translate-x-[115%] scale-90 opacity-50'
                      : 'left-1/2 translate-x-[15%] scale-90 opacity-50';
                  return (
                    <div key={position} className={cn('absolute top-2 w-[75%] rounded-3xl border p-4 text-center transition-all', posCls, status === 'Ongoing' ? 'border-violet-500/60 shadow-[0_0_25px_rgba(139,92,246,0.25)]' : 'border-border/60', 'bg-card')}>
                      <p className="text-base font-extrabold text-foreground truncate" style={{ color: getSubjectColor(item.name) }}>{item.name}</p>
                      <p className="text-xs text-muted-foreground font-medium mt-1">{formatISODateDDMMYY(item.start)} – {formatISODateDDMMYY(item.end)}</p>
                      <span className={cn('inline-block mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full border', status === 'Ongoing' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : status === 'Completed' ? 'bg-muted/40 text-muted-foreground border-border/50' : 'bg-primary/10 text-primary border-primary/20')}>
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button type="button" className="action-button action-button--neutral action-button--compact" onPointerDown={e => e.stopPropagation()} onClick={() => moveWheel(-1)} aria-label="Previous rotation">Previous</button>
                <p className="text-[9px] text-muted-foreground/60 text-center italic">Drag to browse · use arrow keys or Home/End</p>
                <button type="button" className="action-button action-button--neutral action-button--compact" onPointerDown={e => e.stopPropagation()} onClick={() => moveWheel(1)} aria-label="Next rotation">Next</button>
              </div>
            </div>
          )}
        </section>

        <StickySectionLabel label="Statistics" stackIndex={2} zClass="z-40" />

        {/* ═══════════ STATISTICS ═══════════ */}
        <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-3.5 space-y-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Overall — every subject & ward combined</p>
              <div className="flex items-center gap-3">
                <div className="relative w-11 h-11 shrink-0">
                  <svg width="44" height="44" className="transform -rotate-90">
                    <circle cx="22" cy="22" r="18" strokeWidth="4" className="text-muted/20" stroke="currentColor" fill="transparent" />
                    <circle cx="22" cy="22" r="18" strokeWidth="4" stroke={overallHex} strokeDasharray={2 * Math.PI * 18} strokeDashoffset={(2 * Math.PI * 18) * (1 - Math.min(100, overall.pct) / 100)} strokeLinecap="round" fill="transparent" />
                  </svg>
                  <span className={cn('absolute inset-0 flex items-center justify-center text-[9px] font-extrabold', overallColor)}>{overall.pct.toFixed(0)}%</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[10px] text-muted-foreground font-medium">
                    Attended <strong className="text-foreground">{overall.att}</strong> · Missed <strong className="text-foreground">{overall.mis}</strong> · Off <strong className="text-foreground">{overall.off}</strong>
                  </p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">of every class that happened — lectures + wards together</p>
                </div>
                <span className="text-[9px] font-extrabold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">Can miss {overall.canMiss}</span>
              </div>
            </div>
            {rotation && (
              <div className="border-t border-border/40 pt-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1.5">Current posting · info only</p>
                <div className="flex justify-between text-[9px] font-semibold text-muted-foreground mb-1">
                  <span className="truncate">Where you are today: <strong className="text-foreground">{rotation.name}</strong></span>
                  <span>{rotation.done}/{rotation.total} days</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${rotation.pct}%` }} />
                </div>
                <p className="text-[8px] text-muted-foreground/60 mt-1">This line does not change the numbers above.</p>
              </div>
            )}
            <div className="border-t border-border/40 pt-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Last 6 Months</p>
              <div className="flex items-end justify-between gap-1.5 h-14">
                {months.map((m, i) => {
                  const monthColor = m.pct === null ? undefined : pctColor(m.pct, target, { isFinished: true, hasPlannedClasses: true });
                  return (
                    <button key={m.key} type="button" onClick={() => setMonthSel(prev => prev === i ? null : i)} className="flex-1 flex flex-col items-center gap-1 cursor-pointer">
                      <div className={cn('w-full rounded-t-md transition-all', monthSel === i ? 'bg-primary' : m.pct === null ? 'bg-muted/30' : '')} style={{ height: m.pct === null ? 4 : `${Math.max(8, m.pct * 0.4)}px`, ...(monthSel === i || !monthColor ? {} : { backgroundColor: monthColor }) }} />
                      <span className="text-[8px] font-bold text-muted-foreground">{m.label}</span>
                    </button>
                  );
                })}
              </div>
              {monthSel !== null && months[monthSel] && (
                <p className="text-[10px] text-foreground font-semibold text-center mt-2">
                  {months[monthSel].label}: {months[monthSel].pct === null ? 'no classes' : `${months[monthSel].pct.toFixed(0)}% (${months[monthSel].att}/${months[monthSel].att + months[monthSel].mis})`}
                </p>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-rose-500/15 bg-rose-500/[0.03] p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-500 mb-2">Needs Attention</p>
              {attention.length === 0 ? (
                <p className="text-[10px] text-emerald-500 font-semibold">All remaining subjects on track.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {attention.map(a => (
                    <button key={a.name} type="button" onClick={() => setAttnOpen(o => !o)} className="action-button action-button--danger px-2 py-1 text-[9px]">
                      <span className="mr-1">{shortenSubject(a.name)}</span>
                      <span className={cn('inline-flex items-center rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider', categoryBadgeClass(a.category))}>{a.category}</span>
                      <span className="ml-1">{a.pct.toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              )}
              {attnOpen && attention.length > 0 && (
                <div className="mt-2 space-y-1">
                  {attention.map(a => (
                    <p key={a.name} className="text-[10px] text-muted-foreground">
                      <strong className="text-foreground">{a.name}</strong> <span className="text-[9px] font-bold uppercase tracking-wider text-primary">({a.category})</span> — attend next <strong className="text-rose-500">{a.needed}</strong> to recover.
                    </p>
                  ))}
                </div>
              )}
              </div>

              {/* ── NEW: Prediction Section ── */}
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-500 mb-2">Maximum Possible Attendance</p>
              {predictionItems.length === 0 ? (
                <p className="text-[10px] text-muted-foreground font-semibold">No remaining classes for prediction.</p>
              ) : (
                <div className="space-y-1.5">
                  {predictionItems.map(item => {
                    const maxStatus = getAttendanceStatus(item.maxPossiblePct, target, { hasPlannedClasses: item.planned > 0 });
                    const maxColor = maxStatus === 'green' ? 'text-success' : maxStatus === 'yellow' ? 'text-warning' : maxStatus === 'neutral' ? 'text-muted-foreground' : 'text-destructive';
                    return (
                      <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 bg-muted/20 rounded-lg px-3 py-1.5">
                        <span className="min-w-0 text-xs font-bold text-foreground truncate" style={{ color: getSubjectColor(item.name) }}>{shortenSubject(item.name)} <span className={cn('ml-1 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider align-middle', categoryBadgeClass(item.category))}>{item.category}</span></span>
                        <div className="contents">
                          <span className="text-[10px] text-muted-foreground">Now {item.currentPct.toFixed(0)}%</span>
                          <span className="text-[10px] text-muted-foreground">Left {item.remaining}</span>
                          <span className={cn('text-xs font-extrabold', maxColor)}>Max {item.maxPossiblePct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}