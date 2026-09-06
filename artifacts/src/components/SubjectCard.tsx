import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { cn, pctColor, getSubjectColor } from '@/lib/utils';
import { lockScroll, unlockScroll } from '@/lib/scrollLock';
import { CountStepper } from '@/components/CountStepper';
import { Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SubjectCardProps {
  subject: string;
  totalPlanned: number;
  isWard?: boolean;
  /** When true, removes the outer card wrapper so this can live inside a parent card */
  isNested?: boolean;
  /** True when this ward/rotation is the currently active posting → "Ongoing" badge */
  isActiveWard?: boolean;
  /** SGT-specific props */
  isSGT?: boolean;
  sgtId?: string;
}

export const SubjectCard = ({
  subject,
  totalPlanned,
  isWard = false,
  isNested = false,
  isActiveWard = false,
  isSGT = false,
  sgtId,
}: SubjectCardProps) => {
  const { subjects, wards, finishedMap, updateSubject, updateWard, toggleFinished, preferredPercentage } = useAttendance();
  const { subjectMode, getPresetSubjectDisplayName, getSubjectIdByName } = useCustomData();

  const displayName = subjectMode === 'preloaded' ? getPresetSubjectDisplayName(subject) : subject;

  const resolvedId = getSubjectIdByName(subject, isWard ? 'clinical' : 'academic');
  const attendanceKey: string | null = isSGT && sgtId
    ? getSGTKey(sgtId)
    : resolvedId
      ? (isWard ? getWardAttendanceKey(resolvedId) : getAcademicAttendanceKey(resolvedId))
      : null;

  const dataStore = isWard ? wards : subjects;
  const updateFn = isWard ? updateWard : updateSubject;
  const data = attendanceKey ? dataStore[attendanceKey] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
  const isMarkedFinished = attendanceKey ? finishedMap?.[attendanceKey] || false : false;

  const currentDataRef = useRef({ attended: data.attended, missed: data.missed });
  useEffect(() => {
    currentDataRef.current = { attended: data.attended, missed: data.missed };
  }, [data.attended, data.missed]);

  const [showLimitMessage, setShowLimitMessage] = useState(false);
  const [activeStatInfo, setActiveStatInfo] = useState<'remaining' | 'missable' | 'canMiss' | 'required' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    lockScroll();
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockScroll();
    };
  }, [isModalOpen]);

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveStatInfo(null);
    setShowLimitMessage(false);
  };

  const openModal = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('[role="dialog"]')
    ) {
      return;
    }
    setIsModalOpen(true);
  };

  const handleStep = (field: 'attended' | 'missed', change: number) => {
    if (!attendanceKey) return false;
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
    updateFn(attendanceKey, newAttended, newMissed);
    return true;
  };

  const attendedNum = data.attended;
  const missedNum = data.missed;
  const totalConducted = attendedNum + missedNum;
  const percentage = totalConducted === 0 ? 0 : (attendedNum / totalConducted) * 100;
  const targetPct = preferredPercentage || 75;
  const remaining = Math.max(0, totalPlanned - totalConducted);
  const maxMissable = Math.floor(totalPlanned * (1 - targetPct / 100));
  const canStillMiss = Math.max(0, maxMissable - missedNum);
  const rawRequired = Math.max(0, Math.ceil(totalPlanned * (targetPct / 100)) - attendedNum);
  const requiredToAttend = rawRequired > remaining ? "Not possible" : rawRequired;
  const isMaxReached = totalConducted >= totalPlanned;
  const percentageColor = pctColor(percentage, preferredPercentage, {
    isFinished: isMarkedFinished || isMaxReached,
    hasPlannedClasses: totalPlanned > 0,
  });

  const cardStyle = {
    backgroundColor: `${percentageColor}14`,
    borderColor: `${percentageColor}38`,
  };

  const subjectColor = getSubjectColor(subject);

  const ongoingBadge = isActiveWard ? (
    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 whitespace-nowrap">
      Ongoing
    </span>
  ) : null;

  const headerContent = (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1 pr-2">
        <div className="flex items-center gap-2 flex-wrap">
           <h4 className="font-semibold text-sm sm:text-base leading-tight truncate" style={{ color: subjectColor }}>
            {displayName}
          </h4>
          {ongoingBadge}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] sm:text-xs text-muted-foreground font-medium" aria-label="Subject attendance summary">
          <span className="min-w-0 truncate">Planned: <strong className="text-foreground font-semibold">{totalPlanned}</strong></span>
          <span className="min-w-0 truncate">Conducted: <strong className="text-foreground font-semibold">{totalConducted}</strong></span>
          <span className="min-w-0 truncate">Attended: <strong className="text-foreground font-semibold">{attendedNum}</strong></span>
          <span className="min-w-0 truncate">Remaining: <strong className="text-foreground font-semibold">{remaining}</strong></span>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <div className="percentage-3d-container flex h-14 w-20 items-center justify-center rounded-xl border border-border/70 bg-background/40 px-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_5px_rgba(0,0,0,0.18)]">
          <div className="text-base sm:text-lg font-extrabold tracking-tight" style={{ color: percentageColor }}>
          {`${percentage.toFixed(2)}%`}
          </div>
        </div>
      </div>
    </div>
  );

  const Stepper = ({ field, value }: { field: 'attended' | 'missed', value: number }) => (
    <CountStepper
      label={field}
      value={value}
      onDecrement={() => { handleStep(field, -1); }}
      onIncrement={() => { handleStep(field, 1); }}
      decrementDisabled={value <= 0}
      incrementDisabled={isMaxReached}
      ariaLabel={field}
    />
  );

  const modalDetailsContent = (
    <div className="space-y-4 pt-1">
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
          role="button" tabIndex={0} aria-expanded={activeStatInfo === 'remaining'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setActiveStatInfo(prev => prev === 'remaining' ? null : 'remaining'); } }}
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo(prev => prev === 'remaining' ? null : 'remaining'); }}
          className={cn(
            "flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer",
            activeStatInfo === 'remaining' ? "bg-primary/15 border-primary ring-2 ring-primary/40 shadow-sm" : "bg-muted/20 border-border/40 hover:bg-muted/40 active:scale-95"
          )}
        >
          <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Remaining</span>
          <span className="text-sm font-bold text-foreground">{remaining}</span>
        </div>
        <div
          role="button" tabIndex={0} aria-expanded={activeStatInfo === 'missable'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setActiveStatInfo(prev => prev === 'missable' ? null : 'missable'); } }}
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo(prev => prev === 'missable' ? null : 'missable'); }}
          className={cn(
            "flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer",
            activeStatInfo === 'missable' ? "bg-primary/15 border-primary ring-2 ring-primary/40 shadow-sm" : "bg-muted/20 border-border/40 hover:bg-muted/40 active:scale-95"
          )}
        >
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Missable</span>
          <span className="text-sm font-bold text-foreground">{maxMissable}</span>
        </div>
        <div
          role="button" tabIndex={0} aria-expanded={activeStatInfo === 'canMiss'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setActiveStatInfo(prev => prev === 'canMiss' ? null : 'canMiss'); } }}
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo(prev => prev === 'canMiss' ? null : 'canMiss'); }}
          className={cn(
            "flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer",
            activeStatInfo === 'canMiss' ? "bg-primary/15 border-primary ring-2 ring-primary/40 shadow-sm" : "bg-muted/20 border-border/40 hover:bg-muted/40 active:scale-95"
          )}
        >
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Can Miss</span>
          <span className="text-sm font-bold text-success">{canStillMiss}</span>
        </div>
        <div
          role="button" tabIndex={0} aria-expanded={activeStatInfo === 'required'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setActiveStatInfo(prev => prev === 'required' ? null : 'required'); } }}
          onClick={(e) => { e.stopPropagation(); setActiveStatInfo(prev => prev === 'required' ? null : 'required'); }}
          className={cn(
            "flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer",
            activeStatInfo === 'required' ? "bg-primary/15 border-primary ring-2 ring-primary/40 shadow-sm" : "bg-muted/20 border-border/40 hover:bg-muted/40 active:scale-95"
          )}
        >
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Required</span>
          <span className={cn("font-bold text-center leading-tight", rawRequired > remaining ? "text-[10px] text-destructive" : "text-sm text-primary")}>{requiredToAttend}</span>
        </div>
      </div>
      {/* Inline Stat Explanation Card */}
      <AnimatePresence>
        {activeStatInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-3"
          >
            <div className="bg-muted/40 border border-primary/30 rounded-2xl p-3 text-xs text-foreground space-y-1.5 relative">
              <div className="flex items-center justify-between font-bold text-primary text-xs">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  {activeStatInfo === 'remaining' && 'Remaining Classes'}
                  {activeStatInfo === 'missable' && 'Total Missable'}
                  {activeStatInfo === 'canMiss' && 'Can Miss Now'}
                  {activeStatInfo === 'required' && 'Required Classes'}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveStatInfo(null); }}
                  className="action-button action-button--close action-button--icon"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="text-muted-foreground leading-relaxed text-[11px]">
                {activeStatInfo === 'remaining' && (
                  <>
                    <p className="mb-1 text-foreground font-medium">Remaining scheduled Classes yet to be conducted.</p>
                    <div className="bg-background/80 p-2 rounded-lg text-[10px] font-mono text-muted-foreground border border-border/50">
                      Formula: Planned − (Attended + Missed)
                    </div>
                  </>
                )}
                {activeStatInfo === 'missable' && (
                  <p className="text-foreground font-medium">Maximum total classes that may be missed across the entire planned curriculum while still achieving {preferredPercentage}% attendance.</p>
                )}
                {activeStatInfo === 'canMiss' && (
                  <>
                    <p className="text-foreground font-medium mb-1">Maximum additional remaining classes that can still be missed while achieving {preferredPercentage}%.</p>
                    <p className="text-[10px] text-muted-foreground italic">Already conducted Classes are not included.</p>
                  </>
                )}
                {activeStatInfo === 'required' && (
                  <p className="text-foreground font-medium">Minimum number of remaining classes that must be attended to reach or maintain {preferredPercentage}% attendance.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Mark Completed Button */}
      {isWard && (
        <div className="pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (attendanceKey) toggleFinished(attendanceKey);
            }}
            className={cn(
              "action-button w-full",
              isMarkedFinished
                ? "action-button--warning"
                : "action-button--edit"
            )}
          >
            <span>{isMarkedFinished ? 'Finished Early (Click to Re-open)' : 'Mark as Finished'}</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        onClick={openModal}
        style={cardStyle}
        className={cn(
          "rounded-2xl border transition-all cursor-pointer select-none hover:shadow-sm",
          !isNested && "p-4 sm:p-5 shadow-sm",
          isNested && "p-3.5 sm:p-4 my-1 mx-2 sm:mx-3 rounded-xl hover:brightness-95",
          isActiveWard && !isNested && "ring-1 ring-emerald-500/40"
        )}
      >
        {headerContent}
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-end justify-center p-4 overflow-hidden"
              onClick={closeModal}
            >
              <motion.div
                initial={{ y: 48, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 48, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                role="dialog"
                aria-modal="true"
                aria-label={`${displayName} details`}
                className="modal-sheet-content bg-card backdrop-blur-2xl border border-border/80 rounded-3xl p-6 w-full max-w-md max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4 text-left relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-start gap-3 border-b border-border/50 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                     <h3 className="text-xl font-bold leading-tight" style={{ color: subjectColor }}>{displayName}</h3>
                      {ongoingBadge}
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      {isWard ? 'Clinical Rotation' : 'Lecture'} · Planned: {totalPlanned}
                    </p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Attended: <span className="text-foreground font-semibold">{attendedNum}</span> · Missed: <span className="text-foreground font-semibold">{missedNum}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-xl font-bold" style={{ color: percentageColor }}>
                      {`${percentage.toFixed(2)}%`}
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="action-button action-button--close action-button--icon"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {modalDetailsContent}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
