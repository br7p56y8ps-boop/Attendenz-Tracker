import React, { useState } from 'react';
import { CATEGORIES, WARD_SUBJECTS, INTEGRATED_SUBJECTS } from '@/lib/constants';
import { SubjectCard } from '@/components/SubjectCard';
import { StickySectionLabel } from '@/components/StickySectionLabel';
import { Layout } from '@/components/Layout';
import { useAttendance, getSGTKey, getAcademicAttendanceKey, getWardAttendanceKey } from '@/contexts/AttendanceContext';
import { useCustomData, getEffectiveParentName } from '@/contexts/CustomDataContext';
import type { CustomSubject, UserAddedSubject } from '@/contexts/CustomDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { pctColor, cn } from '@/lib/utils';
import { useLocation } from 'wouter';
import { ClipboardList, GraduationCap, Stethoscope } from 'lucide-react';

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
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" fill="transparent" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" fill="transparent" className="transition-all duration-500 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-extrabold leading-none" style={{ color }}>
          {percentage === undefined || isNaN(percentage) ? '--' : `${percentage.toFixed(0)}%`}
        </span>
      </div>
    </div>
  );
};

const SectionHeading = ({ icon, label }: { icon?: React.ReactNode; label: string }) => (
  <StickySectionLabel icon={icon} label={label} />
);

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
  const overallColor = pctColor(summary.pct, preferredPercentage, {
    isFinished: summary.planned > 0 && summary.remainingTotal === 0,
    hasPlannedClasses: summary.planned > 0,
  });
  const cardBgColor = 'bg-card/90 backdrop-blur-xl border-border/80';
  const cardStyle = isOpen
    ? {}
    : {
        backgroundColor: `${overallColor}14`,
        borderColor: `${overallColor}40`,
      };
  return (
    <motion.div
      style={cardStyle}
      className={cn(
        'border rounded-2xl shadow-sm transition-all overflow-hidden p-4 sm:p-5 space-y-3.5',
        cardBgColor,
        isOpen ? 'border-border/90 ring-1 ring-border/40 shadow-md' : 'hover:shadow-md'
      )}
      initial={false}
      animate={{
        backgroundColor: isOpen ? 'transparent' : `${overallColor}14`,
        borderColor: isOpen ? 'var(--border)' : `${overallColor}40`,
      }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    >
      <button type="button" onClick={onToggle} className="w-full text-left transition-all active:scale-[0.99] cursor-pointer">
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
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden bg-background/40 rounded-xl border border-border/50 p-2 space-y-1.5"
          >
            {renderChildren()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default function Subjects() {
  const { subjects, wards, preferredPercentage } = useAttendance();
  const {
    customSubjects,
    customWards,
    userAddedSubjects,
    presetWardSchedule,
    getCurrentCustomWard,
    subjectMode,
    getSubjectPlannedTotal,
    getCurrentPresetWard,
    getPresetWardTotalPlanned,
    getCustomWardTotalPlanned,
    getSubjectIdByName,
  } = useCustomData();
  const [, setLocation] = useLocation();
  const today = new Date();
  const customWard = subjectMode === 'custom' ? getCurrentCustomWard() : null;
  const presetWardObj = subjectMode === 'preloaded' ? getCurrentPresetWard(today) : null;
  const activeWard = subjectMode === 'custom'
    ? (customWard ? customWard.name : null)
    : (presetWardObj ? presetWardObj.ward : null);
  const isWardHoliday = activeWard === 'Holiday';
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const toggleCategory = (catName: string) => {
    setOpenCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };
  const norm = (s?: string) => (s || '').trim().toLowerCase();
  const INTEGRATED_PARENT = 'integrated teaching';

  /* FIX: SGT detection FIRST (used by plannedFor to avoid name collisions) */
  const isSGTSubject = (s: { subjectType: string; parentName?: string }) =>
    s.subjectType === 'allied' && s.parentName === 'Small Group Teaching';

  /**
   * FIX: planned lookup for ACADEMIC subjects must NEVER resolve to an SGT record.
   * Skips SGT records so a same-named SGT can't leak its planned count into
   * an academic subject's total.
   */
  const plannedFor = (name: string): number => {
    if (subjectMode === 'custom') {
      const cSub = customSubjects.find(s => norm(s.name) === norm(name) && !isSGTSubject(s));
      return cSub?.plannedClasses ?? 0;
    }
    const uaSub = userAddedSubjects.find(s => norm(s.name) === norm(name) && !isSGTSubject(s));
    if (uaSub) return uaSub.plannedClasses;
    return getSubjectPlannedTotal(name) ?? 40;
  };

  const calcSummary = (
    subjectList: Array<{ name: string; total?: number; id?: string; isSGT?: boolean; sgtId?: string }>,
    isWardGroup = false
  ): CategorySummary => {
    let att = 0, mis = 0, planned = 0;
    const childDetails: ChildDetail[] = [];
    const targetPct = preferredPercentage || 75;
    subjectList.forEach(sub => {
      const resolvedId = sub.id || getSubjectIdByName(sub.name, isWardGroup ? 'clinical' : 'academic');
      const key = isWardGroup
        ? resolvedId
          ? getWardAttendanceKey(resolvedId)
          : null
        : sub.isSGT && sub.sgtId
          ? getSGTKey(sub.sgtId)
          : resolvedId
            ? getAcademicAttendanceKey(resolvedId)
            : null;
      const d = key ? (isWardGroup ? wards : subjects)[key] || { attended: 0, missed: 0 } : { attended: 0, missed: 0 };
      let p = 0;
      if (isWardGroup) {
        if (subjectMode === 'preloaded') {
          p = getPresetWardTotalPlanned(sub.name);
        } else {
          const cWard = customWards.find(w => w.name.toLowerCase() === sub.name.toLowerCase());
          p = cWard ? getCustomWardTotalPlanned(cWard.startDate, cWard.endDate, cWard.vacationPeriods) : 0;
        }
      } else {
        p = plannedFor(sub.name);
        // For SGT, resolve planned by ID (never by name) to avoid collisions
        if (sub.isSGT && sub.sgtId) {
          const sgt =
            subjectMode === 'preloaded'
              ? userAddedSubjects.find(s => s.id === sub.sgtId)
              : customSubjects.find(s => s.id === sub.sgtId);
          p = sgt ? sgt.plannedClasses : p;
        }
      }
      const conducted = d.attended + d.missed;
      const remaining = Math.max(0, p - conducted);
      const pct = conducted === 0 ? 0 : (d.attended / conducted) * 100;
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
    const pct = conducted === 0 ? 0 : (att / conducted) * 100;
    const remainingTotal = Math.max(0, planned - conducted);
    const maxPossiblePct = planned > 0 ? ((att + remainingTotal) / planned) * 100 : 100;
    const urgentList = childDetails.filter(c => c.isImpossible);
    const attentionList = childDetails.filter(c => c.needsAttention);
    return { att, mis, planned, pct, conducted, remainingTotal, maxPossiblePct, childDetails, urgentList, attentionList };
  };

  /* ──────────────────────────────────────────────────────────────────────────
     PRELOADED MODE — SGT records are pulled OUT of academic groups entirely.
     ────────────────────────────────────────────────────────────────────────── */
  const uaSGTs = userAddedSubjects.filter(s => isSGTSubject(s));
  const uaAllied = userAddedSubjects.filter(s => s.subjectType === 'allied' && !isSGTSubject(s));
  const uaParents = userAddedSubjects.filter(s => s.subjectType === 'allied-parent');
  const uaSingles = userAddedSubjects.filter(s => s.subjectType === 'single');

  const isBuiltInParentName = (name?: string): boolean => {
    const p = norm(name);
    if (!p) return false;
    if (p === INTEGRATED_PARENT) return true;
    return CATEGORIES.some(
      cat => norm(cat.name) === p || cat.subjects.some(sub => norm(sub.name) === p)
    );
  };
  const parentMatchesCategory = (
    parent: string | undefined,
    cat: { name: string; subjects: { name: string }[] }
  ): boolean => {
    const p = norm(parent);
    if (!p) return false;
    if (norm(cat.name) === p) return true;
    return cat.subjects.some(sub => norm(sub.name) === p);
  };
  const uaChildrenForCategory = (cat: { name: string; subjects: { name: string }[] }): UserAddedSubject[] =>
    uaAllied.filter(s => parentMatchesCategory(getEffectiveParentName(s), cat));
  const uaChildrenForIntegrated = uaAllied.filter(
    s => norm(getEffectiveParentName(s)) === INTEGRATED_PARENT
  );
  const standaloneUaParents = uaParents.filter(p => !isBuiltInParentName(p.name));
  const uaOrphanMap: Record<string, { title: string; children: UserAddedSubject[] }> = {};
  for (const c of uaAllied) {
    const p = getEffectiveParentName(c) || 'Uncategorised';
    if (isBuiltInParentName(p)) continue;
    if (uaParents.some(pp => norm(pp.name) === norm(p))) continue;
    if (!uaOrphanMap[norm(p)]) uaOrphanMap[norm(p)] = { title: p, children: [] };
    uaOrphanMap[norm(p)].children.push(c);
  }
  const extraWardNames = (() => {
    const seen = new Set<string>(WARD_SUBJECTS.map(w => norm(w.name)));
    const out: string[] = [];
    for (const e of presetWardSchedule) {
      if (!seen.has(norm(e.ward))) {
        seen.add(norm(e.ward));
        out.push(e.ward);
      }
    }
    return out;
  })();

  /* ── CUSTOM MODE — SGT pulled out of academic groups too ── */
  const customSGTs = customSubjects.filter(s => isSGTSubject(s));
  const alliedChildren = customSubjects.filter(s => s.subjectType === 'allied' && !isSGTSubject(s));
  const parentContainers = customSubjects.filter(s => s.subjectType === 'allied-parent');
  const singleSubjects = customSubjects.filter(s => s.subjectType === 'single');
  const childrenOf = (parentName: string): CustomSubject[] =>
    alliedChildren.filter(s => norm(getEffectiveParentName(s)) === norm(parentName));
  const hostingSingles = singleSubjects.filter(s => childrenOf(s.name).length > 0);
  const standaloneSingles = singleSubjects.filter(s => childrenOf(s.name).length === 0);
  const customParentCards: Array<{
    key: string;
    title: string;
    host?: CustomSubject;
    children: CustomSubject[];
  }> = [];
  for (const pc of parentContainers) {
    customParentCards.push({ key: `ap_${pc.id}`, title: pc.name, children: childrenOf(pc.name) });
  }
  for (const s of hostingSingles) {
    customParentCards.push({ key: `hs_${s.id}`, title: s.name, host: s, children: childrenOf(s.name) });
  }
  const accountedParents = new Set<string>([
    ...parentContainers.map(p => norm(p.name)),
    ...singleSubjects.map(s => norm(s.name)),
  ]);
  const orphanMap: Record<string, { title: string; children: CustomSubject[] }> = {};
  for (const c of alliedChildren) {
    const p = getEffectiveParentName(c) || 'Uncategorised';
    if (accountedParents.has(norm(p))) continue;
    if (!orphanMap[norm(p)]) orphanMap[norm(p)] = { title: p, children: [] };
    orphanMap[norm(p)].children.push(c);
  }
  for (const [k, g] of Object.entries(orphanMap)) {
    customParentCards.push({ key: `og_${k}`, title: g.title, children: g.children });
  }

  /* ── SGT list for the Clinical section ── */
  const sgtList = subjectMode === 'preloaded' ? uaSGTs : customSGTs;
  const customAcademicCount = customSubjects.filter(s => s.subjectType !== 'allied-parent' && !(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')).length;
  const customClinicalCount = customWards.length + customSGTs.length;
  const customHasAnySubjects = customAcademicCount + customClinicalCount > 0;

  return (
    <Layout>
      <div className="space-y-4 pb-8 scroll-reachability">
        {/* Empty state for custom mode with no subjects */}
        {subjectMode === 'custom' && !customHasAnySubjects && (
          <div className="bg-card rounded-2xl p-8 border border-border text-center shadow-sm mt-2">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-primary" />
            <h3 className="text-lg font-semibold mb-2">No Subjects yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Add your own subjects and ward rotations from the Manage tab.
            </p>
            <button
              onClick={() => setLocation('/add-new')}
              className="action-button action-button--edit"
            >
              Go to Add New
            </button>
          </div>
        )}

        {/* ══════════════════ ACADEMIC SECTION ══════════════════ */}
        {(subjectMode === 'preloaded' || customHasAnySubjects) && <SectionHeading icon={<GraduationCap className="w-4 h-4 text-primary" />} label="Academic" />}
        {subjectMode === 'custom' && customHasAnySubjects && customAcademicCount === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No Subjects in this section.</p>}

        {/* ── Built-in Academic Categories (preloaded mode only) ── */}
        {subjectMode === 'preloaded' && CATEGORIES.map((cat) => {
          const merged = uaChildrenForCategory(cat);
          const subjectList = [
            ...cat.subjects.map(sub => ({ name: sub.name, total: sub.total })),
            ...merged.map(s => ({ name: s.name, id: s.id, total: s.plannedClasses })),
          ];
          const summary = calcSummary(subjectList);
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
                  {merged.map((s) => (
                    <SubjectCard
                      key={s.id}
                      subject={s.name}
                      totalPlanned={plannedFor(s.name)}
                      isNested
                    />
                  ))}
                </>
              )}
            />
          );
        })}

        {/* ── Preloaded: created parent cards ── */}
        {subjectMode === 'preloaded' && standaloneUaParents.map(p => {
          const kids = uaAllied.filter(c => norm(getEffectiveParentName(c)) === norm(p.name));
          const summary = calcSummary(kids.map(k => ({
            name: k.name,
            id: k.id,
            total: k.plannedClasses,
          })));
          const sectionKey = `uap_${p.id}`;
          return (
            <CategoryCard
              key={sectionKey}
              title={p.name}
              sectionKey={sectionKey}
              isOpen={openCategories[sectionKey] || false}
              onToggle={() => toggleCategory(sectionKey)}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {kids.length === 0 && (
                    <p className="text-xs text-muted-foreground px-3 py-2">No Children added yet.</p>
                  )}
                  {kids.map(k => (
                    <SubjectCard
                      key={k.id}
                      subject={k.name}
                      totalPlanned={plannedFor(k.name)}
                      isNested
                    />
                  ))}
                </>
              )}
            />
          );
        })}

        {/* ── Preloaded: orphaned allied groups (academic only) ── */}
        {subjectMode === 'preloaded' && Object.entries(uaOrphanMap).map(([groupKey, group]) => {
          const summary = calcSummary(group.children.map(k => ({
            name: k.name,
            id: k.id,
            total: k.plannedClasses,
          })));
          const sectionKey = `uag_${groupKey}`;
          return (
            <CategoryCard
              key={sectionKey}
              title={group.title}
              sectionKey={sectionKey}
              isOpen={openCategories[sectionKey] || false}
              onToggle={() => toggleCategory(sectionKey)}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {group.children.map(k => (
                    <SubjectCard
                      key={k.id}
                      subject={k.name}
                      totalPlanned={plannedFor(k.name)}
                      isNested
                    />
                  ))}
                </>
              )}
            />
          );
        })}

        {/* ── Custom mode: parent cards ── */}
        {subjectMode === 'custom' && customParentCards.map(card => {
          const subjectList = [
            ...(card.host ? [{ name: card.host.name, id: card.host.id, total: card.host.plannedClasses }] : []),
            ...card.children.map(c => ({
              name: c.name,
              id: c.id,
              total: c.plannedClasses,
            })),
          ];
          const summary = calcSummary(subjectList);
          return (
            <CategoryCard
              key={card.key}
              title={card.title}
              sectionKey={card.key}
              isOpen={openCategories[card.key] || false}
              onToggle={() => toggleCategory(card.key)}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {card.children.length === 0 && !card.host && (
                    <p className="text-xs text-muted-foreground px-3 py-2">No Children added yet.</p>
                  )}
                  {card.host && (
                    <SubjectCard
                      key={`host_${card.host.id}`}
                      subject={card.host.name}
                      totalPlanned={card.host.plannedClasses}
                      isNested
                    />
                  )}
                  {card.children.map(c => (
                    <SubjectCard
                      key={c.id}
                      subject={c.name}
                      totalPlanned={c.plannedClasses}
                      isNested
                    />
                  ))}
                </>
              )}
            />
          );
        })}

        {/* ── Custom SINGLE subjects ── */}
        {subjectMode === 'custom' && standaloneSingles.map(s => {
          const summary = calcSummary([{ name: s.name, id: s.id, total: s.plannedClasses }]);
          const sectionKey = `single_${s.id}`;
          return (
            <CategoryCard
              key={s.id}
              title={s.name}
              sectionKey={sectionKey}
              isOpen={openCategories[sectionKey] || false}
              onToggle={() => toggleCategory(sectionKey)}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <SubjectCard subject={s.name} totalPlanned={s.plannedClasses} isNested />
              )}
            />
          );
        })}

        {/* ── Preloaded single subjects (user-added) ── */}
        {subjectMode === 'preloaded' && uaSingles.map(s => {
          const summary = calcSummary([{ name: s.name, id: s.id, total: s.plannedClasses }]);
          const sectionKey = `uas_${s.id}`;
          return (
            <CategoryCard
              key={s.id}
              title={s.name}
              sectionKey={sectionKey}
              isOpen={openCategories[sectionKey] || false}
              onToggle={() => toggleCategory(sectionKey)}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <SubjectCard subject={s.name} totalPlanned={plannedFor(s.name)} isNested />
              )}
            />
          );
        })}

        {/* ── Integrated Teaching (academic) ── */}
        {subjectMode === 'preloaded' && (() => {
          const merged = uaChildrenForIntegrated;
          const subjectList = [
            ...INTEGRATED_SUBJECTS.map(sub => ({ name: sub.name, total: sub.total })),
            ...merged.map(s => ({ name: s.name, id: s.id, total: s.plannedClasses })),
          ];
          const integratedSummary = calcSummary(subjectList);
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
                  {merged.map(s => (
                    <SubjectCard
                      key={s.id}
                      subject={s.name}
                      totalPlanned={plannedFor(s.name)}
                      isNested
                    />
                  ))}
                </>
              )}
            />
          );
        })()}

        {/* ══════════════════ CLINICAL SECTION ══════════════════ */}
        {(subjectMode === 'preloaded' || customHasAnySubjects) && <SectionHeading icon={<Stethoscope className="w-4 h-4 text-primary" />} label="Clinical" />}
        {subjectMode === 'custom' && customHasAnySubjects && customClinicalCount === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No Subjects in this section.</p>}

        {/* ── Ward Rotations (Grouped in ONE Card) ── */}
        {(subjectMode === 'preloaded' || customWards.length > 0) && (() => {
          const wardList = subjectMode === 'preloaded'
            ? [
                ...WARD_SUBJECTS.map(w => ({ name: w.name, id: getSubjectIdByName(w.name, 'clinical') })),
                ...extraWardNames.map(n => ({ name: n, id: getSubjectIdByName(n, 'clinical') })),
              ]
            : customWards.map(w => ({ name: w.name, id: w.id, total: getCustomWardTotalPlanned(w.startDate, w.endDate, w.vacationPeriods) }));
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
                    <SubjectCard
                      key={ward.name}
                      subject={ward.name}
                      totalPlanned={getPresetWardTotalPlanned(ward.name)}
                      isWard={true}
                      isNested={true}
                      isActiveWard={activeWard === ward.name}
                    />
                  ))}
                  {subjectMode === 'preloaded' && extraWardNames.map((name) => (
                    <SubjectCard
                      key={`xw_${name}`}
                      subject={name}
                      totalPlanned={getPresetWardTotalPlanned(name)}
                      isWard={true}
                      isNested={true}
                      isActiveWard={activeWard === name}
                    />
                  ))}
                  {subjectMode === 'custom' && customWards.map((w) => (
                    <SubjectCard
                      key={w.id}
                      subject={w.name}
                      totalPlanned={getCustomWardTotalPlanned(w.startDate, w.endDate, w.vacationPeriods)}
                      isWard={true}
                      isNested={true}
                      isActiveWard={activeWard === w.name}
                    />
                  ))}
                </>
              )}
            />
          );
        })()}

        {/* ── Small Group Teaching (moved to Clinical) ── */}
        {sgtList.length > 0 && (() => {
          const summary = calcSummary(sgtList.map(s => ({
            name: s.name,
            total: s.plannedClasses,
            isSGT: true,
            sgtId: s.id,
          })));
          return (
            <CategoryCard
              title="Small Group Teaching"
              sectionKey="sgt"
              isOpen={openCategories['sgt'] || false}
              onToggle={() => toggleCategory('sgt')}
              summary={summary}
              preferredPercentage={preferredPercentage}
              renderChildren={() => (
                <>
                  {sgtList.map(s => (
                    <SubjectCard
                      key={s.id}
                      subject={s.name}
                      totalPlanned={s.plannedClasses}
                      isNested
                      isSGT
                      sgtId={s.id}
                    />
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
