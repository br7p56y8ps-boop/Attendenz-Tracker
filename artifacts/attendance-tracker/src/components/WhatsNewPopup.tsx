import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomData } from '@/contexts/CustomDataContext';
import { X, Sparkles, CheckCircle2, Wrench, Zap, ShieldCheck, Database, Phone, ArrowRightLeft, Sliders } from 'lucide-react';

export function WhatsNewPopup() {
  const { whatsNewOpen, setWhatsNewOpen } = useCustomData();

  if (!whatsNewOpen) return null;

  const handleClose = () => {
    setWhatsNewOpen(false);
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border/80 rounded-3xl p-4 sm:p-5 w-full max-w-sm shadow-2xl space-y-3.5 my-auto relative max-h-[calc(100vh-140px)] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-border/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl overflow-hidden shrink-0 border border-border/80 shadow-sm">
                <img 
                  src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`} 
                  alt="Attendenz Logo" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-foreground leading-tight">What's New</h2>
                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  v4.2.0 (Stable)
                </span>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="overflow-y-auto pr-1 space-y-3.5 flex-1 min-h-0 text-left">
            {/* NEW FEATURES SECTION (GREEN) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-500 px-0.5">
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Upgrades / New Features</span>
              </div>
              <div className="space-y-2">
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Export Attendance Report
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    Export your complete attendance logs, subject statistics, and ward rotations in PDF, Excel, or CSV formats.
                  </p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Transfer Data across Device
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    Securely transfer your complete app data, attendance history, and settings to another device seamlessly.
                  </p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Fully Local Storage & No Cloud Dependency
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    100% private on-device data persistence powered by IndexedDB with browser cache protection.
                  </p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Local Snapshots
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    Create point-in-time state snapshots to safeguard your attendance history before making major curriculum adjustments.
                  </p>
                </div>
              </div>
            </div>

            {/* FIXES SECTION (AMBER) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5 text-amber-500 px-0.5">
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Fixes & Refinements</span>
              </div>
              <div className="space-y-2">
                <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Backup & Restore
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    Seamless JSON backup export and import with validation to prevent data loss across device transfers.
                  </p>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Attendance Display Logic
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    Accurate percentage calculations, required class threshold counters, and category grouping across all routine modes.
                  </p>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Add New Subject UI Refinements
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    Polished dialog layout, category tags, and input validation for adding custom single or allied subjects.
                  </p>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-2xl">
                  <h3 className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Curriculum Management
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 pl-3">
                    Dedicated curriculum tracking with completion status, automated record archiving, and non-destructive routine switches.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleClose}
            className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-2xl shadow-md hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            Got It • Continue Using App
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default WhatsNewPopup;