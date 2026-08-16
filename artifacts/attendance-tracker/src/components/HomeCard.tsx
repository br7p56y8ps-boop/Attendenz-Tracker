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
const cls = (n: number) => (n === 1 ? 'class' : 'classes');

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
  const lines = sev === 'must' ? ['Must', 'Attend'] : sev === 'can' ? ['Can', 'Miss'] : ['Safe to', 'Miss'];
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
  return <p className="text-base font-extrabold leading-tight">{out}</p>;
};

export const HomeCard = ({ subject, time, isWard = false, title, subtitle, tag, tagColor, sessionId, dateStr, mode, pastSelection, isSGT = false, sgtId }: HomeCardProps) => {
  const { subjects, wards, homeSelections, finishedMap, updateHomeSelection, preferredPercentage } = useAttendance();
  const { subjectMode, customSubjects, customWards, userAddedSubjects, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned } = useCustomData();
  const activeDateStr = dateStr || getCurrentDateStr();

  const [pendingSelection, setPendingSelection] = useState<'off' | 'missed' | 'attended' | null>(null);
  const [justMarked, setJustMarked] = useState(false);
  const [showECG, setShowECG] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [undoOpen, setUndoOpen] = useState(false);
  const swipeStart = useRef<number | null>(null);

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

  // 7-day future window
  const daysFromToday = Math.round((new Date(activeDateStr + 'T12:00:00').getTime() - new Date(getCurrentDateStr() + 'T12:00:00').getTime()) / 86400000);
  const withinWeek = daysFromToday >= 0 && daysFromToday <= 7;

  // ── Your ORIGINAL today-message logic (used for today subtitle AND future inline) ──
  const canMissCount = Math.max(0, Math.floor((attended * 100) / preferredPercentage - total));
  const needToAttend = Math.max(1, Math.ceil((preferredPercentage * total - 100 * attended) / (100 - preferredPercentage)));
  const advisory = (() => {
    if (total === 0) return null;
    if (percentage < preferredPercentage) {
      if (remainingClasses !== undefined && needToAttend > remainingClasses) {
        const maxPct = Math.round(((attended + remainingClasses) / (total + remainingClasses)) * 100);
        return { sev: 'must' as const, jsx: <span className="text-destructive font-semibold">Unreachable target! Max possible is {maxPct}%</span> };
      }
      return { sev: 'must' as const, jsx: <span className="text-destructive font-semibold">Must attend next <strong className="font-extrabold">{needToAttend}</strong> {cls(needToAttend)} to reach {preferredPercentage}%</span> };
    }
    if (canMissCount > 0) {
      return { sev: (canMissCount >= 2 ? 'safe' : 'can') as 'safe' | 'can', jsx: <span className="text-emerald-500 font-semibold">On track. Can miss next <strong className="font-extrabold">{canMissCount}</strong> {cls(canMissCount)}</span> };
    }
    return { sev: 'must' as const, jsx: <span className="text-amber-500 font-semibold">At target limit. Do not miss next class</span> };
  })();

  const getPercentageColor = (pct: number) => {
    if (pct < preferredPercentage) return 'text-destructive';
    if (pct <= preferredPercentage + 5) return 'text-warning';
    return 'text-success';
  };
  const ecgColor = percentage >= 80 ? '#10b981' : percentage >= 75 ? '#f59e0b' : '#ef4444';
  const subjectColor = getSubjectColor(subject);

  const doMark = (sel: 'off' | 'missed' | 'attended') => {
    updateHomeSelection(selectionKey, attendanceKey, sel, isWard);
    setJustMarked(true);
    setShowECG(true);
    setTimeout(() => setShowECG(false), 1500);
    setPendingSelection(null);
    setDragX(0);
  };
  const doUndo = () => {
    if (currentSelection) updateHomeSelection(selectionKey, attendanceKey, currentSelection, isWard);
    setUndoOpen(false); setSwipeX(0); setJustMarked(false);
  };

  // drag-to-confirm (pill in its own slot; drag into a zone)
  const allowDir = (sel: 'off' | 'missed' | 'attended'): number[] =>
    sel === 'attended' ? [1] : sel === 'off' ? [-1] : [-1, 1];
  const onPillDown = (e: React.PointerEvent) => { e.stopPropagation(); dragStart.current = e.clientX; };
  const onPillMove = (e: React.PointerEvent) => { e.stopPropagation(); if (dragStart.current !== null) setDragX(e.clientX - dragStart.current); };
  const onPillUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (dragStart.current === null) return;
    const dirs = allowDir(pendingSelection as any);
    const ok = (dirs.includes(1) && dragX > 70) || (dirs.includes(-1) && dragX < -70);
    dragStart.current = null;
    if (ok && pendingSelection) doMark(pendingSelection);
    else setDragX(0);
  };

  // swipe WHOLE card to undo
  const REVEAL = 110;
  const onCardDown = (e: React.PointerEvent) => { if (effectiveMode === 'today' && currentSelection) swipeStart.current = e.clientX; };
  const onCardMove = (e: React.PointerEvent) => { if (swipeStart.current === null) return; const dx = e.clientX - swipeStart.current; setSwipeX(Math.max(0, Math.min(REVEAL, dx))); };
  const onCardUp = () => { if (swipeStart.current === null) return; swipeStart.current = null; if (swipeX > REVEAL * 0.5) { setUndoOpen(true); setSwipeX(REVEAL); } else { setUndoOpen(false); setSwipeX(0); } };

  const finishedTargetMet = totalPlannedClasses ? attended >= Math.ceil(totalPlannedClasses * (preferredPercentage / 100)) : true;
  const selColor = (s: string) => s === 'attended' ? 'text-emerald-500' : s === 'missed' ? 'text-rose-500' : 'text-amber-500';
  const selBg = (s: string) => s === 'attended' ? 'bg-emerald-500/25 border-emerald-500/60' : s === 'missed' ? 'bg-rose-500/25 border-rose-500/60' : 'bg-amber-500/25 border-amber-500/60';
  const hint = (s: string) => s === 'attended' ? 'drag right →' : s === 'off' ? '← drag left' : '← drag →';
  const tagEl = tag ? <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tagColor === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{tag}</span> : null;

  const markTint = currentSelection === 'attended' ? 'bg-emerald-500/15' : currentSelection === 'missed' ? 'bg-rose-500/15' : currentSelection === 'off' ? 'bg-amber-500/15' : '';
  const borderCls = isFinished && effectiveMode !== 'today'
    ? (finishedTargetMet ? 'border-emerald-500/60 ring-2 ring-emerald-500/40' : 'border-rose-500/60 ring-2 ring-rose-500/40')
    : currentSelection === 'attended' ? 'border-emerald-500/60 ring-2 ring-emerald-500/40'
    : currentSelection === 'missed' ? 'border-rose-500/60 ring-2 ring-rose-500/40'
    : currentSelection === 'off' ? 'border-amber-500/60 ring-2 ring-amber-500/40'
    : 'border-card-border';

  return (
    <div className="relative mb-4">
      {/* Confirm Undo BEHIND the card */}
      {effectiveMode === 'today' && currentSelection && (
        <button type="button" onClick={doUndo} className="absolute left-4 top-1/2 -translate-y-1/2 z-0 px-4 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-extrabold shadow-lg cursor-pointer">
          Confirm Undo
        </button>
      )}

      <motion.div
        animate={{ x: swipeX }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onPointerDown={onCardDown} onPointerMove={onCardMove} onPointerUp={onCardUp} onPointerLeave={onCardUp}
        className={cn('relative z-10 rounded-2xl border overflow-hidden select-none bg-card', borderCls)}
        style={effectiveMode !== 'today' && !isFinished ? { borderColor: subjectColor } : undefined}
      >
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
                    const t = sel === 'attended' ? 'Attended' : sel === 'missed' ? 'Missed' : sel === 'off' ? 'Holiday' : isFinished ? 'No Planned Class' : 'Not Marked';
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
            /* ── TODAY / FUTURE (tight stack) ── */
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl font-bold leading-tight truncate" style={{ color: isWard ? undefined : subjectColor }}>{title || subject}</h3>
                  {tagEl}
                </div>
                {isWard && subtitle && <p className="text-sm font-semibold leading-tight" style={{ color: subjectColor }}>{subtitle}</p>}
                <p className="text-sm text-muted-foreground leading-tight">{time}</p>
                {effectiveMode === 'today' && (currentSelection === 'attended' || currentSelection === 'missed') && (
                  <TypedLine selection={currentSelection} conducted={total} planned={totalPlannedClasses} animate={justMarked} />
                )}
                {effectiveMode === 'future' && !isFinished && withinWeek && advisory && (
                  <p className="text-base leading-tight">{advisory.jsx}</p>
                )}
              </div>
              <div className="shrink-0 self-center">
                {effectiveMode === 'future' && !isFinished ? (
                  withinWeek && advisory ? <SeverityRing sev={advisory.sev} /> : null
                ) : (
                  <div className={cn('text-lg font-bold min-w-max', getPercentageColor(percentage))}>{total === 0 ? '--' : `${percentage.toFixed(0)}%`}</div>
                )}
              </div>
            </div>
          )}

          {/* ── BOTTOM ── */}
          {effectiveMode === 'today' && (
            <div className="mt-3 space-y-1">
              <AnimatePresence>
                {showECG && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-8 pointer-events-none">
                    <svg className="w-full h-8" preserveAspectRatio="none" viewBox="0 0 100 40">
                      <motion.path d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 100 20" fill="none" stroke={ecgColor} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeInOut' }} />
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>

              {isFinished && !currentSelection ? (
                <div className={cn('w-full py-3.5 rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase text-center border flex items-center justify-center gap-2',
                  finishedTargetMet ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40' : 'bg-rose-500/20 text-rose-500 border-rose-500/40')}>
                  <CheckCircle2 className="w-4 h-4" /><span>NO MORE PLANNED CLASSES!!!</span>
                </div>
              ) : currentSelection ? (
                <p className="text-[9px] text-muted-foreground/50 text-center tracking-widest uppercase">swipe card to undo</p>
              ) : pendingSelection ? (
                <div className="flex gap-2">
                  {(['attended', 'missed', 'off'] as const).map(s => {
                    if (s === pendingSelection) {
                      return (
                        <div key={s} className="flex-1 min-w-0">
                          <div
                            onPointerDown={onPillDown} onPointerMove={onPillMove} onPointerUp={onPillUp} onPointerLeave={onPillUp}
                            className={cn('h-11 rounded-xl border flex items-center justify-center gap-1.5 cursor-grab active:cursor-grabbing', selBg(s), selColor(s))}
                            style={{ transform: `translateX(${dragX}px)` }}
                          >
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span className="text-xs font-extrabold capitalize">{s === 'off' ? 'Holiday' : s}</span>
                            <motion.span animate={{ x: [0, 5, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="text-[8px] opacity-40 font-bold">{hint(s)}</motion.span>
                          </div>
                        </div>
                      );
                    }
                    return <div key={s} className="flex-1 h-11 rounded-xl border border-dashed border-border/40" />;
                  })}
                </div>
              ) : (
                <div className="flex gap-2">
                  {(['attended', 'missed', 'off'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setPendingSelection(s)}
                      className={cn('flex-1 h-11 rounded-xl text-xs sm:text-sm font-semibold border transition-all bg-background/70 text-muted-foreground border-border',
                        s === 'attended' && 'hover:bg-emerald-500/10 hover:text-emerald-600', s === 'missed' && 'hover:bg-rose-500/10 hover:text-rose-600', s === 'off' && 'hover:bg-amber-500/10 hover:text-amber-600')}>
                      {s === 'off' ? 'Holiday' : s === 'attended' ? 'Attended' : 'Missed'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
      </motion.div>
    </div>
  );
};
