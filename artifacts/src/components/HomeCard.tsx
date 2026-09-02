import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey, type SelectionType } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { cn, getCurrentDateStr, getSubjectColor, pctColor, getAttendanceStatus } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { triggerConfirmationFeedback } from '@/lib/feedback';

interface HomeCardProps {
  subject: string; time: string; isWard?: boolean; title?: string; subtitle?: string;
  tag?: string; tagColor?: string; sessionId?: string; dateStr?: string;
  mode?: 'today' | 'past' | 'future'; pastSelection?: string; isSGT?: boolean; sgtId?: string;
}

const cls = (n: number) => (n === 1 ? 'Class' : 'Classes');
const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const shortenSubject = (name: string) => ({
  'Surgery': 'Surg.', 'Obstetrics & Gynaecology': 'Obs & Gyn.', 'Pediatrics': 'Peds.',
  'Orthopedics': 'Ortho.', 'Ophthalmology': 'Ophtha.', 'Otolaryngology': 'ENT',
  'Dermatology': 'Derm.', 'Psychiatry': 'Psych.', 'Physical Medicine': 'PMR',
  'Radiology': 'Radio.', 'Radiotherapy': 'RadioT.', 'Nuclear Medicine': 'Nuc Med.',
  'Neurosurgery': 'NeuroS.', 'Pediatric Surgery': 'Peds Surg.', 'Burn & Plastic Surgery': 'Plastic S.',
  'Internal Medicine': 'Medicine', 'Phase Integrated Teaching': 'Phase Integrated',
  'Departmental Integrated Teaching': 'Dept. Integrated',
} as Record<string, string>)[name] || name;

const ThreeDContainer = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('flex rounded-xl border border-border/70 bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_5px_rgba(0,0,0,0.18)]', className)}>{children}</div>
);

const TypedLine = ({ selection, conducted, planned, animate, onStatusTap }: {
  selection: string; conducted: number; planned: number | undefined; animate: boolean; onStatusTap: () => void;
}) => {
  const word = selection === 'attended' ? 'Attended' : selection === 'missed' ? 'Bunked' : 'Holiday';
  const wordC = selection === 'attended' ? 'text-emerald-500' : selection === 'missed' ? 'text-rose-500' : 'text-amber-500';
  const showClass = selection !== 'off';
  const tail = showClass ? [
    { t: ' (Class - ', c: 'text-muted-foreground' },
    { t: String(conducted), c: wordC },
    { t: '/' + (planned ?? conducted) + ')', c: 'text-foreground/80' },
  ] : [];
  const full = word + tail.map(s => s.t).join('');
  const [n, setN] = useState(animate ? 0 : full.length);
  useEffect(() => {
    if (!animate) { setN(full.length); return; }
    let i = 0;
    const id = setInterval(() => { i++; setN(i); if (i >= full.length) clearInterval(id); }, 50);
    return () => clearInterval(id);
  }, [full, animate]);
  let rem = n;
  const wordShown = word.slice(0, Math.min(word.length, rem));
  rem -= wordShown.length;
  const tailOut: React.ReactNode[] = [];
  tail.forEach((s, idx) => {
    const take = Math.max(0, Math.min(s.t.length, rem));
    if (take > 0) tailOut.push(<span key={idx} className={cn('font-extrabold', s.c)}>{s.t.slice(0, take)}</span>);
    rem -= take;
  });
  return (
    <p className="text-[11px] font-extrabold leading-tight mt-1">
      <button type="button" onClick={onStatusTap} className={cn('cursor-pointer text-xs', wordC)}>{wordShown}</button>
      {tailOut}
    </p>
  );
};

export const HomeCard = ({ subject, time, isWard = false, subtitle, tag, sessionId, dateStr, mode, isSGT = false, sgtId }: HomeCardProps) => {
  const { subjects, wards, homeSelections, finishedMap, updateHomeSelection, preferredPercentage, getHomeSelection } = useAttendance();
  const { subjectMode, customSubjects, customWards, userAddedSubjects, presetTimetable, getCurrentPresetWard, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned, getSubjectIdByName } = useCustomData();
  const activeDateStr = dateStr || getCurrentDateStr();
  const cardRef = useRef<HTMLDivElement>(null);
  const ecgTimeoutRef = useRef<number | null>(null);

  const [pendingSelection, setPendingSelection] = useState<'off' | 'missed' | 'attended' | null>(null);
  const [ecgPhase, setEcgPhase] = useState<'off' | 'missed' | 'attended' | null>(null);
  const [ecgCount, setEcgCount] = useState(0);
  const [markCount, setMarkCount] = useState(0);
  const [undoPending, setUndoPending] = useState(false);

  useEffect(() => {
    setPendingSelection(null);
    setEcgPhase(null);
    setUndoPending(false);
  }, [activeDateStr]);
  useEffect(() => () => {
    if (ecgTimeoutRef.current !== null) window.clearTimeout(ecgTimeoutRef.current);
  }, []);

  const resolvedId = getSubjectIdByName(subject, isWard ? 'clinical' : 'academic');
  const attendanceKey: string | null = isSGT && sgtId
    ? getSGTKey(sgtId)
    : resolvedId
      ? (isWard ? getWardAttendanceKey(resolvedId) : getAcademicAttendanceKey(resolvedId))
      : null;
  const data = attendanceKey ? (isWard ? wards[attendanceKey] : subjects[attendanceKey]) : undefined;
  const attended = data?.attended || 0;
  const missed = data?.missed || 0;
  const total = attended + missed;

  let originalPlannedClasses: number | undefined;
  if (isWard) {
    if (subjectMode === 'custom') {
      const cWard = customWards?.find(w => w.name.toLowerCase() === subject.toLowerCase());
      originalPlannedClasses = cWard
        ? getCustomWardTotalPlanned(cWard.startDate, cWard.endDate, cWard.vacationPeriods)
        : 0;
    } else {
      originalPlannedClasses = getPresetWardTotalPlanned(subject);
    }
  } else if (isSGT && sgtId) {
    const s = subjectMode === 'preloaded' ? userAddedSubjects?.find(x => x.id === sgtId) : customSubjects?.find(x => x.id === sgtId);
    originalPlannedClasses = s ? s.plannedClasses : getSubjectPlannedTotal(subject);
  } else if (subjectMode === 'preloaded') {
    const ua = userAddedSubjects?.find(x => x.name.toLowerCase() === subject.toLowerCase() && !(x.subjectType === 'allied' && x.parentName === 'Small Group Teaching'));
    originalPlannedClasses = ua ? ua.plannedClasses : getSubjectPlannedTotal(subject);
  } else {
    const cs = customSubjects?.find(x => x.name.toLowerCase() === subject.toLowerCase() && !(x.subjectType === 'allied' && x.parentName === 'Small Group Teaching'));
    originalPlannedClasses = cs ? cs.plannedClasses : getSubjectPlannedTotal(subject);
  }
  const isFinishedMarked = attendanceKey ? finishedMap?.[attendanceKey] || false : false;
  const totalPlannedClasses = isFinishedMarked ? (total > 0 ? total : originalPlannedClasses) : originalPlannedClasses;
  const remainingClasses = totalPlannedClasses !== undefined ? Math.max(0, totalPlannedClasses - total) : undefined;
  const isFinished = isFinishedMarked || (totalPlannedClasses !== undefined && totalPlannedClasses > 0 && remainingClasses === 0);

  const selectionKey = attendanceKey ? (sessionId ? `${activeDateStr}-${attendanceKey}-${sessionId}` : `${activeDateStr}-${attendanceKey}`) : '';
  const effectiveMode = mode || (dateStr && dateStr !== getCurrentDateStr() ? 'past' : 'today');

  const getPastAttendance = (): SelectionType | undefined => {
    return attendanceKey ? getHomeSelection(activeDateStr, attendanceKey, sessionId, isWard) : undefined;
  };
  const currentSelection = effectiveMode === 'past' ? getPastAttendance() : homeSelections[selectionKey];
  const percentage = total === 0 ? 100 : (attended / total) * 100;

  const todayStr = getCurrentDateStr();
  const daysFromToday = Math.round((new Date(activeDateStr + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000);
  const isTomorrow = daysFromToday === 1;

  const isScheduledOn = useCallback((d: Date): boolean => {
    const ds = toStr(d); const abbr = DAY_ABBRS[d.getDay()]; const dow = d.getDay();
    if (isWard) {
      if (subjectMode === 'custom') {
        const cw = customWards?.find(w => ds >= w.startDate && ds <= w.endDate);
        return !!cw && cw.name.toLowerCase() === subject.toLowerCase();
      }
      const pw = getCurrentPresetWard(d);
      return !!pw && pw.ward === subject && pw.ward !== 'Holiday';
    }
    if (isSGT && sgtId) {
      const s: any = subjectMode === 'preloaded' ? userAddedSubjects?.find(x => x.id === sgtId) : customSubjects?.find(x => x.id === sgtId);
      if (!s) return false;
      if ((s.startDate && ds < s.startDate) || (s.endDate && ds > s.endDate)) return false;
      if ((s.schedules || []).some((x: any) => x.day === abbr)) return true;
      if (s.days && s.days.split(',').map((t: string) => t.trim()).includes(abbr)) return true;
      return false;
    }
    if (subjectMode === 'preloaded') {
      const slots = (presetTimetable as any)?.[dow] || [];
      return slots.some((sl: any) => sl.type !== 'ward' && sl.type !== 'ward_replacement' && (sl.subjects || []).includes(subject));
    }
    const cs: any = customSubjects?.find(x => x.name.toLowerCase() === subject.toLowerCase() && !(x.subjectType === 'allied' && x.parentName === 'Small Group Teaching'));
    if (!cs) return false;
    if ((cs.schedules || []).some((x: any) => x.day === abbr)) return true;
    if (cs.days && cs.days.split(',').map((t: string) => t.trim()).includes(abbr)) return true;
    return false;
  }, [isWard, subjectMode, customWards, getCurrentPresetWard, isSGT, sgtId, userAddedSubjects, customSubjects, presetTimetable, subject]);
  const k = useMemo(() => {
    if (effectiveMode !== 'future') return 1;
    let count = 0;
    for (let d = addDays(new Date(todayStr + 'T12:00:00'), 1); d <= new Date(activeDateStr + 'T12:00:00'); d = addDays(d, 1)) {
      if (isScheduledOn(d)) count++;
    }
    return Math.max(1, count);
  }, [effectiveMode, todayStr, activeDateStr, isScheduledOn]);

  const canMissCount = Math.max(0, Math.floor((attended * 100) / preferredPercentage - total));
  const needToAttend = Math.max(1, Math.ceil((preferredPercentage * total - 100 * attended) / (100 - preferredPercentage)));
  const futureMsg = (() => {
    if (percentage < preferredPercentage) {
      const N = needToAttend;
      if (k < N) return { sev: 'must' as const, jsx: <span className="text-rose-500 font-semibold">Must attend this <span className="whitespace-nowrap">(+{N - k}) more {cls(N - k)}!!</span></span> };
      if (k === N) return { sev: 'must' as const, jsx: <span className="text-rose-500 font-semibold">Must attend this Class!!</span> };
      return { sev: 'safe' as const, jsx: <span className="text-emerald-500 font-semibold">On track</span> };
    }
    if (canMissCount > 0) {
      const M = canMissCount;
      if (k < M) return { sev: ((M - k) >= 2 ? 'safe' : 'can') as 'safe' | 'can', jsx: <span className={cn('font-semibold', (M - k) >= 2 ? 'text-emerald-500' : 'text-amber-500')}>On track.. Can bunk this <span className="whitespace-nowrap">(+{M - k}) {cls(M - k)}!!</span></span> };
      if (k === M) return { sev: 'can' as const, jsx: <span className="text-amber-500 font-semibold">Can bunk this Class</span> };
      return { sev: 'safe' as const, jsx: <span className="text-emerald-500 font-semibold">On track</span> };
    }
    if (k === 1) return { sev: 'must' as const, jsx: <span className="text-rose-500 font-semibold">On target, DO NOT bunk this Class</span> };
    return { sev: 'must' as const, jsx: <span className="text-rose-500 font-semibold">On target, DO NOT bunk this <span className="whitespace-nowrap">(+{k - 1}) {cls(k - 1)}</span></span> };
  })();
  const futureTag = (() => {
    if (isFinished) return { text: 'No more Scheduled/Planned Class', color: 'text-muted-foreground' };
    if (futureMsg.sev === 'must') return { text: needToAttend === 1 ? 'Tomorrow’s Class Only' : `Attend = ${needToAttend} ${cls(needToAttend)}`, color: 'text-rose-500' };
    if (futureMsg.sev === 'can') return { text: canMissCount === 1 ? 'Tomorrow’s Class Only' : `Bunkable Class = ${canMissCount} ${cls(canMissCount)}`, color: 'text-amber-500' };
    return { text: canMissCount === 1 ? 'Tomorrow’s Class Only' : `Safely Bunkable = ${canMissCount} ${cls(canMissCount)}`, color: 'text-emerald-500' };
  })();
  const futureStatusText = isTomorrow ? futureTag.text : isFinished ? 'No more Scheduled/Planned Class' : 'Yet to be Conducted';

  const getPercentageColor = (pct: number) => {
    const hasPlannedClasses = totalPlannedClasses !== undefined && totalPlannedClasses > 0;
    const status = getAttendanceStatus(pct, preferredPercentage, { isFinished, hasPlannedClasses });
    return status === 'green' ? 'text-success' : status === 'yellow' ? 'text-warning' : status === 'neutral' ? 'text-muted-foreground' : 'text-destructive';
  };
  const ecgColor = pctColor(percentage, preferredPercentage, {
    isFinished,
    hasPlannedClasses: totalPlannedClasses !== undefined && totalPlannedClasses > 0,
  });
  const subjectColor = getSubjectColor(subject);

  const getFinishedMessage = () => {
    const targetNeeded = totalPlannedClasses !== undefined ? Math.ceil(totalPlannedClasses * (preferredPercentage / 100)) : Math.ceil(total * (preferredPercentage / 100));
    if (attended >= targetNeeded) return `Congrats! Achieved Target`;
    const classesShort = Math.max(1, targetNeeded - attended);
    if (classesShort === 1) return `Ooops!! For 1 more class, you would have been a legend!`;
    if (classesShort % 2 === 0) return `Ooops!! Just ${classesShort} classes short! Even a med student with no sleep could have done that!`;
    return `Ooops!! ${classesShort} more classes and you could have flexed on your batchmates!`;
  };

  const renderTodayAdvisory = () => {
    if (isFinished) return <span className={cn('font-bold', getPercentageColor(percentage))}>{getFinishedMessage()}</span>;
    if (total === 0) return <span>No Classes conducted yet</span>;
    if (percentage < preferredPercentage) {
      if (remainingClasses !== undefined && needToAttend > remainingClasses) {
        const maxPct = Math.round(((attended + remainingClasses) / (total + remainingClasses)) * 100);
        return (
          <span className="font-semibold text-rose-500 text-[11px]">
            Attendance advised unless contraindicated!!{' '}
            <span className="whitespace-nowrap">Max. Possible (if Attended): {maxPct}%</span>
          </span>
        );
      }
      return <span className="text-rose-500 font-semibold text-[11px]">Must ATTEND this Class!!</span>;
    }
    if (canMissCount > 0) return <span className="text-emerald-500 font-semibold text-[11px]">On track, CAN bunk this Class!!</span>;
    return <span className="text-rose-500 font-semibold text-[11px]">At target limit, DO NOT bunk this Class!!</span>;
  };

  const handleSelection = (sel: 'off' | 'missed' | 'attended') => {
    if (effectiveMode !== 'today' || !attendanceKey) return;
    if (isFinished && !currentSelection) return;
    if (pendingSelection === sel) {
      setPendingSelection(null);
      setEcgPhase(sel);
      setEcgCount(c => c + 1);
      setMarkCount(c => c + 1);
      setUndoPending(false);
      updateHomeSelection(selectionKey, attendanceKey, sel, isWard);
      triggerConfirmationFeedback(sel === 'off' ? 'info' : sel === 'missed' ? 'danger' : 'success');
      if (ecgTimeoutRef.current !== null) window.clearTimeout(ecgTimeoutRef.current);
      ecgTimeoutRef.current = window.setTimeout(() => { setEcgPhase(null); ecgTimeoutRef.current = null; }, 1500);
    } else setPendingSelection(sel);
  };
  const handleUndoTap = () => {
    if (!attendanceKey) return;
    if (!undoPending) { setUndoPending(true); return; }
    setUndoPending(false);
    if (currentSelection) updateHomeSelection(selectionKey, attendanceKey, currentSelection, isWard);
  };

  useEffect(() => {
    if (!pendingSelection && !undoPending) return;
    const onDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setPendingSelection(null);
        setUndoPending(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pendingSelection, undoPending]);

  const finishedTargetMet = totalPlannedClasses ? attended >= Math.ceil(totalPlannedClasses * (preferredPercentage / 100)) : true;
  const markTint = currentSelection === 'attended' ? 'bg-emerald-500/15' : currentSelection === 'missed' ? 'bg-rose-500/15' : currentSelection === 'off' ? 'bg-amber-500/15' : '';
  const borderCls = effectiveMode !== 'today' && isFinished
    ? (finishedTargetMet ? 'border-emerald-500/60' : 'border-rose-500/60')
    : currentSelection === 'attended' ? 'border-emerald-500/60'
    : currentSelection === 'missed' ? 'border-rose-500/60'
    : currentSelection === 'off' ? 'border-amber-500/60'
    : (effectiveMode === 'today' && isFinished && !currentSelection)
      ? (finishedTargetMet ? 'border-emerald-500/60' : 'border-rose-500/60')
      : 'border-card-border';
  const selColor = (s: string) => s === 'attended' ? 'text-emerald-500' : s === 'missed' ? 'text-rose-500' : 'text-amber-500';
  const selBg = (s: string) => s === 'attended' ? 'bg-emerald-500/25 border-emerald-500/60' : s === 'missed' ? 'bg-rose-500/25 border-rose-500/60' : 'bg-amber-500/25 border-amber-500/60';
  const selWord = (s: string) => s === 'attended' ? 'Attended' : s === 'missed' ? 'Bunked' : 'Holiday';
  const subjectName = isWard ? (subtitle || subject) : subject;
  const displaySubject = subjectName.length > 20 ? shortenSubject(subjectName) : subjectName;
  const displayTag = isWard && tag ? `Clinical (${tag})` : tag || (isSGT ? 'Small Group' : null);
  const tagEl = displayTag ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">{displayTag}</span> : null;
  const pastStatus = currentSelection === 'attended' ? 'Attended' : currentSelection === 'missed' ? 'Bunked' : currentSelection === 'off' ? 'Holiday' : isFinished ? 'No Planned Class' : 'Not Marked';
  const pastStatusClass = currentSelection === 'attended' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : currentSelection === 'missed' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : currentSelection === 'off' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-muted/30 text-muted-foreground border-border/50';
  const pastIsMarked = currentSelection === 'attended' || currentSelection === 'missed';

  const todayBottom = ecgPhase ? (
    <div className={cn('w-full h-12 rounded-xl border relative overflow-hidden flex items-center justify-center gap-2', selBg(ecgPhase), selColor(ecgPhase))}>
      <svg className="absolute inset-0 w-full h-full opacity-40" preserveAspectRatio="none" viewBox="0 0 100 40">
        <motion.path d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 100 20" fill="none" stroke={ecgColor} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeInOut' }} />
      </svg>
      <CheckCircle2 className="w-4 h-4 relative z-10" />
      <span className="text-xs font-extrabold capitalize relative z-10">{selWord(ecgPhase)}</span>
    </div>
  ) : !currentSelection && !isFinished ? (
    <div className="flex gap-2">
      {(['attended', 'missed', 'off'] as const).map(s => (
        <button key={s} type="button" onClick={() => handleSelection(s)}
          className={cn('flex-1 h-11 rounded-xl text-xs sm:text-sm font-semibold border transition-all bg-background/70 text-muted-foreground border-border',
            s === 'attended' && 'hover:bg-emerald-500/10 hover:text-emerald-600', s === 'missed' && 'hover:bg-rose-500/10 hover:text-rose-600', s === 'off' && 'hover:bg-amber-500/10 hover:text-amber-600',
            pendingSelection === s && 'ring-2 ring-inset font-extrabold', pendingSelection === s && (s === 'attended' ? 'ring-emerald-500 bg-emerald-500/20 text-emerald-500' : s === 'missed' ? 'ring-rose-500 bg-rose-500/20 text-rose-500' : 'ring-amber-500 bg-amber-500/20 text-amber-500'))}>
          {pendingSelection === s ? 'Confirm?' : s === 'off' ? 'Holiday' : s === 'attended' ? 'Attended' : 'Missed'}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={cardRef} className={cn('relative rounded-2xl border overflow-hidden select-none mb-4 bg-card', borderCls)}
      style={effectiveMode !== 'today' && !isFinished && !currentSelection ? { borderColor: subjectColor } : undefined}>
      <div className={cn('p-5', effectiveMode === 'today' ? markTint : '')}>
        {/* ── PAST ── */}
        {effectiveMode === 'past' ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              {tagEl && <div className="flex items-center">{tagEl}</div>}
              <h3 className="min-w-0 truncate text-xl font-bold leading-tight" style={{ color: subjectColor }}>{displaySubject}</h3>
              <div className="flex min-w-0 items-center gap-2 text-sm leading-tight text-muted-foreground">
                <span className="shrink-0 whitespace-nowrap">{time}</span>
              </div>
            </div>
              <div className="flex h-20 w-20 shrink-0 items-center justify-center">
              <ThreeDContainer className="h-20 w-20 flex-col items-center justify-center gap-0.5 px-1 py-1">
                <span className={cn('max-w-full text-center font-bold uppercase tracking-wide', pastIsMarked ? 'whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px]' : 'whitespace-normal break-words text-[9px] leading-tight', pastIsMarked ? pastStatusClass : 'text-muted-foreground')}>{pastStatus}</span>
                {pastIsMarked && <span className="whitespace-nowrap text-[10px] font-extrabold text-foreground">(Class - <span className={selColor(currentSelection)}>{total}</span>/{totalPlannedClasses ?? total})</span>}
              </ThreeDContainer>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              {tagEl && <div className="flex items-center">{tagEl}</div>}
              <h3 className="min-w-0 truncate text-xl font-bold leading-tight" style={{ color: subjectColor }}>{displaySubject}</h3>
              <div className="flex min-w-0 items-center gap-2 text-sm leading-tight text-muted-foreground">
                <span className="shrink-0 whitespace-nowrap">{time}</span>
              </div>
              {effectiveMode === 'future' && <div className="mt-1 flex items-center"><span className={cn('shrink-0 rounded-full border bg-muted/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', isTomorrow ? futureTag.color : 'border-border/50 text-muted-foreground')}>{futureStatusText}</span></div>}
              {effectiveMode === 'today' && currentSelection && !ecgPhase && (
                undoPending ? (
                  <button type="button" onClick={handleUndoTap} className="text-[11px] font-extrabold text-rose-500 leading-tight mt-1 animate-pulse cursor-pointer">Confirm Undo?</button>
                ) : (
                  <TypedLine key={`${activeDateStr}-${markCount}`} selection={currentSelection} conducted={total} planned={totalPlannedClasses} animate onStatusTap={handleUndoTap} />
                )
              )}
              {effectiveMode === 'today' && !currentSelection && (
                <div className="leading-tight mt-1">
                  {isFinished ? <span className={cn('font-bold text-[11px]', finishedTargetMet ? 'text-emerald-500' : 'text-rose-500')}>{getFinishedMessage()}</span> : renderTodayAdvisory()}
                </div>
              )}
            </div>
            <div className="shrink-0 self-center">
              {effectiveMode === 'future' && !isFinished ? (
                isTomorrow ? <ThreeDContainer className="min-h-14 min-w-24 max-w-[11rem] items-center justify-center px-1 text-center"><span className={cn('text-[10px] font-extrabold uppercase', futureMsg.sev === 'must' ? 'text-rose-500' : futureMsg.sev === 'can' ? 'text-amber-500' : 'text-emerald-500')}>{futureMsg.sev === 'must' ? 'Must Attend' : futureMsg.sev === 'can' ? 'Can Bunk' : 'Safe Bunk'}</span></ThreeDContainer> : <div className="w-14 h-14" aria-hidden="true" />
              ) : effectiveMode === 'future' && isFinished ? (
                isTomorrow ? <ThreeDContainer className="min-h-14 min-w-24 max-w-[11rem] items-center justify-center"><span className={cn('text-lg font-bold', getPercentageColor(percentage))}>{`${percentage.toFixed(0)}%`}</span></ThreeDContainer> : <div className="w-14 h-14" aria-hidden="true" />
              ) : effectiveMode === 'today' && currentSelection ? (
                <ThreeDContainer className="h-14 w-24 items-center justify-center"><span className={cn('text-lg font-bold', getPercentageColor(percentage))}>{total === 0 ? '--' : `${percentage.toFixed(0)}%`}</span></ThreeDContainer>
              ) : effectiveMode === 'today' && isFinished ? (
                <ThreeDContainer className="min-h-14 min-w-24 max-w-[10rem] items-center justify-center px-2"><span className={cn('text-lg font-bold', getPercentageColor(percentage))}>{total === 0 ? '--' : `${percentage.toFixed(0)}%`}</span></ThreeDContainer>
              ) : effectiveMode === 'today' && !currentSelection && total > 0 ? (
                <div className={cn('min-w-0 text-lg font-bold', getPercentageColor(percentage))}>{`${percentage.toFixed(0)}%`}</div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── BOTTOM (today) ── */}
        {effectiveMode === 'today' && (
          <AnimatePresence initial={false}>
            {todayBottom && (
              <motion.div key={`tb-${ecgCount}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }} className="overflow-hidden">
                <div className="mt-3 space-y-1 px-0.5">{todayBottom}</div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </div>
    </div>
  );
};
