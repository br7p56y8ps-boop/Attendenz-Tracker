import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Home, BookOpen } from 'lucide-react';
import { motion, useScroll } from 'framer-motion';

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
      {/* Header Container */}
      <motion.div 
        className={cn(
          "sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b transition-all duration-300",
          isScrolled ? "border-border shadow-sm py-3" : "border-transparent py-6"
        )}
      >
        <div className="max-w-3xl mx-auto px-4 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <motion.div 
            layout 
            className="flex flex-col"
          >
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
          <div className="hidden md:flex bg-muted/50 p-1 rounded-xl">
            <button 
              onClick={() => setLocation('/')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                location === '/' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Home
            </button>
            <button 
              onClick={() => setLocation('/subjects')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                location === '/subjects' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Subjects
            </button>
          </div>
        </div>
      </motion.div>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 pt-6">
        {children}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border pb-safe z-50">
        <div className="flex justify-around items-center h-16">
          <button 
            onClick={() => setLocation('/')}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
              location === '/' ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Home className="w-6 h-6" strokeWidth={location === '/' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          <button 
            onClick={() => setLocation('/subjects')}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
              location === '/subjects' ? "text-primary" : "text-muted-foreground"
            )}
          >
            <BookOpen className="w-6 h-6" strokeWidth={location === '/subjects' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Subjects</span>
          </button>
        </div>
      </div>
    </div>
  );
};
