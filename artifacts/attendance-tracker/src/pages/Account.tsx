import { Camera, Trash2, Sparkles, AlertCircle, Camera as SnapshotIcon, RefreshCw, Eraser, Clock, Download, ChevronRight, Send, FileText, Database, FileSpreadsheet, Info, GraduationCap, X, Upload, Vibrate, Volume2, Bell } from 'lucide-react';
import { createSnapshot, getSnapshots, restoreSnapshot, clearLocalCache, autoSnapshotOnLoad, exportDataAsJSON, importDataFromJSON, Snapshot, shareDataAsJSON } from '../utils/snapshotUtils';
import { assertBackupSize, validateBackupPayload, MAX_BACKUP_BYTES } from '../utils/dataTransferSecurity';
import React, { useRef, useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { StickySectionLabel } from '@/components/StickySectionLabel';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useLocation } from 'wouter';
import { activateCurriculum, createCurriculum, getActiveCurriculumId, getActiveCurriculumName, getCurricula, renameCurriculum, setCurriculumStatus as persistCurriculumStatus, CurriculumRecord } from '@/lib/curriculumStore';
import { idbRemoveMany, idbSetMany, storageClear, storageSetItem, storageRemoveItem, flushStorageWrites } from '@/lib/idb';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { applyThemePreference, readThemePreference, type ThemePreference } from '@/lib/theme';
import { getSoundEnabled, getSoundVolume, getVibrationEnabled, getVibrationStyle, isVibrationSupported, setSoundEnabled, setSoundVolume, setVibrationEnabled, setVibrationStyle, triggerConfirmationFeedback, testConfirmationFeedback, type VibrationStyle } from '@/lib/feedback';
import { getNotificationPermission, getNotificationPreferences, getSystemNotificationsEnabled, setNotificationPreferences, setSystemNotificationsEnabled, testSystemNotification, type NotificationLeadMinutes, type NotificationPermissionState, type NotificationPreferences } from '@/lib/notifications';
import { getReminderSyncStatus, REMINDER_SYNC_STATUS_CHANGED_EVENT, type ReminderSyncStatus } from '@/lib/reminderSync';
import { disableOneSignalPush, enableOneSignalPush, isOneSignalProductionConfigured, ONE_SIGNAL_PRODUCTION_ORIGIN, prepareOneSignal } from '@/lib/onesignal';
import { lockScroll, unlockScroll } from '@/lib/scrollLock';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { CATEGORIES, WARD_SUBJECTS, INTEGRATED_SUBJECTS } from '@/lib/constants';
import { generatePDFReport, generateExcelReport, generateCSVReport } from '@/lib/exportUtils';
import maleStudentProfile from '@/assets/images/male_student_profile_1784286906428.jpg';
import femaleStudentProfile from '@/assets/images/female_student_profile_1784286920737.jpg';
import neutralStudentProfile from '@/assets/images/neutral_student_profile_1784286934617.jpg';

const SNAPSHOTS_KEY = 'attendenz_snapshots_v1';
const ORPHANED_RECORDS_KEY = 'attendance_tracker_orphaned_records';

function SettingToggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40', checked ? 'border-primary/70 bg-primary/80' : 'border-border bg-muted/60', disabled && 'cursor-not-allowed opacity-40')}>
      <span className={cn('h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', checked ? 'translate-x-5' : 'translate-x-1')} />
    </button>
  );
}

function SettingRow({ icon, title, description, onClick, tone = 'primary' }: { icon: React.ReactNode; title: string; description?: string; onClick: () => void; tone?: 'primary' | 'blue' | 'violet' | 'amber' | 'emerald' | 'danger' }) {
  const toneClass = tone === 'danger' ? 'bg-destructive/10 text-destructive border-destructive/20' : tone === 'blue' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : tone === 'violet' ? 'bg-violet-500/10 text-violet-500 border-violet-500/20' : tone === 'amber' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-primary/10 text-primary border-primary/20';
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between gap-3 text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
      <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border', toneClass)}>{icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold text-xs text-foreground">{title}</span>{description && <span className="block text-[10px] text-muted-foreground mt-0.5">{description}</span>}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function notifySuccess(message: string): void {
  triggerConfirmationFeedback('success');
  import('sonner').then(({ toast }) => toast.success(message));
}
// Returns 1 if a>b, -1 if a<b, 0 if equal
function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export default function Account() {
  const { username, updateUsername, profileImage, updateProfileImage, isPersistentStorage, requestPersistentStorage } = useAuth();
  const [, setLocation] = useLocation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(username);
  useEffect(() => { setNameInput(username); }, [username]);
  const handleSaveName = () => { if (nameInput.trim()) updateUsername(nameInput.trim()); setIsEditingName(false); };
  const { subjects, wards, homeSelections, preferredPercentage, setPreferredPercentage } = useAttendance();
  const quarantineUnresolvedAttendance = (type: 'subject' | 'ward', name: string, data: unknown) => {
    try {
      const existing = JSON.parse(localStorage.getItem(ORPHANED_RECORDS_KEY) || '[]');
      const originalKey = type === 'ward' ? `ward-${name}` : name;
      if (existing.some((entry: any) => entry.type === type && entry.originalKey === originalKey)) return;
      const next = JSON.stringify([...existing, { originalKey, type, data: data ?? null }]);
      localStorage.setItem(ORPHANED_RECORDS_KEY, next);
      storageSetItem(ORPHANED_RECORDS_KEY, next);
    } catch {}
  };
  const { customSubjects, customWards, userAddedSubjects, presetWardSchedule, subjectMode, setWhatsNewOpen, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned, getSubjectIdByName } = useCustomData();
  const canonicalAttendanceKey = (type: 'subject' | 'ward', id: string | undefined, name: string) => {
    if (id) return type === 'ward' ? getWardAttendanceKey(id) : getAcademicAttendanceKey(id);
    quarantineUnresolvedAttendance(type, name, null);
    return '';
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteDataDialog, setShowDeleteDataDialog] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [installedVersion] = useState<string>(() => {
    const stored = localStorage.getItem('att_app_version') || APP_VERSION;
    if (compareVersions(APP_VERSION, stored) > 0) {
      localStorage.setItem('att_app_version', APP_VERSION);
      return APP_VERSION;
    }
    return stored;
  });

  const [pwaReady, setPwaReady] = useState<boolean>(() => localStorage.getItem('att_pwa_update_ready') === 'true');
  const [serverVersion, setServerVersion] = useState<string>(() => localStorage.getItem('att_pwa_latest_version') || LATEST_VERSION);
  useEffect(() => {
    const onReady = () => setPwaReady(true);
    const onCleared = () => {
      setPwaReady(false);
      setServerVersion(APP_VERSION);
    };
    window.addEventListener('attendenz:update-ready', onReady);
    window.addEventListener('attendenz:update-cleared', onCleared);
    return () => {
      window.removeEventListener('attendenz:update-ready', onReady);
      window.removeEventListener('attendenz:update-cleared', onCleared);
    };
  }, []);
  const isUpdateAvailable =
    compareVersions(serverVersion, installedVersion) > 0 ||
    (pwaReady && compareVersions(serverVersion, installedVersion) >= 0);
  const [updatePhase, setUpdatePhase] = useState<'none' | 'backing' | 'updating'>('none');
  const [dots, setDots] = useState(1);
  useEffect(() => {
    if (updatePhase === 'none') return;
    const t = window.setInterval(() => setDots(d => (d % 3) + 1), 450);
    return () => window.clearInterval(t);
  }, [updatePhase]);

  const [busy, setBusy] = useState<string | null>(null);
  const [pendingPct, setPendingPct] = useState<number | null>(null);
  const [confirmMarkComplete, setConfirmMarkComplete] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] = useState<Snapshot | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotMsg, setSnapshotMsg] = useState('');
  const [showSnapshotsList, setShowSnapshotsList] = useState(false);
  const [snapshotToDelete, setSnapshotToDelete] = useState<Snapshot | null>(null);
  const [curriculumStatus, setCurriculumStatus] = useState<'Active' | 'Completed'>(() => (localStorage.getItem('att_curriculum_status') as 'Active' | 'Completed') || 'Active');
  const [restoreConfirmType, setRestoreConfirmType] = useState<'file' | 'transfer' | null>(null);
  const [curricula, setCurricula] = useState<CurriculumRecord[]>(() => getCurricula());
  const [activeCurriculumId, setActiveCurriculumIdState] = useState<string>(() => getActiveCurriculumId() || '');
  const [newCurriculumName, setNewCurriculumName] = useState('');
  const [editingCurriculumId, setEditingCurriculumId] = useState<string | null>(null);
  const [editingCurriculumName, setEditingCurriculumName] = useState('');
  const activeCurriculum = curricula.find(c => c.id === activeCurriculumId) || null;

  const handleToggleCurriculumStatus = () => {
    const next = curriculumStatus === 'Active' ? 'Completed' : 'Active';
    if (next === 'Completed') { setConfirmMarkComplete(true); setShowSwitchDialog(true); return; }
    setCurriculumStatus('Active');
    localStorage.setItem('att_curriculum_status', 'Active');
    if (activeCurriculumId) setCurricula(persistCurriculumStatus(activeCurriculumId, 'active'));
    import('sonner').then(({ toast }) => toast.info('Curriculum marked as Active.'));
  };
  const applyMarkComplete = async () => {
    setConfirmMarkComplete(false);
    setCurriculumStatus('Completed');
    localStorage.setItem('att_curriculum_status', 'Completed');
    if (activeCurriculumId) setCurricula(persistCurriculumStatus(activeCurriculumId, 'archived'));
    const snapshotSaved = await createSnapshot('Curriculum Completed');
    setSnapshots(getSnapshots());
    if (snapshotSaved) notifySuccess('Curriculum marked as Completed! Auto-snapshot saved.');
    else import('sonner').then(({ toast }) => toast.error('Curriculum marked as Completed, but the safety snapshot could not be saved.'));
  };

  const handleApplyUpdate = async (withBackup: boolean) => {
    if (!navigator.onLine) {
      import('sonner').then(({ toast }) => toast.error("You're offline — connect to the internet once to update."));
      return;
    }

    if (withBackup) {
      setUpdatePhase('backing');
      const snapshotSaved = await createSnapshot('Pre-Update Backup');
      if (!snapshotSaved) {
        setUpdatePhase('none');
        import('sonner').then(({ toast }) => toast.error('Update stopped — the safety snapshot could not be created.'));
        return;
      }
      const snaps = getSnapshots();
      if (snaps.length > 0 && snaps[0].label.startsWith('Pre-Update Backup')) {
        await storageSetItem('att_pending_update_restore', snaps[0].id);
      }
    }

    await Promise.all([
      storageRemoveItem('att_pwa_update_ready'),
      storageRemoveItem('att_pwa_latest_version'),
      storageRemoveItem('att_pwa_update_summary'),
      storageSetItem('att_just_updated', 'true'),
      storageRemoveItem('att_has_seen_welcome_v1'),
      storageRemoveItem('att_app_version'),
    ]);

    if (withBackup) {
      await new Promise(r => setTimeout(r, 5500));
    }

    setUpdatePhase('updating');

    const MIN_UPDATE_DELAY = 6500;
    const start = Date.now();

    try {
      const applyPwa = (window as any).attendenzApplyPwaUpdate;
      if (applyPwa) await applyPwa();
    } catch {}

    const elapsed = Date.now() - start;
    if (elapsed < MIN_UPDATE_DELAY) {
      await new Promise(r => setTimeout(r, MIN_UPDATE_DELAY - elapsed));
    }

    window.location.href = import.meta.env.BASE_URL || '/';
  };

  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [exportScope, setExportScope] = useState<'complete' | 'subject' | 'custom' | 'semester'>('complete');
  const [exportSelectedSubject, setExportSelectedSubject] = useState<string>('');
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [exportSemester, setExportSemester] = useState<string>('Current Month');
  const [exportMsg, setExportMsg] = useState('');
  const [runtimeStorageInfo, setRuntimeStorageInfo] = useState({ isIndexedDB: true, isPersistent: false, techTitle: 'Local Device Storage (IndexedDB + Cache)', usedMB: '0.00 MB', quotaMB: '0.00 GB' });
  useEffect(() => {
    async function detectStorage() {
      const hasIDB = typeof window !== 'undefined' && Boolean(window.indexedDB);
      let isPersisted = false; let usedStr = '0.00 MB'; let quotaStr = '0.00 GB';
      if (navigator.storage && navigator.storage.persisted) { try { isPersisted = await navigator.storage.persisted(); } catch (e) {} }
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          if (est.usage !== undefined) usedStr = (est.usage / (1024 * 1024)).toFixed(2) + ' MB';
          if (est.quota !== undefined) quotaStr = (est.quota / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        } catch (e) {}
      }
      let techTitle = 'Local Device Storage (IndexedDB + Cache)';
      if (hasIDB && isPersisted) techTitle = 'IndexedDB + Persistent Storage Granted';
      else if (hasIDB) techTitle = 'Local Device Storage (IndexedDB + Cache)';
      setRuntimeStorageInfo({ isIndexedDB: hasIDB, isPersistent: isPersisted, techTitle, usedMB: usedStr, quotaMB: quotaStr });
    }
    detectStorage();
  }, [isPersistentStorage]);

  const semesterRange = (period: string): { s: string; e: string } => {
    const now = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (period === 'Current Month') return { s: iso(new Date(now.getFullYear(), now.getMonth(), 1)), e: iso(now) };
    if (period === 'Last 3 Months') return { s: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), e: iso(now) };
    if (subjectMode === 'preloaded') {
      return { s: '2026-01-24', e: iso(now) };
    } else {
      let earliest = '';
      for (const key of Object.keys(homeSelections)) {
        const date = key.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          if (!earliest || date < earliest) earliest = date;
        }
      }
      if (!earliest && customSubjects.length) {
        earliest = customSubjects.reduce((acc, s) => s.startDate && (!acc || s.startDate < acc) ? s.startDate : acc, '');
      }
      if (!earliest && customWards.length) {
        earliest = customWards.reduce((acc, w) => w.startDate && (!acc || w.startDate < acc) ? w.startDate : acc, '');
      }
      if (!earliest) earliest = iso(now);
      return { s: earliest, e: iso(now) };
    }
  };

  const aggregateRangeItems = (startStr: string, endStr: string) => {
    const start = startStr || '0000-01-01';
    const end = endStr || '9999-12-31';
    const entities: Array<{ name: string; category: string; isWard: boolean; plannedTotal: number; attendanceKey: string; isSGT?: boolean; sgtId?: string }> = [];
    const pushEntity = (name: string, category: string, isWard: boolean, planned: number, isSGT = false, sgtId?: string, entityId?: string) => {
      if (!entities.some(e => e.isWard === isWard && e.name.toLowerCase() === name.toLowerCase() && e.isSGT === isSGT)) {
        const id = entityId || getSubjectIdByName(name, isWard ? 'clinical' : 'academic');
        if (!id && !isSGT) {
          quarantineUnresolvedAttendance(isWard ? 'ward' : 'subject', name, null);
        }
        const attendanceKey = isSGT && sgtId
          ? getSGTKey(sgtId)
          : id
            ? (isWard ? getWardAttendanceKey(id) : getAcademicAttendanceKey(id))
            : '';
        entities.push({ name, category, isWard, plannedTotal: planned, attendanceKey, isSGT, sgtId });
      }
    };
    if (subjectMode === 'preloaded') {
      for (const cat of CATEGORIES) for (const s of cat.subjects) pushEntity(s.name, cat.name, false, getSubjectPlannedTotal(s.name));
      for (const s of INTEGRATED_SUBJECTS) pushEntity(s.name, 'Academic', false, getSubjectPlannedTotal(s.name));
      for (const ua of userAddedSubjects) {
        if (ua.subjectType === 'allied' && ua.parentName === 'Small Group Teaching') {
          pushEntity(ua.name, 'Clinical Wards', false, ua.plannedClasses || 0, true, ua.id, ua.id);
        } else {
          pushEntity(ua.name, 'Added by you', false, ua.plannedClasses || getSubjectPlannedTotal(ua.name), false, undefined, ua.id);
        }
      }
      for (const w of WARD_SUBJECTS) pushEntity(w.name, 'Clinical Wards', true, getPresetWardTotalPlanned(w.name));
      for (const e of presetWardSchedule) {
        if (!WARD_SUBJECTS.some(w => w.name.toLowerCase() === e.ward.toLowerCase())) {
          pushEntity(e.ward, 'Clinical Wards', true, getPresetWardTotalPlanned(e.ward));
        }
      }
    } else {
      for (const cs of customSubjects) {
        if (cs.subjectType === 'allied' && cs.parentName === 'Small Group Teaching') {
          pushEntity(cs.name, 'Clinical Wards', false, cs.plannedClasses || 0, true, cs.id, cs.id);
        } else {
          pushEntity(cs.name, cs.category || 'Custom Subject', false, cs.plannedClasses, false, undefined, cs.id);
        }
      }
      for (const cw of customWards) pushEntity(cw.name, 'Custom Wards', true, getCustomWardTotalPlanned(cw.startDate, cw.endDate), false, undefined, cw.id);
    }

    const agg = new Map<string, { name: string; category: string; attended: number; missed: number; plannedTotal: number; isSGT?: boolean }>();
    for (const [key, sel] of Object.entries(homeSelections)) {
      const date = key.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (date < start || date > end) continue;
      if (sel !== 'attended' && sel !== 'missed') continue;
      const rest = key.slice(11);
      for (const e of entities) {
        const norm = (s: string) => s.toLowerCase().replace(/[-\s]+/g, '_');
        const normRest = norm(rest);
        if (!e.attendanceKey) continue;
        const canonical = norm(e.attendanceKey);
        const matched = normRest === canonical || normRest.startsWith(canonical + '-') || normRest.startsWith(canonical + '_');
        if (matched) {
          const id = `${e.isWard ? 'w' : 's'}_${e.name.toLowerCase()}${e.isSGT ? '_sgt' : ''}`;
          const cur = agg.get(id) || { name: e.name, category: e.category, attended: 0, missed: 0, plannedTotal: e.plannedTotal, isSGT: e.isSGT };
          if (sel === 'attended') cur.attended += 1; else cur.missed += 1;
          agg.set(id, cur);
          break;
        }
      }
    }
    return Array.from(agg.values()).map(a => ({
      ...a,
      total: a.attended + a.missed,
      name: a.isSGT ? `${a.name} (SGT)` : a.name,
    }));
  };

  const handleExecuteExport = async () => {
    setExportMsg('');
    const rawItems: Array<{ name: string; category?: string; attended: number; total: number; plannedTotal: number; sgtId?: string; isWard?: boolean }> = [];
    if (subjectMode === 'preloaded') {
      for (const cat of CATEGORIES) for (const sub of cat.subjects) {
        const id = getSubjectIdByName(sub.name, 'academic');
        if (!id) quarantineUnresolvedAttendance('subject', sub.name, null);
        const data = id ? subjects[getAcademicAttendanceKey(id)] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
        rawItems.push({ name: sub.name, category: cat.name, attended: data.attended, total: data.attended + data.missed, plannedTotal: getSubjectPlannedTotal(sub.name) || 0 });
      }
      for (const s of INTEGRATED_SUBJECTS) {
        const id = getSubjectIdByName(s.name, 'academic');
        if (!id) quarantineUnresolvedAttendance('subject', s.name, null);
        const data = id ? subjects[getAcademicAttendanceKey(id)] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
        rawItems.push({ name: s.name, category: 'Academic', attended: data.attended, total: data.attended + data.missed, plannedTotal: getSubjectPlannedTotal(s.name) || 0 });
      }
      for (const ua of userAddedSubjects) {
        if (ua.subjectType === 'allied' && ua.parentName === 'Small Group Teaching') {
          const sgtKey = getSGTKey(ua.id);
          const data = subjects[sgtKey] || { attended: 0, missed: 0 };
          rawItems.push({ name: `${ua.name} (SGT)`, category: 'Clinical Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: ua.plannedClasses ?? 0, sgtId: ua.id });
        } else {
          const key = canonicalAttendanceKey('subject', ua.id || getSubjectIdByName(ua.name, 'academic'), ua.name);
          const data = key ? subjects[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
          rawItems.push({ name: ua.name, category: 'Added by you', attended: data.attended, total: data.attended + data.missed, plannedTotal: ua.plannedClasses ?? getSubjectPlannedTotal(ua.name) ?? 0 });
        }
      }
      const addedWards = new Set<string>();
      for (const w of WARD_SUBJECTS) {
        const key = canonicalAttendanceKey('ward', getSubjectIdByName(w.name, 'clinical'), w.name);
        const data = key ? wards[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
        rawItems.push({ name: `${w.name} (Ward)`, category: 'Clinical Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: getPresetWardTotalPlanned(w.name) || 0, isWard: true });
        addedWards.add(w.name.toLowerCase());
      }
      for (const e of presetWardSchedule) {
        if (!addedWards.has(e.ward.toLowerCase())) {
          const key = canonicalAttendanceKey('ward', getSubjectIdByName(e.ward, 'clinical'), e.ward);
          const data = key ? wards[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
          rawItems.push({ name: `${e.ward} (Ward)`, category: 'Clinical Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: getPresetWardTotalPlanned(e.ward) || 0, isWard: true });
          addedWards.add(e.ward.toLowerCase());
        }
      }
    } else {
      for (const cs of customSubjects) {
        if (cs.subjectType === 'allied' && cs.parentName === 'Small Group Teaching') {
          const sgtKey = getSGTKey(cs.id);
          const data = subjects[sgtKey] || { attended: 0, missed: 0 };
          rawItems.push({ name: `${cs.name} (SGT)`, category: 'Clinical Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: cs.plannedClasses ?? 0, sgtId: cs.id });
        } else {
          const key = canonicalAttendanceKey('subject', cs.id || getSubjectIdByName(cs.name, 'academic'), cs.name);
          const data = key ? subjects[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
          rawItems.push({ name: cs.name, category: cs.category || 'Custom Subject', attended: data.attended, total: data.attended + data.missed, plannedTotal: cs.plannedClasses ?? 0 });
        }
      }
      for (const cw of customWards) {
        const key = canonicalAttendanceKey('ward', cw.id || getSubjectIdByName(cw.name, 'clinical'), cw.name);
        const data = key ? wards[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
        rawItems.push({ name: `${cw.name} (Ward)`, category: 'Custom Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: getCustomWardTotalPlanned(cw.startDate, cw.endDate, cw.vacationPeriods) ?? 0, isWard: true });
      }
    }

    let filteredItems = rawItems;
    let filterTitle = 'Complete Attendance';
    if (exportScope === 'subject') {
      if (!exportSelectedSubject) {
        setExportMsg('Please select a subject or ward first.');
        return;
      }
      const [type, value] = exportSelectedSubject.split(':');
      if (type === 'subject') {
        filteredItems = rawItems.filter(i => i.name === value && !i.name.endsWith('(SGT)') && !i.name.endsWith('(Ward)'));
        filterTitle = value;
      } else if (type === 'sgt') {
        filteredItems = rawItems.filter(i => i.sgtId === value);
        filterTitle = filteredItems.length > 0 ? filteredItems[0].name : value;
      } else if (type === 'ward') {
        filteredItems = rawItems.filter(i => i.name === `${value} (Ward)`);
        filterTitle = `${value} (Ward)`;
      } else {
        setExportMsg('Invalid subject selection.');
        return;
      }
    } else if (exportScope === 'custom') {
      if (!exportStartDate) {
        setExportMsg('Please select a start date.');
        return;
      }
      if (exportStartDate > exportEndDate) {
        setExportMsg('Start date must be before or equal to end date.');
        return;
      }
      filteredItems = aggregateRangeItems(exportStartDate, exportEndDate);
      const fmtNice = (iso: string) => { const d = new Date(iso + 'T12:00:00'); const day = d.getDate(); const suf = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'; return `${day}${suf} ${d.toLocaleString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`; };
      filterTitle = `${fmtNice(exportStartDate)} – ${fmtNice(exportEndDate)}`;
      if (filteredItems.length === 0) { setExportMsg('No attendance records inside the selected date range — nothing to export yet. Mark some classes first!'); return; }
    } else if (exportScope === 'semester') {
      const r = semesterRange(exportSemester);
      filteredItems = aggregateRangeItems(r.s, r.e);
      filterTitle = `Semester – ${exportSemester}`;
      if (filteredItems.length === 0) { setExportMsg('No attendance records inside the selected period — nothing to export yet. Mark some classes first!'); return; }
    }

    const reportItems = filteredItems.map(item => {
      const total = item.total; const attended = item.attended; const plannedTotal = item.plannedTotal;
      const pct = total > 0 ? (attended / total) * 100 : 0;
      const target = preferredPercentage || 75;
      let neededText = '0 needed';
      if (pct < target) {
        if (target < 100) {
          const needed = Math.ceil((target * total - 100 * attended) / (100 - target));
          neededText = `${needed > 0 ? needed : 0} needed`;
        } else {
          neededText = `${total - attended} more attendances needed`;
        }
      } else if (total > 0) neededText = 'Target Achieved';
      return { name: item.name, category: item.category, attended, total, plannedTotal, pct, neededForTarget: neededText };
    });
    const overallAttended = reportItems.reduce((acc, c) => acc + c.attended, 0);
    const overallTotal = reportItems.reduce((acc, c) => acc + c.total, 0);
    const overallPct = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;
    const reportOptions = {
      studentName: username || 'Medical Student',
      profileImage: profileImage || getDefaultAvatar(),
      routineMode: subjectMode === 'preloaded' ? 'MBBS 5th Year Curriculum' : 'Custom Routine Mode',
      targetPct: preferredPercentage || 75,
      filterTitle,
      items: reportItems,
      overallAttended,
      overallTotal,
      overallPct
    };
    setBusy('Exporting…');
    try {
      if (exportFormat === 'pdf') await generatePDFReport(reportOptions);
      else if (exportFormat === 'excel') await generateExcelReport(reportOptions);
      else if (exportFormat === 'csv') generateCSVReport(reportOptions);
      notifySuccess('Report exported.');
    } finally { setBusy(null); }
  };

  const [activeSettingModal, setActiveSettingModal] = useState<'preferredPc' | 'curriculum' | 'snapshot' | 'export' | 'dataProtection' | 'identity' | 'feedback' | 'notifications' | 'theme' | null>(null);
  const [transferImportData, setTransferImportData] = useState<any>(null);
  const transferFileInputRef = useRef<HTMLInputElement>(null);

  const handleShareData = async () => {
    const success = await shareDataAsJSON();
    if (success) notifySuccess('Transfer file ready!');
    else import('sonner').then(({ toast }) => toast.error('Failed to prepare transfer file.'));
  };
  const handleTransferFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      import('sonner').then(({ toast }) => toast.error('Transfer file is too large. Please choose a file under 5 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        assertBackupSize(content);
        setTransferImportData(validateBackupPayload(JSON.parse(content)));
      } catch (err) { import('sonner').then(({ toast }) => toast.error(err instanceof Error ? err.message : 'Invalid transfer file format.')); }
    };
    reader.readAsText(file);
  };
  const executeTransferImport = async () => {
    if (!transferImportData) return;
    if (!await createSnapshot('Pre-Transfer Restore')) {
      import('sonner').then(({ toast }) => toast.error('Transfer stopped — the safety snapshot could not be created.'));
      return;
    }

    // Clear mode-specific attendance keys BEFORE writing backup data
    const MODE_SPECIFIC_ATTENDANCE_KEYS = [
      'attendance_tracker_subjects', 'attendance_tracker_ward', 'attendance_tracker_home_selections', 'attendance_tracker_finished_map',
      'attendance_tracker_subjects_preset', 'attendance_tracker_ward_preset', 'attendance_tracker_home_selections_preset', 'attendance_tracker_finished_map_preset',
      'attendance_tracker_subjects_custom', 'attendance_tracker_ward_custom', 'attendance_tracker_home_selections_custom', 'attendance_tracker_finished_map_custom',
      'att_attendance_id_migration_v2_done_preloaded', 'att_attendance_id_migration_v2_done_custom',
      'att_mode_separation_done_v1',
    ];
    await idbRemoveMany(MODE_SPECIFIC_ATTENDANCE_KEYS);
    MODE_SPECIFIC_ATTENDANCE_KEYS.forEach(k => localStorage.removeItem(k));

    // Commit the validated backup atomically in IndexedDB, then mirror the cache.
    const entries = Object.entries(transferImportData).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ] as [string, string]);
    await idbSetMany(entries);
    entries.forEach(([key, stringVal]) => localStorage.setItem(key, stringVal));

    // Remove migration flags so migration can run on next load
    const migrationFlags = [
      'att_mode_separation_done_v1',
      'att_attendance_id_migration_v2_done_preloaded',
      'att_attendance_id_migration_v2_done_custom',
    ];
    await idbRemoveMany(migrationFlags);
    migrationFlags.forEach(flag => localStorage.removeItem(flag));

    notifySuccess('Data transferred successfully! Reloading...');
    setLocation('/');
    setTimeout(() => window.location.reload(), 1500);
  };
  useEffect(() => { autoSnapshotOnLoad(); setSnapshots(getSnapshots()); }, []);
  const handleTakeSnapshot = async () => {
    const success = await createSnapshot('Manual Checkpoint');
    if (!success) {
      setSnapshotMsg('✗ Snapshot could not be saved.');
      setTimeout(() => setSnapshotMsg(''), 3000);
      return;
    }
    triggerConfirmationFeedback('success');
    setSnapshots(getSnapshots());
    setSnapshotMsg('✓ Snapshot created successfully!');
    setTimeout(() => setSnapshotMsg(''), 3000);
  };
  const handleRestoreSnapshot = async (id: string) => {
    if (await restoreSnapshot(id)) {
      triggerConfirmationFeedback('success');
      setSnapshotMsg('✓ Snapshot restored! Refreshing page...');
      setLocation('/');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setSnapshotMsg('✗ Failed to restore snapshot.');
      setTimeout(() => setSnapshotMsg(''), 3000);
    }
  };
  const handleDeleteSnapshot = () => {
    if (!snapshotToDelete) return;
    const remaining = getSnapshots().filter(s => s.id !== snapshotToDelete.id);
    const json = JSON.stringify(remaining);
    localStorage.setItem(SNAPSHOTS_KEY, json);
    storageSetItem(SNAPSHOTS_KEY, json);
    setSnapshots(remaining);
    triggerConfirmationFeedback('danger');
    setSnapshotToDelete(null);
    setSnapshotMsg('✓ Snapshot deleted.');
    setTimeout(() => setSnapshotMsg(''), 3000);
  };
  const handleClearCache = () => {
    const cleared = clearLocalCache();
    triggerConfirmationFeedback('success');
    setSnapshotMsg(`✓ Cleared ${cleared} temporary cached items safely! Attendance records & subjects remain 100% intact.`);
    setTimeout(() => setSnapshotMsg(''), 4000);
  };
  const handleDeleteAllData = async () => {
    await storageClear();
    try { localStorage.clear(); } catch {}
    localStorage.setItem('att_idb_migrated_v1', 'true');
    storageSetItem('att_idb_migrated_v1', 'true');
    window.location.reload();
  };

  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readThemePreference());
  const [vibrationEnabled, setVibrationEnabledState] = useState(() => getVibrationEnabled());
  const [vibrationStyle, setVibrationStyleState] = useState<VibrationStyle>(() => getVibrationStyle());
  const [soundEnabled, setSoundEnabledState] = useState(() => getSoundEnabled());
  const [soundVolume, setSoundVolumeState] = useState(() => getSoundVolume());
  const vibrationSupported = isVibrationSupported();
  const oneSignalConfigured = isOneSignalProductionConfigured();
  const [showVibrationInfo, setShowVibrationInfo] = useState(false);
  const [systemNotificationsEnabled, setSystemNotificationsEnabledState] = useState(() => getSystemNotificationsEnabled());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => getNotificationPermission());
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationPreferences, setNotificationPreferencesState] = useState<NotificationPreferences>(() => getNotificationPreferences());
  const [reminderSyncStatus, setReminderSyncStatusState] = useState<ReminderSyncStatus>(() => getReminderSyncStatus());
  const updateVibrationEnabled = (enabled: boolean) => { if (!vibrationSupported) return; setVibrationEnabledState(enabled); setVibrationEnabled(enabled); };
  const updateVibrationStyle = (style: VibrationStyle) => { setVibrationStyleState(style); setVibrationStyle(style); };
  const updateSoundEnabled = (enabled: boolean) => { setSoundEnabledState(enabled); setSoundEnabled(enabled); };
  const updateSoundVolume = (volume: number) => { setSoundVolumeState(volume); setSoundVolume(volume); };
  const updateSystemNotificationsEnabled = async (enabled: boolean) => {
    if (notificationBusy) return;
    setNotificationBusy(true);
    try {
      if (!enabled) {
        await disableOneSignalPush();
        setSystemNotificationsEnabledState(false);
        setSystemNotificationsEnabled(false);
        setNotificationPermission(getNotificationPermission());
        return;
      }

      if (!oneSignalConfigured) {
        import('sonner').then(({ toast }) => toast.info('Open the published Attendenz app to enable system notifications.'));
        return;
      }

      const result = await enableOneSignalPush();
      const permission = getNotificationPermission();
      setNotificationPermission(permission);
      if (result === 'enabled' && permission === 'granted') {
        setSystemNotificationsEnabledState(true);
        setSystemNotificationsEnabled(true);
      } else {
        setSystemNotificationsEnabledState(false);
        setSystemNotificationsEnabled(false);
        import('sonner').then(({ toast }) => toast.info(result === 'denied' || permission === 'denied' ? 'Notifications are blocked in iPhone settings.' : 'Notifications could not be connected yet. Please try again on the published app.'));
      }
    } finally {
      setNotificationBusy(false);
    }
  };
  const updateNotificationPreference = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    const next = { ...notificationPreferences, [key]: value };
    setNotificationPreferencesState(next);
    setNotificationPreferences(next);
  };
  const enableSystemNotifications = async () => {
    if (notificationBusy) return;
    setNotificationBusy(true);
    try {
      if (!oneSignalConfigured) {
        import('sonner').then(({ toast }) => toast.info('Open the published Attendenz app to enable system notifications.'));
        return;
      }
      const result = await enableOneSignalPush();
      const permission = getNotificationPermission();
      setNotificationPermission(permission);
      if (result === 'enabled' && permission === 'granted') {
        setSystemNotificationsEnabledState(true);
        setSystemNotificationsEnabled(true);
        const shown = await testSystemNotification();
        if (shown) notifySuccess('System notifications enabled.');
        else import('sonner').then(({ toast }) => toast.info('Notifications are enabled. Use the OneSignal test later to confirm delivery.'));
      } else if (result === 'denied' || permission === 'denied') {
        import('sonner').then(({ toast }) => toast.info('Notifications are blocked. Allow them in your iPhone settings if you want to use them.'));
      } else {
        import('sonner').then(({ toast }) => toast.info('System notifications could not be connected yet. Please try again on the published app.'));
      }
    } finally {
      setNotificationBusy(false);
    }
  };
  const testNotificationFromSettings = async () => {
    if (notificationPermission !== 'granted' || !systemNotificationsEnabled) return;
    const shown = await testSystemNotification();
    if (!shown) import('sonner').then(({ toast }) => toast.info('The test notification could not be shown. Check notification permission and device settings.'));
  };

  useEffect(() => {
    if (activeSettingModal === 'notifications' && oneSignalConfigured) void prepareOneSignal();
  }, [activeSettingModal, oneSignalConfigured]);
  useEffect(() => {
    const onReminderSyncStatusChanged = () => setReminderSyncStatusState(getReminderSyncStatus());
    window.addEventListener(REMINDER_SYNC_STATUS_CHANGED_EVENT, onReminderSyncStatusChanged);
    return () => window.removeEventListener(REMINDER_SYNC_STATUS_CHANGED_EVENT, onReminderSyncStatusChanged);
  }, []);

  const openCurriculumManager = () => {
    setConfirmMarkComplete(false);
    setCurricula(getCurricula());
    setActiveCurriculumIdState(getActiveCurriculumId() || '');
    setShowSwitchDialog(true);
  };
  const handleCreateCurriculum = () => {
    try {
      const created = createCurriculum(newCurriculumName);
      setNewCurriculumName('');
      setCurricula(getCurricula());
      notifySuccess(`${created.name} created empty. Use AddNew Import if you want to bring in a routine structure.`);
    } catch (error) {
      import('sonner').then(({ toast }) => toast.error(error instanceof Error ? error.message : 'Could not create curriculum.'));
    }
  };
  const handleActivateCurriculum = async (id: string) => {
    if (id === activeCurriculumId) return;
    try {
      await activateCurriculum(id);
      await flushStorageWrites();
      setShowSwitchDialog(false);
      notifySuccess('Curriculum switched.');
      setLocation('/');
      window.location.reload();
    } catch {
      import('sonner').then(({ toast }) => toast.error('Could not switch curriculum.'));
    }
  };
  const handleRenameCurriculum = (id: string) => {
    try {
      setCurricula(renameCurriculum(id, editingCurriculumName));
      setEditingCurriculumId(null);
      setEditingCurriculumName('');
    } catch (error) {
      import('sonner').then(({ toast }) => toast.error(error instanceof Error ? error.message : 'Could not rename curriculum.'));
    }
  };
  const handleArchiveCurriculum = (id: string) => {
    if (id === activeCurriculumId) {
      import('sonner').then(({ toast }) => toast.info('Switch to another curriculum before archiving this one.'));
      return;
    }
    setCurricula(persistCurriculumStatus(id, 'archived'));
  };
  const detectGender = (name: string): 'male' | 'female' | 'neutral' => {
    if (!name || name.length < 2) return 'neutral';
    const n = name.toLowerCase();
    const femaleNames = ['mary', 'jane', 'sarah', 'fatima', 'aisha', 'zainab', 'ananya', 'ishani', 'diya', 'sana', 'nora', 'luna'];
    const femaleEndings = ['a', 'i', 'ee', 'ya', 'an'];
    if (femaleNames.some(fn => n.includes(fn))) return 'female';
    if (femaleEndings.some(fe => n.endsWith(fe))) return 'female';
    return 'male';
  };
  const getDefaultAvatar = () => {
    const gender = detectGender(username);
    if (gender === 'female') return femaleStudentProfile;
    if (gender === 'male') return maleStudentProfile;
    return neutralStudentProfile;
  };
  const handleImageClick = () => { fileInputRef.current?.click(); };
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 400;
          let width = img.width; let height = img.height;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) { ctx.drawImage(img, 0, 0, width, height); updateProfileImage(canvas.toDataURL('image/jpeg', 0.85)); }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const [backupTransferOpen, setBackupTransferOpen] = useState(false);
  useEffect(() => {
    const modalOpen = Boolean(isEditingName || showDeleteDataDialog || showUpdatePrompt || pendingPct !== null || confirmMarkComplete || snapshotToRestore || snapshotToDelete || activeSettingModal || showSwitchDialog || backupTransferOpen || restoreConfirmType);
    if (!modalOpen) return;
    lockScroll();
    return () => unlockScroll();
  }, [isEditingName, showDeleteDataDialog, showUpdatePrompt, pendingPct, confirmMarkComplete, snapshotToRestore, snapshotToDelete, activeSettingModal, showSwitchDialog, backupTransferOpen, restoreConfirmType]);

  return (
    <Layout>
      <div className="max-w-xl mx-auto space-y-2 pb-6 scroll-reachability">
        {/* 1. Active Account */}
        <div className="contents">
          <StickySectionLabel label="Active Account" stackIndex={0} zClass="z-30" />
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-sm overflow-hidden">
            <button type="button" onClick={() => setActiveSettingModal('identity')} className="w-full flex items-center justify-between gap-3 text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <span className="w-12 h-12 rounded-2xl overflow-hidden shrink-0 border border-primary/30 bg-primary/10"><img src={profileImage || getDefaultAvatar()} alt="Profile" className="w-full h-full object-cover" /></span>
              <span className="min-w-0 flex-1"><span className="block font-extrabold text-sm text-foreground truncate">{username}</span><span className="block text-[10px] text-muted-foreground mt-0.5 truncate">{getActiveCurriculumName()}</span></span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </div>

        {/* 2. Preference & Statistic */}
        <div className="contents">
          <StickySectionLabel label="Preference" stackIndex={1} zClass="z-30" />
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-sm overflow-hidden divide-y divide-border/40">
            <button type="button" onClick={() => setActiveSettingModal('preferredPc')} className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><span className="font-bold text-xs">%</span></div>
                <div>
                  <p className="font-semibold text-xs text-foreground">Curriculum Percentage</p>
                  <p className="text-[10px] text-muted-foreground">Target attendance threshold ({preferredPercentage}%)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
            <button type="button" onClick={() => openCurriculumManager() } className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><GraduationCap className="w-4.5 h-4.5" /></div>
                <div>
                  <h3 className="font-bold text-xs text-foreground">Curriculum Management</h3>
                  <p className="text-[10px] text-muted-foreground">Academic progress, status & routine mode</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </button>
          </div>
        </div>

        {/* 3. Storage & Data */}
        <div className="contents">
          <StickySectionLabel label="Storage & Data" stackIndex={2} zClass="z-30" />
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-sm overflow-hidden divide-y divide-border/40">
            <SettingRow icon={<Database className="w-4 h-4" />} title="Backup / Transfer" description="Backup, restore, or transfer your complete app data." tone="blue" onClick={() => setBackupTransferOpen(true)} />
            <SettingRow icon={<SnapshotIcon className="w-4 h-4" />} title="Snapshots & Storage" description="Manage local state backups & cache" tone="primary" onClick={() => setActiveSettingModal('snapshot')} />
            <SettingRow icon={<FileText className="w-4 h-4" />} title="Export Attendance Data" description="Export records in PDF, Excel, or CSV formats" tone="amber" onClick={() => setActiveSettingModal('export')} />
            <SettingRow icon={<Database className="w-4 h-4" />} title="Data Protection & Storage" description={runtimeStorageInfo.techTitle} tone="emerald" onClick={() => setActiveSettingModal('dataProtection')} />
          </div>
        </div>

        {/* 4. App Settings */}
        <div className="contents">
          <StickySectionLabel label="App Settings" stackIndex={3} zClass="z-30" />
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-sm overflow-hidden divide-y divide-border/40">
            <SettingRow icon={<Vibrate className="w-4 h-4" />} title="Feedback & Sounds" description="Choose how Attendenz responds after you save or mark attendance" tone="violet" onClick={() => setActiveSettingModal('feedback')} />
            <SettingRow icon={<Bell className="w-4 h-4" />} title="System Notifications" description="Choose which reminders you want to receive" tone="blue" onClick={() => setActiveSettingModal('notifications')} />
            <SettingRow icon={<Info className="w-4 h-4" />} title="Theme" description={`${themePreference === 'system' ? 'System' : themePreference === 'dark' ? 'Dark' : 'Light'} appearance preference`} tone="primary" onClick={() => setActiveSettingModal('theme')} />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl overflow-hidden shrink-0 border border-border/50 bg-muted/20"><img src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`} alt="Attendenz Logo" className="w-full h-full object-cover" /></div>
                <div className="min-w-0 flex-1 text-left"><div className="flex items-center justify-between gap-2"><p className="font-extrabold text-xs text-foreground truncate">Attendenz Tracker</p>{isUpdateAvailable ? <span className="text-[9px] font-extrabold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">Update Available</span> : <span className="text-[9px] font-extrabold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">Up to Date</span>}</div><p className="text-[10px] text-muted-foreground mt-0.5">Version {installedVersion}</p><p className="text-[10px] text-muted-foreground/80">Developer: <strong className="text-foreground">benzavraar</strong></p><p className="text-[10px] text-muted-foreground/80">Storage Used: {runtimeStorageInfo.usedMB}</p></div>
              </div>
              <div className="flex gap-2 border-t border-border/40 pt-3"><button type="button" onClick={() => setWhatsNewOpen(true)} className="action-button action-button--neutral flex-1"><Sparkles className="w-4 h-4 text-primary" />What’s New</button>{isUpdateAvailable && <button type="button" onClick={() => setShowUpdatePrompt(true)} className="action-button action-button--update flex-1"><RefreshCw className="w-4 h-4" />Update App</button>}</div>
            </div>
          </div>
        </div>

          <AnimatePresence>
            {backupTransferOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4 overflow-hidden"
                onClick={() => setBackupTransferOpen(false)}
              >
                <motion.div
                  initial={{ y: 48, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 48, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 w-full max-w-lg max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4 text-left relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Backup / Transfer</h3>
                      <p className="text-[10px] text-muted-foreground">Complete app backup keeps both Preset and Custom workspaces. Routine bundles use the active mode only.</p>
                    </div>
                  </div>

                  {busy && <p className="text-xs font-semibold text-center text-primary bg-primary/10 py-2 rounded-xl">{busy}</p>}

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" /> Backup / Transfer
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={handleShareData}
                        className="action-button action-button--transfer w-full"
                      >
                        <Send className="w-4 h-4" /> Send to Another Device
                      </button>
                      <button
                        onClick={() => {
                          setBusy('Backing up…');
                          setTimeout(() => {
                            exportDataAsJSON();
                            setBusy(null);
                            notifySuccess('Backup downloaded.');
                          }, 400);
                        }}
                        className="action-button action-button--save w-full"
                      >
                        <Upload className="w-4 h-4" /> Export Backup (.json)
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-border/40 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Restore Data
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={() => setRestoreConfirmType('transfer')}
                        className="action-button action-button--transfer w-full"
                      >
                        <Download className="w-4 h-4" /> Receive from Another Device
                      </button>
                      <button
                        onClick={() => setRestoreConfirmType('file')}
                        className="action-button action-button--transfer w-full"
                      >
                        <RefreshCw className="w-4 h-4" /> Restore from File
                      </button>
                      <input
                        type="file"
                        ref={transferFileInputRef}
                        onChange={handleTransferFileSelect}
                        accept=".json"
                        className="hidden"
                      />
                      <input
                        type="file"
                        ref={backupFileInputRef}
                        accept=".json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            importDataFromJSON(file, (success) => {
                              if (success) {
                                triggerConfirmationFeedback('success');
                                import('sonner').then(({ toast }) => toast.info('Backup restored successfully! Reloading app...'));
                                setLocation('/');
                                window.location.reload();
                              } else {
                                import('sonner').then(({ toast }) => toast.info('Failed to restore backup. Please ensure the file is valid.'));
                              }
                            });
                          }
                          e.target.value = '';
                        }}
                      />
                    </div>

                    {restoreConfirmType && (
                      <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-500 font-semibold">
                            Restoring will replace all current data with the backup data. Any attendance marked after the backup was created will be lost.
                            A safety snapshot of your current data will be created automatically.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRestoreConfirmType(null)}
                            className="action-button action-button--cancel flex-1"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (restoreConfirmType === 'file') {
                                backupFileInputRef.current?.click();
                              } else if (restoreConfirmType === 'transfer') {
                                transferFileInputRef.current?.click();
                              }
                              setRestoreConfirmType(null);
                            }}
                            className="action-button action-button--warning flex-1"
                          >
                            Continue Restore
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {transferImportData && (
                    <div className="bg-muted/30 p-3.5 rounded-2xl border border-border/50 text-left space-y-3">
                      <div className="flex items-center gap-2 text-amber-500 mb-1">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-bold">Import Data Confirmation</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">You are about to replace the complete app backup on this device, including both Preset and Custom workspaces. We recommend creating a Full App Backup before continuing.</p>
                      <div className="bg-background rounded-xl border border-border/60 p-2.5 space-y-1.5 mt-2">
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">App Version</span><span className="font-bold text-foreground">{transferImportData.att_app_version || 'Unknown'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Routine Mode</span><span className="font-bold text-foreground">{transferImportData.att_subject_mode === 'preloaded' ? 'MBBS 5th Year' : 'Custom Routine'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Snapshots</span><span className="font-bold text-foreground">{transferImportData.attendenz_snapshots_v1 ? JSON.parse(transferImportData.attendenz_snapshots_v1).length : 0}</span></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button onClick={() => setTransferImportData(null)} className="action-button action-button--cancel w-full">Cancel</button>
                        <button onClick={executeTransferImport} className="action-button action-button--danger w-full">Replace & Import</button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setBackupTransferOpen(false)}
                      className="action-button action-button--close"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {activeSettingModal && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4 overflow-hidden" onClick={() => { setActiveSettingModal(null); setPendingPct(null); setShowDeleteDataDialog(false); }}>
                <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 w-full max-h-[min(70dvh,48rem)] shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4 text-left relative flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-between border-b border-border/50 pb-3 shrink-0">
                      <div className="flex items-center gap-3">
                        {activeSettingModal === 'preferredPc' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 font-bold text-sm">%</div>)}
                      {activeSettingModal === 'curriculum' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><GraduationCap className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'snapshot' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><SnapshotIcon className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'export' && (<div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20"><FileText className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'dataProtection' && (<div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/20"><Database className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'identity' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><Camera className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'feedback' && (<div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0 border border-violet-500/20"><Vibrate className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'notifications' && (<div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/20"><Bell className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'theme' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><Info className="w-5 h-5" /></div>)}
                      <div>
                        <h3 className="font-bold text-base text-foreground">
                          {activeSettingModal === 'preferredPc' && 'Curriculum Percentage'}
                          {activeSettingModal === 'curriculum' && 'Curriculum Management'}
                          {activeSettingModal === 'snapshot' && 'Snapshots & Storage'}
                          {activeSettingModal === 'export' && 'Export Attendance Data'}
                          {activeSettingModal === 'dataProtection' && 'Data Protection & Storage'}
                          {activeSettingModal === 'identity' && 'Identity Card'}
                          {activeSettingModal === 'feedback' && 'Feedback & Sounds'}
                          {activeSettingModal === 'notifications' && 'System Notifications'}
                          {activeSettingModal === 'theme' && 'Theme'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {activeSettingModal === 'preferredPc' && 'Target attendance threshold percentage'}
                          {activeSettingModal === 'curriculum' && 'Academic progress, status & routine mode'}
                          {activeSettingModal === 'snapshot' && 'Manage local state backups & cache'}
                          {activeSettingModal === 'export' && 'Export records in PDF, Excel, or CSV formats'}
                          {activeSettingModal === 'dataProtection' && runtimeStorageInfo.techTitle}
                          {activeSettingModal === 'identity' && 'Profile, display name, and active curriculum'}
                          {activeSettingModal === 'feedback' && 'Choose what you hear after a confirmation'}
                          {activeSettingModal === 'notifications' && 'Choose when Attendenz should remind you'}
                          {activeSettingModal === 'theme' && 'Choose how Attendenz follows your device'}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setActiveSettingModal(null); setPendingPct(null); }} className="action-button action-button--close action-button--icon shrink-0" title="Close">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="pt-1 flex-1 min-h-0 overflow-y-auto">
                    {activeSettingModal === 'identity' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-muted/20 p-4">
                          <button type="button" onClick={handleImageClick} className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-primary/30 bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40" aria-label="Change profile picture">
                            <AnimatePresence mode="wait"><motion.img key={profileImage || 'default'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} src={profileImage || getDefaultAvatar()} className="w-full h-full object-cover" alt="Profile" /></AnimatePresence>
                            <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-[9px] font-bold text-white">Change</span>
                          </button>
                          <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/png, image/jpeg, image/jpg, image/webp, image/*" />
                          <div className="min-w-0 flex-1 text-left">
                            <p className="text-lg font-extrabold text-foreground truncate">{username}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">Active: {getActiveCurriculumName()}</p>
                            <button type="button" onClick={() => { setNameInput(username); setIsEditingName(true); }} className="action-button action-button--edit action-button--compact mt-3">Edit name</button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">Your profile picture and display name are stored locally with the rest of your app data.</p>
                      </div>
                    )}
                    {activeSettingModal === 'feedback' && (
                      <div className="space-y-3">
                        <div className={cn('rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3.5', !vibrationSupported && 'opacity-55')}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0"><Vibrate className="w-4 h-4 text-violet-500 shrink-0" /><span className="text-xs font-bold text-foreground">Vibration feedback</span></div>
                            <SettingToggle checked={vibrationEnabled} onChange={updateVibrationEnabled} label="Vibration feedback" disabled={!vibrationSupported} />
                          </div>
                          {vibrationSupported ? (
                            <label className="flex items-center justify-between gap-3 mt-3 text-xs font-semibold text-foreground"><span className="text-muted-foreground">Vibration strength</span><select value={vibrationStyle} onChange={e => updateVibrationStyle(e.target.value as VibrationStyle)} disabled={!vibrationEnabled} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-50"><option value="subtle">Subtle</option><option value="standard">Standard</option><option value="strong">Strong</option></select></label>
                          ) : (
                            <div className="mt-2 flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground"><Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /><span>Vibration isn’t available in this iPhone browser app. Nothing is wrong with your phone or attendance records. <button type="button" onClick={() => setShowVibrationInfo(v => !v)} className="font-bold text-primary underline underline-offset-2">{showVibrationInfo ? 'Hide details' : 'More info'}</button>{showVibrationInfo && <span className="block mt-1">iPhone Safari does not allow web apps to use the phone’s vibration control, so this option is unavailable here.</span>}</span></div>
                          )}
                        </div>
                        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3.5">
                          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><Volume2 className="w-4 h-4 text-blue-500 shrink-0" /><span className="text-xs font-bold text-foreground">Confirmation sound</span></div><SettingToggle checked={soundEnabled} onChange={updateSoundEnabled} label="Confirmation sound" /></div>
                          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Play a short confirmation sound after you save or mark attendance. Your iPhone’s Silent mode, volume, and sound settings still control what you hear.</p>
                          <label className="mt-3 flex items-center gap-3 text-xs font-semibold text-foreground"><span className="shrink-0 text-muted-foreground">Volume</span><input type="range" min="0" max="1" step="0.05" value={soundVolume} onChange={e => updateSoundVolume(Number(e.target.value))} disabled={!soundEnabled} className="min-w-0 flex-1 accent-blue-500 disabled:opacity-50" aria-label="Confirmation sound volume" /><output className="w-10 text-right text-xs font-bold text-blue-500">{Math.round(soundVolume * 100)}%</output></label>
                        </div>
                        <button type="button" onClick={testConfirmationFeedback} className="action-button action-button--update w-full">Test feedback</button>
                      </div>
                    )}
                    {activeSettingModal === 'notifications' && (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3.5 space-y-3">
                          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-foreground">System notifications</p><p className="text-[10px] text-muted-foreground mt-0.5">Choose the reminders you want on this device</p></div>{notificationPermission === 'granted' && <SettingToggle checked={systemNotificationsEnabled} onChange={updateSystemNotificationsEnabled} label="System notifications" disabled={notificationBusy} />}</div>
                          {!oneSignalConfigured ? (
                            <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                              <p className="text-[10px] font-semibold leading-relaxed text-amber-700 dark:text-amber-300">Notifications can be enabled only from the published Attendenz app, not from a Cloudflare preview link.</p>
                              <button type="button" onClick={() => window.location.assign(ONE_SIGNAL_PRODUCTION_ORIGIN)} className="action-button action-button--update action-button--compact w-full">Open published app</button>
                            </div>
                          ) : notificationPermission !== 'granted' && <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-muted-foreground">{notificationPermission === 'denied' ? 'Blocked in iPhone settings' : notificationPermission === 'insecure' ? 'Secure connection needed' : notificationPermission === 'unsupported' ? 'Not available on this device' : 'Permission needed'}</span><button type="button" onClick={enableSystemNotifications} disabled={notificationBusy || notificationPermission === 'denied' || notificationPermission === 'unsupported' || notificationPermission === 'insecure'} className="action-button action-button--update action-button--compact disabled:opacity-50">{notificationBusy ? 'Checking…' : 'Allow notifications'}</button></div>}
                          {notificationPermission === 'granted' && <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold text-emerald-500">Permission granted</span><button type="button" onClick={testNotificationFromSettings} disabled={!systemNotificationsEnabled} className="action-button action-button--neutral action-button--compact disabled:opacity-50">Test</button></div>}
                          {systemNotificationsEnabled && <p className="text-[10px] leading-relaxed text-muted-foreground">Reminder connection: {reminderSyncStatus.state === 'synced' ? `Synced ${new Date(reminderSyncStatus.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : reminderSyncStatus.state === 'waiting-for-permission' ? 'Waiting for this device to finish connecting.' : reminderSyncStatus.state === 'offline' ? 'Waiting for an internet connection.' : reminderSyncStatus.state === 'error' ? 'Last connection attempt failed. It will retry automatically.' : 'Not configured yet.'}</p>}
                        </div>
                        <div className="space-y-2.5">
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">Midnight Need Attention summary</span><span className="block text-[10px] text-muted-foreground mt-0.5">One grouped alert for today’s warning subjects</span></span><SettingToggle checked={notificationPreferences.midnightNeedAttention} onChange={value => updateNotificationPreference('midnightNeedAttention', value)} label="Midnight Need Attention summary" /></label>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">Final scheduled class today</span><span className="block text-[10px] leading-relaxed text-muted-foreground mt-0.5">Tell me at midnight when a subject’s final planned class is today</span></span><SettingToggle checked={notificationPreferences.finalClassToday} onChange={value => updateNotificationPreference('finalClassToday', value)} label="Final scheduled class today" /></label>
                           <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">First class of the day</span><span className="block text-[10px] leading-relaxed text-muted-foreground mt-0.5">Tell me the first subject and time scheduled today</span></span><SettingToggle checked={notificationPreferences.firstClassToday} onChange={value => updateNotificationPreference('firstClassToday', value)} label="First class of the day" /></label>
                           <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">Before-class warning reminder</span><span className="block text-[10px] mt-0.5 text-muted-foreground">One alert {notificationPreferences.leadMinutes} minutes before each warning subject</span></span><SettingToggle checked={notificationPreferences.preClassNeedAttention} onChange={value => updateNotificationPreference('preClassNeedAttention', value)} label="Before-class warning reminder" /></label>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">All scheduled subjects</span><span className="block text-[10px] text-muted-foreground mt-0.5">Also remind me about normal classes in one grouped message</span></span><SettingToggle checked={notificationPreferences.allScheduledDigest} onChange={value => updateNotificationPreference('allScheduledDigest', value)} label="All scheduled subjects" /></label>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">AddNew changes</span><span className="block text-[10px] text-muted-foreground mt-0.5">Extra alerts after you make changes in Manage</span></span><SettingToggle checked={notificationPreferences.addNewChanges} onChange={value => updateNotificationPreference('addNewChanges', value)} label="AddNew changes" /></label>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">Update available</span><span className="block text-[10px] text-muted-foreground mt-0.5">Tell me once when a new version is ready</span></span><SettingToggle checked={notificationPreferences.updateAvailable} onChange={value => updateNotificationPreference('updateAvailable', value)} label="Update available" /></label>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="min-w-0"><span className="block text-xs font-semibold text-foreground">Update completed</span><span className="block text-[10px] text-muted-foreground mt-0.5">Tell me once when the update finishes</span></span><SettingToggle checked={notificationPreferences.updateCompleted} onChange={value => updateNotificationPreference('updateCompleted', value)} label="Update completed" /></label>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3"><span className="text-xs font-semibold text-foreground">Warning reminder lead time</span><select value={notificationPreferences.leadMinutes} onChange={e => updateNotificationPreference('leadMinutes', Number(e.target.value) as NotificationLeadMinutes)} className="ml-auto shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes</option></select></label>
                        </div>
                      </div>
                    )}
                    {activeSettingModal === 'theme' && (
                      <div className="space-y-2">
                        {(['system', 'light', 'dark'] as ThemePreference[]).map(option => <button key={option} type="button" onClick={() => { setThemePreference(option); localStorage.setItem('theme', option); applyThemePreference(option); }} className={cn('w-full flex items-center justify-between rounded-xl border p-3 text-left transition-colors', themePreference === option ? 'border-primary bg-primary/10' : 'border-border/60 bg-muted/20 hover:bg-muted/40')}><span><span className="block text-xs font-bold text-foreground">{option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}</span><span className="block text-[10px] text-muted-foreground mt-0.5">{option === 'system' ? 'Follow iPhone appearance' : `Always use ${option} appearance`}</span></span><span className={cn('text-[10px] font-extrabold uppercase', themePreference === option ? 'text-primary' : 'text-muted-foreground')}>{themePreference === option ? 'Selected' : 'Choose'}</span></button>)}
                      </div>
                    )}
                    {activeSettingModal === 'preferredPc' && (
                      <div className="space-y-4">
                        <div className="bg-muted/30 p-3.5 rounded-2xl border border-border/50 space-y-2">
                          <p className="text-xs text-muted-foreground leading-relaxed">Select your target attendance threshold. This percentage is used to compute required and missable classes across all subjects.</p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-medium text-muted-foreground">Current Target:</span>
                            <span className="text-sm font-extrabold text-primary">{preferredPercentage}%</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">Select Target Percentage</label>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                            {[50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].map((pct) => (
                              <button key={pct} type="button" onClick={() => setPendingPct(pct)} className={cn("action-button action-button--compact w-full", (pendingPct ?? preferredPercentage) === pct ? "action-button--update" : "action-button--neutral")}>
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </div>
                        {pendingPct !== null && (
                          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-left space-y-2">
                            <p className="text-xs font-bold text-foreground">Apply {pendingPct}% target?</p>
                            <p className="text-[11px] text-muted-foreground">All subjects and wards in this curriculum will use this threshold.</p>
                            <div className="flex gap-2"><button type="button" onClick={() => setPendingPct(null)} className="action-button action-button--cancel flex-1">Cancel</button><button type="button" onClick={() => { setPreferredPercentage(pendingPct); setPendingPct(null); }} className="action-button action-button--save flex-1">Apply</button></div>
                          </div>
                        )}
                        {pendingPct === null && <div className="pt-2 flex justify-end"><button type="button" onClick={() => setActiveSettingModal(null)} className="action-button action-button--save">Save & Close</button></div>}
                      </div>
                    )}
                    {activeSettingModal === 'curriculum' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-2 bg-muted/30 p-3.5 rounded-2xl border border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Current Curriculum:</span>
                            <span className="text-xs font-bold text-foreground">{activeCurriculum?.name || getActiveCurriculumName()}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/30">
                            <span className="text-xs font-medium text-muted-foreground">Current Routine Mode:</span>
                            <span className="text-xs font-bold text-primary">{subjectMode === 'preloaded' ? 'Preset routine' : 'Custom routine'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/30">
                            <span className="text-xs font-medium text-muted-foreground">Curriculum Status:</span>
                            <span className={cn("text-xs font-extrabold", curriculumStatus === 'Completed' ? "text-emerald-500" : "text-primary")}>{curriculumStatus}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <button type="button" onClick={handleToggleCurriculumStatus} className={cn("action-button flex-1", curriculumStatus === 'Completed' ? "action-button--neutral" : "action-button--save")}>
                            <span>{curriculumStatus === 'Completed' ? 'Mark as Active' : 'Mark Curriculum as Completed'}</span>
                          </button>
                          <button type="button" onClick={() => { setActiveSettingModal(null); openCurriculumManager(); }} className="action-button action-button--edit flex-1">
                            <span>Change Curriculum</span>
                          </button>
                        </div>
                      </div>
                    )}
                    {activeSettingModal === 'snapshot' && (
                      <div className="space-y-3">
                        {snapshotToRestore ? (
                          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left space-y-3">
                            <h4 className="text-sm font-bold text-foreground">Restore this snapshot?</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">{snapshotToRestore.label} · {snapshotToRestore.timestamp}. Current data will be replaced by this backup point.</p>
                            <div className="flex gap-2"><button type="button" onClick={() => setSnapshotToRestore(null)} className="action-button action-button--cancel flex-1">Cancel</button><button type="button" onClick={() => { const id = snapshotToRestore.id; setSnapshotToRestore(null); handleRestoreSnapshot(id); }} className="action-button action-button--transfer flex-1">Restore</button></div>
                          </div>
                        ) : snapshotToDelete ? (
                          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-left space-y-3">
                            <h4 className="text-sm font-bold text-foreground">Delete this snapshot?</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">This removes only the selected snapshot. Your active curriculum data is not changed.</p>
                            <div className="flex gap-2"><button type="button" onClick={() => setSnapshotToDelete(null)} className="action-button action-button--cancel flex-1">Cancel</button><button type="button" onClick={handleDeleteSnapshot} className="action-button action-button--danger flex-1">Delete</button></div>
                          </div>
                        ) : (
                        <>
                        <div className="flex items-center justify-between bg-muted/30 p-2.5 rounded-xl border border-border/50">
                          <span className="text-xs font-medium text-foreground">Create instant state snapshot</span>
                          <button type="button" onClick={handleTakeSnapshot} className="action-button action-button--transfer">Take Snapshot</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button onClick={() => setShowSnapshotsList(!showSnapshotsList)} className="action-button action-button--neutral w-full">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Saved ({snapshots.length})</span>
                          </button>
                          <button onClick={handleClearCache} className="action-button action-button--warning w-full">
                            <Eraser className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Clear Cache</span>
                          </button>
                        </div>
                        {showSnapshotsList && (
                          <div className="pt-2 border-t border-border/40 space-y-2">
                            {snapshots.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">No snapshots saved yet.</p>
                            ) : (
                              snapshots.map(s => (
                                <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60">
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{s.label}</p>
                                    <p className="text-[10px] text-muted-foreground">{s.timestamp}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button onClick={() => setSnapshotToRestore(s)} className="action-button action-button--transfer action-button--compact">
                                      <RefreshCw className="w-3 h-3" />
                                      Restore
                                    </button>
                                    <button onClick={() => setSnapshotToDelete(s)} className="action-button action-button--danger action-button--compact" title="Delete snapshot">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        {snapshotMsg && (<p className="text-xs font-semibold text-center text-primary bg-primary/10 py-2 rounded-xl">{snapshotMsg}</p>)}
                        </>
                        )}
                      </div>
                    )}
                    {activeSettingModal === 'export' && (
                      <div className="space-y-3 text-left">
                        {busy && <p className="text-xs font-semibold text-center text-primary bg-primary/10 py-2 rounded-xl">{busy}</p>}
                        <p className="text-xs text-muted-foreground leading-relaxed">Export your attendance records, subject statistics, and ward rotations in clean, printable formats.</p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Supported Formats</label>
                          <div className="grid grid-cols-3 gap-2">
                            <button type="button" onClick={() => setExportFormat('pdf')} className={cn("action-button action-button--compact w-full", exportFormat === 'pdf' ? "action-button--warning" : "action-button--neutral")}>
                              <FileText className="w-3.5 h-3.5" /><span>PDF (.pdf)</span>
                            </button>
                            <button type="button" onClick={() => setExportFormat('excel')} className={cn("action-button action-button--compact w-full", exportFormat === 'excel' ? "action-button--save" : "action-button--neutral")}>
                              <FileSpreadsheet className="w-3.5 h-3.5" /><span>Excel (.xlsx)</span>
                            </button>
                            <button type="button" onClick={() => setExportFormat('csv')} className={cn("action-button action-button--compact w-full", exportFormat === 'csv' ? "action-button--transfer" : "action-button--neutral")}>
                              <Download className="w-3.5 h-3.5" /><span>CSV (.csv)</span>
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Export Scope</label>
                          <select value={exportScope} onChange={(e) => setExportScope(e.target.value as any)} className="w-full bg-muted/50 border border-border/80 rounded-xl px-3 py-2 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20">
                            <option value="complete">Complete Attendance (All Subjects & Wards)</option>
                            <option value="subject">Subject-wise Filter</option>
                            <option value="custom">Custom Date Range</option>
                            <option value="semester">Semester / Academic Period</option>
                          </select>
                        </div>
                        {exportScope === 'subject' && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground">Select Subject / Ward</label>
                            <select value={exportSelectedSubject} onChange={(e) => setExportSelectedSubject(e.target.value)} className="w-full bg-muted/50 border border-border/80 rounded-xl px-3 py-2 text-xs font-semibold text-foreground outline-none">
                              <option value="">-- Choose Subject --</option>
                              {subjectMode === 'preloaded' ? (
                                <>
                                  {CATEGORIES.flatMap(c => c.subjects).map(s => (<option key={`subject:${s.name}`} value={`subject:${s.name}`}>{s.name}</option>))}
                                  {INTEGRATED_SUBJECTS.map(s => (<option key={`subject:${s.name}`} value={`subject:${s.name}`}>{s.name}</option>))}
                                  {userAddedSubjects.filter(s => !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')).map(s => (<option key={`subject:${s.name}`} value={`subject:${s.name}`}>{s.name}</option>))}
                                  {userAddedSubjects.filter(s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching').map(s => (<option key={`sgt:${s.id}`} value={`sgt:${s.id}`}>{s.name} (SGT)</option>))}
                                  {WARD_SUBJECTS.map(w => (<option key={`ward:${w.name}`} value={`ward:${w.name}`}>{w.name} (Ward)</option>))}
                                  {presetWardSchedule.filter(e => !WARD_SUBJECTS.some(w => w.name === e.ward)).map((e, idx) => (<option key={`ward:${e.ward}:${idx}`} value={`ward:${e.ward}`}>{e.ward} (Ward)</option>))}
                                </>
                              ) : (
                                <>
                                  {customSubjects.filter(s => !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')).map(s => (<option key={`subject:${s.name}`} value={`subject:${s.name}`}>{s.name}</option>))}
                                  {customSubjects.filter(s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching').map(s => (<option key={`sgt:${s.id}`} value={`sgt:${s.id}`}>{s.name} (SGT)</option>))}
                                  {customWards.map(w => (<option key={`ward:${w.name}`} value={`ward:${w.name}`}>{w.name} (Ward)</option>))}
                                </>
                              )}
                            </select>
                          </div>
                        )}
                        {exportScope === 'custom' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-muted-foreground block mb-1">Start Date</label>
                              <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} className="w-full bg-muted/50 border border-border/80 rounded-xl px-2.5 py-1.5 text-center text-xs font-semibold text-foreground" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-muted-foreground block mb-1">End Date</label>
                              <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} className="w-full bg-muted/50 border border-border/80 rounded-xl px-2.5 py-1.5 text-center text-xs font-semibold text-foreground" />
                            </div>
                          </div>
                        )}
                        {exportScope === 'semester' && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground">Academic Period</label>
                            <select value={exportSemester} onChange={(e) => setExportSemester(e.target.value)} className="w-full bg-muted/50 border border-border/80 rounded-xl px-3 py-2 text-xs font-semibold text-foreground outline-none">
                              <option value="Current Month">Current Month</option>
                              <option value="Last 3 Months">Last 3 Months</option>
                              <option value="Full Academic Term">Full Academic Term / Year</option>
                            </select>
                          </div>
                        )}
                         <button type="button" onClick={handleExecuteExport} className="action-button action-button--transfer w-full mt-2">
                          <Download className="w-4 h-4" />
                          <span>Export {exportFormat.toUpperCase()} Report</span>
                        </button>
                        {exportMsg && (
                          <p className="text-xs font-semibold text-center text-amber-500 bg-amber-500/10 border border-amber-500/20 py-2 rounded-xl mt-2">{exportMsg}</p>
                        )}
                      </div>
                    )}
                    {activeSettingModal === 'dataProtection' && (
                      <div className="space-y-3 text-left">
                        {showDeleteDataDialog ? (
                          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 space-y-3">
                            <h4 className="text-sm font-bold text-foreground">Delete All App Data?</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">This permanently erases attendance, routines, snapshots, profile data, target settings, and setup state. Export a backup first if you are unsure.</p>
                            <div className="flex gap-2"><button type="button" onClick={() => setShowDeleteDataDialog(false)} className="action-button action-button--cancel flex-1">Cancel</button><button type="button" onClick={handleDeleteAllData} className="action-button action-button--danger flex-1">Yes, Delete Everything</button></div>
                          </div>
                        ) : (
                        <>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {runtimeStorageInfo.isPersistent
                            ? "Persistent local storage is active. Your records are protected against browser cache eviction."
                            : "Your app data is stored locally on this device."}
                        </p>
                        <div className="p-3 bg-muted/40 rounded-2xl border border-border/50 space-y-1">
                          <p className="text-[10px] uppercase font-extrabold text-muted-foreground">Storage Engine</p>
                          <p className="text-xs font-bold text-foreground">IndexedDB Database (AttendenzDatabase) · {runtimeStorageInfo.techTitle}</p>
                        </div>
                        <div className="p-3 bg-muted/40 rounded-2xl border border-border/50 space-y-1">
                          <p className="text-[10px] uppercase font-extrabold text-muted-foreground">Persistent Storage Permission</p>
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("font-bold text-[11px]", runtimeStorageInfo.isPersistent ? "text-emerald-500" : "text-amber-500")}>
                              {runtimeStorageInfo.isPersistent ? 'Granted ✓' : 'Not Granted (Default Browser Policy)'}
                            </span>
                            {!runtimeStorageInfo.isPersistent && (
                              <button type="button" onClick={async () => {
                                const granted = await requestPersistentStorage();
                                if (granted) {
                                  setRuntimeStorageInfo(prev => ({ ...prev, isPersistent: true, techTitle: 'IndexedDB + Persistent Storage Granted' }));
                                  import("sonner").then(({ toast }) => toast.info('Persistent storage granted!'));
                                } else {
                                  import("sonner").then(({ toast }) => toast.info('Browser kept standard storage policy. Install app as PWA to grant persistent storage.'));
                                }
                              }} className="action-button action-button--transfer action-button--compact shrink-0">
                                Request Permission
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="p-3 bg-muted/40 rounded-2xl border border-border/50 space-y-1">
                          <p className="text-[10px] uppercase font-extrabold text-muted-foreground">Approximate Storage Used</p>
                          <p className="font-bold text-foreground">{runtimeStorageInfo.usedMB} used of {runtimeStorageInfo.quotaMB} estimated quota</p>
                        </div>
                        <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-muted-foreground text-[11px] leading-relaxed flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-foreground font-bold">Privacy & Storage Note:</strong> Your attendance logs and schedules are stored 100% locally on this device. Browsers may clear un-persisted cache if device storage becomes low. Regular backups are recommended.
                          </div>
                        </div>
                        </>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 5. Danger Zone */}
          <div className="contents">
            <StickySectionLabel label="Danger Zone" stackIndex={4} zClass="z-30" />
            <div className="bg-card/80 backdrop-blur-xl border border-destructive/30 rounded-2xl shadow-sm overflow-hidden">
              <SettingRow icon={<Trash2 className="w-4 h-4" />} title="Delete All App’s Data" description="Permanently erase all local app data" tone="danger" onClick={() => setShowDeleteDataDialog(true)} />
            </div>
          </div>
      </div>
      {/* All dialogs remain as before */}
      <AnimatePresence>
        {showUpdatePrompt && isUpdateAvailable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowUpdatePrompt(false); }}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 w-full max-w-sm max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20"><Download className="w-5 h-5 text-amber-500" /></div>
                <div className="text-left">
                  <h3 className="text-base font-bold text-foreground leading-tight">Update to <span className="text-emerald-400">v{serverVersion}</span> (Stable)</h3>
                  <p className="text-[11px] text-muted-foreground font-medium">Full App Backup Recommended</p>
                </div>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed text-left">We recommend creating a <strong className="text-foreground">Full App Backup</strong> before updating to ensure all your attendance records and preferences remain 100% safe.</p>
              <div className="flex flex-col gap-2 pt-1">
                <button type="button" onClick={() => handleApplyUpdate(true)} className="action-button action-button--transfer w-full">
                  <Download className="w-4 h-4" /><span>Backup & Continue</span>
                </button>
                <button type="button" onClick={() => handleApplyUpdate(false)} className="action-button action-button--neutral w-full">Skip Backup</button>
                <button type="button" onClick={() => setShowUpdatePrompt(false)} className="action-button action-button--cancel w-full">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {updatePhase !== 'none' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-md z-[140] flex items-end justify-center p-4">
            <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-8 w-full max-w-xs max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] flex flex-col items-center gap-4">
              {updatePhase === 'backing' ? (
                <>
                  <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                  <p className="text-sm font-extrabold text-foreground">Backing Up your Data{'.'.repeat(dots)}</p>
                  <p className="text-[10px] text-muted-foreground text-center">Securing your attendance records & preferences...</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <p className="text-sm font-extrabold text-foreground">Just Updating{'.'.repeat(dots)}</p>
                  <p className="text-[10px] text-muted-foreground text-center">Hold on — the new version is being installed. The app reloads at <strong className="text-foreground">Welcome Screen</strong></p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteDataDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/65 backdrop-blur-md z-[150] flex items-end justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowDeleteDataDialog(false); }}>
            <motion.div initial={{ y: 64, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 64, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 300 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-destructive/30 rounded-3xl p-6 w-full max-w-sm max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-destructive/15 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-destructive" /></div><div><h3 className="text-base font-bold text-foreground">Delete All App Data?</h3><p className="text-[11px] text-destructive font-semibold">Irreversible action</p></div></div>
              <p className="text-xs text-muted-foreground leading-relaxed">This permanently erases attendance records, routines, snapshots, profile data, target settings, and setup state. Export a backup first if you are unsure.</p>
              <div className="flex gap-2"><button type="button" onClick={() => setShowDeleteDataDialog(false)} className="action-button action-button--cancel flex-1">Cancel</button><button type="button" onClick={handleDeleteAllData} className="action-button action-button--danger flex-1">Yes, Delete Everything</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSwitchDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4" onClick={e => { if (e.target === e.currentTarget) { setConfirmMarkComplete(false); setShowSwitchDialog(false); } }}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 w-full max-w-md max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20"><GraduationCap className="w-5 h-5 text-primary" /></div>
                  <div className="text-left"><h3 className="text-base font-bold text-foreground">Curriculum Management</h3><p className="text-[11px] text-muted-foreground">Switch between saved routines. Each keeps its own subjects, SGTs, wards, schedules, and attendance.</p></div>
                </div>
                <button type="button" onClick={() => { setConfirmMarkComplete(false); setShowSwitchDialog(false); }} className="action-button action-button--close shrink-0">Close</button>
              </div>
              {confirmMarkComplete ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left space-y-3">
                  <h4 className="text-sm font-bold text-foreground">Mark curriculum as Completed?</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">An auto-snapshot of the current records will be saved first, so nothing is lost.</p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setConfirmMarkComplete(false)} className="action-button action-button--cancel flex-1">Cancel</button>
                    <button type="button" onClick={applyMarkComplete} className="action-button action-button--save flex-1">Mark Completed</button>
                  </div>
                </div>
              ) : (
              <>
              <div className="space-y-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground text-left">Active curricula</p>
                {curricula.filter(c => c.status === 'active').sort((a, b) => Number(b.id === activeCurriculumId) - Number(a.id === activeCurriculumId)).map(c => (
                  <div key={c.id} className={cn('rounded-2xl border p-3 text-left', c.id === activeCurriculumId ? 'border-primary/50 bg-primary/5' : 'border-border/60')}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => handleActivateCurriculum(c.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                        <p className="text-sm font-bold text-foreground truncate">{c.name} <span className="text-[9px] font-extrabold uppercase tracking-wider text-primary">{c.kind === 'preset' ? 'Preset' : 'Custom'}</span></p>
                        <p className="text-[10px] text-muted-foreground">{c.id === activeCurriculumId ? 'Currently selected' : c.kind === 'preset' ? 'Editable 5th Year / Final Phase reference routine' : 'Separate Custom routine with its own data'}</p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => { setEditingCurriculumId(c.id); setEditingCurriculumName(c.name); }} className="action-button action-button--edit shrink-0" aria-label={`Rename ${c.name}`}>Rename</button>
                        {c.id !== activeCurriculumId && <button type="button" onClick={() => handleArchiveCurriculum(c.id)} className="action-button action-button--warning shrink-0" aria-label={`Archive ${c.name}`}>Archive</button>}
                        {editingCurriculumId === c.id && <button type="button" onClick={() => handleRenameCurriculum(c.id)} className="action-button action-button--save">Save</button>}
                      </div>
                    </div>
                    {editingCurriculumId === c.id && <input autoFocus value={editingCurriculumName} onChange={e => setEditingCurriculumName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleRenameCurriculum(c.id); }} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary" />}
                  </div>
                ))}
              </div>
              {curricula.some(c => c.status === 'archived') && <div className="space-y-2"><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground text-left">Archived curricula</p>{curricula.filter(c => c.status === 'archived').map(c => <div key={c.id} className="rounded-2xl border border-border/60 p-3 flex items-center gap-2"><button type="button" onClick={() => handleActivateCurriculum(c.id)} className="flex-1 min-w-0 text-left cursor-pointer"><p className="text-sm font-bold text-foreground truncate">{c.name} <span className="text-[9px] font-extrabold uppercase tracking-wider text-primary">{c.kind === 'preset' ? 'Preset' : 'Custom'}</span></p><p className="text-[10px] text-muted-foreground">Reopen this curriculum with all its saved data</p></button><button type="button" onClick={() => handleActivateCurriculum(c.id)} className="action-button action-button--edit shrink-0">Reopen</button></div>)}</div>}
              <div className="border-t border-border/50 pt-4 space-y-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground text-left">Create another Custom routine</p>
                <p className="text-[10px] text-muted-foreground text-left leading-relaxed">Create a separate routine for another year or phase. It starts empty and will not change your other routines.</p>
                <div className="flex gap-2"><input value={newCurriculumName} onChange={e => setNewCurriculumName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateCurriculum(); }} placeholder="e.g. 2nd Year / Second Phase" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none focus:border-primary" /><button type="button" onClick={handleCreateCurriculum} className="action-button action-button--edit shrink-0">Create Custom Routine</button></div>
              </div>
              </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditingName && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-end justify-center p-4" onClick={() => setIsEditingName(false)}>
            <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="modal-sheet-content bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-5 w-full max-w-sm shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-4" onClick={e => e.stopPropagation()}>
              <div>
                <h3 className="text-base font-bold text-foreground">Edit Name</h3>
                <p className="text-[11px] text-muted-foreground">Update your display name.</p>
              </div>
              <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); }} className="w-full bg-muted px-3 py-2.5 rounded-xl text-sm font-bold text-foreground outline-none border border-primary/40 focus:ring-2 focus:ring-primary/20" autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsEditingName(false)} className="action-button action-button--cancel flex-1">Cancel</button>
                <button type="button" onClick={handleSaveName} className="action-button action-button--save flex-1">Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}