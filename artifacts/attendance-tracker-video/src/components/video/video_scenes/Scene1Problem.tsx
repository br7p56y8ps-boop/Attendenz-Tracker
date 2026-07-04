import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Activity, AlertCircle } from 'lucide-react';

export function Scene1Problem() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      
      {/* Background large 75% text */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 0.03, scale: 1.2 }}
        transition={{ duration: 5, ease: "easeOut" }}
        className="absolute font-display font-bold text-[40vw] leading-none text-slate-900 select-none z-0 pointer-events-none whitespace-nowrap"
      >
        75%
      </motion.div>

      <div className="z-10 w-full max-w-4xl px-8 flex flex-col items-center">
        
        <div className="relative w-64 h-64 mb-12">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <img 
              src={`${import.meta.env.BASE_URL}images/3d-chart.png`} 
              alt="Chart"
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.5, y: 50 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="absolute -bottom-6 -right-12 glass-card px-6 py-4 rounded-2xl flex items-center gap-4 shadow-xl border-red-200/50"
          >
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-500">
              <AlertCircle size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Status</p>
              <p className="text-2xl font-display font-bold text-slate-800">74.2%</p>
            </div>
          </motion.div>
        </div>

        <div className="text-center space-y-4">
          <div className="overflow-hidden">
            <motion.h2 
              initial={{ y: '100%' }}
              animate={phase >= 2 ? { y: '0%' } : { y: '100%' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl md:text-6xl font-display font-bold text-slate-900"
            >
              The 75% Rule.
            </motion.h2>
          </div>
          
          <div className="overflow-hidden">
            <motion.p
              initial={{ y: '100%' }}
              animate={phase >= 2 ? { y: '0%' } : { y: '100%' }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-2xl text-slate-600 font-sans max-w-2xl mx-auto"
            >
              Can you afford to miss today's lecture?
            </motion.p>
          </div>
        </div>

      </div>
    </div>
  );
}