import React, { useState, useMemo } from 'react';
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
// Friday moved to the end as weekly holiday
const DAYS_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat', 'Fri'];
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
    const todayAbbr = DAYS_SHORT[dayIndex];
    const dateStr = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

    // Get active ward for this date
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

  const shortenSubject = (name: string) => {
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
  };

  // Helper to read attendance status for a conducted subject
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
    if (dayRecords && dayRecords.length > 0) {
      const match = dayRecords.find(r => 
        r.label.toLowerCase() === cl.name.toLowerCase() || 
        r.label.toLowerCase() === shortenSubject(cl.name).toLowerCase()
      );
      if (match) return match.type;
    }

    return 'none';
  };

  // ── 8.1 Weekly Timetable Display Data ──────────────────────────────────────
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
            } else {
              break;
            }
          }
        }
        
        processed[day].push({ time, subjects: currentSubs, span, skip: false });
      });
    });
    return processed;
  }, [timetableGrid, uniqueTimes]);

  const isDayHoliday = (day: string) => {
    if (subjectMode === 'preloaded') {
      return day === 'Fri';
    } else {
      return uniqueTimes.every(t => !timetableGrid[day][t] || timetableGrid[day][t].length === 0);
    }
  };

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
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
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
              <div className="border border-border rounded-2xl bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="p-1 px-1.5 font-bold text-[9px] uppercase tracking-wider text-muted-foreground border-r border-border w-[45px]">Day</th>
                        {uniqueTimes.length === 0 ? (
                          <th className="p-1 px-1.5 font-bold text-[9px] uppercase tracking-wider text-muted-foreground">Schedule</th>
                        ) : (
                          uniqueTimes.map(t => (
                            <th key={t} className="p-1 font-bold text-[9px] uppercase tracking-wider text-muted-foreground text-center border-r border-border/40 last:border-0">{t}</th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {DAYS_ORDER.map((day) => {
                        const dayIdx = DAY_INDEX_MAP[day];
                        const isToday = today.getDay() === dayIdx;
                        const rowData = timetableWithSpans[day];
                        const holiday = isDayHoliday(day);

                        return (
                          <tr key={day} className={cn(isToday ? "bg-primary/5" : "hover:bg-muted/20")}>
                            <td className="p-1 px-1.5 font-bold text-foreground border-r border-border h-10">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px]">{day}</span>
                                {isToday && <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />}
                              </div>
                            </td>
                            {uniqueTimes.length === 0 ? (
                              <td className="p-1 text-muted-foreground text-[9px] italic">No lectures</td>
                            ) : holiday ? (
                              <td colSpan={uniqueTimes.length} className="p-2 text-center font-bold text-[10px] uppercase tracking-wider text-muted-foreground/60 bg-muted/10">
                                Holiday
                              </td>
                            ) : (
                              rowData.map((cell, cIdx) => {
                                const timeSlot = cell.time;

                                // Special Preset Merging for 11:30–12:00 (Rest)
                                if (subjectMode === 'preloaded' && timeSlot === '11:30–12:00') {
                                  if (day === 'Mon') {
                                    return (
                                      <td key={cIdx} rowSpan={3} className="p-1 text-center font-semibold text-[9px] text-muted-foreground/70 border-r border-border/40 align-middle bg-muted/5">
                                        Rest
                                      </td>
                                    );
                                  }
                                  if (day === 'Tue' || day === 'Wed') return null; // Covered by Mon rowSpan
                                  if (day === 'Sat') {
                                    return (
                                      <td key={cIdx} className="p-1 text-center font-semibold text-[9px] text-muted-foreground/70 border-r border-border/40 align-middle bg-muted/5">
                                        Rest
                                      </td>
                                    );
                                  }
                                }

                                // Special Preset Merging for 01:00–02:00 (Small Group Teaching)
                                if (subjectMode === 'preloaded' && timeSlot === '01:00–02:00') {
                                  if (day === 'Mon') {
                                    return (
                                      <td key={cIdx} rowSpan={3} className="p-1 text-center font-semibold text-[9px] text-muted-foreground/70 border-r border-border/40 align-middle bg-muted/5">
                                        Small Group Teaching
                                      </td>
                                    );
                                  }
                                  if (day === 'Tue' || day === 'Wed') return null; // Covered by Mon rowSpan
                                  if (day === 'Sat') {
                                    return (
                                      <td key={cIdx} className="p-1 text-center font-semibold text-[9px] text-muted-foreground/70 border-r border-border/40 align-middle bg-muted/5">
                                        Small Group Teaching
                                      </td>
                                    );
                                  }
                                }

                                if (cell.skip) return null;

                                return (
                                  <td 
                                    key={cIdx} 
                                    colSpan={cell.span}
                                    className="p-0.5 text-center border-r border-border/40 last:border-0"
                                  >
                                    {cell.subjects.length === 0 ? (
                                      <span className="text-muted-foreground/20 text-[9px]">—</span>
                                    ) : (
                                      <div className="flex items-center justify-center min-h-[30px] w-full px-0.5">
                                        <p 
                                          className={cn(
                                            "text-muted-foreground/80 font-medium leading-tight line-clamp-2 break-words",
                                            cell.subjects.length > 1 ? "text-[8px]" : "text-[9px]"
                                          )}
                                        >
                                          {cell.subjects.map(s => shortenSubject(s)).join(' / ')}
                                        </p>
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
            /* ── Case 2: When a date is selected, show Read-Only Conducted Subjects & Status View ── */
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
                  <p className="text-xs text-muted-foreground mt-0.5">Conducted Subjects & Status Log</p>
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
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-card border border-border rounded-3xl p-6 shadow-sm">
                  <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center text-2xl">
                    🌴
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">Holiday / Rest Day</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      No lectures or clinical ward postings were scheduled for this date.
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-amber-500/15 text-amber-500 font-bold text-[11px] rounded-full uppercase tracking-wider">
                    Holiday
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
                    Conducted Classes & Status ({selectedDateClasses.length})
                  </div>
                  {selectedDateClasses.map((cl, idx) => {
                    const status = getAttendanceStatus(selectedDate, cl);
                    return (
                      <div
                        key={`${selectedDate}-${cl.name}-${cl.sessionId}-${idx}`}
                        className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between shadow-sm"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground text-sm">{cl.name}</span>
                            <span className={cn(
                              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                              cl.isWard ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                              {cl.isWard ? "Ward Posting" : "Lecture"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{cl.time}</p>
                        </div>

                        {/* Read-Only Non-Editable Status Badge */}
                        <div className="shrink-0 ml-3">
                          {status === 'attended' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Present
                            </span>
                          )}
                          {status === 'missed' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-500 border border-rose-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Missed
                            </span>
                          )}
                          {status === 'off' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Off Day
                            </span>
                          )}
                          {status === 'none' && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-muted text-muted-foreground border border-border">
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
      </motion.div>
    </Layout>
  );
}