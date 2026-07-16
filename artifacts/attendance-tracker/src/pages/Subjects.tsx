import React, { useState } from 'react';
import { CATEGORIES, WARD_SUBJECTS, INTEGRATED_SUBJECTS } from '@/lib/constants';
import { SubjectCard } from '@/components/SubjectCard';
import { Layout } from '@/components/Layout';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

function getCustomWardTotalPlanned(startDateStr: string, endDateStr: string): number {
  let count = 0;
  try {
    const start = new Date(startDateStr + 'T12:00:00');
    const end   = new Date(endDateStr + 'T12:00:00');
    const cur   = new Date(start);
    while (cur <= end) {
      if (cur.getDay() !== 5) count++; // exclude Friday
      cur.setDate(cur.getDate() + 1);
    }
  } catch (e) {
    // catch invalid dates
  }
  return count * 2;
}

export default function Subjects() {
  const { subjects, wards, preferredPercentage } = useAttendance();
  const { customSubjects, customWards, getCurrentCustomWard, subjectMode, getSubjectPlannedTotal, getCurrentPresetWard, getPresetWardTotalPlanned } = useCustomData();
  const [, setLocation] = useLocation();

  const today = new Date();
  const customWard = getCurrentCustomWard();
  const presetWardObj = subjectMode === 'preloaded' ? getCurrentPresetWard(today) : null;
  const activeWard = customWard ? customWard.name : (presetWardObj ? presetWardObj.ward : null);
  const isWardHoliday = activeWard === 'Holiday';

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catName: string) => {
    setOpenCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  const calcSummary = (subjectList: { name: string; total: number }[]) => {
    let att = 0, mis = 0, planned = 0;
    subjectList.forEach(sub => {
      const d = subjects[sub.name] || { attended: 0, missed: 0 };
      att += d.attended; mis += d.missed;
      planned += getSubjectPlannedTotal(sub.name);
    });
    const conducted = att + mis;
    const pct = conducted === 0 ? 100 : (att / conducted) * 100;
    return { att, mis, planned, pct, conducted };
  };

  const calcIntegratedSummary = () => {
    let att = 0, mis = 0, planned = 0;
    INTEGRATED_SUBJECTS.forEach(sub => {
      const d = subjects[sub.name] || { attended: 0, missed: 0 };
      att += d.attended; mis += d.missed;
      planned += getSubjectPlannedTotal(sub.name);
    });
    const conducted = att + mis;
    const pct = conducted === 0 ? 100 : (att / conducted) * 100;
    return { att, mis, planned, pct, conducted };
  };

  const pctColor = (pct: number) =>
    pct >= preferredPercentage ? 'var(--color-success)' : pct >= preferredPercentage - 10 ? 'var(--color-warning)' : 'var(--color-destructive)';

  // ── Single unified expandable card for a category ──────────────────────
  const CategoryCard = ({
    title,
    sectionKey,
    subjectList,
    badge,
    renderChildren,
  }: {
    title: string;
    sectionKey: string;
    subjectList: { name: string; total: number }[];
    badge?: React.ReactNode;
    renderChildren: () => React.ReactNode;
  }) => {
    const isOpen = openCategories[sectionKey] || false;
    const summary = calcSummary(subjectList);

    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        {/* Clickable header */}
        <button
          onClick={() => toggleCategory(sectionKey)}
          className="w-full p-4 text-left transition-all active:scale-[0.99]"
        >
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{title}</h2>
              {badge}
            </div>
            {isOpen
              ? <ChevronUp className="text-muted-foreground w-5 h-5 shrink-0 ml-2" />
              : <ChevronDown className="text-muted-foreground w-5 h-5 shrink-0 ml-2" />}
          </div>
          <div className="flex gap-4">
            <div>
              <div className="text-2xl font-bold" style={{ color: pctColor(summary.pct) }}>
                {summary.conducted === 0 ? '--' : `${summary.pct.toFixed(1)}%`}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Overall</div>
            </div>
            <div className="w-px bg-border my-1" />
            <div className="flex-1 grid grid-cols-3 gap-2">
              {[
                { label: 'Attended', val: summary.att },
                { label: 'Missed', val: summary.mis },
                { label: 'Planned', val: summary.planned },
              ].map(({ label, val }) => (
                <div key={label} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-semibold text-sm">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </button>

        {/* Children — inside the same card, separated by dividers */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              {renderChildren()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // ── Simple accordion for non-category sections (Wards, Integrated) ──────
  const SimpleAccordion = ({
    sectionKey,
    header,
    children,
  }: {
    sectionKey: string;
    header: React.ReactNode;
    children: React.ReactNode;
  }) => {
    const isOpen = openCategories[sectionKey] || false;
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => toggleCategory(sectionKey)}
          className="bg-card rounded-2xl p-4 shadow-sm border border-border w-full text-left transition-all active:scale-[0.98]"
        >
          {header}
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-1">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Allied subjects grouped by category
  const alliedSubjects = customSubjects.filter(s => s.subjectType === 'allied');
  const singleSubjects = customSubjects.filter(s => s.subjectType === 'single');
  const alliedCategories = alliedSubjects.reduce<Record<string, typeof alliedSubjects>>((acc, s) => {
    const cat = s.category || 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const integratedSummary = calcIntegratedSummary();
  const hasAnything = subjectMode === 'preloaded' || customSubjects.length > 0 || customWards.length > 0;

  return (
    <Layout>
      <div className="space-y-4 pb-8">

        {/* Empty state for custom mode with no subjects */}
        {subjectMode === 'custom' && customSubjects.length === 0 && customWards.length === 0 && (
          <div className="bg-card rounded-2xl p-8 border border-border text-center shadow-sm mt-2">
            <p className="text-4xl mb-3">📋</p>
            <h3 className="text-lg font-semibold mb-2">No subjects yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Add your own subjects and ward rotations from the Add New tab.
            </p>
            <button
              onClick={() => setLocation('/add-new')}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all"
            >
              Go to Add New
            </button>
          </div>
        )}

        {/* ── Built-in Academic Categories (preloaded mode only) ── */}
        {subjectMode === 'preloaded' && CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.name}
            title={cat.name}
            sectionKey={cat.name}
            subjectList={cat.subjects}
            renderChildren={() => (
              <>
                {cat.subjects.map((sub, i) => (
                  <React.Fragment key={sub.name}>
                    <div className="border-t border-border" />
                    <SubjectCard subject={sub.name} totalPlanned={getSubjectPlannedTotal(sub.name)} isNested />
                  </React.Fragment>
                ))}
              </>
            )}
          />
        ))}

        {/* ── Custom Allied Categories ── */}
        {Object.entries(alliedCategories).map(([catName, subs]) => (
          <CategoryCard
            key={catName}
            title={catName}
            sectionKey={`allied_${catName}`}
            subjectList={subs.map(s => ({ name: s.name, total: s.plannedClasses }))}
            renderChildren={() => (
              <>
                {subs.map((s) => (
                  <React.Fragment key={s.id}>
                    <div className="border-t border-border" />
                    <SubjectCard subject={s.name} totalPlanned={s.plannedClasses} isNested />
                  </React.Fragment>
                ))}
              </>
            )}
          />
        ))}

        {/* ── Custom Single Subjects (Separate Independent Cards) ── */}
        {singleSubjects.map(s => (
          <SubjectCard key={s.id} subject={s.name} totalPlanned={s.plannedClasses} />
        ))}

        {/* ── Ward Rotations (Grouped in ONE Card) ── */}
        {(subjectMode === 'preloaded' || customWards.length > 0) && (() => {
          // Calculate overall ward statistics
          let att = 0, mis = 0, planned = 0;
          if (subjectMode === 'preloaded') {
            WARD_SUBJECTS.forEach(sub => {
              const d = wards[`ward-${sub.name}`] || { attended: 0, missed: 0 };
              att += d.attended;
              mis += d.missed;
              planned += getPresetWardTotalPlanned(sub.name);
            });
          } else {
            customWards.forEach(w => {
              const d = wards[`ward-${w.name}`] || { attended: 0, missed: 0 };
              att += d.attended;
              mis += d.missed;
              planned += getCustomWardTotalPlanned(w.startDate, w.endDate);
            });
          }
          const conducted = att + mis;
          const pct = conducted === 0 ? 100 : (att / conducted) * 100;
          const wardSummary = { att, mis, planned, pct, conducted };

          return (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => toggleCategory('Ward Postings')}
                className="w-full p-4 text-left transition-all active:scale-[0.99]"
              >
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-xl font-bold text-foreground">Clinical Rotations</h2>
                  {openCategories['Ward Postings']
                    ? <ChevronUp className="text-muted-foreground w-5 h-5 shrink-0" />
                    : <ChevronDown className="text-muted-foreground w-5 h-5 shrink-0" />}
                </div>
                <div className="flex gap-4">
                  <div>
                    <div className="text-2xl font-bold font-sans" style={{ color: pctColor(wardSummary.pct) }}>
                      {wardSummary.conducted === 0 ? '--' : `${wardSummary.pct.toFixed(1)}%`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Overall</div>
                  </div>
                  <div className="w-px bg-border my-1" />
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {[
                      { label: 'Attended', val: wardSummary.att },
                      { label: 'Missed', val: wardSummary.mis },
                      { label: 'Planned', val: wardSummary.planned },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <span className="font-semibold text-sm">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-primary font-medium mt-3">
                  Current Posting: {isWardHoliday ? 'Holiday' : (activeWard || 'None Scheduled')}
                </p>
              </button>
              <AnimatePresence initial={false}>
                {openCategories['Ward Postings'] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    {subjectMode === 'preloaded' && WARD_SUBJECTS.map((ward) => (
                      <React.Fragment key={ward.name}>
                        <div className="border-t border-border" />
                        <div className="relative">
                          {activeWard === ward.name && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary z-10" />
                          )}
                          <SubjectCard subject={ward.name} totalPlanned={getPresetWardTotalPlanned(ward.name)} isWard={true} isNested={true} />
                        </div>
                      </React.Fragment>
                    ))}
                    {subjectMode === 'custom' && customWards.map((w) => (
                      <React.Fragment key={w.id}>
                        <div className="border-t border-border" />
                        <div className="relative">
                          {activeWard === w.name && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary z-10" />
                          )}
                          <SubjectCard subject={w.name} totalPlanned={getCustomWardTotalPlanned(w.startDate, w.endDate)} isWard={true} isNested={true} />
                        </div>
                      </React.Fragment>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* ── Integrated Teaching (preloaded mode only) ── */}
        {subjectMode === 'preloaded' && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleCategory('Integrated Teaching')}
              className="w-full p-4 text-left transition-all active:scale-[0.99]"
            >
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-bold text-foreground">Integrated Teaching</h2>
                {openCategories['Integrated Teaching']
                  ? <ChevronUp className="text-muted-foreground w-5 h-5 shrink-0" />
                  : <ChevronDown className="text-muted-foreground w-5 h-5 shrink-0" />}
              </div>
              <div className="flex gap-4">
                <div>
                  <div className="text-2xl font-bold font-sans" style={{ color: pctColor(integratedSummary.pct) }}>
                    {integratedSummary.conducted === 0 ? '--' : `${integratedSummary.pct.toFixed(1)}%`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Overall</div>
                </div>
                <div className="w-px bg-border my-1" />
                <div className="flex-1 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Attended', val: integratedSummary.att },
                    { label: 'Missed', val: integratedSummary.mis },
                    { label: 'Planned', val: integratedSummary.planned },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex flex-col">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="font-semibold text-sm">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
            <AnimatePresence initial={false}>
              {openCategories['Integrated Teaching'] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  {INTEGRATED_SUBJECTS.map(sub => (
                    <React.Fragment key={sub.name}>
                      <div className="border-t border-border" />
                      <SubjectCard subject={sub.name} totalPlanned={getSubjectPlannedTotal(sub.name)} isNested />
                    </React.Fragment>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

      </div>
    </Layout>
  );
}
