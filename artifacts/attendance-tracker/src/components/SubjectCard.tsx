import React, { useState, useEffect, useRef } from 'react';
import { useAttendance } from '@/contexts/AttendanceContext';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SubjectCardProps {
  subject: string;
  totalPlanned: number;
  isWard?: boolean;
  /** When true, removes the outer card wrapper so this can live inside a parent card */
  isNested?: boolean;
}

export const SubjectCard = ({ subject, totalPlanned, isWard = false, isNested = false }: SubjectCardProps) => {
  const { subjects, wards, updateSubject, updateWard } = useAttendance();
  const dataStore = isWard ? wards : subjects;
  const updateFn = isWard ? updateWard : updateSubject;
  const key = isWard ? `ward-${subject}` : subject;

  const data = dataStore[key] || { attended: 0, missed: 0 };
  
  const [localAttended, setLocalAttended] = useState(data.attended.toString());
  const [localMissed, setLocalMissed] = useState(data.missed.toString());

  // Persist expansion state during the current session using sessionStorage
  const expansionKey = `sub_expanded_${key}`;
  const [isExpanded, setIsExpanded] = useState(() => {
    return sessionStorage.getItem(expansionKey) === 'true';
  });

  const toggleExpand = (e: React.MouseEvent) => {
    // Prevent toggling if user clicks inside inputs or buttons
    if ((e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('button')) {
      return;
    }
    const newVal = !isExpanded;
    setIsExpanded(newVal);
    sessionStorage.setItem(expansionKey, String(newVal));
  };

  const editingFieldRef = useRef<'attended' | 'missed' | null>(null);

  useEffect(() => {
    // Do not replace the controlled value while the user is actively typing.
    if (editingFieldRef.current) return;
    setLocalAttended(data.attended.toString());
    setLocalMissed(data.missed.toString());
  }, [data.attended, data.missed]);

  const attendedNum = parseInt(localAttended) || 0;
  const missedNum = parseInt(localMissed) || 0;
  const totalConducted = attendedNum + missedNum;
  
  const isError = totalConducted > totalPlanned;
  const percentage = totalConducted === 0 ? 100 : (attendedNum / totalConducted) * 100;
  const remaining = Math.max(0, totalPlanned - attendedNum - missedNum);
  
  const neededToReach75 = Math.max(0, 3 * missedNum - attendedNum);
  const canStillMiss = Math.max(0, Math.floor((attendedNum - 3 * missedNum) / 3));

  const handleInputChange = (field: 'attended' | 'missed', value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    if (field === 'attended') setLocalAttended(value);
    else setLocalMissed(value);
  };

  const commitInputs = () => {
    updateFn(key, parseInt(localAttended) || 0, parseInt(localMissed) || 0);
  };

  const beginEditing = (field: 'attended' | 'missed') => {
    editingFieldRef.current = field;
  };

  const finishEditing = () => {
    editingFieldRef.current = null;
    commitInputs();
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= 75) return 'text-success';
    if (pct >= 65) return 'text-warning';
    return 'text-destructive';
  };

  const headerContent = (
    <div className="flex justify-between items-start gap-4">
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-foreground text-base leading-tight truncate">{subject}</h4>
        <p className="text-muted-foreground text-xs mt-1">
          {isWard ? 'Clinical Rotation' : 'Lecture'} · Planned: {totalPlanned}
        </p>
        <p className="text-muted-foreground text-[11px] mt-0.5">
          Attended: <span className="text-foreground font-semibold">{attendedNum}</span> · Missed: <span className="text-foreground font-semibold">{missedNum}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className={cn("text-lg font-bold", getPercentageColor(percentage))}>
          {totalConducted === 0 ? '--' : `${percentage.toFixed(0)}%`}
        </div>
        <div className="text-muted-foreground hover:text-foreground p-0.5">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>
    </div>
  );

  const expandedContent = (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Classes Attended</label>
          <input
            type="number"
            inputMode="numeric"
            value={localAttended}
            onFocus={() => beginEditing('attended')}
            onBlur={finishEditing}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            onChange={(e) => handleInputChange('attended', e.target.value)}
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-base"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Classes Missed</label>
          <input
            type="number"
            inputMode="numeric"
            value={localMissed}
            onFocus={() => beginEditing('missed')}
            onBlur={finishEditing}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            onChange={(e) => handleInputChange('missed', e.target.value)}
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-destructive/50 transition-all text-base"
          />
        </div>
      </div>

      {isError && (
        <p className="text-destructive text-sm font-medium bg-destructive/10 px-3 py-2 rounded-lg">
          {isWard ? 'Total exceeds planned rotations' : 'Total exceeds planned classes'}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/30">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Remaining</span>
          <span className="text-sm font-semibold">{remaining}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Needed 75%</span>
          <span className="text-sm font-semibold text-primary">{neededToReach75}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Can Miss</span>
          <span className="text-sm font-semibold text-success">{canStillMiss}</span>
        </div>
      </div>
    </div>
  );

  const innerContent = (
    <div className="flex flex-col cursor-pointer select-none" onClick={toggleExpand}>
      {headerContent}
      {isExpanded && expandedContent}
    </div>
  );

  if (isNested) {
    return <div className="px-5 py-4 hover:bg-muted/10 transition-colors">{innerContent}</div>;
  }

  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-border hover:border-white/10 transition-all">
      {innerContent}
    </div>
  );
};
