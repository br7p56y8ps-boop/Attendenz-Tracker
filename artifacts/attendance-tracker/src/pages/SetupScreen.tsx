import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomData, SubjectMode } from '@/contexts/CustomDataContext';
import { BookOpen, Pencil, ShieldCheck, User, ArrowRight, RefreshCw, Upload, Sparkles, AlertTriangle } from 'lucide-react';
import { importDataFromJSON, getSnapshots } from '../utils/snapshotUtils';

export default function SetupScreen() {
  const { username, updateUsername } = useAuth();
  const { completeSetup, setWhatsNewOpen } = useCustomData();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if previous local data exists
  const [, setHasPreviousData] = useState<boolean>(false);
  const [detectedMode, setDetectedMode] = useState<SubjectMode>('preloaded');
  const [showDataDetectedView, setShowDataDetectedView] = useState<boolean>(false);

  const [step, setStep] = useState<1 | 2>(1);
  const [chosenRoutineMode, setChosenRoutineMode] = useState<SubjectMode>('preloaded');
  const [localIdentityName, setLocalIdentityName] = useState(username || 'Medical Student');
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
        setHasPreviousData(true);
        setShowDataDetectedView(true);
        if (savedMode) setDetectedMode(savedMode);
      }
    } catch (e) {
       // console.error("Error checking previous data:", e);
    }
  }, []);

  // Action 1: Restore Previous Data
  const handleRestorePreviousData = () => {
    if (localIdentityName.trim()) {
      updateUsername(localIdentityName.trim());
    }
    localStorage.removeItem('att_just_updated');
    completeSetup(detectedMode);
    setWhatsNewOpen(true);
  };

  // Action 2: Restore from Backup File
  const handleRestoreBackupFile = (file: File) => {
    importDataFromJSON(file, (success: boolean) => {
      if (success) {
        if (localIdentityName.trim()) {
          updateUsername(localIdentityName.trim());
        }
        localStorage.removeItem('att_just_updated');
        const updatedMode = (localStorage.getItem('att_subject_mode') as SubjectMode) || 'preloaded';
        completeSetup(updatedMode);
        setWhatsNewOpen(true);
      } else {
        import("sonner").then(({ toast }) => toast.info('Failed to restore backup file. Please ensure it is a valid Attendenz JSON backup.'));
      }
    });
  };

  // Action 3: Start Fresh
  const handleConfirmStartFresh = () => {
    setShowDataDetectedView(false);
    setShowConfirmStartFresh(false);
    setStep(1);
  };

  // Step 1: Routine Mode Selection
  const handleSelectRoutineMode = (mode: SubjectMode) => {
    setChosenRoutineMode(mode);
    setStep(2);
  };

  // Step 2: Submit Display Name and open Home Page
  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localIdentityName.trim()) {
      updateUsername(localIdentityName.trim());
    }
    localStorage.removeItem('att_just_updated');
    completeSetup(chosenRoutineMode);
    setWhatsNewOpen(true);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm space-y-5"
      >
        {/* Branding Header */}
        <div className="text-center flex flex-col items-center">
          <div className="w-20 h-20 rounded-3xl overflow-hidden border border-border shadow-lg mb-3 relative group">
            <img 
              src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`} 
              alt="Attendenz Logo" 
              className="w-full h-full object-cover" 
            />
          </div>

          <h1 className="text-2xl font-black text-foreground tracking-tight">
            Welcome to Attendenz
          </h1>
          <p className="text-muted-foreground text-xs mt-1 leading-relaxed max-w-[280px]">
            Offline-first tracker for medical lectures & clinical ward rotations.
          </p>
        </div>

        {/* VIEW A: PREVIOUS DATA DETECTED */}
        {showDataDetectedView ? (
          <div className="space-y-4 pt-1">
            <div className="bg-card border border-primary/20 rounded-3xl p-5 shadow-lg space-y-3 text-left relative overflow-hidden">
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Previous Data Detected</span>
              </div>

              <div className="bg-muted/40 p-3 rounded-2xl border border-border/60 space-y-1">
                <p className="text-[10px] uppercase font-extrabold text-muted-foreground">
                  Detected Routine Mode
                </p>
                <p className="text-sm font-black text-foreground capitalize flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {detectedMode === 'preloaded' ? 'MBBS 5th Year Curriculum (Preset)' : 'Custom Routine Mode'}
                </p>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                We found your existing attendance records and subject configurations saved safely on this device.
              </p>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleRestorePreviousData}
                  className="w-full py-3.5 px-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Restore Previous Data (Recommended)</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-card hover:bg-muted/50 border border-border text-foreground font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Restore Backup File (.json)</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleRestoreBackupFile(file);
                  }}
                  accept=".json"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => setShowConfirmStartFresh(true)}
                  className="w-full py-2.5 text-muted-foreground hover:text-foreground text-[11px] font-medium text-center transition-colors cursor-pointer"
                >
                  Start Fresh with Clean Slate
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* VIEW B: STANDARD 2-STEP SETUP */
          <>
            {/* STEP 1: ROUTINE MODE SELECTION */}
            {step === 1 && (
              <div className="space-y-3 pt-1">
                <div className="text-left space-y-0.5 px-1">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    Step 1 of 2: Select Routine Mode
                  </h2>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Select how you want to set up your subjects and clinical ward rotations.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => handleSelectRoutineMode('preloaded')}
                    type="button"
                    className="w-full bg-card hover:bg-muted/40 border border-border rounded-3xl p-4 text-left transition-all active:scale-[0.98] group shadow-sm cursor-pointer"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <BookOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-foreground text-sm">Use Preloaded MBBS Subjects</p>
                        <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed">
                          Tailored for MBBS 5th year curriculum. Includes preconfigured theory subjects & ward schedules (customizable anytime).
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleSelectRoutineMode('custom')}
                    type="button"
                    className="w-full bg-card hover:bg-muted/40 border border-border rounded-3xl p-4 text-left transition-all active:scale-[0.98] group shadow-sm cursor-pointer"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                        <Pencil className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-foreground text-sm">Create My Own Subjects</p>
                        <p className="text-muted-foreground text-[11px] mt-1 leading-relaxed">
                          Start with a clean slate. Add your own subjects, departments, and clinical ward postings manually.
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: DISPLAY NAME SETUP */}
            {step === 2 && (
              <form onSubmit={handleFinalSubmit} className="space-y-4">
                <div className="text-left space-y-0.5 px-1">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    Step 2 of 2: Setup Display Name
                  </h2>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Enter your display name for your profile card and statistics logs.
                  </p>
                </div>

                <div className="bg-card border border-border rounded-3xl p-4 shadow-md space-y-2 text-left">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Your Identity / Display Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={localIdentityName}
                      onChange={(e) => setLocalIdentityName(e.target.value)}
                      placeholder="e.g. Dr. Alex / Medical Student"
                      className="w-full bg-muted/60 rounded-xl pl-10 pr-3 py-2.5 text-xs font-bold text-foreground outline-none border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="py-3.5 px-4 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-2xl border border-border text-xs cursor-pointer transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3.5 px-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <span>Complete Setup & Open App</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Confirm Start Fresh Dialog */}
        <AnimatePresence>
          {showConfirmStartFresh && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card border border-border rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-3 text-left"
              >
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
                  <button
                    type="button"
                    onClick={() => setShowConfirmStartFresh(false)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-xs font-semibold hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmStartFresh}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    Start Fresh
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>100% Local Device Privacy</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
