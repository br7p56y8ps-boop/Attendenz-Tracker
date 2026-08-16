import React, { useState, useRef, useEffect } from 'react';
import { useAttendance, getSGTKey } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { cn, getCurrentDateStr, getSubjectColor } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

interface HomeCardProps {
  subject: string; time: string; isWard?: boolean; title?: string; subtitle?: string;
  tag?: string; tagColor?: string; sessionId?: string; dateStr?: string;
  mode?: 'today' | 'past' | 'future'; pastSelection?: string; isSGT?: boolean; sgtId?: string;
}

const SHORTEN_MAP: Record<string, string> = {
  Surgery: 'Surg.', 'Obstetrics & Gynaecology': 'Obs & Gyn.', Pediatrics: 'Peds.',
  Orthopedics: 'Ortho.', Ophthalmology: 'Ophtha.', Otolaryngology: 'ENT',
  Dermatology: 'Derm.', Psychiatry: 'Psych.', 'Physical Medicine': 'PMR',
  Radiology: 'Radio.', Radiotherapy: 'RadioT.', 'Nuclear Medicine': 'Nuc Med.',
  Neurosurgery: 'NeuroS.', 'Pediatric Surgery': 'Peds Surg.', 'Burn & Plastic Surgery': 'Plastic S.',
  'Internal Medicine': 'Medicine', 'Phase Integrated Teaching': 'Phase Integrated',
  'Departmental Integrated Teaching': 'Dept. Integrated',
};
function shortenSubject(name: string): string { return SHORTEN_MAP[name] || name; }

function parseSelectionKey(key: string): { date: string; label: string } | null {
  const date = key.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rest = key.slice(11);
  const parts = rest.split('-');
  const label = parts.slice(0, -1).join(' ').replace(/^ward /, '').trim() || rest;
  return { date, label };
}

const SeverityRing = ({ sev, hex }: { sev: 'must' | 'can' | 'safe'; hex: string }) => {
  const label = sev === 'must' ? ['Must', 'Attend'] : sev === 'can' ? ['Can', 'Miss'] : ['Safe', 'Miss'];
  return (
    <div className="relative w-12 h-12 shrink-0">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="none" stroke={hex} strokeOpacity="0.25" strokeWidth="3.5" />
        <circle cx="24" cy="24" r="20" fill="none" stroke={hex} strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[8px] font-extrabold" style={{ color: hex }}>{label[0]}</span>
        <span className="text-[8px] font-extrabold" style={{ color: hex }}>{label[1]}</span>
      </div>
    </div>
  );
};

const TypedLine = ({ selection, conducted, planned, animate }: { selection: string; conducted: number; planned: number | undefined; animate: boolean }) => {
  const word = selection === 'attended' ? 'Attended' : 'Missed';
  const wordC = selection === 'attended' ? 'text-emerald-500' : 'text-rose-500';
  const segs = [
    { t: word + ' ', c: wordC },
    { t: '(Class - ', c: 'text-muted-foreground' },
    { t: String(conducted), c: wordC },
    { t: '/' + (planned ?? conducted) + ')', c: 'text-foreground/80' },
  ];
  const full = segs.map(s => s.t).join('');
  const [n, setN] = useState(animate ? 0 : full.length);
  useEffect(() => {
    if (!animate) { setN(full.length); return; }
    let i = 0;
    const id = setInterval(() => { i++; setN(i); if (i >= full.length) clearInterval(id); }, 50);
    return () => clearInterval(id);
  }, [full, animate]);
  let rem = n;
  const out: React.ReactNode[] = [];
  segs.forEach((s, idx) => {
    const take = Math.max(0, Math.min(s.t.length, rem));
    if (take > 0) out.push(<span key={idx} className={cn('font-extrabold', s.c)}>{s.t.slice(0, take)}</span>);
    rem -= take;
  });
  return <p className="text-base font-extrabold mt-1">{out}</p>;
};

export const HomeCard = ({ subject, time, isWard = false, title, subtitle, tag, tagColor, sessionId, dateStr, mode, pastSelection, isSGT = false, sgtId }: HomeCardProps) => {
  const { subjects, wards, homeSelections, finishedMap, updateHomeSelection, preferredPercentage } = useAttendance();
  const { subjectMode, customSubjects, customWards, userAddedSubjects, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned } = useCustomData();
  const activeDateStr = dateStr || getCurrentDateStr();
  const [showECG, setShowECG] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<'off' | 'missed' | 'attended' | null>(null);
  const [justMarked, setJustMarked] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const attendanceKey = isSGT && sgtId ? getSGTKey(sgtId) : isWard ? `ward-${subject}` : subject;
  const data = isWard ? wards[attendanceKey] : subjects[attendanceKey];
  const attended = data?.attended || 0;
  const missed = data?.missed || 0;
  const total = attended + missed;

  let originalPlannedClasses: number | undefined;
  if (isWard) {
    const cWard = customWards?.find(w => w.name.toLowerCase() === subject.toLowerCase());
    if (cWard) originalPlannedClasses = getCustomWardTotalPlanned(cWard.startDate, cWard.endDate);
    else { const p = getPresetWardTotalPlanned(subject); originalPlannedClasses = p > 0 ? p : getSubjectPlannedTotal(subject); }
  } else {
    if (isSGT && sgtId) {
      const sgtSub = subjectMode === 'preloaded' ? userAddedSubjects?.find(s => s.id === sgtId) : customSubjects?.find(s => s.id === sgtId);
      originalPlannedClasses = sgtSub ? sgtSub.plannedClasses : getSubjectPlannedTotal(subject);
    } else if (subjectMode === 'preloaded') {
      const uaSub = userAddedSubjects?.find(s => s.name.toLowerCase() === subject.toLowerCase() && !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'));
      originalPlannedClasses = uaSub ? uaSub.plannedClasses : getSubjectPlannedTotal(subject);
    } else {
      const customSub = customSubjects?.find(s => s.name.toLowerCase() === subject.toLowerCase() && !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'));
      originalPlannedClasses = customSub ? customSub.plannedClasses : getSubjectPlannedTotal(subject);
    }
  }
  const isFinishedMarked = finishedMap?.[attendanceKey] || false;
  const totalPlannedClasses = isFinishedMarked ? (total > 0 ? total : originalPlannedClasses) : originalPlannedClasses;
  const remainingClasses = totalPlannedClasses !== undefined ? Math.max(0, totalPlannedClasses - total) : undefined;
  const isFinished = isFinishedMarked || (totalPlannedClasses !== undefined && totalPlannedClasses > 0 && remainingClasses === 0);

  const selectionKey = sessionId ? `${activeDateStr}-${attendanceKey}-${sessionId}` : `${activeDateStr}-${attendanceKey}`;
  const effectiveMode = mode || (dateStr && dateStr !== getCurrentDateStr() ? 'past' : 'today');

  // ── 7-day future window ──
  const todayStr = getCurrentDateStr();
  const daysFromToday = Math.round((new Date(activeDateStr + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000);
  const withinWeek = daysFromToday >= 0 && daysFromToday <= 7;

  // ── severity projection ──
  const projection = (() => {
    const remaining = remainingClasses ?? 0;
    const neededTotal = totalPlannedClasses !== undefined ? Math.ceil(totalPlannedClasses * (preferredPercentage / 100)) : 0;
    const neededFromRemaining = Math.max(0, neededTotal - attended);
    const canMiss = remaining - neededFromRemaining;
    const sev: 'must' | 'can' | 'safe' = canMiss <= 0 ? 'must' : canMiss === 1 ? 'can' : 'safe';
    const color = sev === 'must' ? 'text-rose-500' : sev === 'can' ? 'text-amber-500' : 'text-emerald-500';
    const hex = sev === 'must' ? '#ef4444' : sev === 'can' ? '#f59e0b' : '#10b981';
    const num = sev === 'must' ? Math.min(neededFromRemaining, remaining) : canMiss;
    return { sev, color, hex, num };
  })();

  const getPastAttendance = (): string | undefined => {
    const short = shortenSubject(subject);
    const candidates: string[] = [];
    if (sessionId) candidates.push(`${activeDateStr}-${sessionId}`, `${activeDateStr}_${sessionId}`);
    candidates.push(`${activeDateStr}-${subject}`, `${activeDateStr}_${subject}`, `${activeDateStr}-${short}`, `${activeDateStr}_${short}`);
    if (isWard) {
      candidates.push(`${activeDateStr}-ward-${subject}`, `${activeDateStr}_ward_${subject}`);
      if (sessionId) candidates.push(`${activeDateStr}-ward-${subject}-${sessionId}`, `${activeDateStr}_ward_${subject}_${sessionId}`);
    }
    if (isSGT && sgtId) {
      candidates.push(`${activeDateStr}-sgt:${sgtId}`, `${activeDateStr}_sgt:${sgtId}`, `${activeDateStr}-${subject}-sgt-${sgtId}`, `${activeDateStr}_${subject}_sgt_${sgtId}`);
      if (sessionId) candidates.push(`${activeDateStr}-sgt:${sgtId}-${sessionId}`, `${activeDateStr}_sgt:${sgtId}_${sessionId}`);
    }
    if (sessionId) candidates.push(`${activeDateStr}-${attendanceKey}-${sessionId}`, `${activeDateStr}_${attendanceKey}_${sessionId}`);
    candidates.push(`${activeDateStr}-${attendanceKey}`, `${activeDateStr}_${attendanceKey}`);
    for (const c of candidates) if (homeSelections[c]) return homeSelections[c];
    for (const [fullKey, value] of Object.entries(homeSelections)) {
      const parsed = parseSelectionKey(fullKey);
      if (!parsed || parsed.date !== activeDateStr) continue;
      if (parsed.label.toLowerCase() === subject.toLowerCase() || parsed.label.toLowerCase() === short.toLowerCase()) return value;
    }
    return pastSelection;
  };
  const currentSelection = effectiveMode === 'past' ? getPastAttendance() : homeSelections[selectionKey];
  const percentage = total === 0 ? 100 : (attended / total) * 100;

  const restMatches = (rest: string): boolean => {
    const r = rest.toLowerCase();
    const norms = [subject.toLowerCase(), shortenSubject(subject).toLowerCase(), attendanceKey.toLowerCase()];
    if (isSGT && sgtId) norms.push(`sgt:${sgtId.toLowerCase()}`);
    if (norms.some(n => r === n)) return true;
    if (sessionId && (r === sessionId || r === `${attendanceKey.toLowerCase()}-${sessionId}` || r === `${subject.toLowerCase()}-${sessionId}`)) return true;
    if (norms.some(n => r.startsWith(n + '-') || r.startsWith(n + '_'))) return true;
    if (isWard && (r === `ward-${subject.toLowerCase()}` || r.startsWith(`ward-${subject.toLowerCase()}-`) || r === `ward ${subject.toLowerCase()}`)) return true;
    return false;
  };
  const pastCounts = (() => {
    if (effectiveMode !== 'past') return null;
    let att = 0, mis = 0;
    for (const [fullKey, value] of Object.entries(homeSelections)) {
      const date = fullKey.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > activeDateStr) continue;
      if (value !== 'attended' && value !== 'missed') continue;
      if (!restMatches(fullKey.slice(11))) continue;
      if (value === 'attended') att += 1; else mis += 1;
    }
    return { att, mis, conducted: att + mis };
  })();
  const pastPct = pastCounts && pastCounts.conducted > 0 ? (pastCounts.att / pastCounts.conducted) * 100 : null;

  const handleSelection = (selection: 'off' | 'missed' | 'attended') => {
    if (effectiveMode !== 'today' || isFinished) return;
    if (pendingSelection === selection) {
      updateHomeSelection(selectionKey, attendanceKey, selection, isWard);
      setJustMarked(true);
      setShowECG(true);
      setTimeout(() => setShowECG(false), 3000);
      setPendingSelection(null);
    } else setPendingSelection(selection);
  };

  const getPercentageColor = (pct: number) => {
    if (pct < preferredPercentage) return 'text-destructive';
    if (pct <= preferredPercentage + 5) return 'text-warning';
    return 'text-success';
  };
  const ecgColor = percentage >= 80 ? '#10b981' : percentage >= 75 ? '#f59e0b' : '#ef4444';
  const subjectColor = getSubjectColor(subject);

  const getFinishedMessage = () => {
    const targetNeeded = totalPlannedClasses !== undefined ? Math.ceil(totalPlannedClasses * (preferredPercentage / 100)) : Math.ceil(total * (preferredPercentage / 100));
    if (attended >= targetNeeded) return `Congrats! Achieved Target (Attended ${attended} of ${totalPlannedClasses || total})`;
    const classesShort = Math.max(1, targetNeeded - attended);
    if (classesShort === 1) return `Ooops!! For 1 more class, you would have been a legend!`;
    if (classesShort % 2 === 0) return `Ooops!! Just ${classesShort} classes short! Even a med student with no sleep could have done that!`;
    return `Ooops!! ${classesShort} more classes and you could have flexed on your batchmates!`;
  };

  const renderSubtitle = () => {
    if (effectiveMode === 'today') {
      if (currentSelection) return null; // typed line shows in header after marking
      if (isFinished) return <span className={cn('font-bold text-sm', getPercentageColor(percentage))}>{getFinishedMessage()}</span>;
      if (total === 0) return <span>No classes conducted yet</span>;
      const canMissCount = Math.max(0, Math.floor((attended * 100) / preferredPercentage - total));
      const needToAttend = Math.max(1, Math.ceil((preferredPercentage * total - 100 * attended) / (100 - preferredPercentage)));
      if (percentage < preferredPercentage) {
        if (remainingClasses !== undefined && needToAttend > remainingClasses) {
          const maxPossiblePct = Math.round(((attended + remainingClasses) / (total + remainingClasses)) * 100);
          return <span className="text-destructive font-medium">Unreachable target! Max possible is {maxPossiblePct}%</span>;
        }
        return <span className="text-destructive font-medium">Must attend next <strong className="font-bold">{needToAttend}</strong> {needToAttend === 1 ? 'class' : 'classes'} to reach {preferredPercentage}%</span>;
      }
      if (canMissCount > 0) return <span>On track. Can miss next <strong className="font-bold text-foreground">{canMissCount}</strong> {canMissCount === 1 ? 'class' : 'classes'}</span>;
      return <span className="text-muted-foreground">At target limit. Do not miss next class</span>;
    }
    return null; // past & future: no subtitle line
  };

  const finishedTargetMet = totalPlannedClasses ? attended >= Math.ceil(totalPlannedClasses * (preferredPercentage / 100)) : true;
  const cardBg = isFinished
    ? finishedTargetMet ? 'bg-emerald-500/20 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 backdrop-blur-md bg-card/80'
      : 'bg-rose-500/20 border-rose-500/60 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'attended' ? 'bg-emerald-500/15 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'missed' ? 'bg-rose-500/15 border-rose-500/60 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/10 backdrop-blur-md bg-card/80'
    : currentSelection === 'off' ? 'bg-amber-500/15 border-amber-500/60 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10 backdrop-blur-md bg-card/80'
    : 'bg-card border-card-border';

  const renderBottom = () => {
    if (effectiveMode === 'today') {
      if (isFinished) {
        return (
          <div className={cn('w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase text-center border shadow-sm flex items-center justify-center gap-2 relative z-10',
            finishedTargetMet ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40')}>
            <CheckCircle2 className="w-4 h-4 shrink-0" /><span>NO MORE PLANNED CLASSES!!!</span>
          </div>
        );
      }
      if (currentSelection) {
        return (
          <div className="w-full relative z-10">
            <button type="button" onClick={() => handleSelection(currentSelection)}
              className={cn('w-full h-11 flex items-center justify-center gap-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 border cursor-pointer select-none px-4 shadow-md',
                currentSelection === 'attended' && 'bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-emerald-500/10',
                currentSelection === 'missed' && 'bg-rose-500/25 text-rose-700 dark:text-rose-300 border-rose-500/60 ring-2 ring-rose-500/40 shadow-rose-500/10',
                currentSelection === 'off' && 'bg-amber-500/25 text-amber-700 dark:text-amber-300 border-amber-500/60 ring-2 ring-amber-500/40 shadow-amber-500/10',
                pendingSelection === currentSelection && 'ring-4 scale-[0.99] font-extrabold')}>
              {pendingSelection === currentSelection ? <span className="animate-pulse">Confirm Undo?</span> : (
                <div className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4.5 h-4.5 shrink-0" /><span className="capitalize">{currentSelection === 'off' ? 'Holiday' : currentSelection}</span></div>
              )}
            </button>
          </div>
        );
      }
      return (
        <div className="flex gap-2 w-full relative z-10">
          <button type="button" onClick={() => handleSelection('attended')} className={cn('flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/30', pendingSelection === 'attended' && 'ring-2 ring-inset ring-emerald-500 bg-emerald-500/40 text-emerald-800 dark:text-emerald-200 font-extrabold shadow-md')}>
            <span className="truncate whitespace-nowrap">{pendingSelection === 'attended' ? 'Confirm?' : 'Attended'}</span>
          </button>
          <button type="button" onClick={() => handleSelection('missed')} className={cn('flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-rose-500/10 hover:text-rose-600 hover:border-rose-500/30', pendingSelection === 'missed' && 'ring-2 ring-inset ring-rose-500 bg-rose-500/40 text-rose-800 dark:text-rose-200 font-extrabold shadow-md')}>
            <span className="truncate whitespace-nowrap">{pendingSelection === 'missed' ? 'Confirm?' : 'Missed'}</span>
          </button>
          <button type="button" onClick={() => handleSelection('off')} className={cn('flex-1 h-11 flex items-center justify-center min-w-0 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer select-none px-2 overflow-hidden box-border bg-background/70 text-muted-foreground border-border hover:bg-amber-500/10 hover:text-amber-600 hover:border-amber-500/30', pendingSelection === 'off' && 'ring-2 ring-inset ring-amber-500 bg-amber-500/40 text-amber-800 dark:text-amber-200 font-extrabold shadow-md')}>
            <span className="truncate whitespace-nowrap">{pendingSelection === 'off' ? 'Confirm?' : 'Holiday'}</span>
          </button>
        </div>
      );
    }
    if (effectiveMode === 'past') return null;
    if (effectiveMode === 'future') {
      if (isFinished) return <div className="w-full text-center relative z-10"><span className="text-sm font-bold text-muted-foreground">There will be No More Planned Classes!!</span></div>;
      if (!withinWeek) return <div className="w-full text-center relative z-10"><span className="text-sm font-semibold text-muted-foreground">Yet to be Conducted</span></div>;
      return (
        <div className="w-full text-left relative z-10">
          <span className={cn('text-base font-semibold', projection.color)}>
            {projection.sev === 'must'
              ? <>Must attend the remaining <strong className="font-extrabold">{projection.num}</strong> {projection.num === 1 ? 'class' : 'classes'}</>
              : <>Can miss <strong className="font-extrabold">{projection.num}</strong> {projection.num === 1 ? 'class' : 'classes'}</>}
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div ref={cardRef} className={cn('rounded-2xl p-5 shadow-sm border mb-4 transition-colors duration-300 relative overflow-hidden', effectiveMode === 'today' ? cardBg : 'bg-card')}
      style={effectiveMode !== 'today' ? { borderColor: subjectColor } : undefined}>
      {effectiveMode === 'past' ? (
        <div className="flex items-center justify-between gap-3 mb-2 relative z-10">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-xl font-bold leading-tight truncate" style={{ color: subjectColor }}>{title || subject}</h3>
              {tag && <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tagColor === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{tag}</span>}
            </div>
            <p className="text-sm font-semibold text-muted-foreground">({time})</p>
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const sel = currentSelection;
                const tagInfo = sel === 'attended' ? { t: 'Attended', c: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' }
                  : sel === 'missed' ? { t: 'Missed', c: 'bg-rose-500/10 text-rose-500 border-rose-500/20' }
                  : sel === 'off' ? { t: 'Holiday', c: 'bg-amber-500/10 text-amber-500 border-amber-500/20' }
                  : isFinished ? { t: 'No Planned Class', c: 'bg-muted/40 text-muted-foreground border-border/50' }
                  : { t: 'Not Marked', c: 'bg-muted/20 text-muted-foreground/70 border-border/40' };
                return <span className={cn('inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', tagInfo.c)}>{tagInfo.t}</span>;
              })()}
              {currentSelection && (currentSelection === 'attended' || currentSelection === 'missed') && pastCounts && (
                <span className="text-[11px] font-extrabold text-foreground">
                  (Class - <span className={currentSelection === 'attended' ? 'text-emerald-500' : 'text-rose-500'}>{pastCounts.conducted}</span>/{totalPlannedClasses ?? pastCounts.conducted})
                </span>
              )}
            </div>
          </div>
          <div className={cn('text-lg font-bold min-w-max self-center', pastPct === null ? 'text-muted-foreground' : getPercentageColor(pastPct))}>
            {pastPct === null ? '—' : `${pastPct.toFixed(0)}%`}
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-center mb-2 relative z-10 gap-3">
          <div className="pr-2 min-w-0 flex-1">
            {isWard ? (<>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold leading-tight text-foreground">{title || subject}</h3>
                {tag && <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tagColor === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{tag}</span>}
              </div>
              {subtitle && <p className="text-sm font-semibold mt-1" style={{ color: subjectColor }}>{subtitle}</p>}
              <p className="text-muted-foreground text-sm mt-1">{time}</p>
            </>) : (<>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold leading-tight" style={{ color: subjectColor }}>{title || subject}</h3>
                {tag && <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tagColor === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{tag}</span>}
              </div>
              <p className="text-muted-foreground text-sm mt-1">{time}</p>
            </>)}
            {effectiveMode === 'today' && (currentSelection === 'attended' || currentSelection === 'missed') && (
              <TypedLine selection={currentSelection} conducted={total} planned={totalPlannedClasses} animate={justMarked} />
            )}
          </div>
          <div className="shrink-0 self-center">
            {effectiveMode === 'future' && !isFinished ? (
              withinWeek ? <SeverityRing sev={projection.sev} hex={projection.hex} /> : null
            ) : (
              <div className={cn('text-lg font-bold min-w-max', getPercentageColor(percentage))}>
                {total === 0 ? '--' : `${percentage.toFixed(0)}%`}
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showECG && effectiveMode === 'today' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 pointer-events-none flex items-center justify-center z-0">
            <svg className="w-full h-24 opacity-40" preserveAspectRatio="none" viewBox="0 0 100 40">
              <motion.path d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 30 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 60 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 90 20 L 100 20" fill="none" stroke={ecgColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: 'easeInOut' }} />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {effectiveMode !== 'past' && (
        <div className="mb-4 relative z-10 text-sm font-medium text-muted-foreground">{renderSubtitle()}</div>
      )}
      {renderBottom()}
    </div>
  );
};
