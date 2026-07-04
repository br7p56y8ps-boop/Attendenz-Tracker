import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { WifiOff, Database, ShieldCheck } from 'lucide-react';

export function Scene5Offline() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000), // Wifi off
      setTimeout(() => setPhase(2), 2200), // Local storage appears
      setTimeout(() => setPhase(3), 3200), // Shield check
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      
      <div className="z-10 w-full max-w-4xl px-8 flex flex-col items-center">
        
        {/* Visuals */}
        <div className="relative w-64 h-64 mb-12 flex items-center justify-center">
          
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={phase >= 0 ? { scale: 1, opacity: 1 } : {}}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-2xl border-4 border-slate-50 z-20"
          >
            <motion.div
              animate={phase >= 1 ? { color: '#ef4444', rotate: -10 } : { color: '#3b82f6', rotate: 0 }}
            >
              <WifiOff size={56} strokeWidth={2.5} />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ scale: 0, opacity: 0, x: 0 }}
            animate={phase >= 2 ? { scale: 1, opacity: 1, x: -100, y: 50 } : { scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="absolute bg-white px-6 py-4 rounded-2xl flex items-center gap-3 shadow-xl border border-slate-100 z-10"
          >
            <Database className="text-emerald-500" />
            <span className="font-bold text-slate-700">localStorage</span>
          </motion.div>

          <motion.div
            initial={{ scale: 0, opacity: 0, x: 0 }}
            animate={phase >= 3 ? { scale: 1, opacity: 1, x: 100, y: 50 } : { scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="absolute bg-white px-6 py-4 rounded-2xl flex items-center gap-3 shadow-xl border border-slate-100 z-10"
          >
            <ShieldCheck className="text-emerald-500" />
            <span className="font-bold text-slate-700">100% Private</span>
          </motion.div>

        </div>

        {/* Copy */}
        <div className="text-center space-y-4">
          <div className="overflow-hidden">
            <motion.h2 
              initial={{ y: '100%' }}
              animate={phase >= 1 ? { y: '0%' } : { y: '100%' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl md:text-6xl font-display font-bold text-slate-900"
            >
              Fully Offline.
            </motion.h2>
          </div>
          
          <div className="overflow-hidden">
            <motion.p
              initial={{ y: '100%' }}
              animate={phase >= 1 ? { y: '0%' } : { y: '100%' }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-2xl text-slate-600 font-sans max-w-2xl mx-auto"
            >
              No internet? No problem.
            </motion.p>
          </div>
        </div>

      </div>
    </div>
  );
}