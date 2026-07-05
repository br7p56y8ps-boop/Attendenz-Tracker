import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Home, BookOpen, PlusCircle, CalendarDays, UserCircle } from 'lucide-react';
import { motion, useScroll } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/',          label: 'Home',     Icon: Home },
  { path: '/subjects',  label: 'Subjects', Icon: BookOpen },
  { path: '/add-new',   label: 'Add New',  Icon: PlusCircle },
  { path: '/calendar',  label: 'Calendar', Icon: CalendarDays },
  { path: '/account',   label: 'Account',  Icon: UserCircle },
] as const;

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const [location, setLocation] = useLocation();
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    return scrollY.onChange((latest) => {
      setIsScrolled(latest > 20);
    });
  }, [scrollY]);

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8 pt-safe bg-background flex flex-col">
      {/* Header */}
      <motion.div
        className={cn(
          "sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b transition-all duration-300",
          isScrolled ? "border-border shadow-sm py-3" : "border-transparent py-6"
        )}
      >
        <div className="max-w-3xl mx-auto px-4 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <motion.div layout className="flex flex-col">
            <motion.h1
              layout
              className={cn(
                "font-bold tracking-tight text-foreground transition-all duration-300 origin-left",
                isScrolled ? "text-xl" : "text-3xl"
              )}
            >
              Attendance Tracker
            </motion.h1>
            {!isScrolled && (
              <motion.span
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-muted-foreground text-sm italic mt-1"
              >
                By – benzavraar
              </motion.span>
            )}
          </motion.div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex bg-muted/50 p-1 rounded-xl gap-0.5">
            {NAV_ITEMS.map(({ path, label }) => (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  location === path
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 pt-6">
        {children}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border pb-safe z-50">
        <div className="flex justify-around items-center h-16">
          {NAV_ITEMS.map(({ path, label, Icon }) => {
            const active = location === path;
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full space-y-0.5 transition-colors relative",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[9px] font-semibold tracking-wide">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
