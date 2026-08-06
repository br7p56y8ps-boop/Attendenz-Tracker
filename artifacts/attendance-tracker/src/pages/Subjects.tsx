import React, { useState } from 'react';
import { CATEGORIES, WARD_SUBJECTS, INTEGRATED_SUBJECTS } from '@/lib/constants';
import { SubjectCard } from '@/components/SubjectCard';
import { Layout } from '@/components/Layout';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { pctColor, cn } from '@/lib/utils';
import { useLocation } from 'wouter';

// ── SVG Circular Progress Component ──
const CircularProgress = ({
  percentage,
  color,
  size = 56,
  strokeWidth = 5,
}: {
  percentage: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-extrabold leading-none" style={{ color }}>
          {percentage === undefined || isNaN(percentage) ? '--' : `${percentage.toFixed(0)}%`}
        </span>
      </div>
    </div>
  );
};

interface ChildDetail {
  name: string;
  attended: number;
  missed: number;
  conducted: number;
  planned: number;
  remaining: number;
  pct: number;
  requiredToAttend: number;
  isImpossible: boolean;
  needsAttention: boolean;
}

interface CategorySummary {
  att: number;
  mis: number;
  planned: number;
  pct: number;
  conducted: number;
  remainingTotal: number;
  maxPossiblePct: number;
  childDetails: ChildDetail[];
  urgentList: ChildDetail[];
  attentionList: ChildDetail[];
}

interface CategoryCardProps {
  title: string;
  sectionKey: string;
  badge?: React.ReactNode;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  summary: CategorySummary;
  preferredPercentage: number;
  renderChildren: () => React.ReactNode;
}

const CategoryCard = ({
  title,
  badge,
  subtitle,
  isOpen,
  onToggle,
  summary,
  preferredPercentage,
  renderChildren,
}: CategoryCardProps) => {
  const overallColor = pctColor(summary.pct, preferredPercentage);
  const maxPossibleColor = pctColor(summary.maxPossiblePct, preferredPercentage);

  const statusColor = summary.urgentList.length > 0
    ? pctColor(0, preferredPercentage)
    : summary.attentionList.length > 0
    ? pctColor(preferredPercentage - 1, preferredPercentage)
    : pctColor(preferredPercentage + 10, preferredPercentage);

  // Parent card with defined border and subtle tint
  const cardStyle = {
    backgroundColor: `${overallColor}14`,
    borderColor: `${overallColor}40`,
  };

  return (
    <div
      style={cardStyle}
      className={cn(
        "border rounded-2xl shadow-sm transition-all overflow-hidden p-4 sm:p-5 space-y-3.5",
        isOpen ? "bg-card/90 backdrop-blur-xl border-border/80" : "hover:shadow-md"
      )}
    >
      {/* Clickable Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left transition-all active:scale-[0.99] cursor-pointer"
      >
        <div className="flex items-center gap-4 min-w-0">
          <CircularProgress percentage={summary.pct} color={overallColor} size={56} strokeWidth={5} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="text-xs text-primary font-semibold mt-0.5">{subtitle}</p>}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5 font-medium">
              <span>Attended: <strong className="text-foreground font-semibold">{summary.att}</strong></span>
              <span className="opacity-40">·</span>
              <span>Missed: <strong className="text-foreground font-semibold">{summary.mis}</strong></span>
              <span className="opacity-40">·</span>
              <span>Planned: <strong className="text-foreground font-semibold">{summary.planned}</strong></span>
            </div>
          </div>
        </div>
      </button>

      {/* Full-width Side Message Container Box */}
      <div className="bg-background/70 backdrop-blur-md border border-border/60 rounded-xl p-3.5 text-xs space-y-2.5 w-full shadow-sm">
        {/* Row 1: Status */}
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-muted-foreground shrink-0">Status:</span>
          <span className="font-bold text-right truncate text-xs sm:text-sm" style={{ color: statusColor }}>
            {summary.urgentList.length > 0
              ? `🚨 Deadline Alert: ${summary.urgentList.length} unreachable`
              : summary.attentionList.length > 0
              ? `⚠️ Attention Needed (<${preferredPercentage}%)`
              : `✨ All targets on track`}
          </span>
        </div>

        {/* Row 2: Attention subjects if any */}
        {summary.attentionList.length > 0 && (
          <div className="flex items-start justify-between gap-3 pt-1 border-t border-border/40">
            <span className="font-semibold text-muted-foreground shrink-0">Needs Attention:</span>
            <div className="font-bold text-right flex flex-wrap justify-end gap-1.5">
              {summary.attentionList.map((s, idx) => (
                <span key={idx} style={{ color: pctColor(s.pct, preferredPercentage) }}>
                  {s.name} ({s.pct.toFixed(0)}%){idx < summary.attentionList.length - 1 ? ',' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Row 3: Overall Predicted Max % */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40">
          <span className="font-semibold text-muted-foreground shrink-0">Predicted Max %:</span>
          <span className="font-extrabold text-right text-sm sm:text-base" style={{ color: maxPossibleColor }}>
            {summary.maxPossiblePct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Children list */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden bg-background/40 rounded-xl p-2 space-y-1.5"
          >
            {renderChildren()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function Subjects() {
  const { subjects, wards, preferredPercentage } = useAttendance();
  const {
    customSubjects,
    customWards,
    getCurrentCustomWard,
    subjectMode,
    getSubjectPlannedTotal,
    getCurrentPresetWard,
    getPresetWardTotalPlanned,
    getCustomWardTotalPlanned,
  } = useCustomData();
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

  const calcSummary = (
    subjectList: { name: string; total?: number }[],
    isWardGroup = false
  ): CategorySummary => {
    let att = 0, mis = 0, planned = 0;
    const childDetails: ChildDetail[] = [];
    const targetPct = preferredPercentage || 75;

    subjectList.forEach(sub => {
      const key = isWardGroup ? `ward-${sub.name}` : sub.name;
      const d = (isWardGroup ? wards : subjects)[key] || { attended: 0, missed: 0 };

      let p = 0;
      if (isWardGroup) {
        if (subjectMode === 'preloaded') {
          p = getPresetWardTotalPlanned(sub.name);
        } else {
          const cWard = customWards.find(w => w.name.toLowerCase() === sub.name.toLowerCase());
          p = cWard ? getCustomWardTotalPlanned(cWard.startDate, cWard.endDate) : (sub.total || 40);
        }
      } else {
        const cSub = customSubjects.find(s => s.name.toLowerCase() === sub.name.toLowerCase());
        p = cSub ? cSub.plannedClasses : (getSubjectPlannedTotal(sub.name) || sub.total || 40);
      }

      const conducted = d.attended + d.missed;
      const remaining = Math.max(0, p - conducted);
      const pct = conducted === 0 ? 100 : (d.attended / conducted) * 100;

      const rawReq = Math.max(0, Math.ceil(p * (targetPct / 100)) - d.attended);
      const isImpossible = rawReq > remaining;
      const needsAttention = (conducted > 0 && pct < targetPct) || isImpossible;

      att += d.attended;
      mis += d.missed;
      planned += p;

      childDetails.push({
        name: sub.name,
        attended: d.attended,
        missed: d.missed,
        conducted,
        planned: p,
        remaining,
        pct,
        requiredToAttend: rawReq,
        isImpossible,
        needsAttention,
      });
    });

    const conducted = att + mis;
    const pct = conducted === 0 ? 100 : (att / conducted) * 100;
    const remainingTotal = Math.max(0, planned - conducted);
    const maxPossiblePct = planned > 0 ? ((att + remainingTotal) / planned) * 100 : 100;

    const urgentList = childDetails.filter(c => c.isImpossible);
    const attentionList = childDetails.filter(c => c.needsAttention);

    return { att, mis, planned, pct, conducted, remainingTotal, maxPossiblePct, childDetails, urgentList, attentionList };
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
        {subjectMode === 'preloaded' && CATEGORIES.map((cat) => {
          const summary = calcSummary(cat.subjects);
          return (
            <CategoryCard
              key={cat.name}
              title={cat.name}
              sectionKey={cat.name}
              isOpen={openCategories[cat.name] || false}
              onToggle={() => toggleCategory(cat.name)}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {cat.subjects.map((sub) => (
                    <SubjectCard key={sub.name} subject={sub.name} totalPlanned={getSubjectPlannedTotal(sub.name)} isNested />
                  ))}
                </>
              )}
            />
          );
        })}

        {/* ── Custom Allied Categories ── */}
        {Object.entries(alliedCategories).map(([catName, subs]) => {
          const subjectList = subs.map(s => ({ name: s.name, total: s.plannedClasses }));
          const summary = calcSummary(subjectList);
          const sectionKey = `allied_${catName}`;
          return (
            <CategoryCard
              key={catName}
              title={catName}
              sectionKey={sectionKey}
              isOpen={openCategories[sectionKey] || false}
              onToggle={() => toggleCategory(sectionKey)}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {subs.map((s) => (
                    <SubjectCard key={s.id} subject={s.name} totalPlanned={s.plannedClasses} isNested />
                  ))}
                </>
              )}
            />
          );
        })}

        {/* ── Custom Single Subjects (Separate Independent Cards) ── */}
        {singleSubjects.map(s => (
          <SubjectCard key={s.id} subject={s.name} totalPlanned={s.plannedClasses} />
        ))}

        {/* ── Ward Rotations (Grouped in ONE Card) ── */}
        {(subjectMode === 'preloaded' || customWards.length > 0) && (() => {
          const wardList = subjectMode === 'preloaded' 
            ? WARD_SUBJECTS 
            : customWards.map(w => ({ name: w.name, total: getCustomWardTotalPlanned(w.startDate, w.endDate) }));
          const wardSummary = calcSummary(wardList, true);

          return (
            <CategoryCard
              title="Clinical Rotations"
              sectionKey="Ward Postings"
              subtitle={`Current Posting: ${isWardHoliday ? 'Holiday' : (activeWard || 'None Scheduled')}`}
              isOpen={openCategories['Ward Postings'] || false}
              onToggle={() => toggleCategory('Ward Postings')}
              summary={wardSummary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {subjectMode === 'preloaded' && WARD_SUBJECTS.map((ward) => (
                    <div key={ward.name} className="relative">
                      {activeWard === ward.name && (
                        <div className="absolute left-2 top-1 bottom-1 w-1 bg-primary rounded-full z-10" />
                      )}
                      <SubjectCard subject={ward.name} totalPlanned={getPresetWardTotalPlanned(ward.name)} isWard={true} isNested={true} />
                    </div>
                  ))}
                  {subjectMode === 'custom' && customWards.map((w) => (
                    <div key={w.id} className="relative">
                      {activeWard === w.name && (
                        <div className="absolute left-2 top-1 bottom-1 w-1 bg-primary rounded-full z-10" />
                      )}
                      <SubjectCard subject={w.name} totalPlanned={getCustomWardTotalPlanned(w.startDate, w.endDate)} isWard={true} isNested={true} />
                    </div>
                  ))}
                </>
              )}
            />
          );
        })()}

        {/* ── Integrated Teaching (preloaded mode only) ── */}
        {subjectMode === 'preloaded' && (() => {
          const integratedSummary = calcSummary(INTEGRATED_SUBJECTS);
          return (
            <CategoryCard
              title="Integrated Teaching"
              sectionKey="Integrated Teaching"
              isOpen={openCategories['Integrated Teaching'] || false}
              onToggle={() => toggleCategory('Integrated Teaching')}
              summary={integratedSummary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {INTEGRATED_SUBJECTS.map(sub => (
                    <SubjectCard key={sub.name} subject={sub.name} totalPlanned={getSubjectPlannedTotal(sub.name)} isNested />
                  ))}
                </>
              )}
            />
          );
        })()}

      </div>
    </Layout>
  );
}
