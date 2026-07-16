import React, { useState, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { HomeCard } from '@/components/HomeCard';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Grid } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${pad2(m+1)}-${pad2(d)}`; }

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

export default function CalendarPage() {
  const { homeSelections } = useAttendance();
  const { customSubjects, customWards, subjectMode, presetTimetable, getCurrentPresetWard, presetWardSchedule } = useCustomData();

  // Monthly State
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ── Monthly Calculations ──────────────────────────────────────────────────
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
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDate(null);
  };

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const getDotColor = (records: DayRecord[]) => {
    if (!records || records.length === 0) return null;
    const types = records.map(r => r.type);
    if (types.every(t => t === 'off')) return 'bg-warning';
    if (types.some(t => t === 'missed')) return 'bg-destructive';
    return 'bg-success';
  };

  const selectedDayLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';

  // ── Retrieve scheduled classes for any specific date ───────────────────────
  const getScheduledClassesForDate = (date: Date) => {
    const dayIndex = date.getDay();
    const todayAbbr = DAYS_ORDER[dayIndex];
    const dateStr = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

    // Get active ward for this date
    const customWard = customWards.find(w => dateStr >= w.startDate && dateStr <= w.endDate);
    const presetWardObj = subjectMode === 'preloaded' ? getCurrentPresetWard(date) : null;
    const currentWard = customWard ? customWard.name : (presetWardObj ? presetWardObj.ward : null);
    const isWardHoliday = currentWard === 'Holiday';

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
      // Custom mode: Custom Wards active on this date
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

      // Custom mode: Custom Subjects
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

  // ── 8.1 Weekly Timetable Display Data ──────────────────────────────────────
  const uniqueTimes = useMemo(() => {
    const timesSet = new Set<string>();
    if (subjectMode === 'preloaded') {
      Object.values(presetTimetable).forEach(slots => {
        slots.forEach(slot => {
          if (slot.type !== 'ward' && slot.type !== 'ward_replacement') {
            timesSet.add(slot.time);
          }
        });
      });
    } else {
      customSubjects.forEach(s => {
        if (s.schedules && s.schedules.length > 0) {
          s.schedules.forEach(sch => {
            if (sch.time && sch.time.trim()) timesSet.add(sch.time.trim());
          });
        } else if (s.days && s.time) {
          if (s.time.trim()) timesSet.add(s.time.trim());
        }
      });
    }
    return Array.from(timesSet).sort();
  }, [subjectMode, customSubjects, presetTimetable]);

  const timetableGrid = useMemo(() => {
    const grid: Record<string, Record<string, string[]>> = {};
    DAYS_ORDER.forEach(day => {
      grid[day] = {};
    });

    if (subjectMode === 'preloaded') {
      DAYS_ORDER.forEach((day, dayIdx) => {
        const slots = presetTimetable[dayIdx] || [];
        slots.forEach(slot => {
          if (slot.type !== 'ward' && slot.type !== 'ward_replacement') {
            if (!grid[day][slot.time]) grid[day][slot.time] = [];
            grid[day][slot.time].push(...slot.subjects);
          }
        });
      });
    } else {
      customSubjects.forEach(s => {
        if (s.schedules && s.schedules.length > 0) {
          s.schedules.forEach(sch => {
            const t = sch.time.trim();
            if (!grid[sch.day][t]) grid[sch.day][t] = [];
            grid[sch.day][t].push(s.name);
          });
        } else if (s.days) {
          const assigned = s.days.split(',').map(d => d.trim());
          const t = s.time ? s.time.trim() : 'Time not set';
          assigned.forEach(day => {
            if (grid[day]) {
              if (!grid[day][t]) grid[day][t] = [];
              grid[day][t].push(s.name);
            }
          });
        }
      });
    }
    return grid;
  }, [subjectMode, customSubjects, presetTimetable]);

  const wardRotationsList = useMemo(() => {
    if (subjectMode === 'preloaded') {
      return presetWardSchedule.map((ws, i) => ({
        id: `preload-ward-${i}`,
        name: ws.ward,
        period: `${ws.start.split('-').reverse().join('/')} to ${ws.end.split('-').reverse().join('/')}`,
      }));
    } else {
      return customWards.map(w => ({
        id: w.id,
        name: w.name,
        period: `${w.startDate.split('-').reverse().join('/')} to ${w.endDate.split('-').reverse().join('/')}`,
      }));
    }
  }, [subjectMode, customWards, presetWardSchedule]);

  const selectedDateClasses = useMemo(() => {
    if (!selectedDate) return [];
    return getScheduledClassesForDate(new Date(selectedDate + 'T12:00:00'));
  }, [selectedDate, customSubjects, customWards, subjectMode]);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-8">
        
        {/* ── Monthly Calendar View ── */}
        <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
          {/* Month header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-b border-border">
            <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center">
              <span className="font-bold text-foreground text-base">{MONTHS[viewMonth]} {viewYear}</span>
              <span className="text-[10px] text-primary font-bold uppercase tracking-wider mt-0.5">Interactive Logbook</span>
            </div>
            <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-3 pt-3 pb-1">
            {DAYS_SHORT.map(d => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Date grid */}
          <div className="grid grid-cols-7 px-3 pb-4 gap-y-1">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e${i}`} />)}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = toDateStr(viewYear, viewMonth, day);
              const records = recordMap[dateStr];
              const dotColor = getDotColor(records);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={cn(
                    'flex flex-col items-center justify-center h-10 rounded-xl transition-all text-sm font-medium relative',
                    isSelected ? 'bg-primary text-primary-foreground font-bold shadow-sm' : isToday ? 'bg-primary/15 text-primary font-bold' : 'hover:bg-muted/60 text-foreground'
                  )}
                >
                  {day}
                  {dotColor && (
                    <span className={cn('absolute bottom-1.5 w-1 h-1 rounded-full', dotColor, isSelected && 'bg-white/70')} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 px-5 pb-4 justify-center border-t border-border/50 pt-4 bg-muted/20">
            {[
              { color: 'bg-success', label: 'Attended' },
              { color: 'bg-destructive', label: 'Missed' },
              { color: 'bg-warning', label: 'Off day' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full', l.color)} />
                <span className="text-xs text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Dynamic Content Section below Calendar ── */}
        <AnimatePresence mode="wait">
          {!selectedDate ? (
            /* ── Case 1: Weekly Timetable display (default state, no date selected) ── */
            <motion.div
              key="timetable"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Grid className="w-4 h-4 text-primary" />
                  <span>Weekly Timetable (Lectures / Integrated)</span>
                </h3>
              </div>

              {/* Dynamic Day vs Time Table */}
              <div className="overflow-x-auto border border-border rounded-2xl bg-card shadow-sm">
                <table className="w-full text-left border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="p-1.5 md:p-2 px-2 font-bold text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground border-r border-border min-w-[55px] md:min-w-[80px]">Day</th>
                      {uniqueTimes.length === 0 ? (
                        <th className="p-1.5 md:p-2 px-2 font-bold text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground">Schedule</th>
                      ) : (
                        uniqueTimes.map(t => (
                          <th key={t} className="p-1.5 md:p-2 font-bold text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground min-w-[85px] md:min-w-[110px] text-center border-r border-border/40 last:border-0">{t}</th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {DAYS_ORDER.map((day, idx) => {
                      const isToday = today.getDay() === idx;
                      return (
                        <tr key={day} className={cn(isToday ? "bg-primary/5" : "hover:bg-muted/20")}>
                          <td className="p-1.5 md:p-2 px-2 font-bold text-foreground border-r border-border flex items-center gap-1">
                            <span className="text-[11px] md:text-xs">{day}</span>
                            {isToday && <span className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-primary animate-pulse" />}
                          </td>
                          {uniqueTimes.length === 0 ? (
                            <td className="p-1.5 md:p-2 text-muted-foreground text-[10px] md:text-xs italic">No lectures scheduled</td>
                          ) : (
                            uniqueTimes.map(t => {
                              const subs = timetableGrid[day][t] || [];
                              return (
                                <td key={t} className="p-1 md:p-1.5 text-center border-r border-border/40 last:border-0">
                                  {subs.length === 0 ? (
                                    <span className="text-muted-foreground/30 text-[10px] md:text-xs">—</span>
                                  ) : (
                                    <div className="flex flex-col gap-0.5 items-center justify-center">
                                      {subs.map((s, sIdx) => (
                                        <span key={sIdx} className="bg-primary/10 text-primary px-1 md:px-1.5 py-0.5 rounded text-[10px] md:text-xs font-semibold block text-center max-w-[75px] md:max-w-[100px] truncate" title={s}>
                                          {s}
                                        </span>
                                      ))}
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

              {/* Separately rendered Ward / Hospital/Clinical Rotations list */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  <span>Hospital/Clinical Rotations Placement</span>
                </h3>
                {wardRotationsList.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic bg-card border border-border p-4 rounded-2xl">
                    No hospital/clinical rotations scheduled.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {wardRotationsList.map(w => (
                      <div key={w.id} className="bg-card border border-border rounded-2xl p-4 flex justify-between items-center shadow-sm">
                        <div>
                          <p className="font-bold text-foreground text-sm">{w.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">Rotation period: {w.period}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full shrink-0">
                          Clinical
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── Case 2: When a date is selected, show attendance manager identical to Home tab ── */
            <motion.div
              key="selected_date_manager"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between bg-muted/40 p-4 rounded-2xl border border-border">
                <div>
                  <p className="text-sm font-bold text-foreground">{selectedDayLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Historical Attendance Manager</p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="px-3.5 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Show Timetable</span>
                </button>
              </div>

              {selectedDateClasses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-card border border-border rounded-3xl shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-3xl">
                    🌴
                  </div>
                  <h3 className="text-xl font-extrabold tracking-tight text-foreground">
                    Holiday / Rest Day
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
                    Enjoy your rest day! No lectures or clinical ward postings are scheduled for this day.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedDateClasses.map((cl) => (
                    <HomeCard
                      key={`${selectedDate}-${cl.name}-${cl.sessionId}`}
                      subject={cl.name}
                      time={cl.time}
                      isWard={cl.isWard}
                      title={cl.isWard ? `Ward Current Posting: ${cl.name}` : undefined}
                      sessionId={cl.sessionId}
                      dateStr={selectedDate}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Layout>
  );
}
