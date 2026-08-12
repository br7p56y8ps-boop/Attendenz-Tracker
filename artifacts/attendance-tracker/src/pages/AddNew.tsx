import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/Layout';
import {
useCustomData,
DAY_ABBRS,
parseDayList,
getEffectiveParentName,
} from '@/contexts/CustomDataContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import {
cn,
canonicalTimeRange,
canonicalizeTimeRange,
parseRangeToMinutes,
rangeStartMinutes,
formatISODateDDMMYY,
to12h,
getSubjectColor,
} from '@/lib/utils';
import { lockScroll, unlockScroll } from '@/lib/scrollLock';
import { PRESET_PARENTS } from '@/lib/constants';
import { storageSetItem } from '@/lib/idb';
import {
Plus, Trash2, Pencil, X, AlertTriangle,
SlidersHorizontal, GraduationCap, Stethoscope, Download, Upload, Copy, Share2, FileText,
} from 'lucide-react';
/* ── Shared styles (compact scale) ── */
const inputCls =
'w-full h-10 bg-background border border-border rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40';
const btnPrimary =
'px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
'px-4 py-2 rounded-xl bg-muted/40 text-foreground font-bold text-xs border border-border hover:bg-muted transition-all cursor-pointer';
const labelCls = 'block text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide';
const inlineErrCls =
'text-[11px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2';
const CREATE_NEW = '__create_new__';
const SINGLE_DEST = '__single__';
const BUNDLE_VERSION = 2;
const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const splitRange = (range: string): { start: string; end: string } => {
const canon = canonicalizeTimeRange(range || '');
const m = canon.match(/^(\d{2}:\d{2} (?:AM|PM))–(\d{2}:\d{2} (?:AM|PM))$/);
if (m) return { start: m[1], end: m[2] };
return { start: '09:00 AM', end: '10:00 AM' };
};
const to24 = (mins: number): string => {
const m = ((mins % 1440) + 1440) % 1440;
return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
function OverlayModal({ open, onClose, children, maxW = 'max-w-md' }: {
open: boolean; onClose: () => void; children: React.ReactNode; maxW?: string;
}) {
useEffect(() => {
if (!open) return;
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
window.addEventListener('keydown', onKey);
lockScroll();
return () => { window.removeEventListener('keydown', onKey); unlockScroll(); };
}, [open, onClose]);
if (!open) return null;
if (typeof document === 'undefined') return null;
return createPortal(
<div className="fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto">
<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
<motion.div
initial={{ opacity: 0, scale: 0.95, y: 12 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
transition={{ type: 'spring', damping: 26, stiffness: 320 }}
className={cn('relative bg-card border border-border rounded-2xl shadow-2xl w-full max-h-[85vh] overflow-y-auto', maxW)}
onClick={e => e.stopPropagation()}
>
{children}
</motion.div>
</div>,
document.body
);
}
/* Inline confirm/fail note (Settings-style) — rendered inside the open modal */
function Note({ note }: { note: { msg: string; kind: 'ok' | 'err' | 'info' } | null }) {
if (!note) return null;
return (
<p className={cn(
'text-[11px] font-semibold rounded-lg px-3 py-2 border',
note.kind === 'ok' && 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
note.kind === 'err' && 'text-destructive bg-destructive/10 border-destructive/20',
note.kind === 'info' && 'text-primary bg-primary/10 border-primary/20'
)}>
{note.kind === 'ok' ? '✓ ' : note.kind === 'err' ? '✗ ' : '• '}{note.msg}
</p>
);
}
/* Compact native time box — ONE box per value */
function TimeField({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) {
const to24val = (v: string): string => {
const m = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
if (!m) return '09:00';
let h = parseInt(m[1], 10) % 12;
if (m[3].toUpperCase() === 'PM') h += 12;
return `${String(h).padStart(2, '0')}:${m[2]}`;
};
const to12val = (v: string): string => {
const [hs, ms] = (v || '').split(':');
const h = parseInt(hs, 10);
const mi = parseInt(ms, 10);
if (isNaN(h) || isNaN(mi)) return value;
const mer = h >= 12 ? 'PM' : 'AM';
const h12 = h % 12 === 0 ? 12 : h % 12;
return `${String(h12).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${mer}`;
};
return (
<input
type="time"
aria-label={ariaLabel || 'time'}
value={to24val(value)}
onChange={e => onChange(to12val(e.target.value))}
className="h-9 w-full min-w-0 flex-1 bg-background border border-border rounded-lg px-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
/>
);
}
const AddedBadge = () => (
<span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">
✦ Added by you
</span>
);
/* ── Local types ── */
interface ScheduleRow { id: string; day: string; startTime: string; endTime: string; }
interface StagedChild { name: string; rows: ScheduleRow[]; plannedClasses: number; startDate?: string; endDate?: string; }
interface EditSubjectState {
store: 'userAdded' | 'custom'; id: string; originalName: string; name: string;
subjectType: 'single' | 'allied' | 'allied-parent'; parentName: string;
rows: ScheduleRow[]; plannedClasses: number; startDate?: string; endDate?: string;
}
interface EditWardState {
store: 'preset' | 'custom'; index?: number; id?: string;
originalName: string; name: string; startDate: string; endDate: string;
mornStart: string; mornEnd: string; eveStart: string; eveEnd: string;
}
interface EditSlotState {
day: number; index: number; startTime: string; endTime: string; targetDay: number;
subjects: Array<{ name: string; planned: number }>;
}
interface ImportBundle {
version?: number; subjectMode?: 'preloaded' | 'custom';
addedSubjects?: Array<{ name: string; type?: string; parentCategory?: string | null; planned?: number; schedules?: Array<{ day: string; start: string; end: string }> }>;
customWards?: Array<{ name: string; startDate: string; endDate: string; morningTime?: string; eveningTime?: string }>;
presetTimetable?: any; presetWardSchedule?: any; presetSubjectTotals?: Record<string, number>;
}
interface ImportReport { subjectsAdd: number; subjectsSkip: string[]; wardsAdd: number; wardsSkip: string[]; slots: number; rotations: number; }
const AI_PROMPT_SCHEMA = `You are helping me build a routine bundle for "Attendenz Tracker". Respond with ONLY a valid JSON object matching this exact schema:
{"version":2,"subjectMode":"preloaded"|"custom","addedSubjects":[{"name":"string","type":"single"|"allied"|"allied-parent","parentCategory":"string"|null,"planned":number,"schedules":[{"day":"Mon","start":"HH:MM","end":"HH:MM"}]}],"customWards":[{"name":"string","startDate":"yyyy-mm-dd","endDate":"yyyy-mm-dd","morningTime":"hh:mm AM–hh:mm PM","eveningTime":"hh:mm PM–hh:mm PM"}],"presetTimetable":{"0":[{"time":"hh:mm AM–hh:mm AM","type":"lecture","subjects":["string"]}]},"presetWardSchedule":[{"start":"yyyy-mm-dd","end":"yyyy-mm-dd","ward":"string","morningTime":"...","eveningTime":"..."}],"presetSubjectTotals":{"Subject":number}}
Rules: schedules use 24h HH:MM (the app canonicalizes on import); never include attendance data; day abbreviations are Sun..Sat.`;
const newRow = (usedDays: string[]): ScheduleRow => {
const day = DAY_ABBRS.find(d => !usedDays.includes(d)) || 'Mon';
return { id: genId('row'), day, startTime: '09:00 AM', endTime: '10:00 AM' };
};
export default function AddNew() {
const {
subjectMode,
customSubjects, customWards,
userAddedSubjects,
presetTimetable, presetWardSchedule, presetSubjectTotals,
addCustomSubjects, updateCustomSubject, removeCustomSubject,
addCustomWards, updateCustomWard, removeCustomWard,
addUserAddedSubjects, updateUserAddedSubject, removeUserAddedSubject, isUserAddedName,
addPresetWardEntry, updatePresetWardEntry, removePresetWardEntry,
updatePresetTimetableSlot, updatePresetSubjectTotal,
getParentOptions, isExistingParent, getAlliedChildCount,
isSubjectNameTaken, isWardNameTaken, findSubjectTimeConflicts, findWardDateConflicts,
getSubjectPlannedTotal,
bulkUpdateSubjectHierarchy,
} = useCustomData();
const { removeSubjectData, removeWardData, renameSubjectData, renameWardData } = useAttendance();
/* ── Inline note (Settings-style) replaces the top toast ── */
const [note, setNote] = useState<{ msg: string; kind: 'ok' | 'err' | 'info' } | null>(null);
const noteTimer = useRef<number | null>(null);
const showToast = (msg: string, kind: 'ok' | 'err' | 'info' = 'ok') => {
if (noteTimer.current) window.clearTimeout(noteTimer.current);
setNote({ msg, kind });
noteTimer.current = window.setTimeout(() => setNote(null), 2600);
};
useEffect(() => () => { if (noteTimer.current) window.clearTimeout(noteTimer.current); }, []);
const [formError, setFormError] = useState<string | null>(null);
const [editError, setEditError] = useState<string | null>(null);
const [moreOpen, setMoreOpen] = useState(false);
const [section, setSection] = useState<'academic' | 'clinical'>('academic');
const [selDay, setSelDay] = useState<number>(new Date().getDay());
const [subjectType, setSubjectType] = useState<'single' | 'allied'>('single');
const [subjectName, setSubjectName] = useState('');
const [parentChoice, setParentChoice] = useState('');
const [newParentName, setNewParentName] = useState('');
const [subjectRows, setSubjectRows] = useState<ScheduleRow[]>([newRow([])]);
const [planned, setPlanned] = useState('');
const [stagedChildren, setStagedChildren] = useState<StagedChild[]>([]);
const [childStart, setChildStart] = useState('');
const [childEnd, setChildEnd] = useState('');
const [wardName, setWardName] = useState('');
const [wardStart, setWardStart] = useState('');
const [wardEnd, setWardEnd] = useState('');
const [mornStart, setMornStart] = useState('09:30 AM');
const [mornEnd, setMornEnd] = useState('11:30 AM');
const [eveStart, setEveStart] = useState('07:00 PM');
const [eveEnd, setEveEnd] = useState('09:00 PM');
const [conflictSheet, setConflictSheet] = useState<{ messages: string[]; onConfirm: () => void } | null>(null);
const [deleteSheet, setDeleteSheet] = useState<{ title: string; lines: string[]; onConfirm: () => void } | null>(null);
const [slotRemove, setSlotRemove] = useState<{ subject: string; day: number; index: number; time: string } | null>(null);
const [editSubject, setEditSubject] = useState<EditSubjectState | null>(null);
const [editWard, setEditWard] = useState<EditWardState | null>(null);
const [editSlot, setEditSlot] = useState<EditSlotState | null>(null);
const [exportOpen, setExportOpen] = useState(false);
const [importOpen, setImportOpen] = useState(false);
const [pasteOpen, setPasteOpen] = useState(false);
const [pasteText, setPasteText] = useState('');
const [pasteError, setPasteError] = useState<string | null>(null);
const [importError, setImportError] = useState<string | null>(null);
const [preview, setPreview] = useState<{ bundle: ImportBundle; report: ImportReport } | null>(null);
const importFileRef = useRef<HTMLInputElement>(null);
const [opdOpen, setOpdOpen] = useState(false);
const [opdChoice, setOpdChoice] = useState<Record<string, string>>({});
const parentOptions = getParentOptions();
const groupedParents = useMemo(() => {
const preset = subjectMode === 'preloaded' ? PRESET_PARENTS : [];
const store = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
const parents = Array.from(new Set([...preset, ...store.filter(s => s.subjectType === 'allied-parent').map(s => s.name)]));
const singles = store.filter(s => s.subjectType === 'single').map(s => s.name).filter(n => !parents.includes(n));
return { parents, singles };
}, [subjectMode, userAddedSubjects, customSubjects]);
const isAllied = subjectType === 'allied';
const resolvedParent = parentChoice === CREATE_NEW ? newParentName.trim() : parentChoice.trim();
const parentIsNew = resolvedParent ? !(PRESET_PARENTS.includes(resolvedParent) || isExistingParent(resolvedParent)) : false;
const parentIsSGT = resolvedParent ? PRESET_PARENTS.includes(resolvedParent) : false;
const addSubjectRow = () => {
if (subjectRows.length >= 7) { setFormError('Maximum 7 day & time rows.'); return; }
setSubjectRows(prev => [...prev, newRow(prev.map(r => r.day))]);
};
const updateSubjectRow = (id: string, patch: Partial<ScheduleRow>) => setSubjectRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
const removeSubjectRow = (id: string) => setSubjectRows(prev => prev.filter(r => r.id !== id));
const rowProblem = (rows: ScheduleRow[]): string | null => {
if (rows.length === 0) return 'Add at least one day & time row.';
const okTime = (t: string) => /^\d{1,2}:\d{2} (AM|PM)$/.test(t);
for (let i = 0; i < rows.length; i++) {
const r = rows[i];
if (!r.day || !okTime(r.startTime) || !okTime(r.endTime)) return `Row ${i + 1}: pick a day and complete both times.`;
}
return null;
};
const movableSubjects = useMemo(() => {
const list = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
return list.filter(s => s.subjectType === 'single' || s.subjectType === 'allied');
}, [subjectMode, userAddedSubjects, customSubjects]);
const opdCurrent = (s: { subjectType: string; parentName?: string; category?: string }): string =>
s.subjectType === 'allied' ? (getEffectiveParentName(s) || SINGLE_DEST) : SINGLE_DEST;
const openOpd = () => { setOpdChoice({}); setOpdOpen(true); };
const saveOpd = () => {
try {
const store: 'userAdded' | 'custom' = subjectMode === 'preloaded' ? 'userAdded' : 'custom';
const moves: Array<{ id: string; store: 'userAdded' | 'custom'; newSubjectType: 'single' | 'allied'; newParentName?: string }> = [];
for (const s of movableSubjects) {
const choice = opdChoice[s.id];
if (choice === undefined || choice === opdCurrent(s)) continue;
moves.push({ id: s.id, store, newSubjectType: choice === SINGLE_DEST ? 'single' : 'allied', newParentName: choice === SINGLE_DEST ? undefined : choice });
}
if (moves.length === 0) { setOpdOpen(false); showToast('No changes to apply.', 'info'); return; }
const n = bulkUpdateSubjectHierarchy(moves);
setOpdOpen(false);
showToast(`Moved ${n} subject(s).`);
} catch { showToast('Failed to move subjects — try again.', 'err'); }
};
/* ── Day slots (preloaded) sorted by parsed minutes ── */
const daySlots = useMemo(() => {
const slots = (presetTimetable[selDay] || [])
.map((slot, idx) => ({ slot, idx }))
.filter(({ slot }) => slot.type !== 'ward' && slot.type !== 'ward_replacement' && slot.subjects.length > 0);
slots.sort((a, b) => (rangeStartMinutes(a.slot.time) ?? 1440) - (rangeStartMinutes(b.slot.time) ?? 1440));
return slots;
}, [presetTimetable, selDay]);
const customDayEntries = useMemo(() => {
const abbr = DAY_ABBRS[selDay];
const entries: Array<{ id: string; name: string; time: string; planned: number; subjectType: string; parentName?: string }> = [];
customSubjects.forEach(s => {
if (s.subjectType === 'allied-parent') return;
let time = s.time || '';
if (s.schedules && s.schedules.length > 0) {
const sch = s.schedules.find(x => x.day === abbr);
if (!sch) return;
time = sch.time;
} else if (!parseDayList(s.days).includes(abbr)) return;
entries.push({ id: s.id, name: s.name, time, planned: s.plannedClasses, subjectType: s.subjectType, parentName: getEffectiveParentName(s) });
});
entries.sort((a, b) => (rangeStartMinutes(a.time) ?? 1440) - (rangeStartMinutes(b.time) ?? 1440));
return entries;
}, [customSubjects, selDay]);
const clinicalEntries = useMemo(() => {
const list = subjectMode === 'preloaded'
? presetWardSchedule.map((e, i) => ({ ...e, index: i, store: 'preset' as const, id: undefined as string | undefined }))
: customWards.map(w => ({ ward: w.name, start: w.startDate, end: w.endDate, morningTime: w.morningTime, eveningTime: w.eveningTime, addedByUser: true, index: undefined as number | undefined, store: 'custom' as const, id: w.id }));
return [...list].sort((a, b) => a.start.localeCompare(b.start));
}, [subjectMode, presetWardSchedule, customWards]);
/* ═══════════ SAVE FLOWS (inline note + delayed close) ═══════════ */
const buildRowsFromForm = (rows: ScheduleRow[]) =>
rows.map(r => ({ day: r.day, time: canonicalTimeRange(r.startTime, r.endTime), start: r.startTime, end: r.endTime }));
const runConflicts = (items: Array<{ name: string; subjectType: string; rows: Array<{ day: string; time: string }> }>) => {
const duplicates: string[] = [];
const timeOverlaps: Array<{ day: string; time: string; subjects: string[] }> = [];
const seen = new Set<string>();
const academic = items.filter(i => i.subjectType !== 'allied-parent');
for (const it of academic) {
const ln = it.name.trim().toLowerCase();
if (seen.has(ln)) { if (!duplicates.includes(it.name)) duplicates.push(it.name); continue; }
seen.add(ln);
if (isSubjectNameTaken(it.name) && !duplicates.includes(it.name)) duplicates.push(it.name);
for (const r of it.rows) {
for (const c of findSubjectTimeConflicts([r.day], r.time, undefined)) {
if (!c.exact) timeOverlaps.push({ day: c.day, time: c.time, subjects: c.subjects });
}
}
}
for (let i = 0; i < academic.length; i++) {
for (let j = i + 1; j < academic.length; j++) {
const a = academic[i], b = academic[j];
for (const ra of a.rows) for (const rb of b.rows) {
if (ra.day !== rb.day) continue;
const pa = parseRangeToMinutes(ra.time), pb = parseRangeToMinutes(rb.time);
if (!pa || !pb) continue;
if (pa.start < pb.end && pb.start < pa.end && canonicalizeTimeRange(ra.time) !== canonicalizeTimeRange(rb.time)) {
timeOverlaps.push({ day: ra.day, time: rb.time, subjects: [a.name, b.name] });
}
}
}
}
return { duplicates, timeOverlaps };
};
interface CommitItem {
name: string;
subjectType: 'single' | 'allied' | 'allied-parent';
parentName?: string;
plannedClasses: number;
rows: Array<{ day: string; time: string; start: string; end: string }>;
startDate?: string;
endDate?: string;
}
const commitSubjects = (items: CommitItem[]) => {
try {
if (subjectMode === 'preloaded') {
addUserAddedSubjects(items.map(it => ({
name: it.name, subjectType: it.subjectType, parentName: it.parentName,
plannedClasses: it.plannedClasses,
days: it.rows.map(r => r.day).join(', '),
time: it.rows[0]?.time || '',
schedules: it.rows.map(r => ({ day: r.day, start: r.start, end: r.end })),
startDate: it.startDate, endDate: it.endDate,
})));
} else {
addCustomSubjects(items.map(it => ({
name: it.name, subjectType: it.subjectType, parentName: it.parentName,
plannedClasses: it.plannedClasses,
days: it.rows.map(r => r.day).join(', '),
time: it.rows[0]?.time || '',
schedules: it.rows.map(r => ({ day: r.day, time: r.time })),
startDate: it.startDate, endDate: it.endDate,
})));
}
setSubjectName(''); setPlanned(''); setSubjectRows([newRow([])]); setStagedChildren([]); setNewParentName(''); setChildStart(''); setChildEnd('');
setFormError(null);
showToast(items.length > 1 ? `${items.length} items added.` : 'Added successfully.');
window.setTimeout(() => { setConflictSheet(null); setMoreOpen(false); }, 900);
} catch {
showToast('Failed to save — please try again.', 'err');
}
};
const saveSubject = () => {
const items: CommitItem[] = [];
if (!isAllied) {
if (!subjectName.trim()) { setFormError('Enter a subject name.'); return; }
const rp = rowProblem(subjectRows);
if (rp) { setFormError(rp); return; }
const pc = parseInt(planned, 10);
if (isNaN(pc) || pc < 0) { setFormError('Enter valid planned classes.'); return; }
items.push({ name: subjectName.trim(), subjectType: 'single', plannedClasses: pc, rows: buildRowsFromForm(subjectRows) });
} else {
if (!resolvedParent) { setFormError('Choose or create a parent.'); return; }
const children: StagedChild[] = [...stagedChildren];
if (subjectName.trim() && subjectRows.length > 0) {
const rp = rowProblem(subjectRows);
if (rp) { setFormError(rp); return; }
const pc = parseInt(planned, 10);
if (isNaN(pc) || pc < 0) { setFormError('Enter valid planned classes for the current child.'); return; }
if (parentIsSGT && (!childStart || !childEnd)) { setFormError('Pick placement start & end dates for Small Group children.'); return; }
if (parentIsSGT && childEnd < childStart) { setFormError('Placement end must be after start.'); return; }
children.push({ name: subjectName.trim(), rows: [...subjectRows], plannedClasses: pc, startDate: childStart, endDate: childEnd });
}
if (children.length === 0) { setFormError('Add at least one child subject.'); return; }
const minReq = parentIsNew ? 2 : 1;
if (children.length < minReq) {
setFormError(parentIsNew ? `A brand-new parent needs at least 2 children (you have ${children.length}).` : 'Add at least 1 child.');
return;
}
for (const c of children) {
const rp = rowProblem(c.rows);
if (rp) { setFormError(`Child “${c.name}”: ${rp}`); return; }
}
if (parentIsNew) items.push({ name: resolvedParent, subjectType: 'allied-parent', plannedClasses: 0, rows: [] });
for (const c of children) {
items.push({ name: c.name, subjectType: 'allied', parentName: resolvedParent, plannedClasses: c.plannedClasses, rows: buildRowsFromForm(c.rows), startDate: c.startDate, endDate: c.endDate });
}
}
try {
const { duplicates, timeOverlaps } = runConflicts(items);
if (duplicates.length > 0 || timeOverlaps.length > 0) {
const messages: string[] = [];
for (const d of duplicates) messages.push(`Duplicate name: “${d}” already exists.`);
for (const t of timeOverlaps) messages.push(`Time overlap on ${t.day} at ${t.time} with ${t.subjects.join(', ')}.`);
setFormError(null);
setConflictSheet({ messages, onConfirm: () => commitSubjects(items) });
return;
}
commitSubjects(items);
} catch {
showToast('Failed to check/save — please try again.', 'err');
}
};
const addStagedChild = () => {
if (!subjectName.trim()) { setFormError('Enter a child subject name.'); return; }
const rp = rowProblem(subjectRows);
if (rp) { setFormError(rp); return; }
const pc = parseInt(planned, 10);
if (isNaN(pc) || pc < 0) { setFormError('Enter valid planned classes.'); return; }
if (parentIsSGT && (!childStart || !childEnd)) { setFormError('Pick placement start & end dates for Small Group children.'); return; }
if (parentIsSGT && childEnd < childStart) { setFormError('Placement end must be after start.'); return; }
setFormError(null);
setStagedChildren(prev => [...prev, { name: subjectName.trim(), rows: [...subjectRows], plannedClasses: pc, startDate: childStart, endDate: childEnd }]);
setSubjectName(''); setPlanned(''); setSubjectRows([newRow([])]); setChildStart(''); setChildEnd('');
};
const commitWard = (name: string, start: string, end: string, mt: string, et: string) => {
try {
if (subjectMode === 'preloaded') addPresetWardEntry({ start, end, ward: name, morningTime: mt, eveningTime: et, addedByUser: true });
else addCustomWard({ name, startDate: start, endDate: end, morningTime: mt, eveningTime: et });
setWardName(''); setWardStart(''); setWardEnd('');
setFormError(null);
showToast('Rotation added.');
window.setTimeout(() => { setConflictSheet(null); setMoreOpen(false); }, 900);
} catch {
showToast('Failed to save rotation — please try again.', 'err');
}
};
const saveWard = () => {
if (!wardName.trim()) { setFormError('Enter a ward name.'); return; }
if (!wardStart || !wardEnd) { setFormError('Pick start and end dates.'); return; }
if (wardEnd < wardStart) { setFormError('End date must be after start date.'); return; }
const name = wardName.trim();
const morningTime = canonicalTimeRange(mornStart, mornEnd);
const eveningTime = canonicalTimeRange(eveStart, eveEnd);
try {
const duplicates = isWardNameTaken(name) ? [name] : [];
const dateOverlaps = findWardDateConflicts(wardStart, wardEnd, undefined);
if (duplicates.length > 0 || dateOverlaps.length > 0) {
const messages: string[] = [];
for (const d of duplicates) messages.push(`A ward named “${d}” already exists.`);
for (const o of dateOverlaps) messages.push(`Dates overlap with “${o.ward}” (${formatISODateDDMMYY(o.start)}–${formatISODateDDMMYY(o.end)}).`);
setFormError(null);
setConflictSheet({ messages, onConfirm: () => commitWard(name, wardStart, wardEnd, morningTime, eveningTime) });
return;
}
commitWard(name, wardStart, wardEnd, morningTime, eveningTime);
} catch {
showToast('Failed to check/save — please try again.', 'err');
}
};
/* ═══════════ DELETE / SLOT-REMOVE ═══════════ */
const requestDeleteSubject = (store: 'userAdded' | 'custom', id: string) => {
const item = store === 'userAdded' ? userAddedSubjects.find(x => x.id === id) : customSubjects.find(x => x.id === id);
if (!item) return;
const lines = [
`The “${item.name}” subject card`,
'All timetable slots referencing it',
'Calendar / schedule entries',
'All attendance records (attended, missed, finished)',
];
if (item.subjectType === 'allied-parent') lines.push('All allied children nested under this parent');
setDeleteSheet({
title: `Delete “${item.name}”?`,
lines,
onConfirm: () => {
try {
const namesToPurge = [item.name];
if (item.subjectType === 'allied-parent') {
const kids = store === 'userAdded'
? userAddedSubjects.filter(x => x.subjectType === 'allied' && getEffectiveParentName(x)?.toLowerCase() === item.name.toLowerCase())
: customSubjects.filter(x => x.subjectType === 'allied' && getEffectiveParentName(x)?.toLowerCase() === item.name.toLowerCase());
for (const k of kids) namesToPurge.push(k.name);
}
if (store === 'userAdded') removeUserAddedSubject(id);
else removeCustomSubject(id);
for (const n of namesToPurge) removeSubjectData(n);
setDeleteSheet(null);
showToast(`Deleted “${item.name}”.`);
} catch { showToast('Delete failed — please try again.', 'err'); }
},
});
};
const requestDeleteWard = (store: 'preset' | 'custom', ref: number | string) => {
if (store === 'preset') {
const idx = ref as number;
const e = presetWardSchedule[idx];
if (!e) return;
const occurrences = presetWardSchedule.filter(x => x.ward.toLowerCase() === e.ward.toLowerCase()).length;
setDeleteSheet({
title: `Delete rotation “${e.ward}”?`,
lines: ['This rotation period', 'Calendar / schedule entries', occurrences <= 1 ? 'All attendance records for this ward' : 'Attendance is kept (ward has other periods)'],
onConfirm: () => {
try {
removePresetWardEntry(idx);
if (occurrences <= 1) removeWardData(e.ward);
setDeleteSheet(null);
showToast(`Deleted “${e.ward}”.`);
} catch { showToast('Delete failed — please try again.', 'err'); }
},
});
} else {
const w = customWards.find(x => x.id === ref);
if (!w) return;
setDeleteSheet({
title: `Delete rotation “${w.name}”?`,
lines: ['This rotation card', 'Calendar / schedule entries', 'All attendance records for this ward'],
onConfirm: () => {
try {
removeCustomWard(w.id);
removeWardData(w.name);
setDeleteSheet(null);
showToast(`Deleted “${w.name}”.`);
} catch { showToast('Delete failed — please try again.', 'err'); }
},
});
}
};
/* Slot-remove: closes BOTH windows */
const confirmSlotRemove = () => {
if (!slotRemove) return;
try {
const slot = presetTimetable[slotRemove.day]?.[slotRemove.index];
if (slot) {
const remaining = slot.subjects.filter(s => s !== slotRemove.subject);
updatePresetTimetableSlot(slotRemove.day, slotRemove.index, slot.time, remaining, slotRemove.day);
}
showToast(`Removed “${slotRemove.subject}” from that slot.`);
} catch { showToast('Remove failed — please try again.', 'err'); }
setSlotRemove(null);
setEditSlot(null);
};
/* ═══════════ EDIT SHEETS ═══════════ */
const rowsFromRecord = (rec: { schedules?: Array<{ day: string; time?: string; start?: string; end?: string }>; days?: string; time?: string }): ScheduleRow[] => {
if (rec.schedules && rec.schedules.length) {
return rec.schedules.map(s => {
if (s.start && s.end) return { id: genId('row'), day: s.day, startTime: s.start, endTime: s.end };
const { start, end } = splitRange(s.time || '');
return { id: genId('row'), day: s.day, startTime: start, endTime: end };
});
}
const { start, end } = splitRange(rec.time || '');
const rows = parseDayList(rec.days || '').map(d => ({ id: genId('row'), day: d, startTime: start, endTime: end }));
return rows.length ? rows : [newRow([])];
};
const openEditSubject = (store: 'userAdded' | 'custom', id: string) => {
const item = store === 'userAdded' ? userAddedSubjects.find(x => x.id === id) : customSubjects.find(x => x.id === id);
if (!item) return;
setEditError(null);
setEditSubject({
store, id, originalName: item.name, name: item.name,
subjectType: item.subjectType, parentName: getEffectiveParentName(item) || '',
rows: rowsFromRecord(item), plannedClasses: item.plannedClasses ?? 0,
startDate: (item as any).startDate || '', endDate: (item as any).endDate || '',
});
};
const saveEditSubject = () => {
if (!editSubject) return;
if (editSubject.subjectType !== 'allied-parent') {
const rp = rowProblem(editSubject.rows);
if (rp) { setEditError(rp); return; }
}
try {
if (editSubject.subjectType === 'allied-parent') {
const patch = { name: editSubject.name };
if (editSubject.store === 'userAdded') updateUserAddedSubject(editSubject.id, patch);
else updateCustomSubject(editSubject.id, patch);
} else {
const rows = buildRowsFromForm(editSubject.rows);
const patch: Record<string, unknown> = {
name: editSubject.name, days: rows.map(r => r.day).join(', '), time: rows[0]?.time || '', plannedClasses: editSubject.plannedClasses,
};
if (editSubject.store === 'userAdded') patch.schedules = rows.map(r => ({ day: r.day, start: r.start, end: r.end }));
else patch.schedules = rows.map(r => ({ day: r.day, time: r.time }));
if (editSubject.subjectType === 'allied') { patch.parentName = editSubject.parentName; patch.category = editSubject.parentName; }
if (editSubject.subjectType === 'allied' && PRESET_PARENTS.includes(editSubject.parentName)) { patch.startDate = editSubject.startDate; patch.endDate = editSubject.endDate; }
if (editSubject.store === 'userAdded') updateUserAddedSubject(editSubject.id, patch);
else updateCustomSubject(editSubject.id, patch);
}
if (editSubject.name !== editSubject.originalName) renameSubjectData(editSubject.originalName, editSubject.name);
setEditError(null);
showToast('Changes saved.');
window.setTimeout(() => setEditSubject(null), 900);
} catch { showToast('Failed to save changes — please try again.', 'err'); }
};
const openEditWardPreset = (index: number) => {
const e = presetWardSchedule[index];
if (!e) return;
const m = splitRange(e.morningTime || '09:30 AM–11:30 AM');
const ev = splitRange(e.eveningTime || '07:00 PM–09:00 PM');
setEditError(null);
setEditWard({ store: 'preset', index, originalName: e.ward, name: e.ward, startDate: e.start, endDate: e.end, mornStart: m.start, mornEnd: m.end, eveStart: ev.start, eveEnd: ev.end });
};
const openEditWardCustom = (id: string) => {
const w = customWards.find(x => x.id === id);
if (!w) return;
const m = splitRange(w.morningTime || '09:30 AM–11:30 AM');
const ev = splitRange(w.eveningTime || '07:00 PM–09:00 PM');
setEditError(null);
setEditWard({ store: 'custom', id, originalName: w.name, name: w.name, startDate: w.startDate, endDate: w.endDate, mornStart: m.start, mornEnd: m.end, eveStart: ev.start, eveEnd: ev.end });
};
const saveEditWard = () => {
if (!editWard) return;
if (!editWard.name.trim()) { setEditError('Ward name cannot be empty.'); return; }
if (!editWard.startDate || !editWard.endDate) { setEditError('Pick start and end dates.'); return; }
if (editWard.endDate < editWard.startDate) { setEditError('End date must be after start date.'); return; }
try {
const morningTime = canonicalTimeRange(editWard.mornStart, editWard.mornEnd);
const eveningTime = canonicalTimeRange(editWard.eveStart, editWard.eveEnd);
if (editWard.store === 'preset') updatePresetWardEntry(editWard.index!, { ward: editWard.name.trim(), start: editWard.startDate, end: editWard.endDate, morningTime, eveningTime });
else updateCustomWard(editWard.id!, { name: editWard.name.trim(), startDate: editWard.startDate, endDate: editWard.endDate, morningTime, eveningTime });
if (editWard.name.trim() !== editWard.originalName) renameWardData(editWard.originalName, editWard.name.trim());
setEditError(null);
showToast('Rotation updated.');
window.setTimeout(() => setEditWard(null), 900);
} catch { showToast('Failed to save rotation — please try again.', 'err'); }
};
const openEditSlot = (day: number, index: number) => {
const slot = presetTimetable[day]?.[index];
if (!slot) return;
const { start, end } = splitRange(slot.time);
setEditError(null);
setEditSlot({ day, index, startTime: start, endTime: end, targetDay: day, subjects: slot.subjects.map(s => ({ name: s, planned: getSubjectPlannedTotal(s) })) });
};
const saveEditSlot = () => {
if (!editSlot) return;
try {
const time = canonicalTimeRange(editSlot.startTime, editSlot.endTime);
const names = editSlot.subjects.map(s => s.name);
const targetSlots = presetTimetable[editSlot.targetDay] || [];
const existingIdx = targetSlots.findIndex((sl, i) =>
sl.type !== 'ward' && sl.type !== 'ward_replacement' &&
canonicalizeTimeRange(sl.time) === time &&
!(editSlot.targetDay === editSlot.day && i === editSlot.index)
);
if (existingIdx >= 0) {
const merged = Array.from(new Set([...(targetSlots[existingIdx].subjects || []), ...names]));
updatePresetTimetableSlot(editSlot.targetDay, existingIdx, time, merged, editSlot.targetDay);
updatePresetTimetableSlot(editSlot.day, editSlot.index, time, [], editSlot.day);
} else {
updatePresetTimetableSlot(editSlot.day, editSlot.index, time, names, editSlot.targetDay);
}
editSlot.subjects.forEach(s => {
const ua = userAddedSubjects.find(u => u.name === s.name);
if (ua) updateUserAddedSubject(ua.id, { plannedClasses: s.planned });
else updatePresetSubjectTotal(s.name, s.planned);
});
setEditError(null);
showToast('Slot updated.');
window.setTimeout(() => setEditSlot(null), 900);
} catch { showToast('Failed to update slot — please try again.', 'err'); }
};
/* ═══════════ IMPORT / EXPORT ═══════════ */
const bundleSchedulesFor = (s: any): Array<{ day: string; start: string; end: string }> => {
const rows = Array.isArray(s.schedules) && s.schedules.length
? s.schedules
: parseDayList(s.days || '').map((d: string) => ({ day: d, time: s.time }));
return rows.map((r: any) => {
const range = r.time ? canonicalizeTimeRange(r.time) : canonicalTimeRange(r.start || '', r.end || '');
const m = parseRangeToMinutes(range);
return { day: r.day, start: m ? to24(m.start) : '09:00', end: m ? to24(m.end) : '10:00' };
});
};
const buildBundle = (): ImportBundle => {
const added = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
return {
version: BUNDLE_VERSION,
subjectMode,
addedSubjects: added.map(s => ({
name: s.name, type: s.subjectType, parentCategory: getEffectiveParentName(s) ?? null,
planned: s.plannedClasses, schedules: bundleSchedulesFor(s),
})),
customWards: customWards.map(w => ({ name: w.name, startDate: w.startDate, endDate: w.endDate, morningTime: w.morningTime, eveningTime: w.eveningTime })),
presetTimetable, presetWardSchedule, presetSubjectTotals,
};
};
const bundleJson = () => JSON.stringify(buildBundle(), null, 2);
const doDownload = () => {
try {
const blob = new Blob([bundleJson()], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `attendenz-routine-${formatISODateDDMMYY().replace(/\//g, '-')}.json`;
document.body.appendChild(a);
a.click();
a.remove();
URL.revokeObjectURL(url);
showToast('Routine bundle downloaded.');
} catch { showToast('Download failed — please try again.', 'err'); }
};
const doCopy = async () => {
try {
await navigator.clipboard.writeText(bundleJson());
showToast('Bundle copied to clipboard.');
} catch { showToast('Copy failed — use Download instead.', 'err'); }
};
const doShare = async () => {
const json = bundleJson();
try {
const blob = new Blob([json], { type: 'application/json' });
const file = new File([blob], 'attendenz-routine.json', { type: 'application/json' });
if (navigator.canShare && navigator.canShare({ files: [file] })) {
await navigator.share({ files: [file], title: 'Attendenz Routine', text: 'Routine bundle (no attendance data).' });
showToast('Share sheet opened.');
return;
}
throw new Error('no-share');
} catch {
try {
await navigator.clipboard.writeText(json);
showToast('Share unavailable — bundle copied instead.', 'info');
} catch { showToast('Share failed — use Download.', 'err'); }
}
};
const validateBundle = (obj: any): { ok: boolean; error?: string; bundle?: ImportBundle } => {
if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'Not a JSON object.' };
const b = obj as ImportBundle;
if (b.subjectMode !== 'preloaded' && b.subjectMode !== 'custom') return { ok: false, error: 'Missing/invalid "subjectMode".' };
if (!Array.isArray(b.addedSubjects) && !Array.isArray(b.customWards) && !b.presetTimetable && !b.presetWardSchedule) {
return { ok: false, error: 'Bundle has no routine data.' };
}
if (b.addedSubjects && !Array.isArray(b.addedSubjects)) return { ok: false, error: '"addedSubjects" must be an array.' };
for (const s of b.addedSubjects || []) {
if (!s || typeof s.name !== 'string' || !s.name.trim()) return { ok: false, error: 'Every added subject needs a "name".' };
for (const sch of s.schedules || []) {
if (!/^\d{1,2}:\d{2}$/.test(sch.start || '') || !/^\d{1,2}:\d{2}$/.test(sch.end || '')) return { ok: false, error: `Subject “${s.name}”: schedules need 24h HH:MM start/end.` };
}
}
if (b.customWards && !Array.isArray(b.customWards)) return { ok: false, error: '"customWards" must be an array.' };
return { ok: true, bundle: b };
};
const buildReport = (b: ImportBundle): ImportReport => {
const subjectsSkip: string[] = [];
let subjectsAdd = 0;
for (const s of b.addedSubjects || []) {
if (isSubjectNameTaken(s.name)) { subjectsSkip.push(`${s.name} (duplicate name)`); continue; }
const rows = (s.schedules || []).map(sch => {
const st = to12h(sch.start || '09:00'), en = to12h(sch.end || '10:00');
return { day: sch.day, time: canonicalTimeRange(st, en) };
});
const overlaps = rows.some(r => findSubjectTimeConflicts([r.day], r.time, undefined).some(c => !c.exact));
if (overlaps) { subjectsSkip.push(`${s.name} (time overlap)`); continue; }
subjectsAdd++;
}
const wardsSkip: string[] = [];
let wardsAdd = 0;
for (const w of b.customWards || []) {
if (isWardNameTaken(w.name)) { wardsSkip.push(`${w.name} (duplicate name)`); continue; }
if (findWardDateConflicts(w.startDate, w.endDate, undefined).length) { wardsSkip.push(`${w.name} (date overlap)`); continue; }
wardsAdd++;
}
const slots = Object.values(b.presetTimetable || {}).reduce((acc: number, day: any) => acc + (Array.isArray(day) ? day.length : 0), 0);
return { subjectsAdd, subjectsSkip, wardsAdd, wardsSkip, slots, rotations: (b.presetWardSchedule || []).length };
};
/* Validate ALWAYS answers; errors stay in the modal they came from */
const beginImport = (raw: string, source: 'file' | 'paste') => {
let parsed: any;
try { parsed = JSON.parse(raw); } catch {
const msg = 'Invalid JSON — check the file or pasted text.';
if (source === 'paste') setPasteError(msg); else setImportError(msg);
return;
}
const v = validateBundle(parsed);
if (!v.ok || !v.bundle) {
const msg = v.error || 'Invalid bundle.';
if (source === 'paste') setPasteError(msg); else setImportError(msg);
return;
}
setPasteError(null); setImportError(null);
setPasteOpen(false); setImportOpen(false);
setPreview({ bundle: v.bundle, report: buildReport(v.bundle) });
showToast('Bundle valid — review the preview.', 'info');
};
const canonicalTimetable = (tt: any) => {
const out: Record<string, any[]> = {};
for (const [day, slots] of Object.entries(tt || {})) {
out[day] = (Array.isArray(slots) ? slots : []).map((s: any) => ({ ...s, time: canonicalizeTimeRange(s.time || '') }));
}
return out;
};
const applyMerge = () => {
if (!preview) return;
try {
const b = preview.bundle;
const items: CommitItem[] = [];
for (const s of b.addedSubjects || []) {
if (isSubjectNameTaken(s.name)) continue;
const rows = (s.schedules || []).map(sch => {
const st = to12h(sch.start || '09:00'), en = to12h(sch.end || '10:00');
return { day: sch.day, time: canonicalTimeRange(st, en), start: st, end: en };
});
if (!rows.length) rows.push({ day: 'Mon', time: canonicalTimeRange('09:00 AM', '10:00 AM'), start: '09:00 AM', end: '10:00 AM' });
const overlaps = rows.some(r => findSubjectTimeConflicts([r.day], r.time, undefined).some(c => !c.exact));
if (overlaps) continue;
items.push({ name: s.name, subjectType: (s.type as any) || 'single', parentName: s.parentCategory || undefined, plannedClasses: s.planned ?? 0, rows });
}
let wardsAdded = 0;
for (const w of b.customWards || []) {
if (isWardNameTaken(w.name)) continue;
if (findWardDateConflicts(w.startDate, w.endDate, undefined).length) continue;
const mt = canonicalizeTimeRange(w.morningTime || '09:30 AM–11:30 AM');
const et = canonicalizeTimeRange(w.eveningTime || '07:00 PM–09:00 PM');
if (subjectMode === 'preloaded') addPresetWardEntry({ start: w.startDate, end: w.endDate, ward: w.name, morningTime: mt, eveningTime: et, addedByUser: true });
else addCustomWard({ name: w.name, startDate: w.startDate, endDate: w.endDate, morningTime: mt, eveningTime: et });
wardsAdded++;
}
let rotationsAdded = 0;
for (const e of b.presetWardSchedule || []) {
if (!e || e.addedByUser !== true) continue;
const dup = presetWardSchedule.some(x => x.ward.toLowerCase() === String(e.ward).toLowerCase() && x.start === e.start && x.end === e.end);
if (dup) continue;
if (findWardDateConflicts(e.start, e.end, undefined).length) continue;
const mt = canonicalizeTimeRange(e.morningTime || '09:30 AM–11:30 AM');
const et = canonicalizeTimeRange(e.eveningTime || '07:00 PM–09:00 PM');
if (subjectMode === 'preloaded') addPresetWardEntry({ start: e.start, end: e.end, ward: e.ward, morningTime: mt, eveningTime: et, addedByUser: true });
else addCustomWard({ name: e.ward, startDate: e.start, endDate: e.end, morningTime: mt, eveningTime: et });
rotationsAdded++;
}
if (items.length) commitSubjects(items);
setPreview(null);
const total = items.length + wardsAdded + rotationsAdded;
if (total === 0) showToast('Nothing new to merge (duplicates or preset-only data). Use Replace to adopt the bundle.', 'info');
else showToast(`Merged ${items.length} subject(s), ${wardsAdded + rotationsAdded} rotation(s).`);
} catch { showToast('Merge failed — please try again.', 'err'); }
};
/* Replace hardened — storageSetItem from lib/idb (top-level import) */
const applyReplace = () => {
if (!preview) return;
const b = preview.bundle;
import('@/utils/snapshotUtils')
.then(({ snapshotBeforeEdit }) => {
snapshotBeforeEdit('Replace Routine Import');
const toSubjectRecord = (s: any) => {
const schedules = (s.schedules || []).map((sch: any) => ({ day: sch.day, start: to12h(sch.start || '09:00'), end: to12h(sch.end || '10:00') }));
return {
id: genId(b.subjectMode === 'preloaded' ? 'ua' : 'cs'),
name: s.name, subjectType: s.type || 'single',
parentName: s.parentCategory || undefined, category: s.parentCategory || undefined,
plannedClasses: s.planned ?? 0,
days: schedules.map((x: any) => x.day).join(', '),
time: schedules.length ? canonicalTimeRange(schedules[0].start, schedules[0].end) : '',
schedules: b.subjectMode === 'preloaded' ? schedules : schedules.map((x: any) => ({ day: x.day, time: canonicalTimeRange(x.start, x.end) })),
};
};
const records = (b.addedSubjects || []).map(toSubjectRecord);
if (b.presetTimetable) {
const tt = canonicalTimetable(b.presetTimetable);
localStorage.setItem('att_preset_timetable', JSON.stringify(tt));
storageSetItem('att_preset_timetable', JSON.stringify(tt));
}
if (b.presetWardSchedule) {
const ws = (b.presetWardSchedule || []).map((e: any) => ({ ...e, morningTime: canonicalizeTimeRange(e.morningTime || '09:30 AM–11:30 AM'), eveningTime: canonicalizeTimeRange(e.eveningTime || '07:00 PM–09:00 PM') }));
localStorage.setItem('att_preset_ward_schedule', JSON.stringify(ws));
storageSetItem('att_preset_ward_schedule', JSON.stringify(ws));
}
if (b.presetSubjectTotals) {
localStorage.setItem('att_preset_subject_totals', JSON.stringify(b.presetSubjectTotals));
storageSetItem('att_preset_subject_totals', JSON.stringify(b.presetSubjectTotals));
}
if (b.subjectMode === 'custom') {
localStorage.setItem('att_custom_subjects', JSON.stringify(records));
storageSetItem('att_custom_subjects', JSON.stringify(records));
const cw = (b.customWards || []).map((w: any, i: number) => ({ ...w, id: `cw_imp_${Date.now()}_${i}`, morningTime: canonicalizeTimeRange(w.morningTime || '09:30 AM–11:30 AM'), eveningTime: canonicalizeTimeRange(w.eveningTime || '07:00 PM–09:00 PM') }));
localStorage.setItem('att_custom_wards', JSON.stringify(cw));
storageSetItem('att_custom_wards', JSON.stringify(cw));
} else {
localStorage.setItem('att_user_added_subjects', JSON.stringify(records));
storageSetItem('att_user_added_subjects', JSON.stringify(records));
}
localStorage.setItem('att_subject_mode', b.subjectMode || 'preloaded');
storageSetItem('att_subject_mode', b.subjectMode || 'preloaded');
setPreview(null);
showToast('Routine replaced — reloading…');
setTimeout(() => window.location.reload(), 900);
})
.catch(() => showToast('Replace failed — could not load storage utils.', 'err'));
};
const copyAiPrompt = async () => {
try {
await navigator.clipboard.writeText(AI_PROMPT_SCHEMA);
showToast('AI prompt copied.');
} catch { showToast('Copy failed.', 'err'); }
};
/* ── Reusable schedule-row list (fits one line, no side-swipe) ── */
const renderRowList = (
rows: ScheduleRow[],
onUpdate: (id: string, patch: Partial<ScheduleRow>) => void,
onRemove: (id: string) => void
) => (
<div className="space-y-2">
{rows.map(r => (
<div key={r.id} className="flex items-center gap-1.5">
<select
value={r.day}
onChange={e => onUpdate(r.id, { day: e.target.value })}
className={cn(inputCls, 'w-16 shrink-0 h-9 text-xs px-1.5')}
>
{DAY_ABBRS.map(d => (
<option key={d} value={d} disabled={d !== r.day && rows.some(o => o.id !== r.id && o.day === d)}>
{d}
</option>
))}
</select>
<TimeField value={r.startTime} onChange={v => onUpdate(r.id, { startTime: v })} ariaLabel="start" />
<TimeField value={r.endTime} onChange={v => onUpdate(r.id, { endTime: v })} ariaLabel="end" />
<button type="button" onClick={() => onRemove(r.id)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer shrink-0">
<X className="w-4 h-4" />
</button>
</div>
))}
</div>
);
return (
<Layout>
<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pb-24">
<div>
<h1 className="text-lg font-extrabold text-foreground leading-tight">Manage Subjects & Rotations</h1>
</div>
{/* 2×2 action buttons */}
<div className="grid grid-cols-2 gap-2">
<button type="button" onClick={() => setExportOpen(true)} className="h-10 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-500/20 transition-all cursor-pointer">
<Upload className="w-3.5 h-3.5" /> Export
</button>
<button type="button" onClick={() => { setImportError(null); setImportOpen(true); }} className="h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/20 transition-all cursor-pointer">
<Download className="w-3.5 h-3.5" /> Import
</button>
<button type="button" onClick={() => { setFormError(null); setMoreOpen(true); }} className="h-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-amber-500/20 transition-all cursor-pointer">
<Plus className="w-3.5 h-3.5" /> More
</button>
<button type="button" onClick={openOpd} className="h-10 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-violet-500/20 transition-all cursor-pointer">
<Stethoscope className="w-3.5 h-3.5" /> Subject Triage
</button>
</div>
{/* Section card */}
<section className="bg-card border border-border rounded-2xl p-3.5 shadow-sm space-y-3.5">
<div className="h-10 rounded-lg p-1 bg-muted/30 flex gap-1">
<button type="button" onClick={() => setSection('academic')}
className={cn('flex-1 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer',
section === 'academic' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/40')}>
<GraduationCap className="w-3.5 h-3.5" /> Academic Section
</button>
<button type="button" onClick={() => setSection('clinical')}
className={cn('flex-1 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer',
section === 'clinical' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/40')}>
<Stethoscope className="w-3.5 h-3.5" /> Clinical Section
</button>
</div>
{section === 'academic' && (
<div className="space-y-3">
<div className="bg-background/60 border border-border/50 rounded-xl p-1 flex justify-between gap-1">
{DAY_ABBRS.map((d, i) => (
<button key={d} type="button" onClick={() => setSelDay(i)}
className={cn('flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border',
selDay === i ? 'text-primary border-primary/60 bg-primary/10' : 'text-muted-foreground border-transparent bg-background/40 hover:bg-muted/30')}>
{d}
</button>
))}
</div>
<div className="flex items-center justify-between border-b border-border/40 pb-2">
<h3 className="text-sm font-extrabold uppercase tracking-wide text-primary">{DAY_ABBRS[selDay]}'s Academic Schedule</h3>
<span className="text-xs text-muted-foreground font-semibold">{subjectMode === 'preloaded' ? daySlots.length : customDayEntries.length} Slots</span>
</div>
{subjectMode === 'preloaded' && daySlots.map(({ slot, idx }) => (
<div key={`${selDay}-${idx}`} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
<div className="min-w-0 flex-1">
<p className="font-mono font-bold text-primary text-xs">{canonicalizeTimeRange(slot.time)}</p>
<p className="font-extrabold text-foreground text-sm leading-tight truncate mt-0.5" style={{ color: getSubjectColor(slot.subjects[0] || '') }}>
{slot.subjects.join(', ')}
</p>
<p className="text-[11px] text-muted-foreground truncate mt-0.5">
{slot.subjects.map(s => `${s}: ${getSubjectPlannedTotal(s)} planned`).join(' · ')}
</p>
{slot.subjects.some(s => isUserAddedName(s)) && <div className="mt-1"><AddedBadge /></div>}
</div>
<button type="button" onClick={() => openEditSlot(selDay, idx)} className="shrink-0 px-3 py-2 rounded-xl border border-primary/40 text-primary font-bold text-xs flex items-center gap-1.5 hover:bg-primary/10 transition-all cursor-pointer">
<Pencil className="w-3.5 h-3.5" /> Edit
</button>
</div>
))}
{subjectMode === 'preloaded' && daySlots.length === 0 && (
<p className="text-xs text-muted-foreground text-center py-5">No academic slots on {DAY_ABBRS[selDay]}.</p>
)}
{subjectMode === 'custom' && customDayEntries.map(e => (
<div key={e.id} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
<div className="min-w-0 flex-1">
<p className="font-mono font-bold text-primary text-xs">{canonicalizeTimeRange(e.time)}</p>
<p className="font-extrabold text-foreground text-sm leading-tight truncate mt-0.5" style={{ color: getSubjectColor(e.name) }}>{e.name}</p>
<p className="text-[11px] text-muted-foreground mt-0.5">{e.name}: {e.planned} planned{e.parentName ? ` · under ${e.parentName}` : ''}</p>
</div>
<button type="button" onClick={() => openEditSubject('custom', e.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Pencil className="w-4 h-4" /></button>
<button type="button" onClick={() => requestDeleteSubject('custom', e.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
</div>
))}
{subjectMode === 'custom' && customDayEntries.length === 0 && (
<p className="text-xs text-muted-foreground text-center py-5">Nothing scheduled on {DAY_ABBRS[selDay]}.</p>
)}
</div>
)}
{section === 'clinical' && (
<div className="space-y-2.5">
{clinicalEntries.map((e, i) => (
<div key={`${e.ward}-${e.start}-${i}`} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
<div className="min-w-0 flex-1">
<div className="flex items-center gap-2 flex-wrap">
<p className="font-extrabold text-foreground text-sm truncate" style={{ color: getSubjectColor(e.ward) }}>{e.ward}</p>
{e.addedByUser && <AddedBadge />}
</div>
<p className="text-[11px] text-muted-foreground mt-0.5">
{formatISODateDDMMYY(e.start)} – {formatISODateDDMMYY(e.end)} · {canonicalizeTimeRange(e.morningTime || '09:30 AM–11:30 AM')} / {canonicalizeTimeRange(e.eveningTime || '07:00 PM–09:00 PM')}
</p>
</div>
<button type="button" onClick={() => (e.store === 'preset' ? openEditWardPreset(e.index!) : openEditWardCustom(e.id!))} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Pencil className="w-4 h-4" /></button>
<button type="button" onClick={() => requestDeleteWard(e.store, e.store === 'preset' ? e.index! : e.id!)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
</div>
))}
{subjectMode === 'preloaded' && userAddedSubjects.some(u => u.subjectType === 'allied' && u.parentName && PRESET_PARENTS.includes(u.parentName)) && (
<div className="space-y-2.5 pt-1">
<p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Small Group Teaching</p>
{userAddedSubjects.filter(u => u.subjectType === 'allied' && u.parentName && PRESET_PARENTS.includes(u.parentName)).map(u => (
<div key={u.id} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
<div className="min-w-0 flex-1">
<p className="font-extrabold text-foreground text-sm truncate" style={{ color: getSubjectColor(u.name) }}>{u.name}</p>
<p className="text-[11px] text-muted-foreground mt-0.5">
{(u as any).startDate && (u as any).endDate ? `${formatISODateDDMMYY((u as any).startDate)} – ${formatISODateDDMMYY((u as any).endDate)} · ` : ''}
{(u.schedules || []).map((s: any) => `${s.day} ${s.start}–${s.end}`).join(' · ')}
</p>
</div>
<button type="button" onClick={() => openEditSubject('userAdded', u.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Pencil className="w-4 h-4" /></button>
<button type="button" onClick={() => requestDeleteSubject('userAdded', u.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
</div>
))}
</div>
)}
{clinicalEntries.length === 0 && <p className="text-xs text-muted-foreground text-center py-5">No rotations yet.</p>}
</div>
)}
</section>
{/* +More modal */}
<OverlayModal open={moreOpen} onClose={() => { setMoreOpen(false); setFormError(null); }} maxW="max-w-lg">
<div className="p-4 sm:p-5 space-y-3.5">
<div className="flex items-center justify-between">
<h3 className="text-sm font-bold text-foreground">{section === 'academic' ? 'Add Subject' : 'Add Rotation (Ward)'}</h3>
<button type="button" onClick={() => { setMoreOpen(false); setFormError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
</div>
<Note note={note} />
{formError && <p className={inlineErrCls}>{formError}</p>}
{section === 'academic' ? (
<>
<div className="flex rounded-xl border border-border overflow-hidden">
{(['single', 'allied'] as const).map(t => (
<button key={t} type="button" onClick={() => setSubjectType(t)}
className={cn('flex-1 px-3 py-2 text-xs font-bold capitalize transition-all cursor-pointer',
subjectType === t ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
{t}
</button>
))}
</div>
{isAllied && (
<div>
<label className={labelCls}>Parent</label>
<select value={parentChoice} onChange={e => setParentChoice(e.target.value)} className={inputCls}>
<option value="">Select parent…</option>
<optgroup label="Parents">
{groupedParents.parents.map(p => <option key={p} value={p}>{p}</option>)}
</optgroup>
<optgroup label="Subjects (becomes parent)">
{groupedParents.singles.map(p => <option key={p} value={p}>{p}</option>)}
</optgroup>
<option value={CREATE_NEW}>+ Add new parent…</option>
</select>
{parentChoice === CREATE_NEW && (
<input value={newParentName} onChange={e => setNewParentName(e.target.value)} placeholder="New parent name" inputMode="text" className={cn(inputCls, 'mt-2')} />
)}
{resolvedParent && (
<p className="text-[10px] text-muted-foreground mt-1">
{parentIsNew ? 'New parent — needs at least 2 children.' : `Existing parent — ${getAlliedChildCount(resolvedParent)} child(ren) saved already.`}
</p>
)}
</div>
)}
<div>
<label className={labelCls}>{isAllied ? 'Child subject name' : 'Subject name'}</label>
<input value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="e.g. Cardiology" inputMode="text" className={inputCls} />
</div>
<div>
<label className={labelCls}>Day & Time (per-day times allowed)</label>
{renderRowList(subjectRows, updateSubjectRow, removeSubjectRow)}
<button type="button" onClick={addSubjectRow} disabled={subjectRows.length >= 7} className={cn(btnGhost, 'w-full mt-2 flex items-center justify-center gap-1.5')}>
<Plus className="w-3.5 h-3.5" /> Add another day & time
</button>
</div>
<div>
<label className={labelCls}>Planned classes</label>
<input type="number" inputMode="numeric" min={0} value={planned} onChange={e => setPlanned(e.target.value)} placeholder="e.g. 40" className={inputCls} />
</div>
{isAllied && parentIsSGT && (
<div className="grid grid-cols-2 gap-2.5">
<div><label className={labelCls}>Placement start</label><input type="date" value={childStart} onChange={e => setChildStart(e.target.value)} className={inputCls} /></div>
<div><label className={labelCls}>Placement end</label><input type="date" value={childEnd} onChange={e => setChildEnd(e.target.value)} className={inputCls} /></div>
</div>
)}
{isAllied ? (
<div className="space-y-2.5">
{stagedChildren.length > 0 && (
<div className="space-y-1.5">
{stagedChildren.map((c, i) => (
<div key={`${c.name}-${i}`} className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-xl px-3 py-2">
<div className="min-w-0">
<p className="text-xs font-bold text-foreground truncate">{c.name}</p>
<p className="text-[10px] text-muted-foreground">
{c.rows.map(r => `${r.day} ${canonicalTimeRange(r.startTime, r.endTime)}`).join(' · ')} · {c.plannedClasses} planned
</p>
</div>
<button type="button" onClick={() => setStagedChildren(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive cursor-pointer p-1"><X className="w-4 h-4" /></button>
</div>
))}
</div>
)}
{conflictSheet ? (
<div className="space-y-2">
<div className="flex items-center gap-2 text-amber-500">
<AlertTriangle className="w-4 h-4 shrink-0" />
<p className="text-xs font-bold">Heads up — review before adding:</p>
</div>
{conflictSheet.messages.map((m, i) => (
<p key={i} className="text-[11px] text-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{m}</p>
))}
<div className="flex gap-2">
<button type="button" onClick={() => setConflictSheet(null)} className={cn(btnGhost, 'flex-1')}>Change details</button>
<button type="button" onClick={() => { const fn = conflictSheet.onConfirm; setConflictSheet(null); fn(); }} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Add anyway</button>
</div>
</div>
) : (
<div className="flex gap-2">
<button type="button" onClick={addStagedChild} className={cn(btnGhost, 'flex-1 flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add child</button>
<button type="button" onClick={saveSubject} className={cn(btnPrimary, 'flex-1')}>Save</button>
</div>
)}
</div>
) : (
conflictSheet ? (
<div className="space-y-2">
<div className="flex items-center gap-2 text-amber-500">
<AlertTriangle className="w-4 h-4 shrink-0" />
<p className="text-xs font-bold">Heads up — review before adding:</p>
</div>
{conflictSheet.messages.map((m, i) => (
<p key={i} className="text-[11px] text-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{m}</p>
))}
<div className="flex gap-2">
<button type="button" onClick={() => setConflictSheet(null)} className={cn(btnGhost, 'flex-1')}>Change details</button>
<button type="button" onClick={() => { const fn = conflictSheet.onConfirm; setConflictSheet(null); fn(); }} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Add anyway</button>
</div>
</div>
) : (
<button type="button" onClick={saveSubject} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add Subject</button>
)
)}
</>
) : (
<>
<div>
<label className={labelCls}>Ward name</label>
<input value={wardName} onChange={e => setWardName(e.target.value)} placeholder="e.g. Internal Medicine" inputMode="text" className={inputCls} />
</div>
<div className="grid grid-cols-2 gap-2.5">
<div><label className={labelCls}>Start date</label><input type="date" value={wardStart} onChange={e => setWardStart(e.target.value)} className={inputCls} /></div>
<div><label className={labelCls}>End date</label><input type="date" value={wardEnd} onChange={e => setWardEnd(e.target.value)} className={inputCls} /></div>
</div>
<div className="grid grid-cols-2 gap-2.5">
<div className="space-y-1.5"><label className={labelCls}>Morning</label><TimeField value={mornStart} onChange={setMornStart} ariaLabel="morning start" /><TimeField value={mornEnd} onChange={setMornEnd} ariaLabel="morning end" /></div>
<div className="space-y-1.5"><label className={labelCls}>Evening</label><TimeField value={eveStart} onChange={setEveStart} ariaLabel="evening start" /><TimeField value={eveEnd} onChange={setEveEnd} ariaLabel="evening end" /></div>
</div>
{conflictSheet ? (
<div className="space-y-2">
<div className="flex items-center gap-2 text-amber-500">
<AlertTriangle className="w-4 h-4 shrink-0" />
<p className="text-xs font-bold">Heads up — review before adding:</p>
</div>
{conflictSheet.messages.map((m, i) => (
<p key={i} className="text-[11px] text-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{m}</p>
))}
<div className="flex gap-2">
<button type="button" onClick={() => setConflictSheet(null)} className={cn(btnGhost, 'flex-1')}>Change details</button>
<button type="button" onClick={() => { const fn = conflictSheet.onConfirm; setConflictSheet(null); fn(); }} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Add anyway</button>
</div>
</div>
) : (
<button type="button" onClick={saveWard} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add Rotation</button>
)}
</>
)}
</div>
</OverlayModal>
{/* Subject Triage modal */}
<OverlayModal open={opdOpen} onClose={() => setOpdOpen(false)} maxW="max-w-lg">
<div className="p-4 sm:p-5 space-y-3">
<div className="flex items-center justify-between">
<div>
<h3 className="text-sm font-bold text-foreground">Subject Triage</h3>
<p className="text-[10px] text-muted-foreground mt-0.5">Move subjects between Single and parents.</p>
</div>
<button type="button" onClick={() => setOpdOpen(false)} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
</div>
<Note note={note} />
{movableSubjects.length === 0 ? (
<p className="text-xs text-muted-foreground text-center py-6">No movable subjects yet — add subjects first.</p>
) : (
<div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
{movableSubjects.map(s => {
const cur = opdCurrent(s);
const val = opdChoice[s.id] ?? cur;
return (
<div key={s.id} className="flex items-center gap-2 bg-muted/30 border border-border/50 rounded-xl px-3 py-2">
<span className="text-xs font-bold flex-1 truncate" style={{ color: getSubjectColor(s.name) }}>{s.name}</span>
<button type="button" onClick={() => { setOpdOpen(false); requestDeleteSubject(subjectMode === 'preloaded' ? 'userAdded' : 'custom', s.id); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer shrink-0" title="Delete completely">
<Trash2 className="w-3.5 h-3.5" />
</button>
<select
value={val}
onChange={e => setOpdChoice(prev => ({ ...prev, [s.id]: e.target.value }))}
className="w-40 shrink-0 h-9 bg-background border border-border rounded-lg px-1.5 text-[10px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
>
<option value={SINGLE_DEST}>Single (standalone)</option>
{parentOptions.map(p => <option key={p} value={p}>{p}</option>)}
</select>
</div>
);
})}
</div>
)}
<div className="flex gap-2 justify-end">
<button type="button" onClick={() => setOpdOpen(false)} className={btnGhost}>Cancel</button>
<button type="button" onClick={saveOpd} className={btnPrimary}>Save changes</button>
</div>
</div>
</OverlayModal>
{/* Export sheet */}
<OverlayModal open={exportOpen} onClose={() => setExportOpen(false)}>
<div className="p-4 sm:p-5 space-y-2.5">
<h3 className="text-sm font-bold text-foreground">Export Routine</h3>
<Note note={note} />
<p className="text-[10px] text-muted-foreground">Bundle contains routine data only — never attendance.</p>
<button type="button" onClick={doShare} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-2')}><Share2 className="w-4 h-4" /> Share…</button>
<button type="button" onClick={doDownload} className={cn(btnGhost, 'w-full flex items-center justify-center gap-2')}><Download className="w-4 h-4" /> Download .json</button>
<button type="button" onClick={doCopy} className={cn(btnGhost, 'w-full flex items-center justify-center gap-2')}><Copy className="w-4 h-4" /> Copy to Clipboard</button>
</div>
</OverlayModal>
{/* Import sheet */}
<OverlayModal open={importOpen} onClose={() => { setImportOpen(false); setImportError(null); }}>
<div className="p-4 sm:p-5 space-y-2.5">
<h3 className="text-sm font-bold text-foreground">Import Routine</h3>
<Note note={note} />
{importError && <p className={inlineErrCls}>{importError}</p>}
<button type="button" onClick={() => importFileRef.current?.click()} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-2')}><Download className="w-4 h-4" /> Choose .json File</button>
<input ref={importFileRef} type="file" accept=".json,application/json" className="hidden"
onChange={e => {
const f = e.target.files?.[0];
if (!f) return;
const reader = new FileReader();
reader.onload = ev => beginImport(String(ev.target?.result || ''), 'file');
reader.readAsText(f);
e.target.value = '';
}} />
<button type="button" onClick={() => { setPasteError(null); setPasteOpen(true); }} className={cn(btnGhost, 'w-full flex items-center justify-center gap-2')}><Copy className="w-4 h-4" /> Paste JSON…</button>
<button type="button" onClick={copyAiPrompt} className={cn(btnGhost, 'w-full flex items-center justify-center gap-2')}><FileText className="w-4 h-4" /> Copy prompt for AI</button>
</div>
</OverlayModal>
{/* Paste modal */}
<OverlayModal open={pasteOpen} onClose={() => { setPasteOpen(false); setPasteText(''); setPasteError(null); }} maxW="max-w-lg">
<div className="p-4 sm:p-5 space-y-2.5">
<h3 className="text-sm font-bold text-foreground">Paste Bundle JSON</h3>
{pasteError && <p className={inlineErrCls}>{pasteError}</p>}
<textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8} className={cn(inputCls, 'h-auto font-mono text-[10px] py-2')} placeholder='{"version":2,"subjectMode":…}' />
<div className="flex gap-2">
<button type="button" onClick={() => { setPasteOpen(false); setPasteText(''); setPasteError(null); }} className={cn(btnGhost, 'flex-1')}>Cancel</button>
<button type="button" onClick={() => beginImport(pasteText, 'paste')} className={cn(btnPrimary, 'flex-1')}>Validate & Preview</button>
</div>
</div>
</OverlayModal>
{/* Import preview */}
<OverlayModal open={!!preview} onClose={() => setPreview(null)} maxW="max-w-lg">
{preview && (
<div className="p-4 sm:p-5 space-y-3">
<h3 className="text-sm font-bold text-foreground">Import Preview</h3>
<Note note={note} />
<div className="bg-muted/30 border border-border/50 rounded-xl p-3 text-xs text-foreground space-y-1">
<p>Mode: <strong>{preview.bundle.subjectMode}</strong> · Subjects to add: <strong>{preview.report.subjectsAdd}</strong> · Rotations to add: <strong>{preview.report.wardsAdd}</strong></p>
<p>Preset slots in bundle: <strong>{preview.report.slots}</strong> · Preset rotations: <strong>{preview.report.rotations}</strong></p>
</div>
{(preview.report.subjectsSkip.length > 0 || preview.report.wardsSkip.length > 0) && (
<div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1">
<p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Skipped (duplicates / overlaps)</p>
{[...preview.report.subjectsSkip, ...preview.report.wardsSkip].map((s, i) => (
<p key={i} className="text-[11px] text-foreground">• {s}</p>
))}
</div>
)}
<div className="flex gap-2">
<button type="button" onClick={applyMerge} className={cn(btnPrimary, 'flex-1')}>Merge</button>
<button type="button" onClick={() => setDeleteSheet({
title: 'Replace current routine?',
lines: ['Wipes current preset overrides / routine stores', 'Replaces with the imported bundle', 'Attendance records are NOT touched'],
onConfirm: () => { setDeleteSheet(null); applyReplace(); },
})} className="flex-1 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Replace</button>
</div>
</div>
)}
</OverlayModal>
{/* Delete sheet */}
<OverlayModal open={!!deleteSheet} onClose={() => setDeleteSheet(null)}>
{deleteSheet && (
<div className="p-4 sm:p-5 space-y-3">
<div className="flex items-start gap-3">
<div className="w-9 h-9 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-rose-500" /></div>
<div>
<h3 className="text-sm font-bold text-foreground">{deleteSheet.title}</h3>
<p className="text-[10px] text-muted-foreground">This will permanently remove:</p>
</div>
</div>
<ul className="space-y-1.5">
{deleteSheet.lines.map((l, i) => (
<li key={i} className="text-xs text-foreground bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{l}</li>
))}
</ul>
<div className="flex gap-2">
<button type="button" onClick={() => setDeleteSheet(null)} className={cn(btnGhost, 'flex-1')}>Cancel</button>
<button type="button" onClick={() => deleteSheet.onConfirm()} className="flex-1 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Delete</button>
</div>
</div>
)}
</OverlayModal>
{/* Slot remove */}
<OverlayModal open={!!slotRemove} onClose={() => setSlotRemove(null)}>
{slotRemove && (
<div className="p-4 sm:p-5 space-y-3">
<div className="flex items-start gap-3">
<div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
<div>
<h3 className="text-sm font-bold text-foreground">Remove from this slot?</h3>
<p className="text-xs text-muted-foreground mt-1">“{slotRemove.subject}” will be removed from the {DAY_ABBRS[slotRemove.day]} {canonicalizeTimeRange(slotRemove.time)} slot.</p>
</div>
</div>
<div className="flex gap-2">
<button type="button" onClick={() => setSlotRemove(null)} className={cn(btnGhost, 'flex-1')}>Cancel</button>
<button type="button" onClick={confirmSlotRemove} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Remove</button>
</div>
</div>
)}
</OverlayModal>
{/* Edit subject */}
<OverlayModal open={!!editSubject} onClose={() => { setEditSubject(null); setEditError(null); }} maxW="max-w-lg">
{editSubject && (
<div className="p-4 sm:p-5 space-y-3.5">
<div className="flex items-center justify-between">
<h3 className="text-sm font-bold text-foreground">Edit Subject</h3>
<button type="button" onClick={() => { setEditSubject(null); setEditError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
</div>
<Note note={note} />
{editError && <p className={inlineErrCls}>{editError}</p>}
<div>
<label className={labelCls}>Name</label>
<input value={editSubject.name} onChange={e => setEditSubject({ ...editSubject, name: e.target.value })} inputMode="text" className={inputCls} />
</div>
{editSubject.subjectType === 'allied' && (
<div>
<label className={labelCls}>Parent</label>
<select value={editSubject.parentName} onChange={e => setEditSubject({ ...editSubject, parentName: e.target.value })} className={inputCls}>
{!parentOptions.includes(editSubject.parentName) && editSubject.parentName && <option value={editSubject.parentName}>{editSubject.parentName}</option>}
{parentOptions.map(p => <option key={p} value={p}>{p}</option>)}
</select>
</div>
)}
{editSubject.subjectType === 'allied' && PRESET_PARENTS.includes(editSubject.parentName) && (
<div className="grid grid-cols-2 gap-2.5">
<div><label className={labelCls}>Placement start</label><input type="date" value={editSubject.startDate || ''} onChange={e => setEditSubject({ ...editSubject, startDate: e.target.value })} className={inputCls} /></div>
<div><label className={labelCls}>Placement end</label><input type="date" value={editSubject.endDate || ''} onChange={e => setEditSubject({ ...editSubject, endDate: e.target.value })} className={inputCls} /></div>
</div>
)}
{editSubject.subjectType !== 'allied-parent' && (
<>
<div>
<label className={labelCls}>Day & Time</label>
{renderRowList(
editSubject.rows,
(id, patch) => setEditSubject({ ...editSubject, rows: editSubject.rows.map(r => (r.id === id ? { ...r, ...patch } : r)) }),
(id) => setEditSubject({ ...editSubject, rows: editSubject.rows.filter(r => r.id !== id) })
)}
<button type="button" onClick={() => setEditSubject({ ...editSubject, rows: [...editSubject.rows, newRow(editSubject.rows.map(r => r.day))] })} disabled={editSubject.rows.length >= 7} className={cn(btnGhost, 'w-full mt-2 flex items-center justify-center gap-1.5')}>
<Plus className="w-3.5 h-3.5" /> Add another day & time
</button>
</div>
<div>
<label className={labelCls}>Planned classes</label>
<input type="number" inputMode="numeric" min={0} value={editSubject.plannedClasses} onChange={e => setEditSubject({ ...editSubject, plannedClasses: parseInt(e.target.value, 10) || 0 })} className={inputCls} />
</div>
</>
)}
<div className="flex gap-2 justify-end">
<button type="button" onClick={() => { setEditSubject(null); setEditError(null); }} className={btnGhost}>Cancel</button>
<button type="button" onClick={saveEditSubject} className={btnPrimary}>Save changes</button>
</div>
</div>
)}
</OverlayModal>
{/* Edit ward */}
<OverlayModal open={!!editWard} onClose={() => { setEditWard(null); setEditError(null); }} maxW="max-w-lg">
{editWard && (
<div className="p-4 sm:p-5 space-y-3.5">
<div className="flex items-center justify-between">
<h3 className="text-sm font-bold text-foreground">Edit Rotation</h3>
<button type="button" onClick={() => { setEditWard(null); setEditError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
</div>
<Note note={note} />
{editError && <p className={inlineErrCls}>{editError}</p>}
<div>
<label className={labelCls}>Ward name</label>
<input value={editWard.name} onChange={e => setEditWard({ ...editWard, name: e.target.value })} inputMode="text" className={inputCls} />
</div>
<div className="grid grid-cols-2 gap-2.5">
<div><label className={labelCls}>Start date</label><input type="date" value={editWard.startDate} onChange={e => setEditWard({ ...editWard, startDate: e.target.value })} className={inputCls} /></div>
<div><label className={labelCls}>End date</label><input type="date" value={editWard.endDate} onChange={e => setEditWard({ ...editWard, endDate: e.target.value })} className={inputCls} /></div>
</div>
<div className="grid grid-cols-2 gap-2.5">
<div className="space-y-1.5"><label className={labelCls}>Morning</label><TimeField value={editWard.mornStart} onChange={v => setEditWard({ ...editWard, mornStart: v })} ariaLabel="morning start" /><TimeField value={editWard.mornEnd} onChange={v => setEditWard({ ...editWard, mornEnd: v })} ariaLabel="morning end" /></div>
<div className="space-y-1.5"><label className={labelCls}>Evening</label><TimeField value={editWard.eveStart} onChange={v => setEditWard({ ...editWard, eveStart: v })} ariaLabel="evening start" /><TimeField value={editWard.eveEnd} onChange={v => setEditWard({ ...editWard, eveEnd: v })} ariaLabel="evening end" /></div>
</div>
<div className="flex gap-2 justify-end">
<button type="button" onClick={() => { setEditWard(null); setEditError(null); }} className={btnGhost}>Cancel</button>
<button type="button" onClick={saveEditWard} className={btnPrimary}>Save changes</button>
</div>
</div>
)}
</OverlayModal>
{/* Edit slot */}
<OverlayModal open={!!editSlot} onClose={() => { setEditSlot(null); setEditError(null); }}>
{editSlot && (
<div className="p-4 sm:p-5 space-y-3.5">
<div className="flex items-center justify-between">
<h3 className="text-sm font-bold text-foreground">Edit Slot</h3>
<button type="button" onClick={() => { setEditSlot(null); setEditError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
</div>
<Note note={note} />
{editError && <p className={inlineErrCls}>{editError}</p>}
<div className="grid grid-cols-2 gap-2.5">
<div><label className={labelCls}>Start</label><TimeField value={editSlot.startTime} onChange={v => setEditSlot({ ...editSlot, startTime: v })} ariaLabel="slot start" /></div>
<div><label className={labelCls}>End</label><TimeField value={editSlot.endTime} onChange={v => setEditSlot({ ...editSlot, endTime: v })} ariaLabel="slot end" /></div>
</div>
<div>
<label className={labelCls}>Day</label>
<select value={editSlot.targetDay} onChange={e => setEditSlot({ ...editSlot, targetDay: parseInt(e.target.value, 10) })} className={inputCls}>
{DAY_ABBRS.map((abbr, i) => <option key={abbr} value={i}>{abbr}</option>)}
</select>
</div>
<div className="space-y-2">
<label className={labelCls}>Subjects in slot</label>
{editSlot.subjects.map((s, i) => (
<div key={s.name} className="flex items-center gap-2 bg-muted/30 border border-border/50 rounded-xl px-3 py-2">
<span className="text-xs font-bold flex-1 truncate" style={{ color: getSubjectColor(s.name) }}>
{isUserAddedName(s.name) && <span className="text-primary">✦ </span>}{s.name}
</span>
<input type="number" inputMode="numeric" min={0} value={s.planned}
onChange={e => {
const next = [...editSlot.subjects];
next[i] = { ...s, planned: parseInt(e.target.value, 10) || 0 };
setEditSlot({ ...editSlot, subjects: next });
}}
className="w-20 h-9 bg-background border border-border rounded-lg px-2 text-[11px] text-foreground" />
<button type="button" onClick={() => setSlotRemove({ subject: s.name, day: editSlot.day, index: editSlot.index, time: canonicalizeTimeRange(editSlot.startTime, editSlot.endTime) })}
className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><X className="w-4 h-4" /></button>
</div>
))}
</div>
<div className="flex gap-2 justify-end">
<button type="button" onClick={() => { setEditSlot(null); setEditError(null); }} className={btnGhost}>Cancel</button>
<button type="button" onClick={saveEditSlot} className={btnPrimary}>Save changes</button>
</div>
</div>
)}
</OverlayModal>
</motion.div>
</Layout>
);
}
