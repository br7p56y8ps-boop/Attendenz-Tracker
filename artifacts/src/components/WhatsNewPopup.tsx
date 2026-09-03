import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCustomData } from "@/contexts/CustomDataContext";
import { Wrench, Zap } from "lucide-react";
import {
  WHATS_NEW_UPGRADES,
  WHATS_NEW_FIXES,
} from "@/lib/appVersion";
import type { WhatsNewItem } from "@/lib/appVersion";
import { useModalAccessibility } from "@/components/ui/dialog";

interface ReleaseItemProps {
  item: WhatsNewItem;
  titleClass: string;
  accentClass: string;
}

function ReleaseItem({ item, titleClass, accentClass }: ReleaseItemProps) {
  return (
    <div className="space-y-0.5 text-left">
      <h4 className={`text-[11px] font-extrabold leading-snug ${titleClass}`}>
        {item.title}
      </h4>
      <p className={`text-[10px] leading-relaxed ${accentClass}`}>
        {item.summary}
      </p>
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

function ReleaseSection({
  title,
  icon,
  items,
  titleClass,
  accentClass,
}: ReleaseSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <h3 className={`flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider ${titleClass}`}>
        {icon}
        <span>{title}</span>
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <ReleaseItem
            key={item.title}
            item={item}
            titleClass={titleClass}
            accentClass={accentClass}
          />
        ))}
      </div>
    </section>
  );
}

export function WhatsNewPopup() {
  const { whatsNewOpen, setWhatsNewOpen } = useCustomData();

  const handleClose = () => { setWhatsNewOpen(false); };
  const modalRef = useModalAccessibility(whatsNewOpen, handleClose);

  return (
    <AnimatePresence>
      {whatsNewOpen && (
        <div
          ref={modalRef}
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-3 backdrop-blur-md sm:p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            tabIndex={-1}
            className="modal-sheet-content flex h-auto max-h-[min(78dvh,42rem)] min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-[0_24px_80px_rgba(0,0,0,0.24)] dark:bg-card/90 dark:shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
          >
            {/* Fixed header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-card px-4 pb-3 pt-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
                  <img
                    src={`${import.meta.env.BASE_URL || "/"}Logo.jpeg`}
                    alt="Attendenz Logo"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="text-left">
                  <h2
                    id="whats-new-title"
                    className="text-sm font-extrabold leading-tight text-foreground"
                  >
                    What's New
                  </h2>
                  <span className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                    Pre-release version for v1.6.5
                  </span>
                </div>
              </div>
            </div>

            {/* Soft top and bottom boundaries surround the only scrolling region. */}
            <div className="relative min-h-0 max-h-[calc(78dvh-9rem)] overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-card via-card/80 to-transparent dark:from-card/95 dark:via-card/55" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-card via-card/80 to-transparent dark:from-card/95 dark:via-card/55" />
              <div
                className="max-h-[calc(78dvh-9rem)] overflow-y-auto overscroll-contain touch-pan-y px-4 py-3 pb-5 text-left [scrollbar-width:thin]"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
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
            <div className="relative z-20 flex shrink-0 justify-center border-t border-border/50 bg-card px-4 pb-4 pt-3">
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
