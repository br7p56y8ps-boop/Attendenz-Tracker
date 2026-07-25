import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  PieChart, 
  Activity, 
  CalendarClock, 
  ShieldCheck,
  HardDrive,
  FileDown,
  CalendarDays, 
  Moon 
} from 'lucide-react';

const features = [
  { icon: LayoutDashboard, title: "Smart Dashboard", subtitle: "Dynamic daily schedule" },
  { icon: PieChart, title: "Attendance Analytics", subtitle: "Progress tracking" },
  { icon: ShieldCheck, title: "PWA Data Protection", subtitle: "Secure local device storage" },
  { icon: Activity, title: "Clinical Rotations", subtitle: "Morning & evening wards" },
  { icon: HardDrive, title: "JSON & Snapshot Backups", subtitle: "Full offline backup & restore" },
  { icon: FileDown, title: "Export as PDF", subtitle: "Share attendance reports" },
  { icon: CalendarDays, title: "Calendar History", subtitle: "Visual monthly logs" },
  { icon: Moon, title: "Adaptive Themes", subtitle: "Premium light & dark modes" },
];

export function Scene2() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Total scene time: 6000ms. 8 features.
    // ~750ms per feature
    const interval = setInterval(() => {
      setIndex(prev => {
        if (prev < features.length - 1) return prev + 1;
        return prev;
      });
    }, 750);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.8, ease: "circOut" }}
    >
      <div 
        className="absolute inset-0 z-0 opacity-20 pointer-events-none mix-blend-screen"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/clinical-texture.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      <div className="w-full max-w-sm h-72 relative perspective-1000 z-10">
        <AnimatePresence mode="popLayout">
          {features.map((feature, i) => {
            if (i !== index) return null;
            const Icon = feature.icon;
            
            return (
              <motion.div
                key={i}
                className="absolute inset-0 w-full h-full bg-slate-900/80 border border-white/15 backdrop-blur-xl shadow-2xl rounded-3xl flex flex-col items-center justify-center p-6 text-center"
                initial={{ opacity: 0, rotateX: 90, y: 100, scale: 0.8 }}
                animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, rotateX: -90, y: -100, scale: 0.8 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <motion.div 
                  className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(59,130,246,0.5)]"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 15 }}
                >
                  <Icon className="w-10 h-10 text-white" strokeWidth={1.5} />
                </motion.div>
                
                <motion.h2 
                  className="text-2xl md:text-3xl font-display font-bold text-white mb-2 drop-shadow-sm"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  {feature.title}
                </motion.h2>
                
                <motion.p 
                  className="text-base md:text-lg text-slate-300 font-medium"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  {feature.subtitle}
                </motion.p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
