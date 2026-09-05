import React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Heart, Stethoscope, Syringe, Calendar, Hospital } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/',          label: 'Home',      description: 'Classes and attendance by date', Icon: Heart },
  { path: '/subjects',  label: 'Subjects',  description: 'Progress, targets, and subject groups', Icon: Stethoscope },
  { path: '/add-new',   label: 'Manage',    description: 'Build your academic and clinical routine', Icon: Syringe },
  { path: '/calendar',  label: 'Timetable', description: 'Weekly routine, rotations, and statistics', Icon: Calendar },
  { path: '/account',   label: 'Settings',  description: 'Preferences, backups, and app settings', Icon: Hospital },
] as const;

export const Layout = ({ children, headerRight, headerBottom, mainClassName, contentClassName, bottomNavClassName }: { children: React.ReactNode; headerRight?: React.ReactNode; headerBottom?: React.ReactNode; mainClassName?: string; contentClassName?: string; bottomNavClassName?: string }) => {
  const [location, setLocation] = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const navTouchStartX = useRef<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(72);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const updateHeaderHeight = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const currentItem = NAV_ITEMS.find((item) => item.path === location) || NAV_ITEMS[0];
  const currentNavIndex = NAV_ITEMS.findIndex((item) => item.path === location);
  const changeBySwipe = (direction: number) => {
    const nextIndex = Math.max(0, Math.min(NAV_ITEMS.length - 1, currentNavIndex + direction));
    if (nextIndex !== currentNavIndex) setLocation(NAV_ITEMS[nextIndex].path);
  };

  return (
    <div
      className="app-shell min-h-[100dvh] pb-0 bg-background flex flex-col text-foreground transition-colors duration-300"
      style={{ '--app-header-height': `${headerHeight}px`, '--app-bottom-nav-height': '4.5rem', '--app-bottom-nav-offset': '0px' } as React.CSSProperties}
    >
      <header ref={headerRef} className="fixed inset-x-0 top-0 z-50 border-b border-black/20 dark:border-white/20 bg-card rounded-b-[28px] shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <div className="max-w-3xl mx-auto w-full px-4 pt-[env(safe-area-inset-top)] py-3">
          <div className="flex items-center justify-between gap-3 min-h-[4.5rem]">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground truncate">{currentItem.label}</h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">{currentItem.description}</p>
            </div>
            {headerRight}
          </div>
          {headerBottom}
        </div>
      </header>

      <main className={cn('flex-1 max-w-3xl mx-auto w-full px-4', mainClassName)} style={{ paddingTop: 'calc(var(--app-header-height) + 0.5rem)', paddingBottom: 'calc(var(--app-bottom-nav-height) + env(safe-area-inset-bottom))' }}>
        <div key={location} className={contentClassName}>
          {children}
        </div>
      </main>

      <motion.div
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className={cn(
          'fixed inset-x-0 bottom-0 w-full shrink-0',
          'bottom-nav-surface bg-card border-x-0 border-b-0 border-t border-black/20 dark:border-white/20 rounded-t-[28px] rounded-b-none pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] px-3 shadow-[0_-16px_40px_rgba(0,0,0,0.25)] z-[60] will-change-transform',
          'transition-all duration-300', bottomNavClassName
        )}
      >
        <nav aria-label="Primary navigation" className="flex justify-around items-center h-14" onTouchStart={e => { navTouchStartX.current = e.changedTouches[0]?.clientX ?? null; }} onTouchEnd={e => { const start = navTouchStartX.current; navTouchStartX.current = null; const end = e.changedTouches[0]?.clientX; if (start !== null && end !== undefined && Math.abs(end - start) >= 48) changeBySwipe(end < start ? -1 : 1); }}>
          {NAV_ITEMS.map(({ path, label, Icon }) => {
            const active = location === path;
            return (
              <button type="button" key={path} onClick={() => setLocation(path)} className={cn(
                'flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-all duration-300 relative rounded-2xl active:scale-90',
                active ? 'text-primary filter drop-shadow-[0_0_8px_rgba(10,132,255,0.4)]' : 'text-muted-foreground/60 hover:text-foreground'
              )}>
                {active && <motion.span layoutId="selected-tab-indicator" className="absolute inset-0 -z-10 rounded-2xl bg-primary/10" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                <Icon className={cn('w-6 h-6 transition-transform duration-300', active ? 'scale-110' : 'scale-100')} strokeWidth={active ? 2.5 : 2} />
                <span className={cn('text-[10px] font-medium tracking-wide transition-all duration-300', active ? 'font-bold text-primary' : 'text-muted-foreground/60')}>{label}</span>
              </button>
            );
          })}
        </nav>
      </motion.div>
    </div>
  );
};
