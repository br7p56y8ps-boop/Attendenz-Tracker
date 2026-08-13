import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomData } from '@/contexts/CustomDataContext';
import { X, CheckCircle2, Wrench, Zap } from 'lucide-react';
import { LATEST_VERSION, WHATS_NEW_UPGRADES, WHATS_NEW_FIXES } from '@/lib/appVersion';

export function WhatsNewPopup() {
  const { whatsNewOpen, setWhatsNewOpen } = useCustomData();

  if (!whatsNewOpen) return null;

  const handleClose = () => {
    setWhatsNewOpen(false);
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm space-y-4 my-auto relative max-h-[calc(100vh-140px)] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl overflow-hidden shrink-0 border border-white/20 shadow-sm">
                <img
                  src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`}
                  alt="Attendenz Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-left">
                <h2 className="text-base font-extrabold text-white leading-tight">What's New</h2>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  v{LATEST_VERSION} (Stable)
                </span>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content – NO CONTAINER, plain text on backdrop */}
          <div className="overflow-y-auto pr-1 space-y-3.5 flex-1 min-h-0 text-left">
            {/* Upgrades */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-400 px-0.5">
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Upgrades / New Features</span>
              </div>
              <div className="space-y-2">
                {WHATS_NEW_UPGRADES.map(item => (
                  <div key={item.title} className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-2xl backdrop-blur-sm">
                    <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-white/80 leading-relaxed mt-0.5 pl-3">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Fixes */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5 text-amber-400 px-0.5">
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Fixes & Refinements</span>
              </div>
              <div className="space-y-2">
                {WHATS_NEW_FIXES.map(item => (
                  <div key={item.title} className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-2xl backdrop-blur-sm">
                    <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-white/80 leading-relaxed mt-0.5 pl-3">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Button */}
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
