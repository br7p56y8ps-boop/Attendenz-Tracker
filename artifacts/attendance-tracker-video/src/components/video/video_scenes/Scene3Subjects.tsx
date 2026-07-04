import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { FolderTree, ChevronRight } from 'lucide-react';

export function Scene3Subjects() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Stagger subjects
      setTimeout(() => setPhase(2), 2000), // Expand first category
      setTimeout(() => setPhase(3), 3500), // Highlight inputs
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const categories = [
    { name: "Medicine & Allied", color: "bg-blue-50 text-blue-700", border: "border-blue-200" },
    { name: "Surgery & Allied", color: "bg-red-50 text-red-700", border: "border-red-200" },
    { name: "Obs & Gynaecology", color: "bg-purple-50 text-purple-700", border: "border-purple-200" }
  ];

  const subSubjects = [
    { name: "General Medicine", attended: 45, total: 50 },
    { name: "Pediatrics", attended: 20, total: 30 },
    { name: "Dermatology", attended: 15, total: 15 }
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      
      <div className="w-full max-w-6xl grid grid-cols-2 gap-16 px-12 items-center">
        
        {/* Left: UI Mockup (now on left) */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative z-10 perspective-1000"
        >
          <div className="w-full max-w-md mx-auto bg-white rounded-[3rem] p-6 shadow-2xl border-8 border-slate-100 h-[600px] flex flex-col">
            
            <div className="flex items-center gap-3 mb-8 pt-4 px-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
                <FolderTree size={20} />
              </div>
              <h3 className="text-2xl font-display font-bold text-slate-900">Subjects</h3>
            </div>

            <div className="space-y-4 flex-1 overflow-hidden">
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ delay: i * 0.15, type: "spring", stiffness: 200, damping: 20 }}
                  className={`rounded-2xl border ${cat.border} overflow-hidden`}
                >
                  <div className={`px-5 py-4 ${cat.color} flex justify-between items-center font-bold text-lg cursor-pointer`}>
                    {cat.name}
                    <motion.div
                      animate={i === 0 && phase >= 2 ? { rotate: 90 } : { rotate: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronRight size={20} />
                    </motion.div>
                  </div>
                  
                  {/* Expanded Content (only for first one) */}
                  {i === 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={phase >= 2 ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
                      className="bg-white"
                    >
                      <div className="p-4 space-y-3">
                        {subSubjects.map((sub, j) => (
                          <div key={sub.name} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                            <span className="font-medium text-slate-700">{sub.name}</span>
                            <motion.div 
                              className="flex items-center gap-2"
                              animate={phase >= 3 && j === 0 ? { scale: [1, 1.1, 1] } : {}}
                              transition={{ duration: 0.5 }}
                            >
                              <div className={`px-3 py-1 rounded-lg bg-slate-100 text-slate-800 font-mono text-sm ${phase >= 3 && j === 0 ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}>
                                {sub.attended}
                              </div>
                              <span className="text-slate-400">/</span>
                              <div className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 font-mono text-sm">
                                {sub.total}
                              </div>
                            </motion.div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>

          </div>
        </motion.div>

        {/* Right: Copy */}
        <div className="space-y-6 z-10">
          <div className="overflow-hidden">
            <motion.h2
              initial={{ y: '100%' }}
              animate={{ y: '0%' }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl lg:text-6xl font-display font-bold text-slate-900 leading-tight"
            >
              Organized by<br />
              <span className="text-brand-green">Department</span>
            </motion.h2>
          </div>
          
          <div className="space-y-4">
            <motion.p
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-2xl text-slate-600 font-sans"
            >
              Track precise details.
            </motion.p>
            
            <motion.ul 
              className="space-y-3 mt-6"
              initial="hidden"
              animate="visible"
              variants={{
                visible: {
                  transition: { staggerChildren: 0.2, delayChildren: 1 }
                }
              }}
            >
              {[
                "Medicine, Surgery, O&G categorized",
                "Expandable sub-subjects",
                "Manual overrides when needed"
              ].map((item, i) => (
                <motion.li 
                  key={i}
                  variants={{
                    hidden: { opacity: 0, x: 20 },
                    visible: { opacity: 1, x: 0 }
                  }}
                  className="flex items-center gap-3 text-lg font-medium text-slate-700 bg-white/50 w-max px-5 py-3 rounded-2xl border border-slate-200"
                >
                  <div className="w-2 h-2 rounded-full bg-brand-green" />
                  {item}
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </div>

      </div>
    </div>
  );
}