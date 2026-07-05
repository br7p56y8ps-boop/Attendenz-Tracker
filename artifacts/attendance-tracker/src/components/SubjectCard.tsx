import React, { useState, useEffect, useRef } from 'react';
import { useAttendance } from '@/contexts/AttendanceContext';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    setLocalAttended(data.attended.toString());
    setLocalMissed(data.missed.toString());
  }, [data.attended, data.missed]);

  const attendedNum = parseInt(localAttended) || 0;
  const missedNum = parseInt(localMissed) || 0;
  const totalConducted = attendedNum + missedNum;
  
  const isError = totalConducted > totalPlanned;
  const percentage = totalConducted === 0 ? 100 : (attendedNum / totalConducted) * 100;
  const remaining = Math.max(0, totalPlanned - attendedNum - missedNum);
  
  const neededToReach75 = Math.max(0, Math.ceil((0.75 * totalConducted - attendedNum) / 0.25));
  const canStillMiss = Math.max(0, Math.floor((attendedNum - 0.75 * totalConducted) / 0.75));

  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleInputChange = (field: 'attended' | 'missed', value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    
    if (field === 'attended') setLocalAttended(value);
    if (field === 'missed') setLocalMissed(value);

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const parsedAttended = field === 'attended' ? (parseInt(value) || 0) : attendedNum;
      const parsedMissed = field === 'missed' ? (parseInt(value) || 0) : missedNum;
      updateFn(key, parsedAttended, parsedMissed);
    }, 300);
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= 75) return 'text-success';
    if (pct >= 65) return 'text-warning';
    return 'text-destructive';
  };

  const content = (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h4 className="font-semibold text-foreground text-base leading-tight">{subject}</h4>
          <p className="text-muted-foreground text-xs mt-0.5">Total Planned: {totalPlanned}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={cn("text-lg font-bold", getPercentageColor(percentage))}>
            {totalConducted === 0 ? '--' : `${percentage.toFixed(0)}%`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Classes Attended</label>
          <input
            type="number"
            inputMode="numeric"
            value={localAttended}
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
            onChange={(e) => handleInputChange('missed', e.target.value)}
            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-destructive/50 transition-all text-base"
          />
        </div>
      </div>

      {isError && (
        <p className="text-destructive text-sm font-medium bg-destructive/10 px-3 py-2 rounded-lg">
          Total exceeds planned lectures
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
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

  if (isNested) {
    return <div className="px-5 py-4">{content}</div>;
  }

  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
      {content}
    </div>
  );
};
