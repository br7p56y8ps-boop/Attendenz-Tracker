import React, { useState, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { useAttendance } from '@/contexts/AttendanceContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${pad2(m+1)}-${pad2(d)}`; }

/** Parse homeSelections key: "{dateStr}-{subjectKey}-{sessionId}" → dateStr is first 10 chars */
function parseSelectionKey(key: string): { date: string; label: string } | null {
  const date = key.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rest = key.slice(11); // "{subjectKey}-{sessionId}"
  // sessionId is always the last segment
  const parts = rest.split('-');
  // sessionId is numeric — drop last segment
  const labelParts = parts.slice(0, -1);
  const label = labelParts.join(' ').replace(/^ward /, '').trim() || rest;
  return { date, label };
}

type DayRecord = { label: string; type: 'attended' | 'missed' | 'off' };

export default function CalendarPage() {
  const { homeSelections } = useAttendance();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build a map: dateStr → list of records
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

  // Determine which dates have data in the current month
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
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

  const selectedRecords = selectedDate ? (recordMap[selectedDate] || []) : [];
  const selectedDayLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-8">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Calendar</h2>
          <p className="text-2xl font-bold text-foreground mt-1">Attendance History</p>
        </div>

        {/* Calendar card */}
        <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
          {/* Month header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-foreground text-base">{MONTHS[viewMonth]} {viewYear}</span>
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
            {/* Empty cells before first day */}
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
                    isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'bg-primary/15 text-primary font-bold' : 'hover:bg-muted/60 text-foreground'
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
          <div className="flex gap-4 px-5 pb-4 justify-center">
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

        {/* Day detail panel */}
        <AnimatePresence>
          {selectedDate && (
            <motion.div
              key={selectedDate}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.25 }}
              className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <p className="font-bold text-foreground">{selectedDayLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedRecords.length} record{selectedRecords.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setSelectedDate(null)} className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedRecords.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-muted-foreground text-sm">No attendance recorded for this date.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {selectedRecords.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-foreground font-medium capitalize text-sm">{r.label}</span>
                      <span className={cn(
                        'text-xs font-bold px-3 py-1 rounded-full',
                        r.type === 'attended' ? 'bg-success/15 text-success' :
                        r.type === 'missed' ? 'bg-destructive/15 text-destructive' :
                        'bg-warning/15 text-warning'
                      )}>
                        {r.type === 'attended' ? 'Attended' : r.type === 'missed' ? 'Missed' : 'Off'}
                      </span>
                    </div>
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
