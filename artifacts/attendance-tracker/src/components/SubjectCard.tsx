import React, { useState, useEffect, useRef } from 'react';
import { useAttendance } from '@/contexts/AttendanceContext';
import { cn, pctColor } from '@/lib/utils';
import { ChevronDown, ChevronUp, Info, Plus, Minus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface SubjectCardProps {
  subject: string;
  totalPlanned: number;
  isWard?: boolean;
  /** When true, removes the outer card wrapper so this can live inside a parent card */
  isNested?: boolean;
}

export const SubjectCard = ({ subject, totalPlanned, isWard = false, isNested = false }: SubjectCardProps) => {
  const { subjects, wards, updateSubject, updateWard, preferredPercentage } = useAttendance();
  const dataStore = isWard ? wards : subjects;
  const updateFn = isWard ? updateWard : updateSubject;
  const key = isWard ? `ward-${subject}` : subject;
  const data = dataStore[key] || { attended: 0, missed: 0 };
  
  // Keep ref of latest data for continuous stepping
  const currentDataRef = useRef({ attended: data.attended, missed: data.missed });
  useEffect(() => {
    currentDataRef.current = { attended: data.attended, missed: data.missed };
  }, [data.attended, data.missed]);

  const [showLimitMessage, setShowLimitMessage] = useState(false);
  const [activeStatInfo, setActiveStatInfo] = useState<'remaining' | 'missable' | 'canMiss' | 'required' | null>(null);

  const expansionKey = `sub_expanded_${key}`;
  const [isExpanded, setIsExpanded] = useState(() => {
    return sessionStorage.getItem(expansionKey) === 'true';
  });

  const toggleExpand = (e: React.MouseEvent) => {
    // Prevent toggling if user clicks inside inputs or buttons
    if ((e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[role="dialog"]')) {
      return;
    }
    const newVal = !isExpanded;
    setIsExpanded(newVal);
    sessionStorage.setItem(expansionKey, String(newVal));
  };

  const handleStep = (field: 'attended' | 'missed', change: number) => {
    const current = currentDataRef.current;
    let newAttended = current.attended;
    let newMissed = current.missed;
    
    if (change > 0 && current.attended + current.missed >= totalPlanned) {
      setShowLimitMessage(true);
      return false;
    }
    
    if (field === 'attended') {
      newAttended += change;
      if (newAttended < 0) return false;
    } else {
      newMissed += change;
      if (newMissed < 0) return false;
    }
    
    if (showLimitMessage) setShowLimitMessage(false);
    
    currentDataRef.current = { attended: newAttended, missed: newMissed };
    updateFn(key, newAttended, newMissed);
    return true;
  };

  const handleTap = (e: React.MouseEvent, field: 'attended' | 'missed', change: number) => {
    e.stopPropagation();
    handleStep(field, change);
  };

  const attendedNum = data.attended;
  const missedNum = data.missed;
  const totalConducted = attendedNum + missedNum;
  
  const percentage = totalConducted === 0 ? 100 : (attendedNum / totalConducted) * 100;
  const targetPct = preferredPercentage || 75;

  const remaining = Math.max(0, totalPlanned - totalConducted);
  const maxMissable = Math.floor(totalPlanned * (1 - targetPct / 100));
  const canStillMiss = Math.max(0, maxMissable - missedNum);
  const rawRequired = Math.max(0, Math.ceil(totalPlanned * (targetPct / 100)) - attendedNum);
  const requiredToAttend = rawRequired > remaining ? "Not possible" : rawRequired;

  // NEW: Use pctColor from utils with the new logic
  const percentageColor = pctColor(percentage, preferredPercentage);

  const isMaxReached = totalConducted >= totalPlanned;

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
        <div className="text-lg font-bold" style={{ color: percentageColor }}>
          {totalConducted === 0 ? '--' : `${percentage.toFixed(0)}%`}
        </div>
        <div className="text-muted-foreground hover:text-foreground p-0.5">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>
    </div>
  );

  const Stepper = ({ field, value }: { field: 'attended' | 'missed', value: number }) => (
    <div className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-xl p-1.5 shadow-sm">
      <span className="text-[11px] font-semibold text-muted-foreground pl-2 uppercase tracking-wide">
        {field}
      </span>
      <div className="flex items-center gap-2 pr-0.5">
        <button
          type="button"
          onClick={(e) => handleTap(e, field, -1)}
          disabled={value <= 0}
          className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all select-none cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-6 text-center font-bold text-sm select-none">
          {value}
        </span>
        <button
          type="button"
          onClick={(e) => handleTap(e, field, 1)}
          disabled={isMaxReached}
          className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all select-none cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const expandedContent = (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stepper field="attended" value={attendedNum} />
        <Stepper field="missed" value={missedNum} />
      </div>

      {showLimitMessage && (
        <p className="text-amber-500 text-[11px] font-medium text-center bg-amber-500/10 py-1.5 px-3 rounded-lg border border-amber-500/20 transition-all">
          Planned class limit reached.
        </p>
      )}
      
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border/30">
        <div 
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo('remaining'); }}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Remaining</span>
          <span className="text-sm font-bold text-foreground">{remaining}</span>
        </div>

        <div 
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo('missable'); }}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Missable</span>
          <span className="text-sm font-bold text-foreground">{maxMissable}</span>
        </div>

        <div 
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo('canMiss'); }}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Can Miss</span>
          <span className="text-sm font-bold text-success">{canStillMiss}</span>
        </div>

        <div 
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo('required'); }}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Required</span>
         <span className={cn("font-bold text-center leading-tight",rawRequired > remaining ? "text-[10px] text-destructive" : "text-sm text-primary")}>{requiredToAttend}</span>
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

  return (
    <>
      <div className={cn("bg-card rounded-2xl shadow-sm border border-border hover:border-white/10 transition-all", !isNested && "p-5", isNested && "px-5 py-4 hover:bg-muted/10 border-0 rounded-none")}>
        {innerContent}
      </div>

      <Dialog open={activeStatInfo !== null} onOpenChange={(open) => !open && setActiveStatInfo(null)}>
        <DialogContent className="max-w-[320px] rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
          <DialogHeader className="text-left space-y-3 pb-2">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              {activeStatInfo === 'remaining' && 'Remaining Classes'}
              {activeStatInfo === 'missable' && 'Total Missable'}
              {activeStatInfo === 'canMiss' && 'Can Miss Now'}
              {activeStatInfo === 'required' && 'Required Classes'}
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground leading-relaxed">
              {activeStatInfo === 'remaining' && (
                <>
                  <p className="mb-3">Remaining scheduled classes yet to be conducted.</p>
                  <div className="bg-muted p-2 rounded-lg text-xs font-mono text-muted-foreground border border-border/50">
                    Formula:<br/>Planned − (Attended + Missed)
                  </div>
                </>
              )}
              {activeStatInfo === 'missable' && (
                <p>Maximum total classes that may be missed across the entire planned curriculum while still achieving the preferred attendance percentage configured in Account Settings.</p>
              )}
              {activeStatInfo === 'canMiss' && (
                <>
                  <p className="mb-2">Maximum additional remaining classes that can still be missed while still being able to achieve the preferred attendance percentage.</p>
                  <p className="text-xs text-muted-foreground bg-muted p-2 rounded-lg border border-border/50">Already conducted classes are NOT included.</p>
                </>
              )}
              {activeStatInfo === 'required' && (
                <p>Minimum number of the remaining classes that must be attended to achieve the preferred attendance percentage configured in Account Settings.</p>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
};