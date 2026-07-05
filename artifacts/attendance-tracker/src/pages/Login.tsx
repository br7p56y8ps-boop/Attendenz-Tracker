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

  const inputClass = "w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 text-base transition-all";

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-5 py-10">
      {/* Logo / Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10"
      >
        <div className="text-5xl mb-4">🎓</div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Benz Attendance</h1>
        <p className="text-white/50 text-sm mt-1">Medical Student Tracker</p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-sm"
      >
        {/* Mode toggle (only if account exists) */}
        {hasAccount && (
          <div className="flex bg-white/10 rounded-2xl p-1 mb-6">
            {(['login', 'create'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all",
                  mode === m ? "bg-white text-slate-900" : "text-white/60"
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
                className="text-red-400 text-sm font-medium px-1"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-white text-slate-900 font-bold text-base hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg mt-2"
          >
            {mode === 'create' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Offline warning */}
        {mode === 'create' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-5 bg-amber-500/15 border border-amber-500/30 rounded-2xl p-4 flex gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200/80 text-xs leading-relaxed">
              <span className="font-semibold text-amber-300">Offline only.</span>{' '}
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
