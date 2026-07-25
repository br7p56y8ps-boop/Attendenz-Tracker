import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Heart, Stethoscope, Syringe, Calendar, Hospital } from 'lucide-react';
import { motion, useScroll } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/',          label: 'Home',     Icon: Heart },
  { path: '/subjects',  label: 'Subjects', Icon: Stethoscope },
  { path: '/add-new',   label: 'Add New',  Icon: Syringe },
  { path: '/calendar',  label: 'Calendar', Icon: Calendar },
  { path: '/account',   label: 'Account',  Icon: Hospital },
] as const;

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const [location, setLocation] = useLocation();
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    return scrollY.onChange((latest) => {
      const diff = latest - lastScrollY.current;
      if (latest < 40) {
        setVisible(true);
      } else if (diff > 8) {
        setVisible(false); // scrolling down
      } else if (diff < -8) {
        setVisible(true); // scrolling up
      }
      lastScrollY.current = latest;
    });
  }, [scrollY]);

  const currentItem = NAV_ITEMS.find((item) => item.path === location);
  const activeTabLabel = currentItem ? currentItem.label : 'Home';

  return (
    <div className="min-h-[100dvh] pb-32 pt-safe bg-background flex flex-col text-foreground transition-all duration-300">
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 pt-8 md:pt-12">
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            {activeTabLabel}
          </h1>
        </div>
        {children}
      </main>

      {/* Floating Glass Bottom Tab Bar */}
      <motion.div
        animate={{ y: visible ? 0 : 120, opacity: visible ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className={cn(
          "fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-full md:max-w-md",
          "bg-card/45 backdrop-blur-2xl border border-white/10 rounded-[28px] py-2 px-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] z-40",
          "transition-all duration-300"
        )}
      >
        <div className="flex justify-around items-center h-14">
          {NAV_ITEMS.map(({ path, label, Icon }) => {
            const active = location === path;
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-all duration-300 relative rounded-2xl active:scale-90",
                  active ? "text-primary filter drop-shadow-[0_0_8px_rgba(10,132,255,0.4)]" : "text-muted-foreground/60 hover:text-foreground"
                )}
              >
                <Icon className={cn("w-6 h-6 transition-transform duration-300", active ? "scale-110" : "scale-100")} strokeWidth={active ? 2.5 : 2} />
                <span className={cn("text-[10px] font-medium tracking-wide transition-all duration-300", active ? "font-bold text-primary" : "text-muted-foreground/60")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
