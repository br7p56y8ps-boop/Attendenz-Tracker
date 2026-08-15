import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAttendance, getSGTKey } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { cn, pctColor, getSubjectColor } from '@/lib/utils';
import { lockScroll, unlockScroll } from '@/lib/scrollLock';
import { ChevronRight, Info, Plus, Minus, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SubjectCardProps {
  subject: string;
  totalPlanned: number;
  isWard?: boolean;
  /** When true, removes the outer card wrapper so this can live inside a parent card */
  isNested?: boolean;
  /** A6 · True when this ward/rotation is the currently active posting → "Ongoing" badge */
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
  const {
    subjectMode,
    customSubjects,
    customWards,
    userAddedSubjects,
    getSubjectPlannedTotal,
    getPresetWardTotalPlanned,
    getCustomWardTotalPlanned,
  } = useCustomData();

  // Build canonical attendance key
  const attendanceKey = isSGT && sgtId
    ? getSGTKey(sgtId)
    : isWard
      ? `ward-${subject}`
      : subject;

  const dataStore = isWard ? wards : subjects;
  const updateFn = isWard ? updateWard : updateSubject;
  const data = dataStore[attendanceKey] || { attended: 0, missed: 0 };
  const isMarkedFinished = finishedMap?.[attendanceKey] || false;

  // Keep ref of latest data for continuous stepping
  const currentDataRef = useRef({ attended: data.attended, missed: data.missed });
  useEffect(() => {
    currentDataRef.current = { attended: data.attended, missed: data.missed };
  }, [data.attended, data.missed]);

  const [showLimitMessage, setShowLimitMessage] = useState(false);
  const [activeStatInfo, setActiveStatInfo] = useState<'remaining' | 'missable' | 'canMiss' | 'required' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Close on Escape + lock background scroll while the details modal is open
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
  const percentageColor = pctColor(percentage, preferredPercentage);
  const isMaxReached = totalConducted >= totalPlanned;

  // ── Planned classes (honours user-added items in both modes) ─────────────
  let originalPlannedClasses: number | undefined;
  if (isWard) {
    if (subjectMode === 'preloaded') {
      const presetWardCount = getPresetWardTotalPlanned(subject);
      originalPlannedClasses = presetWardCount > 0 ? presetWardCount : getSubjectPlannedTotal(subject);
    } else {
      const cWard = customWards?.find(w => w.name.toLowerCase() === subject.toLowerCase());
      originalPlannedClasses = cWard
        ? getCustomWardTotalPlanned(cWard.startDate, cWard.endDate)
        : getPresetWardTotalPlanned(subject);
    }
  } else {
    if (isSGT && sgtId) {
      const sgtSub =
        subjectMode === 'preloaded'
          ? userAddedSubjects?.find(s => s.id === sgtId)
          : customSubjects?.find(s => s.id === sgtId);
      originalPlannedClasses = sgtSub ? sgtSub.plannedClasses : getSubjectPlannedTotal(subject);
    } else if (subjectMode === 'preloaded') {
     const uaSub = userAddedSubjects?.find(s => s.name.toLowerCase() === subject.toLowerCase() && !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'));
      originalPlannedClasses = uaSub ? uaSub.plannedClasses : getSubjectPlannedTotal(subject);
    } else {
     const customSub = customSubjects?.find(s => s.name.toLowerCase() === subject.toLowerCase() && !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'));
      originalPlannedClasses = customSub ? customSub.plannedClasses : getSubjectPlannedTotal(subject);
    }
  }

  // Card background and border color-matched to Current Percentage color
  const cardStyle = {
    backgroundColor: `${percentageColor}14`,
    borderColor: `${percentageColor}38`,
  };

  // B6 · deterministic shared subject color for titles
  const subjectColor = getSubjectColor(subject);

  const ongoingBadge = isActiveWard ? (
    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 whitespace-nowrap">
      Ongoing
    </span>
  ) : null;

  const headerContent = (
    <div className="flex justify-between items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-semibold text-sm sm:text-base leading-tight truncate" style={{ color: subjectColor }}>
            {subject}
          </h4>
          {ongoingBadge}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-1 font-medium">
          <span>Planned: <strong className="text-foreground font-semibold">{totalPlanned}</strong></span>
          <span className="opacity-40">·</span>
          <span>Attended: <strong className="text-foreground font-semibold">{attendedNum}</strong></span>
          <span className="opacity-40">·</span>
          <span>Missed: <strong className="text-foreground font-semibold">{missedNum}</strong></span>
          <span className="opacity-40">·</span>
          <span>Remaining: <strong className="text-foreground font-semibold">{remaining}</strong></span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-base sm:text-lg font-extrabold tracking-tight" style={{ color: percentageColor }}>
          {totalConducted === 0 ? '--' : `${percentage.toFixed(0)}%`}
        </div>
        <div className="text-muted-foreground hover:text-foreground p-0.5">
          <ChevronRight className="w-4 h-4" />
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
      {/* Inline Stat Explanation Card inside the same modal below the 4 containers */}
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
                  className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="text-muted-foreground leading-relaxed text-[11px]">
                {activeStatInfo === 'remaining' && (
                  <>
                    <p className="mb-1 text-foreground font-medium">Remaining scheduled classes yet to be conducted.</p>
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
                    <p className="text-[10px] text-muted-foreground italic">Already conducted classes are not included.</p>
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
      {/* Mark Completed Button (ONLY for Ward/Clinical Rotation subjects) */}
      {isWard && (
        <div className="pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFinished(attendanceKey);
            }}
            className={cn(
              "w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95",
              isMarkedFinished
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30"
                : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
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

      {/* Modal / Popup Overlay for Subject Details - Portaled to Body. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto"
              onClick={closeModal}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 10 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                role="dialog"
                aria-modal="true"
                aria-label={`${subject} details`}
                className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-left relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex justify-between items-start gap-3 border-b border-border/50 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold leading-tight" style={{ color: subjectColor }}>{subject}</h3>
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
                      {totalConducted === 0 ? '--' : `${percentage.toFixed(0)}%`}
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Modal Body */}
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

