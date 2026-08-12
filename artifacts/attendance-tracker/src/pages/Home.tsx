import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HomeCard } from '@/components/HomeCard';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

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

export default function Home() {
  const today = new Date();
  const todayStr = toDateString(today);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  const { customSubjects, customWards, subjectMode, presetTimetable, getCurrentPresetWard } = useCustomData();
  const { homeSelections } = useAttendance();
  const [, setLocation] = useLocation();

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

  // Container width – default to window width so centering works immediately
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

  // Date mode
  const isTodaySelected = selectedDateStr === todayStr;
  const selectedDate = new Date(selectedDateStr + 'T12:00:00');
  const isPast = selectedDate < new Date(todayStr + 'T00:00:00');
  const isFuture = selectedDate > new Date(todayStr + 'T23:59:59.999');

  // Schedule for selected date
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
    return customSubjects.flatMap(s => {
      if (s.schedules && s.schedules.length > 0) {
        const daySchedules = s.schedules.filter(sch => sch.day === selectedTodayAbbr);
        return daySchedules.map(sch => ({
          id: `${s.id}-${sch.day}-${sch.time}`,
          name: s.name,
          time: sch.time,
        }));
      }
      if (s.days) {
        const assigned = s.days.split(',').map(d => d.trim());
        if (assigned.includes(selectedTodayAbbr)) {
          return [{ id: s.id, name: s.name, time: s.time || 'Time not set' }];
        }
      }
      return [];
    });
  }, [customSubjects, selectedTodayAbbr]);

  const schedule = subjectMode === 'preloaded' ? (presetTimetable[selectedDayOfWeek] || []) : [];
  const isFridayPreset = subjectMode === 'preloaded' && selectedDayOfWeek === 5;
  const hasAnything = !isFridayPreset && (schedule.length > 0 || todayCustomSubjects.length > 0 || (currentWard && !isWardHoliday));

  const fullDateDisplay = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 pb-20"
      >
        {/* ── Date Wheel (slimmer, no dot) ── */}
        <div
          ref={wheelContainerRef}
          className="bg-card border border-border rounded-3xl shadow-sm select-none overflow-hidden"
          style={{ height: '4rem' }}
        >
          <div
            className="relative w-full h-full"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{ touchAction: 'none' }}
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
                const isTodayDate = dateStr === todayStr;
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
                      {day}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        isCenter ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}
                    >
                      {month}
                    </span>
                    {/* Blue dot removed */}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        {!hasAnything ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 min-h-[45vh]">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, type: 'spring' }}
              className="flex flex-col items-center"
            >
              <motion.div
                animate={{ y: [0, -4, 0], rotate: [0, 1, -1, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative w-28 h-28 mb-4"
              >
                <div className="absolute inset-0 bg-primary/10 rounded-3xl border border-primary/20 shadow-[0_0_40px_rgba(10,132,255,0.1)] flex items-center justify-center">
                  <div className="relative">
                    <motion.span
                      animate={{ scale: [1, 1.1, 1], opacity: [1, 0.8, 1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="text-6xl"
                    >
                      😴
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
                </div>
                <motion.div
                  className="absolute -bottom-2 -right-2 bg-card border border-border p-1.5 rounded-xl shadow-lg"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  <span className="text-xl">☕</span>
                </motion.div>
                <div className="absolute -bottom-2 -left-2 bg-card border border-border p-1 rounded-lg shadow-lg rotate-[-10deg]">
                  <span className="text-xl">📚</span>
                </div>
              </motion.div>

              <h3 className="text-4xl font-extrabold tracking-tight text-white mb-2">Holiday</h3>
              {subjectMode === 'custom' && customSubjects.length === 0 ? (
                <p className="text-muted-foreground text-sm max-w-xs leading-relaxed px-4">
                  No subjects added yet.{' '}
                  <button
                    onClick={() => setLocation('/add-new')}
                    className="text-primary font-semibold underline-offset-2 hover:underline"
                  >
                    Add subjects
                  </button>{' '}
                  from the Add New tab to get started.
                </p>
              ) : (
                <p className="text-muted-foreground text-sm max-w-xs leading-relaxed px-4">
                  {isTodaySelected
                    ? 'Enjoy your rest day! No lectures or clinical ward postings are scheduled for today.'
                    : `No lectures or clinical ward postings were scheduled for ${fullDateDisplay}.`}
                </p>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Preloaded timetable */}
            {schedule.map((slot, idx) => {
              if (slot.type === 'integrated') {
                return slot.subjects.map((subject, subIdx) => (
                  <HomeCard
                    key={`${idx}-${subIdx}`}
                    subject={subject}
                    time={slot.time}
                    sessionId={`${idx}-${subIdx}`}
                    dateStr={selectedDateStr}
                    mode={isTodaySelected ? 'today' : isPast ? 'past' : 'future'}
                    pastSelection={
                      isPast
                        ? homeSelections[`${selectedDateStr}-${subject}-${idx}-${subIdx}`]
                        : undefined
                    }
                  />
                ));
              }

              if (slot.type === 'ward' || slot.type === 'ward_replacement') {
                const effectiveTime =
                  slot.type === 'ward_replacement'
                    ? presetWardObj?.eveningTime || slot.time
                    : presetWardObj?.morningTime || slot.time;
                const wardTag = slot.type === 'ward_replacement' ? 'Evening' : 'Morning';

                if (isWardHoliday || !currentWard) {
                  return (
                    <div key={idx} className="bg-card rounded-2xl p-5 border border-border">
                      <h3 className="text-lg font-semibold text-foreground">
                        Clinical Rotation: {isWardHoliday ? 'Holiday' : 'Not scheduled'}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1">{effectiveTime}</p>
                    </div>
                  );
                }

                return (
                  <HomeCard
                    key={idx}
                    title="Clinical Rotation"
                    subtitle={currentWard}
                    tag={wardTag}
                    tagColor="primary"
                    subject={currentWard}
                    time={effectiveTime}
                    isWard={true}
                    sessionId={String(idx)}
                    dateStr={selectedDateStr}
                    mode={isTodaySelected ? 'today' : isPast ? 'past' : 'future'}
                    pastSelection={
                      isPast
                        ? homeSelections[`${selectedDateStr}-ward-${currentWard}-${idx}`]
                        : undefined
                    }
                  />
                );
              }

              return slot.subjects.map((subject, subIdx) => (
                <HomeCard
                  key={`${idx}-${subIdx}`}
                  subject={subject}
                  time={slot.time}
                  sessionId={`${idx}-${subIdx}`}
                  dateStr={selectedDateStr}
                  mode={isTodaySelected ? 'today' : isPast ? 'past' : 'future'}
                  pastSelection={
                    isPast
                      ? homeSelections[`${selectedDateStr}-${subject}-${idx}-${subIdx}`]
                      : undefined
                  }
                />
              ));
            })}

            {/* Custom ward */}
            {subjectMode === 'custom' && currentWard && !isWardHoliday && (
              <>
                <HomeCard
                  title="Clinical Rotation"
                  subtitle={currentWard}
                  tag="Morning"
                  tagColor="primary"
                  subject={currentWard}
                  time={customWard?.morningTime || 'Morning Ward'}
                  isWard={true}
                  sessionId="custom-ward-am"
                  dateStr={selectedDateStr}
                  mode={isTodaySelected ? 'today' : isPast ? 'past' : 'future'}
                  pastSelection={
                    isPast
                      ? homeSelections[`${selectedDateStr}-ward-${currentWard}-custom-ward-am`]
                      : undefined
                  }
                />
                <HomeCard
                  title="Clinical Rotation"
                  subtitle={currentWard}
                  tag="Evening"
                  tagColor="primary"
                  subject={currentWard}
                  time={customWard?.eveningTime || 'Evening Ward'}
                  isWard={true}
                  sessionId="custom-ward-pm"
                  dateStr={selectedDateStr}
                  mode={isTodaySelected ? 'today' : isPast ? 'past' : 'future'}
                  pastSelection={
                    isPast
                      ? homeSelections[`${selectedDateStr}-ward-${currentWard}-custom-ward-pm`]
                      : undefined
                  }
                />
              </>
            )}

            {/* Custom subjects */}
            {todayCustomSubjects.map(s => (
              <HomeCard
                key={s.id}
                subject={s.name}
                time={s.time || 'Time not set'}
                sessionId={`custom-${s.id}`}
                dateStr={selectedDateStr}
                mode={isTodaySelected ? 'today' : isPast ? 'past' : 'future'}
                pastSelection={
                  isPast
                    ? homeSelections[`${selectedDateStr}-${s.name}-custom-${s.id}`]
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {/* ── Back to Today ── */}
        <AnimatePresence>
          {!isTodaySelected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
            >
              <button
                onClick={() => setSelectedDateStr(todayStr)}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-full font-bold shadow-lg hover:opacity-90 transition-all"
              >
                Back to Today
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Layout>
  );
}