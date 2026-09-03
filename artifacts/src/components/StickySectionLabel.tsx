import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface StickySectionLabelProps {
  label: string;
  icon?: React.ReactNode;
  offsetClass?: string;
  /** Kept for call-site compatibility; all labels now share one sticky slot. */
  stackIndex?: number;
  /** Kept for call-site compatibility; all labels now share one stacking level. */
  zClass?: string;
  className?: string;
}

const STICKY_LABEL_SELECTOR = '[data-sticky-section-label="true"]';

function findScrollParent(element: HTMLElement): HTMLElement | Window {
  let parent = element.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return window;
}

function getScrollPosition(scrollParent: HTMLElement | Window): number {
  return scrollParent instanceof HTMLElement ? scrollParent.scrollTop : window.scrollY;
}

function getScrollportTop(scrollParent: HTMLElement | Window): number {
  return scrollParent instanceof HTMLElement ? scrollParent.getBoundingClientRect().top : 0;
}

function getStickyTop(element: HTMLElement): number {
  const computedTop = Number.parseFloat(window.getComputedStyle(element).top);
  return Number.isFinite(computedTop) ? computedTop : 0;
}

function getActiveLabel(scrollParent: HTMLElement | Window, currentScroll: number): HTMLElement | null {
  const labels = Array.from(document.querySelectorAll<HTMLElement>(STICKY_LABEL_SELECTOR))
    .filter(label => findScrollParent(label) === scrollParent);

  let active: HTMLElement | null = null;
  for (const label of labels) {
    const threshold = Number.parseFloat(label.dataset.stickyThreshold || '');
    if (Number.isFinite(threshold) && currentScroll > threshold + 1) {
      active = label;
    }
  }
  return active;
}

export function StickySectionLabel({
  label,
  icon,
  offsetClass = 'top-[calc(var(--app-header-height)+0.5rem)]',
  className,
}: StickySectionLabelProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const labelEl = labelRef.current;
    if (!labelEl) return;

    const scrollParent = findScrollParent(labelEl);
    const offsetTokens = offsetClass.split(/\s+/).filter(Boolean);
    const measureThreshold = () => {
      // Measure the label in normal flow. A previously sticky label otherwise
      // reports the shared sticky-slot position and causes early release when
      // another section expands or collapses above it.
      const wasStuck = labelEl.classList.contains('sticky');
      if (wasStuck) labelEl.classList.remove('sticky', ...offsetTokens);
      const currentScroll = getScrollPosition(scrollParent);
      const rectTop = labelEl.getBoundingClientRect().top;
      const scrollportTop = getScrollportTop(scrollParent);
      labelEl.classList.add('sticky', ...offsetTokens);
      const stickyTop = getStickyTop(labelEl);
      if (!wasStuck) labelEl.classList.remove('sticky', ...offsetTokens);
      labelEl.dataset.stickyThreshold = String(currentScroll + rectTop - (scrollportTop + stickyTop));
    };

    let frame: number | null = null;
    const checkPosition = () => {
      frame = null;
      measureThreshold();
      const currentScroll = getScrollPosition(scrollParent);
      const activeLabel = getActiveLabel(scrollParent, currentScroll);
      setIsStuck(activeLabel === labelEl);
    };
    const scheduleCheck = () => {
      if (frame === null) frame = window.requestAnimationFrame(checkPosition);
    };

    checkPosition();
    scrollParent.addEventListener('scroll', scheduleCheck, { passive: true });
    if (scrollParent !== window) window.addEventListener('scroll', scheduleCheck, { passive: true });
    window.addEventListener('resize', scheduleCheck);
    return () => {
      scrollParent.removeEventListener('scroll', scheduleCheck);
      if (scrollParent !== window) window.removeEventListener('scroll', scheduleCheck);
      window.removeEventListener('resize', scheduleCheck);
      delete labelEl.dataset.stickyThreshold;
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [offsetClass]);

  return (
    <div
      ref={labelRef}
      data-sticky-section-label="true"
      className={cn(
        'relative top-auto -mx-4 h-8 flex items-center gap-2.5 px-6 py-0 text-left text-xs font-extrabold uppercase tracking-[0.18em] text-primary transition-colors duration-200',
        isStuck && cn('sticky z-40', offsetClass),
        isStuck
          ? 'bg-background border-y border-border/70 shadow-sm isolate before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:h-4 before:bg-background'
          : 'bg-transparent border-transparent shadow-none before:hidden',
        className,
      )}
    >
      {icon}
      <h2 className="shrink-0">{label}</h2>
    </div>
  );
}
