import React from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun, Sparkles, CheckCircle2 } from 'lucide-react';

function AppPreviewCard({ isDark }: { isDark: boolean }) {
  const bg = isDark ? '#0f172a' : '#ffffff';
  const surface = isDark ? '#1e293b' : '#f1f5f9';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const accent = isDark ? '#3b82f6' : '#2563eb';
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <div
      className="w-full h-full flex flex-col p-3 rounded-2xl border shadow-lg transition-colors duration-300"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      {/* Header mock */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: border }}>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
          <div className="w-16 h-2 rounded-full" style={{ backgroundColor: textPrimary }} />
        </div>
        <div className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: surface, color: accent }}>
          78%
        </div>
      </div>

      {/* Stats row mock */}
      <div className="p-2 rounded-xl mb-2 flex items-center justify-between" style={{ backgroundColor: surface }}>
        <div>
          <div className="w-12 h-1.5 rounded-full mb-1" style={{ backgroundColor: textMuted }} />
          <div className="w-20 h-2.5 rounded-full" style={{ backgroundColor: textPrimary }} />
        </div>
        <CheckCircle2 className="w-4 h-4" style={{ color: accent }} />
      </div>

      {/* Mini subjects list mock */}
      <div className="space-y-1.5 flex-1">
        <div className="p-2 rounded-lg flex items-center justify-between" style={{ backgroundColor: surface }}>
          <div className="w-14 h-2 rounded-full" style={{ backgroundColor: textPrimary }} />
          <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
        </div>
        <div className="p-2 rounded-lg flex items-center justify-between" style={{ backgroundColor: surface }}>
          <div className="w-12 h-2 rounded-full" style={{ backgroundColor: textPrimary }} />
          <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
        </div>
      </div>
    </div>
  );
}

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 py-6 gap-5"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Title Header - guarantee no clipping */}
      <motion.div
        className="text-center space-y-1 max-w-xs sm:max-w-md px-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <p className="text-xs sm:text-sm font-bold tracking-[0.2em] uppercase text-sky-400 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Seamless Design
        </p>
        <h2 className="text-base sm:text-xl font-bold tracking-tight text-white drop-shadow-sm">
          Light & Dark Theme
        </h2>
      </motion.div>

      {/* Dual Panel Layout with Center Toggle Switch */}
      <div className="relative flex items-center justify-center w-full max-w-sm sm:max-w-md gap-3 sm:gap-4 px-2">
        {/* Left: Dark Theme Panel */}
        <motion.div
          className="flex-1 h-56 sm:h-64 relative group"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <AppPreviewCard isDark={true} />
          {/* Panel Badge Label */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-md">
            <Moon className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-bold text-slate-100 tracking-wider uppercase">Dark Mode</span>
          </div>
        </motion.div>

        {/* Center: Interactive Animated Theme Toggle Switch */}
        <motion.div
          className="relative z-20 flex flex-col items-center justify-center shrink-0"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          <div className="w-10 h-20 sm:w-11 sm:h-24 rounded-full bg-slate-900/90 border border-white/20 p-1 flex flex-col justify-between items-center shadow-2xl backdrop-blur-md">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
              <Sun className="w-4 h-4" />
            </div>
            {/* Animated Slider Knob */}
            <motion.div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 shadow-lg flex items-center justify-center text-white"
              animate={{
                y: [0, 24, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: 'reverse',
                ease: 'easeInOut',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </motion.div>
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Moon className="w-4 h-4" />
            </div>
          </div>
        </motion.div>

        {/* Right: Light Theme Panel */}
        <motion.div
          className="flex-1 h-56 sm:h-64 relative group"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <AppPreviewCard isDark={false} />
          {/* Panel Badge Label */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 border border-slate-200 shadow-md">
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] font-bold text-slate-800 tracking-wider uppercase">Light Mode</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
