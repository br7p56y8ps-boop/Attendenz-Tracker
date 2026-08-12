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
  subtitle?: string;
  tag?: string;
  tagColor?: string;
  sessionId?: string;
  dateStr?: string;
  mode?: 'today' | 'past' | 'future';
  pastSelection?: string;
}

// ── Shortened subject map (identical to Calendar) ─────────────────────────────
const SHORTEN_MAP: Record<string, string> = {
  Surgery: 'Surg.',
  'Obstetrics & Gynaecology': 'Obs & Gyn.',
  Pediatrics: 'Peds.',
  Orthopedics: 'Ortho.',
  Ophthalmology: 'Ophtha.',
  Otolaryngology: 'ENT',
  Dermatology: 'Derm.',
  Psychiatry: 'Psych.',
  'Physical Medicine': 'PMR',
  Radiology: 'Radio.',
  Radiotherapy: 'RadioT.',
  'Nuclear Medicine': 'Nuc Med.',
  Neurosurgery: 'NeuroS.',
  'Pediatric Surgery': 'Peds Surg.',
  'Burn & Plastic Surgery': 'Plastic S.',
  'Internal Medicine': 'Medicine',
  'Phase Integrated Teaching': 'Phase Integrated',
  'Departmental Integrated Teaching': 'Dept. Integrated',
};

function shortenSubject(name: string): string {
  return SHORTEN_MAP[name] || name;
}

// ── Exactly the same key parsing as the Calendar logbook ────────────────────
function parseSelectionKey(key: string): { date: string; label: string } | null {
  const date = key.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rest = key.slice(11);
  const parts = rest.split('-');
  const labelParts = parts.slice(0, -1);
  const label = labelParts.join(' ').replace(/^ward /, '').trim() || rest;
  return { date, label };
}

export const HomeCard = ({
  subject,
  time,
  isWard = false,
  title,
  subtitle,
  tag,
  tagColor,
  sessionId,
  dateStr,
  mode,
  pastSelection,
}: HomeCardProps) => {
  const { subjects, wards, homeSelections, finishedMap, updateHomeSelection, preferredPercentage } =
    useAttendance();
  const {
    customSubjects,
    customWards,
    getSubjectPlannedTotal,
    getPresetWardTotalPlanned,
    getCustomWardTotalPlanned,
  } = useCustomData();
  const activeDateStr = dateStr || getCurrentDateStr();
  const [showECG, setShowECG] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<'off' | 'missed' | 'attended' | null>(
    null
  );

  const key = isWard ? `ward-${subject}` : subject;
  const data = isWard ? wards[key] : subjects[subject];
  const attended = data?.attended || 0;
  const missed = data?.missed || 0;
  const total = attended + missed;

  // ── Planned classes ────────────────────────────────────────────────────────
  let originalPlannedClasses: number | undefined;
  if (isWard) {
    const cWard = customWards?.find(w => w.name.toLowerCase() === subject.toLowerCase());
    if (cWard) {
      originalPlannedClasses = getCustomWardTotalPlanned(cWard.startDate, cWard.endDate);
    } else {
      const presetWardCount = getPresetWardTotalPlanned(subject);
      originalPlannedClasses =
        presetWardCount > 0 ? presetWardCount : getSubjectPlannedTotal(subject);
    }
  } else {
    const customSub = customSubjects?.find(s => s.name.toLowerCase() === subject.toLowerCase());
    originalPlannedClasses = customSub ? customSub.plannedClasses : getSubjectPlannedTotal(subject);
  }

  const isFinishedMarked = finishedMap?.[key] || false;
  const totalPlannedClasses = isFinishedMarked
    ? total > 0
      ? total
      : originalPlannedClasses
    : originalPlannedClasses;
  const remainingClasses =
    totalPlannedClasses !== undefined ? Math.max(0, totalPlannedClasses - total) : undefined;
  const isFinished =
    isFinishedMarked ||
    (totalPlannedClasses !== undefined && totalPlannedClasses > 0 && remainingClasses === 0);

  const selectionKey = sessionId
    ? `${activeDateStr}-${key}-${sessionId}`
    : `${activeDateStr}-${key}`;

  // ── Effective mode ──
  const effectiveMode =
    mode || (dateStr && dateStr !== getCurrentDateStr() ? 'past' : 'today');

  // ── Past‑attendance lookup (with exact recordMap fallback) ──────────────────
  const getPastAttendance = (): string | undefined => {
    const short = shortenSubject(subject);

    // 1. Direct candidate keys
    const candidates: string[] = [];
    if (sessionId) {
      candidates.push(`${activeDateStr}-${sessionId}`, `${activeDateStr}_${sessionId}`);
    }
    candidates.push(`${activeDateStr}-${subject}`, `${activeDateStr}_${subject}`);
    candidates.push(`${activeDateStr}-${short}`, `${activeDateStr}_${short}`);
    if (isWard) {
      candidates.push(
        `${activeDateStr}-ward-${subject}`,
        `${activeDateStr}_ward_${subject}`
      );
      if (sessionId) {
        candidates.push(
          `${activeDateStr}-ward-${subject}-${sessionId}`,
          `${activeDateStr}_ward_${subject}_${sessionId}`
        );
      }
    }
    if (sessionId) {
      candidates.push(
        `${activeDateStr}-${key}-${sessionId}`,
        `${activeDateStr}_${key}_${sessionId}`
      );
    }
    candidates.push(`${activeDateStr}-${key}`, `${activeDateStr}_${key}`);

    for (const c of candidates) {
      if (homeSelections[c]) return homeSelections[c];
    }

    // 2. Fallback: scan all keys, parse like the Calendar logbook
    for (const [fullKey, value] of Object.entries(homeSelections)) {
      const parsed = parseSelectionKey(fullKey);
      if (!parsed) continue;
      if (parsed.date !== activeDateStr) continue;

      if (
        parsed.label.toLowerCase() === subject.toLowerCase() ||
        parsed.label.toLowerCase() === short.toLowerCase()
      ) {
        return value;
      }
    }

    return pastSelection;
  };

  const currentSelection =
    effectiveMode === 'past' ? getPastAttendance() : homeSelections[selectionKey];

  const percentage = total === 0 ? 100 : (attended / total) * 100;

  // ── Attendance action ──────────────────────────────────────────────────────
  const handleSelection = (selection: 'off' | 'missed' | 'attended') => {
    if (effectiveMode !== 'today' || isFinished) return;
    if (pendingSelection === selection) {
      updateHomeSelection(selectionKey, key, selection, isWard);
      setShowECG(true);
      setTimeout(() => setShowECG(false), 3000);
      setPendingSelection(null);
    } else {
      setPendingSelection(selection);
    }
  };

  // ── Color helpers ──────────────────────────────────────────────────────────
  const getPercentageColor = (pct: number) => {
    if (isFinished) return pct < preferredPercentage ? 'text-destructive' : 'text-success';
    if (pct < preferredPercentage) return 'text-destructive';
    if (pct <= preferredPercentage + 5) return 'text-warning';
    return 'text-success';
  };

  const ecgColor =
    percentage >= 80 ? '#10b981' : percentage >= 75 ? '#f59e0b' : '#ef4444';

  // ── OLD FINISHED MESSAGE (today only) ────────────────────────────────────
  const getFinishedMessage = () => {
    const targetNeeded = totalPlannedClasses !== undefined
      ? Math.ceil(totalPlannedClasses * (preferredPercentage / 100))
      : Math.ceil(total * (preferredPercentage / 100));
    const isTargetMet = attended >= targetNeeded;

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

  // ── Render subtitle / message ────────────────────────────────────────────
  const renderSubtitle = () => {
    if (effectiveMode === 'today') {
      if (isFinished) {
        return (
          <span className={cn('font-bold text-sm', getPercentageColor(percentage))}>
            {getFinishedMessage()}
          </span>
        );
      }
      if (total === 0) return <span>No classes conducted yet</span>;

      const canMissCount = Math.max(
        0,
        Math.floor((attended * 100) / preferredPercentage - total)
      );
      const needToAttend = Math.max(
        1,
        Math.ceil((preferredPercentage * total - 100 * attended) / (100 - preferredPercentage))
      );

      if (percentage < preferredPercentage) {
        if (remainingClasses !== undefined && needToAttend > remainingClasses) {
          const maxPossiblePct = Math.round(
            ((attended + remainingClasses) / (total + remainingClasses)) * 100
          );
          return (
            <span className="text-destructive font-medium">
              Unreachable target! Max possible is {maxPossiblePct}%
            </span>
          );
        }
        return (
          <span className="text-destructive font-medium">
            Must attend next <strong className="font-bold">{needToAttend}</strong>{' '}
            {needToAttend === 1 ? 'class' : 'classes'} to reach {preferredPercentage}%
          </span>
        );
      }

      if (canMissCount > 0) {
        return (
          <span>
            On track. Can miss next{' '}
            <strong className="font-bold text-foreground">{canMissCount}</strong>{' '}
            {canMissCount === 1 ? 'class' : 'classes'}
          </span>
        );
      }

      return (
        <span className="text-muted-foreground">
          At target limit. Do not miss next class
        </span>
      );
    }

    if (effectiveMode === 'past') return null;

    if (effectiveMode === 'future') {
      if (isFinished) {
        return (
          <span className="text-sm font-bold text-muted-foreground">
            There will be no more Planned Classes!!
          </span>
        );
      }
      const attPct = total === 0 ? 100 : ((attended + 1) / (total + 1)) * 100;
      const missPct = total === 0 ? 0 : (attended / (total + 1)) * 100;
      const offPct = total === 0 ? 100 : percentage;
      return (
        <div className="text-xs font-medium text-muted-foreground space-y-0.5">
          <div>If attended → {Math.round(attPct)}%</div>
          <div>If missed → {Math.round(missPct)}%</div>
          <div>If off → {Math.round(offPct)}%</div>
        </div>
      );
    }

    return null;
  };

  // ── Card background (past mode still reacts to currentSelection) ─────────────
  const finishedTargetMet = totalPlannedClasses
    ? attended >= Math.ceil(totalPlannedClasses * (preferredPercentage / 100))
    : true;
  const cardBg = isFinished
    ? finishedTargetMet
      ? 'bg-emerald-500/20 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 backdrop-blur-md bg-card/80'
      : 'bg-rose-500/20 border-rose-500/60 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'attended'
    ? 'bg-emerald-500/15 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'missed'
    ? 'bg-rose-500/15 border-rose-500/60 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'off'
    ? 'bg-amber-500/15 border-amber-500/60 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10 backdrop-blur-md bg-card/80'
    : 'bg-card border-card-border';

  // ── Render buttons / bottom area ──────────────────────────────────────────
  const renderBottom = () => {
    if (effectiveMode === 'today') {
      if (isFinished) {
        return (
          <div
            className={cn(
              'w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase text-center border shadow-sm flex items-center justify-center gap-2 relative z-10',
              finishedTargetMet
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40'
            )}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>NO MORE PLANNED CLASSES!!!</span>
          </div>
        );
      }

      if (currentSelection) {
        return (
          <div className="w-full relative z-10">
            <button
              type="button"
              onClick={() => handleSelection(currentSelection)}
              className={cn(
                'w-full h-11 flex items-center justify-center gap-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 border cursor-pointer select-none px-4 shadow-md',
                currentSelection === 'attended' &&
                  'bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-emerald-500/10',
                currentSelection === 'missed' &&
                  'bg-rose-500/25 text-rose-700 dark:text-rose-300 border-rose-500/60 ring-2 ring-rose-500/40 shadow-rose-500/10',
                currentSelection === 'off' &&
                  'bg-amber-500/25 text-amber-700 dark:text-amber-300 border-amber-500/60 ring-2 ring-amber-500/40 shadow-amber-500/10',
                pendingSelection === currentSelection &&
                  'ring-4 scale-[0.99] font-extrabold'
              )}
            >
              {pendingSelection === currentSelection ? (
                <span className="animate-pulse">Confirm Undo?</span>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
                  <span className="capitalize">
                    {currentSelection === 'off' ? 'Holiday' : currentSelection}
                  </span>
                  <span className="text-[10px] opacity-75 font-normal ml-1">
                    (Tap to Undo)
                  </span>
                </div>
              )}
            </button>
          </div>
        );
      }

      return (
        <div className="flex gap-2 w-full relative z-10">
          <button
            type="button"
            onClick={() => handleSelection('attended')}
            className={cn(
              'flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30',
              pendingSelection === 'attended' &&
                'ring-2 ring-inset ring-emerald-500 bg-emerald-500/40 text-emerald-800 dark:text-emerald-200 font-extrabold shadow-md'
            )}
          >
            <span className="truncate whitespace-nowrap">
              {pendingSelection === 'attended' ? 'Confirm?' : 'Attended'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleSelection('missed')}
            className={cn(
              'flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-rose-500/10 hover:text-rose-600 hover:border-rose-500/30',
              pendingSelection === 'missed' &&
                'ring-2 ring-inset ring-rose-500 bg-rose-500/40 text-rose-800 dark:text-rose-200 font-extrabold shadow-md'
            )}
          >
            <span className="truncate whitespace-nowrap">
              {pendingSelection === 'missed' ? 'Confirm?' : 'Missed'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleSelection('off')}
            className={cn(
              'flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30',
              pendingSelection === 'off' &&
                'ring-2 ring-inset ring-amber-500 bg-amber-500/40 text-amber-800 dark:text-amber-200 font-extrabold shadow-md'
            )}
          >
            <span className="truncate whitespace-nowrap">
              {pendingSelection === 'off' ? 'Confirm?' : 'Holiday'}
            </span>
          </button>
        </div>
      );
    }

    // ── PAST – unified muted text style ──────────────────────────────────────
    if (effectiveMode === 'past') {
      let message = '';
      if (currentSelection) {
        const label = currentSelection === 'off' ? 'Holiday' : currentSelection;
        message = label.charAt(0).toUpperCase() + label.slice(1);
      } else if (isFinished) {
        message = 'There were no Planned Class!!';
      } else {
        message = 'Not marked';
      }

      return (
        <div className="w-full relative z-10">
          <p className="text-sm font-medium text-muted-foreground text-center py-2">
            {message}
          </p>
        </div>
      );
    }

    // ── FUTURE – no buttons ──
    return null;
  };

  return (
    <div
      className={cn(
        'rounded-2xl p-5 shadow-sm border mb-4 transition-colors duration-300 relative overflow-hidden',
        cardBg
      )}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div className="pr-4">
          {isWard ? (
            <>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold leading-tight text-foreground">
                  {title || subject}
                </h3>
                {tag && (
                  <span
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                      tagColor === 'primary'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {tag}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-sm font-semibold text-foreground/80 mt-1">
                  {subtitle}
                </p>
              )}
              <p className="text-muted-foreground text-sm mt-1">{time}</p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold leading-tight text-foreground">
                {title || subject}
              </h3>
              <p className="text-muted-foreground text-sm mt-1">{time}</p>
            </>
          )}
        </div>
        <div
          className={cn('text-lg font-bold min-w-max', getPercentageColor(percentage))}
        >
          {total === 0 ? '--' : `${percentage.toFixed(0)}%`}
        </div>
      </div>

      {/* ECG animation */}
      <AnimatePresence>
        {showECG && effectiveMode === 'today' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none flex items-center justify-center z-0"
          >
            <svg
              className="w-full h-24 opacity-40"
              preserveAspectRatio="none"
              viewBox="0 0 100 40"
            >
              <motion.path
                d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 30 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 60 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 90 20 L 100 20"
                fill="none"
                stroke={ecgColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.5, ease: 'easeInOut' }}
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtitle / status */}
      {effectiveMode !== 'past' && (
        <div className="mb-4 relative z-10 text-sm font-medium text-muted-foreground">
          {renderSubtitle()}
        </div>
      )}

      {/* Bottom area */}
      {renderBottom()}
    </div>
  );
};
