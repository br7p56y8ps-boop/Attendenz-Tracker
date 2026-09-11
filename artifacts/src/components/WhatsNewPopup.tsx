import React from "react";
import { useCustomData } from "@/contexts/CustomDataContext";
import { Wrench, Zap } from "lucide-react";
import { APP_VERSION, getReleaseNotes } from "@/lib/appVersion";
import type { WhatsNewItem } from "@/lib/appVersion";
import { ModalSheet } from "@/components/ui/modal-sheet";

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

function ReleaseSection({ title, icon, items, titleClass, accentClass }: ReleaseSectionProps) {
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

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0);
  }
  return 0;
}

export function WhatsNewPopup() {
  const { whatsNewOpen, setWhatsNewOpen } = useCustomData();
  const availableVersion = typeof window !== 'undefined' ? localStorage.getItem('att_pwa_latest_version') || '' : '';
  const notesVersion = compareVersions(availableVersion, APP_VERSION) > 0 ? availableVersion : APP_VERSION;
  const notes = getReleaseNotes(notesVersion);

  const handleClose = () => { setWhatsNewOpen(false); };
  const header = (
    <div className="flex items-center justify-center gap-2.5 px-4 pb-3 pt-1 text-center">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
        <img
          src={`${import.meta.env.BASE_URL || "/"}Logo.jpeg`}
          alt="Attendenz Logo"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="text-center">
        <h2 id="whats-new-title" className="text-sm font-extrabold leading-tight text-foreground">
          What's New
        </h2>
        <span className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold tracking-wider text-emerald-500">
          Version {notesVersion}
        </span>
      </div>
    </div>
  );

  const footer = (
    <button
      type="button"
      onClick={handleClose}
      onPointerDown={(event) => event.stopPropagation()}
      className="action-button action-button--save"
    >
      Got It
    </button>
  );

  return (
    <ModalSheet
      open={whatsNewOpen}
      onClose={handleClose}
      ariaLabel="What's New"
      labelledBy="whats-new-title"
      maxWidth="max-w-sm"
      zIndexClassName="z-[9999]"
      header={header}
      footer={footer}
      bodyClassName="max-h-[min(78dvh,42rem)] px-4 py-3 pb-5 text-left [scrollbar-width:thin]"
    >
      <div className="space-y-4">
        <ReleaseSection
          title="Upgrades / New Features"
          icon={<Zap className="h-3.5 w-3.5 shrink-0" />}
          items={notes.upgrades}
          titleClass="text-emerald-500"
          accentClass="text-muted-foreground"
        />
        <ReleaseSection
          title="Fixes & Refinements"
          icon={<Wrench className="h-3.5 w-3.5 shrink-0" />}
          items={notes.fixes}
          titleClass="text-amber-500"
          accentClass="text-muted-foreground"
        />
      </div>
    </ModalSheet>
  );
}

export default WhatsNewPopup;
