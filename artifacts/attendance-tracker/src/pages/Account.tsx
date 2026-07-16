import React, { useRef, useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, LogOut, User, RefreshCw, Info, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';

export default function Account() {
  const { username, logout } = useAuth();
  const { subjects, wards, preferredPercentage, setPreferredPercentage } = useAttendance();
  const { customSubjects, customWards, subjectMode, changeSubjectMode, setWhatsNewOpen, getCurrentPresetWard } = useCustomData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [restoreMsg, setRestoreMsg] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [storageSize, setStorageSize] = useState('0.00 KB');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

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
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Account</p>
            <p className="font-bold text-2xl text-foreground mt-0.5">{username}</p>
          </div>
        </div>

        {/* Clinical Analytics Card */}
        {(() => {
          const getAnalyticsData = () => {
            const data: { label: string; pct: number }[] = [];
            
            // 1. Single Subject (Major subjects: Medicine, Surgery, OBG, or custom single subjects)
            const majorNames = ['Medicine', 'Surgery', 'Obstetrics & Gynaecology'];
            let sAtt = 0, sMiss = 0;
            CATEGORIES.forEach(c => {
              c.subjects.forEach(s => {
                if (majorNames.includes(s.name)) {
                  const d = subjects[s.name];
                  if (d) { sAtt += d.attended; sMiss += d.missed; }
                }
              });
            });
            customSubjects.forEach(s => {
              if (s.subjectType === 'single') {
                const d = subjects[s.name];
                if (d) { sAtt += d.attended; sMiss += d.missed; }
              }
            });
            const sPct = (sAtt + sMiss) === 0 ? 100 : (sAtt / (sAtt + sMiss)) * 100;
            data.push({ label: 'Single Subject', pct: sPct });

            // 2. Allied Subject (All other subjects in categories or custom allied subjects)
            let aAtt = 0, aMiss = 0;
            CATEGORIES.forEach(c => {
              c.subjects.forEach(s => {
                if (!majorNames.includes(s.name)) {
                  const d = subjects[s.name];
                  if (d) { aAtt += d.attended; aMiss += d.missed; }
                }
              });
            });
            customSubjects.forEach(s => {
              if (s.subjectType === 'allied') {
                const d = subjects[s.name];
                if (d) { aAtt += d.attended; aMiss += d.missed; }
              }
            });
            const aPct = (aAtt + aMiss) === 0 ? 100 : (aAtt / (aAtt + aMiss)) * 100;
            data.push({ label: 'Allied Subject', pct: aPct });

            // 3. Current Ward Posting
            const currentWard = getCurrentPresetWard()?.ward;
            let wPct = 100;
            if (currentWard && currentWard !== 'Holiday') {
              const d = wards[`ward-${currentWard}`];
              if (d && (d.attended + d.missed) > 0) wPct = (d.attended / (d.attended + d.missed)) * 100;
            }
            data.push({ label: 'Current Ward Posting', pct: wPct });

            // 4. Integrated Teaching
            let iAtt = 0, iMiss = 0;
            INTEGRATED_SUBJECTS.forEach(s => {
              const d = subjects[s.name];
              if (d) { iAtt += d.attended; iMiss += d.missed; }
            });
            const iPct = (iAtt + iMiss) === 0 ? 100 : (iAtt / (iAtt + iMiss)) * 100;
            data.push({ label: 'Integrated Teaching', pct: iPct });

            return data;
          };

          const analytics = getAnalyticsData();
          const overallPct = analytics.reduce((sum, item) => sum + item.pct, 0) / analytics.length;
          
          return (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Vital Analytics</p>
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Global Compliance</p>
                    <p className={cn("text-3xl font-black", 
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
                <div className="space-y-5">
                  {analytics.map((item, idx) => {
                    const color = item.pct >= 80 ? "#10b981" : item.pct >= 75 ? "#f59e0b" : "#ef4444";
                    const textColor = item.pct >= 80 ? "text-emerald-500" : item.pct >= 75 ? "text-amber-500" : "text-red-500";
                    
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between items-end px-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">{item.label}</span>
                          <span className={cn("text-xs font-black tabular-nums", textColor)}>{item.pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-12 w-full bg-muted/20 rounded-lg overflow-hidden relative border border-border/40">
                          {/* Rolling Grid Background */}
                          <div className="absolute inset-0 opacity-10 pointer-events-none">
                            <svg width="100%" height="100%">
                              <defs>
                                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5"/>
                                </pattern>
                              </defs>
                              <rect width="100%" height="100%" fill="url(#grid)" />
                            </svg>
                          </div>

                          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 40">
                            {/* Mask to clip the rolling wave to the percentage */}
                            <mask id={`mask-${idx}`}>
                              <rect x="0" y="0" width={item.pct} height="40" fill="white" />
                            </mask>
                            
                            {/* ECG Wave Baseline */}
                            <line x1="0" y1="20" x2="100" y2="20" className="stroke-muted/30 stroke-[0.5]" />
                            
                            {/* Animated Rolling ECG Wave */}
                            <motion.path
                              d="M 0 20 L 5 20 L 7 14 L 10 26 L 13 4 L 16 36 L 19 20 L 25 20 L 30 20 L 32 14 L 35 26 L 38 4 L 41 36 L 44 20 L 50 20 L 55 20 L 57 14 L 60 26 L 63 4 L 66 36 L 69 20 L 75 20 L 80 20 L 82 14 L 85 26 L 88 4 L 91 36 L 94 20 L 100 20"
                              fill="none"
                              stroke={color}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              mask={`url(#mask-${idx})`}
                              animate={{ x: [0, -25] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
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
              onClick={() => changeSubjectMode(subjectMode === 'preloaded' ? 'custom' : 'preloaded')}
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
              <img src="/attendenz_icon.jpg" className="w-full h-full object-cover" alt="" />
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
              <img src="/attendenz_icon.jpg" alt="Attendenz Logo" className="w-full h-full object-cover" />
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

    </Layout>
  );
}
