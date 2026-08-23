import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomData } from '@/contexts/CustomDataContext';
import { Wrench, Zap, ChevronDown } from 'lucide-react';
import { APP_VERSION, WHATS_NEW_UPGRADES, WHATS_NEW_FIXES } from '@/lib/appVersion';
import type { WhatsNewItem } from '@/lib/appVersion';
import { lockScroll, unlockScroll } from '@/lib/scrollLock';

interface ReleaseItemProps {
  item: WhatsNewItem;
  titleClass: string;
  accentClass: string;
}

function ReleaseItem({ item, titleClass, accentClass }: ReleaseItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl bg-background/35 transition-colors">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left cursor-pointer rounded-2xl hover:bg-muted/20 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className={`block text-[11px] font-extrabold leading-snug ${titleClass}`}>{item.title}</span>
          <span className="block mt-0.5 text-[10px] leading-snug text-muted-foreground">{item.summary}</span>
        </span>
        <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className={`px-3 pb-2.5 text-[10px] leading-relaxed ${accentClass}`}>
              {item.details}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ReleaseSectionProps {
  title: string;
  icon: React.ReactNode;
  items: WhatsNewItem[];
  titleClass: string;
  accentClass: string;
}

function ReleaseSection({ title, icon, items, titleClass, accentClass }: ReleaseSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <div className={`flex items-center gap-1.5 px-1 ${titleClass}`}>
        {icon}
        <span className="text-[10px] font-extrabold uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-1">
        {items.map(item => (
          <ReleaseItem key={item.title} item={item} titleClass={titleClass} accentClass={accentClass} />
        ))}
      </div>
    </section>
  );
}

export function WhatsNewPopup() {
  const { whatsNewOpen, setWhatsNewOpen } = useCustomData();

  useEffect(() => {
    if (whatsNewOpen) {
      lockScroll();
      return () => unlockScroll();
    }
    return undefined;
  }, [whatsNewOpen]);

  const handleClose = () => {
    setWhatsNewOpen(false);
  };

  return (
    <AnimatePresence>
      {whatsNewOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-3 backdrop-blur-md sm:p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            className="modal-sheet-content flex h-[min(78dvh,42rem)] max-h-[min(78dvh,42rem)] min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-3xl"
          >
            {/* Fixed header */}
            <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-background/40">
                  <img
                    src={`${import.meta.env.BASE_URL || '/'}Logo.jpeg`}
                    alt="Attendenz Logo"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="text-left">
                  <h2 id="whats-new-title" className="text-sm font-extrabold leading-tight text-foreground">What's New</h2>
                  <span className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                    v{APP_VERSION} (Stable)
                  </span>
                </div>
              </div>
            </div>

            {/* Soft top and bottom boundaries surround the only scrolling region. */}
            <div className="relative min-h-0 flex-1 basis-0">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-card/90 via-card/45 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-card/90 via-card/45 to-transparent" />
              <div className="h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 py-2.5 pb-5 text-left [scrollbar-width:thin]" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="space-y-4">
                  <ReleaseSection
                    title="Upgrades / New Features"
                    icon={<Zap className="h-3.5 w-3.5 shrink-0" />}
                    items={WHATS_NEW_UPGRADES}
                    titleClass="text-emerald-500"
                    accentClass="text-muted-foreground"
                  />
                  <ReleaseSection
                    title="Fixes & Refinements"
                    icon={<Wrench className="h-3.5 w-3.5 shrink-0" />}
                    items={WHATS_NEW_FIXES}
                    titleClass="text-amber-500"
                    accentClass="text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Fixed compact footer action */}
            <div className="relative z-20 flex shrink-0 justify-center px-4 pb-4 pt-4">
              <button
                type="button"
                onClick={handleClose}
                onPointerDown={(event) => event.stopPropagation()}
                className="action-button action-button--save w-full"
              >
                Got It
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default WhatsNewPopup;
