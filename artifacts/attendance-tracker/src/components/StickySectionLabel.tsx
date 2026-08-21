import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface StickySectionLabelProps {
  label: string;
  icon?: React.ReactNode;
  offsetClass?: string;
  zClass?: string;
  className?: string;
}

export function StickySectionLabel({
  label,
  icon,
  offsetClass = 'top-[var(--app-header-height)]',
  zClass = 'z-30',
  className,
}: StickySectionLabelProps) {
  const labelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const labelEl = labelRef.current;
    if (!labelEl) return;

    let frame: number | null = null;
    const checkPosition = () => {
      frame = null;
      const computedTop = Number.parseFloat(window.getComputedStyle(labelEl).top);
      const stickyTop = Number.isFinite(computedTop) ? computedTop : 0;
      setIsStuck(labelEl.getBoundingClientRect().top <= stickyTop + 1);
    };
    const scheduleCheck = () => {
      if (frame === null) frame = window.requestAnimationFrame(checkPosition);
    };

    checkPosition();
    window.addEventListener('scroll', scheduleCheck, { passive: true });
    window.addEventListener('resize', scheduleCheck);
    return () => {
      window.removeEventListener('scroll', scheduleCheck);
      window.removeEventListener('resize', scheduleCheck);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={labelRef}
      className={cn(
        'sticky -mx-4 h-8 flex items-center gap-2.5 px-6 py-0 text-left text-xs font-extrabold uppercase tracking-[0.18em] text-primary transition-colors duration-200 border-0',
        offsetClass,
        zClass,
        isStuck ? 'bg-background shadow-sm soft-entry-boundary isolate' : 'bg-transparent shadow-none',
        className,
      )}
    >
      {icon}
      <h2 className="shrink-0">{label}</h2>
    </div>
  );
}
