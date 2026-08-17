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
const shortenSubject = (n: string) => SHORTEN_MAP[n] || n;
const cls = (n: number) => (n === 1 ? 'Class' : 'Classes');
const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function parseSelectionKey(key: string): { date: string; label: string } | null {
  const date = key.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rest = key.slice(11);
  const parts = rest.split('-');
  const label = parts.slice(0, -1).join(' ').replace(/^ward /, '').trim() || rest;
  return { date, label };
}

const SeverityRing = ({ sev }: { sev: 'must' | 'can' | 'safe' }) => {
  const hex = sev === 'must' ? '#ef4444' : sev === 'can' ? '#f59e0b' : '#10b981';
  const lines = sev === 'must' ? ['Must', 'Attend'] : sev === 'can' ? ['Can', 'Bunk'] : ['Safe to', 'Bunk'];
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r="24" fill="none" stroke={hex} strokeOpacity="0.25" strokeWidth="4" />
        <circle cx="28" cy="28" r="24" fill="none" stroke={hex} strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="text-[9px] font-extrabold" style={{ color: hex }}>{lines[0]}</span>
        <span className="text-[9px] font-extrabold" style={{ color: hex }}>{lines[1]}</span>
      </div>
    </div>
  );
};

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
    <p className="text-base font-extrabold leading-tight">
      <button type="button" onClick={onStatusTap} className={cn('cursor-pointer', wordC)}>{wordShown}</button>
      {tailOut}
    </p>
  );
};

export const HomeCard = ({ subject, time, isWard = false, title, subtitle, tag, tagColor, sessionId, dateStr, mode, pastSelection, isSGT = false, sgtId }: HomeCardProps) => {
  const { subjects, wards, homeSelections, finishedMap, updateHomeSelection, preferredPercentage } = useAttendance();
  const { subjectMode, customSubjects, customWards, userAddedSubjects, presetTimetable, getCurrentPresetWard, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned } = useCustomData();
  const activeDateStr = dateStr || getCurrentDateStr();
  const cardRef = useRef<HTMLDivElement>(null);

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
  const isFinishedMarked = finishedMap?.[attendanceKey] || false;
  const totalPlannedClasses = isFinishedMarked ? (total > 0 ? total : originalPlannedClasses) : originalPlannedClasses;
  const remainingClasses = totalPlannedClasses !== undefined ? Math.max(0, totalPlannedClasses - total) : undefined;
  const isFinished = isFinishedMarked || (totalPlannedClasses !== undefined && totalPlannedClasses > 0 && remainingClasses === 0);

  const selectionKey = sessionId ? `${activeDateStr}-${attendanceKey}-${sessionId}` : `${activeDateStr}-${attendanceKey}`;
  const effectiveMode = mode || (dateStr && dateStr !== getCurrentDateStr() ? 'past' : 'today');

  const getPastAttendance = (): string | undefined => {
    const short = shortenSubject(subject);
    const c: string[] = [];
    if (sessionId) c.push(`${activeDateStr}-${sessionId}`, `${activeDateStr}_${sessionId}`);
    c.push(`${activeDateStr}-${subject}`, `${activeDateStr}_${subject}`, `${activeDateStr}-${short}`, `${activeDateStr}_${short}`);
    if (isWard) { c.push(`${activeDateStr}-ward-${subject}`, `${activeDateStr}_ward_${subject}`); if (sessionId) c.push(`${activeDateStr}-ward-${subject}-${sessionId}`); }
    if (isSGT && sgtId) { c.push(`${activeDateStr}-sgt:${sgtId}`, `${activeDateStr}-${subject}-sgt-${sgtId}`); if (sessionId) c.push(`${activeDateStr}-sgt:${sgtId}-${sessionId}`); }
    c.push(`${activeDateStr}-${attendanceKey}`, `${activeDateStr}_${attendanceKey}`);
    for (const k of c) if (homeSelections[k]) return homeSelections[k];
    for (const [fk, v] of Object.entries(homeSelections)) {
      const p = parseSelectionKey(fk);
      if (!p || p.date !== activeDateStr) continue;
      if (p.label.toLowerCase() === subject.toLowerCase() || p.label.toLowerCase() === short.toLowerCase()) return v;
    }
    return pastSelection;
  };
  const currentSelection = effectiveMode === 'past' ? getPastAttendance() : homeSelections[selectionKey];
  const percentage = total === 0 ? 100 : (attended / total) * 100;

  const todayStr = getCurrentDateStr();
  const daysFromToday = Math.round((new Date(activeDateStr + 'T12:00:00').getTime() - new Date(todayStr + 'T12:00:00').getTime()) / 86400000);
  const withinWeek = daysFromToday >= 0 && daysFromToday <= 7;

  const isScheduledOn = (d: Date): boolean => {
    const ds = toStr(d); const abbr = DAY_ABBRS[d.getDay()]; const dow = d.getDay();
    if (isWard) {
      const cw = customWards?.find(w => ds >= w.startDate && ds <= w.endDate);
      if (cw) return cw.name.toLowerCase() === subject.toLowerCase();
      if (subjectMode === 'preloaded') { const pw = getCurrentPresetWard(d); return !!pw && pw.ward === subject && pw.ward !== 'Holiday'; }
      return false;
    }
    if (isSGT && sgtId) {
      const s: any = subjectMode === 'preloaded' ? userAddedSubjects?.find(x => x.id === sgtId) : customSubjects?.find(x => x.id === sgtId);
      if (!s) return false;
      if (s.startDate && s.endDate && (ds < s.startDate || ds > s.endDate)) return false;
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
  };
  const k = (() => {
    if (effectiveMode !== 'future') return 1;
    let count = 0;
    for (let d = addDays(new Date(todayStr + 'T12:00:00'), 1); d <= new Date(activeDateStr + 'T12:00:00'); d = addDays(d, 1)) {
      if (isScheduledOn(d)) count++;
    }
    return Math.max(1, count);
  })();

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

  const renderTodayAdvisory = () => {
    if (isFinished) return <span className={cn('font-bold', getPercentageColor(percentage))}>{getFinishedMessage()}</span>;
    if (total === 0) return <span>No classes conducted yet</span>;
    if (percentage < preferredPercentage) {
      if (remainingClasses !== undefined && needToAttend > remainingClasses) {
        const maxPct = Math.round(((attended + remainingClasses) / (total + remainingClasses)) * 100);
        return (
          <span className="font-semibold text-rose-500 text-xs sm:text-sm">
            Attendance advised unless contraindicated!!{' '}
            <span className="whitespace-nowrap">Max. Possible (if Attended): {maxPct}%</span>
          </span>
        );
      }
      return <span className="text-rose-500 font-semibold text-sm">Must ATTEND this Class!!</span>;
    }
    if (canMissCount > 0) return <span className="text-emerald-500 font-semibold text-sm">On track, CAN bunk this Class!!</span>;
    return <span className="text-rose-500 font-semibold text-sm">At target limit, DO NOT bunk this Class!!</span>;
  };

  const handleSelection = (sel: 'off' | 'missed' | 'attended') => {
    if (effectiveMode !== 'today') return;
    if (isFinished && !currentSelection) return;
    if (pendingSelection === sel) {
      setPendingSelection(null);
      setEcgPhase(sel);
      setEcgCount(c => c + 1);
      setMarkCount(c => c + 1);
      setUndoPending(false);
      updateHomeSelection(selectionKey, attendanceKey, sel, isWard);
      setTimeout(() => setEcgPhase(null), 1500);
    } else setPendingSelection(sel);
  };
  const handleUndoTap = () => {
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
  const borderCls = isFinished && effectiveMode !== 'today'
    ? (finishedTargetMet ? 'border-emerald-500/60 ring-2 ring-emerald-500/40' : 'border-rose-500/60 ring-2 ring-rose-500/40')
    : currentSelection === 'attended' ? 'border-emerald-500/60 ring-2 ring-emerald-500/40'
    : currentSelection === 'missed' ? 'border-rose-500/60 ring-2 ring-rose-500/40'
    : currentSelection === 'off' ? 'border-amber-500/60 ring-2 ring-amber-500/40'
    : 'border-card-border';
  const selColor = (s: string) => s === 'attended' ? 'text-emerald-500' : s === 'missed' ? 'text-rose-500' : 'text-amber-500';
  const selBg = (s: string) => s === 'attended' ? 'bg-emerald-500/25 border-emerald-500/60' : s === 'missed' ? 'bg-rose-500/25 border-rose-500/60' : 'bg-amber-500/25 border-amber-500/60';
  const selWord = (s: string) => s === 'attended' ? 'Attended' : s === 'missed' ? 'Bunked' : 'Holiday';
  const tagEl = tag ? <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tagColor === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{tag}</span> : null;

  const todayBottom = ecgPhase ? (
    <div className={cn('w-full h-12 rounded-xl border relative overflow-hidden flex items-center justify-center gap-2', selBg(ecgPhase), selColor(ecgPhase))}>
      <svg className="absolute inset-0 w-full h-full opacity-40" preserveAspectRatio="none" viewBox="0 0 100 40">
        <motion.path d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 100 20" fill="none" stroke={ecgColor} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeInOut' }} />
      </svg>
      <CheckCircle2 className="w-4 h-4 relative z-10" />
      <span className="text-xs font-extrabold capitalize relative z-10">{selWord(ecgPhase)}</span>
    </div>
  ) : isFinished && !currentSelection ? (
    <div className={cn('w-full py-3.5 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase text-center border flex items-center justify-center gap-2',
      finishedTargetMet ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40' : 'bg-rose-500/20 text-rose-500 border-rose-500/40')}>
      <CheckCircle2 className="w-4 h-4" /><span>NO MORE PLANNED CLASSES!!!</span>
    </div>
  ) : !currentSelection ? (
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
      style={effectiveMode !== 'today' && !isFinished ? { borderColor: subjectColor } : undefined}>
      <div className={cn('p-5', effectiveMode === 'today' ? markTint : '')}>
        {/* ── PAST ── */}
        {effectiveMode === 'past' ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold leading-tight truncate" style={{ color: subjectColor }}>{title || subject}</h3>
                {tagEl}
              </div>
              <p className="text-sm text-muted-foreground leading-tight">({time})</p>
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const sel = currentSelection;
                  const t = sel === 'attended' ? 'Attended' : sel === 'missed' ? 'Bunked' : sel === 'off' ? 'Holiday' : isFinished ? 'No Planned Class' : 'Not Marked';
                  const c = sel === 'attended' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : sel === 'missed' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : sel === 'off' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-muted/30 text-muted-foreground border-border/50';
                  return <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', c)}>{t}</span>;
                })()}
                {(currentSelection === 'attended' || currentSelection === 'missed') && (
                  <span className="text-[11px] font-extrabold text-foreground">(Class - <span className={selColor(currentSelection)}>{total}</span>/{totalPlannedClasses ?? total})</span>
                )}
              </div>
            </div>
            <div className={cn('text-lg font-bold min-w-max self-center', getPercentageColor(percentage))}>{total === 0 ? '—' : `${percentage.toFixed(0)}%`}</div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-bold leading-tight truncate" style={{ color: isWard ? undefined : subjectColor }}>{title || subject}</h3>
                {tagEl}
              </div>
              {isWard && subtitle && <p className="text-sm font-semibold leading-tight" style={{ color: subjectColor }}>{subtitle}</p>}
              <p className="text-sm text-muted-foreground leading-tight">{time}</p>
              {effectiveMode === 'today' && currentSelection && !ecgPhase && (
                undoPending ? (
                  <button type="button" onClick={handleUndoTap} className="text-base font-extrabold text-rose-500 leading-tight animate-pulse cursor-pointer">Confirm Undo?</button>
                ) : (
                  <TypedLine key={`${activeDateStr}-${markCount}`} selection={currentSelection} conducted={total} planned={totalPlannedClasses} animate onStatusTap={handleUndoTap} />
                )
              )}
              {effectiveMode === 'today' && !currentSelection && <div className="leading-tight">{renderTodayAdvisory()}</div>}
              {effectiveMode === 'future' && !isFinished && withinWeek && <p className="text-base leading-tight">{futureMsg.jsx}</p>}
            </div>
            <div className="shrink-0 self-center">
              {effectiveMode === 'future' && !isFinished ? (
                withinWeek ? <SeverityRing sev={futureMsg.sev} /> : null
              ) : (
                <div className={cn('text-lg font-bold min-w-max', getPercentageColor(percentage))}>{total === 0 ? '--' : `${percentage.toFixed(0)}%`}</div>
              )}
            </div>
          </div>
        )}

        {/* ── BOTTOM (today) — keyed by confirm counter so ECG replays every confirm ── */}
        {effectiveMode === 'today' && (
          <AnimatePresence initial={false}>
            {todayBottom && (
              <motion.div key={`tb-${ecgCount}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }} className="overflow-hidden">
                <div className="mt-3 space-y-1 px-0.5">{todayBottom}</div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ── BOTTOM (future) ── */}
        {effectiveMode === 'future' && (
          <div className="mt-3">
            {isFinished ? (
              <p className="text-sm font-bold text-muted-foreground text-center">There will be No More Planned Classes!!</p>
            ) : !withinWeek ? (
              <p className="text-sm font-semibold text-muted-foreground text-center">Yet to be Conducted</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
