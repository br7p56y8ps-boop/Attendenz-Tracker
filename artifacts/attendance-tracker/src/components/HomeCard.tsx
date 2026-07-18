import React, { useState } from 'react';
import { useAttendance } from '@/contexts/AttendanceContext';
import { cn, getCurrentDateStr } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface HomeCardProps {
  subject: string;
  time: string;
  isWard?: boolean;
  title?: string;
  /** Unique identifier for this timetable slot (e.g. slot index).
   *  Prevents two slots for the same subject on the same day from sharing
   *  a selection key — most critical for ward vs ward_replacement sessions. */
  sessionId?: string;
  dateStr?: string;
}

export const HomeCard = ({ subject, time, isWard = false, title, sessionId, dateStr }: HomeCardProps) => {
  const { subjects, wards, homeSelections, updateHomeSelection, preferredPercentage } = useAttendance();
  const activeDateStr = dateStr || getCurrentDateStr();
  const [showECG, setShowECG] = useState(false);
  
  // Format date: dd/mm/yy
  const formatDate = (dateString: string) => {
    const [y, m, d] = dateString.split('-');
    return `${d}/${m}/${y.slice(-2)}`;
  };
  const formattedDate = dateStr ? formatDate(dateStr) : '';

  const key = isWard ? `ward-${subject}` : subject;
  const data = isWard ? wards[key] : subjects[subject];

  const attended = data?.attended || 0;
  const missed = data?.missed || 0;

  // Include sessionId so two slots for the same subject on the same day
  // (especially ward vs ward_replacement) never collide on the same key.
  const selectionKey = sessionId ? `${activeDateStr}-${key}-${sessionId}` : `${activeDateStr}-${key}`;
  const currentSelection = homeSelections[selectionKey];

  // Attendance calculations (Off is excluded — only attended + missed count)
  const total = attended + missed;
  const percentage = total === 0 ? 100 : (attended / total) * 100;

  // How many future classes can still be missed while staying ≥ preferredPercentage%
  // Formula derived from: (attended / (total + x)) >= P/100
  // x = (attended * 100 / P) - total
  const canMissCount = Math.max(0, Math.floor((attended * 100 / preferredPercentage) - total));

  // How many classes must be attended to climb back to / stay at preferredPercentage%
  // Formula derived from: ((attended + x) / (total + x)) >= P/100
  // x = (P * total - 100 * attended) / (100 - P)
  const needToAttend = Math.max(1, Math.ceil((preferredPercentage * total - 100 * attended) / (100 - preferredPercentage)));
  
  const isSafeToMiss = canMissCount > 0;

  const handleSelection = (selection: 'off' | 'missed' | 'attended') => {
    updateHomeSelection(selectionKey, key, selection, isWard);
    setShowECG(true);
    setTimeout(() => setShowECG(false), 3000);
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= preferredPercentage) return 'text-success';
    if (pct >= preferredPercentage - 10) return 'text-warning';
    return 'text-destructive';
  };

  const ecgColor = percentage >= 80 ? "#10b981" : percentage >= 75 ? "#f59e0b" : "#ef4444";

  // Card-level background tint based on current selection
  const cardBg = currentSelection === 'attended'
    ? 'bg-success/10 border-success/30'
    : currentSelection === 'missed'
    ? 'bg-destructive/10 border-destructive/30'
    : currentSelection === 'off'
    ? 'bg-warning/10 border-warning/30'
    : 'bg-card border-card-border';

  return (
    <div className={cn("rounded-2xl p-5 shadow-sm border mb-4 transition-colors duration-300 relative overflow-hidden", cardBg)}>
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div className="pr-4">
          <h3 className="text-xl font-bold leading-tight text-foreground">{title || subject}</h3>
          <p className="text-muted-foreground text-sm mt-1">{time}</p>
        </div>
        {!dateStr && (
          <div className={cn("text-lg font-bold min-w-max", getPercentageColor(percentage))}>
            {total === 0 ? '--' : `${percentage.toFixed(0)}%`}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showECG && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none flex items-center justify-center z-0"
          >
            <svg className="w-full h-24 opacity-40" preserveAspectRatio="none" viewBox="0 0 100 40">
              <motion.path
                d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 30 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 60 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 90 20 L 100 20"
                fill="none"
                stroke={ecgColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {!dateStr && (
        <div className="mb-5 relative z-10">
          <p className="text-sm font-medium text-muted-foreground">
            {isSafeToMiss ? (
              <>
                ✌️ You can bunk{' '}
                <span className="text-success font-semibold">{canMissCount}</span>
                {' '}class{canMissCount !== 1 ? 'es' : ''}
              </>
            ) : (
              <>
                🥺 You can't miss it; Need to attend{' '}
                <span className="text-destructive font-semibold">{needToAttend}</span>
                {' '}class{needToAttend !== 1 ? 'es' : ''}
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex gap-2 w-full relative z-10">
        <button
          onClick={() => handleSelection('attended')}
          className={cn(
            "flex-1 py-3 px-2 rounded-xl text-sm font-semibold transition-all active:scale-95 duration-200 border",
            currentSelection === 'attended'
              ? "bg-success/20 text-success border-success/40 shadow-sm"
              : "bg-background/70 text-muted-foreground border-border hover:bg-success/5 hover:text-success hover:border-success/20"
          )}
        >
          😁 Attended
        </button>
        <button
          onClick={() => handleSelection('missed')}
          className={cn(
            "flex-1 py-3 px-2 rounded-xl text-sm font-semibold transition-all active:scale-95 duration-200 border",
            currentSelection === 'missed'
              ? "bg-destructive/20 text-destructive border-destructive/40 shadow-sm"
              : "bg-background/70 text-muted-foreground border-border hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20"
          )}
        >
          😒 Missed
        </button>
        <button
          onClick={() => handleSelection('off')}
          className={cn(
            "flex-1 py-3 px-2 rounded-xl text-sm font-semibold transition-all active:scale-95 duration-200 border",
            currentSelection === 'off'
              ? "bg-warning/20 text-warning border-warning/40 shadow-sm"
              : "bg-background/70 text-muted-foreground border-border hover:bg-warning/5 hover:text-warning hover:border-warning/20"
          )}
        >
          🥰 Holiday
        </button>
      </div>
    </div>
  );
};
