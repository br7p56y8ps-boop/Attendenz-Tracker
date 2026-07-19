import React, { useRef, useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData, SubjectMode } from '@/contexts/CustomDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, LogOut, User, RefreshCw, Info, Copy, Check, Camera } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';
import maleStudentProfile from '@/assets/images/male_student_profile_1784286906428.jpg';
import femaleStudentProfile from '@/assets/images/female_student_profile_1784286920737.jpg';
import neutralStudentProfile from '@/assets/images/neutral_student_profile_1784286934617.jpg';

export default function Account() {
  const { username, logout, profileImage, updateProfileImage } = useAuth();
  const { subjects, wards, preferredPercentage, setPreferredPercentage, clearModeAttendance } = useAttendance();
  const { customSubjects, customWards, subjectMode, changeSubjectMode, clearRoutineData, setWhatsNewOpen, getCurrentPresetWard } = useCustomData();
  const { isLightMode, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [restoreMsg, setRestoreMsg] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [storageSize, setStorageSize] = useState('0.00 KB');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [switchStep, setSwitchStep] = useState<'warning' | 'final' | 'backup_found'>('warning');
  const [pendingMode, setPendingMode] = useState<SubjectMode | null>(null);
  
  // Randomized Subject Rotation State
  const [displayIndices, setDisplayIndices] = useState([0, 1, 2, 3]);

  // ── Mode Switch Logic ────────────────────────────────────────────────────
  const getSnapshotKey = (mode: SubjectMode) => `att_snapshot_${mode}`;

  const initiateSwitch = (newMode: SubjectMode) => {
    setPendingMode(newMode);
    
    // Check if an internal backup exists for the destination mode
    const snapshot = localStorage.getItem(getSnapshotKey(newMode));
    if (snapshot) {
      setSwitchStep('backup_found');
    } else {
      setSwitchStep('warning');
    }
    setShowSwitchDialog(true);
  };

  const handleBackupAndContinue = () => {
    // Create internal snapshot for current mode before leaving
    saveInternalSnapshot();
    handleBackup(); // Also trigger manual export
    setSwitchStep('final');
  };

  const saveInternalSnapshot = () => {
    const data: Record<string, any> = {};
    const keysToSave = [
      'attendance_tracker_subjects',
      'attendance_tracker_ward',
      'attendance_tracker_home_selections',
      'att_preset_timetable',
      'att_preset_ward_schedule',
      'att_preset_subject_totals',
      'att_custom_subjects',
      'att_custom_wards'
    ];
    keysToSave.forEach(k => {
      const val = localStorage.getItem(k);
      if (val) data[k] = val;
    });
    localStorage.setItem(getSnapshotKey(subjectMode), JSON.stringify(data));
  };

  const handleRestoreFromSnapshot = () => {
    if (!pendingMode) return;
    const snapshotRaw = localStorage.getItem(getSnapshotKey(pendingMode));
    if (snapshotRaw) {
      const data = JSON.parse(snapshotRaw);
      Object.entries(data).forEach(([k, v]) => {
        localStorage.setItem(k, v as string);
      });
    }
    
    // Switch mode
    changeSubjectMode(pendingMode);
    setShowSwitchDialog(false);
    setPendingMode(null);
    import('sonner').then(({ toast }) => toast.success(`Restored ${pendingMode === 'preloaded' ? 'Preset' : 'Custom'} routine backup.`));
    setTimeout(() => window.location.reload(), 500);
  };

  const executeSwitch = () => {
    if (!pendingMode) return;
    
    // Clear data for mode we are LEAVING
    clearModeAttendance(subjectMode);
    clearRoutineData(subjectMode);

    // Change to NEW mode
    changeSubjectMode(pendingMode);

    // UI Cleanup
    setShowSwitchDialog(false);
    setPendingMode(null);
    import('sonner').then(({ toast }) => toast.success(`Switched to fresh ${pendingMode === 'preloaded' ? 'Preset' : 'Custom'} routine.`));
  };

  // ── Analytics Data Collection ───────────────────────────────────────────
  const allAvailableSubjects = React.useMemo(() => {
    const list: { name: string; pct: number }[] = [];
    
    const getPct = (name: string, isWard: boolean = false) => {
      const key = isWard ? `ward-${name}` : name;
      const d = (isWard ? wards[key] : subjects[key]) || { attended: 0, missed: 0 };
      const total = d.attended + d.missed;
      return total === 0 ? 100 : (d.attended / total) * 100;
    };

    if (subjectMode === 'preloaded') {
      CATEGORIES.forEach(c => {
        c.subjects.forEach(s => {
          list.push({ name: s.name, pct: getPct(s.name) });
        });
      });
      INTEGRATED_SUBJECTS.forEach(s => {
        list.push({ name: s.name, pct: getPct(s.name) });
      });
      WARD_SUBJECTS.forEach(w => {
        list.push({ name: w.name, pct: getPct(w.name, true) });
      });
    } else {
      customSubjects.forEach(s => {
        list.push({ name: s.name, pct: getPct(s.name) });
      });
      customWards.forEach(w => {
        list.push({ name: w.name, pct: getPct(w.name, true) });
      });
    }
    return list;
  }, [subjects, wards, customSubjects, customWards, subjectMode]);

  // Rotation timers for 4 independent rows
  useEffect(() => {
    if (allAvailableSubjects.length === 0) return;

    const timers = [0, 1, 2, 3].map(rowIdx => {
      const interval = 6000 + Math.random() * 1000; // 6-7s
      return setInterval(() => {
        setDisplayIndices(prev => {
          const next = [...prev];
          // Simple rotation: next subject in list, skipping those already visible
          let nextVal = (next[rowIdx] + 1) % allAvailableSubjects.length;
          // Basic duplicate prevention for 4 rows
          while (next.includes(nextVal) && allAvailableSubjects.length > 4) {
            nextVal = (nextVal + 1) % allAvailableSubjects.length;
          }
          next[rowIdx] = nextVal;
          return next;
        });
      }, interval);
    });

    return () => timers.forEach(t => clearInterval(t));
  }, [allAvailableSubjects.length]);

  // Dynamic localStorage space used estimation
  useEffect(() => {
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const val = localStorage.getItem(key) || '';
        totalBytes += (key.length + val.length) * 2; // UTF-16 characters are 2 bytes
      }
    }
    setStorageSize((totalBytes / 1024).toFixed(2) + ' KB');
  }, [subjects, wards, customSubjects, customWards, subjectMode]);

  // ── Profile Image Logic ──────────────────────────────────────────────────
  const detectGender = (name: string): 'male' | 'female' | 'neutral' => {
    if (!name || name.length < 2) return 'neutral';
    const n = name.toLowerCase().trim();
    // Common female endings and names in medical context (South Asian/Global)
    const femaleEndings = ['a', 'i', 'ee', 'ia', 'shree', 'mita', 'rina', 'lina', 'nita', 'jali', 'shikha', 'preeti', 'priya', 'sneha', 'swati'];
    const femaleNames = ['mary', 'jane', 'sarah', 'fatima', 'aisha', 'zainab', 'ananya', 'ishani', 'diya', 'sana', 'nora', 'luna'];
    
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

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (limit to ~1MB for base64 safety)
      if (file.size > 1024 * 1024) {
        alert('Image too large. Please select an image under 1MB.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        updateProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // ── Backup ───────────────────────────────────────────────────────────────
  const handleBackup = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const val = localStorage.getItem(key);
      try { data[key] = JSON.parse(val!); } catch { data[key] = val; }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendenz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    setRestoreSuccess(true);
    setRestoreMsg('✓ Backup exported successfully! Keep this JSON file safe.');
    setTimeout(() => setRestoreMsg(''), 4000);
  };

  // ── Restore ──────────────────────────────────────────────────────────────
  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data: Record<string, unknown> = JSON.parse(ev.target?.result as string);
        Object.entries(data).forEach(([k, v]) => {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
        setRestoreSuccess(true);
        setRestoreMsg('✓ Restore successful! The page will refresh in 2 seconds to apply changes.');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch {
        setRestoreSuccess(false);
        setRestoreMsg('✗ Invalid backup file format. Please check the JSON.');
        setTimeout(() => setRestoreMsg(''), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Copy App Info ────────────────────────────────────────────────────────
  const handleCopyInfo = () => {
    const infoText = `Developer Name: benzavraar\nRelease Version: 3.5.1\nSource Code URL: GitHub (Attendenz Tracker)\nOffline Storage: ${storageSize}`;
    navigator.clipboard.writeText(infoText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-8">
        
        {/* Profile Card */}
        <div className="flex items-center gap-4 bg-card border border-border rounded-3xl p-5 shadow-sm">
          <div 
            className="relative w-16 h-16 rounded-2xl group cursor-pointer active:scale-95 transition-transform"
            onClick={handleImageClick}
          >
            <div className="w-full h-full rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden border border-primary/20 relative">
              <AnimatePresence mode="wait">
                <motion.img 
                  key={profileImage || 'default'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  src={profileImage || getDefaultAvatar()} 
                  className="w-full h-full object-cover" 
                  alt="Profile" 
                />
              </AnimatePresence>
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            {/* Edit Badge */}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-card">
              <Camera className="w-3 h-3 text-primary-foreground" />
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageChange} 
              className="hidden" 
              accept="image/*"
            />
          </div>
          <div className="min-w-0 flex-1 pr-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Account</p>
            <p className="font-bold text-2xl text-foreground mt-0.5 truncate">{username}</p>
          </div>
          <div className="ml-auto flex shrink-0 flex-col items-end gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Light Mode</span>
            <Switch checked={isLightMode} onCheckedChange={toggleTheme} aria-label="Toggle light mode" />
          </div>
        </div>

        {/* Clinical Analytics Card */}
        {(() => {
          const analytics = displayIndices.map(idx => 
            allAvailableSubjects[idx % allAvailableSubjects.length] || { name: 'Subject', pct: 100 }
          );
          
          const overallPct = allAvailableSubjects.length > 0 
            ? allAvailableSubjects.reduce((sum, item) => sum + item.pct, 0) / allAvailableSubjects.length 
            : 100;
          
          return (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Vital Analytics</p>
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Global Compliance</p>
                    <p className={cn("text-2xl font-black", 
                      overallPct >= 80 ? "text-emerald-500" : 
                      overallPct >= 75 ? "text-amber-500" : "text-red-500"
                    )}>
                      {overallPct.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Monitor Status</p>
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[10px] font-bold text-foreground">LIVE</p>
                    </div>
                  </div>
                </div>

                {/* 4-Channel ECG Monitor */}
                <div className="space-y-4">
                  {analytics.map((item, idx) => {
                    const color = item.pct >= 80 ? "#10b981" : item.pct >= 75 ? "#f59e0b" : "#ef4444";
                    const textColor = item.pct >= 80 ? "text-emerald-500" : item.pct >= 75 ? "text-amber-500" : "text-red-500";
                    
                    return (
                      <div key={`${idx}-${item.name}`} className="space-y-1.5">
                        <div className="flex justify-between items-end px-0.5 overflow-hidden h-3.5">
                          <AnimatePresence mode="wait">
                            <motion.span 
                              key={item.name}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground truncate max-w-[80%]"
                            >
                              {item.name}
                            </motion.span>
                          </AnimatePresence>
                          <AnimatePresence mode="wait">
                            <motion.span 
                              key={`${item.name}-pct`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className={cn("text-[10px] font-black tabular-nums", textColor)}
                            >
                              {item.pct.toFixed(0)}%
                            </motion.span>
                          </AnimatePresence>
                        </div>
                        <div className="h-10 w-full bg-muted/20 rounded-lg overflow-hidden relative border border-border/40">
                          {/* Rolling Grid Background */}
                          <div className="absolute inset-0 opacity-10 pointer-events-none">
                            <svg width="100%" height="100%">
                              <defs>
                                <pattern id={`grid-${idx}`} width="20" height="20" patternUnits="userSpaceOnUse">
                                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5"/>
                                </pattern>
                              </defs>
                              <rect width="100%" height="100%" fill={`url(#grid-${idx})`} />
                            </svg>
                          </div>

                          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                            <defs>
                              <linearGradient id={`grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="transparent" />
                                <stop offset="10%" stopColor="white" />
                                <stop offset="90%" stopColor="white" />
                                <stop offset="100%" stopColor="transparent" />
                              </linearGradient>
                            </defs>
                            
                            {/* Mask to clip the rolling wave to the percentage */}
                            <mask id={`mask-${idx}`}>
                              <rect x="0" y="0" width={item.pct} height="40" fill="white" />
                            </mask>
                            
                            {/* ECG Wave Baseline */}
                            <line x1="0" y1="20" x2="100" y2="20" className="stroke-muted/30 stroke-[0.5]" />
                            
                            {/* Animated Rolling ECG Wave (Infinite Loop - HomeCard Style) */}
                            <motion.path
                              d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 30 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 60 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 90 20 L 100 20"
                              fill="none"
                              stroke={color}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              mask={`url(#mask-${idx})`}
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
                            />
                            
                            {/* Glow effect path */}
                            <motion.path
                              d="M 0 20 L 10 20 L 12 14 L 15 26 L 18 4 L 21 36 L 24 20 L 30 20 L 40 20 L 42 14 L 45 26 L 48 4 L 51 36 L 54 20 L 60 20 L 70 20 L 72 14 L 75 26 L 78 4 L 81 36 L 84 20 L 90 20 L 100 20"
                              fill="none"
                              stroke={color}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              mask={`url(#mask-${idx})`}
                              className="opacity-20 blur-[1px]"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
                            />

                            {/* Percentage Marker Line */}
                            <line 
                              x1={item.pct} 
                              y1="5" 
                              x2={item.pct} 
                              y2="35" 
                              stroke={color} 
                              strokeWidth="1" 
                              strokeDasharray="2 2"
                              className="opacity-50"
                            />
                            
                            {/* Subtle pulse at the end of the wave */}
                            <motion.circle
                              cx={item.pct}
                              cy="20"
                              r="1.5"
                              fill={color}
                              animate={{ scale: [1, 2, 1], opacity: [0.5, 1, 0.5] }}
                              transition={{ duration: 1, repeat: Infinity }}
                            />
                          </svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* X-Axis Percentage Labels */}
                <div className="flex justify-between px-0.5 pt-1">
                  {[0, 25, 50, 75, 100].map(val => (
                    <span key={val} className="text-[8px] font-bold text-muted-foreground/50">{val}%</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Preferred Percentage Setting */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Settings</p>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <span className="font-semibold text-base text-foreground">Preferred Percentage</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="100"
                value={preferredPercentage}
                onChange={(e) => setPreferredPercentage(parseInt(e.target.value) || 0)}
                className="w-16 bg-muted rounded-xl px-2 py-1 text-center font-bold text-primary"
              />
              <span className="font-bold text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        {/* ── PRIMARY / ACTION GROUP ── */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Actions & Preferences</p>
          
          {/* Quick Routine Switch */}
          <div className="w-full bg-card border border-border rounded-2xl px-4 py-4 flex items-center justify-between hover:bg-muted/10 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-base text-foreground">Routine Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Currently: <span className="font-bold text-primary">{subjectMode === 'preloaded' ? 'Preset Routine' : 'Custom Routine'}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => initiateSwitch(subjectMode === 'preloaded' ? 'custom' : 'preloaded')}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.97] transition-all"
            >
              Switch to {subjectMode === 'preloaded' ? 'Custom' : 'Preset'}
            </button>
          </div>

          {/* Backup Action Row */}
          <div
            onClick={handleBackup}
            className="w-full bg-card border border-border rounded-2xl px-4 py-4 flex items-center gap-4 text-left hover:bg-muted/40 active:scale-[0.98] cursor-pointer transition-all"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-base text-foreground">Backup Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">Export all schedules & attendance as a JSON file</p>
            </div>
          </div>

          {/* Restore Action Row */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-card border border-border rounded-2xl px-4 py-4 flex items-center gap-4 text-left hover:bg-muted/40 active:scale-[0.98] cursor-pointer transition-all"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 text-primary shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-base text-foreground">Restore Backup</p>
              <p className="text-xs text-muted-foreground mt-0.5">Import and restore data from a saved JSON file</p>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestore} />

          {/* What's New Trigger */}
          <div
            onClick={() => setWhatsNewOpen(true)}
            className="w-full bg-card border border-border rounded-2xl px-4 py-4 flex items-center gap-4 text-left hover:bg-muted/40 active:scale-[0.98] cursor-pointer transition-all"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 shrink-0 overflow-hidden border border-primary/20">
              <img src="/Logo.jpeg" className="w-full h-full object-cover" alt="" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-base text-foreground">What's New</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click to view the v3.5.1 feature updates</p>
            </div>
          </div>

          {/* Backup/Restore success notifications */}
          <AnimatePresence>
            {restoreMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={cn(
                  'text-xs font-semibold px-4 py-2.5 rounded-xl border mt-2',
                  restoreSuccess ? 'bg-success/15 border-success/30 text-success' : 'bg-destructive/15 border-destructive/30 text-destructive'
                )}
              >
                {restoreMsg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* App Info Card */}
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">App Info</p>
            <button
              onClick={handleCopyInfo}
              className="flex items-center gap-1.5 text-xs text-primary font-bold hover:underline"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Details</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-border/50">
              <img src="/Logo.jpeg" alt="Attendenz Logo" className="w-full h-full object-cover" />
            </div>
            <div className="text-sm space-y-1">
              <p className="font-bold text-foreground">Version: 3.5.1</p>
              <p className="text-xs text-muted-foreground font-medium">Offline Storage: {storageSize}</p>
              <p className="text-xs text-muted-foreground font-medium">Developer: benzavraar</p>
            </div>
          </div>
        </div>

        {/* ── VISUAL SEPARATION / HORIZONTAL LINE ── */}
        <hr className="border-t border-border/80 my-4" />

        {/* ── DESTRUCTIVE / SYSTEM GROUP ── */}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-destructive px-1">System & Reset</p>

          {/* Logout */}
          <div
            className="w-full bg-card border border-border rounded-2xl px-4 py-4 flex flex-col gap-2 text-left opacity-60 cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-muted text-foreground shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-base text-foreground">Logout</p>
                <p className="text-xs text-muted-foreground">Sign out from your offline session</p>
              </div>
            </div>
            <p className="text-[10px] text-destructive font-medium pl-14">
              Logout is unavailable until cloud migration is implemented.
            </p>
          </div>
        </div>

      </motion.div>

      {/* Logout dialog */}
      <AnimatePresence>
        {showLogoutDialog && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowLogoutDialog(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Log out?</h3>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                You'll be taken to the login screen. All your data remains safely stored on this device.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutDialog(false)}
                  className="flex-1 py-3 rounded-2xl border border-border text-foreground text-sm font-semibold hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={logout}
                  className="flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-bold hover:opacity-80 transition-all"
                >
                  Log out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Routine Switch Dialog */}
      <AnimatePresence>
        {showSwitchDialog && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowSwitchDialog(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              {switchStep === 'backup_found' ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <RefreshCw className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">Backup Found</h3>
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">
                    A backup for your <span className="font-bold text-foreground">{pendingMode === 'preloaded' ? 'Preset' : 'Custom'} Routine</span> was found. Would you like to restore it?
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleRestoreFromSnapshot}
                      className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all"
                    >
                      Restore Backup
                    </button>
                    <button
                      onClick={() => setSwitchStep('warning')}
                      className="w-full py-3 rounded-2xl border border-border text-foreground text-sm font-semibold hover:bg-muted/40 transition-colors"
                    >
                      Start Fresh
                    </button>
                    <button
                      onClick={() => setShowSwitchDialog(false)}
                      className="w-full py-3 rounded-2xl text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : switchStep === 'warning' ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                      <RefreshCw className="w-5 h-5 text-amber-500" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">Switch Routine Mode?</h3>
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">
                    Switching routine modes will permanently remove your current routine data from the app.
                  </p>
                  <p className="text-muted-foreground text-sm mb-6">
                    If you may want to return to this routine later, please create a Backup first. Your backup file will <span className="font-bold text-foreground underline decoration-primary">NOT</span> be deleted and can be restored anytime.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleBackupAndContinue}
                      className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Backup Now
                    </button>
                    <button
                      onClick={() => setSwitchStep('final')}
                      className="w-full py-3 rounded-2xl border border-border text-foreground text-sm font-semibold hover:bg-muted/40 transition-colors"
                    >
                      Continue Anyway
                    </button>
                    <button
                      onClick={() => setShowSwitchDialog(false)}
                      className="w-full py-3 rounded-2xl text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-destructive/10 flex items-center justify-center">
                      <LogOut className="w-5 h-5 text-destructive" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">Final Confirmation</h3>
                  </div>
                  <div className="space-y-4 mb-6">
                    <p className="text-muted-foreground text-sm">
                      You are about to switch from <span className="font-bold text-foreground">{subjectMode === 'preloaded' ? 'Preset' : 'Custom'} Routine</span> → <span className="font-bold text-primary">{pendingMode === 'preloaded' ? 'Preset' : 'Custom'} Routine</span>.
                    </p>
                    <p className="text-destructive/90 text-sm font-medium bg-destructive/5 p-3 rounded-xl border border-destructive/10">
                      This will permanently erase ALL current attendance data, timetable, subjects, ward postings, statistics, and related records for the current routine stored inside the app.
                    </p>
                    <p className="text-muted-foreground text-xs italic">
                      Your backup file will remain safe and can be restored later. This action cannot be undone.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowSwitchDialog(false)}
                      className="flex-1 py-3 rounded-2xl border border-border text-foreground text-sm font-semibold hover:bg-muted/40 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeSwitch}
                      className="flex-1 py-3 rounded-2xl bg-destructive text-destructive-foreground text-sm font-bold hover:opacity-90 transition-all"
                    >
                      Switch Routine
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </Layout>
  );
}
