import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'create';

export default function Login() {
  const { hasAccount, createAccount, login, forgotPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(hasAccount ? 'login' : 'create');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [showForgotDialog, setShowForgotDialog] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'create') {
      if (username.trim().length < 2) { setError('Username must be at least 2 characters.'); return; }
      if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      const ok = createAccount(username, password);
      if (!ok) setError('Failed to create account. Please try again.');
    } else {
      const ok = login(username, password);
      if (!ok) setError('Incorrect username or password.');
    }
  };

  const handleForgotConfirm = () => {
    forgotPassword();
  };

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 text-base transition-all";

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-black px-5 py-10">
      {/* Logo / Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8 flex flex-col items-center"
      >
        <img src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`} alt="Attendenz Icon" className="w-24 h-24 rounded-[28px] object-cover mb-4 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.8)] filter drop-shadow-[0_4px_12px_rgba(10,132,255,0.25)]" />
        
        <div className="relative inline-flex flex-col items-center pb-2.5 select-none">
          <span className="font-extrabold tracking-[-0.03em] flex items-center text-4xl sm:text-5xl">
            {/* Gold/Amber liquid glass gradient for "Attend" */}
            <span className="bg-gradient-to-b from-[#FFF5C3] via-[#E29A1F] to-[#734300] bg-clip-text text-transparent filter drop-shadow-[0_2px_12px_rgba(226,154,31,0.5)]">
              Attend
            </span>
            {/* Platinum silver glass gradient for "enz" */}
            <span className="bg-gradient-to-b from-[#FFFFFF] via-[#D1D9E6] to-[#4A5E75] bg-clip-text text-transparent filter drop-shadow-[0_2px_12px_rgba(209,217,230,0.4)] relative">
              enz
              {/* "TRACKER" Subscript aligned under "enz" */}
              <span className="absolute left-0 -bottom-2 text-[8px] md:text-[9px] text-white/70 tracking-[0.3em] font-light uppercase">
                TRACKER
              </span>
            </span>
          </span>
        </div>
        
        <p className="text-white/40 text-xs tracking-wider uppercase mt-2">Lecture & Clinical Tracker</p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-sm glass-panel rounded-[28px] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.8)]"
      >
        {/* Mode toggle (only if account exists) */}
        {hasAccount && (
          <div className="flex bg-white/5 rounded-2xl p-1 mb-6 border border-white/5">
            {(['login', 'create'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300",
                  mode === m ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/50 hover:text-white/80"
                )}
              >
                {m === 'login' ? 'Sign In' : 'New Account'}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              className={inputClass}
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              className={cn(inputClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {mode === 'create' && (
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={cn(inputClass, "pr-12")}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          )}

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-destructive text-sm font-medium px-1"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-base hover:opacity-95 active:scale-[0.98] transition-all shadow-[0_4px_15px_rgba(10,132,255,0.3)] mt-2"
          >
            {mode === 'create' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Offline warning */}
        {mode === 'create' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-200/60 text-xs leading-relaxed">
              <span className="font-semibold text-amber-500">Offline only.</span>{' '}
              Your credentials and all attendance data are stored locally on this device.
              There is no recovery option — forgetting your password will permanently erase all data.
              Keep your credentials safe.
            </p>
          </motion.div>
        )}

        {/* Forgot password */}
        {mode === 'login' && (
          <button
            onClick={() => { setShowForgotDialog(true); setForgotStep(1); }}
            className="w-full mt-5 text-white/40 text-sm hover:text-white/70 transition-colors"
          >
            Forgot password?
          </button>
        )}
      </motion.div>

      {/* Forgot Password Dialog */}
      <AnimatePresence>
        {showForgotDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowForgotDialog(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-slate-800 border border-white/10 rounded-3xl p-6 w-full max-w-sm"
            >
              {forgotStep === 1 ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Forgot Password</h3>
                  </div>
                  <p className="text-white/60 text-sm leading-relaxed mb-6">
                    Since this app is fully offline, there is <span className="text-white font-semibold">no recovery option</span>.
                    Resetting will <span className="text-red-400 font-semibold">permanently delete all your attendance data</span> — including all subjects, history, and settings. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowForgotDialog(false)}
                      className="flex-1 py-3 rounded-2xl border border-white/20 text-white/70 text-sm font-semibold hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setForgotStep(2)}
                      className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors"
                    >
                      I understand
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center">
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Are you absolutely sure?</h3>
                  </div>
                  <p className="text-white/60 text-sm mb-6">
                    All data will be wiped and you'll start fresh. Consider exporting a backup first (from Account tab).
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowForgotDialog(false)}
                      className="flex-1 py-3 rounded-2xl border border-white/20 text-white/70 text-sm font-semibold hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleForgotConfirm}
                      className="flex-1 py-3 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors"
                    >
                      Delete everything
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
