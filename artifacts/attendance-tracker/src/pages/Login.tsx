import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Lock, User, KeyRound, ShieldCheck, HardDrive, ArrowRight } from 'lucide-react';

export default function Login() {
  const { 
    hasAccount, 
    login, 
    createAccount 
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(hasAccount ? 'signin' : 'signup');
  const [localUsername, setLocalUsername] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!localUsername.trim()) {
      setError('Please enter a username.');
      return;
    }

    if (!localPassword) {
      setError('Please enter a password.');
      return;
    }

    setLoading(true);

    if (mode === 'signup') {
      if (localPassword.length < 4) {
        setError('Password should be at least 4 characters long.');
        setLoading(false);
        return;
      }

      if (confirmPassword && localPassword !== confirmPassword) {
        setError('Passwords do not match.');
        setLoading(false);
        return;
      }

      const ok = createAccount(localUsername.trim(), localPassword);
      if (!ok) {
        setError('Could not create account. Please try again.');
      }
    } else {
      const ok = login(localUsername.trim(), localPassword);
      if (!ok) {
        setError('Incorrect username or password.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4 py-8 relative">
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* App Logo & Branding */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-lg border border-border mb-3 relative group">
            <img 
              src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`} 
              alt="Attendenz Logo" 
              className="w-full h-full object-cover" 
            />
          </div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Attendenz</h1>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            Medical College Attendance & Ward Tracker
          </p>
        </div>

        {/* Local Storage Protection Banner */}
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-2.5">
          <HardDrive className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="text-left">
            <p className="text-[11px] font-bold text-emerald-500">100% Local Device Storage</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Your data remains stored on your device only with full privacy.</p>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-card border border-border rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex justify-center border-b border-border pb-3">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); }}
                className={`text-xs font-bold pb-1 border-b-2 transition-all ${
                  mode === 'signin' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(''); }}
                className={`text-xs font-bold pb-1 border-b-2 transition-all ${
                  mode === 'signup' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Create Account
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Username */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={localUsername}
                  onChange={(e) => setLocalUsername(e.target.value)}
                  placeholder="e.g., Alex / Dr. Smith"
                  className="w-full bg-muted/60 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-foreground outline-none border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Password / PIN
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={localPassword}
                  onChange={(e) => setLocalPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-muted/60 rounded-xl pl-9 pr-9 py-2.5 text-xs font-medium text-foreground outline-none border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password (if signup) */}
            {mode === 'signup' && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-muted/60 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-foreground outline-none border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              <span>{mode === 'signup' ? 'Create Local Account' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Security & Offline Footer */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Offline First • Zero External Server Tracking</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
