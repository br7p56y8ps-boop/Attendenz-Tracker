import React from 'react';
import { useAttendance } from '@/contexts/AttendanceContext';
import { cn, getCurrentDateStr } from '@/lib/utils';

interface HomeCardProps {
  subject: string;
  time: string;
  isWard?: boolean;
  title?: string;
  /** Unique identifier for this timetable slot (e.g. slot index).
   *  Prevents two slots for the same subject on the same day from sharing
   *  a selection key — most critical for ward vs ward_replacement sessions. */
  sessionId?: string;
}

export const HomeCard = ({ subject, time, isWard = false, title, sessionId }: HomeCardProps) => {
  const { subjects, wards, homeSelections, updateHomeSelection } = useAttendance();
  const dateStr = getCurrentDateStr();

  const key = isWard ? `ward-${subject}` : subject;
  const data = isWard ? wards[key] : subjects[subject];

  const attended = data?.attended || 0;
  const missed = data?.missed || 0;

  // Include sessionId so two slots for the same subject on the same day
  // (especially ward vs ward_replacement) never collide on the same key.
  const selectionKey = sessionId ? `${dateStr}-${key}-${sessionId}` : `${dateStr}-${key}`;
  const currentSelection = homeSelections[selectionKey];

  // Attendance calculations (Off is excluded — only attended + missed count)
  const total = attended + missed;
  const percentage = total === 0 ? 100 : (attended / total) * 100;
  const isSafe = percentage >= 75;

  // How many future classes can still be missed while staying ≥ 75%
  const canMissCount = isSafe
    ? Math.max(0, Math.floor((attended - 0.75 * total) / 0.75))
    : 0;

  // How many classes must be attended to climb back to 75%
  const needToAttend = !isSafe
    ? Math.max(0, Math.ceil((0.75 * total - attended) / 0.25))
    : 0;

  const handleSelection = (selection: 'off' | 'missed' | 'attended') => {
    updateHomeSelection(dateStr, key, selection, isWard);
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= 75) return 'text-success';
    if (pct >= 65) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-card-border mb-4">
      <div className="flex justify-between items-start mb-2">
        <div className="pr-4">
          <h3 className="text-xl font-bold leading-tight text-foreground">{title || subject}</h3>
          <p className="text-muted-foreground text-sm mt-1">{time}</p>
        </div>
        <div className={cn("text-lg font-bold min-w-max", getPercentageColor(percentage))}>
          {total === 0 ? '--' : `${percentage.toFixed(0)}%`}
        </div>
      </div>

      <div className="mb-5">
        <p className="text-sm font-medium text-muted-foreground">
          {isSafe ? (
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

      <div className="flex gap-2 w-full">
        <button
          onClick={() => handleSelection('attended')}
          className={cn(
            "flex-1 py-3 px-2 rounded-xl text-sm font-semibold transition-all active:scale-95 duration-200 border",
            currentSelection === 'attended'
              ? "bg-success/15 text-success border-success/30 shadow-sm"
              : "bg-background text-muted-foreground border-border hover:bg-success/5 hover:text-success hover:border-success/20"
          )}
        >
          Attended
        </button>
        <button
          onClick={() => handleSelection('missed')}
          className={cn(
            "flex-1 py-3 px-2 rounded-xl text-sm font-semibold transition-all active:scale-95 duration-200 border",
            currentSelection === 'missed'
              ? "bg-destructive/15 text-destructive border-destructive/30 shadow-sm"
              : "bg-background text-muted-foreground border-border hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20"
          )}
        >
          Missed
        </button>
        <button
          onClick={() => handleSelection('off')}
          className={cn(
            "flex-1 py-3 px-2 rounded-xl text-sm font-semibold transition-all active:scale-95 duration-200 border",
            currentSelection === 'off'
              ? "bg-warning/15 text-warning border-warning/30 shadow-sm"
              : "bg-background text-muted-foreground border-border hover:bg-warning/5 hover:text-warning hover:border-warning/20"
          )}
        >
          Off
        </button>
      </div>
    </div>
  );
};
