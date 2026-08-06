import React, { useState } from 'react';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { cn, getCurrentDateStr } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

interface HomeCardProps {
  subject: string;
  time: string;
  isWard?: boolean;
  title?: string;
  sessionId?: string;
  dateStr?: string;
}

export const HomeCard = ({ subject, time, isWard = false, title, sessionId, dateStr }: HomeCardProps) => {
  const { subjects, wards, homeSelections, finishedMap, updateHomeSelection, preferredPercentage } = useAttendance();
  const {
    customSubjects,
    customWards,
    getSubjectPlannedTotal,
    getPresetWardTotalPlanned,
    getCustomWardTotalPlanned,
  } = useCustomData();
  const activeDateStr = dateStr || getCurrentDateStr();
  const [showECG, setShowECG] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<'off' | 'missed' | 'attended' | null>(null);
  

  const key = isWard ? `ward-${subject}` : subject;
  const data = isWard ? wards[key] : subjects[subject];

  const attended = data?.attended || 0;
  const missed = data?.missed || 0;
  const total = attended + missed;

  // FIXED: Dynamically resolve plannedClasses for both Preset Overrides and Custom users
  let totalPlannedClasses: number;
  if (isWard) {
    const cWard = customWards?.find(w => w.name.toLowerCase() === subject.toLowerCase());
    if (cWard) {
      totalPlannedClasses = getCustomWardTotalPlanned(cWard.startDate, cWard.endDate);
    } else {
      const presetWardCount = getPresetWardTotalPlanned(subject);
      totalPlannedClasses = presetWardCount > 0 ? presetWardCount : getSubjectPlannedTotal(subject);
    }
  } else {
    const customSub = customSubjects?.find(
      (s) => s.name.toLowerCase() === subject.toLowerCase()
    );
    if (customSub) {
      totalPlannedClasses = customSub.plannedClasses;
    } else {
      totalPlannedClasses = getSubjectPlannedTotal(subject);
    }
  }

  // Remaining planned classes & Finished state (manual toggle or remaining === 0)
  const remainingClasses = totalPlannedClasses !== undefined ? Math.max(0, totalPlannedClasses - total) : undefined;
  const isFinishedMarked = finishedMap?.[key] || false;
  const isFinished = isFinishedMarked || (totalPlannedClasses !== undefined && totalPlannedClasses > 0 && remainingClasses === 0);

  const selectionKey = sessionId ? `${activeDateStr}-${key}-${sessionId}` : `${activeDateStr}-${key}`;
  const currentSelection = homeSelections[selectionKey];

  const percentage = total === 0 ? 100 : (attended / total) * 100;

  // How many future classes can still be missed
  const canMissCount = Math.max(0, Math.floor((attended * 100 / preferredPercentage) - total));

  // How many classes must be attended
  const needToAttend = Math.max(1, Math.ceil((preferredPercentage * total - 100 * attended) / (100 - preferredPercentage)));
  
  const handleSelection = (selection: 'off' | 'missed' | 'attended') => {
    if (pendingSelection === selection) {
      updateHomeSelection(selectionKey, key, selection, isWard);
      setShowECG(true);
      setTimeout(() => setShowECG(false), 3000);
      setPendingSelection(null);
    } else {
      setPendingSelection(selection);
    }
  };

  const getPercentageColor = (pct: number) => {
    if (pct < preferredPercentage) return 'text-destructive';
    if (pct <= preferredPercentage + 5) return 'text-warning';
    return 'text-success';
  };

  const ecgColor = percentage >= 80 ? "#10b981" : percentage >= 75 ? "#f59e0b" : "#ef4444";

  const targetNeeded = totalPlannedClasses !== undefined ? Math.ceil(totalPlannedClasses * (preferredPercentage / 100)) : Math.ceil(total * (preferredPercentage / 100));
  const isTargetMet = attended >= targetNeeded;

  const getFinishedMessage = () => {
    if (isTargetMet) {
      return `Congrats! Achieved Target (Attended ${attended} of ${totalPlannedClasses || total})`;
    }
    const classesShort = Math.max(1, targetNeeded - attended);
    if (classesShort === 1) {
      return `Ooops!! For 1 more class, you would have been a legend!`;
    }
    if (classesShort % 2 === 0) {
      return `Ooops!! Just ${classesShort} classes short! Even a med student with no sleep could have done that!`;
    }
    return `Ooops!! ${classesShort} more classes and you could have flexed on your batchmates!`;
  };

  const finishedCardBg = isTargetMet
    ? 'bg-emerald-500/20 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 backdrop-blur-md bg-card/80'
    : 'bg-rose-500/20 border-rose-500/60 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 backdrop-blur-md bg-card/80';

  const cardBg = isFinished
    ? finishedCardBg
    : currentSelection === 'attended'
    ? 'bg-emerald-500/15 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'missed'
    ? 'bg-rose-500/15 border-rose-500/60 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'off'
    ? 'bg-amber-500/15 border-amber-500/60 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10 backdrop-blur-md bg-card/80'
    : 'bg-card border-card-border';

  const renderSubtitle = () => {
    if (isFinished) {
      return (
        <span className={cn("font-bold text-sm", isTargetMet ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
          {getFinishedMessage()}
        </span>
      );
    }

    if (total === 0) {
      return <span>No classes conducted yet</span>;
    }

    if (percentage < preferredPercentage) {
      if (remainingClasses !== undefined && needToAttend > remainingClasses) {
        const maxPossiblePct = Math.round(((attended + remainingClasses) / (total + remainingClasses)) * 100);
        return (
          <span className="text-destructive font-medium">
            Unreachable target! Max possible is {maxPossiblePct}%
          </span>
        );
      }
      return (
        <span className="text-destructive font-medium">
          Must attend next <strong className="font-bold">{needToAttend}</strong> {needToAttend === 1 ? 'class' : 'classes'} to reach {preferredPercentage}%
        </span>
      );
    }

    if (canMissCount > 0) {
      return (
        <span>
          On track. Can miss next <strong className="font-bold text-foreground">{canMissCount}</strong> {canMissCount === 1 ? 'class' : 'classes'}
        </span>
      );
    }

    return (
      <span className="text-muted-foreground">
        At target limit. Do not miss next class
      </span>
    );
  };

  return (
    <div 
      className={cn(
        "rounded-2xl p-5 shadow-sm border mb-4 transition-colors duration-300 relative overflow-hidden", 
        cardBg
      )}
    >
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
        <div className="mb-4 relative z-10 text-sm font-medium text-muted-foreground">
          {renderSubtitle()}
        </div>
      )}

      {isFinished ? (
        <div className={cn(
          "w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase text-center border shadow-sm flex items-center justify-center gap-2 relative z-10",
          isTargetMet 
            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40" 
            : "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40"
        )}>
          {isTargetMet && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>NO MORE PLANNED CLASSES!!!</span>
        </div>
      ) : currentSelection ? (
        <div className="w-full relative z-10">
          <button
            type="button"
            onClick={() => handleSelection(currentSelection)}
            className={cn(
              "w-full h-11 flex items-center justify-center gap-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 border cursor-pointer select-none px-4 shadow-md",
              currentSelection === 'attended' && "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-emerald-500/10",
              currentSelection === 'missed' && "bg-rose-500/25 text-rose-700 dark:text-rose-300 border-rose-500/60 ring-2 ring-rose-500/40 shadow-rose-500/10",
              currentSelection === 'off' && "bg-amber-500/25 text-amber-700 dark:text-amber-300 border-amber-500/60 ring-2 ring-amber-500/40 shadow-amber-500/10",
              pendingSelection === currentSelection && "ring-4 scale-[0.99] font-extrabold"
            )}
          >
            {pendingSelection === currentSelection ? (
              <span className="animate-pulse">Confirm Undo?</span>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
                <span className="capitalize">{currentSelection === 'off' ? 'Holiday' : currentSelection}</span>
                <span className="text-[10px] opacity-75 font-normal ml-1">(Tap to Undo)</span>
              </div>
            )}
          </button>
        </div>
      ) : (
        <div className="flex gap-2 w-full relative z-10">
          {/* Attended Button */}
          <button
            type="button"
            onClick={() => handleSelection('attended')}
            className={cn(
              "flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30",
              pendingSelection === 'attended' && "ring-2 ring-inset ring-emerald-500 bg-emerald-500/40 text-emerald-800 dark:text-emerald-200 font-extrabold shadow-md"
            )}
          >
            <span className="truncate whitespace-nowrap">
              {pendingSelection === 'attended' ? 'Confirm?' : 'Attended'}
            </span>
          </button>

          {/* Missed Button */}
          <button
            type="button"
            onClick={() => handleSelection('missed')}
            className={cn(
              "flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-rose-500/10 hover:text-rose-600 hover:border-rose-500/30",
              pendingSelection === 'missed' && "ring-2 ring-inset ring-rose-500 bg-rose-500/40 text-rose-800 dark:text-rose-200 font-extrabold shadow-md"
            )}
          >
            <span className="truncate whitespace-nowrap">
              {pendingSelection === 'missed' ? 'Confirm?' : 'Missed'}
            </span>
          </button>

          {/* Holiday / Off Button */}
          <button
            type="button"
            onClick={() => handleSelection('off')}
            className={cn(
              "flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30",
              pendingSelection === 'off' && "ring-2 ring-inset ring-amber-500 bg-amber-500/40 text-amber-800 dark:text-amber-200 font-extrabold shadow-md"
            )}
          >
            <span className="truncate whitespace-nowrap">
              {pendingSelection === 'off' ? 'Confirm?' : 'Holiday'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

