import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HomeCard } from '@/components/HomeCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useLocation } from 'wouter';
import { cn, rangeStartMinutes } from '@/lib/utils';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { PRESET_PARENTS } from '@/lib/constants';
import { ArrowUpCircle, X, MoonStar, Coffee, BookOpen } from 'lucide-react';

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

export default function Home() {
  const today = new Date();
  const todayStr = toDateString(today);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const { customSubjects, customWards, userAddedSubjects, subjectMode, presetTimetable, getCurrentPresetWard } = useCustomData();
  const { homeSelections } = useAttendance();
  const [, setLocation] = useLocation();

  /* ── Update notice ── */
  const [installedVersion] = useState<string>(() => {
    const stored = localStorage.getItem('att_app_version') || APP_VERSION;
    if (compareVersions(APP_VERSION, stored) > 0) {
      localStorage.setItem('att_app_version', APP_VERSION);
      return APP_VERSION;
    }
    return stored;
  });

  const [pwaReady, setPwaReady] = useState<boolean>(() => localStorage.getItem('att_pwa_update_ready') === 'true');
  const [serverVersion] = useState<string>(() => localStorage.getItem('att_pwa_latest_version') || LATEST_VERSION);
  const [serverSummary] = useState<string>(() => localStorage.getItem('att_pwa_update_summary') || '');
  useEffect(() => {
    const on = () => setPwaReady(true);
    window.addEventListener('attendenz:update-ready', on);
    return () => window.removeEventListener('attendenz:update-ready', on);
  }, []);
  const isUpdateAvailable =
    compareVersions(serverVersion, installedVersion) > 0 ||
    (pwaReady && compareVersions(serverVersion, installedVersion) >= 0);
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
  const handlePointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
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
    for (const w of customWards) {
      if (selectedDateStr >= w.startDate && selectedDateStr <= w.endDate) return w;
    }
    return undefined;
  }, [customWards, selectedDateStr]);

  const presetWardObj = useMemo(() => {
    if (subjectMode === 'preloaded') return getCurrentPresetWard(selectedDate);
    return null;
  }, [subjectMode, getCurrentPresetWard, selectedDate]);

  const currentWard = customWard ? customWard.name : (presetWardObj ? presetWardObj.ward : null);
  const isWardHoliday = currentWard === 'Holiday';

  const todayCustomSubjects = useMemo(() => {
    if (subjectMode !== 'custom') return [];
    return customSubjects.flatMap(s => {
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
                sessionId: String(idx),
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
              sessionId: `${idx}-${subIdx}`,
            },
          });
        });
      });

      // SGT subjects
      userAddedSubjects.forEach(u => {
        if (u.subjectType !== 'allied' || !u.parentName || !PRESET_PARENTS.includes(u.parentName)) return;
        const anyU = u as any;
        if (anyU.startDate && anyU.endDate) {
          if (selectedDateStr < anyU.startDate || selectedDateStr > anyU.endDate) return;
        }
        const sch = (u.schedules || []).find((s: any) => s.day === selectedTodayAbbr);
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
        const sessionId = s.isSGT
          ? `${s.sgtId}:${selectedTodayAbbr}:${s.time}`
          : `custom-${s.id}`;
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

  return (
    <Layout
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
      <div className="-mt-6 flex h-[calc(100dvh-var(--app-header-height)-0.5rem)] min-h-0 flex-col">
        {/* ── Date Wheel ── */}
        <div className="sticky top-[calc(var(--app-header-height)+0.5rem)] z-40 bg-background pb-2 soft-entry-boundary">
          <div
            ref={wheelContainerRef}
            className="bg-background border border-border rounded-3xl shadow-md select-none overflow-hidden"
            style={{ height: '4rem' }}
          >
          <div
            className="relative w-full h-full"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
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
                    <span
                      className={cn(
                        "text-sm font-bold",
                        isCenter ? "text-primary-foreground" : "text-foreground",
                        !isCenter && "font-semibold"
                      )}
                    >
                      {day} {month}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        isCenter ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}
                    >
                      {DAY_ABBRS[date.getDay()]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>

        <div className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-0">
        {/* ── Content ── */}
        {!hasAnything ? (
          <div className="flex items-center justify-center min-h-[calc(100vh-280px)]">
            <div className="flex flex-col items-center justify-center text-center space-y-6 px-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, type: 'spring' }}
                className="flex flex-col items-center"
              >
                <motion.div
                  animate={{ y: [0, -4, 0], rotate: [0, 1, -1, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative mb-4"
                >
                  <div className="relative">
                    <motion.span
                      animate={{ scale: [1, 1.1, 1], opacity: [1, 0.8, 1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="text-6xl"
                    >
                      <MoonStar className="w-20 h-20 text-primary" />
                    </motion.span>
                    <motion.div
                      className="absolute -top-2 -right-2 text-xl font-bold text-primary/60"
                      animate={{ y: [0, -20], x: [0, 10], opacity: [0, 1, 0], scale: [0.5, 1.2] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
                    >
                      Z
                    </motion.div>
                    <motion.div
                      className="absolute -top-6 -right-6 text-lg font-bold text-primary/40"
                      animate={{ y: [0, -25], x: [0, 15], opacity: [0, 1, 0], scale: [0.5, 1] }}
                      transition={{ duration: 3, delay: 1, repeat: Infinity, ease: 'easeOut' }}
                    >
                      z
                    </motion.div>
                  </div>
                  <motion.div
                    className="absolute -bottom-2 -right-2 bg-card border border-border p-1.5 rounded-xl shadow-lg"
                    animate={{ y: [0, -2, 0] }}
                    transition={{ duration: 4, repeat: Infinity }}
                  >
                    <Coffee className="w-5 h-5 text-amber-500" />
                  </motion.div>
                  <div className="absolute -bottom-2 -left-2 bg-card border border-border p-1 rounded-lg shadow-lg rotate-[-10deg]">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                </motion.div>
                <h3 className="text-4xl font-extrabold tracking-tight text-foreground mb-2">Detox Day</h3>
                {subjectMode === 'custom' && customSubjects.length === 0 ? (
                  <p className="text-muted-foreground text-sm max-w-xs leading-relaxed px-4">
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
                  <p className="text-muted-foreground text-sm max-w-xs leading-relaxed px-4">
                    {isTodaySelected
                      ? 'Enjoy your rest day! No lectures or clinical ward postings are scheduled for today.'
                      : isFuture
                        ? `No lectures or clinical ward postings are scheduled for ${fullDateDisplay}.`
                        : `No lectures or clinical ward postings were scheduled for ${fullDateDisplay}.`}
                  </p>
                )}
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {dayEntries.map(entry => {
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
              className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50"
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

        {/* ── Update notice modal ── */}
        <AnimatePresence>
          {updateInfoOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-end sm:items-center justify-center p-4" onClick={() => setUpdateInfoOpen(false)}>
              <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-5 w-full max-w-sm max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-foreground">New Version Available <span className="text-emerald-400">(v{serverVersion})</span></h3>
                  <button type="button" onClick={() => setUpdateInfoOpen(false)} className="w-7 h-7 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{serverSummary || 'Bug fixes and refinements are ready to install.'}</p>
                {!online && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5">
                    <p className="text-[10px] font-bold text-amber-500">You're offline — connect to the Internet once to Install the Update.</p>
                  </div>
                )}
                <div className="bg-muted/30 border border-border/50 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1">How to Update</p>
                  <p className="text-[10px] text-muted-foreground">1. Go to <strong className="text-foreground">Settings Tab</strong></p>
                  <p className="text-[10px] text-muted-foreground">2. Scroll to <strong className="text-foreground">App Info</strong></p>
                  <p className="text-[10px] text-muted-foreground">3. Click <strong className="text-foreground">Update App</strong></p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setUpdateInfoOpen(false)} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Remind Later</button>
                  <button type="button" onClick={() => { setUpdateInfoOpen(false); setLocation('/account'); }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer">Go to Account</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}