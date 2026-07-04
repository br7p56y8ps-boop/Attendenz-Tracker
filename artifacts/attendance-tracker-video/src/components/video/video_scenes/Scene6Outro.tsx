import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6Outro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="z-10 flex flex-col items-center justify-center text-center">
        
        <div className="overflow-hidden">
          <motion.h1
            initial={{ y: '100%' }}
            animate={phase >= 1 ? { y: '0%' } : { y: '100%' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-6xl md:text-8xl font-bold tracking-tight text-slate-900 leading-none"
          >
            Attendance
          </motion.h1>
        </div>
        <div className="overflow-hidden mt-2">
          <motion.h1
            initial={{ y: '100%' }}
            animate={phase >= 1 ? { y: '0%' } : { y: '100%' }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-6xl md:text-8xl font-bold tracking-tight text-brand-blue leading-none"
          >
            Tracker
          </motion.h1>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
          className="mt-12 flex gap-4"
        >
          <div className="px-8 py-4 rounded-full bg-slate-900 text-white font-bold text-xl shadow-xl">
            Start Tracking
          </div>
        </motion.div>
        
        <motion.p
           initial={{ opacity: 0 }}
           animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
           transition={{ duration: 0.8, delay: 0.4 }}
           className="mt-6 text-slate-500 font-medium"
        >
          Available now.
        </motion.p>
      </div>
    </div>
  );
}