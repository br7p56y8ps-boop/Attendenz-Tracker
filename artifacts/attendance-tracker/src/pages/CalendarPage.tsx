import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Grid } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAYS_ORDER = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_INDEX_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${pad2(m+1)}-${pad2(d)}`; }

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return 0;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseSelectionKey(key: string): { date: string; label: string } | null {
  const date = key.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rest = key.slice(11);
  const parts = rest.split('-');
  const labelParts = parts.slice(0, -1);
  const label = labelParts.join(' ').replace(/^ward /, '').trim() || rest;
  return { date, label };
}

type DayRecord = { label: string; type: 'attended' | 'missed' | 'off' };

// ── Subject Colors ──────────────────────────────────────────────────────────
const SUBJECT_COLORS_PALETTE = [
  '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
  '#84CC16', '#D946EF', '#0EA5E9', '#F43F5E', '#A855F7', '#EAB308'
];

const colorAssignmentMap: Record<string, string> = {};

function getSubjectColor(name: string): string {
  if (colorAssignmentMap[name]) return colorAssignmentMap[name];
  const usedColors = new Set(Object.values(colorAssignmentMap));
  let available = SUBJECT_COLORS_PALETTE.find(c => !usedColors.has(c));
  if (!available) {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    available = SUBJECT_COLORS_PALETTE[hash % SUBJECT_COLORS_PALETTE.length];
  }
  colorAssignmentMap[name] = available;
  return available;
}

// ── Date formatting ─────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

// ── Shorten subject names ──────────────────────────────────────────────────
function shortenSubject(name: string) {
  const map: Record<string, string> = {
    'Surgery': 'Surg.',
    'Obstetrics & Gynaecology': 'Obs & Gyn.',
    'Pediatrics': 'Peds.',
    'Orthopedics': 'Ortho.',
    'Ophthalmology': 'Ophtha.',
    'Otolaryngology': 'ENT',
    'Dermatology': 'Derm.',
    'Psychiatry': 'Psych.',
    'Physical Medicine': 'PMR',
    'Radiology': 'Radio.',
    'Radiotherapy': 'RadioT.',
    'Nuclear Medicine': 'Nuc Med.',
    'Neurosurgery': 'NeuroS.',
    'Pediatric Surgery': 'Peds Surg.',
    'Burn & Plastic Surgery': 'Plastic S.',
    'Internal Medicine': 'Medicine',
    'Phase Integrated Teaching': 'Phase Integrated',
    'Departmental Integrated Teaching': 'Dept. Integrated'
  };
  return map[name] || name;
}

export default function CalendarPage() {
  const { homeSelections } = useAttendance();
  const { customSubjects, customWards, subjectMode, presetTimetable, getCurrentPresetWard, presetWardSchedule } = useCustomData();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [logSelectedDate, setLogSelectedDate] = useState<string | null>(null);

  const recordMap = useMemo(() => {
    const map: Record<string, DayRecord[]> = {};
    for (const [key, sel] of Object.entries(homeSelections)) {
      const parsed = parseSelectionKey(key);
      if (!parsed) continue;
      if (!map[parsed.date]) map[parsed.date] = [];
      map[parsed.date].push({ label: parsed.label, type: sel });
    }
    return map;
  }, [homeSelections]);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setLogSelectedDate(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setLogSelectedDate(null);
  };

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const getDotColor = (records: DayRecord[]) => {
    if (!records || records.length === 0) return null;
    const types = records.map(r => r.type);
    if (types.every(t => t === 'off')) return 'bg-amber-500';
    if (types.some(t => t === 'missed')) return 'bg-rose-500';
    return 'bg-emerald-500';
  };

  const getCellBg = (records: DayRecord[]) => {
    if (!records || records.length === 0) return '';
    const types = records.map(r => r.type);
    if (types.every(t => t === 'off')) return 'bg-amber-50/80 dark:bg-amber-950/30';
    if (types.some(t => t === 'missed')) return 'bg-rose-50/80 dark:bg-rose-950/30';
    return 'bg-emerald-50/80 dark:bg-emerald-950/30';
  };

  const getLogBorderColor = (records: DayRecord[]): string => {
    if (!records || records.length === 0) return 'var(--border)';
    const types = records.map(r => r.type);
    if (types.every(t => t === 'off')) return '#F59E0B';
    if (types.some(t => t === 'missed')) return '#EF4444';
    return '#10B981';
  };

  const monthlyStats = useMemo(() => {
    let totalClasses = 0, attended = 0, missed = 0, off = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStr(viewYear, viewMonth, day);
      const records = recordMap[dateStr];
      if (records) {
        records.forEach(r => {
          totalClasses++;
          if (r.type === 'attended') attended++;
          else if (r.type === 'missed') missed++;
          else if (r.type === 'off') off++;
        });
      }
    }
    const pct = totalClasses > 0 ? (attended / totalClasses) * 100 : 0;
    return { totalClasses, attended, missed, off, pct };
  }, [recordMap, viewYear, viewMonth, daysInMonth]);

  const logSelectedDayLabel = logSelectedDate
    ? new Date(logSelectedDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';

  // ── Clinical Rotations helpers ──────────────────────────────────────────────
  const allRotations = useMemo(() => {
    const list: { name: string; start: string; end: string }[] = [];
    if (subjectMode === 'preloaded') {
      presetWardSchedule.forEach(ws => {
        list.push({ name: ws.ward, start: ws.start, end: ws.end });
      });
    }
    customWards.forEach(w => {
      list.push({ name: w.name, start: w.startDate, end: w.endDate });
    });
    list.sort((a, b) => a.start.localeCompare(b.start));
    return list;
  }, [subjectMode, customWards, presetWardSchedule]);

  const currentIndex = useMemo(() => {
    if (allRotations.length === 0) return 0;
    const now = new Date();
    for (let i = 0; i < allRotations.length; i++) {
      const r = allRotations[i];
      const start = new Date(r.start + 'T12:00:00');
      const end = new Date(r.end + 'T12:00:00');
      if (now >= start && now <= end) return i;
    }
    for (let i = 0; i < allRotations.length; i++) {
      const r = allRotations[i];
      const start = new Date(r.start + 'T12:00:00');
      if (now < start) return i;
    }
    return allRotations.length - 1;
  }, [allRotations]);

  // ── Wheel State ─────────────────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(currentIndex);
  const [offset, setOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const lastX = useRef(0);
  const velocity = useRef(0);
  const momentumId = useRef<number | null>(null);
  const currentOffset = useRef(0);

  const totalItems = allRotations.length;
  const wrapIndex = (idx: number) => ((idx % totalItems) + totalItems) % totalItems;

  useEffect(() => {
    setActiveIndex(currentIndex);
  }, [currentIndex]);

  const startMomentum = () => {
    if (momentumId.current) cancelAnimationFrame(momentumId.current);
    const step = () => {
      if (Math.abs(velocity.current) < 0.5) {
        const cardStep = 240;
        const rawOffset = currentOffset.current;
        const snapped = Math.round(rawOffset / cardStep) * cardStep;
        setOffset(snapped);
        const direction = snapped < 0 ? 1 : -1;
        if (Math.abs(snapped) > 10) {
          const newIndex = wrapIndex(activeIndex + direction);
          setActiveIndex(newIndex);
          setOffset(0);
          currentOffset.current = 0;
        }
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
    if (totalItems === 0) return;
    isDragging.current = true;
    if (momentumId.current) {
      cancelAnimationFrame(momentumId.current);
      momentumId.current = null;
    }
    startX.current = e.clientX;
    lastX.current = e.clientX;
    velocity.current = 0;
    currentOffset.current = offset;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || totalItems === 0) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    velocity.current = dx * 0.5;
    currentOffset.current += dx;
    setOffset(currentOffset.current);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current || totalItems === 0) return;
    isDragging.current = false;
    if (Math.abs(velocity.current) > 20) {
      startMomentum();
    } else {
      const cardStep = 240;
      const rawOffset = currentOffset.current;
      const snapped = Math.round(rawOffset / cardStep) * cardStep;
      if (Math.abs(snapped) > 10) {
        const direction = snapped < 0 ? 1 : -1;
        const newIndex = wrapIndex(activeIndex + direction);
        setActiveIndex(newIndex);
        setOffset(0);
        currentOffset.current = 0;
      } else {
        setOffset(0);
        currentOffset.current = 0;
      }
    }
  };

  const getWheelItems = () => {
    if (totalItems === 0) return [];
    const centerIdx = wrapIndex(activeIndex);
    const leftIdx = wrapIndex(centerIdx - 1);
    const rightIdx = wrapIndex(centerIdx + 1);
    return [
      { item: allRotations[leftIdx], position: 'left' },
      { item: allRotations[centerIdx], position: 'center' },
      { item: allRotations[rightIdx], position: 'right' },
    ];
  };

  const wheelItems = getWheelItems();

  // ── Get scheduled classes for logbook ──────────────────────────────────────
  const getScheduledClassesForDate = (date: Date) => {
    const dayIndex = date.getDay();
    const todayAbbr = DAYS_SHORT[dayIndex];
    const dateStr = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

    const customWard = customWards.find(w => dateStr >= w.startDate && dateStr <= w.endDate);
    const presetWardObj = subjectMode === 'preloaded' ? getCurrentPresetWard(date) : null;
    const currentWard = customWard ? customWard.name : (presetWardObj ? presetWardObj.ward : null);
    const isWardHoliday = currentWard === 'Holiday' || todayAbbr === 'Fri';

    let list: Array<{ name: string; time: string; isWard: boolean; sessionId: string }> = [];

    if (subjectMode === 'preloaded') {
      const schedule = presetTimetable[dayIndex] || [];
      schedule.forEach((slot, idx) => {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') {
          if (!isWardHoliday && currentWard) {
            const effectiveTime = slot.type === 'ward_replacement'
              ? (presetWardObj?.eveningTime || slot.time)
              : (presetWardObj?.morningTime || slot.time);
            list.push({
              name: currentWard,
              time: effectiveTime,
              isWard: true,
              sessionId: String(idx)
            });
          }
        } else {
          slot.subjects.forEach((sub, subIdx) => {
            list.push({
              name: sub,
              time: slot.time,
              isWard: false,
              sessionId: `${idx}-${subIdx}`
            });
          });
        }
      });
    } else {
      if (currentWard && !isWardHoliday) {
        list.push({
          name: currentWard,
          time: customWard?.morningTime || "Morning Ward",
          isWard: true,
          sessionId: "custom-ward-am"
        });
        list.push({
          name: currentWard,
          time: customWard?.eveningTime || "Evening Ward",
          isWard: true,
          sessionId: "custom-ward-pm"
        });
      }
      customSubjects.forEach(s => {
        if (s.schedules && s.schedules.length > 0) {
          const daySchedules = s.schedules.filter(sch => sch.day === todayAbbr);
          daySchedules.forEach((sch, sIdx) => {
            list.push({
              name: s.name,
              time: sch.time,
              isWard: false,
              sessionId: `custom-${s.id}-${sIdx}`
            });
          });
        } else if (s.days) {
          const assigned = s.days.split(',').map(d => d.trim());
          if (assigned.includes(todayAbbr)) {
            list.push({
              name: s.name,
              time: s.time || 'Time not set',
              isWard: false,
              sessionId: `custom-${s.id}`
            });
          }
        }
      });
    }
    return list;
  };

  const getAttendanceStatus = (dateStr: string, cl: { name: string; sessionId: string }) => {
    const candidateKeys = [
      `${dateStr}-${cl.sessionId}`,
      `${dateStr}_${cl.sessionId}`,
      `${dateStr}-${cl.name}`,
      `${dateStr}_${cl.name}`,
      `${dateStr}-ward-${cl.name}`,
      `${dateStr}_ward_${cl.name}`
    ];
    for (const k of candidateKeys) {
      if (homeSelections[k]) return homeSelections[k];
    }
    const dayRecords = recordMap[dateStr];
    if (dayRecords) {
      const match = dayRecords.find(r =>
        r.label.toLowerCase() === cl.name.toLowerCase() ||
        r.label.toLowerCase() === shortenSubject(cl.name).toLowerCase()
      );
      if (match) return match.type;
    }
    return 'none';
  };

  const logSelectedDateClasses = useMemo(() => {
    if (!logSelectedDate) return [];
    return getScheduledClassesForDate(new Date(logSelectedDate + 'T12:00:00'));
  }, [logSelectedDate, customSubjects, customWards, subjectMode]);

  // ── Weekly Timetable ──────────────────────────────────────────────────────
  const PRESET_COLUMNS = ['07:00–08:00', '08:30–09:30', '11:30–12:00', '12:00–01:00', '01:00–02:00'];

  const uniqueTimes = useMemo(() => {
    if (subjectMode === 'preloaded') return PRESET_COLUMNS;
    const timesSet = new Set<string>();
    customSubjects.forEach(s => {
      if (s.schedules && s.schedules.length > 0) {
        s.schedules.forEach(sch => {
          if (sch.time && sch.time.trim()) timesSet.add(sch.time.trim());
        });
      } else if (s.days && s.time) {
        if (s.time.trim()) timesSet.add(s.time.trim());
      }
    });
    return Array.from(timesSet).sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));
  }, [subjectMode, customSubjects]);

  const timetableGrid = useMemo(() => {
    const grid: Record<string, Record<string, string[]>> = {};
    DAYS_ORDER.forEach(day => {
      grid[day] = {};
      uniqueTimes.forEach(t => grid[day][t] = []);
    });

    if (subjectMode === 'preloaded') {
      DAYS_ORDER.forEach((day) => {
        const dayIdx = DAY_INDEX_MAP[day];
        const slots = presetTimetable[dayIdx] || [];
        slots.forEach(slot => {
          if (slot.type !== 'ward' && slot.type !== 'ward_replacement') {
            const time = slot.time.trim();
            if (time === '07:00–08:00') grid[day]['07:00–08:00'].push(...slot.subjects);
            else if (time === '08:30–09:30') grid[day]['08:30–09:30'].push(...slot.subjects);
            else if (time === '11:30 AM–2:30 PM') {
              grid[day]['11:30–12:00'].push(...slot.subjects);
              grid[day]['12:00–01:00'].push(...slot.subjects);
              grid[day]['01:00–02:00'].push(...slot.subjects);
            }
            else if (time === '12:00–01:00') grid[day]['12:00–01:00'].push(...slot.subjects);
            else if (time === '12:00–02:00') {
              grid[day]['12:00–01:00'].push(...slot.subjects);
              grid[day]['01:00–02:00'].push(...slot.subjects);
            }
          }
        });
      });
    } else {
      customSubjects.forEach(s => {
        if (s.schedules && s.schedules.length > 0) {
          s.schedules.forEach(sch => {
            const t = sch.time.trim();
            if (grid[sch.day] && grid[sch.day][t]) grid[sch.day][t].push(s.name);
          });
        } else if (s.days) {
          const assigned = s.days.split(',').map(d => d.trim());
          const t = s.time ? s.time.trim() : 'Time not set';
          assigned.forEach(day => {
            if (grid[day] && grid[day][t]) {
              grid[day][t].push(s.name);
            }
          });
        }
      });
    }
    return grid;
  }, [subjectMode, customSubjects, presetTimetable, uniqueTimes]);

  const timetableWithSpans = useMemo(() => {
    const processed: Record<string, Array<{ time: string; subjects: string[]; span: number; skip: boolean }>> = {};
    DAYS_ORDER.forEach(day => {
      processed[day] = [];
      const skipSet = new Set<number>();
      uniqueTimes.forEach((time, timeIdx) => {
        if (skipSet.has(timeIdx)) {
          processed[day].push({ time, subjects: [], span: 0, skip: true });
          return;
        }
        const currentSubs = timetableGrid[day][time] || [];
        let span = 1;
        if (currentSubs.length > 0) {
          for (let i = timeIdx + 1; i < uniqueTimes.length; i++) {
            const nextSubs = timetableGrid[day][uniqueTimes[i]] || [];
            if (currentSubs.length === nextSubs.length && currentSubs.every((s, idx) => s === nextSubs[idx])) {
              span++;
              skipSet.add(i);
            } else break;
          }
        }
        processed[day].push({ time, subjects: currentSubs, span, skip: false });
      });
    });
    return processed;
  }, [timetableGrid, uniqueTimes]);

  const isDayHoliday = (day: string) => {
    if (subjectMode === 'preloaded') return day === 'Fri';
    return uniqueTimes.every(t => !timetableGrid[day][t] || timetableGrid[day][t].length === 0);
  };

  const getLogMessageBorderColor = (dateStr: string): string => {
    const records = recordMap[dateStr];
    return getLogBorderColor(records);
  };

  const showWheel = allRotations.length > 0;

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 pb-8"
      >
        {/* ── 1. Interactive Logbook ── */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
            <CalendarIcon className="w-3.5 h-3.5 text-primary" />
            <span>Interactive Logbook</span>
          </h3>
          <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <button onClick={prevMonth} className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-foreground text-sm">{MONTHS[viewMonth]} {viewYear}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 pt-3 pb-1">
              <div className="bg-muted/30 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  This Month: <span className="text-foreground font-bold">{monthlyStats.totalClasses}</span> classes
                </span>
                <span className="text-muted-foreground font-medium">
                  Attended: <span className="text-emerald-600 font-bold">{monthlyStats.attended}</span>
                  <span className="text-muted-foreground/40 mx-1">·</span>
                  <span className="text-foreground font-bold">
                    {monthlyStats.totalClasses > 0 ? monthlyStats.pct.toFixed(0) : 0}%
                  </span>
                </span>
              </div>
            </div>
            <div className="flex gap-3 px-4 justify-center py-1.5 border-b border-border/40 bg-muted/10 flex-wrap">
              {[
                { color: '#10B981', label: 'Attended' },
                { color: '#EF4444', label: 'Missed' },
                { color: '#F59E0B', label: 'Off day' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-muted-foreground font-medium">{l.label}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 px-2 pt-2 pb-0.5">
              {DAYS_SHORT.map(d => (
                <div key={d} className="text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 py-0.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 px-2 pb-3 gap-0.5">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = toDateStr(viewYear, viewMonth, day);
                const records = recordMap[dateStr];
                const dotColor = getDotColor(records);
                const statusCellBg = getCellBg(records);
                const borderColor = getLogBorderColor(records);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === logSelectedDate;
                return (
                  <button
                    key={day}
                    onClick={() => setLogSelectedDate(isSelected ? null : dateStr)}
                    className={cn(
                      'flex flex-col items-center justify-center h-8 rounded-lg transition-all text-xs font-medium relative border',
                      statusCellBg,
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/15 text-primary font-bold shadow-sm'
                        : isToday
                          ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-background bg-primary/5 text-primary font-bold'
                          : 'hover:bg-muted/60 text-foreground'
                    )}
                    style={{ borderColor: borderColor || 'var(--border)' }}
                  >
                    <span className="text-[11px]">{day}</span>
                    {dotColor && (
                      <span className={cn('absolute bottom-1 w-1 h-1 rounded-full', dotColor)} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Logbook Selected Date View ── */}
        <AnimatePresence mode="wait">
          {logSelectedDate && (
            <motion.div
              key="log_selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div
                className="flex items-center justify-between bg-muted/30 p-3.5 rounded-2xl border"
                style={{ borderColor: getLogMessageBorderColor(logSelectedDate) }}
              >
                <div>
                  <p className="text-sm font-bold text-foreground">{logSelectedDayLabel}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Conducted Subjects & Status Log</p>
                </div>
                <button
                  onClick={() => setLogSelectedDate(null)}
                  className="px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <X className="w-3 h-3" />
                  <span>Close</span>
                </button>
              </div>
              {logSelectedDateClasses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 bg-card border border-border rounded-3xl p-6 shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-2xl">🌴</div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Holiday / Rest Day</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">No lectures or clinical ward postings were scheduled for this date.</p>
                  </div>
                  <span className="px-3 py-1 bg-amber-500/15 text-amber-500 font-bold text-[10px] rounded-full uppercase tracking-wider">Holiday</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                    Conducted Classes & Status ({logSelectedDateClasses.length})
                  </div>
                  {logSelectedDateClasses.map((cl, idx) => {
                    const status = getAttendanceStatus(logSelectedDate, cl);
                    const color = getSubjectColor(cl.name);
                    const bgColor = `${color}15`;
                    return (
                      <div
                        key={`${logSelectedDate}-${cl.name}-${cl.sessionId}-${idx}`}
                        className="border border-border rounded-2xl p-3.5 flex items-center justify-between shadow-sm"
                        style={{ backgroundColor: bgColor }}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm" style={{ color }}>{cl.name}</span>
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                              cl.isWard ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                              {cl.isWard ? "Ward" : "Lecture"}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{cl.time}</p>
                        </div>
                        <div className="shrink-0 ml-3">
                          {status === 'attended' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Present
                            </span>
                          )}
                          {status === 'missed' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-rose-500/15 text-rose-600 border border-rose-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Missed
                            </span>
                          )}
                          {status === 'off' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Off Day
                            </span>
                          )}
                          {status === 'none' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                              Not Recorded
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 2. Weekly Time Table ── */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
            <Grid className="w-3.5 h-3.5 text-primary" />
            <span>Weekly Time Table</span>
          </h3>

          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            {/* Academic Table */}
            <div className="p-3 border-b border-border/60">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 mb-2 text-center">
                Academic
              </h4>
              <div className="overflow-x-auto border border-border rounded-none">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="p-1 px-1.5 font-bold text-[8px] uppercase tracking-wider text-muted-foreground/70 border-r border-border w-[40px]">Day</th>
                      {uniqueTimes.length === 0 ? (
                        <th className="p-1 px-1.5 font-bold text-[8px] uppercase tracking-wider text-muted-foreground/70">Schedule</th>
                      ) : (
                        uniqueTimes.map(t => (
                          <th key={t} className="p-1 font-bold text-[8px] uppercase tracking-wider text-muted-foreground/70 text-center border-r border-border/40 last:border-0">
                            <span className="bg-muted/40 px-1.5 py-0.5 rounded-full text-[8px]">{t}</span>
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {DAYS_ORDER.map((day) => {
                      const dayIdx = DAY_INDEX_MAP[day];
                      const isToday = today.getDay() === dayIdx;
                      const rowData = timetableWithSpans[day];
                      const holiday = isDayHoliday(day);

                      return (
                        <tr key={day} className={cn(isToday ? "bg-primary/5" : "hover:bg-muted/10")}>
                          <td className="p-1 px-1.5 font-bold text-foreground border-r border-border h-9">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px]">{day}</span>
                              {isToday && <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />}
                            </div>
                          </td>
                          {uniqueTimes.length === 0 ? (
                            <td className="p-1 text-muted-foreground text-[8px] italic">No lectures</td>
                          ) : holiday ? (
                            <td colSpan={uniqueTimes.length} className="p-1.5 text-center font-bold text-[9px] uppercase tracking-wider text-muted-foreground/40 bg-muted/5">
                              🌴 Holiday
                            </td>
                          ) : (
                            rowData.map((cell, cIdx) => {
                              const timeSlot = cell.time;
                              if (subjectMode === 'preloaded' && timeSlot === '08:30–09:30' && day === 'Thu') {
                                const color = getSubjectColor('Small Group Teaching');
                                return (
                                  <td key={cIdx} className="p-0.5 text-center align-middle border-r border-border/40 last:border-0">
                                    <span className="text-[8px] font-semibold" style={{ color }}>Small Group Teaching</span>
                                  </td>
                                );
                              }
                              if (subjectMode === 'preloaded' && timeSlot === '11:30–12:00') {
                                if (day === 'Mon') {
                                  return (
                                    <td key={cIdx} rowSpan={4} className="p-0.5 text-center align-middle border-r border-border/40 last:border-0 bg-muted/10">
                                      <span className="text-[8px] font-semibold text-muted-foreground/40">Rest</span>
                                    </td>
                                  );
                                }
                                if (['Tue','Wed','Thu'].includes(day)) return null;
                                if (day === 'Sat') {
                                  return (
                                    <td key={cIdx} className="p-0.5 text-center align-middle border-r border-border/40 last:border-0 bg-muted/10">
                                      <span className="text-[8px] font-semibold text-muted-foreground/40">Rest</span>
                                    </td>
                                  );
                                }
                              }
                              if (subjectMode === 'preloaded' && timeSlot === '01:00–02:00') {
                                if (day === 'Mon') {
                                  const color = getSubjectColor('Small Group Teaching');
                                  return (
                                    <td key={cIdx} rowSpan={3} className="p-0.5 text-center align-middle border-r border-border/40 last:border-0">
                                      <span className="text-[8px] font-semibold" style={{ color }}>Small Group Teaching</span>
                                    </td>
                                  );
                                }
                                if (['Tue','Wed'].includes(day)) return null;
                                if (day === 'Sat') {
                                  const color = getSubjectColor('Small Group Teaching');
                                  return (
                                    <td key={cIdx} className="p-0.5 text-center align-middle border-r border-border/40 last:border-0">
                                      <span className="text-[8px] font-semibold" style={{ color }}>Small Group Teaching</span>
                                    </td>
                                  );
                                }
                              }
                              if (cell.skip) return null;
                              const subjectName = cell.subjects.length > 0 ? cell.subjects[0] : '';
                              const color = subjectName ? getSubjectColor(subjectName) : '';
                              return (
                                <td
                                  key={cIdx}
                                  colSpan={cell.span}
                                  className="p-0.5 text-center border-r border-border/40 last:border-0 align-middle"
                                >
                                  {cell.subjects.length === 0 ? (
                                    <span className="text-muted-foreground/10 text-[8px]">—</span>
                                  ) : (
                                    <div className="flex items-center justify-center min-h-[28px] w-full px-0.5">
                                      <span
                                        className="text-[8px] font-medium leading-tight"
                                        style={{ color: color || 'var(--muted-foreground)' }}
                                      >
                                        {cell.subjects.map(s => shortenSubject(s)).join(' / ')}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Clinical/Ward Rotation Wheel */}
            {showWheel && (
              <div className="p-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 mb-2 text-center">
                  Clinical / Ward Rotation
                </h4>
                <div
                  ref={containerRef}
                  className="relative w-full h-48 rounded-2xl border border-border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden select-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  style={{ touchAction: 'none' }}
                >
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                      transform: `translateX(${offset}px)`,
                      transition: isDragging.current ? 'none' : 'transform 0.05s linear',
                    }}
                  >
                    {wheelItems.map(({ item, position }, idx) => {
                      const isCenter = position === 'center';
                      const color = getSubjectColor(item.name);
                      const now = new Date();
                      const start = new Date(item.start + 'T12:00:00');
                      const end = new Date(item.end + 'T12:00:00');
                      const isActive = now >= start && now <= end;
                      const isPast = now > end;
                      const isFuture = now < start;

                      let statusLabel = '';
                      let statusColor = '';
                      if (isActive) { statusLabel = 'Ongoing'; statusColor = '#10B981'; }
                      else if (isPast) { statusLabel = 'Completed'; statusColor = '#6B7280'; }
                      else { statusLabel = 'Upcoming'; statusColor = '#3B82F6'; }

                      const leftPos = isCenter ? '50%' : (position === 'left' ? 'calc(50% - 150px)' : 'calc(50% + 150px)');
                      const transform = isCenter ? 'translateX(-50%)' : 'translateX(-50%) scale(0.85)';
                      const width = isCenter ? '260px' : '220px';
                      const opacity = isCenter ? 1 : 0.6;
                      const zIndex = isCenter ? 20 : 5;
                      const borderColor = isCenter ? color : 'var(--border)';
                      const boxShadow = isCenter ? `0 0 40px ${color}30` : 'none';

                      return (
                        <div
                          key={`${item.start}-${item.name}-${idx}`}
                          className="absolute top-1/2 p-4 rounded-2xl border-2 bg-card/90 backdrop-blur-sm text-center transition-all duration-300"
                          style={{
                            left: leftPos,
                            transform: `translateY(-50%) ${transform}`,
                            width,
                            opacity,
                            zIndex,
                            borderColor,
                            boxShadow,
                            pointerEvents: isCenter ? 'auto' : 'none',
                          }}
                        >
                          <div
                            className={cn(
                              'font-bold text-lg truncate',
                              isCenter ? 'text-foreground' : 'text-muted-foreground'
                            )}
                            style={{ color: isCenter ? color : undefined }}
                          >
                            {item.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDate(item.start)} – {formatDate(item.end)}
                          </div>
                          <div className="flex justify-center gap-2 mt-2">
                            <span
                              className="text-[10px] font-bold px-3 py-0.5 rounded-full"
                              style={{
                                backgroundColor: statusColor + '20',
                                color: statusColor,
                              }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* No swipe hint – removed */}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </Layout>
  );
}