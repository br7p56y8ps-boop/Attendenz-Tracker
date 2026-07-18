import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_VERSION, FEATURES_UPDATED } from '@/lib/appVersion';
import { useCustomData } from '@/contexts/CustomDataContext';
import { X } from 'lucide-react';

const WHATS_NEW_KEY = 'att_whats_new_version';

export const WhatsNewPopup = () => {
  const { whatsNewOpen, setWhatsNewOpen } = useCustomData();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(WHATS_NEW_KEY);
    if (stored !== APP_VERSION) {
      setVisible(true);
    }
  }, []);

  const isOpen = visible || whatsNewOpen;

  const dismiss = () => {
    localStorage.setItem(WHATS_NEW_KEY, APP_VERSION);
    setVisible(false);
    setWhatsNewOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-card border border-border rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-white/5 border-b border-white/5 px-6 pt-6 pb-5 relative">
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/25 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-md overflow-hidden border border-white/10">
                  <img src="/Logo.jpeg" className="w-full h-full object-cover" alt="" />
                </div>
                <span className="text-white/50 text-xs font-semibold uppercase tracking-widest">v{APP_VERSION}</span>
              </div>
              <h2 className="text-white text-2xl font-bold leading-tight">
                🎉 What's New in<br />Attendenz
              </h2>
            </div>

            {/* Feature list */}
            <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
              {FEATURES_UPDATED.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex items-start gap-3"
                >
                  <span className="text-2xl shrink-0">{f.emoji}</span>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{f.title}</p>
                    <p className="text-muted-foreground text-xs mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-5 pb-5 pt-2">
              <button
                onClick={dismiss}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Got it 🚀
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

