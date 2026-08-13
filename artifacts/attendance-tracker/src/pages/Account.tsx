import { Camera, Trash2, Check, Pencil, Sparkles, AlertCircle, Camera as SnapshotIcon, RefreshCw, Eraser, Clock, Sun, Moon, Download, ChevronRight, CheckCircle2, ArrowRightLeft, Send, FileText, Database, HardDrive, FileSpreadsheet, Info, GraduationCap, X, Upload } from 'lucide-react';
import { createSnapshot, getSnapshots, restoreSnapshot, clearLocalCache, autoSnapshotOnLoad, exportDataAsJSON, importDataFromJSON, Snapshot, shareDataAsJSON } from '../utils/snapshotUtils';
import React, { useRef, useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData, SubjectMode } from '@/contexts/CustomDataContext';
import { useLocation } from 'wouter';
import { storageClear, storageSetItem } from '@/lib/idb';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatISODateDDMMYY } from '@/lib/utils';
import { APP_VERSION, LATEST_VERSION } from '@/lib/appVersion';
import { CATEGORIES, WARD_SUBJECTS, INTEGRATED_SUBJECTS } from '@/lib/constants';
import { generatePDFReport, generateExcelReport, generateCSVReport } from '@/lib/exportUtils';
import maleStudentProfile from '@/assets/images/male_student_profile_1784286906428.jpg';
import femaleStudentProfile from '@/assets/images/female_student_profile_1784286920737.jpg';
import neutralStudentProfile from '@/assets/images/neutral_student_profile_1784286934617.jpg';

const SNAPSHOTS_KEY = 'attendenz_snapshots_v1';

export default function Account() {
  const { username, updateUsername, profileImage, updateProfileImage, isPersistentStorage, requestPersistentStorage } = useAuth();
  const [, setLocation] = useLocation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(username);
  useEffect(() => { setNameInput(username); }, [username]);
  const handleSaveName = () => { if (nameInput.trim()) updateUsername(nameInput.trim()); setIsEditingName(false); };
  const { subjects, wards, homeSelections, preferredPercentage, setPreferredPercentage } = useAttendance();
  const { customSubjects, customWards, userAddedSubjects, presetWardSchedule, subjectMode, changeSubjectMode, setWhatsNewOpen, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned } = useCustomData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [storageSize, setStorageSize] = useState('0.00 KB');
  const [showDeleteDataDialog, setShowDeleteDataDialog] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string>(() => localStorage.getItem('att_app_version') || APP_VERSION);
  const [pwaReady, setPwaReady] = useState<boolean>(() => localStorage.getItem('att_pwa_update_ready') === 'true');
  const [serverVersion] = useState<string>(() => localStorage.getItem('att_pwa_latest_version') || LATEST_VERSION);
    useEffect(() => {
    const on = () => setPwaReady(true);
    window.addEventListener('attendenz:update-ready', on);
    return () => window.removeEventListener('attendenz:update-ready', on);
  }, []);
   const isUpdateAvailable = installedVersion !== LATEST_VERSION || pwaReady;
   const [updatingNow, setUpdatingNow] = useState(false);
   const [dots, setDots] = useState(1);
   useEffect(() => {
  if (!updatingNow) return;
  const t = window.setInterval(() => setDots(d => (d % 3) + 1), 450);
  return () => window.clearInterval(t);
  }, [updatingNow]);

  /* Round-5: progress + confirm-before states */
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingPct, setPendingPct] = useState<number | null>(null);
  const [confirmMarkComplete, setConfirmMarkComplete] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] = useState<Snapshot | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotMsg, setSnapshotMsg] = useState('');
  const [showSnapshotsList, setShowSnapshotsList] = useState(false);
  const [snapshotToDelete, setSnapshotToDelete] = useState<Snapshot | null>(null);
  const [curriculumStatus, setCurriculumStatus] = useState<'Active' | 'Completed'>(() => (localStorage.getItem('att_curriculum_status') as 'Active' | 'Completed') || 'Active');

  const handleToggleCurriculumStatus = () => {
    const next = curriculumStatus === 'Active' ? 'Completed' : 'Active';
    if (next === 'Completed') { setConfirmMarkComplete(true); return; }
    setCurriculumStatus('Active');
    localStorage.setItem('att_curriculum_status', 'Active');
    import('sonner').then(({ toast }) => toast.info('Curriculum marked as Active.'));
  };
  const applyMarkComplete = () => {
    setConfirmMarkComplete(false);
    setCurriculumStatus('Completed');
    localStorage.setItem('att_curriculum_status', 'Completed');
    createSnapshot(`Curriculum Completed (${subjectMode === 'preloaded' ? 'MBBS 5th Year' : 'Custom Routine'})`);
    setSnapshots(getSnapshots());
    import('sonner').then(({ toast }) => toast.success('Curriculum marked as Completed! Auto-snapshot saved.'));
  };
  const handleApplyUpdate = (withBackup: boolean) => {
      if (withBackup) exportDataAsJSON();
      const newVer = localStorage.getItem('att_pwa_latest_version') || LATEST_VERSION;
      localStorage.setItem('att_app_version', newVer);
      localStorage.setItem('att_just_updated', 'true');
      localStorage.removeItem('att_has_seen_welcome_v1');
      localStorage.removeItem('att_pwa_update_ready');
      setInstalledVersion(newVer);
      setShowUpdatePrompt(false);
      setUpdatingNow(true);
      const applyPwa = (window as any).attendenzApplyPwaUpdate;
      if (applyPwa) applyPwa(); // SW swaps the shell in the background
      window.setTimeout(() => {
      window.location.href = import.meta.env.BASE_URL || '/'; // reopen on Home → What's New
      }, 5600);
      };

  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [exportScope, setExportScope] = useState<'complete' | 'subject' | 'custom' | 'semester'>('complete');
  const [exportSelectedSubject, setExportSelectedSubject] = useState<string>('');
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [exportSemester, setExportSemester] = useState<string>('Current Month');
  const [exportMsg, setExportMsg] = useState('');
  const [runtimeStorageInfo, setRuntimeStorageInfo] = useState({ isIndexedDB: true, isPersistent: false, techTitle: 'IndexedDB (Local Device Storage)', usedMB: '0.00 MB', quotaMB: '0.00 GB' });
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
      let techTitle = 'Standard Local Storage';
      if (hasIDB && isPersisted) techTitle = 'IndexedDB + Persistent Storage Granted';
      else if (hasIDB) techTitle = 'IndexedDB (Local Device Storage)';
      setRuntimeStorageInfo({ isIndexedDB: hasIDB, isPersistent: isPersisted, techTitle, usedMB: usedStr, quotaMB: quotaStr });
    }
    detectStorage();
  }, [isPersistentStorage]);

  // Compute SGT subject names for later use
  const sgtSubjectNames = new Set<string>();
  if (subjectMode === 'preloaded') {
    userAddedSubjects.filter(s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')
      .forEach(s => sgtSubjectNames.add(s.name));
  } else {
    customSubjects.filter(s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')
      .forEach(s => sgtSubjectNames.add(s.name));
  }

  const semesterRange = (period: string): { s: string; e: string } => {
    const now = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (period === 'Current Month') return { s: iso(new Date(now.getFullYear(), now.getMonth(), 1)), e: iso(now) };
    if (period === 'Last 3 Months') return { s: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), e: iso(now) };
    // Full Academic Term / Year
    if (subjectMode === 'preloaded') {
      return { s: '2026-01-24', e: iso(now) }; // Fixed start for preset MBBS
    } else {
      // Custom mode: derive start from earliest attendance record or subject/ward start date
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
    const entities: Array<{ name: string; category: string; isWard: boolean; plannedTotal: number }> = [];
    const pushEntity = (name: string, category: string, isWard: boolean, planned: number) => {
      if (!entities.some(e => e.isWard === isWard && e.name.toLowerCase() === name.toLowerCase())) entities.push({ name, category, isWard, plannedTotal: planned });
    };
    if (subjectMode === 'preloaded') {
      for (const cat of CATEGORIES) for (const s of cat.subjects) pushEntity(s.name, cat.name, false, getSubjectPlannedTotal(s.name));
      for (const s of INTEGRATED_SUBJECTS) pushEntity(s.name, 'Academic', false, getSubjectPlannedTotal(s.name));
      // SGT subjects as clinical
      for (const ua of userAddedSubjects) {
        if (ua.subjectType === 'allied' && ua.parentName === 'Small Group Teaching') {
          pushEntity(ua.name, 'Clinical Wards', false, ua.plannedClasses || getSubjectPlannedTotal(ua.name));
        } else {
          pushEntity(ua.name, 'Added by you', false, ua.plannedClasses || getSubjectPlannedTotal(ua.name));
        }
      }
      // Normal wards
      for (const w of WARD_SUBJECTS) pushEntity(w.name, 'Clinical Wards', true, getPresetWardTotalPlanned(w.name));
      for (const e of presetWardSchedule) pushEntity(e.ward, 'Clinical Wards', true, getPresetWardTotalPlanned(e.ward));
    } else {
      for (const cs of customSubjects) {
        if (cs.subjectType === 'allied' && cs.parentName === 'Small Group Teaching') {
          pushEntity(cs.name, 'Clinical Wards', false, cs.plannedClasses || getSubjectPlannedTotal(cs.name));
        } else {
          pushEntity(cs.name, cs.category || 'Custom Subject', false, cs.plannedClasses);
        }
      }
      for (const cw of customWards) pushEntity(cw.name, 'Custom Wards', true, getCustomWardTotalPlanned(cw.startDate, cw.endDate));
    }
    const agg = new Map<string, { name: string; category: string; attended: number; missed: number; plannedTotal: number }>();
    for (const [key, sel] of Object.entries(homeSelections)) {
      const date = key.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (date < start || date > end) continue;
      if (sel !== 'attended' && sel !== 'missed') continue;
      const rest = key.slice(11);
      for (const e of entities) {
        // Normalise names for robust matching
        const norm = (s: string) => s.toLowerCase().replace(/[-\s]+/g, '_');
        const prefixes = e.isWard ? [`ward-${norm(e.name)}`, `ward_${norm(e.name)}`] : [norm(e.name)];
        const normRest = norm(rest);
        const matched = prefixes.some(p => normRest === p || normRest.startsWith(p + '-') || normRest.startsWith(p + '_'));
        if (matched) {
          const id = `${e.isWard ? 'w' : 's'}_${e.name.toLowerCase()}`;
          const cur = agg.get(id) || { name: e.name, category: e.category, attended: 0, missed: 0, plannedTotal: e.plannedTotal };
          if (sel === 'attended') cur.attended += 1; else cur.missed += 1;
          agg.set(id, cur);
          break;
        }
      }
    }
    // Post-process: add (SGT) tag to SGT subjects
    return Array.from(agg.values()).map(a => ({
      ...a,
      name: sgtSubjectNames.has(a.name) ? `${a.name} (SGT)` : a.name,
    }));
  };

  const handleExecuteExport = async () => {
    setExportMsg('');
    const rawItems: Array<{ name: string; category?: string; attended: number; total: number; plannedTotal: number }> = [];
    if (subjectMode === 'preloaded') {
      for (const cat of CATEGORIES) for (const sub of cat.subjects) {
        const data = subjects[sub.name] || { attended: 0, missed: 0 };
        rawItems.push({ name: sub.name, category: cat.name, attended: data.attended, total: data.attended + data.missed, plannedTotal: getSubjectPlannedTotal(sub.name) || 0 });
      }
      // Integrated subjects → Academic section
      for (const s of INTEGRATED_SUBJECTS) {
        const data = subjects[s.name] || { attended: 0, missed: 0 };
        rawItems.push({ name: s.name, category: 'Academic', attended: data.attended, total: data.attended + data.missed, plannedTotal: getSubjectPlannedTotal(s.name) || 0 });
      }
      // User-added subjects: SGT -> Clinical with tag, others -> Added by you
      for (const ua of userAddedSubjects) {
        const data = subjects[ua.name] || { attended: 0, missed: 0 };
        if (ua.subjectType === 'allied' && ua.parentName === 'Small Group Teaching') {
          rawItems.push({ name: `${ua.name} (SGT)`, category: 'Clinical Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: ua.plannedClasses || getSubjectPlannedTotal(ua.name) || 0 });
        } else {
          rawItems.push({ name: ua.name, category: 'Added by you', attended: data.attended, total: data.attended + data.missed, plannedTotal: ua.plannedClasses || getSubjectPlannedTotal(ua.name) || 0 });
        }
      }
      // Wards
      for (const w of WARD_SUBJECTS) {
        const data = wards[`ward-${w.name}`] || { attended: 0, missed: 0 };
        rawItems.push({ name: `${w.name} (Ward)`, category: 'Clinical Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: getPresetWardTotalPlanned(w.name) || 0 });
      }
    } else {
      for (const cs of customSubjects) {
        const data = subjects[cs.name] || { attended: 0, missed: 0 };
        if (cs.subjectType === 'allied' && cs.parentName === 'Small Group Teaching') {
          rawItems.push({ name: `${cs.name} (SGT)`, category: 'Clinical Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: cs.plannedClasses || getSubjectPlannedTotal(cs.name) || 0 });
        } else {
          rawItems.push({ name: cs.name, category: cs.category || 'Custom Subject', attended: data.attended, total: data.attended + data.missed, plannedTotal: cs.plannedClasses || getSubjectPlannedTotal(cs.name) || 0 });
        }
      }
      for (const cw of customWards) {
        const data = wards[`ward-${cw.name}`] || { attended: 0, missed: 0 };
        rawItems.push({ name: `${cw.name} (Ward)`, category: 'Custom Wards', attended: data.attended, total: data.attended + data.missed, plannedTotal: getCustomWardTotalPlanned(cw.startDate, cw.endDate) || 0 });
      }
    }
    let filteredItems = rawItems;
    let filterTitle = 'Complete Attendance';
    if (exportScope === 'subject' && exportSelectedSubject) {
      filteredItems = rawItems.filter(i => i.name === exportSelectedSubject || i.name.startsWith(exportSelectedSubject));
      filterTitle = exportSelectedSubject;
    } else if (exportScope === 'custom') {
      // Validate date range
      if (exportStartDate && exportEndDate && exportStartDate > exportEndDate) {
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
          // target 100% and pct < 100
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
      else if (exportFormat === 'excel') generateExcelReport(reportOptions);
      else if (exportFormat === 'csv') generateCSVReport(reportOptions);
      import('sonner').then(({ toast }) => toast.success('Report exported.'));
    } finally { setBusy(null); }
  };

  const [activeSettingModal, setActiveSettingModal] = useState<'preferredPc' | 'curriculum' | 'transfer' | 'snapshot' | 'backup' | 'export' | 'dataProtection' | null>(null);
  const [transferImportData, setTransferImportData] = useState<any>(null);
  const transferFileInputRef = useRef<HTMLInputElement>(null);
  const handleShareData = async () => {
    const success = await shareDataAsJSON();
    if (success) import('sonner').then(({ toast }) => toast.success('Transfer file ready!'));
    else import('sonner').then(({ toast }) => toast.error('Failed to prepare transfer file.'));
  };
  const handleTransferFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsedData = JSON.parse(content);
          if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) throw new Error('Invalid backup file format.');
          setTransferImportData(parsedData);
        } catch (err) { import('sonner').then(({ toast }) => toast.error('Invalid transfer file format.')); }
      };
      reader.readAsText(file);
    }
  };
  const executeTransferImport = () => {
    if (!transferImportData) return;
    for (const [key, value] of Object.entries(transferImportData)) {
      if (value !== null && value !== undefined) {
        const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
        // Write to both localStorage and IndexedDB
        localStorage.setItem(key, stringVal);
        storageSetItem(key, stringVal);
      }
    }
    import('sonner').then(({ toast }) => toast.success('Data transferred successfully! Reloading...'));
    setLocation('/');
    setTimeout(() => window.location.reload(), 1500);
  };
  useEffect(() => { autoSnapshotOnLoad(); setSnapshots(getSnapshots()); }, []);
  const handleTakeSnapshot = () => {
    createSnapshot('Manual Checkpoint');
    setSnapshots(getSnapshots());
    setSnapshotMsg('✓ Snapshot created successfully!');
    setTimeout(() => setSnapshotMsg(''), 3000);
  };
  const handleRestoreSnapshot = (id: string) => {
    if (restoreSnapshot(id)) {
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
    setSnapshotToDelete(null);
    setSnapshotMsg('✓ Snapshot deleted.');
    setTimeout(() => setSnapshotMsg(''), 3000);
  };
  const handleClearCache = () => {
    const cleared = clearLocalCache();
    setSnapshotMsg(`✓ Cleared ${cleared} temporary cached items safely! Attendance records & subjects remain 100% intact.`);
    setTimeout(() => setSnapshotMsg(''), 4000);
  };
  const handleDeleteAllData = async () => {
    await storageClear();
    try { localStorage.clear(); } catch {}
    window.location.reload();
  };
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [switchStep, setSwitchStep] = useState<'warning' | 'final' | 'backup_found'>('warning');
  const [pendingMode, setPendingMode] = useState<SubjectMode | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme === 'dark';
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });
  useEffect(() => { setIsDark(document.documentElement.classList.contains('dark')); }, []);
  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
    else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
  };
  const getSnapshotKey = (mode: SubjectMode) => `att_snapshot_${mode}`;
  const initiateSwitch = (newMode: SubjectMode) => {
    setPendingMode(newMode);
    const snapshot = localStorage.getItem(getSnapshotKey(newMode));
    if (snapshot) setSwitchStep('backup_found'); else setSwitchStep('warning');
    setShowSwitchDialog(true);
  };
  const saveInternalSnapshot = () => {
    const data: Record<string, any> = {};
    const keysToSave = ['attendance_tracker_subjects', 'attendance_tracker_ward', 'attendance_tracker_home_selections', 'att_preset_timetable', 'att_preset_ward_schedule', 'att_preset_subject_totals', 'att_custom_subjects', 'att_custom_wards', 'att_user_added_subjects'];
    keysToSave.forEach(k => { const val = localStorage.getItem(k); if (val) data[k] = val; });
    localStorage.setItem(getSnapshotKey(subjectMode), JSON.stringify(data));
  };
  const handleRestoreFromSnapshot = () => {
    if (!pendingMode) return;
    const snapshotRaw = localStorage.getItem(getSnapshotKey(pendingMode));
    if (snapshotRaw) {
      const data = JSON.parse(snapshotRaw);
      Object.entries(data).forEach(([k, v]) => { localStorage.setItem(k, v as string); });
    }
    changeSubjectMode(pendingMode);
    setShowSwitchDialog(false);
    setPendingMode(null);
    import('sonner').then(({ toast }) => toast.success(`Restored ${pendingMode === 'preloaded' ? 'Preset' : 'Custom'} routine backup.`));
    setLocation('/');
    setTimeout(() => window.location.reload(), 500);
  };
  const executeSwitch = () => {
    if (!pendingMode) return;
    const oldCurriculumName = subjectMode === 'preloaded' ? 'MBBS 5th Year' : 'Custom Routine';
    createSnapshot(`Archived Curriculum (${oldCurriculumName})`);
    saveInternalSnapshot();
    localStorage.setItem('att_curriculum_status', 'Active');
    setCurriculumStatus('Active');
    changeSubjectMode(pendingMode);
    setShowSwitchDialog(false);
    setPendingMode(null);
    setSnapshots(getSnapshots());
    import('sonner').then(({ toast }) => toast.success(`Switched to ${pendingMode === 'preloaded' ? 'Preset' : 'Custom'} routine. Previous records archived in Snapshots.`));
    setLocation('/');
  };
  useEffect(() => {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) { const val = localStorage.getItem(key) || ''; totalBytes += (key.length + val.length) * 2; }
    }
    setStorageSize((totalBytes / 1024).toFixed(2) + ' KB');
  }, [subjects, wards, customSubjects, customWards, subjectMode]);
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

  // ── NEW: Combined modal state ──
  const [backupTransferOpen, setBackupTransferOpen] = useState(false);

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6 pb-6">
        <div>
          <h1 className="text-lg font-extrabold text-foreground leading-tight">Profile, Preferences & Data Management</h1>
        </div>

        {/* 1. Identity Card */}
        <div className="relative flex items-center justify-between bg-card border border-border rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-2xl group cursor-pointer active:scale-95 transition-transform shrink-0" onClick={handleImageClick}>
              <div className="w-full h-full rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden border border-primary/20 relative">
                <AnimatePresence mode="wait">
                  <motion.img key={profileImage || 'default'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} src={profileImage || getDefaultAvatar()} className="w-full h-full object-cover" alt="Profile" />
                </AnimatePresence>
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-card">
                <Camera className="w-3 h-3 text-primary-foreground" />
              </div>
              <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/png, image/jpeg, image/jpg, image/webp, image/*" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Account</p>
              {isEditingName ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }} className="bg-muted px-2.5 py-1 rounded-xl text-sm font-bold text-foreground outline-none border border-primary/50 focus:ring-2 focus:ring-primary/20 w-full max-w-[180px]" autoFocus />
                  <button onClick={handleSaveName} className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0 hover:opacity-90 active:scale-95 transition-all cursor-pointer" title="Save Name">
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-0.5 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                  <p className="font-extrabold text-xl sm:text-2xl text-foreground truncate">{username}</p>
                  <button type="button" className="w-6 h-6 rounded-lg bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0 cursor-pointer" title="Edit Name">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <button onClick={toggleTheme} className="w-10 h-10 rounded-2xl bg-muted/60 hover:bg-muted flex items-center justify-center text-foreground transition-all active:scale-95 shadow-sm border border-border/50 shrink-0 cursor-pointer" title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>
        </div>

        {/* 2. Preference & Statistic */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Preference & Statistic</p>
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-sm overflow-hidden divide-y divide-border/40">
            <button type="button" onClick={() => setActiveSettingModal('preferredPc')} className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><span className="font-bold text-xs">%</span></div>
                <div>
                  <p className="font-semibold text-xs text-foreground">Preferred Percentage</p>
                  <p className="text-[10px] text-muted-foreground">Target attendance threshold ({preferredPercentage}%)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border bg-primary/10 text-primary border-primary/20">{preferredPercentage}%</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
            <button type="button" onClick={() => setActiveSettingModal('curriculum')} className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><GraduationCap className="w-4.5 h-4.5" /></div>
                <div>
                  <h3 className="font-bold text-xs text-foreground">Curriculum Management</h3>
                  <p className="text-[10px] text-muted-foreground">Academic progress, status & routine mode</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border", curriculumStatus === 'Completed' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-primary/10 text-primary border-primary/20")}>{curriculumStatus}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </button>
          </div>
        </div>

        {/* 3. Other Settings */}
        <div className="space-y-2 pt-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Other Setting</p>
          <div className="bg-card/80 backdrop-blur-xl border border-border/70 rounded-2xl shadow-sm overflow-hidden divide-y divide-border/40">
            {/* ── NEW merged card ── */}
            <button
              type="button"
              onClick={() => setBackupTransferOpen(true)}
              className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-semibold text-xs text-foreground">Backup / Transfer</p>
                  <p className="text-[10px] text-muted-foreground">Backup, restore, or transfer your complete app data.</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>

            <div onClick={() => setActiveSettingModal('snapshot')} className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><SnapshotIcon className="w-4 h-4" /></div>
                <div>
                  <p className="font-semibold text-xs text-foreground">Snapshots & Storage</p>
                  <p className="text-[10px] text-muted-foreground">Manage local state backups & cache</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); handleTakeSnapshot(); }} className="px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all active:scale-[0.97] shrink-0 border border-primary/20 cursor-pointer">+ Snapshot</button>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </div>

            <button type="button" onClick={() => setActiveSettingModal('export')} className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></div>
                <div>
                  <p className="font-semibold text-xs text-foreground">Export Attendance Data</p>
                  <p className="text-[10px] text-muted-foreground">Export records in PDF, Excel, or CSV formats</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
            <button type="button" onClick={() => setActiveSettingModal('dataProtection')} className="w-full flex items-center justify-between text-left p-3.5 sm:p-4 hover:bg-muted/30 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8.5 h-8.5 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0"><Database className="w-4 h-4" /></div>
                <div>
                  <p className="font-semibold text-xs text-foreground">Data Protection & Storage</p>
                  <p className="text-[10px] font-bold text-emerald-500">{runtimeStorageInfo.techTitle}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </div>

          {/* ── NEW combined modal ── */}
          <AnimatePresence>
            {backupTransferOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
                onClick={() => setBackupTransferOpen(false)}
              >
                <motion.div
                  initial={{ scale: 0.92, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.92, opacity: 0, y: 10 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="bg-card border border-border rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 text-left relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Backup / Transfer</h3>
                      <p className="text-[10px] text-muted-foreground">Backup, restore, or transfer your complete app data.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBackupTransferOpen(false)}
                      className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {busy && <p className="text-xs font-semibold text-center text-primary bg-primary/10 py-2 rounded-xl">{busy}</p>}

                  {/* ── Backup / Transfer Section ── */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" /> Backup / Transfer
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={handleShareData}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
                      >
                        <Send className="w-4 h-4" /> Send to Another Device
                      </button>
                      <button
                        onClick={() => {
                          setBusy('Backing up…');
                          setTimeout(() => {
                            exportDataAsJSON();
                            setBusy(null);
                            import('sonner').then(({ toast }) => toast.success('Backup downloaded.'));
                          }, 400);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
                      >
                        <Upload className="w-4 h-4" /> Export Backup (.json)
                      </button>
                    </div>
                  </div>

                  {/* ── Restore Section ── */}
                  <div className="border-t border-border/40 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Restore Data
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={() => transferFileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-bold transition-colors border border-border cursor-pointer"
                      >
                        <Download className="w-4 h-4" /> Receive from Another Device
                      </button>
                      <button
                        onClick={() => backupFileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-bold transition-colors border border-border cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" /> Restore from File
                      </button>
                      {/* Hidden file inputs */}
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
                  </div>

                  {transferImportData && (
                    <div className="bg-muted/30 p-3.5 rounded-2xl border border-border/50 text-left space-y-3">
                      <div className="flex items-center gap-2 text-amber-500 mb-1">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-bold">Import Data Confirmation</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">You are about to replace your current local data with the received backup. We recommend creating a Full App Backup before continuing.</p>
                      <div className="bg-background rounded-xl border border-border/60 p-2.5 space-y-1.5 mt-2">
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">App Version</span><span className="font-bold text-foreground">{transferImportData.att_app_version || 'Unknown'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Routine Mode</span><span className="font-bold text-foreground">{transferImportData.att_subject_mode === 'preloaded' ? 'MBBS 5th Year' : 'Custom Routine'}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Snapshots</span><span className="font-bold text-foreground">{transferImportData.attendenz_snapshots_v1 ? JSON.parse(transferImportData.attendenz_snapshots_v1).length : 0}</span></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button onClick={() => setTransferImportData(null)} className="w-full py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                        <button onClick={executeTransferImport} className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold hover:opacity-90 transition-colors shadow-sm cursor-pointer">Replace & Import</button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setBackupTransferOpen(false)}
                      className="px-4 py-2 rounded-xl bg-muted/40 text-foreground font-bold text-xs border border-border hover:bg-muted transition-all cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Existing modals (unchanged) ── */}
          <AnimatePresence>
            {activeSettingModal && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setActiveSettingModal(null)}>
                <motion.div initial={{ scale: 0.92, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 10 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 text-left relative" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <div className="flex items-center gap-3">
                      {activeSettingModal === 'preferredPc' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 font-bold text-sm">%</div>)}
                      {activeSettingModal === 'curriculum' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><GraduationCap className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'transfer' && (<div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/20"><Send className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'snapshot' && (<div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20"><SnapshotIcon className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'backup' && (<div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/20"><Download className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'export' && (<div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20"><FileText className="w-5 h-5" /></div>)}
                      {activeSettingModal === 'dataProtection' && (<div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/20"><Database className="w-5 h-5" /></div>)}
                      <div>
                        <h3 className="font-bold text-base text-foreground">
                          {activeSettingModal === 'preferredPc' && 'Preferred Percentage'}
                          {activeSettingModal === 'curriculum' && 'Curriculum Management'}
                          {activeSettingModal === 'transfer' && 'Transfer App Data'}
                          {activeSettingModal === 'snapshot' && 'Snapshots & Storage'}
                          {activeSettingModal === 'backup' && 'File Backup & Restore'}
                          {activeSettingModal === 'export' && 'Export Attendance Data'}
                          {activeSettingModal === 'dataProtection' && 'Data Protection & Storage'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {activeSettingModal === 'preferredPc' && 'Target attendance threshold percentage'}
                          {activeSettingModal === 'curriculum' && 'Academic progress, status & routine mode'}
                          {activeSettingModal === 'transfer' && 'Securely transfer your complete app data to another device'}
                          {activeSettingModal === 'snapshot' && 'Manage local state backups & cache'}
                          {activeSettingModal === 'backup' && 'Download or restore a .json backup file'}
                          {activeSettingModal === 'export' && 'Export records in PDF, Excel, or CSV formats'}
                          {activeSettingModal === 'dataProtection' && runtimeStorageInfo.techTitle}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setActiveSettingModal(null)} className="w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0" title="Close">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="pt-1">
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
                              <button key={pct} type="button" onClick={() => setPendingPct(pct)} className={cn("py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer", preferredPercentage === pct ? "bg-primary text-primary-foreground border-primary shadow-md scale-[1.03]" : "bg-muted/30 hover:bg-muted/60 text-foreground border-border/60")}>
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="pt-2 flex justify-end">
                          <button type="button" onClick={() => setActiveSettingModal(null)} className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all cursor-pointer">Save & Close</button>
                        </div>
                      </div>
                    )}
                    {activeSettingModal === 'curriculum' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-2 bg-muted/30 p-3.5 rounded-2xl border border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Current Curriculum:</span>
                            <span className="text-xs font-bold text-foreground">{subjectMode === 'preloaded' ? 'MBBS 5th Year Curriculum' : 'Custom Academic Routine'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/30">
                            <span className="text-xs font-medium text-muted-foreground">Current Routine Mode:</span>
                            <span className="text-xs font-bold text-primary">{subjectMode === 'preloaded' ? 'Preset Routine' : 'Custom Routine'}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/30">
                            <span className="text-xs font-medium text-muted-foreground">Curriculum Status:</span>
                            <span className={cn("text-xs font-extrabold", curriculumStatus === 'Completed' ? "text-emerald-500" : "text-primary")}>{curriculumStatus}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <button type="button" onClick={handleToggleCurriculumStatus} className={cn("py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer border", curriculumStatus === 'Completed' ? "bg-muted text-foreground border-border hover:bg-muted/80" : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500/30")}>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{curriculumStatus === 'Completed' ? 'Mark as Active' : 'Mark Curriculum as Completed'}</span>
                          </button>
                          <button type="button" onClick={() => { setActiveSettingModal(null); initiateSwitch(subjectMode === 'preloaded' ? 'custom' : 'preloaded'); }} className="py-3 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer">
                            <ArrowRightLeft className="w-4 h-4" />
                            <span>Change Curriculum</span>
                          </button>
                        </div>
                      </div>
                    )}
                    {activeSettingModal === 'transfer' && (
                      <div className="space-y-3">
                        {!transferImportData ? (
                          <div className="grid grid-cols-1 gap-2.5">
                            <button onClick={handleShareData} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl transition-colors shadow-sm cursor-pointer">
                              <Send className="w-4 h-4" />
                              Send to Another Device
                            </button>
                            <div className="space-y-1.5">
                              <button onClick={() => transferFileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-bold rounded-2xl transition-colors border border-border cursor-pointer">
                                <Download className="w-4 h-4" />
                                Receive from Another Device
                              </button>
                              <p className="text-[11px] text-muted-foreground text-center leading-tight">Select the received backup (.json) file to import.</p>
                            </div>
                            <input type="file" ref={transferFileInputRef} onChange={handleTransferFileSelect} accept=".json" className="hidden" />
                          </div>
                        ) : (
                          <div className="bg-muted/30 p-3.5 rounded-2xl border border-border/50 text-left space-y-3">
                            <div className="flex items-center gap-2 text-amber-500 mb-1">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <p className="text-xs font-bold">Import Data Confirmation</p>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">You are about to replace your current local data with the received backup. We recommend creating a Full App Backup before continuing.</p>
                            <div className="bg-background rounded-xl border border-border/60 p-2.5 space-y-1.5 mt-2">
                              <div className="flex justify-between text-xs"><span className="text-muted-foreground">App Version</span><span className="font-bold text-foreground">{transferImportData.att_app_version || 'Unknown'}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Routine Mode</span><span className="font-bold text-foreground">{transferImportData.att_subject_mode === 'preloaded' ? 'MBBS 5th Year' : 'Custom Routine'}</span></div>
                              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total Snapshots</span><span className="font-bold text-foreground">{transferImportData.attendenz_snapshots_v1 ? JSON.parse(transferImportData.attendenz_snapshots_v1).length : 0}</span></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <button onClick={() => setTransferImportData(null)} className="w-full py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                              <button onClick={executeTransferImport} className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold hover:opacity-90 transition-colors shadow-sm cursor-pointer">Replace & Import</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {activeSettingModal === 'snapshot' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between bg-muted/30 p-2.5 rounded-xl border border-border/50">
                          <span className="text-xs font-medium text-foreground">Create instant state snapshot</span>
                          <button type="button" onClick={handleTakeSnapshot} className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all active:scale-[0.97] cursor-pointer">+ Take Snapshot</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button onClick={() => setShowSnapshotsList(!showSnapshotsList)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-xl transition-all cursor-pointer">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Saved ({snapshots.length})</span>
                          </button>
                          <button onClick={handleClearCache} className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-medium rounded-xl transition-all cursor-pointer">
                            <Eraser className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Clear Cache</span>
                          </button>
                        </div>
                        {showSnapshotsList && (
                          <div className="pt-2 border-t border-border/40 space-y-2 max-h-48 overflow-y-auto">
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
                                    <button onClick={() => setSnapshotToRestore(s)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-2.5 py-1 rounded-lg bg-primary/10 cursor-pointer">
                                      <RefreshCw className="w-3 h-3" />
                                      Restore
                                    </button>
                                    <button onClick={() => setSnapshotToDelete(s)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer" title="Delete snapshot">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        {snapshotMsg && (<p className="text-xs font-semibold text-center text-primary bg-primary/10 py-2 rounded-xl">{snapshotMsg}</p>)}
                      </div>
                    )}
                    {activeSettingModal === 'backup' && (
                      <div className="space-y-3">
                        {busy && <p className="text-xs font-semibold text-center text-primary bg-primary/10 py-2 rounded-xl">{busy}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button onClick={() => { setBusy('Backing up…'); setTimeout(() => { exportDataAsJSON(); setBusy(null); import('sonner').then(({ toast }) => toast.success('Backup downloaded.')); }, 400); }} className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl transition-colors shadow-sm cursor-pointer">
                            <Download className="w-4 h-4" />
                            Export Backup (.json)
                          </button>
                          <button onClick={() => backupFileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-bold rounded-2xl transition-colors border border-border cursor-pointer">
                            <RefreshCw className="w-4 h-4" />
                            Restore from File
                          </button>
                          <input type="file" ref={backupFileInputRef} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              importDataFromJSON(file, (success) => {
                                if (success) {
                                  import("sonner").then(({ toast }) => toast.info('Backup restored successfully! Reloading app...'));
                                  setLocation('/');
                                  window.location.reload();
                                } else {
                                  import("sonner").then(({ toast }) => toast.info('Failed to restore backup. Please ensure the file is valid.'));
                                }
                              });
                            }
                          }} accept=".json" className="hidden" />
                        </div>
                      </div>
                    )}
                    {activeSettingModal === 'export' && (
                      <div className="space-y-3 text-left">
                        {busy && <p className="text-xs font-semibold text-center text-primary bg-primary/10 py-2 rounded-xl">{busy}</p>}
                        <p className="text-xs text-muted-foreground leading-relaxed">Export your attendance records, subject statistics, and ward rotations in clean, printable formats.</p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">Supported Formats</label>
                          <div className="grid grid-cols-3 gap-2">
                            <button type="button" onClick={() => setExportFormat('pdf')} className={cn("py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer", exportFormat === 'pdf' ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/40 border-border text-foreground hover:bg-muted")}>
                              <FileText className="w-3.5 h-3.5" /><span>PDF (.pdf)</span>
                            </button>
                            <button type="button" onClick={() => setExportFormat('excel')} className={cn("py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer", exportFormat === 'excel' ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-muted/40 border-border text-foreground hover:bg-muted")}>
                              <FileSpreadsheet className="w-3.5 h-3.5" /><span>Excel (.xlsx)</span>
                            </button>
                            <button type="button" onClick={() => setExportFormat('csv')} className={cn("py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer", exportFormat === 'csv' ? "bg-sky-600 text-white border-sky-600 shadow-sm" : "bg-muted/40 border-border text-foreground hover:bg-muted")}>
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
                                  {CATEGORIES.flatMap(c => c.subjects).map(s => (<option key={s.name} value={s.name}>{s.name}</option>))}
                                  {INTEGRATED_SUBJECTS.map(s => (<option key={s.name} value={s.name}>{s.name}</option>))}
                                  {userAddedSubjects.filter(s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching').map(s => (<option key={s.id} value={s.name}>{s.name} (SGT)</option>))}
                                  {userAddedSubjects.filter(s => !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')).map(s => (<option key={s.id} value={s.name}>{s.name}</option>))}
                                  {WARD_SUBJECTS.map(w => (<option key={w.name} value={w.name}>{w.name} (Ward)</option>))}
                                </>
                              ) : (
                                <>
                                  {customSubjects.filter(s => s.subjectType === 'allied' && s.parentName === 'Small Group Teaching').map(s => (<option key={s.id} value={s.name}>{s.name} (SGT)</option>))}
                                  {customSubjects.filter(s => !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')).map(s => (<option key={s.id} value={s.name}>{s.name}</option>))}
                                  {customWards.map(w => (<option key={w.id} value={w.name}>{w.name} (Ward)</option>))}
                                </>
                              )}
                            </select>
                          </div>
                        )}
                        {exportScope === 'custom' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-muted-foreground block mb-1">Start Date</label>
                              <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} className="w-full bg-muted/50 border border-border/80 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-foreground" />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-muted-foreground block mb-1">End Date</label>
                              <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} className="w-full bg-muted/50 border border-border/80 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-foreground" />
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
                         <button type="button" onClick={handleExecuteExport} className="w-full py-3 px-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-xs cursor-pointer mt-2">
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
                              }} className="text-[10px] font-bold px-2.5 py-1 bg-primary text-primary-foreground rounded-lg shadow-sm cursor-pointer shrink-0">
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
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* App Info & Update */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl overflow-hidden shrink-0 border border-border/50 shadow-sm bg-muted/20">
                <img src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`} alt="Attendenz Logo" className="w-full h-full object-cover" />
              </div>
              <div className="text-xs space-y-0.5 text-left flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-foreground text-xs truncate">Attendenz Tracker</span>
                  {isUpdateAvailable ? (
                    <span className="text-[10px] font-extrabold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">Update Available</span>
                  ) : (
                    <span className="text-[10px] font-extrabold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">v{installedVersion} • Up to Date</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">Developer: <strong className="text-foreground font-bold">benzavraar</strong></p>
                <p className="text-[10px] text-muted-foreground/80 font-medium">Local Storage: {storageSize}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border/50">
              <button type="button" onClick={() => setWhatsNewOpen(true)} className="flex-1 py-2 px-3 rounded-xl bg-muted/50 hover:bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-border/50 cursor-pointer">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>What's New</span>
              </button>
              {isUpdateAvailable && (
                <button type="button" onClick={() => setShowUpdatePrompt(true)} className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Update App</span>
                </button>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div onClick={() => setShowDeleteDataDialog(true)} className="w-full bg-destructive/10 border border-destructive/30 hover:bg-destructive/20 rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all shadow-sm group">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-destructive/20 text-destructive shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div className="text-left">
                <p className="font-bold text-xs text-destructive">Danger Zone: Delete All App Data</p>
                <p className="text-[10px] text-destructive/80 font-medium">Permanently erase all attendance records & act as brand new app</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-destructive/70 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </motion.div>

      {/* snapshot delete warning */}
      <AnimatePresence>
        {snapshotToDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setSnapshotToDelete(null); }}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/15 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-rose-500" /></div>
                <div>
                  <h3 className="text-base font-bold text-foreground leading-tight">Delete this snapshot?</h3>
                  <p className="text-[11px] text-muted-foreground font-medium">{snapshotToDelete.label} · {snapshotToDelete.timestamp}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">This backup point will be permanently removed. Restoring to it will no longer be possible.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setSnapshotToDelete(null)} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                <button type="button" onClick={handleDeleteSnapshot} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-extrabold hover:opacity-90 transition-all cursor-pointer">Delete Snapshot</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update Dialog */}
      <AnimatePresence>
        {showUpdatePrompt && isUpdateAvailable && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowUpdatePrompt(false); }}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 0, opacity: 1 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20"><Download className="w-5 h-5 text-amber-500" /></div>
                <div className="text-left">
                  <h3 className="text-base font-bold text-foreground leading-tight">Update to <span className="text-emerald-400">v{serverVersion}</span> (Stable)</h3>
                  <p className="text-[11px] text-muted-foreground font-medium">Full App Backup Recommended</p>
                </div>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed text-left">We recommend creating a <strong className="text-foreground">Full App Backup</strong> before updating to ensure all your attendance records and preferences remain 100% safe.</p>
              <div className="flex flex-col gap-2 pt-1">
                <button type="button" onClick={() => handleApplyUpdate(true)} className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:bg-primary/90 transition-all cursor-pointer">
                  <Download className="w-4 h-4" /><span>Backup & Continue</span>
                </button>
                <button type="button" onClick={() => handleApplyUpdate(false)} className="w-full py-3 rounded-2xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Skip Backup</button>
                <button type="button" onClick={() => setShowUpdatePrompt(false)} className="w-full py-2.5 text-muted-foreground text-xs font-medium hover:text-foreground transition-colors cursor-pointer">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Updating… overlay */}
      <AnimatePresence>
        {updatingNow && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-md z-[140] flex items-center justify-center p-4">
           <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-card border border-border rounded-3xl p-8 w-full max-w-xs shadow-2xl flex flex-col items-center gap-4">
           <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-sm font-extrabold text-foreground">Just Updating{'.'.repeat(dots)}</p>
         <p className="text-[10px] text-muted-foreground text-center">Hold on — the new version is being installed. The app reloads at <strong className="text-foreground">Welcome Screen</strong></p>
            </motion.div>
           </motion.div>
          )}
        </AnimatePresence>

      {/* Delete-All dialog */}
      <AnimatePresence>
        {showDeleteDataDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowDeleteDataDialog(false); }}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-destructive/20 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-destructive" /></div>
                <div>
                  <h3 className="text-lg font-bold text-foreground leading-tight">Delete All App Data?</h3>
                  <p className="text-[11px] text-destructive font-semibold">Irreversible Action</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">This permanently erases — no undo:</p>
                <p className="text-[10px] text-amber-500 font-semibold">Export a backup first if you are unsure.</p>
                {[
                  'Every attended / missed / off mark you ever recorded',
                  'All subjects, wards & rotations you added or edited',
                  'All snapshots & backup points saved on this device',
                  'Your profile name, photo, target % and theme',
                  'The setup state — the app reopens at the welcome screen',
                ].map((l, i) => (
                  <p key={i} className="text-[11px] text-foreground bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5">{l}</p>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowDeleteDataDialog(false)} className="flex-1 py-3 rounded-2xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                <button onClick={handleDeleteAllData} className="flex-1 py-3 rounded-2xl bg-destructive text-destructive-foreground text-xs font-extrabold hover:bg-destructive/90 transition-all shadow-md cursor-pointer">Yes, Delete Everything</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Switch Routine Dialog */}
      <AnimatePresence>
        {showSwitchDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowSwitchDialog(false); }}>
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              {switchStep === 'backup_found' ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20"><RefreshCw className="w-5 h-5 text-primary" /></div>
                    <div className="text-left">
                      <h3 className="text-base font-bold text-foreground">Backup Found</h3>
                      <p className="text-[11px] text-muted-foreground font-medium">Saved Routine State</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-xs text-left leading-relaxed">A backup for your <strong className="text-foreground">{pendingMode === 'preloaded' ? 'Preset' : 'Custom'} Routine</strong> was found. Would you like to restore it?</p>
                  <div className="flex flex-col gap-2 pt-1">
                    <button onClick={handleRestoreFromSnapshot} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all cursor-pointer shadow-sm">Restore Backup</button>
                    <button onClick={() => setSwitchStep('warning')} className="w-full py-2.5 rounded-2xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Start Fresh</button>
                    <button onClick={() => setShowSwitchDialog(false)} className="w-full py-2 text-muted-foreground text-xs font-medium hover:text-foreground transition-colors cursor-pointer">Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20"><ArrowRightLeft className="w-5 h-5 text-primary" /></div>
                    <div className="text-left">
                      <h3 className="text-base font-bold text-foreground leading-tight">Switch Routine Mode?</h3>
                      <p className="text-[11px] text-muted-foreground font-medium">Start New Curriculum</p>
                    </div>
                  </div>
                  <div className="bg-muted/30 p-3.5 rounded-2xl border border-border/50 text-left space-y-2">
                    <p className="text-xs text-foreground font-medium leading-relaxed">Changing Routine Mode will start a new curriculum.</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">Your previous attendance records will be <strong className="text-emerald-500 font-bold">archived</strong> and remain available through Backup/Snapshots.</p>
                  </div>
                  <p className="text-xs font-semibold text-foreground text-left">Do you want to continue?</p>
                  <div className="flex flex-col gap-2 pt-1">
                    <button type="button" onClick={executeSwitch} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:bg-primary/90 transition-all cursor-pointer">
                      <CheckCircle2 className="w-4 h-4" /><span>Continue & Switch Curriculum</span>
                    </button>
                    <button type="button" onClick={() => setShowSwitchDialog(false)} className="w-full py-2.5 rounded-2xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round-5 confirm before preferred-% change */}
      <AnimatePresence>
        {pendingPct !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-3">
              <h3 className="text-sm font-bold text-foreground">Apply {pendingPct}% target?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">All subjects & wards will use {pendingPct}% as the attendance threshold.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setPendingPct(null)} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                <button type="button" onClick={() => { setPreferredPercentage(pendingPct); setPendingPct(null); }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer">Apply</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* confirm before mark-complete */}
      <AnimatePresence>
        {confirmMarkComplete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-3">
              <h3 className="text-sm font-bold text-foreground">Mark curriculum as Completed?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">An auto-snapshot of your current records will be saved first, so nothing is lost.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setConfirmMarkComplete(false)} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                <button type="button" onClick={applyMarkComplete} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all cursor-pointer">Mark Completed</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* confirm before snapshot restore */}
      <AnimatePresence>
        {snapshotToRestore && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }} className="bg-card border border-border rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-3">
              <h3 className="text-sm font-bold text-foreground">Restore this snapshot?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{snapshotToRestore.label} · {snapshotToRestore.timestamp}. Current data will be replaced by this backup point.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setSnapshotToRestore(null)} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/40 transition-colors cursor-pointer">Cancel</button>
                <button type="button" onClick={() => { const id = snapshotToRestore.id; setSnapshotToRestore(null); handleRestoreSnapshot(id); }} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all cursor-pointer">Restore</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}