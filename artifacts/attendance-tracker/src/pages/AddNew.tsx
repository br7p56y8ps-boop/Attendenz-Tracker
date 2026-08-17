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
import { useAttendance, getSGTKey } from '@/contexts/AttendanceContext';
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
import { storageSetItem } from '@/lib/idb';
import { PRESET_PARENTS, CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';
import {
  Plus, Trash2, Pencil, X, AlertTriangle, ArrowRightLeft,
  GraduationCap, Stethoscope, Download, Upload, Copy, Share2, FileText,
  Check, ChevronDown, ChevronRight, Edit2, SendToBack,
} from 'lucide-react';

/* ── Shared styles ── */
const inputCls =
  'w-full h-10 bg-background border border-border rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40';
const btnPrimary =
  'px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
  'px-4 py-2 rounded-xl bg-muted/40 text-foreground font-bold text-xs border border-border hover:bg-muted transition-all cursor-pointer';
const btnDanger =
  'px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs hover:opacity-90 transition-all cursor-pointer';
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

function OverlayModal({ open, onClose, children, maxW = 'max-w-md', header, footer }: {
  open: boolean; onClose: () => void; children: React.ReactNode; maxW?: string;
  header?: React.ReactNode; footer?: React.ReactNode;
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className={cn('relative bg-card border border-border rounded-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden', maxW)}
        onClick={e => e.stopPropagation()}
      >
        {header && <div className="shrink-0 px-4 sm:px-5 pt-4 sm:pt-5">{header}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 px-4 sm:px-5 pb-4 sm:pb-5 pt-3 border-t border-border/40">{footer}</div>}
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

interface ScheduleRow { id: string; day: string; startTime: string; endTime: string; }
interface StagedChild { name: string; rows: ScheduleRow[]; plannedClasses: number; startDate?: string; endDate?: string; }
interface EditSubjectState {
  store: 'userAdded' | 'custom'; id: string; originalName: string; name: string;
  subjectType: 'single' | 'allied' | 'allied-parent'; parentName: string;
  clinicalSubject?: string;
  rows: ScheduleRow[]; plannedClasses: number; startDate?: string; endDate?: string;
}
interface EditWardState {
  store: 'preset' | 'custom'; index?: number; id?: string;
  originalName: string; name: string; startDate: string; endDate: string;
  mornStart: string; mornEnd: string; eveStart: string; eveEnd: string;
}
interface EditSlotState {
  day: number; index: number; startTime: string; endTime: string; targetDay: number;
  subjects: Array<{ name: string; planned: number; id: string }>;
  multiSelectMode: boolean;
}
interface ImportBundle {
  version?: number; subjectMode?: 'preloaded' | 'custom';
  addedSubjects?: Array<{
    name: string; type?: string; parentCategory?: string | null; planned?: number;
    schedules?: Array<{ day: string; start: string; end: string }>;
    clinicalSubject?: string; startDate?: string; endDate?: string;
  }>;
  customWards?: Array<{ name: string; startDate: string; endDate: string; morningTime?: string; eveningTime?: string }>;
  presetTimetable?: any; presetWardSchedule?: any; presetSubjectTotals?: Record<string, number>;
}
interface ImportReport { subjectsAdd: number; subjectsSkip: string[]; wardsAdd: number; wardsSkip: string[]; slots: number; rotations: number; }

const newRow = (usedDays: string[]): ScheduleRow => {
  const day = DAY_ABBRS.find(d => !usedDays.includes(d)) || 'Mon';
  return { id: genId('row'), day, startTime: '09:00 AM', endTime: '10:00 AM' };
};

/*  Human-readable history details */
const formatHistoryDetail = (entry: any): string => {
  const d = entry.data;
  if (!d) return '';
  switch (entry.type) {
    case 'Move Subjects':
      return `${(d.names || []).join(', ')} · ${DAY_ABBRS[d.fromDay] || '?'} ${d.fromTime || ''} → ${DAY_ABBRS[d.toDay] || '?'} ${d.toTime || ''}`;
    case 'Rename':
      return `"${d.old}" → "${d.new}"`;
    case 'Add Slot':
      return `${d.subject} · ${DAY_ABBRS[d.day] || '?'} ${d.time || ''}`;
    case 'Remove from Slot':
      return `${d.subject} · ${DAY_ABBRS[d.day] || '?'} ${d.time || ''}`;
    case 'Delete Subject':
      return d.name || '';
    case 'Delete Ward':
    case 'Delete Rotation':
      return d.ward || d.name || '';
    case 'Edit Subject':
      return d.new?.name || d.old?.name || '';
    case 'Edit Ward':
      return d.new?.name || d.old?.name || '';
    case 'Change Parent':
      return `→ ${d.newParent || 'Single'}`;
    case 'Change Clinical Subject':
      return `${d.name || ''}: ${d.from || '—'} → ${d.to || ''}`;
    case 'Add Subject':
      return (d.names || []).join(', ');
    case 'Add Rotation':
      return `${d.name || ''} (${d.start || ''} – ${d.end || ''})`;
    case 'Add SGT':
      return `${d.name || ''} under ${d.clinicalSubject || ''} · ${d.planned || 0} planned`;
    case 'Import Merge':
      return `${d.subjects || 0} subject(s), ${d.rotations || 0} rotation(s)`;
    case 'Import Replace':
      return `Mode: ${d.mode || 'unknown'}`;
    default:
      return '';
  }
};

// ── Clinical Group Card Component ──
function ClinicalGroupCard({
  name, hasRotation, hasSGT, rotation, sgt,
  onAddRotation, onAddSGT, onEditRotation, onEditSGT, onDeleteRotation, onDeleteSGT,
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
                <button type="button" onClick={onEditRotation} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={onDeleteRotation} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
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
                <button type="button" onClick={onEditSGT} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={onDeleteSGT} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
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

    // ── Subject Triage Card Component (collapsed by default; expand → 3 equal text buttons) ──
      function SubjectTriageCard({
        name, isPreset, store, id, parentOptions, currentParent, canChangeParent, canDelete,
          onRename, onDelete, opdRename, opdEditing, toggleEdit, updateRename, saveRename, onParentChange
            }: any) {
              const [expanded, setExpanded] = useState(false);
                const [showParentDropdown, setShowParentDropdown] = useState(false);
                  const isEditing = opdEditing[id] || false;
                    const renameValue = opdRename[id] !== undefined ? opdRename[id] : name;
                     return (
                      <div className="bg-card border border-border/50 rounded-lg overflow-hidden">
                        {isEditing ? (
                          <div className="p-2.5 flex items-center gap-1">
                            <input value={renameValue} onChange={e => updateRename(id, e.target.value)} className={cn(inputCls, 'h-8 text-xs flex-1')} autoFocus />
                               <button type="button" onClick={() => saveRename(id, store, name)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 cursor-pointer"><Check className="w-3.5 h-3.5" /></button>
                                <button type="button" onClick={() => toggleEdit(id)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                                </div>
                                ) : (
                                <>
                               <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-2.5 hover:bg-muted/20 transition-colors text-left">
                              <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold truncate" style={{ color: getSubjectColor(name) }}>{name}</span>
                            {isPreset ? (
                           <span className="text-[9px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full shrink-0">Preset</span>
                          ) : (
                         <AddedBadge />
                        )}
                      </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>
                 {expanded && (
                  <div className="px-2.5 pb-2.5">
                   <div className="grid grid-cols-3 gap-1.5">
                    <button type="button" onClick={() => toggleEdit(id)} className="h-9 rounded-lg border border-border bg-background/70 text-foreground text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-muted cursor-pointer">
                    <Edit2 className="w-3 h-3" /> Rename
                     </button>
                      <button type="button" disabled={!canChangeParent} onClick={() => setShowParentDropdown(!showParentDropdown)} className={cn('h-9 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1', canChangeParent ? 'border-border bg-background/70 text-foreground hover:bg-muted cursor-pointer' : 'border-border/40 bg-muted/10 text-muted-foreground/40 cursor-not-allowed')}>
                       <ArrowRightLeft className="w-3 h-3" /> Swap
                        </button>
                          <button type="button" disabled={!canDelete} onClick={onDelete} className={cn('h-9 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1', canDelete ? 'border-border bg-background/70 text-destructive hover:bg-destructive/10 cursor-pointer' : 'border-border/40 bg-muted/10 text-muted-foreground/40 cursor-not-allowed')}>
                           <Trash2 className="w-3 h-3" /> Delete
                            </button>
                            </div>
                            {showParentDropdown && canChangeParent && (
                          <div className="mt-1.5 bg-card border border-border rounded-lg shadow-lg p-1 max-h-40 overflow-y-auto">
                        {parentOptions.map((opt: any) => (
                      <button key={opt.value || opt} onClick={() => { onParentChange(opt.value || opt); setShowParentDropdown(false); }} className={cn('block w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded-md', (opt.value || opt) === currentParent && 'text-primary font-bold')}>
                    {opt.label || opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    )}
  </div>
 );
}

// ── Main Component ──
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
    updatePresetTimetableSlot, addSubjectToSlot, updatePresetSubjectTotal,
    getParentOptions, isExistingParent, getAlliedChildCount,
    isSubjectNameTaken, isWardNameTaken, findSubjectTimeConflicts, findWardDateConflicts,
    getSubjectPlannedTotal,
    bulkUpdateSubjectHierarchy,
    renamePresetWard,
    getPresetSubjectDisplayName,
    setPresetSubjectRename,
  } = useCustomData();

  const { removeSubjectData, removeWardData, renameSubjectData, renameWardData, removeAttendanceByKey } = useAttendance();

  const timetableRef = useRef(presetTimetable);
  useEffect(() => { timetableRef.current = presetTimetable; }, [presetTimetable]);

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

  const [clinicalParentChoice, setClinicalParentChoice] = useState<'rotation' | 'sgt'>('rotation');
  const [wardName, setWardName] = useState('');
  const [wardStart, setWardStart] = useState('');
  const [wardEnd, setWardEnd] = useState('');
  const [mornStart, setMornStart] = useState('09:30 AM');
  const [mornEnd, setMornEnd] = useState('11:30 AM');
  const [eveStart, setEveStart] = useState('07:00 PM');
  const [eveEnd, setEveEnd] = useState('09:00 PM');

  const [sgtClinicalSubject, setSgtClinicalSubject] = useState('');
  const [sgtName, setSgtName] = useState('');
  const [sgtStartDate, setSgtStartDate] = useState('');
  const [sgtEndDate, setSgtEndDate] = useState('');
  const [sgtRows, setSgtRows] = useState<ScheduleRow[]>([newRow([])]);

  const [editSlot, setEditSlot] = useState<EditSlotState | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [slotMoveTargetDay, setSlotMoveTargetDay] = useState<number>(0);
  const [slotMoveStart, setSlotMoveStart] = useState('09:00 AM');
  const [slotMoveEnd, setSlotMoveEnd] = useState('10:00 AM');
  const [slotMovePlanned, setSlotMovePlanned] = useState<Record<string, number>>({});
  const [slotConflict, setSlotConflict] = useState<{ messages: string[]; onConfirm: () => void } | null>(null);
  const [slotRemove, setSlotRemove] = useState<{ subject: string; day: number; index: number; time: string; start: string; end: string } | null>(null);
  const [slotRemoveConfirm, setSlotRemoveConfirm] = useState(false);
  const [showMoveForm, setShowMoveForm] = useState(false);

  const [opdOpen, setOpdOpen] = useState(false);
  const [opdRename, setOpdRename] = useState<Record<string, string>>({});
  const [opdEditing, setOpdEditing] = useState<Record<string, boolean>>({});
  const [triageTop, setTriageTop] = useState<'preset' | 'added'>('preset');
  const [triageSub, setTriageSub] = useState<'academic' | 'clinical'>('academic');

  const [deleteSheet, setDeleteSheet] = useState<{ title: string; lines: string[]; onConfirm: () => void } | null>(null);
  const [conflictSheet, setConflictSheet] = useState<{ messages: string[]; onConfirm: () => void } | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ bundle: ImportBundle; report: ImportReport } | null>(null);
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

  const isAllied = subjectType === 'allied';
  const resolvedParent = parentChoice === CREATE_NEW ? newParentName.trim() : parentChoice.trim();
  const parentIsNew = resolvedParent ? !(PRESET_PARENTS.includes(resolvedParent) || isExistingParent(resolvedParent)) : false;
  const parentIsSGT = resolvedParent ? PRESET_PARENTS.includes(resolvedParent) : false;

  /* Record-level SGT guard */
  const isSGTRecord = (s: { subjectType: string; parentName?: string }): boolean =>
    s.subjectType === 'allied' && s.parentName === 'Small Group Teaching';

  /* Resolve a display name back to its original preset name (chained renames) */
  const resolvePresetOriginalName = (displayName: string): string => {
    const all = [
      ...CATEGORIES.flatMap(c => c.subjects.map(s => s.name)),
      ...INTEGRATED_SUBJECTS.map(s => s.name),
      ...WARD_SUBJECTS.map(w => w.name),
    ];
    return all.find(n => getPresetSubjectDisplayName(n) === displayName) ?? displayName;
  };

  const academicParentOptions = useMemo(() => {
    const all = getParentOptions();
    return all.filter(p => p !== 'Small Group Teaching');
  }, [getParentOptions]);

  /* SGT records excluded from "singles" */
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
      ...userAddedSubjects.filter(s => s.parentName === 'Small Group Teaching').map(s => (s as any).clinicalSubject),
      ...customSubjects.filter(s => s.parentName === 'Small Group Teaching').map(s => (s as any).clinicalSubject),
    ].filter((name): name is string => !!name && !presetNames.includes(name) && !customNames.includes(name));
    return Array.from(new Set([...presetNames, ...customNames, ...sgtParents])).sort();
  }, [customWards, userAddedSubjects, customSubjects]);

  const clinicalSubjectOptions = useMemo(() => {
    const opts = allClinicalSubjects.map(name => ({ value: name, label: name }));
    opts.push({ value: CREATE_NEW, label: '+ Create new clinical subject' });
    return opts;
  }, [allClinicalSubjects]);

  const getSGTForSubject = (clinicalName: string) => {
    if (subjectMode === 'preloaded') {
      return userAddedSubjects.find(
        s => s.parentName === 'Small Group Teaching' && (s as any).clinicalSubject === clinicalName
      ) || null;
    } else {
      return customSubjects.find(
        s => s.parentName === 'Small Group Teaching' && (s as any).clinicalSubject === clinicalName
      ) || null;
    }
  };

  const getSGTStore = (sgt: any): 'userAdded' | 'custom' => {
    if (subjectMode === 'preloaded') return 'userAdded';
    return 'custom';
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

  const isSGTSubject = (subjectName: string): boolean => {
    const name = subjectName.trim().toLowerCase();
    const allSGTs = [...userAddedSubjects, ...customSubjects].filter(
      s => s.parentName === 'Small Group Teaching'
    );
    return allSGTs.some(s => s.name.toLowerCase() === name);
  };

  /* Rename only rewrites the timetable. Totals stay keyed by the ORIGINAL
     preset name (never renamed), so planned values can no longer be lost/zeroed. */
  const renamePresetAcademicSubject = (oldName: string, newName: string) => {
    const tt = timetableRef.current;
    for (let day = 0; day < 7; day++) {
      const slots = tt[day] || [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.subjects && slot.subjects.some(s => s === oldName)) {
          const newSubjects = slot.subjects.map(s => s === oldName ? newName : s);
          updatePresetTimetableSlot(day, i, slot.time, newSubjects, day);
        }
      }
    }
  };

  const computeSGTPlanned = () => {
    if (!sgtStartDate || !sgtEndDate || sgtRows.length === 0) return 0;
    const start = new Date(sgtStartDate + 'T12:00:00');
    const end = new Date(sgtEndDate + 'T12:00:00');
    let total = 0;
    const daysSet = new Set(sgtRows.map(r => r.day));
    const current = new Date(start);
    while (current <= end) {
      const dayAbbr = DAY_ABBRS[current.getDay()];
      if (daysSet.has(dayAbbr)) total++;
      current.setDate(current.getDate() + 1);
    }
    return total;
  };

  const computedPlanned = useMemo(() => computeSGTPlanned(), [sgtStartDate, sgtEndDate, sgtRows]);

  /* Only update the SGTs that were actually migrated */
  useEffect(() => {
    const migrateSGTs = () => {
      let changed = false;
      const migratedIds = new Set<string>();
      const nextUA = userAddedSubjects.map(s => {
        if (s.parentName === 'Small Group Teaching' && !(s as any).clinicalSubject) {
          const derived = s.name.replace(/\s*SGT\s*$/i, '').trim() || s.name;
          changed = true;
          migratedIds.add(s.id);
          return { ...s, clinicalSubject: derived };
        }
        return s;
      });

      if (changed) {
        nextUA.forEach(s => {
          if (migratedIds.has(s.id) && (s as any).clinicalSubject) {
            updateUserAddedSubject(s.id, { clinicalSubject: (s as any).clinicalSubject } as any);
          }
        });
        showToast('Migrated existing SGT subjects to new structure.', 'info');
      }
    };

    migrateSGTs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const academicAddSlotSubjects = useMemo(() => {
    const set = new Set<string>();
    if (subjectMode === 'preloaded') {
      CATEGORIES.forEach(c => c.subjects.forEach(s => set.add(s.name)));
      INTEGRATED_SUBJECTS.forEach(s => set.add(s.name));
      userAddedSubjects
        .filter(s => !isSGTRecord(s))
        .forEach(s => set.add(s.name));
    } else {
      customSubjects
        .filter(s => !isSGTRecord(s))
        .forEach(s => set.add(s.name));
    }
    return Array.from(set).sort();
  }, [subjectMode, userAddedSubjects, customSubjects]);

  const HISTORY_KEY = 'att_manage_history';
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistoryEntries(JSON.parse(stored));
    } catch {}
  }, []);

  const recordHistory = (type: string, data: any) => {
    const entry = { id: genId('hist'), type, timestamp: new Date().toISOString(), data };
    setHistoryEntries(prev => {
      const updated = [entry, ...prev].slice(0, 50);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        storageSetItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const openAddSlot = () => {
    setAddSlotSubject('');
    setAddSlotStart('09:00 AM');
    setAddSlotEnd('10:00 AM');
    setAddSlotPlanned(0);
    setFormError(null);
    setAddSlotOpen(true);
  };

  /* Add Slot also syncs the user-added subject's stored schedules */
  const saveAddSlot = () => {
    if (!addSlotSubject) {
      setFormError('Select a subject.');
      return;
    }
    const time = canonicalTimeRange(addSlotStart, addSlotEnd);
    const conflicts = findSubjectTimeConflicts([DAY_ABBRS[selDay]], time, undefined).filter(c => !c.exact);
    if (conflicts.length > 0) {
      setFormError(`Time overlaps with ${conflicts.map(c => c.subjects.join(', ')).join('; ')}.`);
      return;
    }
    recordHistory('Add Slot', { subject: addSlotSubject, day: selDay, time });
    if (subjectMode === 'preloaded') {
      const tt = timetableRef.current;
      const existingIdx = (tt[selDay] || []).findIndex(s => canonicalizeTimeRange(s.time) === time);
      if (existingIdx >= 0) {
        const existing = tt[selDay][existingIdx];
        const merged = Array.from(new Set([...existing.subjects, addSlotSubject]));
        updatePresetTimetableSlot(selDay, existingIdx, existing.time, merged, selDay);
      } else {
        addSubjectToSlot(selDay, time, addSlotSubject);
      }

      const ua = userAddedSubjects.find(u => u.name === addSlotSubject && !isSGTRecord(u));
      if (ua) {
        const { start, end } = splitRange(time);
        const existingSchedules = ua.schedules || [];
        const alreadyExists = existingSchedules.some(s => s.day === DAY_ABBRS[selDay] && s.start === start && s.end === end);
        if (!alreadyExists) {
          const updated = [...existingSchedules, { day: DAY_ABBRS[selDay], start, end }];
          updateUserAddedSubject(ua.id, { schedules: updated, days: updated.map(s => s.day).join(', ') } as any);
        }
      }
    } else {
      const target = customSubjects.find(s => s.name === addSlotSubject);
      if (target) {
        const schedules = target.schedules || [];
        const existing = schedules.find(s => s.day === DAY_ABBRS[selDay] && canonicalizeTimeRange(s.time) === time);
        if (existing) {
          setFormError('Subject already scheduled at this time.');
          return;
        }
        const updated = [...schedules, { day: DAY_ABBRS[selDay], time }];
        updateCustomSubject(target.id, { schedules: updated });
      }
    }
    setAddSlotOpen(false);
    showToast('Slot added.');
  };

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

  const buildRowsFromForm = (rows: ScheduleRow[]) =>
    rows.map(r => ({ day: r.day, time: canonicalTimeRange(r.startTime, r.endTime), start: r.startTime, end: r.endTime }));

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

  /* Records Add Subject */
  const commitSubjects = (items: any[]) => {
    try {
      if (subjectMode === 'preloaded') {
        addUserAddedSubjects(items.map(it => ({
          name: it.name, subjectType: it.subjectType, parentName: it.parentName,
          plannedClasses: it.plannedClasses,
          days: it.rows.map((r: any) => r.day).join(', '),
          time: it.rows[0]?.time || '',
          schedules: it.rows.map((r: any) => ({ day: r.day, start: r.start, end: r.end })),
          startDate: it.startDate, endDate: it.endDate, clinicalSubject: it.clinicalSubject,
        })));
      } else {
        addCustomSubjects(items.map(it => ({
          name: it.name, subjectType: it.subjectType, parentName: it.parentName,
          plannedClasses: it.plannedClasses,
          days: it.rows.map((r: any) => r.day).join(', '),
          time: it.rows[0]?.time || '',
          schedules: it.rows.map((r: any) => ({ day: r.day, time: r.time })),
          startDate: it.startDate, endDate: it.endDate, clinicalSubject: it.clinicalSubject,
        })));
      }

      const academicItems = items.filter((i: any) => i.subjectType !== 'allied-parent');
      if (academicItems.length > 0) {
        recordHistory('Add Subject', { names: academicItems.map((i: any) => i.name) });
      }

      setSubjectName(''); setPlanned(''); setSubjectRows([newRow([])]); setStagedChildren([]); setNewParentName(''); setChildStart(''); setChildEnd('');
      setFormError(null);
      showToast(items.length > 1 ? `${items.length} items added.` : 'Added successfully.');
      setConflictSheet(null);
      window.setTimeout(() => { setConflictSheet(null); setMoreOpen(false); }, 900);
    } catch {
      showToast('Failed to save — please try again.', 'err');
    }
  };

  const saveSubject = () => {
    const items: any[] = [];
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
        if (rp) { setFormError(`Child "${c.name}": ${rp}`); return; }
      }
      if (parentIsNew) items.push({ name: resolvedParent, subjectType: 'allied-parent', plannedClasses: 0, rows: [] });
      for (const c of children) {
        items.push({ name: c.name, subjectType: 'allied', parentName: resolvedParent, plannedClasses: c.plannedClasses, rows: buildRowsFromForm(c.rows), startDate: c.startDate, endDate: c.endDate });
      }
    }
    try {
      const duplicates: string[] = [];
      const timeOverlaps: any[] = [];
      const seen = new Set<string>();
      const academic = items.filter((i: any) => i.subjectType !== 'allied-parent');
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
      if (duplicates.length > 0 || timeOverlaps.length > 0) {
        const messages: string[] = [];
        for (const d of duplicates) messages.push(`Duplicate name: "${d}" already exists.`);
        for (const t of timeOverlaps) messages.push(`Time overlap on ${t.day} at ${t.time} with ${t.subjects.join(', ')}.`);
        setFormError(null);
        setConflictSheet({ messages, onConfirm: () => {
          setConflictSheet(null);
          commitSubjects(items);
        }});
        return;
      }
      commitSubjects(items);
    } catch {
      showToast('Failed to check/save — please try again.', 'err');
    }
  };

  const addSgtRow = () => {
    if (sgtRows.length >= 7) { setFormError('Maximum 7 day & time rows.'); return; }
    setSgtRows(prev => [...prev, newRow(prev.map(r => r.day))]);
  };
  const updateSgtRow = (id: string, patch: Partial<ScheduleRow>) => setSgtRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeSgtRow = (id: string) => setSgtRows(prev => prev.filter(r => r.id !== id));

  /* Records Add Rotation */
  const commitWard = (name: string, start: string, end: string, morningTime: string, eveningTime: string) => {
    try {
      if (subjectMode === 'preloaded') addPresetWardEntry({ start, end, ward: name, morningTime, eveningTime, addedByUser: true });
      else addCustomWard({ name, startDate: start, endDate: end, morningTime, eveningTime });
      recordHistory('Add Rotation', { name, start, end });
      setWardName(''); setWardStart(''); setWardEnd('');
      setFormError(null);
      showToast('Rotation added.');
      setMoreOpen(false);
    } catch {
      showToast('Failed to save rotation — please try again.', 'err');
    }
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
        setConflictSheet({ messages, onConfirm: () => { setConflictSheet(null); commitWard(name, wardStart, wardEnd, morningTime, eveningTime); } });
        return;
      }
      commitWard(name, wardStart, wardEnd, morningTime, eveningTime);
    } else {
      if (!sgtClinicalSubject) { setFormError('Select a clinical subject or create a new one.'); return; }
      let clinicalSubjectName = sgtClinicalSubject;
      if (clinicalSubjectName === CREATE_NEW) {
        const newName = sgtName.replace(/\s*SGT\s*$/i, '').trim();
        if (!newName) { setFormError('Enter a name for the new clinical subject.'); return; }
        clinicalSubjectName = newName;
        if (allClinicalSubjects.includes(clinicalSubjectName)) {
          setFormError(`"${clinicalSubjectName}" already exists as a clinical subject. Please select it from the dropdown.`);
          return;
        }
      }
      const finalSgtName = sgtName.trim() || clinicalSubjectName;
      if (!finalSgtName) { setFormError('Enter an SGT subject name.'); return; }
      if (!sgtStartDate || !sgtEndDate) { setFormError('Pick placement start and end dates.'); return; }
      if (sgtEndDate < sgtStartDate) { setFormError('End date must be after start date.'); return; }
      const rp = rowProblem(sgtRows);
      if (rp) { setFormError(rp); return; }
      const rows = buildRowsFromForm(sgtRows);

      /* One SGT per clinical subject */
      const existingSGTForSubject = (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects)
        .find(s => isSGTRecord(s) && (s as any).clinicalSubject === clinicalSubjectName);
      if (existingSGTForSubject) {
        setFormError(`"${clinicalSubjectName}" already has an SGT ("${existingSGTForSubject.name}"). Each clinical subject can only have one SGT.`);
        return;
      }

      const existingSGTNames = (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects)
        .filter(s => isSGTRecord(s))
        .map(s => s.name.toLowerCase());
      if (existingSGTNames.includes(finalSgtName.toLowerCase())) {
        setFormError(`An SGT subject named "${finalSgtName}" already exists.`);
        return;
      }
      const pc = computedPlanned;
      if (pc === 0) {
        setFormError('No scheduled sessions found in the date range. Please check your schedules and dates.');
        return;
      }
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
      };
      if (subjectMode === 'preloaded') {
        addUserAddedSubjects([newSubject as any]);
      } else {
        addCustomSubjects([newSubject as any]);
      }
      recordHistory('Add SGT', { name: finalSgtName, clinicalSubject: clinicalSubjectName, planned: pc });
      setSgtClinicalSubject('');
      setSgtName('');
      setSgtStartDate('');
      setSgtEndDate('');
      setSgtRows([newRow([])]);
      setFormError(null);
      showToast(`SGT added with ${pc} planned classes.`);
      setMoreOpen(false);
    }
  };

  const openEditSlot = (day: number, index: number) => {
    const slot = presetTimetable[day]?.[index];
    if (!slot || !slot.subjects || slot.subjects.length === 0) {
      showToast('This slot has no subjects to edit.', 'info');
      return;
    }
    const { start, end } = splitRange(slot.time);
    const subjects = slot.subjects.map(s => ({ name: s, planned: getSubjectPlannedTotal(s), id: genId('sel') }));
    const multiSelectMode = subjects.length > 1;
    setEditSlot({ day, index, startTime: start, endTime: end, targetDay: day, subjects, multiSelectMode });
    setSelectedSubjects([]);
    setSlotMoveTargetDay(day);
    setSlotMoveStart(start);
    setSlotMoveEnd(end);
    setSlotMovePlanned({});
    setSlotRemove(null);
    setSlotRemoveConfirm(false);
    setSlotConflict(null);
    setEditError(null);
    setShowMoveForm(false);
  };

  const closeEditSlot = () => {
    setEditSlot(null);
    setSelectedSubjects([]);
    setSlotRemove(null);
    setSlotRemoveConfirm(false);
    setSlotConflict(null);
    setEditError(null);
    setShowMoveForm(false);
  };

  const toggleSubjectSelection = (id: string) => {
    setSelectedSubjects(prev => {
      const newSel = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
      setShowMoveForm(newSel.length > 0);
      return newSel;
    });
  };

  const selectAllSubjects = () => {
    if (!editSlot) return;
    if (selectedSubjects.length === editSlot.subjects.length) {
      setSelectedSubjects([]);
      setShowMoveForm(false);
    } else {
      setSelectedSubjects(editSlot.subjects.map(s => s.id));
      setShowMoveForm(true);
    }
  };

  const updatePlannedForSubject = (id: string, value: number) => {
    setSlotMovePlanned(prev => ({ ...prev, [id]: value }));
  };

  /* Type-guarded lookup (never resolves to an SGT) */
  const updateSubjectSchedule = (name: string, oldDay: number, newDay: number, oldStart: string, oldEnd: string, newStart: string, newEnd: string) => {
    const ua = userAddedSubjects.find(u =>
      u.name.toLowerCase() === name.toLowerCase() && !isSGTRecord(u)
    );
    if (!ua) return;
    const existing = ua.schedules || [];
    let filtered = existing;
    if (oldDay !== undefined && oldDay >= 0) {
      const oldAbbr = DAY_ABBRS[oldDay];
      filtered = existing.filter(s => !(s.day === oldAbbr && s.start === oldStart && s.end === oldEnd));
    }
    const newAbbr = DAY_ABBRS[newDay];
    const newEntry = { day: newAbbr, start: newStart, end: newEnd };
    const alreadyExists = filtered.some(s => s.day === newAbbr && s.start === newStart && s.end === newEnd);
    const updated = alreadyExists ? filtered : [...filtered, newEntry];
    updateUserAddedSubject(ua.id, { schedules: updated, days: updated.map(s => s.day).join(', ') } as any);
  };

  const doMoveSubjects = (targetIdsOverride?: string[]) => {
    if (!editSlot) return;
    const targetIds = targetIdsOverride || selectedSubjects;
    if (targetIds.length === 0) {
      setEditError('Select at least one subject to move.');
      return;
    }
    const targetDay = slotMoveTargetDay;
    const time = canonicalTimeRange(slotMoveStart, slotMoveEnd);
    const targetSlots = timetableRef.current[targetDay] || [];
    const conflictSlot = targetSlots.find(sl => {
      if (sl.type === 'ward' || sl.type === 'ward_replacement') return false;
      const pa = parseRangeToMinutes(sl.time);
      const pb = parseRangeToMinutes(time);
      return !!pa && !!pb && pa.start < pb.end && pb.start < pa.end;
    });
    if (conflictSlot && targetDay !== editSlot.day) {
      setSlotConflict({
        messages: [`${DAY_ABBRS[targetDay]} already has a slot at ${conflictSlot.time} with ${conflictSlot.subjects.join(', ')}.`],
        onConfirm: () => {
          setSlotConflict(null);
          applyMove(targetIds, targetDay, time);
        },
      });
      return;
    }
    applyMove(targetIds, targetDay, time);
  };

  const applyMove = (targetIds: string[], targetDay: number, time: string) => {
    if (!editSlot) return;
    const subjectsToMove = editSlot.subjects.filter(s => targetIds.includes(s.id));
    const names = subjectsToMove.map(s => s.name);
    const currentDay = editSlot.day;
    const currentIndex = editSlot.index;
    const sourceSlot = timetableRef.current[currentDay]?.[currentIndex];
    if (!sourceSlot) return;
    const { start: oldStart, end: oldEnd } = splitRange(sourceSlot.time);
    const sourceSubjects = sourceSlot.subjects.filter(s => !names.includes(s));
    if (sourceSubjects.length === 0) {
      updatePresetTimetableSlot(currentDay, currentIndex, sourceSlot.time, [], currentDay);
    } else {
      updatePresetTimetableSlot(currentDay, currentIndex, sourceSlot.time, sourceSubjects, currentDay);
    }
    const targetSlots = timetableRef.current[targetDay] || [];
    const existingIndex = targetSlots.findIndex(sl => canonicalizeTimeRange(sl.time) === time);
    if (existingIndex >= 0) {
      const merged = Array.from(new Set([...targetSlots[existingIndex].subjects, ...names]));
      updatePresetTimetableSlot(targetDay, existingIndex, time, merged, targetDay);
    } else {
      names.forEach(name => {
        addSubjectToSlot(targetDay, time, name);
      });
    }

    const plannedUpdates = targetIds.map(id => {
      const sub = editSlot.subjects.find(s => s.id === id);
      if (sub) {
        const newPlanned = slotMovePlanned[id] !== undefined ? slotMovePlanned[id] : sub.planned;
        return { name: sub.name, planned: newPlanned };
      }
      return null;
    }).filter(Boolean) as Array<{ name: string; planned: number }>;

    /*  Type-guarded + only save when actually changed */
    plannedUpdates.forEach(({ name, planned }) => {
      const ua = userAddedSubjects.find(u => u.name === name && !isSGTRecord(u));
      if (ua) {
        if (ua.plannedClasses !== planned) {
          updateUserAddedSubject(ua.id, { plannedClasses: planned } as any);
        }
      } else {
        const key = resolvePresetOriginalName(name);
        if (getSubjectPlannedTotal(key) !== planned) {
          updatePresetSubjectTotal(key, planned);
        }
      }
    });

    names.forEach(name => {
      updateSubjectSchedule(name, currentDay, targetDay, oldStart, oldEnd, slotMoveStart, slotMoveEnd);
    });

    const remaining = editSlot.subjects.filter(s => !targetIds.includes(s.id));
    if (remaining.length === 0) {
      setEditSlot(null);
    } else {
      const newSubjects = remaining.map(s => ({ ...s, id: genId('sel') }));
      setEditSlot(prev => prev ? { ...prev, subjects: newSubjects, targetDay } : null);
    }
    setSelectedSubjects([]);
    setSlotMovePlanned({});
    setShowMoveForm(false);
    setSlotConflict(null);
    recordHistory('Move Subjects', { names, fromDay: currentDay, fromTime: sourceSlot.time, toDay: targetDay, toTime: time });
    showToast(`Moved ${names.length} subject(s).`);
  };

  /* Type-guarded lookup */
  const confirmSlotRemove = () => {
    if (!slotRemove) return;
    try {
      const slot = timetableRef.current[slotRemove.day]?.[slotRemove.index];
      if (slot) {
        const remaining = slot.subjects.filter(s => s !== slotRemove.subject);
        if (remaining.length === 0) {
          updatePresetTimetableSlot(slotRemove.day, slotRemove.index, slot.time, [], slotRemove.day);
        } else {
          updatePresetTimetableSlot(slotRemove.day, slotRemove.index, slot.time, remaining, slotRemove.day);
        }
        const ua = userAddedSubjects.find(u =>
          u.name.toLowerCase() === slotRemove.subject.toLowerCase() && !isSGTRecord(u)
        );
        if (ua) {
          const existing = ua.schedules || [];
          const filtered = existing.filter(s => !(s.day === DAY_ABBRS[slotRemove.day] && s.start === slotRemove.start && s.end === slotRemove.end));
          updateUserAddedSubject(ua.id, { schedules: filtered, days: filtered.map(s => s.day).join(', ') } as any);
        }
        recordHistory('Remove from Slot', { subject: slotRemove.subject, day: slotRemove.day, time: slotRemove.time });
        showToast(`Removed "${slotRemove.subject}" from slot.`);
      }
    } catch {
      showToast('Failed to remove subject.', 'err');
    }
    setSlotRemove(null);
    setSlotRemoveConfirm(false);
    if (editSlot) {
      const updatedSubjects = editSlot.subjects.filter(s => s.name !== slotRemove?.subject);
      setEditSlot(prev => prev ? { ...prev, subjects: updatedSubjects } : null);
    }
  };

  const requestDeleteSubject = (store: 'userAdded' | 'custom', id: string) => {
    const item = store === 'userAdded' ? userAddedSubjects.find(x => x.id === id) : customSubjects.find(x => x.id === id);
    if (!item) return;
    setDeleteSheet({
      title: `Delete "${item.name}"?`,
      lines: ['This subject and all its attendance records will be permanently removed.', 'This action cannot be undone.'],
      onConfirm: () => {
        recordHistory('Delete Subject', { name: item.name, store, id });
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
          setDeleteSheet(null);
          showToast(`Deleted "${item.name}".`);
        } catch { showToast('Delete failed — please try again.', 'err'); }
      },
    });
  };

  const requestDeleteWard = (store: 'preset' | 'custom', ref: number | string) => {
    if (store === 'preset') {
      const idx = ref as number;
      const e = presetWardSchedule[idx];
      if (!e) return;
      setDeleteSheet({
        title: `Delete rotation "${e.ward}"?`,
        lines: ['This rotation period', 'Calendar / schedule entries', 'All attendance records for this ward'],
        onConfirm: () => {
          recordHistory('Delete Rotation', { ward: e.ward, index: idx });
          try {
            removePresetWardEntry(idx);
            if (presetWardSchedule.filter(x => x.ward === e.ward).length <= 1) removeWardData(e.ward);
            setDeleteSheet(null);
            showToast(`Deleted "${e.ward}".`);
          } catch { showToast('Delete failed — please try again.', 'err'); }
        },
      });
    } else {
      const w = customWards.find(x => x.id === ref);
      if (!w) return;
      setDeleteSheet({
        title: `Delete rotation "${w.name}"?`,
        lines: ['This rotation card', 'Calendar / schedule entries', 'All attendance records for this ward'],
        onConfirm: () => {
          recordHistory('Delete Ward', { name: w.name, id: w.id });
          try {
            removeCustomWard(w.id);
            removeWardData(w.name);
            setDeleteSheet(null);
            showToast(`Deleted "${w.name}".`);
          } catch { showToast('Delete failed — please try again.', 'err'); }
        },
      });
    }
  };

  const openEditSubject = (store: 'userAdded' | 'custom', id: string) => {
    const item = store === 'userAdded' ? userAddedSubjects.find(x => x.id === id) : customSubjects.find(x => x.id === id);
    if (!item) return;
    setEditError(null);
    const rows = item.schedules && item.schedules.length
      ? item.schedules.map(s => ({ id: genId('row'), day: s.day, startTime: s.start || '', endTime: s.end || '' }))
      : parseDayList(item.days).map(d => {
          const { start, end } = splitRange(item.time);
          return { id: genId('row'), day: d, startTime: start, endTime: end };
        });
    setEditSubject({
      store, id, originalName: item.name, name: item.name,
      subjectType: item.subjectType, parentName: getEffectiveParentName(item) || '',
      clinicalSubject: (item as any).clinicalSubject || '',
      rows: rows.length ? rows : [newRow([])],
      plannedClasses: item.plannedClasses ?? 0,
      startDate: (item as any).startDate || '',
      endDate: (item as any).endDate || '',
    });
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

  const saveEditSubject = () => {
    if (!editSubject) return;
    if (editSubject.subjectType !== 'allied-parent') {
      const rp = rowProblem(editSubject.rows);
      if (rp) { setEditError(rp); return; }
    }
    recordHistory('Edit Subject', { old: { name: editSubject.originalName }, new: { name: editSubject.name } });
    try {
      if (editSubject.subjectType === 'allied-parent') {
        const patch = { name: editSubject.name };
        if (editSubject.store === 'userAdded') updateUserAddedSubject(editSubject.id, patch);
        else updateCustomSubject(editSubject.id, patch);
      } else {
        const rows = buildRowsFromForm(editSubject.rows);
        const patch: any = {
          name: editSubject.name, days: rows.map(r => r.day).join(', '), time: rows[0]?.time || '', plannedClasses: editSubject.plannedClasses,
        };
        if (editSubject.store === 'userAdded') patch.schedules = rows.map(r => ({ day: r.day, start: r.start, end: r.end }));
        else patch.schedules = rows.map(r => ({ day: r.day, time: r.time }));

        if (editSubject.subjectType === 'allied' && editSubject.parentName !== 'Small Group Teaching') {
          patch.parentName = editSubject.parentName;
          patch.category = editSubject.parentName;
        } else if (editSubject.subjectType === 'allied' && editSubject.parentName === 'Small Group Teaching') {
          patch.clinicalSubject = editSubject.clinicalSubject;
          patch.parentName = 'Small Group Teaching';
          patch.category = 'Small Group Teaching';

          /* Auto-rename SGT when its clinical subject changes
             (only if it was named after the old subject and the name is untouched) */
          const originalItem = editSubject.store === 'userAdded'
            ? userAddedSubjects.find(x => x.id === editSubject.id)
            : customSubjects.find(x => x.id === editSubject.id);
          const oldClinical = (originalItem as any)?.clinicalSubject || '';
          const nameWasSubjectName = editSubject.originalName.toLowerCase() === oldClinical.toLowerCase();
          const subjectChanged = editSubject.clinicalSubject !== oldClinical;
          const nameUntouched = editSubject.name === editSubject.originalName;
          if (nameWasSubjectName && subjectChanged && nameUntouched) {
            patch.name = editSubject.clinicalSubject;
          }
        }

        if (editSubject.subjectType === 'allied' && PRESET_PARENTS.includes(editSubject.parentName)) {
          patch.startDate = editSubject.startDate;
          patch.endDate = editSubject.endDate;
        }
        if (editSubject.store === 'userAdded') updateUserAddedSubject(editSubject.id, patch);
        else updateCustomSubject(editSubject.id, patch);
      }
      if (editSubject.name !== editSubject.originalName) {
        const isSGT = editSubject.subjectType === 'allied' && editSubject.parentName === 'Small Group Teaching';
        if (!isSGT) renameSubjectData(editSubject.originalName, editSubject.name);
      }
      setEditError(null);
      showToast('Changes saved.');
      window.setTimeout(() => setEditSubject(null), 900);
    } catch { showToast('Failed to save changes — please try again.', 'err'); }
  };

  /* Date-conflict check when editing a rotation */
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

    recordHistory('Edit Ward', { old: { name: editWard.originalName }, new: { name: editWard.name } });
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

  const openOpd = () => {
    setOpdRename({});
    setOpdEditing({});
    if (subjectMode === 'preloaded') setTriageTop('preset'); else setTriageTop('added');
    setTriageSub('academic');
    setOpdOpen(true);
  };

  const toggleOpdEdit = (id: string) => setOpdEditing(prev => ({ ...prev, [id]: !prev[id] }));
  const updateOpdRename = (id: string, value: string) => setOpdRename(prev => ({ ...prev, [id]: value }));

  /* Preset cards pass id = ORIGINAL preset name, so chained renames resolve */
  const saveOpdRename = (id: string, store: 'userAdded' | 'custom', currentName: string) => {
    const newName = opdRename[id]?.trim() || currentName;
    if (newName === currentName) { toggleOpdEdit(id); return; }

    const isPresetAcademic = CATEGORIES.flatMap(c => c.subjects).some(s => s.name === id) ||
      INTEGRATED_SUBJECTS.some(s => s.name === id);
    const isPresetClinical = WARD_SUBJECTS.some(s => s.name === id);

    recordHistory('Rename', { old: currentName, new: newName, type: isPresetAcademic ? 'preset-academic' : isPresetClinical ? 'preset-clinical' : 'subject' });

    if (isPresetAcademic) {
      renameSubjectData(currentName, newName);
      renamePresetAcademicSubject(currentName, newName);
      setPresetSubjectRename(id, newName); /* key the rename map by ORIGINAL name */
      showToast(`Renamed to "${newName}".`);
      toggleOpdEdit(id);
      return;
    }
    if (isPresetClinical) {
      renameWardData(currentName, newName);
      renamePresetWard(currentName, newName);
      showToast(`Renamed to "${newName}".`);
      toggleOpdEdit(id);
      return;
    }
    const target = store === 'userAdded' ? userAddedSubjects.find(s => s.id === id) : customSubjects.find(s => s.id === id);
    if (target && isSGTRecord(target)) {
      if (store === 'userAdded') updateUserAddedSubject(id, { name: newName }); else updateCustomSubject(id, { name: newName });
      showToast(`Renamed to "${newName}".`);
      toggleOpdEdit(id);
      return;
    }
    if (isSubjectNameTaken(newName, currentName)) { showToast(`"${newName}" already exists.`, 'err'); return; }
    renameSubjectData(currentName, newName);
    if (store === 'userAdded') { const item = userAddedSubjects.find(s => s.id === id); if (item) updateUserAddedSubject(id, { name: newName }); }
    else { const item = customSubjects.find(s => s.id === id); if (item) updateCustomSubject(id, { name: newName }); }
    showToast(`Renamed to "${newName}".`);
    toggleOpdEdit(id);
  };

  /* SGT reassignment = direct update, never bulkUpdateSubjectHierarchy */
  const handleSGTParentChange = (s: any, store: 'userAdded' | 'custom', newParent: string) => {
    const updates: any = { clinicalSubject: newParent };
    if (s.name.toLowerCase() === ((s as any).clinicalSubject || '').toLowerCase()) {
      updates.name = newParent;
    }
    if (store === 'userAdded') updateUserAddedSubject(s.id, updates);
    else updateCustomSubject(s.id, updates);
    recordHistory('Change Clinical Subject', { name: s.name, from: (s as any).clinicalSubject, to: newParent });
    showToast('Clinical subject updated.');
  };

  const deleteOpdSubject = (id: string, store: 'userAdded' | 'custom', name: string) => {
    setDeleteSheet({
      title: `Delete "${name}"?`,
      lines: ['This subject and all its attendance records will be permanently removed.', 'This action cannot be undone.'],
      onConfirm: () => {
        recordHistory('Delete Subject', { name, store, id });
        const target = store === 'userAdded' ? userAddedSubjects.find(s => s.id === id) : customSubjects.find(s => s.id === id);
        if (store === 'userAdded') removeUserAddedSubject(id); else removeCustomSubject(id);
        if (target && isSGTRecord(target)) removeAttendanceByKey(getSGTKey(id));
        else removeSubjectData(name);
        setDeleteSheet(null);
        showToast(`Deleted "${name}".`);
      },
    });
  };

  const deleteOpdWard = (id: string, name: string) => {
    setDeleteSheet({
      title: `Delete ward "${name}"?`,
      lines: ['This rotation and all its attendance records will be permanently removed.', 'This action cannot be undone.'],
      onConfirm: () => {
        recordHistory('Delete Ward', { name, id });
        removeCustomWard(id);
        removeWardData(name);
        setDeleteSheet(null);
        showToast(`Deleted "${name}".`);
      },
    });
  };

  const bundleJson = () => {
    const added = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const bundle = {
      version: BUNDLE_VERSION,
      subjectMode,
      addedSubjects: added.map(s => ({
        name: s.name,
        type: s.subjectType,
        parentCategory: getEffectiveParentName(s) ?? null,
        planned: s.plannedClasses,
        schedules: (s.schedules && s.schedules.length)
          ? s.schedules
          : parseDayList(s.days).map((d: string) => {
              const { start, end } = splitRange(s.time);
              return { day: d, start: to12h(parseRangeToMinutes(start)?.start || 0), end: to12h(parseRangeToMinutes(end)?.end || 0) };
            }),
        clinicalSubject: (s as any).clinicalSubject || undefined,
        startDate: (s as any).startDate || undefined,
        endDate: (s as any).endDate || undefined,
      })),
      customWards: customWards.map(w => ({
        name: w.name,
        startDate: w.startDate,
        endDate: w.endDate,
        morningTime: w.morningTime,
        eveningTime: w.eveningTime,
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
        if (!/^\d{1,2}:\d{2}$/.test(sch.start || '') || !/^\d{1,2}:\d{2}$/.test(sch.end || '')) return { ok: false, error: `Subject "${s.name}": schedules need 24h HH:MM start/end.` };
      }
    }
    if (b.customWards && !Array.isArray(b.customWards)) return { ok: false, error: '"customWards" must be an array.' };
    return { ok: true, bundle: b };
  };

  /* Domain-aware duplicate validation */
  const buildReport = (b: ImportBundle): ImportReport => {
    const subjectsSkip: string[] = [];
    let subjectsAdd = 0;
    for (const s of b.addedSubjects || []) {
      const domain = s.parentCategory === 'Small Group Teaching' ? 'clinical' as const : 'academic' as const;
      if (isSubjectNameTaken(s.name, undefined, domain)) { subjectsSkip.push(`${s.name} (duplicate name)`); continue; }
      const rows = (s.schedules || []).map(sch => {
        const st = to12h(sch.start || '09:00');
        const en = to12h(sch.end || '10:00');
        return { day: sch.day, time: canonicalTimeRange(st, en) };
      });
      const overlaps = rows.some(r => findSubjectTimeConflicts([r.day], r.time, undefined, domain).some(c => !c.exact));
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

  /* FIX #8 + #16 */
  const applyMerge = () => {
    if (!preview) return;
    try {
      const b = preview.bundle;
      const items: any[] = [];
      for (const s of b.addedSubjects || []) {
        const domain = s.parentCategory === 'Small Group Teaching' ? 'clinical' as const : 'academic' as const;
        if (isSubjectNameTaken(s.name, undefined, domain)) continue;
        const rows = (s.schedules || []).map(sch => {
          const st = to12h(sch.start || '09:00');
          const en = to12h(sch.end || '10:00');
          return { day: sch.day, time: canonicalTimeRange(st, en), start: st, end: en };
        });
        if (!rows.length) rows.push({ day: 'Mon', time: canonicalTimeRange('09:00 AM', '10:00 AM'), start: '09:00 AM', end: '10:00 AM' });
        const overlaps = rows.some(r => findSubjectTimeConflicts([r.day], r.time, undefined, domain).some(c => !c.exact));
        if (overlaps) continue;
        items.push({
          name: s.name,
          subjectType: (s.type as any) || 'single',
          parentName: s.parentCategory || undefined,
          plannedClasses: s.planned ?? 0,
          rows,
          clinicalSubject: s.clinicalSubject,
          startDate: s.startDate,
          endDate: s.endDate,
        });
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
      recordHistory('Import Merge', { subjects: items.length, rotations: wardsAdded + rotationsAdded });
      setPreview(null);
      const total = items.length + wardsAdded + rotationsAdded;
      if (total === 0) showToast('Nothing new to merge (duplicates or preset-only data). Use Replace to adopt the bundle.', 'info');
      else showToast(`Merged ${items.length} subject(s), ${wardsAdded + rotationsAdded} rotation(s).`);
    } catch { showToast('Merge failed — please try again.', 'err'); }
  };

  const applyReplace = () => {
    if (!preview) return;
    const b = preview.bundle;
    recordHistory('Import Replace', { mode: b.subjectMode });
    import('@/utils/snapshotUtils')
      .then(({ snapshotBeforeEdit }) => {
        snapshotBeforeEdit('Replace Routine Import');
        const toSubjectRecord = (s: any) => {
          const schedules = (s.schedules || []).map((sch: any) => {
            const st = to12h(sch.start || '09:00');
            const en = to12h(sch.end || '10:00');
            return { day: sch.day, start: st, end: en };
          });
          return {
            id: genId(b.subjectMode === 'preloaded' ? 'ua' : 'cs'),
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
          };
        };
        const records = (b.addedSubjects || []).map(toSubjectRecord);
        if (b.presetTimetable) {
          const tt = b.presetTimetable;
          localStorage.setItem('att_preset_timetable', JSON.stringify(tt));
          storageSetItem('att_preset_timetable', JSON.stringify(tt));
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
          localStorage.setItem('att_custom_subjects', JSON.stringify(records));
          storageSetItem('att_custom_subjects', JSON.stringify(records));
          const cw = (b.customWards || []).map((w: any, i: number) => ({
            ...w,
            id: `cw_imp_${Date.now()}_${i}`,
            morningTime: canonicalizeTimeRange(w.morningTime || '09:30 AM–11:30 AM'),
            eveningTime: canonicalizeTimeRange(w.eveningTime || '07:00 PM–09:00 PM'),
          }));
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
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-foreground leading-tight">Manage Subjects & Rotations</h1>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:from-primary/30 hover:to-primary/20 transition-all active:scale-95 cursor-pointer shadow-sm"
            title="History"
          >
            <SendToBack className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setExportOpen(true)} className="h-10 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-500/20 transition-all cursor-pointer">
        <Upload className="w-3.5 h-3.5" /> Export
         l</button>
        <button type="button" onClick={() => { setImportError(null); setImportOpen(true); }} className="h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-primary/20 transition-all cursor-pointer">
        <Download className="w-3.5 h-3.5" /> Import
        </button>
        <button type="button" onClick={() => setSection('academic')}
        className={cn('h-10 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer',
        section === 'academic' ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/20 text-muted-foreground border-border hover:bg-muted/40')}>
        <GraduationCap className="w-3.5 h-3.5" /> Academic Section
        </button>
        <button type="button" onClick={() => setSection('clinical')}
        className={cn('h-10 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer',
        section === 'clinical' ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/20 text-muted-foreground border-border hover:bg-muted/40')}>
        <Stethoscope className="w-3.5 h-3.5" /> Clinical Section
        </button>
        </div>
        <section className="bg-card border border-border rounded-2xl p-3.5 shadow-sm space-y-3.5">
        <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setFormError(null); setMoreOpen(true); }} className="h-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-amber-500/20 transition-all cursor-pointer">
        <Plus className="w-3.5 h-3.5" /> More
        </button>
        <button type="button" onClick={openOpd} className="h-10 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-violet-500/20 transition-all cursor-pointer">
        <Stethoscope className="w-3.5 h-3.5" /> Subject Triage
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
                <span className="text-xs text-muted-foreground font-semibold">
                  {subjectMode === 'preloaded' ? presetTimetable[selDay]?.filter(s => s.type !== 'ward' && s.type !== 'ward_replacement').length || 0 : customSubjects.filter(s => s.subjectType !== 'allied-parent' && parseDayList(s.days).includes(DAY_ABBRS[selDay])).length} Slots
                </span>
              </div>
              {subjectMode === 'preloaded' && presetTimetable[selDay]?.map((slot, idx) => {
                if (slot.type === 'ward' || slot.type === 'ward_replacement') return null;
                if (!slot.subjects || slot.subjects.length === 0) return null;
                const academicSubjects = slot.subjects.filter(s => isAcademicSubject(s));
                if (academicSubjects.length === 0) return null;
                const displayNames = academicSubjects.map(s => getPresetSubjectDisplayName(s));
                return (
                  <div key={`${selDay}-${idx}`} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-bold text-primary text-xs">{canonicalizeTimeRange(slot.time)}</p>
                      <p className="font-extrabold text-foreground text-sm leading-tight truncate mt-0.5" style={{ color: getSubjectColor(displayNames[0] || '') }}>
                        {displayNames.join(', ')}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {academicSubjects.map((s, index) => `${displayNames[index]}: ${getSubjectPlannedTotal(resolvePresetOriginalName(s))} planned`).join(' · ')}
                      </p>
                      {/* Badge only for non-SGT user-added subjects */}
                      {academicSubjects.some(s => userAddedSubjects.some(u => u.name === s && !isSGTRecord(u))) && <div className="mt-1"><AddedBadge /></div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditSlot(selDay, idx)}
                      className="shrink-0 px-3 py-2 rounded-xl border border-primary/40 text-primary font-bold text-xs flex items-center gap-1.5 hover:bg-primary/10 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  </div>
                );
              })}
              {subjectMode === 'custom' && customSubjects
                .filter(s => s.subjectType !== 'allied-parent' && parseDayList(s.days).includes(DAY_ABBRS[selDay]))
                .map(s => {
                  if (!isAcademicSubject(s.name)) return null;
                  const rows = s.schedules?.filter(sch => sch.day === DAY_ABBRS[selDay]) || [];
                  if (rows.length === 0) return null;
                  return rows.map((row, i) => (
                    <div key={`${s.id}-${i}`} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-bold text-primary text-xs">{canonicalizeTimeRange(row.time)}</p>
                        <p className="font-extrabold text-foreground text-sm leading-tight truncate mt-0.5" style={{ color: getSubjectColor(s.name) }}>{s.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{s.name}: {s.plannedClasses} planned{getEffectiveParentName(s) ? ` · under ${getEffectiveParentName(s)}` : ''}</p>
                      </div>
                      <button type="button" onClick={() => openEditSubject('custom', s.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => requestDeleteSubject('custom', s.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ));
                })}
              <button
                type="button"
                onClick={openAddSlot}
                className="w-full py-2 rounded-xl border border-dashed border-border text-xs font-semibold text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Slot
              </button>
            </div>
          )}

          {section === 'clinical' && (
            <div className="space-y-3">
              <div className="space-y-2">
                {allClinicalSubjects.map(name => {
                  const group = { rotation: getRotationForSubject(name), sgt: getSGTForSubject(name) };
                  return (
                    <ClinicalGroupCard
                      key={name}
                      name={name}
                      hasRotation={!!group.rotation}
                      hasSGT={!!group.sgt}
                      rotation={group.rotation}
                      sgt={group.sgt}
                      onAddRotation={() => {
                        setClinicalParentChoice('rotation');
                        setWardName(name);
                        setMoreOpen(true);
                      }}
                      onAddSGT={() => {
                        setClinicalParentChoice('sgt');
                        setSgtClinicalSubject(name);
                        setSgtName(name);
                        setMoreOpen(true);
                      }}
                      onEditRotation={() => {
                        if (group.rotation!.store === 'preset') openEditWardPreset(group.rotation!.index!);
                        else openEditWardCustom(group.rotation!.id!);
                      }}
                      onEditSGT={() => {
                        const store = getSGTStore(group.sgt);
                        openEditSubject(store, group.sgt!.id);
                      }}
                      onDeleteRotation={() => {
                        if (group.rotation!.store === 'preset') requestDeleteWard('preset', group.rotation!.index!);
                        else requestDeleteWard('custom', group.rotation!.id!);
                      }}
                      onDeleteSGT={() => {
                        const store = getSGTStore(group.sgt);
                        requestDeleteSubject(store, group.sgt!.id);
                      }}
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

        {/* ── More Modal ── */}
       <OverlayModal
  open={moreOpen}
  onClose={() => { setMoreOpen(false); setFormError(null); }}
  maxW="max-w-lg"
  header={
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">
          {section === 'academic' ? 'Add New Subject' : 'Add New Clinical Item'}
        </h3>
        <button type="button" onClick={() => { setMoreOpen(false); setFormError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        {section === 'academic' ? 'Create a standalone subject or nest children under a parent group.' : 'Add a clinical rotation or a Small Group Teaching entry.'}
      </p>
    </>
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
          <button type="button" onClick={() => { const fn = conflictSheet.onConfirm; setConflictSheet(null); fn(); }} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Add anyway</button>
        </div>
      </div>
    ) : section === 'academic' ? (
      isAllied ? (
        <div className="flex gap-2">
          <button type="button" onClick={addStagedChild} className={cn(btnGhost, 'flex-1 flex items-center justify-center gap-1.5')}><Plus className="w-3.5 h-3.5" /> Add child</button>
          <button type="button" onClick={saveSubject} className={cn(btnPrimary, 'flex-1')}>Save</button>
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
  <div className="p-4 sm:p-5 space-y-3.5">
    <Note note={note} />
    {formError && <p className={inlineErrCls}>{formError}</p>}
    {section === 'academic' ? (
      <>
        <div>
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
        {isAllied && (
          <div>
            <label className={labelCls}>Parent</label>
            <select value={parentChoice} onChange={e => setParentChoice(e.target.value)} className={inputCls}>
              <option value="">Select parent…</option>
              <optgroup label="Parents">
                {academicParentOptions.map(p => <option key={p} value={p}>{p}</option>)}
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
          <label className={labelCls}>Day & Time</label>
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
                <button type="button" onClick={() => setStagedChildren(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive cursor-pointer p-1"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </>
    ) : (
      <>
        <div>
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
        {clinicalParentChoice === 'rotation' ? (
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
          </>
        ) : (
          <>
            <div>
              <label className={labelCls}>Clinical Subject</label>
              <select value={sgtClinicalSubject} onChange={e => {
                const val = e.target.value;
                setSgtClinicalSubject(val);
                if (val && val !== CREATE_NEW) {
                  setSgtName(val);
                } else {
                  setSgtName('');
                }
              }} className={inputCls}>
                <option value="">Select clinical subject…</option>
                {clinicalSubjectOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>SGT Name</label>
              <input value={sgtName} onChange={e => setSgtName(e.target.value)} placeholder="e.g. Surgery" inputMode="text" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className={labelCls}>Placement start</label><input type="date" value={sgtStartDate} onChange={e => setSgtStartDate(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Placement end</label><input type="date" value={sgtEndDate} onChange={e => setSgtEndDate(e.target.value)} className={inputCls} /></div>
            </div>
            <div>
              <label className={labelCls}>Schedules (Day + Time)</label>
              {renderRowList(sgtRows, updateSgtRow, removeSgtRow)}
              <button type="button" onClick={addSgtRow} disabled={sgtRows.length >= 7} className={cn(btnGhost, 'w-full mt-2 flex items-center justify-center gap-1.5')}>
                <Plus className="w-3.5 h-3.5" /> Add another day & time
              </button>
            </div>
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

        {/* ── Add Slot Modal ── */}
       <OverlayModal
  open={addSlotOpen}
  onClose={() => { setAddSlotOpen(false); setFormError(null); }}
  maxW="max-w-sm"
  header={
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-bold text-foreground">Add Slot</h3>
      <button type="button" onClick={() => { setAddSlotOpen(false); setFormError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
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
        {academicAddSlotSubjects.map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>
    <div className="bg-muted/30 p-2.5 rounded-xl flex justify-between items-center">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Planned</span>
      <span className="text-xs font-extrabold text-foreground">{addSlotPlanned}</span>
    </div>
  </div>
</OverlayModal>

        {/* ── History Modal ── */}
        <OverlayModal open={historyOpen} onClose={() => setHistoryOpen(false)} maxW="max-w-md">
          <div className="p-4 sm:p-5 space-y-3.5 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">History</h3>
              <button type="button" onClick={() => setHistoryOpen(false)} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2">
              {historyEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-5">No Manage actions yet.</p>
              ) : (
                historyEntries.map(entry => (
                  <div key={entry.id} className="bg-background border border-border/60 rounded-xl p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">{entry.type}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</p>
                    </div>
                    {formatHistoryDetail(entry) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatHistoryDetail(entry)}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </OverlayModal>

        {/* ── Edit Subject Modal ── */}
       <OverlayModal
  open={!!editSubject}
  onClose={() => { setEditSubject(null); setEditError(null); }}
  maxW="max-w-lg"
  header={
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Edit Subject</h3>
        <button type="button" onClick={() => { setEditSubject(null); setEditError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">Rename, change the parent, reschedule days/times, or edit planned classes.</p>
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
      <div>
        <label className={labelCls}>Name</label>
        <input value={editSubject.name} onChange={e => setEditSubject({ ...editSubject, name: e.target.value })} inputMode="text" className={inputCls} />
      </div>
      {editSubject.subjectType === 'allied' && editSubject.parentName === 'Small Group Teaching' ? (
        <div>
          <label className={labelCls}>Clinical Subject</label>
          <select
            value={editSubject.clinicalSubject || ''}
            onChange={e => setEditSubject({ ...editSubject, clinicalSubject: e.target.value })}
            className={inputCls}
          >
            {allClinicalSubjects.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      ) : editSubject.subjectType === 'allied' ? (
        <div>
          <label className={labelCls}>Parent</label>
          <select value={editSubject.parentName} onChange={e => setEditSubject({ ...editSubject, parentName: e.target.value })} className={inputCls}>
            {!academicParentOptions.includes(editSubject.parentName) && !groupedParents.parents.includes(editSubject.parentName) && !groupedParents.singles.includes(editSubject.parentName) && editSubject.parentName && <option value={editSubject.parentName}>{editSubject.parentName}</option>}
            <optgroup label="Parents">
              {groupedParents.parents.map(p => <option key={p} value={p}>{p}</option>)}
            </optgroup>
            <optgroup label="Subjects (becomes parent)">
              {groupedParents.singles.map(p => <option key={p} value={p}>{p}</option>)}
            </optgroup>
          </select>
        </div>
      ) : null}
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
    </div>
  )}
</OverlayModal>
        
        {/* ── Edit Ward Modal ── */}
       <OverlayModal
  open={!!editWard}
  onClose={() => { setEditWard(null); setEditError(null); }}
  maxW="max-w-lg"
  header={
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Edit Rotation</h3>
        <button type="button" onClick={() => { setEditWard(null); setEditError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">Change the ward name, rotation dates, or session times.</p>
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
    </div>
  )}
</OverlayModal>

        {/* ── Edit Slot Modal (E2: shows current position) ── */}
        <OverlayModal
  open={!!editSlot}
  onClose={closeEditSlot}
  maxW="max-w-lg"
  header={editSlot ? (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-bold text-foreground">Edit Slot</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {editSlot.multiSelectMode
            ? 'Select subject cards you want to reallocate/re-slot.'
            : 'Change time, day, or planned classes for this subject.'}
        </p>
      </div>
      <button type="button" onClick={closeEditSlot} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
    </div>
  ) : undefined}
  footer={
    !editSlot ? undefined :
    slotConflict ? (
      <div className="flex gap-2">
        <button type="button" onClick={() => setSlotConflict(null)} className={cn(btnGhost, 'flex-1')}>Cancel</button>
        <button type="button" onClick={() => { const fn = slotConflict.onConfirm; setSlotConflict(null); fn(); }} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Merge anyway</button>
      </div>
    ) : editSlot.multiSelectMode ? (
      showMoveForm ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => { setShowMoveForm(false); setSelectedSubjects([]); setEditError(null); setSlotConflict(null); }} className={cn(btnGhost, 'flex-1')}>Cancel</button>
          <button type="button" onClick={doMoveSubjects} className={cn(btnPrimary, 'flex-1')}>Move Selected</button>
        </div>
      ) : undefined
    ) : (
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={closeEditSlot} className={btnGhost}>Cancel</button>
        <button type="button" onClick={() => { if (editSlot) doMoveSubjects([editSlot.subjects[0].id]); }} className={btnPrimary}>Apply</button>
      </div>
    )
  }
>
  {editSlot && (
    <div className="p-4 sm:p-5 space-y-3.5">
      <Note note={note} />
      {editError && <p className={inlineErrCls}>{editError}</p>}
      {slotConflict ? (
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
                    const actualTime = canonicalTimeRange(editSlot.startTime, editSlot.endTime);
                    setSlotRemove({
                      subject: s.name,
                      day: editSlot.day,
                      index: editSlot.index,
                      time: actualTime,
                      start: editSlot.startTime,
                      end: editSlot.endTime,
                    });
                    setSlotRemoveConfirm(true);
                  }} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={selectedSubjects.length === editSlot.subjects.length}
                onChange={selectAllSubjects}
                className="w-4 h-4 rounded border-primary/60 text-primary accent-primary focus:ring-primary/20 focus:ring-2 focus:ring-offset-0 transition-all cursor-pointer"
              />
              <label className="text-[10px] font-medium text-muted-foreground">Select All</label>
            </div>
          </div>
          {showMoveForm && selectedSubjects.length > 0 && (
            <div className="border-t border-border/40 pt-3 mt-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Move selected subjects</p>
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
              {selectedSubjects.map(id => {
                const sub = editSlot.subjects.find(s => s.id === id);
                if (!sub) return null;
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span className="text-xs font-bold flex-1" style={{ color: getSubjectColor(sub.name) }}>{sub.name}</span>
                    <label className="text-[10px] text-muted-foreground">Planned:</label>
                    <input type="number" min={0} value={slotMovePlanned[id] !== undefined ? slotMovePlanned[id] : sub.planned}
                      onChange={e => updatePlannedForSubject(id, parseInt(e.target.value, 10) || 0)}
                      className="w-16 h-8 bg-background border border-border rounded-lg px-1.5 text-xs" />
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
          <div>
            <label className={labelCls}>Subject</label>
            <div className="bg-muted/30 p-2 rounded-lg">
              <span className="text-xs font-bold" style={{ color: getSubjectColor(editSlot.subjects[0].name) }}>{editSlot.subjects[0].name}</span>
              <div className="flex items-center gap-2 mt-1">
                <label className="text-[10px] text-muted-foreground">Planned:</label>
                <input type="number" min={0} value={slotMovePlanned[editSlot.subjects[0].id] !== undefined ? slotMovePlanned[editSlot.subjects[0].id] : editSlot.subjects[0].planned}
                  onChange={e => updatePlannedForSubject(editSlot.subjects[0].id, parseInt(e.target.value, 10) || 0)}
                  className="w-20 h-8 bg-background border border-border rounded-lg px-1.5 text-xs" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )}
</OverlayModal>

        {/* ── Slot Remove Confirmation Modal ── */}
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
                <button type="button" onClick={confirmSlotRemove} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Remove</button>
              </div>
            </div>
          )}
        </OverlayModal>

        {/* ── Subject Triage Modal ── */}
        <OverlayModal open={opdOpen} onClose={() => setOpdOpen(false)} maxW="max-w-2xl">
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Subject Triage</h3>
                <p className="text-[10px] text-muted-foreground">View, rename, reassign, or delete subjects. Preset subjects can only be renamed.</p>
              </div>
              <button type="button" onClick={() => setOpdOpen(false)} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <Note note={note} />
            <div className="flex gap-2 w-full">
              {subjectMode === 'preloaded' && (
                <button type="button" onClick={() => setTriageTop('preset')}
                  className={cn('flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border',
                    triageTop === 'preset' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted/40')}>
                  Preset
                </button>
              )}
              <button type="button" onClick={() => setTriageTop('added')}
                className={cn('flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border',
                  triageTop === 'added' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted/40')}>
                {subjectMode === 'preloaded' ? 'Added' : 'Custom'}
              </button>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{section === 'academic' ? 'Academic subjects' : 'Clinical subjects'}</p>
            <div className="space-y-1 h-[50vh] overflow-y-auto pr-1">
              {triageTop === 'preset' && subjectMode === 'preloaded' && (
                <>
                  {section === 'academic' ? (
                    <>
                      {CATEGORIES.flatMap(c => c.subjects).map(s => (
                        <SubjectTriageCard
                          key={s.name}
                          name={getPresetSubjectDisplayName(s.name)}
                          isPreset={true}
                          store="userAdded"
                          id={s.name}
                          parentOptions={[]}
                          currentParent=""
                          canChangeParent={false}
                          canDelete={false}
                          onRename={() => {}}
                          onDelete={() => {}}
                          opdRename={opdRename}
                          opdEditing={opdEditing}
                          toggleEdit={toggleOpdEdit}
                          updateRename={updateOpdRename}
                          saveRename={saveOpdRename}
                        />
                      ))}
                      {INTEGRATED_SUBJECTS.map(s => (
                        <SubjectTriageCard
                          key={s.name}
                          name={getPresetSubjectDisplayName(s.name)}
                          isPreset={true}
                          store="userAdded"
                          id={s.name}
                          parentOptions={[]}
                          currentParent=""
                          canChangeParent={false}
                          canDelete={false}
                          onRename={() => {}}
                          onDelete={() => {}}
                          opdRename={opdRename}
                          opdEditing={opdEditing}
                          toggleEdit={toggleOpdEdit}
                          updateRename={updateOpdRename}
                          saveRename={saveOpdRename}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      {WARD_SUBJECTS.map(w => (
                        <SubjectTriageCard
                          key={w.name}
                          name={getPresetSubjectDisplayName(w.name)}
                          isPreset={true}
                          store="userAdded"
                          id={w.name}
                          parentOptions={[]}
                          currentParent=""
                          canChangeParent={false}
                          canDelete={false}
                          onRename={() => {}}
                          onDelete={() => {}}
                          opdRename={opdRename}
                          opdEditing={opdEditing}
                          toggleEdit={toggleOpdEdit}
                          updateRename={updateOpdRename}
                          saveRename={saveOpdRename}
                        />
                      ))}
                      {/* SGT reassignment via direct update */}
                      {userAddedSubjects.filter(s => isSGTRecord(s)).map(s => (
                        <SubjectTriageCard
                          key={s.id}
                          name={s.name}
                          isPreset={false}
                          store="userAdded"
                          id={s.id}
                          parentOptions={allClinicalSubjects.map(n => ({ value: n, label: n }))}
                          currentParent={(s as any).clinicalSubject || ''}
                          canChangeParent={true}
                          canDelete={true}
                          onRename={() => {}}
                          onDelete={() => deleteOpdSubject(s.id, 'userAdded', s.name)}
                          opdRename={opdRename}
                          opdEditing={opdEditing}
                          toggleEdit={toggleOpdEdit}
                          updateRename={updateOpdRename}
                          saveRename={saveOpdRename}
                          onParentChange={(newParent: string) => handleSGTParentChange(s, 'userAdded', newParent)}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
              {triageTop === 'added' && (
                <>
                  {section === 'academic' ? (
                    <>
                      {subjectMode === 'preloaded' ? (
                        userAddedSubjects.filter(s => s.subjectType !== 'allied-parent' && !isSGTRecord(s)).map(s => (
                          <SubjectTriageCard
                            key={s.id}
                            name={s.name}
                            isPreset={false}
                            store="userAdded"
                            id={s.id}
                            parentOptions={getParentOptions().filter(p => p !== 'Small Group Teaching')}
                            currentParent={getEffectiveParentName(s) || ''}
                            canChangeParent={true}
                            canDelete={true}
                            onRename={() => {}}
                            onDelete={() => deleteOpdSubject(s.id, 'userAdded', s.name)}
                            opdRename={opdRename}
                            opdEditing={opdEditing}
                            toggleEdit={toggleOpdEdit}
                            updateRename={updateOpdRename}
                            saveRename={saveOpdRename}
                            onParentChange={(newParent: string) => {
                              const moves = [{ id: s.id, store: 'userAdded' as const, newSubjectType: (newParent === SINGLE_DEST ? 'single' : 'allied') as any, newParentName: newParent === SINGLE_DEST ? undefined : newParent }];
                              bulkUpdateSubjectHierarchy(moves);
                              recordHistory('Change Parent', { id: s.id, store: 'userAdded', newParent });
                              showToast('Parent updated.');
                            }}
                          />
                        ))
                      ) : (
                        customSubjects.filter(s => s.subjectType !== 'allied-parent' && !isSGTRecord(s)).map(s => (
                          <SubjectTriageCard
                            key={s.id}
                            name={s.name}
                            isPreset={false}
                            store="custom"
                            id={s.id}
                            parentOptions={getParentOptions().filter(p => p !== 'Small Group Teaching')}
                            currentParent={getEffectiveParentName(s) || ''}
                            canChangeParent={true}
                            canDelete={true}
                            onRename={() => {}}
                            onDelete={() => deleteOpdSubject(s.id, 'custom', s.name)}
                            opdRename={opdRename}
                            opdEditing={opdEditing}
                            toggleEdit={toggleOpdEdit}
                            updateRename={updateOpdRename}
                            saveRename={saveOpdRename}
                            onParentChange={(newParent: string) => {
                              const moves = [{ id: s.id, store: 'custom' as const, newSubjectType: (newParent === SINGLE_DEST ? 'single' : 'allied') as any, newParentName: newParent === SINGLE_DEST ? undefined : newParent }];
                              bulkUpdateSubjectHierarchy(moves);
                              recordHistory('Change Parent', { id: s.id, store: 'custom', newParent });
                              showToast('Parent updated.');
                            }}
                          />
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      {subjectMode === 'preloaded' ? (
                        <>
                          {customWards.map(w => (
                            <SubjectTriageCard
                              key={w.id}
                              name={w.name}
                              isPreset={false}
                              store="custom"
                              id={w.id}
                              parentOptions={[]}
                              currentParent=""
                              canChangeParent={false}
                              canDelete={true}
                              onRename={() => {}}
                              onDelete={() => deleteOpdWard(w.id, w.name)}
                              opdRename={opdRename}
                              opdEditing={opdEditing}
                              toggleEdit={toggleOpdEdit}
                              updateRename={updateOpdRename}
                              saveRename={saveOpdRename}
                            />
                          ))}
                          {userAddedSubjects.filter(s => isSGTRecord(s)).map(s => (
                            <SubjectTriageCard
                              key={s.id}
                              name={s.name}
                              isPreset={false}
                              store="userAdded"
                              id={s.id}
                              parentOptions={allClinicalSubjects.map(n => ({ value: n, label: n }))}
                              currentParent={(s as any).clinicalSubject || ''}
                              canChangeParent={true}
                              canDelete={true}
                              onRename={() => {}}
                              onDelete={() => deleteOpdSubject(s.id, 'userAdded', s.name)}
                              opdRename={opdRename}
                              opdEditing={opdEditing}
                              toggleEdit={toggleOpdEdit}
                              updateRename={updateOpdRename}
                              saveRename={saveOpdRename}
                              onParentChange={(newParent: string) => handleSGTParentChange(s, 'userAdded', newParent)}
                            />
                          ))}
                        </>
                      ) : (
                        <>
                          {customWards.map(w => (
                            <SubjectTriageCard
                              key={w.id}
                              name={w.name}
                              isPreset={false}
                              store="custom"
                              id={w.id}
                              parentOptions={[]}
                              currentParent=""
                              canChangeParent={false}
                              canDelete={true}
                              onRename={() => {}}
                              onDelete={() => deleteOpdWard(w.id, w.name)}
                              opdRename={opdRename}
                              opdEditing={opdEditing}
                              toggleEdit={toggleOpdEdit}
                              updateRename={updateOpdRename}
                              saveRename={saveOpdRename}
                            />
                          ))}
                          {customSubjects.filter(s => isSGTRecord(s)).map(s => (
                            <SubjectTriageCard
                              key={s.id}
                              name={s.name}
                              isPreset={false}
                              store="custom"
                              id={s.id}
                              parentOptions={allClinicalSubjects.map(n => ({ value: n, label: n }))}
                              currentParent={(s as any).clinicalSubject || ''}
                              canChangeParent={true}
                              canDelete={true}
                              onRename={() => {}}
                              onDelete={() => deleteOpdSubject(s.id, 'custom', s.name)}
                              opdRename={opdRename}
                              opdEditing={opdEditing}
                              toggleEdit={toggleOpdEdit}
                              updateRename={updateOpdRename}
                              saveRename={saveOpdRename}
                              onParentChange={(newParent: string) => handleSGTParentChange(s, 'custom', newParent)}
                            />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              {((triageTop === 'preset' && subjectMode === 'preloaded' && section === 'academic' && CATEGORIES.flatMap(c => c.subjects).length === 0 && INTEGRATED_SUBJECTS.length === 0) ||
                (triageTop === 'preset' && subjectMode === 'preloaded' && section === 'clinical' && WARD_SUBJECTS.length === 0 && userAddedSubjects.filter(s => isSGTRecord(s)).length === 0) ||
                (triageTop === 'added' && section === 'academic' && (subjectMode === 'preloaded' ? userAddedSubjects.filter(s => s.subjectType !== 'allied-parent' && !isSGTRecord(s)).length === 0 : customSubjects.filter(s => s.subjectType !== 'allied-parent' && !isSGTRecord(s)).length === 0)) ||
                (triageTop === 'added' && section === 'clinical' && (subjectMode === 'preloaded' ? customWards.length === 0 && userAddedSubjects.filter(s => isSGTRecord(s)).length === 0 : customWards.length === 0 && customSubjects.filter(s => isSGTRecord(s)).length === 0))) && (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-muted-foreground text-center py-5">No subjects found in this section.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setOpdOpen(false)} className={btnPrimary}>Close</button>
            </div>
          </div>
        </OverlayModal>

        {/* ── Delete/Conflict/Import/Export modals ── */}
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
                {conflictSheet.messages.map((m, i) => (
                  <li key={i} className="text-xs text-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{m}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConflictSheet(null)} className={cn(btnGhost, 'flex-1')}>Change details</button>
                <button type="button" onClick={() => { const fn = conflictSheet.onConfirm; setConflictSheet(null); fn(); }} className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Add anyway</button>
              </div>
            </div>
          )}
        </OverlayModal>
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
            <div className="border-t border-border/40 pt-3 mt-2">
              <p className="text-[10px] text-muted-foreground font-medium mb-2">Need a routine bundle? Copy this prompt to an AI assistant:</p>
              <button
                onClick={async () => {
                  const prompt = `You are helping me build a routine bundle for "Attendenz Tracker". Respond with ONLY a valid JSON object matching this exact schema:\n{\n  "version": 2,\n  "subjectMode": "preloaded" | "custom",\n  "addedSubjects": [\n    {\n      "name": "string",\n      "type": "single" | "allied" | "allied-parent",\n      "parentCategory": "string" | null,\n      "planned": number,\n      "schedules": [{ "day": "Mon", "start": "HH:MM", "end": "HH:MM" }],\n      "clinicalSubject": "string" | null,\n      "startDate": "yyyy-mm-dd" | null,\n      "endDate": "yyyy-mm-dd" | null\n    }\n  ],\n  "customWards": [\n    {\n      "name": "string",\n      "startDate": "yyyy-mm-dd",\n      "endDate": "yyyy-mm-dd",\n      "morningTime": "hh:mm AM–hh:mm PM",\n      "eveningTime": "hh:mm PM–hh:mm PM"\n    }\n  ],\n  "presetTimetable": {\n    "0": [{ "time": "hh:mm AM–hh:mm AM", "type": "lecture", "subjects": ["string"] }]\n  },\n  "presetWardSchedule": [\n    { "start": "yyyy-mm-dd", "end": "yyyy-mm-dd", "ward": "string", "morningTime": "...", "eveningTime": "..." }\n  ],\n  "presetSubjectTotals": { "Subject": number }\n}\nRules:\n- Schedules use 24h HH:MM (the app canonicalizes on import).\n- Never include attendance data (attended/missed/off marks, student names, etc.).\n- For clinical rotations, use a single continuous date range (do not split on holidays).\n- The app handles holidays internally.\n- Include only routine data – no personal information.`;
                  await navigator.clipboard.writeText(prompt);
                  showToast('AI prompt copied to clipboard.');
                }}
                className={cn(btnGhost, 'w-full flex items-center justify-center gap-2 text-xs')}
              >
                <Copy className="w-3.5 h-3.5" /> Copy prompt for AI
              </button>
            </div>
          </div>
        </OverlayModal>
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
                  {[...preview.report.subjectsSkip, ...preview.report.wardsSkip].map((s, i) => (
                    <p key={i} className="text-[11px] text-foreground">• {s}</p>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={applyMerge} className={cn(btnPrimary, 'flex-1')}>Merge</button>
                <button type="button" onClick={applyReplace} className="flex-1 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs hover:opacity-90 transition-all cursor-pointer">Replace</button>
              </div>
            </div>
          )}
        </OverlayModal>
      </motion.div>
    </Layout>
  );
}
