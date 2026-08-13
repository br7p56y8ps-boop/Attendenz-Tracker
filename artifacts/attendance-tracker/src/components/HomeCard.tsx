import React, { useState, useRef, useEffect } from 'react';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { cn, getCurrentDateStr, getSubjectColor } from '@/lib/utils';
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
subjectMode,
customSubjects,
customWards,
userAddedSubjects,
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
// ── Planned classes (honours user-added items in both modes) ─────────────
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
if (subjectMode === 'preloaded') {
const uaSub = userAddedSubjects?.find(s => s.name.toLowerCase() === subject.toLowerCase());
originalPlannedClasses = uaSub ? uaSub.plannedClasses : getSubjectPlannedTotal(subject);
} else {
const customSub = customSubjects?.find(s => s.name.toLowerCase() === subject.toLowerCase());
originalPlannedClasses = customSub ? customSub.plannedClasses : getSubjectPlannedTotal(subject);
}
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
// ── Past: counts as-of the selected date (true history) ────────────────────
const restMatches = (rest: string): boolean => {
const r = rest.toLowerCase();
const norms = [subject.toLowerCase(), shortenSubject(subject).toLowerCase(), key.toLowerCase()];
if (norms.some(n => r === n)) return true;
if (sessionId && (r === sessionId || r === `${key.toLowerCase()}-${sessionId}` || r === `${subject.toLowerCase()}-${sessionId}`)) return true;
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
// ── Future: what-if slider (preview only; resets on date change / out of view) ──
const [whatIf, setWhatIf] = useState<-1 | 0 | 1>(0);
const cardRef = useRef<HTMLDivElement>(null);
const sliderRef = useRef<HTMLDivElement>(null);
useEffect(() => { setWhatIf(0); }, [activeDateStr]);
useEffect(() => {
const el = cardRef.current;
if (!el || effectiveMode !== 'future') return;
const obs = new IntersectionObserver(entries => {
for (const en of entries) if (!en.isIntersecting) setWhatIf(0);
}, { threshold: 0.2 });
obs.observe(el);
return () => obs.disconnect();
}, [effectiveMode]);
const attPreview = total === 0 ? 100 : ((attended + 1) / (total + 1)) * 100;
const missPreview = total === 0 ? 0 : (attended / (total + 1)) * 100;
const previewPct = whatIf === 1 ? attPreview : whatIf === -1 ? missPreview : percentage;
const posFromX = (clientX: number): -1 | 0 | 1 => {
const el = sliderRef.current;
if (!el) return 0;
const r = el.getBoundingClientRect();
const f = (clientX - r.left) / r.width;
return f < 1 / 3 ? -1 : f < 2 / 3 ? 0 : 1;
};
const onSliderDown = (e: React.PointerEvent) => {
setWhatIf(posFromX(e.clientX));
const move = (ev: PointerEvent) => setWhatIf(posFromX(ev.clientX));
const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
window.addEventListener('pointermove', move);
window.addEventListener('pointerup', up);
};
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
// B6 · deterministic shared subject color for titles
const subjectColor = getSubjectColor(subject);
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
return null;
}
return null;
};
// ── Card background (today reacts to currentSelection; past/future get subject border) ──
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
<div className="flex items-center justify-center gap-2 flex-wrap">
  <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
  <span className="capitalize">
    {currentSelection === 'off' ? 'Holiday' : currentSelection}
  </span>
  {(currentSelection === 'attended' || currentSelection === 'missed') && totalPlannedClasses !== undefined && (
    <span className="text-[10px] font-extrabold ml-1">
      <span className={currentSelection === 'attended' ? 'text-emerald-500' : 'text-rose-500'}>Class {total}</span>
      <span className="opacity-90">/{totalPlannedClasses}</span>
    </span>
  )}
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
// ── PAST – status lives in the header tag; no bottom text ──
if (effectiveMode === 'past') return null;
// ── FUTURE – what-if slider (preview only) ──
if (effectiveMode === 'future' && !isFinished) {
return (
<div className="w-full relative z-10 select-none" style={{ touchAction: 'none' }}>
<div
ref={sliderRef}
onPointerDown={onSliderDown}
className="relative h-11 rounded-xl border border-border bg-background/70 overflow-hidden cursor-pointer"
>
<div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] font-bold uppercase tracking-wider pointer-events-none">
<span className="text-rose-500">Missed</span>
<span className="text-muted-foreground">Off</span>
<span className="text-emerald-500">Attended</span>
</div>
<div
className="absolute top-1 bottom-1 w-1/3 rounded-lg bg-primary/25 border border-primary/40 transition-all duration-150 pointer-events-none"
style={{ left: whatIf === -1 ? '0%' : whatIf === 0 ? '33.333%' : '66.666%' }}
/>
</div>
<p className="text-[9px] text-muted-foreground/70 text-center mt-1">Slide to preview — nothing is saved</p>
</div>
);
}
return null;
};
return (
<div
ref={cardRef}
className={cn(
'rounded-2xl p-5 shadow-sm border mb-4 transition-colors duration-300 relative overflow-hidden',
effectiveMode === 'today' ? cardBg : 'bg-card'
)}
style={effectiveMode !== 'today' ? { borderColor: subjectColor } : undefined}
>
{/* Header */}
{effectiveMode === 'past' ? (
<div className="flex items-center justify-between gap-3 mb-2 relative z-10">
<div className="min-w-0 flex-1 space-y-1">
<div className="flex items-baseline gap-2 flex-wrap">
<h3 className="text-xl font-bold leading-tight truncate" style={{ color: subjectColor }}>
{title || subject}
</h3>
{tag && (
<span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tagColor === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{tag}</span>
)}
</div>
<p className="text-sm font-semibold text-muted-foreground">({time})</p>
<div className="flex items-center gap-2 flex-wrap">
{(() => {
const sel = currentSelection;
const tagInfo = sel === 'attended'
? { t: 'Attended', c: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' }
: sel === 'missed'
? { t: 'Missed', c: 'bg-rose-500/10 text-rose-500 border-rose-500/20' }
: sel === 'off'
? { t: 'Holiday', c: 'bg-amber-500/10 text-amber-500 border-amber-500/20' }
: isFinished
? { t: 'No Planned Class', c: 'bg-muted/40 text-muted-foreground border-border/50' }
: { t: 'Not Marked', c: 'bg-muted/20 text-muted-foreground/70 border-border/40' };
return (
<span className={cn('inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', tagInfo.c)}>{tagInfo.t}</span>
);
})()}
{currentSelection && (currentSelection === 'attended' || currentSelection === 'missed') && pastCounts && (
<span className="text-[11px] font-extrabold text-foreground">
Class <span className={currentSelection === 'attended' ? 'text-emerald-500' : 'text-rose-500'}>{pastCounts.conducted}</span>/{totalPlannedClasses ?? pastCounts.conducted}
</span>
)}
</div>
</div>
<div className={cn('text-lg font-bold min-w-max self-center', pastPct === null ? 'text-muted-foreground' : getPercentageColor(pastPct))}>
{pastPct === null ? '—' : `${pastPct.toFixed(0)}%`}
</div>
</div>
) : (
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
<p className="text-sm font-semibold mt-1" style={{ color: subjectColor }}>
{subtitle}
</p>
)}
<p className="text-muted-foreground text-sm mt-1">{time}</p>
</>
) : (
<>
{/* B6 · colored subject title */}
<div className="flex items-center gap-2 flex-wrap">
<h3 className="text-xl font-bold leading-tight" style={{ color: subjectColor }}>
{title || subject}
</h3>
{tag && (
<span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', tagColor === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
{tag}
</span>
)}
</div>
<p className="text-muted-foreground text-sm mt-1">{time}</p>
</>
)}
</div>
<div
className={cn('text-lg font-bold min-w-max', getPercentageColor(effectiveMode === 'future' ? previewPct : percentage))}
>
{effectiveMode === 'future' ? `${Math.round(previewPct)}%` : total === 0 ? '--' : `${percentage.toFixed(0)}%`}
</div>
</div>
)}
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
