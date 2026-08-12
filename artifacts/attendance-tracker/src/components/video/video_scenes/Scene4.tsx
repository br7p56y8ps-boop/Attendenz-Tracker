import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ShieldCheck } from 'lucide-react';

const logoImg = `${import.meta.env.BASE_URL || '/'}Logo.jpeg`;
const TAGLINE_WORDS = ['Track', 'Smarter.', 'Stay', 'Ahead.'];

export function Scene4() {
  const [showTapHint, setShowTapHint] = useState(false);

  useEffect(() => {
    // Show "Tap anywhere to continue" ~1.2s after animation completes
    const timer = setTimeout(() => {
      setShowTapHint(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.5 }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.45) 0%, rgba(2, 6, 23, 0.8) 100%)',
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 text-center max-w-sm px-4"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="relative mb-2">
          <motion.div
            className="absolute inset-0 -m-4 rounded-full bg-blue-500/30 blur-2xl"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.div
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border border-white/20 p-2 bg-slate-900/80 shadow-2xl backdrop-blur-md relative z-10 flex items-center justify-center"
            initial={{ scale: 0.2, opacity: 0, rotateY: -180, y: 30 }}
            animate={{ scale: 1, opacity: 1, rotateY: 0, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={logoImg}
              alt="Attendenz Logo"
              className="w-full h-full object-cover rounded-2xl filter drop-shadow-[0_0_12px_rgba(59,130,246,0.8)]"
            />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-1"
        >
          <h1 className="text-3xl sm:text-4xl font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-sky-300 drop-shadow-md">
            Attendenz
          </h1>
          <p className="text-xs sm:text-sm font-bold tracking-[0.3em] uppercase text-amber-400 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" />
            Tracker
          </p>
        </motion.div>

        <motion.div
          className="w-12 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent rounded-full"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        />

        <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-lg sm:text-xl font-bold tracking-wider text-sky-200">
          {TAGLINE_WORDS.map((word, i) => (
            <motion.span
              key={word + i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.12, duration: 0.4 }}
            >
              {word}
            </motion.span>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.5 }}
          className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold backdrop-blur-sm"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>Medical College Attendance & Ward Tracker</span>
        </motion.div>
      </motion.div>

      {/* Tap anywhere to continue prompt */}
      {showTapHint && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: [0.4, 1, 0.4], y: 0 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-10 inset-x-0 flex items-center justify-center pointer-events-none z-40"
        >
          <div className="bg-slate-900/80 border border-white/20 px-5 py-2 rounded-full backdrop-blur-md text-xs font-bold text-sky-200 tracking-wide shadow-2xl">
            Tap anywhere to continue
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
