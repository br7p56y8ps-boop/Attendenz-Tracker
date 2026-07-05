import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { BookOpen, Pencil, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SetupScreen() {
  const { isNewAccount, username } = useAuth();
  const { completeSetup, startFresh } = useCustomData();
  const { resetAllData } = useAttendance();

  const [showConfirm, setShowConfirm] = useState(false);

  const handlePreloaded = () => {
    completeSetup('preloaded');
  };

  const handleCustom = () => {
    if (isNewAccount) {
      // New account — no data to lose, go straight to custom mode
      startFresh();
    } else {
      // Existing user — data exists, confirm before wiping
      setShowConfirm(true);
    }
  };

  const handleConfirmFresh = () => {
    resetAllData();
    startFresh();
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center px-5 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{isNewAccount ? '👋' : '✨'}</div>
          <h1 className="text-2xl font-bold text-white">
            {isNewAccount ? `Welcome, ${username}!` : 'New Feature Available'}
          </h1>
          <p className="text-white/50 text-sm mt-2 leading-relaxed">
            {isNewAccount
              ? 'Choose how you want to track your attendance.'
              : 'You can now manage your own custom subjects. Choose how to proceed.'}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Preloaded option */}
          <button
            onClick={handlePreloaded}
            className="w-full bg-white/10 hover:bg-white/15 border border-white/20 rounded-3xl p-5 text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-blue-500/30 flex items-center justify-center shrink-0 group-hover:bg-blue-500/40 transition-colors">
                <BookOpen className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <p className="font-bold text-white text-base">
                  {isNewAccount ? 'Use Preloaded MBBS Subjects' : 'Keep Existing Subjects'}
                </p>
                <p className="text-white/50 text-sm mt-1 leading-relaxed">
                  {isNewAccount
                    ? 'Start with the built-in MBBS timetable, including all standard academic subjects, ward postings, and integrated teaching.'
                    : 'Keep your current subjects and data as-is. No changes will be made.'}
                </p>
              </div>
            </div>
          </button>

          {/* Custom option */}
          <button
            onClick={handleCustom}
            className="w-full bg-white/10 hover:bg-white/15 border border-white/20 rounded-3xl p-5 text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-purple-500/30 flex items-center justify-center shrink-0 group-hover:bg-purple-500/40 transition-colors">
                <Pencil className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <p className="font-bold text-white text-base">Create My Own Subjects</p>
                <p className="text-white/50 text-sm mt-1 leading-relaxed">
                  {isNewAccount
                    ? 'Start with an empty list. Add your own subjects, categories, and ward rotations using the Add New tab.'
                    : 'Start fresh with a clean slate. All existing subjects and attendance data will be permanently deleted.'}
                </p>
                {!isNewAccount && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-amber-400 text-xs font-semibold">This will delete all current data</span>
                  </div>
                )}
              </div>
            </div>
          </button>
        </div>

        <p className="text-white/30 text-xs text-center mt-6">
          You can add custom subjects anytime from the Add New tab.
        </p>
      </motion.div>

      {/* Confirm dialog for existing users */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-slate-800 border border-white/10 rounded-3xl p-6 w-full max-w-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Delete all data?</h3>
              </div>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                All your attendance records, subject data, and home selections will be
                <span className="text-red-400 font-semibold"> permanently deleted</span>.
                This cannot be undone. Consider exporting a backup first from the Account tab.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/20 text-white/70 text-sm font-semibold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmFresh}
                  className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors"
                >
                  Yes, delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
