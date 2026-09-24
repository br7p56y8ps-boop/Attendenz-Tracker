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
const PLACEHOLDER_ATTRIBUTE = 'data-sticky-section-placeholder';

function findScrollParent(element: HTMLElement): HTMLElement | Window {
  const main = element.closest('main');
  if (main) return main;
  let parent = element.parentElement;
  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return parent;
    parent = parent.parentElement;
  }
  return window;
}

function getLabels(scrollParent: HTMLElement | Window): HTMLElement[] {
  const labels = scrollParent instanceof HTMLElement
    ? Array.from(scrollParent.querySelectorAll<HTMLElement>(STICKY_LABEL_SELECTOR))
    : Array.from(document.querySelectorAll<HTMLElement>(STICKY_LABEL_SELECTOR));
  return labels.filter(label => findScrollParent(label) === scrollParent);
}

function getPinTop(scrollParent: HTMLElement | Window): number {
  const source = scrollParent instanceof HTMLElement ? scrollParent : document.documentElement;
  const styles = window.getComputedStyle(source);
  const headerHeight = Number.parseFloat(styles.getPropertyValue('--app-header-height')) || 0;
  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  return headerHeight + rootFontSize * 0.5;
}

function getPlaceholder(label: HTMLElement): HTMLElement {
  const existing = label.previousElementSibling;
  if (existing instanceof HTMLElement && existing.hasAttribute(PLACEHOLDER_ATTRIBUTE)) return existing;
  const placeholder = document.createElement('div');
  placeholder.setAttribute(PLACEHOLDER_ATTRIBUTE, 'true');
  placeholder.style.display = 'none';
  placeholder.setAttribute('aria-hidden', 'true');
  label.parentElement?.insertBefore(placeholder, label);
  return placeholder;
}

function resetLabel(label: HTMLElement): void {
  label.style.position = '';
  label.style.top = '';
  label.style.left = '';
  label.style.width = '';
  label.style.zIndex = '';
  label.style.marginLeft = '';
  label.style.marginRight = '';
  const placeholder = getPlaceholder(label);
  placeholder.style.display = 'none';
  placeholder.style.height = '';
}

function clearLabels(labels: HTMLElement[]): void {
  labels.forEach(resetLabel);
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
    let frame: number | null = null;

    const checkPosition = () => {
      frame = null;
      const labels = getLabels(scrollParent);
      clearLabels(labels);
      const scrollportRect = scrollParent instanceof HTMLElement
        ? scrollParent.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      const pinTop = getPinTop(scrollParent);
      const pinY = scrollportRect.top + pinTop;
      const activeLabel = labels.reduce<HTMLElement | null>((active, candidate) => {
        const candidateTop = candidate.getBoundingClientRect().top;
        return candidateTop <= pinY + 1 ? candidate : active;
      }, null);

      if (activeLabel) {
        const rect = activeLabel.getBoundingClientRect();
        const placeholder = getPlaceholder(activeLabel);
        placeholder.style.display = 'block';
        placeholder.style.height = `${rect.height}px`;
        activeLabel.style.position = 'fixed';
        activeLabel.style.top = `${pinY}px`;
        activeLabel.style.left = `${rect.left}px`;
        activeLabel.style.width = `${rect.width}px`;
        activeLabel.style.marginLeft = '0';
        activeLabel.style.marginRight = '0';
        activeLabel.style.zIndex = '40';
      }
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
      resetLabel(labelEl);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [offsetClass]);

  return (
    <div
      ref={labelRef}
      data-sticky-section-label="true"
      className={cn(
        'relative top-auto -mx-4 h-8 flex items-center gap-2.5 px-6 py-0 text-left text-xs font-extrabold uppercase tracking-[0.18em] text-primary transition-colors duration-200',
        isStuck && 'z-40',
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
