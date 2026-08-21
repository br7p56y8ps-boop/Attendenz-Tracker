import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Layout } from '@/components/Layout';
import {
  useCustomData,
  DAY_ABBRS,
  parseDayList,
  getEffectiveParentName,
} from '@/contexts/CustomDataContext';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey } from '@/contexts/AttendanceContext';
import {
  cn,
  canonicalTimeRange,
  canonicalizeTimeRange,
  parseRangeToMinutes,
  formatISODateDDMMYY,
  to12h,
  getSubjectColor,
} from '@/lib/utils';
import { lockScroll, unlockScroll } from '@/lib/scrollLock';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';
import { snapshotBeforeEdit } from '@/utils/snapshotUtils';
import { PRESET_PARENTS, CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';
import {
  Plus, Trash2, X, AlertTriangle,
  GraduationCap, Stethoscope, Download, Upload, Copy, Share2,
  Check, ChevronDown, ChevronRight, SendToBack,
} from 'lucide-react';

/* ── Shared styles ── */
const inputCls =
  'w-full h-10 bg-background border border-border rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40';
const btnPrimary =
  'action-button action-button--edit disabled:cursor-not-allowed';
const btnGhost =
  'action-button action-button--neutral';
const btnDanger =
  'action-button action-button--danger';
const btnSave =
  'action-button action-button--save';
const labelCls = 'block text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide';
const descCls = 'block text-[10px] text-muted-foreground/70 mb-1.5';
const inlineErrCls =
  'text-[11px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2';
const CREATE_NEW = '__create_new__';
const BUNDLE_VERSION = 2;
const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const splitRange = (range: string): { start: string; end: string } => {
  const canon = canonicalizeTimeRange(range || '');
  const m = canon.match(/^(\d{2}:\d{2} (?:AM|PM))–(\d{2}:\d{2} (?:AM|PM))$/);
  if (m) return { start: m[1], end: m[2] };
  return { start: '09:00 AM', end: '10:00 AM' };
};
function OverlayModal({ open, onClose, children, maxW = 'max-w-md', header, footer, heightClass = 'max-h-[85vh]', bodyClassName = 'overflow-y-auto', dense = false }: {
  open: boolean; onClose: () => void; children: React.ReactNode; maxW?: string;
  header?: React.ReactNode; footer?: React.ReactNode; heightClass?: string; bodyClassName?: string; dense?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); } };
    window.addEventListener('keydown', onKey);
    lockScroll();
    return () => { window.removeEventListener('keydown', onKey); unlockScroll(); };
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 48 }}
        layout
        transition={{ type: 'spring', damping: 26, stiffness: 320, layout: { type: 'spring', damping: 28, stiffness: 300 } }}
        className={cn('modal-sheet-content relative bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.42)] w-full max-h-[min(70dvh,48rem)] min-h-0 flex flex-col overflow-hidden', maxW, heightClass)}
        onClick={e => e.stopPropagation()}
      >
        {header && <div className={cn('shrink-0 border-b border-border/40', dense ? 'px-3 sm:px-4 pt-2.5 sm:pt-3 pb-1.5' : 'px-4 sm:px-5 pt-4 sm:pt-5 pb-3')}>{header}</div>}
        <div className={cn('flex-1 min-h-0', bodyClassName)}>{children}</div>
        {footer && <div className={cn('shrink-0 border-t border-border/40', dense ? 'px-3 sm:px-4 pb-2.5 sm:pb-3 pt-1.5' : 'px-4 sm:px-5 pb-4 sm:pb-5 pt-3')}>{footer}</div>}
      </motion.div>
    </div>,
    document.body
  );
}

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
function TimeField({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) {
  const to24val = (v: string): string => {
    if (!v) return '';
    const m = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return '09:00';
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  const to12val = (v: string): string => {
    if (!v) return '';
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
      className="h-9 w-full min-w-0 flex-1 bg-background border border-border rounded-lg px-1.5 text-xs text-center text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
    />
  );
}

const AddedBadge = () => (
  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">
    ✦ Added by you
  </span>
);

interface ScheduleRow { id: string; day: string; startTime: string; endTime: string; }
interface StagedChild { name: string; rows: ScheduleRow[]; plannedClasses: number; startDate?: string; endDate?: string; }
interface VacationPeriod { id: string; start: string; end: string; }
interface EditSubjectState {
  store: 'userAdded' | 'custom'; id: string; originalName: string; name: string;
  subjectType: 'single' | 'allied' | 'allied-parent'; parentName: string;
  clinicalSubject?: string;
  rows: ScheduleRow[]; plannedClasses: number; startDate?: string; endDate?: string;
  vacationPeriods?: VacationPeriod[];
}
interface EditWardState {
  store: 'preset' | 'custom'; index?: number; id?: string;
  originalName: string; name: string; startDate: string; endDate: string;
  mornStart: string; mornEnd: string; eveStart: string; eveEnd: string;
  vacationPeriods?: VacationPeriod[];
}
interface EditSlotState {
  day: number; index: number; startTime: string; endTime: string; targetDay: number;
  subjects: Array<{ name: string; planned: number; id: string }>;
  multiSelectMode: boolean;
}
interface ImportBundle {
  version?: number; subjectMode?: 'preloaded' | 'custom';
  addedSubjects?: Array<{
    id?: string; name: string; type?: string; parentCategory?: string | null; planned?: number;
    schedules?: Array<{ day: string; start: string; end: string }>;
    clinicalSubject?: string; startDate?: string; endDate?: string;
    vacationPeriods?: Array<{ start: string; end: string }>;
  }>;
  customWards?: Array<{ id?: string; name: string; startDate: string; endDate: string; morningTime?: string; eveningTime?: string; vacationPeriods?: Array<{ start: string; end: string }> }>;
  presetTimetable?: any; presetWardSchedule?: any; presetSubjectTotals?: Record<string, number>;
}
interface ImportReport { subjectsAdd: number; subjectsSkip: string[]; wardsAdd: number; wardsSkip: string[]; slots: number; rotations: number; }

const newRow = (usedDays: string[]): ScheduleRow => {
  const day = DAY_ABBRS.find(d => !usedDays.includes(d)) || 'Mon';
  return { id: genId('row'), day, startTime: '09:00 AM', endTime: '10:00 AM' };
};

const formatHistoryDetail = (entry: any): string => {
  const d = entry.data;
  if (!d) return '';
  switch (entry.type) {
    case 'Moved Subjects':
      return `${(d.names || []).join(', ')} · ${DAY_ABBRS[d.fromDay] || '?'} ${d.fromTime || ''} → ${DAY_ABBRS[d.toDay] || '?'} ${d.toTime || ''}`;
    case 'Renamed':
      return `"${d.old}" → "${d.new}"`;
    case 'Added Slot':
      return `${d.subject} · ${DAY_ABBRS[d.day] || '?'} ${d.time || ''}`;
    case 'Removed from Slot':
      return `${d.subject} · ${DAY_ABBRS[d.day] || '?'} ${d.time || ''}`;
    case 'Deleted Subject':
      return d.name || '';
    case 'Deleted Ward':
    case 'Deleted Rotation':
      return d.ward || d.name || '';
    case 'Edited Subject':
      return d.new?.name || d.old?.name || '';
    case 'Edited Ward':
      return d.new?.name || d.old?.name || '';
    case 'Changed Parent':
      return `→ ${d.newParent || 'Single'}`;
    case 'Changed Clinical Subject':
      return `${d.name || ''}: ${d.from || '—'} → ${d.to || ''}`;
    case 'Added Subject':
      return (d.names || []).join(', ');
    case 'Added Rotation':
      return `${d.name || ''} (${d.start || ''} – ${d.end || ''})`;
    case 'Added SGT':
      return `${d.name || ''} under ${d.clinicalSubject || ''} · ${d.planned || 0} planned`;
    case 'Edited Planned':
      return `${d.name || ''}: → ${d.planned ?? ''}`;
    case 'Imported (Merge)':
      return `${d.subjects || 0} subject(s), ${d.rotations || 0} rotation(s)`;
    case 'Imported (Replace)':
      return `Mode: ${d.mode || 'unknown'}`;
    default:
      return '';
  }
};

function ClinicalGroupCard({
  name, hasRotation, hasSGT, rotation, sgt,
  onAddRotation, onAddSGT, onEditRotation, onEditSGT, onDeleteRotation, onDeleteSGT,
  canDeleteRotation = true,
}: any) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-background/30">
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-3 hover:bg-muted/20 transition-colors text-left">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-foreground" style={{ color: getSubjectColor(name) }}>{name}</span>
          {hasRotation && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">Rotation</span>}
          {hasSGT && <span className="text-[10px] bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded-full">SGT</span>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="p-3 pt-0 space-y-2">
          {hasRotation ? (
            <div className="flex items-center justify-between bg-card border border-border/40 rounded-lg p-2.5">
              <div>
                <p className="text-xs font-bold text-foreground">Clinical Rotation</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatISODateDDMMYY(rotation.entry.start)} – {formatISODateDDMMYY(rotation.entry.end)}
                </p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={onEditRotation} className="action-button action-button--edit shrink-0">Edit</button>
                {canDeleteRotation && (
                  <button type="button" onClick={onDeleteRotation} className="action-button action-button--danger shrink-0">Delete</button>
                )}
              </div>
            </div>
          ) : (
            <button type="button" onClick={onAddRotation} className="w-full py-2 text-xs font-medium text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Rotation
            </button>
          )}
          {hasSGT ? (
            <div className="flex items-center justify-between bg-card border border-border/40 rounded-lg p-2.5">
              <div>
                <p className="text-xs font-bold text-foreground">Small Group Teaching</p>
                <p className="text-[10px] text-muted-foreground">
                  {sgt.startDate && sgt.endDate ? `${formatISODateDDMMYY(sgt.startDate)} – ${formatISODateDDMMYY(sgt.endDate)}` : 'No dates'}
                </p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={onEditSGT} className="action-button action-button--edit shrink-0">Edit</button>
                <button type="button" onClick={onDeleteSGT} className="action-button action-button--danger shrink-0">Delete</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={onAddSGT} className="w-full py-2 text-xs font-medium text-purple-500 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add SGT
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VacationEditor({ vacations, onChange }: {
  vacations: VacationPeriod[];
  onChange: (v: VacationPeriod[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden bg-background/40">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors text-left">
        <span className="text-[11px] font-bold text-foreground">Vacation / Exam Period</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {vacations.length === 0 && (
            <p className="text-[10px] text-muted-foreground">No vacation added — full period counts (Fridays & global holidays auto-excluded).</p>
          )}
          {vacations.map(v => (
            <div key={v.id} className="flex items-center gap-1.5">
              <input type="date" value={v.start} onChange={e => onChange(vacations.map(x => x.id === v.id ? { ...x, start: e.target.value } : x))} className={cn(inputCls, 'h-8 text-center text-xs')} />
              <input type="date" value={v.end} onChange={e => onChange(vacations.map(x => x.id === v.id ? { ...x, end: e.target.value } : x))} className={cn(inputCls, 'h-8 text-center text-xs')} />
              <button type="button" onClick={() => onChange(vacations.filter(x => x.id !== v.id))} className="shrink-0 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => onChange([...vacations, { id: genId('vac'), start: '', end: '' }])} className={cn(btnGhost, 'w-full flex items-center justify-center gap-1.5')}>
            <Plus className="w-3.5 h-3.5" /> Add vacation period
          </button>
        </div>
      )}
    </div>
  );
}

const AI_PROMPT = `You are helping me create a routine bundle for the Attendenz Tracker app. Return exactly one plain JSON object in UTF-8 text. Do not return an image, Markdown, a code fence, commentary, headings, or explanatory prose. Use the exact schema below; omit any section that is not present in the source rather than inventing empty or preset data.

{
  "version": 2,
  "subjectMode": "preloaded",
  "addedSubjects": [
    {
      "name": "Cardiology",
      "type": "single",
      "parentCategory": null,
      "planned": 40,
      "schedules": [
        { "day": "Mon", "start": "09:00 AM", "end": "10:00 AM" }
      ],
      "clinicalSubject": null,
      "startDate": "2026-01-24",
      "endDate": "2026-02-27",
      "vacationPeriods": [ { "start": "2026-02-01", "end": "2026-02-03" } ]
    }
  ],
  "customWards": [
    {
      "name": "Surgery",
      "startDate": "2026-01-24",
      "endDate": "2026-02-27",
      "morningTime": "09:30 AM–11:30 AM",
      "eveningTime": "07:00 PM–09:00 PM",
      "vacationPeriods": [ { "start": "2026-02-05", "end": "2026-02-07" } ]
    }
  ],
  "presetTimetable": {},
  "presetWardSchedule": [],
  "presetSubjectTotals": {}
}

Rules:
- All times use 12-hour format with AM/PM. Use en-dash (–) between start and end, e.g. "09:00 AM–10:00 AM".
- Dates are yyyy-mm-dd.
- For subjectMode "preloaded", do not include preset subjects in addedSubjects; include only user-added subjects and include preset sections only when they are present in the source.
- For subjectMode "custom", include the custom academic, clinical, allied, and SGT subjects actually present in the source; omit absent sections.
- A subject of type "allied" must have parentCategory set to its parent name. An SGT subject must use parentCategory "Small Group Teaching", type "allied", and clinicalSubject equal to the ward name it belongs to.
- Never classify an academic subject as SGT unless it belongs to Small Group Teaching. Preserve source names, days, times, dates, and planned totals exactly.
- Vacation periods exclude those dates from planned class counts.
Return only the JSON object, no markdown.`;

export default function AddNew() {
  const {
    subjectMode,
    customSubjects, customWards,
    userAddedSubjects,
    presetTimetable, presetWardSchedule, presetSubjectTotals,
    addCustomSubjects, updateCustomSubject, removeCustomSubject,
    addCustomWards, updateCustomWard, removeCustomWard,
    addUserAddedSubjects, updateUserAddedSubject, removeUserAddedSubject,
    addPresetWardEntry, updatePresetWardEntry, removePresetWardEntry,
    updatePresetTimetableSlot, addSubjectToSlot, updatePresetSubjectTotal,
    getParentOptions, isExistingParent, getAlliedChildCount,
    isSubjectNameTaken, isWardNameTaken, findSubjectTimeConflicts, findWardDateConflicts,
    getSubjectPlannedTotal,
    getPresetWardTotalPlanned,
    getCustomWardTotalPlanned,
    countSGTPlannedDays,
    renamePresetWard,
    getPresetSubjectDisplayName,
    getPresetWardDisplayName,
  } = useCustomData();
  const { removeSubjectData, removeWardData, removeAttendanceByKey, removeAttendanceEntitiesForMode } = useAttendance();
  const [, setLocation] = useLocation();

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
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const controlsCollapseTimer = useRef<number | null>(null);
  const [addModalScrolled, setAddModalScrolled] = useState(false);
  const academicScrollRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<'academic' | 'clinical'>('academic');
  useEffect(() => { if (!moreOpen) setAddModalScrolled(false); }, [moreOpen]);
  useEffect(() => {
    setControlsExpanded(true);
    if (controlsCollapseTimer.current) window.clearTimeout(controlsCollapseTimer.current);
    controlsCollapseTimer.current = window.setTimeout(() => setControlsExpanded(false), 3000);
    const onPageScroll = () => {
      if (window.scrollY > 4) setControlsExpanded(false);
    };
    window.addEventListener('scroll', onPageScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onPageScroll);
      if (controlsCollapseTimer.current) window.clearTimeout(controlsCollapseTimer.current);
    };
  }, [section]);
  const toggleControls = () => {
    setControlsExpanded(prev => {
      const next = !prev;
      if (controlsCollapseTimer.current) window.clearTimeout(controlsCollapseTimer.current);
      if (next) controlsCollapseTimer.current = window.setTimeout(() => setControlsExpanded(false), 3000);
      return next;
    });
  };
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
  const [clinicalParentChoice, setClinicalParentChoice] = useState<'rotation' | 'sgt'>('rotation');
  const [wardName, setWardName] = useState('');
  const [wardStart, setWardStart] = useState('');
  const [wardEnd, setWardEnd] = useState('');
  const [mornStart, setMornStart] = useState('09:30 AM');
  const [mornEnd, setMornEnd] = useState('11:30 AM');
  const [eveStart, setEveStart] = useState('07:00 PM');
  const [eveEnd, setEveEnd] = useState('09:00 PM');
  const [wardVacations, setWardVacations] = useState<VacationPeriod[]>([]);
  const [sgtClinicalSubject, setSgtClinicalSubject] = useState('');
  const [sgtName, setSgtName] = useState('');
  const [sgtStartDate, setSgtStartDate] = useState('');
  const [sgtEndDate, setSgtEndDate] = useState('');
  const [sgtRows, setSgtRows] = useState<ScheduleRow[]>([newRow([])]);
  const [sgtVacations, setSgtVacations] = useState<VacationPeriod[]>([]);
  const [editSlot, setEditSlot] = useState<EditSlotState | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [slotMoveTargetDay, setSlotMoveTargetDay] = useState<number>(0);
  const [slotMoveStart, setSlotMoveStart] = useState('09:00 AM');
  const [slotMoveEnd, setSlotMoveEnd] = useState('10:00 AM');
  const [slotConflict, setSlotConflict] = useState<{ messages: string[]; onConfirm: () => void } | null>(null);
  const [slotRemove, setSlotRemove] = useState<{ subject: string; day: number; index: number; time: string; start: string; end: string } | null>(null);
  const [slotRemoveConfirm, setSlotRemoveConfirm] = useState(false);
  const [slotRemoveAllConfirm, setSlotRemoveAllConfirm] = useState(false);
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [deleteSheet, setDeleteSheet] = useState<{ title: string; lines: string[]; onConfirm: () => void } | null>(null);
  const [conflictSheet, setConflictSheet] = useState<{ messages: string[]; onConfirm: () => void } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ bundle: ImportBundle; report: ImportReport } | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [editSubject, setEditSubject] = useState<EditSubjectState | null>(null);
  const [editWard, setEditWard] = useState<EditWardState | null>(null);
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [addSlotSubject, setAddSlotSubject] = useState('');
  const [addSlotStart, setAddSlotStart] = useState('09:00 AM');
  const [addSlotEnd, setAddSlotEnd] = useState('10:00 AM');
  const [addSlotPlanned, setAddSlotPlanned] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [editDataOpen, setEditDataOpen] = useState(false);
  const [editDataTab, setEditDataTab] = useState<'preset' | 'added'>('preset');
  const [expandedEditItemId, setExpandedEditItemId] = useState<string | null>(null);
  const [draftPlanned, setDraftPlanned] = useState<number | null>(null);
  const [moveCompleted, setMoveCompleted] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);

  const isAllied = subjectType === 'allied';
  const resolvedParent = parentChoice === CREATE_NEW ? newParentName.trim() : parentChoice.trim();
  const parentIsNew = resolvedParent ? !(PRESET_PARENTS.includes(resolvedParent) || isExistingParent(resolvedParent)) : false;
  const parentIsSGT = resolvedParent ? PRESET_PARENTS.includes(resolvedParent) : false;

  const isSGTRecord = (s: { subjectType: string; parentName?: string }): boolean =>
    s.subjectType === 'allied' && s.parentName === 'Small Group Teaching';

  const resolvePresetOriginalName = (displayName: string): string => {
    const all = [
      ...CATEGORIES.flatMap(c => c.subjects.map(s => s.name)),
      ...INTEGRATED_SUBJECTS.map(s => s.name),
    ];
    return all.find(n => getPresetSubjectDisplayName(n) === displayName) ?? displayName;
  };

  const academicParentOptions = useMemo(() => {
    const all = getParentOptions();
    return all.filter(p => p !== 'Small Group Teaching');
  }, [getParentOptions]);

  const groupedParents = useMemo(() => {
    const store = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const derived = store.filter(s => s.subjectType === 'allied' && !isSGTRecord(s)).map(s => getEffectiveParentName(s)).filter((p): p is string => !!p);
    const allParents = Array.from(new Set([
      ...(subjectMode === 'preloaded' ? [...PRESET_PARENTS.filter(p => p !== 'Small Group Teaching'), ...CATEGORIES.map(c => c.name), 'Integrated Teaching'] : []),
      ...store.filter(s => s.subjectType === 'allied-parent').map(s => s.name),
      ...derived,
    ]));
    const allSubjects = store.filter(s => !isSGTRecord(s)).map(s => s.name);
    const singles = allSubjects.filter(n => !allParents.includes(n));
    return { parents: allParents, singles };
  }, [subjectMode, userAddedSubjects, customSubjects]);

  const allClinicalSubjects = useMemo(() => {
    const presetNames = WARD_SUBJECTS.map(w => w.name);
    const customNames = customWards.map(w => w.name);
    const sgtParents = [
      ...userAddedSubjects.filter(s => isSGTRecord(s)).map(s => (s as any).clinicalSubject),
      ...customSubjects.filter(s => isSGTRecord(s)).map(s => (s as any).clinicalSubject),
    ].filter((name): name is string => !!name && !presetNames.includes(name) && !customNames.includes(name));
    return Array.from(new Set([...presetNames, ...customNames, ...sgtParents])).sort();
  }, [customWards, userAddedSubjects, customSubjects]);

  const clinicalSubjectOptions = useMemo(() => {
    const opts = allClinicalSubjects.map(name => ({ value: name, label: getPresetWardDisplayName(name) }));
    opts.push({ value: CREATE_NEW, label: '+ Create new clinical subject' });
    return opts;
  }, [allClinicalSubjects]);

  const getSGTForSubject = (clinicalName: string) => {
    const find = (list: any[]) => list.find(s => isSGTRecord(s) && (s as any).clinicalSubject === clinicalName) || null;
    return find(userAddedSubjects) || find(customSubjects) || null;
  };
  const getSGTStore = (sgt: any): 'userAdded' | 'custom' => {
    if (userAddedSubjects.some(s => s.id === sgt.id)) return 'userAdded';
    if (customSubjects.some(s => s.id === sgt.id)) return 'custom';
    return subjectMode === 'preloaded' ? 'userAdded' : 'custom';
  };

  const getRotationForSubject = (clinicalName: string) => {
    const preset = presetWardSchedule.find(e => e.ward === clinicalName);
    if (preset) return { store: 'preset' as const, entry: preset, index: presetWardSchedule.indexOf(preset) };
    const custom = customWards.find(w => w.name === clinicalName);
    if (custom) return { store: 'custom' as const, entry: custom, id: custom.id };
    return null;
  };

  const isAcademicSubject = (subjectName: string): boolean => {
    if (subjectMode === 'preloaded') {
      const presetAcademic = CATEGORIES.flatMap(c => c.subjects).some(s => s.name === subjectName);
      const integrated = INTEGRATED_SUBJECTS.some(s => s.name === subjectName);
      const userAddedAcademic = userAddedSubjects.some(s => s.name === subjectName && !isSGTRecord(s));
      return presetAcademic || integrated || userAddedAcademic;
    } else {
      return customSubjects.some(s => s.name === subjectName && !isSGTRecord(s));
    }
  };

  const computeSGTPlanned = (start: string, end: string, rows: ScheduleRow[], vacations: VacationPeriod[]) => {
    if (!start || !end || rows.length === 0) return 0;
    return countSGTPlannedDays(start, end, rows.map(r => r.day), vacations.map(v => ({ start: v.start, end: v.end })));
  };
  const computedPlanned = useMemo(() => computeSGTPlanned(sgtStartDate, sgtEndDate, sgtRows, sgtVacations), [sgtStartDate, sgtEndDate, sgtRows, sgtVacations]);

  const academicAddSlotSubjects = useMemo(() => {
    const set = new Set<string>();
    if (subjectMode === 'preloaded') {
      CATEGORIES.forEach(c => c.subjects.forEach(s => set.add(s.name)));
      INTEGRATED_SUBJECTS.forEach(s => set.add(s.name));
      userAddedSubjects.filter(s => !isSGTRecord(s)).forEach(s => set.add(s.name));
    } else {
      customSubjects.filter(s => !isSGTRecord(s)).forEach(s => set.add(s.name));
    }
    return Array.from(set).sort();
  }, [subjectMode, userAddedSubjects, customSubjects]);

  const HISTORY_KEY = 'att_manage_history';
  useEffect(() => {
    try { const stored = localStorage.getItem(HISTORY_KEY); if (stored) setHistoryEntries(JSON.parse(stored)); } catch {}
  }, []);

  useEffect(() => {
    if (!moreOpen) {
      setSubjectType('single');
      setSubjectName(''); setParentChoice(''); setNewParentName('');
      setSubjectRows([newRow([])]); setPlanned(''); setStagedChildren([]);
      setChildStart(''); setChildEnd('');
      setClinicalParentChoice('rotation');
      setWardName(''); setWardStart(''); setWardEnd(''); setWardVacations([]);
      setSgtClinicalSubject(''); setSgtName(''); setSgtStartDate(''); setSgtEndDate('');
      setSgtRows([newRow([])]); setSgtVacations([]);
      setFormError(null);
      setAddSuccess(false);
    }
  }, [moreOpen]);

  useEffect(() => {
    if (addSuccess) {
      const t = window.setTimeout(() => {
        setMoreOpen(false);
        setAddSlotOpen(false);
        setAddSuccess(false);
        setEditSlot(null);
        setMoveCompleted(false);
      }, 2000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [addSuccess]);

  const recordHistory = (type: string, data: any) => {
    const entry = { id: genId('hist'), type, timestamp: new Date().toISOString(), data: { ...data, section } };
    setHistoryEntries(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); storageSetItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const openAddSlot = () => { setAddSlotSubject(''); setAddSlotStart('09:00 AM'); setAddSlotEnd('10:00 AM'); setAddSlotPlanned(0); setFormError(null); setAddSlotOpen(true); setAddSuccess(false); };

  const saveAddSlot = () => {
    if (!addSlotSubject) { setFormError('Select a subject.'); return; }
    const time = canonicalTimeRange(addSlotStart, addSlotEnd);

    const existingDaySlots = subjectMode === 'preloaded'
      ? (presetTimetable[selDay] || []).filter(s => s.type !== 'ward' && s.type !== 'ward_replacement' && s.subjects.includes(addSlotSubject))
      : customSubjects.filter(s => s.name === addSlotSubject && (s.schedules || []).some(sch => sch.day === DAY_ABBRS[selDay]));
    if (existingDaySlots.length > 0) {
      setFormError(`"${addSlotSubject}" already has a slot on ${DAY_ABBRS[selDay]}.`); return;
    }

    const conflicts = findSubjectTimeConflicts([DAY_ABBRS[selDay]], time, undefined).filter(c => !c.exact);
    if (conflicts.length > 0) {
      setFormError(null);
      setConflictSheet({
        messages: conflicts.map(c => `Time overlap on ${c.day} at ${c.time} with ${c.subjects.join(', ')}.`),
        onConfirm: () => {
          setConflictSheet(null);
          doAddSlot(time);
        }
      });
      return;
    }

    doAddSlot(time);
  };

  const doAddSlot = (time: string) => {
    recordHistory('Added Slot', { subject: addSlotSubject, day: selDay, time });

    if (subjectMode === 'preloaded') {
      const ua = userAddedSubjects.find(u => u.name === addSlotSubject && !isSGTRecord(u));
      if (ua) {
        const { start, end } = splitRange(time);
        const existingSchedules = ua.schedules || [];
        if (!existingSchedules.some(s => s.day === DAY_ABBRS[selDay] && s.start === start && s.end === end)) {
          const updated = [...existingSchedules, { day: DAY_ABBRS[selDay], start, end }];
          updateUserAddedSubject(ua.id, { schedules: updated, days: updated.map(s => s.day).join(', ') } as any);
        }
      } else {
        addSubjectToSlot(selDay, time, addSlotSubject);
      }
    } else {
      const target = customSubjects.find(s => s.name === addSlotSubject && !isSGTRecord(s));
      if (target) {
        const schedules = target.schedules || [];
        if (schedules.some(s => s.day === DAY_ABBRS[selDay] && canonicalizeTimeRange(s.time) === time)) {
          setFormError('Subject already scheduled at this time.'); return;
        }
        updateCustomSubject(target.id, { schedules: [...schedules, { day: DAY_ABBRS[selDay], time }] });
      } else {
        setFormError('Subject not found.'); return;
      }
    }
    showToast('Slot added.');
    setAddSuccess(true);
  };

  const addSubjectRow = () => { if (subjectRows.length >= 7) { setFormError('Maximum 7 day & time rows.'); return; } setSubjectRows(prev => [...prev, newRow(prev.map(r => r.day))]); };
  const updateSubjectRow = (id: string, patch: Partial<ScheduleRow>) => setSubjectRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeSubjectRow = (id: string) => setSubjectRows(prev => prev.filter(r => r.id !== id));

  const rowProblem = (rows: ScheduleRow[]): string | null => {
    if (rows.length === 0) return 'Add at least one day & time row.';
    const okTime = (t: string) => /^\d{1,2}:\d{2} (AM|PM)$/.test(t);
    const toMin = (t: string): number => {
      const m = t.match(/^(\d{1,2}):(\d{2}) (AM|PM)$/);
      if (!m) return -1;
      let h = parseInt(m[1], 10) % 12;
      if (m[3] === 'PM') h += 12;
      return h * 60 + parseInt(m[2], 10);
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.day || !okTime(r.startTime) || !okTime(r.endTime)) return `Row ${i + 1}: pick a day and complete both times.`;
      const sm = toMin(r.startTime); const em = toMin(r.endTime);
      if (sm >= 0 && em >= 0 && em <= sm) return `Row ${i + 1}: end time must be after start time.`;
    }
    return null;
  };

  const buildRowsFromForm = (rows: ScheduleRow[]) => rows.map(r => ({ day: r.day, time: canonicalTimeRange(r.startTime, r.endTime), start: r.startTime, end: r.endTime }));

  const addStagedChild = () => {
    if (!subjectName.trim()) { setFormError('Enter a child subject name.'); return; }
    const rp = rowProblem(subjectRows); if (rp) { setFormError(rp); return; }
    const pc = parseInt(planned, 10); if (isNaN(pc) || pc < 0) { setFormError('Enter valid planned classes.'); return; }
    if (parentIsSGT && (!childStart || !childEnd)) { setFormError('Pick placement start & end dates for Small Group children.'); return; }
    if (parentIsSGT && childEnd < childStart) { setFormError('Placement end must be after start.'); return; }
    setFormError(null);
    setStagedChildren(prev => [...prev, { name: subjectName.trim(), rows: [...subjectRows], plannedClasses: pc, startDate: childStart, endDate: childEnd }]);
    setSubjectName(''); setPlanned(''); setSubjectRows([newRow([])]); setChildStart(''); setChildEnd('');
  };

  const commitSubjects = (items: any[]) => {
    try {
      if (subjectMode === 'preloaded') {
        addUserAddedSubjects(items.map(it => ({
          name: it.name,
          subjectType: it.subjectType,
          parentName: it.parentName,
          plannedClasses: it.plannedClasses,
          days: it.rows.map((r: any) => r.day).join(', '),
          time: it.rows[0]?.time || '',
          schedules: it.rows.map((r: any) => ({ day: r.day, start: r.start, end: r.end })),
          startDate: it.startDate,
          endDate: it.endDate,
          clinicalSubject: it.clinicalSubject,
        })));
      } else {
        addCustomSubjects(items.map(it => ({
          name: it.name,
          subjectType: it.subjectType,
          parentName: it.parentName,
          plannedClasses: it.plannedClasses,
          days: it.rows.map((r: any) => r.day).join(', '),
          time: it.rows[0]?.time || '',
          schedules: it.rows.map((r: any) => ({ day: r.day, time: r.time })),
          startDate: it.startDate,
          endDate: it.endDate,
          clinicalSubject: it.clinicalSubject,
        })));
      }
      const academicItems = items.filter((i: any) => i.subjectType !== 'allied-parent');
      if (academicItems.length > 0) recordHistory('Added Subject', { names: academicItems.map((i: any) => i.name) });
      setSubjectName(''); setPlanned(''); setSubjectRows([newRow([])]); setStagedChildren([]); setNewParentName(''); setChildStart(''); setChildEnd('');
      setFormError(null); showToast(items.length > 1 ? `${items.length} items added.` : 'Added successfully.');
      setConflictSheet(null);
      setAddSuccess(true);
    } catch { showToast('Failed to save — please try again.', 'err'); setFormError('Failed to save.'); }
  };

  const saveSubject = () => {
    const items: any[] = [];
    if (!isAllied) {
      if (!subjectName.trim()) { setFormError('Enter a subject name.'); return; }
      const rp = rowProblem(subjectRows); if (rp) { setFormError(rp); return; }
      const pc = parseInt(planned, 10); if (isNaN(pc) || pc < 0) { setFormError('Enter valid planned classes.'); return; }
      items.push({ name: subjectName.trim(), subjectType: 'single', plannedClasses: pc, rows: buildRowsFromForm(subjectRows) });
    } else {
      if (!resolvedParent) { setFormError('Choose or create a parent.'); return; }
      const children: StagedChild[] = [...stagedChildren];
      if (subjectName.trim() && subjectRows.length > 0) {
        const rp = rowProblem(subjectRows); if (rp) { setFormError(rp); return; }
        const pc = parseInt(planned, 10); if (isNaN(pc) || pc < 0) { setFormError('Enter valid planned classes for the current child.'); return; }
        if (parentIsSGT && (!childStart || !childEnd)) { setFormError('Pick placement start & end dates for Small Group children.'); return; }
        if (parentIsSGT && childEnd < childStart) { setFormError('Placement end must be after start.'); return; }
        children.push({ name: subjectName.trim(), rows: [...subjectRows], plannedClasses: pc, startDate: childStart, endDate: childEnd });
      }
      if (children.length === 0) { setFormError('Add at least one child subject.'); return; }
      const minReq = parentIsNew ? 2 : 1;
      if (children.length < minReq) { setFormError(parentIsNew ? `A brand-new parent needs at least 2 children (you have ${children.length}).` : 'Add at least 1 child.'); return; }
      for (const c of children) { const rp = rowProblem(c.rows); if (rp) { setFormError(`Child "${c.name}": ${rp}`); return; } }
      if (parentIsNew) items.push({ name: resolvedParent, subjectType: 'allied-parent', plannedClasses: 0, rows: [] });
      for (const c of children) items.push({ name: c.name, subjectType: 'allied', parentName: resolvedParent, plannedClasses: c.plannedClasses, rows: buildRowsFromForm(c.rows), startDate: c.startDate, endDate: c.endDate });
    }

    try {
      const duplicates: string[] = []; const timeOverlaps: any[] = []; const seen = new Set<string>();
      const academic = items.filter((i: any) => i.subjectType !== 'allied-parent');
      for (const it of academic) {
        const ln = it.name.trim().toLowerCase();
        if (seen.has(ln)) { if (!duplicates.includes(it.name)) duplicates.push(it.name); continue; }
        seen.add(ln);
        if (isSubjectNameTaken(it.name, undefined, 'academic') && !duplicates.includes(it.name)) duplicates.push(it.name);
        for (const r of it.rows) for (const c of findSubjectTimeConflicts([r.day], r.time, undefined, 'academic')) if (!c.exact) timeOverlaps.push({ day: c.day, time: c.time, subjects: c.subjects });
      }
      for (let i = 0; i < academic.length; i++) for (let j = i + 1; j < academic.length; j++) {
        const a = academic[i], b = academic[j];
        for (const ra of a.rows) for (const rb of b.rows) {
          if (ra.day !== rb.day) continue;
          const pa = parseRangeToMinutes(ra.time), pb = parseRangeToMinutes(rb.time);
          if (!pa || !pb) continue;
          if (pa.start < pb.end && pb.start < pa.end && canonicalizeTimeRange(ra.time) !== canonicalizeTimeRange(rb.time)) timeOverlaps.push({ day: ra.day, time: rb.time, subjects: [a.name, b.name] });
        }
      }
      if (duplicates.length > 0 || timeOverlaps.length > 0) {
        const messages: string[] = [];
        for (const d of duplicates) messages.push(`Duplicate name: "${d}" already exists.`);
        for (const t of timeOverlaps) messages.push(`Time overlap on ${t.day} at ${t.time} with ${t.subjects.join(', ')}.`);
        setFormError(null);
        setConflictSheet({ messages, onConfirm: () => { setConflictSheet(null); commitSubjects(items); } });
        return;
      }
      commitSubjects(items);
    } catch { showToast('Failed to check/save — please try again.', 'err'); setFormError('Failed to save.'); }
  };

  const addSgtRow = () => { if (sgtRows.length >= 7) { setFormError('Maximum 7 day & time rows.'); return; } setSgtRows(prev => [...prev, newRow(prev.map(r => r.day))]); };
  const updateSgtRow = (id: string, patch: Partial<ScheduleRow>) => setSgtRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeSgtRow = (id: string) => setSgtRows(prev => prev.filter(r => r.id !== id));

  const commitWard = (name: string, start: string, end: string, morningTime: string, eveningTime: string, vacations: VacationPeriod[]) => {
    try {
      const vacationData = vacations.map(v => ({ start: v.start, end: v.end }));
      if (subjectMode === 'preloaded') {
        addPresetWardEntry({ start, end, ward: name, morningTime, eveningTime, addedByUser: true, vacationPeriods: vacationData });
      } else {
        addCustomWards([{ name, startDate: start, endDate: end, morningTime, eveningTime, vacationPeriods: vacationData }]);
      }
      recordHistory('Added Rotation', { name, start, end });
      setWardName(''); setWardStart(''); setWardEnd(''); setWardVacations([]);
      setFormError(null); showToast('Rotation added.');
      setAddSuccess(true);
    } catch { showToast('Failed to save rotation — please try again.', 'err'); setFormError('Failed to save rotation.'); }
  };

  const saveClinicalItem = () => {
    if (clinicalParentChoice === 'rotation') {
      if (!wardName.trim()) { setFormError('Enter a ward name.'); return; }
      if (!wardStart || !wardEnd) { setFormError('Pick start and end dates.'); return; }
      if (wardEnd < wardStart) { setFormError('End date must be after start date.'); return; }
      const name = wardName.trim();
      const morningTime = canonicalTimeRange(mornStart, mornEnd);
      const eveningTime = canonicalTimeRange(eveStart, eveEnd);
      const duplicates = isWardNameTaken(name) ? [name] : [];
      const dateOverlaps = findWardDateConflicts(wardStart, wardEnd, undefined);
      if (duplicates.length > 0 || dateOverlaps.length > 0) {
        const messages: string[] = [];
        for (const d of duplicates) messages.push(`A ward named "${d}" already exists.`);
        for (const o of dateOverlaps) messages.push(`Dates overlap with "${o.ward}" (${formatISODateDDMMYY(o.start)}–${formatISODateDDMMYY(o.end)}).`);
        setFormError(null);
        setConflictSheet({ messages, onConfirm: () => { setConflictSheet(null); commitWard(name, wardStart, wardEnd, morningTime, eveningTime, wardVacations); } });
        return;
      }
      commitWard(name, wardStart, wardEnd, morningTime, eveningTime, wardVacations);
    } else {
      if (!sgtClinicalSubject) { setFormError('Select a clinical subject or create a new one.'); return; }
      let clinicalSubjectName = sgtClinicalSubject;
      if (clinicalSubjectName === CREATE_NEW) {
        const newName = sgtName.replace(/\s*SGT\s*$/i, '').trim();
        if (!newName) { setFormError('Enter a name for the new clinical subject.'); return; }
        clinicalSubjectName = newName;
        if (allClinicalSubjects.includes(clinicalSubjectName)) { setFormError(`"${clinicalSubjectName}" already exists as a clinical subject. Please select it from the dropdown.`); return; }
      }
      const finalSgtName = sgtName.trim() || clinicalSubjectName;
      if (!finalSgtName) { setFormError('Enter an SGT subject name.'); return; }
      if (!sgtStartDate || !sgtEndDate) { setFormError('Pick placement start and end dates.'); return; }
      if (sgtEndDate < sgtStartDate) { setFormError('End date must be after start date.'); return; }
      const rp = rowProblem(sgtRows); if (rp) { setFormError(rp); return; }
      const rows = buildRowsFromForm(sgtRows);

      const existingSGTForSubject = (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects)
        .find(s => isSGTRecord(s) && (s as any).clinicalSubject === clinicalSubjectName);
      if (existingSGTForSubject) { setFormError(`"${clinicalSubjectName}" already has an SGT ("${existingSGTForSubject.name}"). Each clinical subject can only have one SGT.`); return; }
      const existingSGTNames = (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects)
        .filter(s => isSGTRecord(s))
        .map(s => s.name.toLowerCase());
      if (existingSGTNames.includes(finalSgtName.toLowerCase())) { setFormError(`An SGT subject named "${finalSgtName}" already exists.`); return; }

      const timeOverlaps: any[] = [];
      for (const r of rows) {
        for (const c of [...findSubjectTimeConflicts([r.day], r.time, undefined, 'academic'), ...findSubjectTimeConflicts([r.day], r.time, undefined, 'clinical')]) {
          if (!c.exact) timeOverlaps.push({ day: c.day, time: c.time, subjects: c.subjects });
        }
      }
      const pc = computedPlanned;
      if (pc === 0) { setFormError('No scheduled sessions found in the date range. Please check your schedules and dates.'); return; }

      const doSave = () => {
        const newSubject = {
          name: finalSgtName,
          subjectType: 'allied' as const,
          parentName: 'Small Group Teaching',
          plannedClasses: pc,
          days: rows.map(r => r.day).join(', '),
          time: rows[0]?.time || '',
          schedules: rows.map(r => ({ day: r.day, start: r.start, end: r.end })),
          startDate: sgtStartDate,
          endDate: sgtEndDate,
          clinicalSubject: clinicalSubjectName,
          vacationPeriods: sgtVacations.map(v => ({ start: v.start, end: v.end })),
        };
        if (subjectMode === 'preloaded') addUserAddedSubjects([newSubject as any]);
        else addCustomSubjects([newSubject as any]);
        recordHistory('Added SGT', { name: finalSgtName, clinicalSubject: clinicalSubjectName, planned: pc });
        setSgtClinicalSubject(''); setSgtName(''); setSgtStartDate(''); setSgtEndDate(''); setSgtRows([newRow([])]); setSgtVacations([]);
        setFormError(null); showToast(`SGT added with ${pc} planned classes.`);
        setAddSuccess(true);
      };

      if (timeOverlaps.length > 0) {
        const messages = timeOverlaps.map(t => `Time overlap on ${t.day} at ${t.time} with ${t.subjects.join(', ')}.`);
        setFormError(null);
        setConflictSheet({ messages, onConfirm: () => { setConflictSheet(null); doSave(); } });
        return;
      }
      doSave();
    }
  };

  /* ── Edit Slot ── */
  const openEditSlot = (day: number, index: number) => {
    const slot = presetTimetable[day]?.[index];
    if (!slot || !slot.subjects || slot.subjects.length === 0) { showToast('This slot has no subjects to edit.', 'info'); return; }
    const { start, end } = splitRange(slot.time);
    const subjects = slot.subjects.map(s => {
      let planned = getSubjectPlannedTotal(s);
      if (subjectMode === 'preloaded') {
        const ua = userAddedSubjects.find(u => u.name === s && !isSGTRecord(u));
        if (ua) planned = ua.plannedClasses;
      } else {
        const cs = customSubjects.find(c => c.name === s && !isSGTRecord(c));
        if (cs) planned = cs.plannedClasses;
      }
      return { name: s, planned, id: genId('sel') };
    });
    setEditSlot({ day, index, startTime: start, endTime: end, targetDay: day, subjects, multiSelectMode: subjects.length > 1 });
    setSelectedSubjects([]); setSlotMoveTargetDay(day); setSlotMoveStart(start); setSlotMoveEnd(end);
    setSlotConflict(null); setEditError(null); setShowMoveForm(false); setMoveCompleted(false); setAddSuccess(false); setSlotRemoveAllConfirm(false);
  };

  const closeEditSlot = () => { setEditSlot(null); setSelectedSubjects([]); setSlotRemove(null); setSlotRemoveConfirm(false); setSlotRemoveAllConfirm(false); setSlotConflict(null); setEditError(null); setShowMoveForm(false); setMoveCompleted(false); };
  const toggleSubjectSelection = (id: string) => setSelectedSubjects(prev => { const n = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]; setShowMoveForm(n.length > 0); return n; });
  const selectAllSubjects = () => { if (!editSlot) return; if (selectedSubjects.length === editSlot.subjects.length) { setSelectedSubjects([]); setShowMoveForm(false); } else { setSelectedSubjects(editSlot.subjects.map(s => s.id)); setShowMoveForm(true); } };

  const updateSubjectSchedule = (name: string, oldDay: number, newDay: number, oldStart: string, oldEnd: string, newStart: string, newEnd: string) => {
    const findSubject = () =>
      subjectMode === 'preloaded'
        ? userAddedSubjects.find(u => u.name.toLowerCase() === name.toLowerCase() && !isSGTRecord(u))
        : customSubjects.find(c => c.name.toLowerCase() === name.toLowerCase() && !isSGTRecord(c));
    const subject = findSubject();
    if (!subject) return;

    const existing = (subject.schedules || []) as Array<{ day: string; start: string; end: string }> ;
    let filtered = existing;
    if (oldDay >= 0) {
      const oldAbbr = DAY_ABBRS[oldDay];
      filtered = existing.filter(
        (sch: any) => !(sch.day === oldAbbr && sch.start === oldStart && sch.end === oldEnd)
      );
    }
    const newAbbr = DAY_ABBRS[newDay];
    const newEntry: any = { day: newAbbr, start: newStart, end: newEnd };
    const updated = filtered.some(
      (sch: any) => sch.day === newAbbr && sch.start === newStart && sch.end === newEnd
    )
      ? filtered
      : [...filtered, newEntry];

    if (subjectMode === 'preloaded') {
      updateUserAddedSubject(subject.id, {
        schedules: updated,
        days: updated.map((sch: any) => sch.day).join(', '),
      });
    } else {
      updateCustomSubject(subject.id, {
        schedules: updated.map((sch: any) => ({
          day: sch.day,
          time: canonicalTimeRange(sch.start, sch.end),
        })),
        days: updated.map((sch: any) => sch.day).join(', '),
      });
    }
  };

  const applyMove = (targetIds: string[], targetDay: number, time: string) => {
    if (!editSlot) return;
    const subjectsToMove = editSlot.subjects.filter(s => targetIds.includes(s.id));
    const namesToMove = subjectsToMove.map(s => s.name);
    const currentDay = editSlot.day;
    const currentIndex = editSlot.index;
    const sourceSlot = presetTimetable[currentDay]?.[currentIndex];
    if (!sourceSlot) return;

    const { start: oldStart, end: oldEnd } = splitRange(sourceSlot.time);
    const sourceSubjects = sourceSlot.subjects.filter((s: string) => !namesToMove.includes(s));

    // 1) Remove moved subjects from source slot first.
    updatePresetTimetableSlot(currentDay, currentIndex, sourceSlot.time, sourceSubjects, currentDay);

    // 2) Add moved subjects to target day/time as single-subject slots.
    namesToMove.forEach(name => addSubjectToSlot(targetDay, time, name));

    // 3) Sync schedule record in correct store.
    namesToMove.forEach(name => updateSubjectSchedule(name, currentDay, targetDay, oldStart, oldEnd, slotMoveStart, slotMoveEnd));

    const remaining = editSlot.subjects.filter(s => !targetIds.includes(s.id));
    if (remaining.length === 0) {
      setEditSlot(null);
      setMoveCompleted(true);
      showToast(`Moved ${namesToMove.length} subject(s).`);
      setAddSuccess(true);
    } else {
      setEditSlot(prev => prev ? { ...prev, subjects: remaining.map(s => ({ ...s, id: genId('sel') })), targetDay } : null);
      setSelectedSubjects([]); setShowMoveForm(false); setSlotConflict(null);
      showToast(`Moved ${namesToMove.length} subject(s).`);
      setAddSuccess(true);
    }
    recordHistory('Moved Subjects', { names: namesToMove, fromDay: currentDay, fromTime: sourceSlot.time, toDay: targetDay, toTime: time });
  };

  const doMoveSubjects = (targetIdsOverride?: string[]) => {
    if (!editSlot) return;
    const targetIds = targetIdsOverride || selectedSubjects;
    if (targetIds.length === 0) { setEditError('Select at least one subject to move.'); return; }

    const targetDay = slotMoveTargetDay;
    const time = canonicalTimeRange(slotMoveStart, slotMoveEnd);
    const sourceTime = canonicalTimeRange(editSlot.startTime, editSlot.endTime);
    const isSameDay = targetDay === editSlot.day;
    const isSameTime = time === sourceTime;

    if (isSameDay && isSameTime) {
      setEditError('Subject is already scheduled at this day and time.');
      return;
    }

    const namesToMove = editSlot.subjects
      .filter(s => targetIds.includes(s.id))
      .map(s => s.name);

    for (const name of namesToMove) {
      const alreadyScheduled = (presetTimetable[targetDay] || []).some((slot, idx) =>
        slot.type !== 'ward' &&
        slot.type !== 'ward_replacement' &&
        slot.subjects.includes(name) &&
        !(isSameDay && idx === editSlot.index)
      );
      if (alreadyScheduled) {
        setEditError(`"${name}" already has a slot on ${DAY_ABBRS[targetDay]}.`);
        return;
      }
    }

    applyMove(targetIds, targetDay, time);
  };

  const confirmSlotRemove = () => {
    if (!slotRemove) return;
    try {
      const slot = presetTimetable[slotRemove.day]?.[slotRemove.index];
      if (slot) {
        const remaining = slot.subjects.filter(s => s !== slotRemove.subject);
        updatePresetTimetableSlot(slotRemove.day, slotRemove.index, slot.time, remaining, slotRemove.day);
        const subject = subjectMode === 'preloaded'
          ? userAddedSubjects.find(u => u.name.toLowerCase() === slotRemove.subject.toLowerCase() && !isSGTRecord(u))
          : customSubjects.find(c => c.name.toLowerCase() === slotRemove.subject.toLowerCase() && !isSGTRecord(c));
        if (subject) {
          if (subjectMode === 'preloaded') {
            const schedules = (subject.schedules || []) as Array<{ day: string; start: string; end: string }>;
            const filtered = schedules.filter(s => !(s.day === DAY_ABBRS[slotRemove.day] && s.start === slotRemove.start && s.end === slotRemove.end));
            updateUserAddedSubject(subject.id, { schedules: filtered, days: filtered.map(s => s.day).join(', ') } as any);
          } else {
            const schedules = (subject.schedules || []) as Array<{ day: string; time: string }>;
            const filtered = schedules.filter(s => !((s as any).day === DAY_ABBRS[slotRemove.day] && (s as any).start === slotRemove.start && (s as any).end === slotRemove.end));
            updateCustomSubject(subject.id, { schedules: filtered, days: filtered.map(s => s.day).join(', ') });
          }
        }
        recordHistory('Removed from Slot', { subject: slotRemove.subject, day: slotRemove.day, time: slotRemove.time });
        showToast(`Removed "${slotRemove.subject}" from slot.`);
      }
    } catch { showToast('Failed to remove subject.', 'err'); }
    setSlotRemove(null); setSlotRemoveConfirm(false);
    if (editSlot) setEditSlot(prev => prev ? { ...prev, subjects: prev.subjects.filter(s => s.name !== slotRemove?.subject) } : null);
  };

  const confirmWholeSlotRemove = () => {
    if (!editSlot) return;
    try {
      const slot = presetTimetable[editSlot.day]?.[editSlot.index];
      if (slot) {
        updatePresetTimetableSlot(editSlot.day, editSlot.index, slot.time, [], editSlot.day);
        for (const s of slot.subjects) {
          const subject = subjectMode === 'preloaded'
            ? userAddedSubjects.find(u => u.name.toLowerCase() === s.toLowerCase() && !isSGTRecord(u))
            : customSubjects.find(c => c.name.toLowerCase() === s.toLowerCase() && !isSGTRecord(c));
          if (subject) {
            if (subjectMode === 'preloaded') {
              const schedules = (subject.schedules || []) as Array<{ day: string; start: string; end: string }>;
              const filtered = schedules.filter(sch => !(sch.day === DAY_ABBRS[editSlot.day] && sch.start === editSlot.startTime && sch.end === editSlot.endTime));
              updateUserAddedSubject(subject.id, { schedules: filtered, days: filtered.map(sch => sch.day).join(', ') } as any);
            } else {
              const schedules = (subject.schedules || []) as Array<{ day: string; time: string }>;
              const filtered = schedules.filter(sch => !((sch as any).day === DAY_ABBRS[editSlot.day] && (sch as any).start === editSlot.startTime && (sch as any).end === editSlot.endTime));
              updateCustomSubject(subject.id, { schedules: filtered, days: filtered.map(sch => sch.day).join(', ') });
            }
          }
        }
        recordHistory('Removed from Slot', { subject: slot.subjects.join(', '), day: editSlot.day, time: slot.time });
        showToast('Slot removed.');
        setAddSuccess(true);
      }
    } catch { showToast('Failed to remove slot.', 'err'); }
    setSlotRemoveAllConfirm(false);
    closeEditSlot();
  };

  /* ── Deletes ── */
  const requestDeleteSubject = (store: 'userAdded' | 'custom', id: string) => {
    const item = store === 'userAdded' ? userAddedSubjects.find(x => x.id === id) : customSubjects.find(x => x.id === id);
    if (!item) return;
    setDeleteSheet({
      title: `Delete "${item.name}"?`,
      lines: ['This subject and all its attendance records will be permanently removed.', 'This action cannot be undone.'],
      onConfirm: () => {
        recordHistory('Deleted Subject', { name: item.name, store, id });
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
          if (isSGTRecord(item)) {
            removeAttendanceByKey(getSGTKey(item.id));
          } else {
            for (const n of namesToPurge) removeSubjectData(n);
          }
          setDeleteSheet(null); showToast(`Deleted "${item.name}".`);
        } catch { showToast('Delete failed — please try again.', 'err'); }
      }
    });
  };

  const requestDeleteWard = (store: 'preset' | 'custom', ref: number | string) => {
    if (store === 'preset') {
      const idx = ref as number; const e = presetWardSchedule[idx]; if (!e) return;
      setDeleteSheet({
        title: `Delete rotation "${e.ward}"?`,
        lines: ['This rotation period', 'Calendar / schedule entries', 'All attendance records for this ward'],
        onConfirm: () => {
          recordHistory('Deleted Rotation', { ward: e.ward, index: idx });
          try {
            removePresetWardEntry(idx);
            if (presetWardSchedule.filter(x => x.ward === e.ward).length <= 1) removeWardData(e.ward);
            setDeleteSheet(null); showToast(`Deleted "${e.ward}".`);
          } catch { showToast('Delete failed — please try again.', 'err'); }
        }
      });
    } else {
      const w = customWards.find(x => x.id === ref); if (!w) return;
      setDeleteSheet({
        title: `Delete rotation "${w.name}"?`,
        lines: ['This rotation card', 'Calendar / schedule entries', 'All attendance records for this ward'],
        onConfirm: () => {
          recordHistory('Deleted Ward', { name: w.name, id: w.id });
          try {
            removeCustomWard(w.id);
            removeWardData(w.name);
            setDeleteSheet(null); showToast(`Deleted "${w.name}".`);
          } catch { showToast('Delete failed — please try again.', 'err'); }
        }
      });
    }
  };

  /* ── Edit Subject / Ward ── */
  const openEditSubject = (store: 'userAdded' | 'custom', id: string) => {
    const item = store === 'userAdded' ? userAddedSubjects.find(x => x.id === id) : customSubjects.find(x => x.id === id);
    if (!item) return;
    setEditError(null);

    let rows: ScheduleRow[] = [];
    if (item.schedules && item.schedules.length) {
      const first = item.schedules[0] as any;
      if ('start' in first && 'end' in first) {
        const schedules = item.schedules as Array<{ day: string; start: string; end: string }>;
        rows = schedules.map(s => ({ id: genId('row'), day: s.day, startTime: s.start || '', endTime: s.end || '' }));
      } else {
        const schedules = item.schedules as Array<{ day: string; time: string }>;
        rows = schedules.map(s => {
          const { start, end } = splitRange(s.time || '');
          return { id: genId('row'), day: s.day, startTime: start, endTime: end };
        });
      }
    } else {
      rows = parseDayList(item.days).map(d => {
        const { start, end } = splitRange(item.time);
        return { id: genId('row'), day: d, startTime: start, endTime: end };
      });
    }
    if (rows.length === 0) rows = [newRow([])];

    setEditSubject({
      store,
      id,
      originalName: item.name,
      name: item.name,
      subjectType: item.subjectType,
      parentName: getEffectiveParentName(item) || '',
      clinicalSubject: (item as any).clinicalSubject || '',
      rows,
      plannedClasses: item.plannedClasses ?? 0,
      startDate: (item as any).startDate || '',
      endDate: (item as any).endDate || '',
      vacationPeriods: ((item as any).vacationPeriods || []).map((v: any, i: number) => ({ id: `ev_${i}`, start: v.start, end: v.end })),
    });
  };

  const openEditWardPreset = (index: number) => {
    const e = presetWardSchedule[index]; if (!e) return;
    const m = splitRange(e.morningTime || '09:30 AM–11:30 AM');
    const ev = splitRange(e.eveningTime || '07:00 PM–09:00 PM');
    setEditError(null);
    setEditWard({
      store: 'preset', index, originalName: e.ward, name: e.ward,
      startDate: e.start, endDate: e.end,
      mornStart: m.start, mornEnd: m.end,
      eveStart: ev.start, eveEnd: ev.end,
      vacationPeriods: (e.vacationPeriods || []).map((v, i) => ({ id: `wv_${i}`, start: v.start, end: v.end })),
    });
  };

  const openEditWardCustom = (id: string) => {
    const w = customWards.find(x => x.id === id); if (!w) return;
    const m = splitRange(w.morningTime || '09:30 AM–11:30 AM');
    const ev = splitRange(w.eveningTime || '07:00 PM–09:00 PM');
    setEditError(null);
    setEditWard({
      store: 'custom', id, originalName: w.name, name: w.name,
      startDate: w.startDate, endDate: w.endDate,
      mornStart: m.start, mornEnd: m.end,
      eveStart: ev.start, eveEnd: ev.end,
      vacationPeriods: (w.vacationPeriods || []).map((v, i) => ({ id: `wv_${i}`, start: v.start, end: v.end })),
    });
  };

  const saveEditSubject = () => {
    if (!editSubject) return;
    if (editSubject.subjectType !== 'allied-parent') {
      const rp = rowProblem(editSubject.rows);
      if (rp) { setEditError(rp); return; }
    }
    recordHistory('Edited Subject', { old: { name: editSubject.originalName }, new: { name: editSubject.name } });
    try {
      if (editSubject.subjectType === 'allied-parent') {
        const patch = { name: editSubject.name };
        if (editSubject.store === 'userAdded') updateUserAddedSubject(editSubject.id, patch);
        else updateCustomSubject(editSubject.id, patch);
      } else {
        const rows = buildRowsFromForm(editSubject.rows);
        const isSGT = editSubject.subjectType === 'allied' && editSubject.parentName === 'Small Group Teaching';
        let plannedClasses = editSubject.plannedClasses;
        if (isSGT) {
          plannedClasses = computeSGTPlanned(editSubject.startDate || '', editSubject.endDate || '', editSubject.rows, editSubject.vacationPeriods || []);
        }

        const patch: any = {
          name: editSubject.name,
          days: rows.map(r => r.day).join(', '),
          time: rows[0]?.time || '',
          plannedClasses,
        };

        if (editSubject.store === 'userAdded') {
          patch.schedules = rows.map(r => ({ day: r.day, start: r.start, end: r.end }));
        } else {
          patch.schedules = rows.map(r => ({ day: r.day, time: r.time }));
        }

        if (isSGT) {
          patch.vacationPeriods = (editSubject.vacationPeriods || []).map(v => ({ start: v.start, end: v.end }));
        }

        if (editSubject.subjectType === 'allied' && editSubject.parentName !== 'Small Group Teaching') {
          patch.parentName = editSubject.parentName;
          patch.category = editSubject.parentName;
        } else if (isSGT) {
          patch.clinicalSubject = editSubject.clinicalSubject;
          patch.parentName = 'Small Group Teaching';
          patch.category = 'Small Group Teaching';
        }

        if (editSubject.subjectType === 'allied' && PRESET_PARENTS.includes(editSubject.parentName)) {
          patch.startDate = editSubject.startDate;
          patch.endDate = editSubject.endDate;
        }

        if (editSubject.store === 'userAdded') updateUserAddedSubject(editSubject.id, patch);
        else updateCustomSubject(editSubject.id, patch);
      }
      setEditError(null); showToast('Changes saved.'); window.setTimeout(() => setEditSubject(null), 900);
    } catch { showToast('Failed to save changes — please try again.', 'err'); setEditError('Failed to save changes.'); }
  };

  const saveEditWard = () => {
    if (!editWard) return;
    if (!editWard.name.trim()) { setEditError('Ward name cannot be empty.'); return; }
    if (!editWard.startDate || !editWard.endDate) { setEditError('Pick start and end dates.'); return; }
    if (editWard.endDate < editWard.startDate) { setEditError('End date must be after start date.'); return; }

    const dateConflicts = findWardDateConflicts(editWard.startDate, editWard.endDate, editWard.originalName);
    if (dateConflicts.length > 0) {
      setEditError(`Dates overlap with: ${dateConflicts.map(c => `"${c.ward}"`).join(', ')}. Please adjust.`);
      return;
    }
    if (editWard.name.trim().toLowerCase() !== editWard.originalName.toLowerCase() && isWardNameTaken(editWard.name, editWard.originalName)) {
      setEditError(`A ward named "${editWard.name}" already exists.`); return;
    }

    recordHistory('Edited Ward', { old: { name: editWard.originalName }, new: { name: editWard.name } });
    try {
      const morningTime = canonicalTimeRange(editWard.mornStart, editWard.mornEnd);
      const eveningTime = canonicalTimeRange(editWard.eveStart, editWard.eveEnd);
      const vacationData = (editWard.vacationPeriods || []).map(v => ({ start: v.start, end: v.end }));
      if (editWard.store === 'preset') {
        if (editWard.name.trim() !== editWard.originalName) {
          renamePresetWard(editWard.originalName, editWard.name.trim());
        }
        updatePresetWardEntry(editWard.index!, {
          start: editWard.startDate,
          end: editWard.endDate,
          morningTime,
          eveningTime,
          vacationPeriods: vacationData,
        });
      } else {
        updateCustomWard(editWard.id!, {
          name: editWard.name.trim(),
          startDate: editWard.startDate,
          endDate: editWard.endDate,
          morningTime,
          eveningTime,
          vacationPeriods: vacationData,
        });
      }
      setEditError(null); showToast('Rotation updated.'); window.setTimeout(() => setEditWard(null), 900);
    } catch { showToast('Failed to save rotation — please try again.', 'err'); setEditError('Failed to save rotation.'); }
  };

  /* ── Edit Data modal ── */
  const editDataItems = useMemo(() => {
    const presetItems: any[] = [];
    const addedItems: any[] = [];
    if (section === 'academic') {
      if (subjectMode === 'preloaded') {
        CATEGORIES.forEach(cat => cat.subjects.forEach(s => presetItems.push({ id: (s as any).id || s.name, name: s.name, store: 'preset' as const, deletable: false, planned: getSubjectPlannedTotal(s.name) })));
        INTEGRATED_SUBJECTS.forEach(s => presetItems.push({ id: (s as any).id || s.name, name: s.name, store: 'preset' as const, deletable: false, planned: getSubjectPlannedTotal(s.name) }));
        userAddedSubjects.filter(s => !isSGTRecord(s)).forEach(s => addedItems.push({ id: s.id, name: s.name, store: 'userAdded' as const, deletable: true, planned: s.plannedClasses }));
      } else {
        customSubjects.filter(s => !isSGTRecord(s)).forEach(s => addedItems.push({ id: s.id, name: s.name, store: 'custom' as const, deletable: true, planned: s.plannedClasses }));
      }
    } else {
      if (subjectMode === 'preloaded') {
        const seenWards = new Set<string>();
        WARD_SUBJECTS.forEach(w => { seenWards.add(w.name); presetItems.push({ id: `ward:${w.name}`, name: w.name, store: 'preset-ward' as const, deletable: false, planned: getPresetWardTotalPlanned(w.name) }); });
        presetWardSchedule.forEach(e => { if (!seenWards.has(e.ward)) { seenWards.add(e.ward); presetItems.push({ id: `ward:${e.ward}`, name: e.ward, store: 'preset-ward' as const, deletable: false, planned: getPresetWardTotalPlanned(e.ward) }); } });
        userAddedSubjects.filter(s => isSGTRecord(s)).forEach(s => addedItems.push({ id: s.id, name: s.name, store: 'sgt' as const, deletable: true, planned: s.plannedClasses }));
      } else {
        customWards.forEach(w => addedItems.push({ id: w.id, name: w.name, store: 'custom-ward' as const, deletable: true, planned: getCustomWardTotalPlanned(w.startDate, w.endDate, w.vacationPeriods) }));
        customSubjects.filter(s => isSGTRecord(s)).forEach(s => addedItems.push({ id: s.id, name: s.name, store: 'sgt' as const, deletable: true, planned: s.plannedClasses }));
      }
    }
    return { presetItems, addedItems };
  }, [section, subjectMode, customSubjects, customWards, userAddedSubjects, presetWardSchedule, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned]);

  const handleEditDataPlannedChange = (item: any, value: number) => {
    try {
      if (item.store === 'preset') {
        updatePresetSubjectTotal(item.name, value);
        recordHistory('Edited Planned', { name: item.name, planned: value });
      } else if (item.store === 'userAdded') {
        const subj = userAddedSubjects.find(s => s.id === item.id);
        if (subj) {
          updateUserAddedSubject(item.id, { plannedClasses: value });
          recordHistory('Edited Planned', { name: subj.name, planned: value });
        }
      } else if (item.store === 'custom') {
        const subj = customSubjects.find(s => s.id === item.id);
        if (subj) {
          updateCustomSubject(item.id, { plannedClasses: value });
          recordHistory('Edited Planned', { name: subj.name, planned: value });
        }
      }
      showToast('Planned classes updated.', 'ok');
    } catch {
      showToast('Failed to update planned classes.', 'err');
    }
  };

  const handleDeleteFromEditData = (item: any) => {
    if (item.store === 'userAdded') {
      requestDeleteSubject('userAdded', item.id);
    } else if (item.store === 'custom') {
      requestDeleteSubject('custom', item.id);
    } else if (item.store === 'sgt') {
      const sgt = (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects).find(s => s.id === item.id);
      if (sgt) requestDeleteSubject(subjectMode === 'preloaded' ? 'userAdded' : 'custom', sgt.id);
    } else if (item.store === 'custom-ward') {
      requestDeleteWard('custom', item.id);
    }
  };

  /* ── Import / Export ── */
  const is12h = (t: string) => /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(t);
  const is24h = (t: string) => /^\d{1,2}:\d{2}$/.test(t);

  const bundleJson = () => {
    const added = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const bundle = {
      version: BUNDLE_VERSION,
      subjectMode,
      addedSubjects: added.map(s => ({
        id: s.id,
        name: s.name,
        type: s.subjectType,
        parentCategory: getEffectiveParentName(s) ?? null,
        planned: s.plannedClasses,
        schedules: (s.schedules && s.schedules.length)
          ? s.schedules
          : parseDayList(s.days).map((d: string) => { const { start, end } = splitRange(s.time); return { day: d, start, end }; }),
        clinicalSubject: (s as any).clinicalSubject || undefined,
        startDate: (s as any).startDate || undefined,
        endDate: (s as any).endDate || undefined,
        vacationPeriods: (s as any).vacationPeriods || undefined,
      })),
      customWards: customWards.map(w => ({
        id: w.id,
        name: w.name,
        startDate: w.startDate,
        endDate: w.endDate,
        morningTime: w.morningTime,
        eveningTime: w.eveningTime,
        vacationPeriods: w.vacationPeriods || undefined,
      })),
      presetTimetable,
      presetWardSchedule,
      presetSubjectTotals,
    };
    return JSON.stringify(bundle, null, 2);
  };

  const doDownload = () => {
    try {
      const blob = new Blob([bundleJson()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendenz-routine-${formatISODateDDMMYY(new Date().toISOString()).replace(/\//g, '-')}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast('Routine bundle downloaded.');
    } catch { showToast('Download failed — please try again.', 'err'); }
  };
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(bundleJson()); showToast('Bundle copied to clipboard.'); }
    catch { showToast('Copy failed — use Download instead.', 'err'); }
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
      try { await navigator.clipboard.writeText(json); showToast('Share unavailable — bundle copied instead.', 'info'); }
      catch { showToast('Share failed — use Download.', 'err'); }
    }
  };

  const copyAIPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      showToast('AI prompt copied! Paste it to your AI assistant.', 'info');
    } catch {
      showToast('Failed to copy prompt.', 'err');
    }
  };

  const validateBundle = (obj: any): { ok: boolean; error?: string; bundle?: ImportBundle } => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'Not a JSON object.' };
    const b = obj as ImportBundle;
    if (b.subjectMode !== 'preloaded' && b.subjectMode !== 'custom') return { ok: false, error: 'Missing/invalid "subjectMode".' };
    if (!Array.isArray(b.addedSubjects) && !Array.isArray(b.customWards) && !b.presetTimetable && !b.presetWardSchedule) return { ok: false, error: 'Bundle has no routine data.' };
    if (b.addedSubjects && !Array.isArray(b.addedSubjects)) return { ok: false, error: '"addedSubjects" must be an array.' };
    for (const s of b.addedSubjects || []) {
      if (!s || typeof s.name !== 'string' || !s.name.trim()) return { ok: false, error: 'Every added subject needs a "name".' };
      for (const sch of s.schedules || []) {
        if (!(is24h(sch.start || '') || is12h(sch.start || '')) || !(is24h(sch.end || '') || is12h(sch.end || ''))) {
          return { ok: false, error: `Subject "${s.name}": schedules need valid start/end times.` };
        }
      }
    }
    if (b.customWards && !Array.isArray(b.customWards)) return { ok: false, error: '"customWards" must be an array.' };
    return { ok: true, bundle: b };
  };

  const normTimeTo12 = (t: string): string => {
    if (is12h(t)) return t;
    const minutes = parseRangeToMinutes(`${t}–${t}`)?.start || 0;
    const hours = Math.floor(minutes / 60);
    const mins = String(minutes % 60).padStart(2, '0');
    return to12h(`${hours}:${mins}`);
  };

  const buildReport = (b: ImportBundle): ImportReport => {
    const subjectsSkip: string[] = []; let subjectsAdd = 0;
    for (const s of b.addedSubjects || []) {
      const domain = s.parentCategory === 'Small Group Teaching' ? 'clinical' as const : 'academic' as const;
      if (isSubjectNameTaken(s.name, undefined, domain)) { subjectsSkip.push(`${s.name} (duplicate name)`); continue; }
      const rows = (s.schedules || []).map(sch => ({
        day: sch.day,
        time: canonicalTimeRange(normTimeTo12(sch.start || '09:00'), normTimeTo12(sch.end || '10:00')),
      }));
      if (rows.some(r => findSubjectTimeConflicts([r.day], r.time, undefined, domain).some(c => !c.exact))) {
        subjectsSkip.push(`${s.name} (time overlap)`);
        continue;
      }
      subjectsAdd++;
    }
    const wardsSkip: string[] = []; let wardsAdd = 0;
    for (const w of b.customWards || []) {
      if (isWardNameTaken(w.name)) { wardsSkip.push(`${w.name} (duplicate name)`); continue; }
      if (findWardDateConflicts(w.startDate, w.endDate, undefined).length) { wardsSkip.push(`${w.name} (date overlap)`); continue; }
      wardsAdd++;
    }
    const slots: number = Object.values(b.presetTimetable || {}).reduce<number>((acc: number, day: any) => {
      if (!Array.isArray(day)) return acc;
      return acc + day.filter((slot: any) => slot.type !== 'ward' && slot.type !== 'ward_replacement').length;
    }, 0);
    return { subjectsAdd, subjectsSkip, wardsAdd, wardsSkip, slots, rotations: (b.presetWardSchedule || []).length };
  };

  const beginImport = (raw: string, source: 'file' | 'paste') => {
    let parsed: any;
    try {
      const normalized = raw.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      try {
        parsed = JSON.parse(normalized);
      } catch {
        const start = normalized.indexOf('{');
        const end = normalized.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('no-json');
        parsed = JSON.parse(normalized.slice(start, end + 1));
      }
    } catch {
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
    setPasteError(null); setImportError(null); setPasteOpen(false); setImportOpen(false);
    setPreview({ bundle: v.bundle, report: buildReport(v.bundle) });
    showToast('Bundle valid — review the preview.', 'info');
  };

  const applyMerge = () => {
    if (!preview) return;
    try {
      snapshotBeforeEdit('Merge Routine Import');
      const b = preview.bundle;
      const items: any[] = [];
      for (const s of b.addedSubjects || []) {
        const domain = s.parentCategory === 'Small Group Teaching' ? 'clinical' as const : 'academic' as const;
        if (isSubjectNameTaken(s.name, undefined, domain)) continue;
        const rows = (s.schedules || []).map(sch => {
          const st = normTimeTo12(sch.start || '09:00');
          const en = normTimeTo12(sch.end || '10:00');
          return { day: sch.day, time: canonicalTimeRange(st, en), start: st, end: en };
        });
        if (!rows.length) rows.push({ day: 'Mon', time: canonicalTimeRange('09:00 AM', '10:00 AM'), start: '09:00 AM', end: '10:00 AM' });
        if (rows.some(r => findSubjectTimeConflicts([r.day], r.time, undefined, domain).some(c => !c.exact))) continue;
        items.push({
          name: s.name,
          subjectType: (s.type as any) || 'single',
          parentName: s.parentCategory || undefined,
          plannedClasses: s.planned ?? 0,
          rows,
          clinicalSubject: s.clinicalSubject,
          startDate: s.startDate,
          endDate: s.endDate,
          vacationPeriods: s.vacationPeriods,
        });
      }
      let wardsAdded = 0;
      for (const w of b.customWards || []) {
        if (isWardNameTaken(w.name)) continue;
        if (findWardDateConflicts(w.startDate, w.endDate, undefined).length) continue;
        const mt = canonicalizeTimeRange(w.morningTime || '09:30 AM–11:30 AM');
        const et = canonicalizeTimeRange(w.eveningTime || '07:00 PM–09:00 PM');
        if (subjectMode === 'preloaded') addPresetWardEntry({ start: w.startDate, end: w.endDate, ward: w.name, morningTime: mt, eveningTime: et, addedByUser: true, vacationPeriods: w.vacationPeriods });
        else addCustomWards([{ name: w.name, startDate: w.startDate, endDate: w.endDate, morningTime: mt, eveningTime: et, vacationPeriods: w.vacationPeriods }]);
        wardsAdded++;
      }
      let rotationsAdded = 0;
      for (const e of b.presetWardSchedule || []) {
        if (!e || e.addedByUser !== true) continue;
        if (presetWardSchedule.some(x => x.ward.toLowerCase() === String(e.ward).toLowerCase() && x.start === e.start && x.end === e.end)) continue;
        if (findWardDateConflicts(e.start, e.end, undefined).length) continue;
        const mt = canonicalizeTimeRange(e.morningTime || '09:30 AM–11:30 AM');
        const et = canonicalizeTimeRange(e.eveningTime || '07:00 PM–09:00 PM');
        if (subjectMode === 'preloaded') addPresetWardEntry({ start: e.start, end: e.end, ward: e.ward, morningTime: mt, eveningTime: et, addedByUser: true, vacationPeriods: e.vacationPeriods });
        else addCustomWards([{ name: e.ward, startDate: e.start, endDate: e.end, morningTime: mt, eveningTime: et, vacationPeriods: e.vacationPeriods }]);
        rotationsAdded++;
      }
      if (b.presetTimetable) {
        Object.entries(b.presetTimetable).forEach(([dayStr, slots]) => {
          const day = parseInt(dayStr, 10);
          if (isNaN(day) || !Array.isArray(slots)) return;
          for (const slot of slots as any[]) {
            if (!slot || !slot.subjects || slot.subjects.length === 0) continue;
            if (slot.type === 'ward' || slot.type === 'ward_replacement') continue;
            const time = canonicalizeTimeRange(slot.time);
            const existingIdx = (presetTimetable[day] || []).findIndex(s => canonicalizeTimeRange(s.time) === time);
            if (existingIdx >= 0) {
              const merged = Array.from(new Set([...(presetTimetable[day][existingIdx].subjects || []), ...slot.subjects]));
              updatePresetTimetableSlot(day, existingIdx, time, merged, day);
            } else {
              slot.subjects.forEach((n: string) => addSubjectToSlot(day, time, n));
            }
          }
        });
      }
      if (items.length) commitSubjects(items);
      recordHistory('Imported (Merge)', { subjects: items.length, rotations: wardsAdded + rotationsAdded });
      setPreview(null);
      const total = items.length + wardsAdded + rotationsAdded;
      if (total === 0) showToast('Nothing new to merge (duplicates or preset-only data). Use Replace to adopt the bundle.', 'info');
      else showToast(`Merged ${items.length} subject(s), ${wardsAdded + rotationsAdded} rotation(s).`);
    } catch { showToast('Merge failed — please try again.', 'err'); }
  };

  const applyReplace = () => {
    if (!preview) return;
    const b = preview.bundle;
    recordHistory('Imported (Replace)', { mode: b.subjectMode });
    snapshotBeforeEdit('Replace Routine Import');

    const existingStore = b.subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const existingByNameDomain = new Map<string, any>();
    const existingById = new Map<string, any>();
    for (const ex of existingStore) {
      const isSGT = isSGTRecord(ex);
      const key = `${ex.name.trim().toLowerCase()}|${isSGT ? 'sgt' : 'academic'}`;
      existingByNameDomain.set(key, ex);
      if (ex.id) existingById.set(ex.id, ex);
    }

    const incomingSubjectRecords = b.addedSubjects || [];
    const incomingSubjectIds = new Set(incomingSubjectRecords.map((x: any) => typeof x.id === 'string' ? x.id : '').filter(Boolean));
    const incomingSubjectNames = new Set(incomingSubjectRecords.map((x: any) => `${String(x.name || '').trim().toLowerCase()}|${x.parentCategory === 'Small Group Teaching' ? 'sgt' : 'academic'}`));
    const incomingWardNames = new Set([
      ...(b.customWards || []).map((x: any) => String(x.name || '').trim().toLowerCase()),
      ...(b.presetWardSchedule || []).filter((x: any) => x?.addedByUser === true).map((x: any) => String(x.ward || '').trim().toLowerCase()),
    ]);
    const omittedEntities: Array<{ key: string; type: 'subject' | 'ward'; legacyKey?: string }> = [];
    for (const oldSubject of existingStore) {
      const kind = isSGTRecord(oldSubject) ? 'sgt' : 'academic';
      const identity = `${oldSubject.name.trim().toLowerCase()}|${kind}`;
      if ((oldSubject.id && incomingSubjectIds.has(oldSubject.id)) || incomingSubjectNames.has(identity)) continue;
      const key = kind === 'sgt' ? getSGTKey(oldSubject.id) : getAcademicAttendanceKey(oldSubject.id || oldSubject.name);
      omittedEntities.push({ key, type: 'subject', legacyKey: oldSubject.name });
    }
    for (const oldWard of b.subjectMode === 'preloaded' ? presetWardSchedule.filter((x: any) => x.addedByUser === true) : customWards) {
      const name = String('ward' in oldWard ? oldWard.ward : oldWard.name).trim();
      if (!name || incomingWardNames.has(name.toLowerCase())) continue;
      const id = (oldWard as any).id;
      omittedEntities.push({ key: getWardAttendanceKey(id || name), type: 'ward', legacyKey: `ward-${name}` });
    }
    removeAttendanceEntitiesForMode(b.subjectMode || 'preloaded', omittedEntities);

    const toSubjectRecord = (s: any) => {
      const schedules = (s.schedules || []).map((sch: any) => {
        const st = normTimeTo12(sch.start || '09:00');
        const en = normTimeTo12(sch.end || '10:00');
        return { day: sch.day, start: st, end: en };
      });

      const isSGT = s.parentCategory === 'Small Group Teaching';
      const domainKey = `${s.name.trim().toLowerCase()}|${isSGT ? 'sgt' : 'academic'}`;
      const existing = (typeof s.id === 'string' && existingById.get(s.id)) || existingByNameDomain.get(domainKey);
      const id = existing?.id || (typeof s.id === 'string' && s.id.trim() ? s.id : genId(b.subjectMode === 'preloaded' ? 'ua' : 'cs'));

      return {
        id,
        name: s.name,
        subjectType: s.type || 'single',
        parentName: s.parentCategory || undefined,
        category: s.parentCategory || undefined,
        plannedClasses: s.planned ?? 0,
        days: schedules.map((x: any) => x.day).join(', '),
        time: schedules.length ? canonicalTimeRange(schedules[0].start, schedules[0].end) : '',
        schedules: b.subjectMode === 'preloaded'
          ? schedules
          : schedules.map((x: any) => ({ day: x.day, time: canonicalTimeRange(x.start, x.end) })),
        clinicalSubject: s.clinicalSubject,
        startDate: s.startDate,
        endDate: s.endDate,
        vacationPeriods: s.vacationPeriods,
      };
    };

    const records = (b.addedSubjects || []).map(toSubjectRecord);

    if (b.presetTimetable) {
      localStorage.setItem('att_preset_timetable', JSON.stringify(b.presetTimetable));
      storageSetItem('att_preset_timetable', JSON.stringify(b.presetTimetable));
    }
    if (b.presetWardSchedule) {
      const ws = (b.presetWardSchedule || []).map((e: any) => ({
        ...e,
        morningTime: canonicalizeTimeRange(e.morningTime || '09:30 AM–11:30 AM'),
        eveningTime: canonicalizeTimeRange(e.eveningTime || '07:00 PM–09:00 PM'),
      }));
      localStorage.setItem('att_preset_ward_schedule', JSON.stringify(ws));
      storageSetItem('att_preset_ward_schedule', JSON.stringify(ws));
    }
    if (b.presetSubjectTotals) {
      localStorage.setItem('att_preset_subject_totals', JSON.stringify(b.presetSubjectTotals));
      storageSetItem('att_preset_subject_totals', JSON.stringify(b.presetSubjectTotals));
    }

    if (b.subjectMode === 'custom') {
      localStorage.removeItem('att_user_added_subjects');
      storageRemoveItem('att_user_added_subjects');
      localStorage.setItem('att_custom_subjects', JSON.stringify(records));
      storageSetItem('att_custom_subjects', JSON.stringify(records));

      const existingWards = new Map(customWards.map(w => [w.name.trim().toLowerCase(), w]));
      const cw = (b.customWards || []).map((w: any, i: number) => ({
        ...w,
        id: typeof w.id === 'string' && w.id.trim()
          ? w.id
          : existingWards.get(w.name.trim().toLowerCase())?.id || `cw_imp_${Date.now()}_${i}`,
        morningTime: canonicalizeTimeRange(w.morningTime || '09:30 AM–11:30 AM'),
        eveningTime: canonicalizeTimeRange(w.eveningTime || '07:00 PM–09:00 PM'),
      }));
      localStorage.setItem('att_custom_wards', JSON.stringify(cw));
      storageSetItem('att_custom_wards', JSON.stringify(cw));
    } else {
      localStorage.removeItem('att_custom_subjects');
      storageRemoveItem('att_custom_subjects');
      localStorage.removeItem('att_custom_wards');
      storageRemoveItem('att_custom_wards');
      localStorage.setItem('att_user_added_subjects', JSON.stringify(records));
      storageSetItem('att_user_added_subjects', JSON.stringify(records));
    }

    localStorage.setItem('att_subject_mode', b.subjectMode || 'preloaded');
    storageSetItem('att_subject_mode', b.subjectMode || 'preloaded');
    setPreview(null);
    showToast('Routine replaced — reloading…');
    setLocation('/');
    setTimeout(() => window.location.reload(), 900);
  };

  const renderRowList = (
    rows: ScheduleRow[],
    onUpdate: (id: string, patch: Partial<ScheduleRow>) => void,
    onRemove: (id: string) => void
  ) => (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5">
          <select
            value={r.day}
            onChange={e => onUpdate(r.id, { day: e.target.value })}
            className={cn(inputCls, 'h-9 w-full min-w-0 text-center text-xs px-1.5')}
          >
            {DAY_ABBRS.map(d => (
              <option key={d} value={d} disabled={d !== r.day && rows.some(o => o.id !== r.id && o.day === d)}>
                {d}
              </option>
            ))}
          </select>
          <TimeField value={r.startTime} onChange={v => onUpdate(r.id, { startTime: v })} ariaLabel="start" />
          <TimeField value={r.endTime} onChange={v => onUpdate(r.id, { endTime: v })} ariaLabel="end" />
          <button type="button" onClick={() => onRemove(r.id)} className="shrink-0 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer">Remove</button>
        </div>
      ))}
    </div>
  );

  // Academic slots for selected day (original indices)
  const academicSlotsForDay = useMemo(() => {
    if (subjectMode === 'preloaded') {
      return (presetTimetable[selDay] || [])
        .map((slot, idx) => ({ slot, idx }))
        .filter(({ slot }) => slot.type !== 'ward' && slot.type !== 'ward_replacement' && slot.subjects.length > 0 && slot.subjects.some(isAcademicSubject));
    } else {
      return customSubjects
        .filter(s => s.subjectType !== 'allied-parent' && !isSGTRecord(s) && parseDayList(s.days).includes(DAY_ABBRS[selDay]))
        .map(s => ({ slot: { subjects: [s.name], time: s.time, schedules: s.schedules }, idx: -1, customSubject: s }));
    }
  }, [subjectMode, selDay, presetTimetable, customSubjects, isAcademicSubject]);

  // Group slots by identical time for common container
  const groupedAcademicSlots = useMemo(() => {
    const groups: Record<string, Array<{ slot: any; idx: number; customSubject?: any }>> = {};
    for (const item of academicSlotsForDay) {
      const timeKey = canonicalizeTimeRange(item.slot.time);
      if (!groups[timeKey]) groups[timeKey] = [];
      groups[timeKey].push(item);
    }
    return Object.entries(groups).map(([time, items]) => ({ time, items }));
  }, [academicSlotsForDay]);

  return (
    <Layout
      headerRight={
        <button type="button" onClick={() => setHistoryOpen(true)} className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:from-primary/30 hover:to-primary/20 transition-all active:scale-95 cursor-pointer shadow-sm" title="Recent Activity">
          <SendToBack className="w-4 h-4" />
        </button>
      }
    >
      <div className="space-y-2 pb-24 scroll-reachability">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setExportOpen(true)} className="h-10 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-500/20 transition-all cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Export
          </button>
          <button type="button" onClick={() => { setImportError(null); setImportOpen(true); }} className="h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/20 transition-all cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Import
          </button>
        </div>

        <div className="sticky top-[var(--app-header-height)] z-30">
          <div className="-mx-4 bg-background px-4 py-1.5 shadow-sm border-y border-border/40 soft-entry-boundary">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => section === 'academic' ? toggleControls() : setSection('academic')}
              className={cn('h-10 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                section === 'academic' ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/20 text-muted-foreground border-border hover:bg-muted/40')}>
              <GraduationCap className="w-3.5 h-3.5" /> Academic Section
            </button>
            <button type="button" onClick={() => section === 'clinical' ? toggleControls() : setSection('clinical')}
              className={cn('h-10 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                section === 'clinical' ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/20 text-muted-foreground border-border hover:bg-muted/40')}>
              <Stethoscope className="w-3.5 h-3.5" /> Clinical Section
            </button>
          </div>
          <div className={cn('grid grid-cols-2 gap-2 overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out', controlsExpanded ? 'mt-1 max-h-12 opacity-100' : 'mt-0 max-h-0 opacity-0 pointer-events-none')}>
            <button type="button" onClick={() => { setFormError(null); setMoreOpen(true); }} className="h-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-amber-500/20 transition-all cursor-pointer px-2 text-center leading-tight">
              {section === 'academic' ? 'Add New (Academic)' : 'Add New (Clinical)'}
            </button>
            <button type="button" onClick={() => { setEditDataOpen(true); setEditDataTab('preset'); setExpandedEditItemId(null); }} className="h-10 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-violet-500/20 transition-all cursor-pointer px-2 text-center leading-tight">
              {section === 'academic' ? 'Edit Academic Data' : 'Edit Clinical Data'}
            </button>
          </div>
        </div>

        <section
          style={{ '--manage-top-stack-height': controlsExpanded ? '7.125rem' : '4.25rem' } as React.CSSProperties}
          className="-mx-1 mt-1 max-h-[calc(100dvh-var(--app-header-height)-var(--manage-top-stack-height)-var(--app-bottom-nav-height)-var(--app-bottom-nav-offset))] bg-card border border-border rounded-2xl p-3 shadow-sm space-y-2.5 flex min-h-0 flex-col overflow-hidden soft-entry-boundary">
          {section === 'academic' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 bg-background/60 border border-border/50 rounded-xl p-1 flex justify-between gap-1">
                {DAY_ABBRS.map((d, i) => (
                  <button key={d} type="button" onClick={() => setSelDay(i)}
                    className={cn('flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border',
                      selDay === i ? 'text-primary border-primary/60 bg-primary/10' : 'text-muted-foreground border-transparent bg-background/40 hover:bg-muted/30')}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="shrink-0 flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary">{DAY_ABBRS[selDay]}'s Academic Schedule</h3>
                <span className="text-xs text-muted-foreground font-semibold">{academicSlotsForDay.length} Slots</span>
              </div>

              <div ref={section === 'academic' ? academicScrollRef : undefined} onScroll={section === 'academic' ? (e) => setAddModalScrolled(e.currentTarget.scrollTop > 8) : undefined} className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-1.5 pr-1 pb-1" style={{ overscrollBehaviorY: 'contain' }}>
              {groupedAcademicSlots.length === 0 ? (
                <div className="flex items-center justify-center min-h-[160px] bg-background/40 border border-dashed border-border rounded-xl">
                  <p className="text-sm font-semibold text-muted-foreground">No planned Lecture Classes for today!</p>
                </div>
              ) : (
                groupedAcademicSlots.map((group) => (
                  <div key={group.time} className="relative pt-1.5">
                    <span className="sticky top-0 z-10 -mx-1 block w-[calc(100%+0.5rem)] border-y border-border/40 bg-card px-2 py-1 text-center text-xs font-bold text-primary whitespace-nowrap shadow-sm soft-entry-boundary soft-entry-boundary--inner">
                      {group.time}
                    </span>
                    <div className="space-y-2">
                      {group.items.map(({ slot, idx, customSubject }) => {
                        if (customSubject) {
                          const s = customSubject;
                          const rows = s.schedules?.filter((sch: any) => sch.day === DAY_ABBRS[selDay]) || [];
                          return rows.map((_: any, i: number) => (
                            <div key={`${s.id}-${i}`} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="font-extrabold text-foreground text-sm leading-tight truncate" style={{ color: getSubjectColor(s.name) }}>{s.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{s.name}: {s.plannedClasses} planned{getEffectiveParentName(s) ? ` · under ${getEffectiveParentName(s)}` : ''}</p>
                              </div>
                              <button type="button" onClick={() => openEditSubject('custom', s.id)} className="action-button action-button--edit shrink-0">Edit</button>
                              <button type="button" onClick={() => requestDeleteSubject('custom', s.id)} className="action-button action-button--danger shrink-0">Delete</button>
                            </div>
                          ));
                        }
                        const academicSubjects = slot.subjects.filter((s: string) => isAcademicSubject(s));
                        const displayNames = academicSubjects.map((s: string) => getPresetSubjectDisplayName(s));
                        return (
                          <div key={`${selDay}-${idx}`} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="font-extrabold text-foreground text-sm leading-tight truncate" style={{ color: getSubjectColor(displayNames[0] || '') }}>
                                {displayNames.join(', ')}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {academicSubjects.map((s: string, index: number) => `${displayNames[index]}: ${getSubjectPlannedTotal(resolvePresetOriginalName(s))} planned`).join(' · ')}
                              </p>
                              {academicSubjects.some((s: string) => userAddedSubjects.some(u => u.name === s && !isSGTRecord(u))) && <div className="mt-1"><AddedBadge /></div>}
                            </div>
                            <button
                              type="button"
                              onClick={() => openEditSlot(selDay, idx)}
                              className="action-button action-button--edit shrink-0"
                            >
                              Edit
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={openAddSlot}
                className="w-full py-2 rounded-xl border border-dashed border-border text-xs font-semibold text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Slot
              </button>
              </div>
            </div>
          )}

          {section === 'clinical' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-2 pr-1 pb-2" style={{ overscrollBehaviorY: 'contain' }}>
                {allClinicalSubjects.map(name => {
                  const group = { rotation: getRotationForSubject(name), sgt: getSGTForSubject(name) };
                  return (
                    <ClinicalGroupCard
                      key={name}
                      name={getPresetWardDisplayName(name)}
                      hasRotation={!!group.rotation}
                      hasSGT={!!group.sgt}
                      rotation={group.rotation}
                      sgt={group.sgt}
                      onAddRotation={() => { setClinicalParentChoice('rotation'); setWardName(name); setMoreOpen(true); }}
                      onAddSGT={() => { setClinicalParentChoice('sgt'); setSgtClinicalSubject(name); setSgtName(name); setMoreOpen(true); }}
                      onEditRotation={() => { if (group.rotation!.store === 'preset') openEditWardPreset(group.rotation!.index!); else openEditWardCustom(group.rotation!.id!); }}
                      onEditSGT={() => { openEditSubject(getSGTStore(group.sgt), group.sgt!.id); }}
                      onDeleteRotation={() => { if (group.rotation!.store === 'preset') requestDeleteWard('preset', group.rotation!.index!); else requestDeleteWard('custom', group.rotation!.id!); }}
                      onDeleteSGT={() => { requestDeleteSubject(getSGTStore(group.sgt), group.sgt!.id); }}
                      canDeleteRotation={group.rotation ? group.rotation.store !== 'preset' : false}
                    />
                  );
                })}
                {allClinicalSubjects.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-5">No clinical subjects found. Add a rotation or SGT to get started.</p>
                )}
              </div>
            </div>
          )}
        </section>
        </div>
        {/* Add New Modal */}
        <OverlayModal
          open={moreOpen}
          onClose={() => { setMoreOpen(false); setFormError(null); setAddSuccess(false); }}
          maxW="max-w-lg"
          heightClass="!max-h-[80dvh]"
          dense
          bodyClassName={section === 'academic' ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto'}
          header={
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">{section === 'academic' ? 'Add New Subject' : 'Add New Clinical Item'}</h3>
                <button type="button" onClick={() => { setMoreOpen(false); setFormError(null); }} className="action-button action-button--neutral action-button--icon"><X className="w-4 h-4" /></button>
              </div>

              {/* Static type selector */}
              {section === 'academic' ? (
                <div className="mt-3">
                  <label className={labelCls}>Subject kind</label>
                  <div className="flex rounded-xl border border-border overflow-hidden">
                    {(['single', 'allied'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setSubjectType(t)}
                        className={cn('flex-1 px-3 py-2 text-xs font-bold capitalize transition-all cursor-pointer',
                          subjectType === t ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <label className={labelCls}>Type</label>
                  <div className="flex rounded-xl border border-border overflow-hidden">
                    <button type="button" onClick={() => setClinicalParentChoice('rotation')}
                      className={cn('flex-1 px-3 py-2 text-xs font-bold capitalize transition-all cursor-pointer',
                        clinicalParentChoice === 'rotation' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
                      Clinical Rotation
                    </button>
                    <button type="button" onClick={() => setClinicalParentChoice('sgt')}
                      className={cn('flex-1 px-3 py-2 text-xs font-bold capitalize transition-all cursor-pointer',
                        clinicalParentChoice === 'sgt' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
                      Small Group Teaching
                    </button>
                  </div>
                </div>
              )}
            </div>
          }
          footer={
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
                  <button type="button" onClick={() => { const fn = conflictSheet.onConfirm; setConflictSheet(null); fn(); }} className="action-button action-button--warning flex-1">Add anyway</button>
                </div>
              </div>
            ) : section === 'academic' ? (
              isAllied ? (
                <div className="flex gap-2">
                  <button type="button" onClick={addStagedChild} className={cn(btnGhost, 'flex-1 flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add child</button>
                  <button type="button" onClick={saveSubject} className={cn(btnSave, 'flex-1')}>Save</button>
                </div>
              ) : (
                <button type="button" onClick={saveSubject} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add Subject</button>
              )
            ) : clinicalParentChoice === 'rotation' ? (
              <button type="button" onClick={saveClinicalItem} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add Rotation</button>
            ) : (
              <button type="button" onClick={saveClinicalItem} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add SGT</button>
            )
          }
        >
                    <div className="p-2.5 sm:p-3 space-y-1.5 flex flex-1 flex-col min-h-0">
            <div className="shrink-0">
              <Note note={note} />
              {formError && <p className={inlineErrCls}>{formError}</p>}
            </div>
            {section === 'academic' ? (
              <>
                {isAllied && (
                  <div>
                    <label className={labelCls}>Parent</label>
                    <p className={cn(descCls, 'transition-all duration-200 ease-out', addModalScrolled ? 'max-h-0 opacity-0 overflow-hidden mb-0' : 'max-h-8 opacity-100')}>Select an existing parent or create a new one.</p>
                    <select value={parentChoice} onChange={e => setParentChoice(e.target.value)} className={inputCls}>
                      <option value="">Select parent…</option>
                      <optgroup label="Parents">{academicParentOptions.map(p => <option key={p} value={p}>{p}</option>)}</optgroup>
                      <optgroup label="Single Subjects (can become parent)">{groupedParents.singles.map(p => <option key={p} value={p}>{p}</option>)}</optgroup>
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
                  <p className={cn(descCls, 'transition-all duration-200 ease-out', addModalScrolled ? 'max-h-0 opacity-0 overflow-hidden mb-0' : 'max-h-8 opacity-100')}>Enter a clear subject name.</p>
                  <input value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="e.g. Cardiology" inputMode="text" className={inputCls} />
                </div>

                                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3 pr-1" style={{ overscrollBehaviorY: 'contain' }}>
                  <div>
                    <label className={labelCls}>Day & Time</label>
                    {renderRowList(subjectRows, updateSubjectRow, removeSubjectRow)}
                    <button type="button" onClick={addSubjectRow} disabled={subjectRows.length >= 7} className={cn(btnGhost, 'w-full mt-2 flex items-center justify-center gap-1.5')}>
                      <Plus className="w-3.5 h-3.5" /> Add another day & time
                    </button>
                  </div>
                  <div>
                    <label className={labelCls}>Planned classes</label>
                    <p className={descCls}>Total classes planned for this subject.</p>
                    <input type="number" inputMode="numeric" min={0} value={planned} onChange={e => setPlanned(e.target.value)} placeholder="e.g. 40" className={inputCls} />
                  </div>

                {isAllied && parentIsSGT && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className={labelCls}>Placement start</label><p className={descCls}>Placement period start date.</p><input type="date" value={childStart} onChange={e => setChildStart(e.target.value)} className={cn(inputCls, 'text-center')} /></div>
                    <div><label className={labelCls}>Placement end</label><p className={descCls}>Placement period end date.</p><input type="date" value={childEnd} onChange={e => setChildEnd(e.target.value)} className={cn(inputCls, 'text-center')} /></div>
                  </div>
                )}

                {isAllied && stagedChildren.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Children ready to save</p>
                    {stagedChildren.map((c, i) => (
                      <div key={`${c.name}-${i}`} className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-xl px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.rows.map(r => `${r.day} ${canonicalTimeRange(r.startTime, r.endTime)}`).join(' · ')} · {c.plannedClasses} planned
                          </p>
                        </div>
                        <button type="button" onClick={() => setStagedChildren(prev => prev.filter((_, j) => j !== i))} className="action-button action-button--danger action-button--icon" aria-label="Delete item"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </>
            ) : (
              <>
                {clinicalParentChoice === 'rotation' ? (
                  <>
                    <div>
                      <label className={labelCls}>Ward name</label>
                      <p className={descCls}>Name of the clinical rotation ward.</p>
                      <input value={wardName} onChange={e => setWardName(e.target.value)} placeholder="e.g. Internal Medicine" inputMode="text" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div><label className={labelCls}>Start date</label><p className={descCls}>Rotation start date.</p><input type="date" value={wardStart} onChange={e => setWardStart(e.target.value)} className={cn(inputCls, 'text-center')} /></div>
                      <div><label className={labelCls}>End date</label><p className={descCls}>Rotation end date.</p><input type="date" value={wardEnd} onChange={e => setWardEnd(e.target.value)} className={cn(inputCls, 'text-center')} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1.5"><label className={labelCls}>Morning</label><p className={descCls}>Morning ward session time.</p><TimeField value={mornStart} onChange={setMornStart} ariaLabel="morning start" /><TimeField value={mornEnd} onChange={setMornEnd} ariaLabel="morning end" /></div>
                      <div className="space-y-1.5"><label className={labelCls}>Evening</label><p className={descCls}>Evening ward session time.</p><TimeField value={eveStart} onChange={setEveStart} ariaLabel="evening start" /><TimeField value={eveEnd} onChange={setEveEnd} ariaLabel="evening end" /></div>
                    </div>
                    <VacationEditor vacations={wardVacations} onChange={setWardVacations} />
                    {wardStart && wardEnd && wardEnd >= wardStart && (
                      <div className="bg-muted/30 p-2.5 rounded-xl flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Planned (auto)</span>
                        <span className="text-xs font-extrabold text-foreground">
                          {subjectMode === 'preloaded'
                            ? getPresetWardTotalPlanned(wardName)
                            : getCustomWardTotalPlanned(wardStart, wardEnd, wardVacations.map(v => ({ start: v.start, end: v.end })))}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className={labelCls}>Clinical Subject</label>
                      <p className={descCls}>Select the ward this SGT belongs to.</p>
                      <select value={sgtClinicalSubject} onChange={e => {
                        const val = e.target.value;
                        setSgtClinicalSubject(val);
                        if (val && val !== CREATE_NEW) setSgtName(val); else setSgtName('');
                      }} className={inputCls}>
                        <option value="">Select clinical subject…</option>
                        {clinicalSubjectOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>SGT Name</label>
                      <p className={descCls}>Name for the Small Group Teaching subject.</p>
                      <input value={sgtName} onChange={e => setSgtName(e.target.value)} placeholder="e.g. Surgery" inputMode="text" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div><label className={labelCls}>Placement start</label><p className={descCls}>SGT placement start date.</p><input type="date" value={sgtStartDate} onChange={e => setSgtStartDate(e.target.value)} className={cn(inputCls, 'text-center')} /></div>
                      <div><label className={labelCls}>Placement end</label><p className={descCls}>SGT placement end date.</p><input type="date" value={sgtEndDate} onChange={e => setSgtEndDate(e.target.value)} className={cn(inputCls, 'text-center')} /></div>
                    </div>
                    <div>
                      <label className={labelCls}>Schedules (Day + Time)</label>
                      <p className={descCls}>Add weekly SGT class days and times.</p>
                      {renderRowList(sgtRows, updateSgtRow, removeSgtRow)}
                      <button type="button" onClick={addSgtRow} disabled={sgtRows.length >= 7} className={cn(btnGhost, 'w-full mt-2 flex items-center justify-center gap-1.5')}>
                        <Plus className="w-3.5 h-3.5" /> Add another day & time
                      </button>
                    </div>
                    <VacationEditor vacations={sgtVacations} onChange={setSgtVacations} />
                    <div>
                      <label className={labelCls}>Planned classes (auto-calculated)</label>
                      <div className="text-sm font-bold text-primary bg-muted/30 p-2 rounded-lg border border-border/50">
                        {computedPlanned} classes from schedules
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </OverlayModal>

        {/* Edit Data Modal */}
        <OverlayModal
          open={editDataOpen}
          onClose={() => { setEditDataOpen(false); setExpandedEditItemId(null); setDraftPlanned(null); }}
          maxW="max-w-2xl"
          heightClass=""
          header={
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Edit {section === 'academic' ? 'Academic' : 'Clinical'} Data</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {section === 'clinical' ? 'Planned for clinical items are auto-calculated and cannot be edited.' : 'Edit planned classes or delete user-added items.'}
                  </p>
                </div>
                <button type="button" onClick={() => { setEditDataOpen(false); setExpandedEditItemId(null); setDraftPlanned(null); }} className="action-button action-button--neutral action-button--icon"><X className="w-4 h-4" /></button>
              </div>

              {/* Fixed tabs */}
              <div className="mt-3 flex rounded-xl border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setEditDataTab('preset'); setExpandedEditItemId(null); }}
                  className={cn('flex-1 px-3 py-2 text-xs font-bold transition-all cursor-pointer',
                    editDataTab === 'preset' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
                >
                  Preset
                </button>
                <button
                  type="button"
                  onClick={() => { setEditDataTab('added'); setExpandedEditItemId(null); }}
                  className={cn('flex-1 px-3 py-2 text-xs font-bold transition-all cursor-pointer',
                    editDataTab === 'added' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
                >
                  Added
                </button>
              </div>
            </div>
          }
        >
          <div className="p-4 sm:p-5 space-y-4">
            {editDataTab === 'preset' ? (
              <div className="space-y-2">
                {editDataItems.presetItems.length === 0 ? (
                  <div className="flex items-center justify-center h-full min-h-[200px]">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground font-medium">No Preset Item</p>
                      <p className="text-xs text-muted-foreground mt-1">Preset items are built-in and cannot be added manually.</p>
                    </div>
                  </div>
                ) : (
                  editDataItems.presetItems.map(item => {
                    const isExpanded = expandedEditItemId === item.id;
                    const isAuto = item.store === 'preset-ward' || item.store === 'custom-ward' || item.store === 'sgt' || section === 'clinical';
                    return (
                      <div key={item.id} className="bg-background border border-border/60 rounded-xl overflow-hidden">
                        <div
                          className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => {
                            if (isAuto) return;
                            if (isExpanded) { setExpandedEditItemId(null); setDraftPlanned(null); }
                            else { setExpandedEditItemId(item.id); setDraftPlanned(item.planned); }
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate" style={{ color: getSubjectColor(item.name) }}>{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.store === 'preset-ward' || item.store === 'custom-ward' || item.store === 'sgt'
                                ? `Auto-calculated · Planned: ${item.planned}`
                                : `Planned: ${item.planned}`}
                            </p>
                          </div>
                          {!isAuto && <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />}
                        </div>
                        {isExpanded && !isAuto && (
                          <div className="p-2.5 border-t border-border/40 bg-muted/10 space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="w-1/2 text-[10px] font-semibold text-muted-foreground uppercase">Total Planned Classes</label>
                              <input
                                type="number"
                                min={0}
                                value={draftPlanned ?? item.planned}
                                onChange={e => setDraftPlanned(parseInt(e.target.value, 10) || 0)}
                                className={cn(inputCls, 'w-1/2')}
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { if (draftPlanned !== null) handleEditDataPlannedChange(item, draftPlanned); }}
                                className={cn(btnSave, 'flex-1')}
                              >Save</button>
                              <button
                                type="button"
                                onClick={() => { setExpandedEditItemId(null); setDraftPlanned(null); }}
                                className={cn(btnGhost, 'flex-1')}
                              >Discard</button>
                            </div>
                            {note && <Note note={note} />}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {editDataItems.addedItems.length === 0 ? (
                  <div className="flex items-center justify-center h-full min-h-[200px]">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground font-medium">No Added Item</p>
                      <p className="text-xs text-muted-foreground mt-1">Add New Item to Edit its Data</p>
                    </div>
                  </div>
                ) : (
                  editDataItems.addedItems.map(item => {
                    const isExpanded = expandedEditItemId === item.id;
                    const isAuto = item.store === 'sgt' || item.store === 'custom-ward' || section === 'clinical';
                    return (
                      <div key={item.id} className="bg-background border border-border/60 rounded-xl overflow-hidden">
                        <div
                          className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => {
                            if (isAuto) return;
                            if (isExpanded) { setExpandedEditItemId(null); setDraftPlanned(null); }
                            else { setExpandedEditItemId(item.id); setDraftPlanned(item.planned); }
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate" style={{ color: getSubjectColor(item.name) }}>{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.store === 'sgt' || item.store === 'custom-ward'
                                ? `Auto-calculated · Planned: ${item.planned}`
                                : `Added by you · Planned: ${item.planned}`}
                            </p>
                          </div>
                          {!isAuto && <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />}
                          {item.deletable && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteFromEditData(item); }}
                              className="ml-2 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {isExpanded && !isAuto && (
                          <div className="p-2.5 border-t border-border/40 bg-muted/10 space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="w-1/2 text-[10px] font-semibold text-muted-foreground uppercase">Total Planned Classes</label>
                              <input
                                type="number"
                                min={0}
                                value={draftPlanned ?? item.planned}
                                onChange={e => setDraftPlanned(parseInt(e.target.value, 10) || 0)}
                                className={cn(inputCls, 'w-1/2')}
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { if (draftPlanned !== null) handleEditDataPlannedChange(item, draftPlanned); }}
                                className={cn(btnSave, 'flex-1')}
                              >Save</button>
                              <button
                                type="button"
                                onClick={() => { setExpandedEditItemId(null); setDraftPlanned(null); }}
                                className={cn(btnGhost, 'flex-1')}
                              >Discard</button>
                            </div>
                            {note && <Note note={note} />}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </OverlayModal>

        {/* Add Slot Modal */}
        <OverlayModal
          open={addSlotOpen}
          onClose={() => { setAddSlotOpen(false); setFormError(null); setAddSuccess(false); }}
          maxW="max-w-sm"
          header={
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Add Slot</h3>
              <button type="button" onClick={() => { setAddSlotOpen(false); setFormError(null); }} className="action-button action-button--neutral action-button--icon"><X className="w-4 h-4" /></button>
            </div>
          }
          footer={
            <button type="button" onClick={saveAddSlot} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> Add Slot
            </button>
          }
        >
          <div className="p-4 sm:p-5 space-y-3.5">
            <Note note={note} />
            {formError && <p className={inlineErrCls}>{formError}</p>}
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className={labelCls}>Start</label><TimeField value={addSlotStart} onChange={setAddSlotStart} ariaLabel="start" /></div>
              <div><label className={labelCls}>End</label><TimeField value={addSlotEnd} onChange={setAddSlotEnd} ariaLabel="end" /></div>
            </div>
            <div>
              <label className={labelCls}>Subject</label>
              <select value={addSlotSubject} onChange={e => {
                const name = e.target.value;
                setAddSlotSubject(name);
                const subj = subjectMode === 'preloaded'
                  ? [...CATEGORIES.flatMap(c => c.subjects), ...INTEGRATED_SUBJECTS, ...userAddedSubjects].find(s => s.name === name)
                  : customSubjects.find(s => s.name === name);
                setAddSlotPlanned(subj ? (subj as any).plannedClasses ?? getSubjectPlannedTotal(name) : getSubjectPlannedTotal(name));
              }} className={inputCls}>
                <option value="">Select academic subject…</option>
                {academicAddSlotSubjects.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="bg-muted/30 p-2.5 rounded-xl flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Planned</span>
              <span className="text-xs font-extrabold text-foreground">{addSlotPlanned}</span>
            </div>
          </div>
        </OverlayModal>

        {/* History Modal */}
        <OverlayModal open={historyOpen} onClose={() => setHistoryOpen(false)} maxW="max-w-md">
          <div className="p-4 sm:p-5 space-y-3.5 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Recent Activity</h3>
              <button type="button" onClick={() => setHistoryOpen(false)} className="action-button action-button--neutral action-button--icon"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2">
              {historyEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-5">No manage actions yet.</p>
              ) : (
                historyEntries.map(entry => (
                  <div key={entry.id} className="bg-background border border-border/60 rounded-xl p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{entry.type}</p>
                        {entry.data?.section && (
                          <span className={cn('text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0', entry.data.section === 'academic' ? 'bg-primary/10 text-primary' : 'bg-violet-500/10 text-violet-400')}>{entry.data.section}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground shrink-0">{new Date(entry.timestamp).toLocaleString()}</p>
                    </div>
                    {formatHistoryDetail(entry) && <p className="text-[10px] text-muted-foreground mt-0.5">{formatHistoryDetail(entry)}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </OverlayModal>

        {/* Edit Subject Modal */}
        <OverlayModal
          open={!!editSubject}
          onClose={() => { setEditSubject(null); setEditError(null); }}
          maxW="max-w-lg"
          header={
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Edit Subject</h3>
                <button type="button" onClick={() => { setEditSubject(null); setEditError(null); }} className="action-button action-button--neutral action-button--icon"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Change schedule or parent. Rename is disabled.</p>
            </>
          }
          footer={
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setEditSubject(null); setEditError(null); }} className={btnGhost}>Cancel</button>
              <button type="button" onClick={saveEditSubject} className={btnPrimary}>Save changes</button>
            </div>
          }
        >
          {editSubject && (
            <div className="p-4 sm:p-5 space-y-3.5">
              <Note note={note} />
              {editError && <p className={inlineErrCls}>{editError}</p>}
              <div className="bg-muted/30 p-2.5 rounded-xl">
                <p className="text-xs font-bold text-foreground">{editSubject.name}</p>
              </div>
              {editSubject.subjectType === 'allied' && editSubject.parentName === 'Small Group Teaching' ? (
                <div>
                  <label className={labelCls}>Clinical Subject</label>
                  <select value={editSubject.clinicalSubject || ''} onChange={e => setEditSubject({ ...editSubject, clinicalSubject: e.target.value })} className={inputCls}>
                    {allClinicalSubjects.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              ) : editSubject.subjectType === 'allied' ? (
                <div>
                  <label className={labelCls}>Parent</label>
                  <select value={editSubject.parentName} onChange={e => setEditSubject({ ...editSubject, parentName: e.target.value })} className={inputCls}>
                    {!academicParentOptions.includes(editSubject.parentName) && !groupedParents.parents.includes(editSubject.parentName) && !groupedParents.singles.includes(editSubject.parentName) && editSubject.parentName && <option value={editSubject.parentName}>{editSubject.parentName}</option>}
                    <optgroup label="Parents">{groupedParents.parents.map(p => <option key={p} value={p}>{p}</option>)}</optgroup>
                    <optgroup label="Subjects (becomes parent)">{groupedParents.singles.map(p => <option key={p} value={p}>{p}</option>)}</optgroup>
                  </select>
                </div>
              ) : null}
              {editSubject.subjectType === 'allied' && PRESET_PARENTS.includes(editSubject.parentName) && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div><label className={labelCls}>Placement start</label><input type="date" value={editSubject.startDate || ''} onChange={e => setEditSubject({ ...editSubject, startDate: e.target.value })} className={cn(inputCls, 'text-center')} /></div>
                  <div><label className={labelCls}>Placement end</label><input type="date" value={editSubject.endDate || ''} onChange={e => setEditSubject({ ...editSubject, endDate: e.target.value })} className={cn(inputCls, 'text-center')} /></div>
                </div>
              )}
              {editSubject.subjectType === 'allied' && editSubject.parentName === 'Small Group Teaching' && (
                <VacationEditor
                  vacations={(editSubject as any).vacationPeriods?.length ? (editSubject as any).vacationPeriods.map((v: any, i: number) => ({ id: `ev_${i}`, ...v })) : []}
                  onChange={(v) => setEditSubject({ ...editSubject, vacationPeriods: v.map(x => ({ start: x.start, end: x.end })) } as any)}
                />
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
                  <div className="bg-muted/30 p-2.5 rounded-xl flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Planned (read-only)</span>
                    <span className="text-xs font-extrabold text-foreground">{editSubject.plannedClasses}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </OverlayModal>

        {/* Edit Ward Modal */}
        <OverlayModal
          open={!!editWard}
          onClose={() => { setEditWard(null); setEditError(null); }}
          maxW="max-w-lg"
          header={
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Edit Rotation</h3>
                <button type="button" onClick={() => { setEditWard(null); setEditError(null); }} className="action-button action-button--neutral action-button--icon"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Change dates, session times, or vacations. Rename is disabled.</p>
            </>
          }
          footer={
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setEditWard(null); setEditError(null); }} className={btnGhost}>Cancel</button>
              <button type="button" onClick={saveEditWard} className={btnPrimary}>Save changes</button>
            </div>
          }
        >
          {editWard && (
            <div className="p-4 sm:p-5 space-y-3.5">
              <Note note={note} />
              {editError && <p className={inlineErrCls}>{editError}</p>}
              <div className="bg-muted/30 p-2.5 rounded-xl">
                <p className="text-xs font-bold text-foreground">{editWard.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={labelCls}>Start date</label><input type="date" value={editWard.startDate} onChange={e => setEditWard({ ...editWard, startDate: e.target.value })} className={cn(inputCls, 'text-center')} /></div>
                <div><label className={labelCls}>End date</label><input type="date" value={editWard.endDate} onChange={e => setEditWard({ ...editWard, endDate: e.target.value })} className={cn(inputCls, 'text-center')} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5"><label className={labelCls}>Morning</label><TimeField value={editWard.mornStart} onChange={v => setEditWard({ ...editWard, mornStart: v })} ariaLabel="morning start" /><TimeField value={editWard.mornEnd} onChange={v => setEditWard({ ...editWard, mornEnd: v })} ariaLabel="morning end" /></div>
                <div className="space-y-1.5"><label className={labelCls}>Evening</label><TimeField value={editWard.eveStart} onChange={v => setEditWard({ ...editWard, eveStart: v })} ariaLabel="evening start" /><TimeField value={editWard.eveEnd} onChange={v => setEditWard({ ...editWard, eveEnd: v })} ariaLabel="evening end" /></div>
              </div>
              <VacationEditor vacations={editWard.vacationPeriods || []} onChange={(v) => setEditWard({ ...editWard, vacationPeriods: v.map(x => ({ start: x.start, end: x.end })) } as any)} />
            </div>
          )}
        </OverlayModal>

        {/* Edit Slot Modal */}
        <OverlayModal
          open={!!editSlot}
          onClose={closeEditSlot}
          maxW="max-w-lg"
          header={editSlot ? (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Edit Slot</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {editSlot.multiSelectMode ? 'Select subject cards you want to reallocate/re-slot.' : 'Change time or day.'}
                </p>
              </div>
              <button type="button" onClick={closeEditSlot} className="action-button action-button--neutral action-button--icon"><X className="w-4 h-4" /></button>
            </div>
          ) : undefined}
          footer={
            !editSlot ? undefined :
            moveCompleted ? (
              <div className="flex gap-2">
                <button type="button" onClick={closeEditSlot} className={cn(btnPrimary, 'flex-1')}>Close</button>
              </div>
            ) : slotConflict ? (
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setSlotRemoveAllConfirm(true)} className={cn(btnDanger, 'w-full')}>Remove Slot</button>
                <button type="button" onClick={() => setSlotConflict(null)} className={cn(btnGhost, 'w-full')}>Cancel</button>
                <button type="button" onClick={() => { const fn = slotConflict.onConfirm; setSlotConflict(null); fn(); }} className={cn(btnPrimary, 'w-full')}>Merge anyway</button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setSlotRemoveAllConfirm(true)} className={cn(btnDanger, 'w-full flex items-center justify-center gap-1.5')}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove Slot
                </button>
                <button type="button" onClick={closeEditSlot} className={cn(btnGhost, 'w-full')}>Cancel</button>
                {editSlot.multiSelectMode ? (
                  <button type="button" onClick={() => doMoveSubjects()} disabled={!showMoveForm} className={cn(btnPrimary, 'w-full', !showMoveForm && 'opacity-50 cursor-not-allowed')}>Move Selected</button>
                ) : (
                  <button type="button" onClick={() => { if (editSlot) doMoveSubjects([editSlot.subjects[0].id]); }} className={cn(btnPrimary, 'w-full')}>Apply</button>
                )}
              </div>
            )
          }
        >
          {editSlot && (
            <div className="p-4 sm:p-5 space-y-3.5">
              <Note note={note} />
              {editError && <p className={inlineErrCls}>{editError}</p>}
              {moveCompleted ? (
                <div className="text-center py-8">
                  <Check className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-foreground">Slot moved successfully.</p>
                </div>
              ) : slotConflict ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p className="text-xs font-bold">Conflict detected:</p>
                  </div>
                  {slotConflict.messages.map((m, i) => (
                    <p key={i} className="text-[11px] text-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{m}</p>
                  ))}
                </div>
              ) : editSlot.multiSelectMode ? (
                <>
                  <div>
                    <label className={labelCls}>Subjects in this slot</label>
                    <div className="space-y-2">
                      {editSlot.subjects.map(s => (
                        <div key={s.id} className={cn(
                          'flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer transition-all',
                          selectedSubjects.includes(s.id) ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-background/50 hover:bg-muted/20'
                        )} onClick={() => toggleSubjectSelection(s.id)}>
                          <span className="text-xs font-bold flex-1" style={{ color: getSubjectColor(s.name) }}>{s.name}</span>
                          <span className="text-[10px] text-muted-foreground">Planned: {s.planned}</span>
                          <button type="button" onClick={(e) => {
                            e.stopPropagation();
                            setSlotRemove({ subject: s.name, day: editSlot.day, index: editSlot.index, time: canonicalTimeRange(editSlot.startTime, editSlot.endTime), start: editSlot.startTime, end: editSlot.endTime });
                            setSlotRemoveConfirm(true);
                          }} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" checked={selectedSubjects.length === editSlot.subjects.length} onChange={selectAllSubjects} className="w-4 h-4 rounded border-primary/60 text-primary accent-primary focus:ring-primary/20 focus:ring-2 focus:ring-offset-0 transition-all cursor-pointer" />
                      <label className="text-[10px] font-medium text-muted-foreground">Select All</label>
                    </div>
                  </div>
                  {showMoveForm && selectedSubjects.length > 0 && (
                    <div className="border-t border-border/40 pt-3 mt-3 space-y-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Move selected subjects</p>
                      <div>
                        <label className={labelCls}>Target Day</label>
                        <select value={slotMoveTargetDay} onChange={e => setSlotMoveTargetDay(parseInt(e.target.value, 10))} className={cn(inputCls, 'text-center')}>
                          {DAY_ABBRS.map((abbr, i) => <option key={abbr} value={i}>{abbr}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div><label className={labelCls}>Start</label><TimeField value={slotMoveStart} onChange={setSlotMoveStart} ariaLabel="move start" /></div>
                        <div><label className={labelCls}>End</label><TimeField value={slotMoveEnd} onChange={setSlotMoveEnd} ariaLabel="move end" /></div>
                      </div>
                      {selectedSubjects.map(id => {
                        const sub = editSlot.subjects.find(s => s.id === id);
                        if (!sub) return null;
                        return (
                          <div key={id} className="flex items-center gap-2">
                            <span className="text-xs font-bold flex-1" style={{ color: getSubjectColor(sub.name) }}>{sub.name}</span>
                            <span className="text-[10px] text-muted-foreground">Planned: {sub.planned} (read-only)</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground bg-muted/20 rounded-lg px-3 py-1.5">
                    Currently: <span className="font-semibold text-foreground">{DAY_ABBRS[editSlot.day]} {canonicalTimeRange(editSlot.startTime, editSlot.endTime)}</span>
                  </p>
                  <div>
                    <label className={labelCls}>Target Day</label>
                    <select value={slotMoveTargetDay} onChange={e => setSlotMoveTargetDay(parseInt(e.target.value, 10))} className={inputCls}>
                      {DAY_ABBRS.map((abbr, i) => <option key={abbr} value={i}>{abbr}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className={labelCls}>Start</label><TimeField value={slotMoveStart} onChange={setSlotMoveStart} ariaLabel="move start" /></div>
                    <div><label className={labelCls}>End</label><TimeField value={slotMoveEnd} onChange={setSlotMoveEnd} ariaLabel="move end" /></div>
                  </div>
                  <div className="bg-muted/30 p-2 rounded-lg">
                    <span className="text-xs font-bold" style={{ color: getSubjectColor(editSlot.subjects[0].name) }}>{editSlot.subjects[0].name}</span>
                    <p className="text-[10px] text-muted-foreground mt-1">Planned: {editSlot.subjects[0].planned} (read-only — edit in Edit Data)</p>
                  </div>
                </>
              )}
            </div>
          )}
        </OverlayModal>

        {/* Slot Remove Confirm Modal */}
        <OverlayModal open={slotRemoveConfirm} onClose={() => { setSlotRemoveConfirm(false); setSlotRemove(null); }}>
          {slotRemove && (
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Remove from slot?</h3>
                  <p className="text-xs text-muted-foreground">"{slotRemove.subject}" will be removed from the {DAY_ABBRS[slotRemove.day]} {slotRemove.time} slot.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setSlotRemoveConfirm(false); setSlotRemove(null); }} className={cn(btnGhost, 'flex-1')}>Cancel</button>
                <button type="button" onClick={confirmSlotRemove} className="action-button action-button--warning flex-1">Remove</button>
              </div>
            </div>
          )}
        </OverlayModal>

        {/* Whole Slot Remove Confirm Modal */}
        <OverlayModal open={slotRemoveAllConfirm} onClose={() => setSlotRemoveAllConfirm(false)}>
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-rose-500" /></div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Remove this slot?</h3>
                <p className="text-xs text-muted-foreground">All subjects in this time slot will be removed.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSlotRemoveAllConfirm(false)} className={cn(btnGhost, 'flex-1')}>Cancel</button>
              <button type="button" onClick={confirmWholeSlotRemove} className="action-button action-button--danger flex-1">Remove Slot</button>
            </div>
          </div>
        </OverlayModal>

        {/* Delete Confirm Modal */}
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
                {deleteSheet.lines.map((l, i) => <li key={i} className="text-xs text-foreground bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{l}</li>)}
              </ul>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDeleteSheet(null)} className={cn(btnGhost, 'flex-1')}>Cancel</button>
                <button type="button" onClick={() => deleteSheet.onConfirm()} className="action-button action-button--danger flex-1">Delete</button>
              </div>
            </div>
          )}
        </OverlayModal>

        {/* Conflict Sheet Modal */}
        <OverlayModal open={!!conflictSheet} onClose={() => setConflictSheet(null)}>
          {conflictSheet && (
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Conflict Detected</h3>
                  <p className="text-[10px] text-muted-foreground">Review the issues before proceeding.</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {conflictSheet.messages.map((m, i) => <li key={i} className="text-xs text-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{m}</li>)}
              </ul>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConflictSheet(null)} className={cn(btnGhost, 'flex-1')}>Change details</button>
                <button type="button" onClick={() => { const fn = conflictSheet.onConfirm; setConflictSheet(null); fn(); }} className="action-button action-button--warning flex-1">Add anyway</button>
              </div>
            </div>
          )}
        </OverlayModal>

        {/* Export Modal */}
        <OverlayModal open={exportOpen} onClose={() => setExportOpen(false)}>
          <div className="p-4 sm:p-5 space-y-2.5">
            <h3 className="text-sm font-bold text-foreground">Export Routine</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Bundle contains routine data only — never attendance.</p>
            <Note note={note} />
            <button type="button" onClick={doShare} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-2')}><Share2 className="w-4 h-4" /> Share…</button>
            <button type="button" onClick={doDownload} className={cn(btnGhost, 'w-full flex items-center justify-center gap-2')}><Download className="w-4 h-4" /> Download .json</button>
            <button type="button" onClick={doCopy} className={cn(btnGhost, 'w-full flex items-center justify-center gap-2')}><Copy className="w-4 h-4" /> Copy to Clipboard</button>
          </div>
        </OverlayModal>

        {/* Import Modal */}
        <OverlayModal open={importOpen} onClose={() => { setImportOpen(false); setImportError(null); }}>
          <div className="p-4 sm:p-5 space-y-2.5">
            <h3 className="text-sm font-bold text-foreground">Import Routine</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Load a routine bundle from a file or pasted JSON. Attendance is never imported.</p>
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
            <button type="button" onClick={copyAIPrompt} className={cn(btnGhost, 'w-full flex items-center justify-center gap-2')}><Copy className="w-4 h-4" /> Copy AI Prompt</button>
          </div>
        </OverlayModal>

        {/* Paste JSON Modal */}
        <OverlayModal open={pasteOpen} onClose={() => { setPasteOpen(false); setPasteText(''); setPasteError(null); }} maxW="max-w-lg">
          <div className="p-4 sm:p-5 space-y-2.5">
            <h3 className="text-sm font-bold text-foreground">Paste Bundle JSON</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Paste the bundle text from another device, then validate.</p>
            {pasteError && <p className={inlineErrCls}>{pasteError}</p>}
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8} className={cn(inputCls, 'h-auto font-mono text-[10px] py-2')} placeholder='{"version":2,"subjectMode":…}' />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setPasteOpen(false); setPasteText(''); setPasteError(null); }} className={cn(btnGhost, 'flex-1')}>Cancel</button>
              <button type="button" onClick={() => beginImport(pasteText, 'paste')} className={cn(btnPrimary, 'flex-1')}>Validate & Preview</button>
            </div>
          </div>
        </OverlayModal>

        {/* Import Preview Modal */}
        <OverlayModal open={!!preview} onClose={() => setPreview(null)} maxW="max-w-lg">
          {preview && (
            <div className="p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-bold text-foreground">Import Preview</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Review exactly what will be added or skipped before anything changes.</p>
              <Note note={note} />
              <div className="bg-muted/30 border border-border/50 rounded-xl p-3 text-xs text-foreground space-y-1">
                <p>Mode: <strong>{preview.bundle.subjectMode}</strong> · Subjects to add: <strong>{preview.report.subjectsAdd}</strong> · Rotations to add: <strong>{preview.report.wardsAdd}</strong></p>
                <p>Preset slots in bundle: <strong>{preview.report.slots}</strong> · Preset rotations: <strong>{preview.report.rotations}</strong></p>
              </div>
              {(preview.report.subjectsSkip.length > 0 || preview.report.wardsSkip.length > 0) && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Skipped (duplicates / overlaps)</p>
                  {[...preview.report.subjectsSkip, ...preview.report.wardsSkip].map((s, i) => <p key={i} className="text-[11px] text-foreground">• {s}</p>)}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={applyMerge} className={cn(btnPrimary, 'flex-1')}>Merge</button>
                <button type="button" onClick={() => setReplaceConfirm(true)} className="action-button action-button--danger flex-1">Replace</button>
              </div>
            </div>
          )}
        </OverlayModal>

        {/* Replace Confirm Modal */}
        <OverlayModal open={replaceConfirm} onClose={() => setReplaceConfirm(false)}>
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-rose-500" /></div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Replace everything?</h3>
                <p className="text-xs text-muted-foreground">This wipes your current routine and adopts the bundle. A snapshot is taken first.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setReplaceConfirm(false)} className={cn(btnGhost, 'flex-1')}>Cancel</button>
              <button type="button" onClick={() => { setReplaceConfirm(false); applyReplace(); }} className="action-button action-button--danger flex-1">Yes, Replace</button>
            </div>
          </div>
        </OverlayModal>
      </div>
    </Layout>
  );
}