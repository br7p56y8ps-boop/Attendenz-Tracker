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
  Check, ChevronDown, ChevronRight, Edit2, History,
} from 'lucide-react';

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

function ClinicalGroupCard({
  name,
  hasRotation,
  hasSGT,
  rotation,
  sgt,
  onAddRotation,
  onAddSGT,
  onEditRotation,
  onEditSGT,
  onDeleteRotation,
  onDeleteSGT,
}: any) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-background/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/20 transition-colors text-left"
      >
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
                <button type="button" onClick={onEditRotation} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={onDeleteRotation} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
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
                <button type="button" onClick={onEditSGT} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={onDeleteSGT} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
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

function SubjectTriageCard({
  name, isPreset, store, id, parentOptions, currentParent, canChangeParent, canDelete,
  onRename, onDelete, opdRename, opdEditing, toggleEdit, updateRename, saveRename, onParentChange
}: any) {
  const [showParentDropdown, setShowParentDropdown] = useState(false);
  const isEditing = opdEditing[id] || false;
  const renameValue = opdRename[id] !== undefined ? opdRename[id] : name;

  return (
    <div className="flex items-center gap-2 bg-card border border-border/50 rounded-lg p-2.5">
      {isEditing ? (
        <div className="flex-1 flex items-center gap-1">
          <input value={renameValue} onChange={e => updateRename(id, e.target.value)} className={cn(inputCls, 'h-8 text-xs flex-1')} autoFocus />
          <button type="button" onClick={() => saveRename(id, store, name)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10"><Check className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => toggleEdit(id)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <>
          <span className="text-xs font-bold flex-1" style={{ color: getSubjectColor(name) }}>{name}</span>
          {isPreset && <span className="text-[9px] text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">Preset</span>}
          <button type="button" onClick={() => toggleEdit(id)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><Edit2 className="w-3.5 h-3.5" /></button>
          {canChangeParent && (
            <div className="relative">
              <button type="button" onClick={() => setShowParentDropdown(!showParentDropdown)} className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10">
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
              {showParentDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-10 min-w-[150px]">
                  {parentOptions.map((opt: any) => (
                    <button key={opt.value || opt} onClick={() => { onParentChange(opt.value || opt); setShowParentDropdown(false); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded-md">
                      {opt.label || opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canDelete && (
            <button type="button" onClick={onDelete} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </>
      )}
    </div>
  );
}

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
  const [addSlotPlanned, setAddSlotPlanned] = useState<number>(0);

  const [historyOpen, setHistoryOpen] = useState(false);

  const isAllied = subjectType === 'allied';
  const resolvedParent = parentChoice === CREATE_NEW ? newParentName.trim() : parentChoice.trim();
  const parentIsNew = resolvedParent ? !(PRESET_PARENTS.includes(resolvedParent) || isExistingParent(resolvedParent)) : false;
  const parentIsSGT = resolvedParent ? PRESET_PARENTS.includes(resolvedParent) : false;

  const academicParentOptions = useMemo(() => {
    const all = getParentOptions();
    return all.filter(p => p !== 'Small Group Teaching');
  }, [getParentOptions]);

  const groupedParents = useMemo(() => {
    const store = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const derived = store.filter(s => s.subjectType === 'allied').map(s => getEffectiveParentName(s)).filter((p): p is string => !!p);
    const allParents = Array.from(new Set([
      ...(subjectMode === 'preloaded' ? [...PRESET_PARENTS.filter(p => p !== 'Small Group Teaching'), ...CATEGORIES.map(c => c.name), 'Integrated Teaching'] : []),
      ...store.filter(s => s.subjectType === 'allied-parent').map(s => s.name),
      ...derived,
    ]));
    const allSubjects = store.map(s => s.name);
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

  const isSGTSubject = (subjectName: string): boolean => {
    const name = subjectName.trim().toLowerCase();
    const allSGTs = [...userAddedSubjects, ...customSubjects].filter(
      s => s.parentName === 'Small Group Teaching'
    );
    return allSGTs.some(s => s.name.toLowerCase() === name);
  };

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
    const totals = { ...presetSubjectTotals };
    if (totals[oldName] !== undefined) {
      totals[newName] = totals[oldName];
      delete totals[oldName];
      if (totals[newName] !== undefined) {
        updatePresetSubjectTotal(newName, totals[newName]);
        updatePresetSubjectTotal(oldName, 0);
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

  useEffect(() => {
    const migrateSGTs = () => {
      let changed = false;
      const nextUA = userAddedSubjects.map(s => {
        if (s.parentName === 'Small Group Teaching' && !(s as any).clinicalSubject) {
          const derived = s.name.replace(/\s*SGT\s*$/i, '').trim() || s.name;
          changed = true;
          return { ...s, clinicalSubject: derived };
        }
        return s;
      });
      if (changed) {
        nextUA.forEach(s => {
          if (s.id && (s as any).clinicalSubject) {
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
    if (subjectMode === 'preloaded') {
      const preset = CATEGORIES.flatMap(c => c.subjects).map(s => s.name);
      const integrated = INTEGRATED_SUBJECTS.map(s => s.name);
      const added = userAddedSubjects
        .filter(s => s.subjectType !== 'allied-parent' && !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'))
        .map(s => s.name);
      return Array.from(new Set([...preset, ...integrated, ...added])).sort();
    } else {
      return customSubjects
        .filter(s => s.subjectType !== 'allied-parent' && !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching'))
        .map(s => s.name)
        .sort();
    }
  }, [subjectMode, userAddedSubjects, customSubjects]);

  const openAddSlot = () => {
    setAddSlotSubject('');
    setAddSlotStart('09:00 AM');
    setAddSlotEnd('10:00 AM');
    setAddSlotPlanned(0);
    setFormError(null);
    setAddSlotOpen(true);
  };

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

    if (subjectMode === 'preloaded') {
      const existingIdx = (presetTimetable[selDay] || []).findIndex(s => canonicalizeTimeRange(s.time) === time);
      if (existingIdx >= 0) {
        const existing = presetTimetable[selDay][existingIdx];
        const merged = Array.from(new Set([...existing.subjects, addSlotSubject]));
        updatePresetTimetableSlot(selDay, existingIdx, existing.time, merged, selDay);
      } else {
        addSubjectToSlot(selDay, time, addSlotSubject);
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

  const handleSaveSubject = () => {
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
        setConflictSheet({ messages, onConfirm: () => { setConflictSheet(null); commitSubjects(items); } });
        return;
      }
      commitSubjects(items);
    } catch {
      showToast('Failed to check/save — please try again.', 'err');
    }
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
      setSubjectName(''); setPlanned(''); setSubjectRows([newRow([])]); setStagedChildren([]); setNewParentName(''); setChildStart(''); setChildEnd('');
      setFormError(null);
      showToast(items.length > 1 ? `${items.length} items added.` : 'Added successfully.');
      setConflictSheet(null);
      window.setTimeout(() => { setConflictSheet(null); setMoreOpen(false); }, 900);
    } catch {
      showToast('Failed to save — please try again.', 'err');
    }
  };

  const addSgtRow = () => {
    if (sgtRows.length >= 7) { setFormError('Maximum 7 day & time rows.'); return; }
    setSgtRows(prev => [...prev, newRow(prev.map(r => r.day))]);
  };
  const updateSgtRow = (id: string, patch: Partial<ScheduleRow>) => setSgtRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeSgtRow = (id: string) => setSgtRows(prev => prev.filter(r => r.id !== id));

  const commitWard = (name: string, start: string, end: string, morningTime: string, eveningTime: string) => {
    try {
      if (subjectMode === 'preloaded') addPresetWardEntry({ start, end, ward: name, morningTime, eveningTime, addedByUser: true });
      else addCustomWard({ name, startDate: start, endDate: end, morningTime, eveningTime });
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

      const existingSGTNames = (subjectMode === 'preloaded' ? userAddedSubjects : customSubjects)
        .filter(s => s.parentName === 'Small Group Teaching')
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

  const updateSubjectSchedule = (name: string, oldDay: number, newDay: number, oldStart: string, oldEnd: string, newStart: string, newEnd: string) => {
    const ua = userAddedSubjects.find(u => u.name.toLowerCase() === name.toLowerCase());
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
    const targetSlots = presetTimetable[targetDay] || [];
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
    const sourceSlot = presetTimetable[currentDay]?.[currentIndex];
    if (!sourceSlot) return;
    const { start: oldStart, end: oldEnd } = splitRange(sourceSlot.time);
    const sourceSubjects = sourceSlot.subjects.filter(s => !names.includes(s));
    if (sourceSubjects.length === 0) {
      updatePresetTimetableSlot(currentDay, currentIndex, sourceSlot.time, [], currentDay);
    } else {
      updatePresetTimetableSlot(currentDay, currentIndex, sourceSlot.time, sourceSubjects, currentDay);
    }
    const targetSlots = presetTimetable[targetDay] || [];
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
    }).filter(Boolean);
    plannedUpdates.forEach(({ name, planned }) => {
      const ua = userAddedSubjects.find(u => u.name === name);
      if (ua) {
        updateUserAddedSubject(ua.id, { plannedClasses: planned } as any);
      } else {
        updatePresetSubjectTotal(name, planned);
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
    showToast(`Moved ${names.length} subject(s).`);
  };

  const confirmSlotRemove = () => {
    if (!slotRemove) return;
    try {
      const slot = presetTimetable[slotRemove.day]?.[slotRemove.index];
      if (slot) {
        const remaining = slot.subjects.filter(s => s !== slotRemove.subject);
        if (remaining.length === 0) {
          updatePresetTimetableSlot(slotRemove.day, slotRemove.index, slot.time, [], slotRemove.day);
        } else {
          updatePresetTimetableSlot(slotRemove.day, slotRemove.index, slot.time, remaining, slotRemove.day);
        }
        const ua = userAddedSubjects.find(u => u.name.toLowerCase() === slotRemove.subject.toLowerCase());
        if (ua) {
          const existing = ua.schedules || [];
          const filtered = existing.filter(s => !(s.day === DAY_ABBRS[slotRemove.day] && s.start === slotRemove.start && s.end === slotRemove.end));
          updateUserAddedSubject(ua.id, { schedules: filtered, days: filtered.map(s => s.day).join(', ') } as any);
        }
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
    const lines = [
      `The "${item.name}" subject card`,
      'All timetable slots referencing it',
      'Calendar / schedule entries',
      'All attendance records (attended, missed, finished)',
    ];
    if (item.subjectType === 'allied-parent') lines.push('All allied children nested under this parent');
    setDeleteSheet({
      title: `Delete "${item.name}"?`,
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

          if (item.subjectType === 'allied' && item.parentName === 'Small Group Teaching') {
            removeAttendanceByKey(getSGTKey(item.id));
          } else {
            for (const n of namesToPurge) {
              removeSubjectData(n);
            }
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
      const occurrences = presetWardSchedule.filter(x => x.ward.toLowerCase() === e.ward.toLowerCase()).length;
      setDeleteSheet({
        title: `Delete rotation "${e.ward}"?`,
        lines: ['This rotation period', 'Calendar / schedule entries', occurrences <= 1 ? 'All attendance records for this ward' : 'Attendance is kept (ward has other periods)'],
        onConfirm: () => {
          try {
            removePresetWardEntry(idx);
            if (occurrences <= 1) removeWardData(e.ward);
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
        if (!isSGT) {
          renameSubjectData(editSubject.originalName, editSubject.name);
        }
      }
      setEditError(null);
      showToast('Changes saved.');
      window.setTimeout(() => setEditSubject(null), 900);
    } catch { showToast('Failed to save changes — please try again.', 'err'); }
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

  const openOpd = () => {
    setOpdRename({});
    setOpdEditing({});
    if (subjectMode === 'preloaded') {
      setTriageTop('preset');
    } else {
      setTriageTop('added');
    }
    setTriageSub('academic');
    setOpdOpen(true);
  };

  const toggleOpdEdit = (id: string) => {
    setOpdEditing(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const updateOpdRename = (id: string, value: string) => {
    setOpdRename(prev => ({ ...prev, [id]: value }));
  };

  const saveOpdRename = (id: string, store: 'userAdded' | 'custom', currentName: string) => {
    const newName = opdRename[id]?.trim() || currentName;
    if (newName === currentName) { toggleOpdEdit(id); return; }
    const isPresetAcademic = CATEGORIES.flatMap(c => c.subjects).some(s => s.name === currentName) ||
                             INTEGRATED_SUBJECTS.some(s => s.name === currentName);
    const isPresetClinical = WARD_SUBJECTS.some(s => s.name === currentName);
    if (isPresetAcademic) {
      renameSubjectData(currentName, newName);
      renamePresetAcademicSubject(currentName, newName);
      setPresetSubjectRename(currentName, newName);
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
    const target = store === 'userAdded'
      ? userAddedSubjects.find(s => s.id === id)
      : customSubjects.find(s => s.id === id);
    if (target?.subjectType === 'allied' && target.parentName === 'Small Group Teaching') {
      if (store === 'userAdded') {
        updateUserAddedSubject(id, { name: newName });
      } else {
        updateCustomSubject(id, { name: newName });
      }
      showToast(`Renamed to "${newName}".`);
      toggleOpdEdit(id);
      return;
    }
    if (isSubjectNameTaken(newName, currentName)) {
      showToast(`"${newName}" already exists.`, 'err');
      return;
    }
    renameSubjectData(currentName, newName);
    if (store === 'userAdded') {
      const item = userAddedSubjects.find(s => s.id === id);
      if (item) updateUserAddedSubject(id, { name: newName });
    } else {
      const item = customSubjects.find(s => s.id === id);
      if (item) updateCustomSubject(id, { name: newName });
    }
    showToast(`Renamed to "${newName}".`);
    toggleOpdEdit(id);
  };

  const saveOpdParent = (id: string, store: 'userAdded' | 'custom', newParent: string) => {
    const moves = [{
      id,
      store: store as 'userAdded' | 'custom',
      newSubjectType: newParent === SINGLE_DEST ? 'single' : 'allied',
      newParentName: newParent === SINGLE_DEST ? undefined : newParent,
    }];
    bulkUpdateSubjectHierarchy(moves);
    const item = store === 'userAdded' ? userAddedSubjects.find(s => s.id === id) : customSubjects.find(s => s.id === id);
    if (item && item.parentName === 'Small Group Teaching' && newParent !== SINGLE_DEST) {
      const patch = { clinicalSubject: newParent };
      if (store === 'userAdded') updateUserAddedSubject(id, patch as any);
      else updateCustomSubject(id, patch as any);
    }
    showToast('Parent updated.');
  };

  const deleteOpdSubject = (id: string, store: 'userAdded' | 'custom', name: string) => {
    setDeleteSheet({
      title: `Delete "${name}"?`,
      lines: ['This subject and all its attendance records will be permanently removed.', 'This action cannot be undone.'],
      onConfirm: () => {
        const target = store === 'userAdded'
          ? userAddedSubjects.find(s => s.id === id)
          : customSubjects.find(s => s.id === id);
        if (store === 'userAdded') removeUserAddedSubject(id);
        else removeCustomSubject(id);
        if (target?.subjectType === 'allied' && target.parentName === 'Small Group Teaching') {
          removeAttendanceByKey(getSGTKey(id));
        } else {
          removeSubjectData(name);
        }
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
        schedules: (s.schedules && s.schedules.length) ? s.schedules : parseDayList(s.days).map((d: string) => {
          const { start, end } = splitRange(s.time);
          return { day: d, start: to12h(parseRangeToMinutes(start)?.start || 0), end: to12h(parseRangeToMinutes(end)?.end || 0) };
        }),
        clinicalSubject: (s as any).clinicalSubject || undefined,
        startDate: (s as any).startDate || undefined,
        endDate: (s as any).endDate || undefined,
      })),
      customWards: customWards.map(w => ({ name: w.name, startDate: w.startDate, endDate: w.endDate, morningTime: w.morningTime, eveningTime: w.eveningTime })),
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

  const applyMerge = () => {
    if (!preview) return;
    try {
      const b = preview.bundle;
      const items: any[] = [];
      for (const s of b.addedSubjects || []) {
        if (isSubjectNameTaken(s.name)) continue;
        const rows = (s.schedules || []).map(sch => {
          const st = to12h(sch.start || '09:00'), en = to12h(sch.end || '10:00');
          return { day: sch.day, time: canonicalTimeRange(st, en), start: st, end: en };
        });
        if (!rows.length) rows.push({ day: 'Mon', time: canonicalTimeRange('09:00 AM', '10:00 AM'), start: '09:00 AM', end: '10:00 AM' });
        const overlaps = rows.some(r => findSubjectTimeConflicts([r.day], r.time, undefined).some(c => !c.exact));
        if (overlaps) continue;
        items.push({ name: s.name, subjectType: (s.type as any) || 'single', parentName: s.parentCategory || undefined, plannedClasses: s.planned ?? 0, rows, clinicalSubject: s.clinicalSubject, startDate: s.startDate, endDate: s.endDate });
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
            className="w-9 h-9 rounded-xl bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer shrink-0"
            title="History"
          >
            <History className="w-4.5 h-4.5" />
          </button>
        </div>
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
                <span className="text-xs text-muted-foreground font-semibold">
                  {subjectMode === 'preloaded' ? presetTimetable[selDay]?.filter(s => s.type !== 'ward' && s.type !== 'ward_replacement').length || 0 : customSubjects.filter(s => s.subjectType !== 'allied-parent' && parseDayList(s.days).includes(DAY_ABBRS[selDay])).length} Slots
                </span>
              </div>
              {subjectMode === 'preloaded' && presetTimetable[selDay]?.map((slot, idx) => {
                if (slot.type === 'ward' || slot.type === 'ward_replacement') return null;
                if (!slot.subjects || slot.subjects.length === 0) return null;
                const nonSGTSubjects = slot.subjects.filter(s => !isSGTSubject(s));
                if (nonSGTSubjects.length === 0) return null;
                const displayNames = nonSGTSubjects.map(s => getPresetSubjectDisplayName(s));
                return (
                  <div key={`${selDay}-${idx}`} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-bold text-primary text-xs">{canonicalizeTimeRange(slot.time)}</p>
                      <p className="font-extrabold text-foreground text-sm leading-tight truncate mt-0.5" style={{ color: getSubjectColor(displayNames[0] || '') }}>
                        {displayNames.join(', ')}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {nonSGTSubjects.map((s, index) => `${displayNames[index]}: ${getSubjectPlannedTotal(s)} planned`).join(' · ')}
                      </p>
                      {nonSGTSubjects.some(s => isUserAddedName(s)) && <div className="mt-1"><AddedBadge /></div>}
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
                  if (isSGTSubject(s.name)) return null;
                  const row = s.schedules?.find(sch => sch.day === DAY_ABBRS[selDay]);
                  const time = row ? canonicalizeTimeRange(row.time) : canonicalizeTimeRange(s.time);
                  return (
                    <div key={s.id} className="bg-background/50 border border-border/60 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-bold text-primary text-xs">{time}</p>
                        <p className="font-extrabold text-foreground text-sm leading-tight truncate mt-0.5" style={{ color: getSubjectColor(s.name) }}>{s.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{s.name}: {s.plannedClasses} planned{getEffectiveParentName(s) ? ` · under ${getEffectiveParentName(s)}` : ''}</p>
                      </div>
                      <button type="button" onClick={() => openEditSubject('custom', s.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"><Pencil className="w-4 h-4" /></button>
                      <button type="button" onClick={() => requestDeleteSubject('custom', s.id)} className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
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
                        if (group.rotation.store === 'preset') openEditWardPreset(group.rotation.index!);
                        else openEditWardCustom(group.rotation.id!);
                      }}
                      onEditSGT={() => {
                        const store = getSGTStore(group.sgt);
                        openEditSubject(store, group.sgt!.id);
                      }}
                      onDeleteRotation={() => {
                        if (group.rotation.store === 'preset') requestDeleteWard('preset', group.rotation.index!);
                        else requestDeleteWard('custom', group.rotation.id!);
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

        <OverlayModal open={moreOpen} onClose={() => { setMoreOpen(false); setFormError(null); }} maxW="max-w-lg">
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                {section === 'academic' ? 'Add New Subject' : 'Add New Clinical Item'}
              </h3>
              <button type="button" onClick={() => { setMoreOpen(false); setFormError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {/* ... rest of more modal forms ... */}
          </div>
        </OverlayModal>

        <OverlayModal open={addSlotOpen} onClose={() => { setAddSlotOpen(false); setFormError(null); }} maxW="max-w-sm">
          <div className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Add Slot</h3>
              <button type="button" onClick={() => { setAddSlotOpen(false); setFormError(null); }} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
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
            <button type="button" onClick={saveAddSlot} className={cn(btnPrimary, 'w-full flex items-center justify-center gap-1.5')}>
              <Plus className="w-3.5 h-3.5" /> Add Slot
            </button>
          </div>
        </OverlayModal>

        <OverlayModal open={historyOpen} onClose={() => setHistoryOpen(false)} maxW="max-w-md">
          <div className="p-4 sm:p-5 space-y-3.5 max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">History</h3>
              <button type="button" onClick={() => setHistoryOpen(false)} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2">
              {/* Show snapshots with label starting "Manage:" */}
              {getSnapshots().filter(s => s.label.startsWith('Manage:')).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-5">No Manage actions yet.</p>
              ) : (
                getSnapshots().filter(s => s.label.startsWith('Manage:')).map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-background border border-border/60 rounded-xl p-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{s.label.replace('Manage: ', '')}</p>
                      <p className="text-[10px] text-muted-foreground">{s.timestamp}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (restoreSnapshot(s.id)) {
                          setHistoryOpen(false);
                          window.location.reload();
                        } else {
                          showToast('Failed to undo action.', 'err');
                        }
                      }}
                      className="text-xs font-semibold text-primary hover:underline px-2 py-1 rounded-lg bg-primary/10 cursor-pointer shrink-0"
                    >
                      Undo
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </OverlayModal>
      </motion.div>
    </Layout>
  );
}