import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomData, SubjectMode } from '@/contexts/CustomDataContext';
import { BookOpen, Pencil, ShieldCheck, ArrowRight, RefreshCw, Upload, Sparkles, AlertTriangle, Camera } from 'lucide-react';
import { importDataFromJSON, getSnapshots } from '../utils/snapshotUtils';
import maleStudentProfile from '@/assets/images/male_student_profile_1784286906428.jpg';
import femaleStudentProfile from '@/assets/images/female_student_profile_1784286920737.jpg';
import neutralStudentProfile from '@/assets/images/neutral_student_profile_1784286934617.jpg';

export default function SetupScreen() {
  const { username, updateUsername, profileImage, updateProfileImage } = useAuth();
  const { completeSetup, setWhatsNewOpen } = useCustomData();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [detectedMode, setDetectedMode] = useState<SubjectMode>('preloaded');
  const [showDataDetectedView, setShowDataDetectedView] = useState<boolean>(false);
  const [chosenRoutineMode, setChosenRoutineMode] = useState<SubjectMode>('preloaded');
  const [localIdentityName, setLocalIdentityName] = useState('');
  const [showConfirmStartFresh, setShowConfirmStartFresh] = useState<boolean>(false);

  useEffect(() => {
    try {
      const savedSubjects = localStorage.getItem('attendance_tracker_subjects');
      const savedCustomSub = localStorage.getItem('att_custom_subjects');
      const savedHistory = localStorage.getItem('att_history');
      const savedMode = localStorage.getItem('att_subject_mode') as SubjectMode | null;
      const snapshots = getSnapshots();
      const hasData = Boolean(
        (savedSubjects && savedSubjects !== '{}') ||
        (savedCustomSub && savedCustomSub !== '[]') ||
        (savedHistory && savedHistory !== '{}') ||
        snapshots.length > 0
      );
      if (hasData) {
        setShowDataDetectedView(true);
        if (savedMode) setDetectedMode(savedMode);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  /* ── Profile photo (identical logic to Account tab) ── */
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
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 400;
          let width = img.width;
          let height = img.height;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            updateProfileImage(canvas.toDataURL('image/jpeg', 0.85));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  /* ── Finish → always land on Home ── */
  const finishSetup = (mode: SubjectMode) => {
    if (localIdentityName.trim()) updateUsername(localIdentityName.trim());
    localStorage.removeItem('att_just_updated');
    completeSetup(mode);
    setLocation('/');
    setWhatsNewOpen(true);
  };

  const handleRestorePreviousData = () => finishSetup(detectedMode);

  const handleRestoreBackupFile = (file: File) => {
    importDataFromJSON(file, (success: boolean) => {
      if (success) {
        const updatedMode = (localStorage.getItem('att_subject_mode') as SubjectMode) || 'preloaded';
        finishSetup(updatedMode);
      } else {
        import("sonner").then(({ toast }) => toast.info('Failed to restore backup file. Please ensure it is a valid Attendenz JSON backup.'));
      }
    });
  };

  const handleConfirmStartFresh = () => {
    setShowDataDetectedView(false);
    setShowConfirmStartFresh(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col px-4 relative overflow-hidden">
      {/* ── Vertically-centered stack ── */}
      <div className="flex-1 flex items-center justify-center py-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          {showDataDetectedView ? (
            /* VIEW A: PREVIOUS DATA DETECTED (unchanged) */
            <div className="space-y-4">
              <div className="bg-card border border-primary/20 rounded-3xl p-5 shadow-lg space-y-3 text-left relative overflow-hidden">
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>Previous Data Detected</span>
                </div>
                <div className="bg-muted/40 p-3 rounded-2xl border border-border/60 space-y-1">
                  <p className="text-[10px] uppercase font-extrabold text-muted-foreground">Detected Routine Mode</p>
                  <p className="text-sm font-black text-foreground capitalize flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {detectedMode === 'preloaded' ? 'MBBS 5th Year Curriculum (Preset)' : 'Custom Routine Mode'}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  We found your existing attendance records and subject configurations saved safely on this device.
                </p>
                <div className="space-y-2.5 pt-2">
                  <button type="button" onClick={handleRestorePreviousData} className="w-full py-3.5 px-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs cursor-pointer">
                    <RefreshCw className="w-4 h-4" />
                    <span>Restore Previous Data (Recommended)</span>
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-3 px-4 bg-card hover:bg-muted/50 border border-border text-foreground font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Restore Backup File (.json)</span>
                  </button>
                  <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRestoreBackupFile(f); }} accept=".json" className="hidden" />
                  <button type="button" onClick={() => setShowConfirmStartFresh(true)} className="w-full py-2.5 text-muted-foreground hover:text-foreground text-[11px] font-medium text-center transition-colors cursor-pointer">
                    Start Fresh with Clean Slate
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW B: ONE-SCREEN ADMISSION FORM */
            <div className="space-y-6">
              {/* Header row: icon LEFT · welcome+description RIGHT */}
              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-border shadow-lg shrink-0">
                  <img src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`} alt="Attendenz Logo" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 text-left">
                  <h1 className="text-xl font-black text-foreground tracking-tight leading-tight">Welcome to Attendenz</h1>
                  <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed">
                    Offline-first tracker for medical lectures & clinical ward rotations.
                  </p>
                </div>
              </div>

              {/* Setup Display Name & Photo */}
              <div className="space-y-2 pt-4">
                <h2 className="text-sm font-extrabold text-foreground leading-tight text-left">Setup Display Name & Photo</h2>
                <div className="bg-card border border-border rounded-3xl p-3.5 shadow-md flex items-center gap-3 text-left">
                  <div className="relative w-14 h-14 rounded-2xl cursor-pointer active:scale-95 transition-transform shrink-0" onClick={() => photoInputRef.current?.click()}>
                    <img src={profileImage || getDefaultAvatar()} className="w-full h-full object-cover rounded-2xl border border-border/60" alt="Profile" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-card">
                      <Camera className="w-2.5 h-2.5 text-primary-foreground" />
                    </div>
                    <input type="file" ref={photoInputRef} onChange={handlePhotoChange} accept="image/*" className="hidden" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Your Identity / Display Name</label>
                    <input
                      type="text"
                      value={localIdentityName}
                      onChange={(e) => setLocalIdentityName(e.target.value)}
                      placeholder="Medical Student"
                      className="w-full bg-muted/60 rounded-xl px-3 py-2.5 text-xs font-bold text-foreground outline-none border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50 placeholder:font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Select Routine Mode */}
              <div className="space-y-2.5">
                <h2 className="text-sm font-extrabold text-foreground leading-tight text-left">Select Routine Mode</h2>
                <button
                  type="button"
                  onClick={() => setChosenRoutineMode('preloaded')}
                  className={`w-full bg-card border rounded-3xl p-4 text-left transition-all active:scale-[0.98] group shadow-sm cursor-pointer ${chosenRoutineMode === 'preloaded' ? 'border-primary/60 ring-2 ring-primary/25 bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-foreground text-sm">Use Preloaded MBBS Subjects</p>
                      <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed">
                        A pre-admitted chart for the BMDC new-curriculum <span className="whitespace-nowrap">5th year:</span> subjects, weekly timetable & ward rotations already written up. If your college's routine differs <span className="whitespace-nowrap">(it's medicine —</span> <span className="whitespace-nowrap">it usually does),</span> adjustments are always allowed from the <span className="whitespace-nowrap">Manage tab,</span> or a full mode change later from the <span className="whitespace-nowrap">Settings tab.</span> <span className="whitespace-nowrap">No referral needed.</span>
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setChosenRoutineMode('custom')}
                  className={`w-full bg-card border rounded-3xl p-4 text-left transition-all active:scale-[0.98] group shadow-sm cursor-pointer ${chosenRoutineMode === 'custom' ? 'border-emerald-500/60 ring-2 ring-emerald-500/25 bg-emerald-500/5' : 'border-border hover:bg-muted/40'}`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                      <Pencil className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-foreground text-sm">Create My Own Subjects</p>
                      <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed">
                        Start from <span className="whitespace-nowrap">zero vitals</span> and build the routine yourself — subjects, departments & rotations. <span className="whitespace-nowrap">No pre-filled opinions;</span> <span className="whitespace-nowrap">full clinical freedom.</span>
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Done button */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => finishSetup(chosenRoutineMode)}
                  className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-2xl shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <span>Done</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Bottom privacy (bottom-center) ── */}
      <div className="pb-6 pt-2 text-center shrink-0">
        <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>100% Local Device Privacy</span>
        </p>
      </div>

      {/* Confirm Start Fresh Dialog */}
      <AnimatePresence>
        {showConfirmStartFresh && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }} className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-5 w-full max-w-xs max-h-[min(70dvh,48rem)] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.42)] space-y-3 text-left">
              <div className="flex items-center gap-3 text-amber-500">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Start Fresh?</h3>
                  <p className="text-[10px] text-muted-foreground font-medium">Reset existing subjects & records</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Starting fresh will configure a new schedule. Your previous data can still be restored later from a backup file if needed.
              </p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowConfirmStartFresh(false)} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/50 transition-colors cursor-pointer">Cancel</button>
                <button type="button" onClick={handleConfirmStartFresh} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-sm cursor-pointer">Start Fresh</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
