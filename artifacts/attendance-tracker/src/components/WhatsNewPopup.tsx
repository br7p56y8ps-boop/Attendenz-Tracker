import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomData } from '@/contexts/CustomDataContext';
import { X, CheckCircle2, Wrench, Zap } from 'lucide-react';
import { APP_VERSION, WHATS_NEW_UPGRADES, WHATS_NEW_FIXES } from '@/lib/appVersion';
import { lockScroll, unlockScroll } from '@/lib/scrollLock';

export function WhatsNewPopup() {
  const { whatsNewOpen, setWhatsNewOpen } = useCustomData();

  useEffect(() => {
    if (whatsNewOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  }, [whatsNewOpen]);

  const handleClose = () => {
    setWhatsNewOpen(false);
  };

  return (
    <AnimatePresence>
      {whatsNewOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-3"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm space-y-3 my-auto relative max-h-[calc(100vh-100px)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0 border border-white/20 shadow-sm">
                  <img
                    src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`}
                    alt="Attendenz Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-left">
                  <h2 className="text-sm font-extrabold text-white leading-tight">What's New</h2>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    v{APP_VERSION} (Stable)
                  </span>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Content – compact plain text, no containers */}
            <div className="overflow-y-auto pr-1 space-y-3 flex-1 min-h-0 text-left">
              {WHATS_NEW_UPGRADES.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-emerald-400 px-0.5">
                    <Zap className="w-3 h-3 shrink-0" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Upgrades / New Features</span>
                  </div>
                  <div className="space-y-1.5">
                    {WHATS_NEW_UPGRADES.map(item => (
                      <div key={item.title} className="pl-2">
                        <h3 className="text-[11px] font-bold text-emerald-400 leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-[10px] text-emerald-300/70 leading-relaxed mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {WHATS_NEW_FIXES.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center gap-1 text-amber-400 px-0.5">
                    <Wrench className="w-3 h-3 shrink-0" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Fixes & Refinements</span>
                  </div>
                  <div className="space-y-1.5">
                    {WHATS_NEW_FIXES.map(item => (
                      <div key={item.title} className="pl-2">
                        <h3 className="text-[11px] font-bold text-amber-400 leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-[10px] text-amber-300/70 leading-relaxed mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Button */}
            <button
              onClick={handleClose}
              className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded-2xl shadow-md hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              Got It • Continue Using App
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default WhatsNewPopup;