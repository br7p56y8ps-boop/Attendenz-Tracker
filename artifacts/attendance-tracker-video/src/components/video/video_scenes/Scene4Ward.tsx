import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';

export function Scene4Ward() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // Date changes
      setTimeout(() => setPhase(3), 3500), // Ward updates
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-full max-w-6xl grid grid-cols-2 gap-16 px-12 items-center">
        
        {/* Left: Copy */}
        <div className="space-y-6 z-10">
          <div className="overflow-hidden">
            <motion.h2
              initial={{ y: '100%' }}
              animate={{ y: '0%' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl lg:text-6xl font-display font-bold text-slate-900 leading-tight"
            >
              Auto-detected<br />
              <span className="text-purple-600">Ward Posting</span>
            </motion.h2>
          </div>
          
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-2xl text-slate-600 font-sans"
          >
            Always knows where you belong.
          </motion.p>
        </div>

        {/* Right: UI Mockup */}
        <div className="relative z-10 flex flex-col items-center justify-center space-y-8">
          
          {/* Calendar Widget */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
            className="glass-card w-full max-w-sm rounded-3xl p-6 border-2 border-white/60 relative overflow-hidden shadow-2xl"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                <CalendarDays size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Date</p>
                <div className="h-8 overflow-hidden relative w-40">
                  <motion.div
                    animate={phase >= 2 ? { y: -32 } : { y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="absolute inset-x-0 flex flex-col"
                  >
                    <span className="text-2xl font-bold text-slate-900 h-8 flex items-center">Oct 12 - 25</span>
                    <span className="text-2xl font-bold text-purple-600 h-8 flex items-center">Oct 26 - Nov 8</span>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Connection Line */}
          <motion.div 
            className="w-1 h-12 bg-gradient-to-b from-blue-300 to-purple-300 rounded-full"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            style={{ originY: 0 }}
          />

          {/* Ward Widget */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, type: "spring" }}
            className="bg-white w-full max-w-sm rounded-3xl p-6 border-2 border-purple-100 shadow-xl relative overflow-hidden"
          >
            <motion.div 
              className="absolute inset-0 bg-purple-50"
              initial={{ opacity: 0 }}
              animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center">
                <MapPin size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Current Ward</p>
                <div className="h-8 overflow-hidden relative w-48">
                  <motion.div
                    animate={phase >= 3 ? { y: -32 } : { y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="absolute inset-x-0 flex flex-col"
                  >
                    <span className="text-2xl font-bold text-slate-900 h-8 flex items-center">Gen. Surgery</span>
                    <span className="text-2xl font-bold text-purple-900 h-8 flex items-center">Internal Med.</span>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>

        </div>

      </div>
    </div>
  );
}