import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomData } from '@/contexts/CustomDataContext';
import { X, Sparkles, Calendar, Sun, Image, Percent, CheckCircle2 } from 'lucide-react';

export function WhatsNewModal() {
  const { isWhatsNewOpen, setWhatsNewOpen } = useCustomData();

  if (!isWhatsNewOpen) return null;

  const features = [
    {
      icon: <Calendar className="w-5 h-5 text-primary" />,
      title: "Enhanced Timetable & Calendar",
      desc: "Timetable week now starts on Saturday and ends on Friday (merged Holiday). Features smart 'Rest' and 'Small Group Teaching' cell merges, plus a read-only calendar date history view."
    },
    {
      icon: <Sun className="w-5 h-5 text-amber-500" />,
      title: "Instant Light & Dark Mode",
      desc: "Easily switch between Light and Dark mode right from your Profile Card in the Account tab."
    },
    {
      icon: <Image className="w-5 h-5 text-emerald-500" />,
      title: "Mobile Photos & Gallery Upload",
      desc: "Profile picture selection is now optimized to open Apple Photos on iOS and Gallery on Android directly."
    },
    {
      icon: <Percent className="w-5 h-5 text-indigo-500" />,
      title: "Target Attendance Selector",
      desc: "Updated Preferred Percentage setting to a clean dropdown selector ranging from 50% to 100%."
    }
  ];

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={() => setWhatsNewOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6 my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-foreground">What's New</h2>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  v3.6.0 (Stable)
                </span>
              </div>
            </div>
            <button
              onClick={() => setWhatsNewOpen(false)}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Highlights List */}
          <div className="space-y-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-start gap-3.5 bg-muted/30 p-3.5 rounded-2xl border border-border/40">
                <div className="p-2 rounded-xl bg-card border border-border/50 shrink-0">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Action Button */}
          <button
            onClick={() => setWhatsNewOpen(false)}
            className="w-full py-3.5 bg-primary text-primary-foreground font-bold rounded-2xl shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            Got it, Let's go!
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}