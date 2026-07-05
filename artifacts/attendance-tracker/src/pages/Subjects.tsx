import React, { useState } from 'react';
import { CATEGORIES, WARD_SUBJECTS, INTEGRATED_SUBJECTS, getCurrentWard, getWardTotalPlanned } from '@/lib/constants';
import { SubjectCard } from '@/components/SubjectCard';
import { Layout } from '@/components/Layout';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Subjects() {
  const { subjects, wards } = useAttendance();
  const { customSubjects, customWards, getCurrentCustomWard } = useCustomData();

  const today = new Date();
  const customWard = getCurrentCustomWard();
  const builtInWard = getCurrentWard(today);
  const activeWard = customWard ? customWard.name : builtInWard;
  const isWardHoliday = activeWard === 'Holiday';

  // All sections collapsed by default
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catName: string) => {
    setOpenCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  const calculateCategorySummary = (subjectList: { name: string; total: number }[]) => {
    let totalAttended = 0, totalMissed = 0, totalPlanned = 0;
    subjectList.forEach(sub => {
      const data = subjects[sub.name] || { attended: 0, missed: 0 };
      totalAttended += data.attended;
      totalMissed += data.missed;
      totalPlanned += sub.total;
    });
    const totalConducted = totalAttended + totalMissed;
    const percentage = totalConducted === 0 ? 100 : (totalAttended / totalConducted) * 100;
    return { totalAttended, totalMissed, totalPlanned, percentage, totalConducted };
  };

  const calculateIntegratedSummary = () => {
    let totalAttended = 0, totalMissed = 0, totalPlanned = 0;
    INTEGRATED_SUBJECTS.forEach(sub => {
      const data = subjects[sub.name] || { attended: 0, missed: 0 };
      totalAttended += data.attended;
      totalMissed += data.missed;
      totalPlanned += sub.total;
    });
    const totalConducted = totalAttended + totalMissed;
    const percentage = totalConducted === 0 ? 100 : (totalAttended / totalConducted) * 100;
    return { totalAttended, totalMissed, totalPlanned, percentage, totalConducted };
  };

  type Summary = ReturnType<typeof calculateCategorySummary>;

  const SummaryAccordionHeader = ({
    title,
    sectionKey,
    summary,
    badge,
  }: { title: string; sectionKey: string; summary: Summary; badge?: React.ReactNode }) => {
    const isOpen = openCategories[sectionKey] || false;
    return (
      <button
        onClick={() => toggleCategory(sectionKey)}
        className="bg-card rounded-2xl p-4 shadow-sm border border-border w-full text-left transition-all active:scale-[0.98]"
      >
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            {badge}
          </div>
          {isOpen ? <ChevronUp className="text-muted-foreground w-5 h-5 shrink-0" /> : <ChevronDown className="text-muted-foreground w-5 h-5 shrink-0" />}
        </div>
        <div className="flex gap-4">
          <div>
            <div
              className="text-2xl font-bold"
              style={{
                color: summary.percentage >= 75
                  ? 'var(--color-success)'
                  : summary.percentage >= 65
                  ? 'var(--color-warning)'
                  : 'var(--color-destructive)',
              }}
            >
              {summary.totalConducted === 0 ? '--' : `${summary.percentage.toFixed(1)}%`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Overall</div>
          </div>
          <div className="w-px bg-border my-1" />
          <div className="flex-1 grid grid-cols-3 gap-2">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Attended</span>
              <span className="font-semibold text-sm">{summary.totalAttended}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Missed</span>
              <span className="font-semibold text-sm">{summary.totalMissed}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Planned</span>
              <span className="font-semibold text-sm">{summary.totalPlanned}</span>
            </div>
          </div>
        </div>
      </button>
    );
  };

  // Build custom allied categories
  const alliedSubjects = customSubjects.filter(s => s.subjectType === 'allied');
  const singleSubjects = customSubjects.filter(s => s.subjectType === 'single');

  // Group allied subjects by category
  const alliedCategories = alliedSubjects.reduce<Record<string, typeof alliedSubjects>>((acc, s) => {
    const cat = s.category || 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const integratedSummary = calculateIntegratedSummary();

  const AccordionBody = ({ children }: { children: React.ReactNode }) => (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div className="space-y-3 pt-1">{children}</div>
    </motion.div>
  );

  return (
    <Layout>
      <div className="space-y-6 pb-8">

        {/* ── Built-in Academic Categories ── */}
        {CATEGORIES.map((cat, idx) => {
          const summary = calculateCategorySummary(cat.subjects);
          const isOpen = openCategories[cat.name] || false;
          return (
            <div key={idx} className="flex flex-col gap-3">
              <SummaryAccordionHeader title={cat.name} sectionKey={cat.name} summary={summary} />
              <AnimatePresence initial={false}>
                {isOpen && (
                  <AccordionBody>
                    {cat.subjects.map(sub => (
                      <SubjectCard key={sub.name} subject={sub.name} totalPlanned={sub.total} />
                    ))}
                  </AccordionBody>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* ── Custom Allied Categories ── */}
        {Object.entries(alliedCategories).map(([catName, subs]) => {
          const subjectList = subs.map(s => ({ name: s.name, total: s.plannedClasses }));
          const summary = calculateCategorySummary(subjectList);
          const isOpen = openCategories[`allied_${catName}`] || false;
          return (
            <div key={catName} className="flex flex-col gap-3">
              <SummaryAccordionHeader
                title={catName}
                sectionKey={`allied_${catName}`}
                summary={summary}
                badge={
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Custom</span>
                }
              />
              <AnimatePresence initial={false}>
                {isOpen && (
                  <AccordionBody>
                    {subs.map(s => (
                      <SubjectCard key={s.id} subject={s.name} totalPlanned={s.plannedClasses} />
                    ))}
                  </AccordionBody>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* ── Custom Single Subjects ── */}
        {singleSubjects.length > 0 && (() => {
          const subjectList = singleSubjects.map(s => ({ name: s.name, total: s.plannedClasses }));
          const summary = calculateCategorySummary(subjectList);
          const isOpen = openCategories['custom_single'] || false;
          return (
            <div className="flex flex-col gap-3">
              <SummaryAccordionHeader
                title="My Subjects"
                sectionKey="custom_single"
                summary={summary}
                badge={
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Custom</span>
                }
              />
              <AnimatePresence initial={false}>
                {isOpen && (
                  <AccordionBody>
                    {singleSubjects.map(s => (
                      <SubjectCard key={s.id} subject={s.name} totalPlanned={s.plannedClasses} />
                    ))}
                  </AccordionBody>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* ── Ward Postings ── */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={() => toggleCategory('Ward Postings')}
            className="bg-card rounded-2xl p-4 shadow-sm border border-border w-full text-left transition-all active:scale-[0.98]"
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-bold text-foreground">Ward Postings</h2>
              {openCategories['Ward Postings'] ? <ChevronUp className="text-muted-foreground w-5 h-5" /> : <ChevronDown className="text-muted-foreground w-5 h-5" />}
            </div>
            <p className="text-sm text-primary font-medium">
              Current: {isWardHoliday ? 'Holiday' : (activeWard || 'Not scheduled')}
            </p>
          </button>

          <AnimatePresence initial={false}>
            {openCategories['Ward Postings'] && (
              <AccordionBody>
                {WARD_SUBJECTS.map(ward => (
                  <div key={ward.name} className="relative">
                    {activeWard === ward.name && (
                      <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-12 bg-primary rounded-full z-10" />
                    )}
                    <SubjectCard subject={ward.name} totalPlanned={getWardTotalPlanned(ward.name)} isWard={true} />
                  </div>
                ))}

                {/* Custom wards */}
                {customWards.map(w => (
                  <div key={w.id} className="relative">
                    {activeWard === w.name && (
                      <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-12 bg-primary rounded-full z-10" />
                    )}
                    <SubjectCard subject={w.name} totalPlanned={0} isWard={true} />
                  </div>
                ))}
              </AccordionBody>
            )}
          </AnimatePresence>
        </div>

        {/* ── Integrated Teaching ── */}
        <div className="flex flex-col gap-3 pt-2">
          <SummaryAccordionHeader
            title="Integrated Teaching"
            sectionKey="Integrated Teaching"
            summary={integratedSummary}
            badge={
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Separate</span>
            }
          />
          <AnimatePresence initial={false}>
            {openCategories['Integrated Teaching'] && (
              <AccordionBody>
                {INTEGRATED_SUBJECTS.map(sub => (
                  <SubjectCard key={sub.name} subject={sub.name} totalPlanned={sub.total} />
                ))}
              </AccordionBody>
            )}
          </AnimatePresence>
        </div>

      </div>
    </Layout>
  );
}
