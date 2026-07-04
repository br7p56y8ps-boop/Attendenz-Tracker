import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { MousePointer2, CheckCircle2 } from 'lucide-react';

export function Scene2Home() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),  // UI slides up
      setTimeout(() => setPhase(2), 2500), // Cursor moves
      setTimeout(() => setPhase(3), 3500), // Cursor clicks "Attended"
      setTimeout(() => setPhase(4), 4500), // Status updates
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
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl lg:text-6xl font-display font-bold text-slate-900 leading-tight"
            >
              Smart Daily<br />
              <span className="text-blue-600">Schedule</span>
            </motion.h2>
          </div>
          
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="space-y-4"
          >
            <p className="text-2xl text-slate-600 font-sans">
              Log attendance with one tap.
            </p>
            <div className="flex items-center gap-3 text-lg font-medium text-slate-700 bg-white/50 w-max px-4 py-2 rounded-full border border-slate-200">
              <span>🥺</span> Can't miss
              <span className="mx-2 text-slate-300">|</span>
              <span>✌️</span> Can miss
            </div>
          </motion.div>
        </div>

        {/* Right: UI Mockup */}
        <motion.div 
          initial={{ opacity: 0, y: 100, rotateX: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 100, rotateX: 20 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative perspective-1000 z-10"
        >
          {/* iOS App Shell Mockup */}
          <div className="w-full max-w-md mx-auto bg-white rounded-[3rem] p-6 shadow-2xl border-8 border-slate-100 relative overflow-hidden h-[600px] flex flex-col">
            
            <div className="flex justify-between items-center mb-8 pt-4 px-2">
              <div>
                <h3 className="text-2xl font-display font-bold text-slate-900">Today</h3>
                <p className="text-slate-500 font-medium">Monday, Oct 12</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                76%
              </div>
            </div>

            {/* Lecture Card */}
            <motion.div 
              className="bg-slate-50 rounded-3xl p-5 border border-slate-200 mb-4"
              animate={phase >= 4 ? { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' } : {}}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-xl font-bold text-slate-800">Cardiology</h4>
                  <p className="text-slate-500">10:00 AM - 11:00 AM</p>
                </div>
                <motion.div 
                  className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium flex items-center gap-1"
                  animate={phase >= 4 ? { backgroundColor: '#dcfce7', color: '#166534' } : {}}
                >
                  {phase >= 4 ? '✌️ Safe' : '🥺 Can\'t miss'}
                </motion.div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button className="flex flex-col items-center justify-center py-3 rounded-2xl bg-white shadow-sm border border-slate-100">
                  <span className="text-2xl mb-1">🥰</span>
                  <span className="text-xs font-medium text-slate-500">Holiday</span>
                </button>
                <button className="flex flex-col items-center justify-center py-3 rounded-2xl bg-white shadow-sm border border-slate-100">
                  <span className="text-2xl mb-1">😒</span>
                  <span className="text-xs font-medium text-slate-500">Missed</span>
                </button>
                <motion.button 
                  animate={phase >= 3 ? { scale: 0.95, backgroundColor: '#dcfce7' } : {}}
                  className="flex flex-col items-center justify-center py-3 rounded-2xl bg-white shadow-sm border border-slate-100 relative overflow-hidden"
                >
                  <span className="text-2xl mb-1">😁</span>
                  <span className="text-xs font-medium text-slate-500">Attended</span>
                  
                  {/* Click Ripple */}
                  {phase >= 3 && (
                    <motion.div 
                      initial={{ scale: 0, opacity: 0.5 }}
                      animate={{ scale: 3, opacity: 0 }}
                      transition={{ duration: 0.5 }}
                      className="absolute inset-0 bg-green-400 rounded-full origin-center"
                    />
                  )}
                </motion.button>
              </div>
            </motion.div>

            {/* Second Lecture Card (dimmed) */}
            <div className="bg-slate-50/50 rounded-3xl p-5 border border-slate-100 opacity-60">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-xl font-bold text-slate-800">Pharmacology</h4>
                  <p className="text-slate-500">11:30 AM - 12:30 PM</p>
                </div>
                <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  ✌️ Can miss
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 opacity-50">
                <div className="py-3 rounded-2xl bg-white border border-slate-100 text-center">🥰</div>
                <div className="py-3 rounded-2xl bg-white border border-slate-100 text-center">😒</div>
                <div className="py-3 rounded-2xl bg-white border border-slate-100 text-center">😁</div>
              </div>
            </div>

            {/* Animated Cursor */}
            <motion.div
              initial={{ x: 100, y: 300, opacity: 0 }}
              animate={
                phase === 1 ? { x: 100, y: 300, opacity: 1 } :
                phase === 2 ? { x: 260, y: 190, opacity: 1 } :
                phase === 3 ? { x: 260, y: 190, scale: 0.9, opacity: 1 } :
                phase >= 4 ? { x: 260, y: 190, scale: 1, opacity: 0 } :
                { x: 100, y: 300, opacity: 0 }
              }
              transition={{ 
                duration: phase === 2 ? 1 : 0.2, 
                ease: phase === 2 ? "backOut" : "easeOut"
              }}
              className="absolute z-50 text-slate-800 drop-shadow-xl"
            >
              <MousePointer2 size={40} className="fill-white" />
            </motion.div>

          </div>
        </motion.div>

      </div>
    </div>
  );
}