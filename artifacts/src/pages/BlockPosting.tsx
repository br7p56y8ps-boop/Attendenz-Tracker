import React, { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, ClipboardCheck, Pencil, Settings2, Trash2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { useBlockPosting, BLOCK_POSTING_DEPARTMENTS, blockAttendanceKey, calculateBlockProgress, createBlockPostingId, getRosterRulesForDate, placementIsActive, type AttendanceMark, type BlockPlacement } from '@/contexts/BlockPostingContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useLocation } from 'wouter';
import { recordDashboardActivity } from '@/lib/activity';
import { BlockAttendanceCard } from '@/components/HomeCard';

const inputClass = 'block box-border h-12 min-w-0 w-full rounded-xl border border-border bg-background px-3 py-0 text-center text-sm font-semibold leading-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
const cardClass = 'rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm';
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const displayDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const dateOverlaps = (startA: string, endA: string, startB: string, endB: string) => startA <= endB && startB <= endA;

type RosterRuleDraft = { weekday: number; startTime: string; endTime: string };
type PlacementDraft = { departmentId: string; startDate: string; endDate: string; rosterDutyEnabled: boolean; rosterDutyRules: RosterRuleDraft[] };
const makeDraft = (): PlacementDraft => ({ departmentId: BLOCK_POSTING_DEPARTMENTS[0].id, startDate: '', endDate: '', rosterDutyEnabled: false, rosterDutyRules: [{ weekday: 1, startTime: '', endTime: '' }] });

function PlacementFields({ draft, onChange, idPrefix }: { draft: PlacementDraft; onChange: (next: PlacementDraft) => void; idPrefix: string }) {
  const addDutyDay = () => {
    const weekday = weekdays.findIndex((_, index) => !draft.rosterDutyRules.some(rule => rule.weekday === index));
    if (weekday >= 0) onChange({ ...draft, rosterDutyRules: [...draft.rosterDutyRules, { weekday, startTime: '', endTime: '' }] });
  };
  return <div className="space-y-3">
    <label className="block text-xs font-bold text-muted-foreground">Placement department<select value={draft.departmentId} onChange={event => onChange({ ...draft, departmentId: event.target.value })} className={`${inputClass} mt-1.5`}>{BLOCK_POSTING_DEPARTMENTS.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2"><label className="block min-w-0 text-[10px] font-bold text-muted-foreground">Start date<input type="date" value={draft.startDate} onChange={event => onChange({ ...draft, startDate: event.target.value })} className={`${inputClass} block-posting-date mt-1`} /></label><label className="block min-w-0 text-[10px] font-bold text-muted-foreground">Finish date<input type="date" value={draft.endDate} onChange={event => onChange({ ...draft, endDate: event.target.value })} className={`${inputClass} block-posting-date mt-1`} /></label></div>
    <label className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><input type="checkbox" checked={draft.rosterDutyEnabled} onChange={event => onChange({ ...draft, rosterDutyEnabled: event.target.checked })} className="h-4 w-4 accent-primary" /><span><strong className="block text-xs text-foreground">Add Roster Duty Attendances</strong><span className="block text-[10px] text-muted-foreground">Optional second attendance for this department on selected weekdays.</span></span></label>
    {draft.rosterDutyEnabled && <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">{draft.rosterDutyRules.map((rule, ruleIndex) => <div key={`${idPrefix}-duty-${ruleIndex}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5"><label className="min-w-0 text-[9px] font-bold text-muted-foreground">Duty day<select value={rule.weekday} onChange={event => onChange({ ...draft, rosterDutyRules: draft.rosterDutyRules.map((item, index) => index === ruleIndex ? { ...item, weekday: Number(event.target.value) } : item) })} className={`${inputClass} mt-1 px-1 text-[9px]`}>{weekdays.map((day, index) => <option key={`${idPrefix}-${day}`} value={index} disabled={draft.rosterDutyRules.some((item, otherIndex) => otherIndex !== ruleIndex && item.weekday === index)}>{day}</option>)}</select></label><label className="min-w-0 text-[9px] font-bold text-muted-foreground">From<input type="time" value={rule.startTime} onChange={event => onChange({ ...draft, rosterDutyRules: draft.rosterDutyRules.map((item, index) => index === ruleIndex ? { ...item, startTime: event.target.value } : item) })} className={`${inputClass} mt-1 px-1 text-[9px]`} /></label><label className="min-w-0 text-[9px] font-bold text-muted-foreground">To<input type="time" value={rule.endTime} onChange={event => onChange({ ...draft, rosterDutyRules: draft.rosterDutyRules.map((item, index) => index === ruleIndex ? { ...item, endTime: event.target.value } : item) })} className={`${inputClass} mt-1 px-1 text-[9px]`} /></label><button type="button" aria-label={`Remove ${weekdays[rule.weekday]} duty day`} disabled={draft.rosterDutyRules.length === 1} onClick={() => onChange({ ...draft, rosterDutyRules: draft.rosterDutyRules.filter((_, index) => index !== ruleIndex) })} className="mb-1 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" disabled={draft.rosterDutyRules.length >= weekdays.length} onClick={addDutyDay} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-extrabold text-amber-800 disabled:opacity-40 dark:text-amber-200">+ Add another duty day</button></div>}
  </div>;
}

export default function BlockPosting() {
  const { config, attendance, hydrated, updateConfig, setAttendance } = useBlockPosting();
  const { preferredPercentage } = useAttendance();
  const { subjectMode } = useCustomData();
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [draft, setDraft] = useState<PlacementDraft>(makeDraft);
  const [addPlacementOpen, setAddPlacementOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [overlapWarning, setOverlapWarning] = useState<string[]>([]);
  const [pendingPlacement, setPendingPlacement] = useState<BlockPlacement | null>(null);
  const [rosterDraft, setRosterDraft] = useState({ weekday: 1, startTime: '', endTime: '' });
  const [rosterMessage, setRosterMessage] = useState('');
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodDraft, setPeriodDraft] = useState({ departmentId: BLOCK_POSTING_DEPARTMENTS[0].id, startDate: '', endDate: '' });
  const [pendingPeriodEdit, setPendingPeriodEdit] = useState<{ placementId: string; departmentId: string; startDate: string; endDate: string; overlaps: string[] } | null>(null);
  const [editingRosterRule, setEditingRosterRule] = useState<{ placementId: string; ruleId: string; weekday: number; startTime: string; endTime: string } | null>(null);

  const isFuture = selectedDate > todayString();
  const activePlacements = useMemo(() => config.placements.filter(placement => placementIsActive(placement, selectedDate)).map(placement => {
    const weekday = new Date(`${selectedDate}T12:00:00`).getDay();
    const postingScheduled = subjectMode === 'custom' || weekday !== 5;
    const rosterRules = getRosterRulesForDate(placement, selectedDate);
    return { placement, postingScheduled, rosterRules };
  }).filter(item => item.postingScheduled || item.rosterRules.length > 0), [config.placements, selectedDate, subjectMode]);
  const progress = useMemo(() => calculateBlockProgress(config, attendance, subjectMode), [config, attendance, subjectMode]);
  const rosterHistory = useMemo(() => Object.entries(attendance).flatMap(([key, mark]) => {
    const [placementId, date, kind] = key.split(':');
    if (kind !== 'roster-duty') return [];
    const placement = config.placements.find(item => item.id === placementId);
    if (!placement) return [];
    const departmentName = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement.departmentId)?.name || 'Department';
    return [{ key, date, departmentName, status: mark.status }];
  }).sort((a, b) => b.date.localeCompare(a.date)), [attendance, config.placements]);

  const startPlacement = (next: PlacementDraft, initializing: boolean) => {
    if (!next.departmentId || !next.startDate || !next.endDate || next.startDate > next.endDate) {
      setMessage('Choose a department and enter a valid start and finish date.');
      return;
    }
    if (next.rosterDutyEnabled) {
      const validRules = next.rosterDutyRules.length > 0
        && next.rosterDutyRules.every(rule => rule.startTime && rule.endTime && rule.startTime < rule.endTime)
        && new Set(next.rosterDutyRules.map(rule => rule.weekday)).size === next.rosterDutyRules.length;
      if (!validRules) { setMessage('Set a valid, unique duty day and time period for each selected weekday.'); return; }
    }
    const overlaps = config.placements.filter(placement => dateOverlaps(next.startDate, next.endDate, placement.startDate, placement.endDate));
    if (overlaps.length > 0) {
      setOverlapWarning(overlaps.map(item => {
        const department = BLOCK_POSTING_DEPARTMENTS.find(candidate => candidate.id === item.departmentId)?.name || 'Department';
        return `${department} (${displayDate(item.startDate)}–${displayDate(item.endDate)})`;
      }));
      setPendingPlacement({
        id: createBlockPostingId('block-placement'),
        departmentId: next.departmentId,
        startDate: next.startDate,
        endDate: next.endDate,
        rosterDutyEnabled: next.rosterDutyEnabled,
        rosterDutyRules: next.rosterDutyEnabled ? next.rosterDutyRules.map(rule => ({ id: createBlockPostingId('roster-rule'), ...rule })) : [],
      });
      setMessage('These dates overlap another placement. You can still add this department and track it independently.');
      return;
    }
    const placement: BlockPlacement = {
      id: createBlockPostingId('block-placement'),
      departmentId: next.departmentId,
      startDate: next.startDate,
      endDate: next.endDate,
      rosterDutyEnabled: next.rosterDutyEnabled,
      rosterDutyRules: next.rosterDutyEnabled ? next.rosterDutyRules.map(rule => ({ id: createBlockPostingId('roster-rule'), ...rule })) : [],
    };
    commitPlacement(placement, initializing);
  };

  const commitPlacement = (placement: BlockPlacement, initializing = false) => {
    updateConfig(current => ({ initialized: true, placements: [...current.placements, placement].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)) }));
    const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement.departmentId)?.name || 'Department';
    void recordDashboardActivity(`Added Block placement: ${department} (${displayDate(placement.startDate)}–${displayDate(placement.endDate)})`, 'edit');
    setPendingPlacement(null);
    setOverlapWarning([]);
    setMessage('');
    setDraft(makeDraft());
    setAddPlacementOpen(false);
    if (initializing) setSelectedDate(todayString());
  };

  const mark = (placementId: string, kind: 'posting' | 'roster-duty', status: AttendanceMark | null) => {
    if (isFuture) return;
    const key = blockAttendanceKey(placementId, selectedDate, kind);
    const previous = attendance[key]?.status;
    if (previous === status) return;
    setAttendance(key, status ? { status, updatedAt: Date.now() } : null);
    const placement = config.placements.find(item => item.id === placementId);
    const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement?.departmentId)?.name || 'Department';
    const sessionLabel = kind === 'roster-duty' ? 'Roster Duty' : 'Department posting';
    const action = status ? `Marked ${department} (Block · ${sessionLabel}) as ${status === 'attended' ? 'Attended' : status === 'missed' ? 'Missed' : 'Off'}` : `Unmarked ${department} (Block · ${sessionLabel})`;
    void recordDashboardActivity(action, status === 'missed' ? 'missed' : status ? 'attendance' : 'edit');
  };

  const addRosterRule = (placementId: string) => {
    if (!rosterDraft.startTime || !rosterDraft.endTime || rosterDraft.startTime >= rosterDraft.endTime) {
      setRosterMessage('Choose a valid roster-duty period.');
      return;
    }
    const placement = config.placements.find(item => item.id === placementId);
    if (placement?.rosterDutyRules.some(rule => rule.weekday === rosterDraft.weekday)) {
      setRosterMessage('A roster-duty period is already set for that weekday in this placement.');
      return;
    }
    const newRule = { id: createBlockPostingId('roster-rule'), ...rosterDraft };
    updateConfig(current => ({ ...current, placements: current.placements.map(item => item.id === placementId ? {
      ...item,
      rosterDutyEnabled: true,
      rosterDutyRules: [...item.rosterDutyRules, newRule],
    } : item) }));
    const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement?.departmentId)?.name;
    void recordDashboardActivity(`Added ${weekdays[rosterDraft.weekday]} Roster Duty period${department ? ` for ${department}` : ''}`, 'edit');
    setRosterMessage('');
    const nextWeekday = weekdays.findIndex((_, index) => index !== rosterDraft.weekday && !placement?.rosterDutyRules.some(rule => rule.weekday === index));
    setRosterDraft({ weekday: nextWeekday >= 0 ? nextWeekday : rosterDraft.weekday, startTime: '', endTime: '' });
  };

  const savePlacementPeriod = (placement: BlockPlacement, forceOverlap = false) => {
    if (!BLOCK_POSTING_DEPARTMENTS.some(item => item.id === periodDraft.departmentId) || !periodDraft.startDate || !periodDraft.endDate || periodDraft.startDate > periodDraft.endDate) {
      setRosterMessage('Enter a valid placement start and finish date.');
      return;
    }
    const overlapping = config.placements.filter(item => item.id !== placement.id && dateOverlaps(periodDraft.startDate, periodDraft.endDate, item.startDate, item.endDate));
    if (overlapping.length && !forceOverlap) {
      setPendingPeriodEdit({
        placementId: placement.id,
        ...periodDraft,
        overlaps: overlapping.map(item => `${BLOCK_POSTING_DEPARTMENTS.find(department => department.id === item.departmentId)?.name || 'Department'} (${displayDate(item.startDate)}–${displayDate(item.endDate)})`),
      });
      setRosterMessage('These dates overlap another department. You can save them and keep both independently trackable.');
      return;
    }
    updateConfig(current => ({ ...current, placements: current.placements.map(item => item.id === placement.id ? { ...item, ...periodDraft } : item).sort((a, b) => a.startDate.localeCompare(b.startDate)) }));
    const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === periodDraft.departmentId)?.name || 'Department';
    void recordDashboardActivity(`Updated ${department} Block placement dates (${displayDate(periodDraft.startDate)}–${displayDate(periodDraft.endDate)})`, 'edit');
    setEditingPeriodId(null);
    setPendingPeriodEdit(null);
    setRosterMessage('');
  };

  const saveRosterRule = () => {
    if (!editingRosterRule || !editingRosterRule.startTime || !editingRosterRule.endTime || editingRosterRule.startTime >= editingRosterRule.endTime) {
      setRosterMessage('Choose a valid Roster Duty day and time period.');
      return;
    }
    const placement = config.placements.find(item => item.id === editingRosterRule.placementId);
    if (!placement) return;
    if (placement.rosterDutyRules.some(rule => rule.id !== editingRosterRule.ruleId && rule.weekday === editingRosterRule.weekday)) {
      setRosterMessage('This placement already has a Roster Duty period for that weekday.');
      return;
    }
    updateConfig(current => ({ ...current, placements: current.placements.map(item => item.id === placement.id ? { ...item, rosterDutyRules: item.rosterDutyRules.map(rule => rule.id === editingRosterRule.ruleId ? { ...rule, weekday: editingRosterRule.weekday, startTime: editingRosterRule.startTime, endTime: editingRosterRule.endTime } : rule) } : item) }));
    const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement.departmentId)?.name || 'Department';
    void recordDashboardActivity(`Updated ${department} Roster Duty day and time`, 'edit');
    setEditingRosterRule(null);
    setRosterMessage('');
  };

  const backToHome = <button type="button" onClick={() => setLocation('/')} aria-label="Back to Home" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-foreground"><ArrowLeft className="h-4 w-4" /></button>;

  if (!hydrated) return <Layout headerTitle="Block Logbook" headerDescription="Loading" headerRight={backToHome}><div className="py-10 text-center text-sm text-muted-foreground">Loading logbook…</div></Layout>;

  if (!config.initialized || config.placements.length === 0) return <Layout headerTitle="Block Logbook" headerDescription="First placement" headerRight={backToHome}><div className="mx-auto max-w-xl space-y-4 pb-8"><section className={cardClass}><div className="flex items-start gap-3"><span className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary"><ClipboardCheck className="h-5 w-5" /></span><div><h2 className="text-base font-extrabold text-foreground">Set up your first placement</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose a department and enter its placement dates. Dates can overlap other departments; the logbook will warn you and keep each department separate.</p></div></div><div className="mt-4"><PlacementFields draft={draft} onChange={value => { setDraft(value); setMessage(''); setOverlapWarning([]); }} idPrefix="first" /></div>{message && <p role="alert" className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">{message}{overlapWarning.length > 0 && <span className="mt-1 block">Overlapping: {overlapWarning.join('; ')}</span>}</p>}<button type="button" onClick={() => pendingPlacement ? commitPlacement(pendingPlacement, true) : startPlacement(draft, true)} className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground">{pendingPlacement ? 'Add placement anyway' : 'Save first placement'}</button></section><p className="px-2 text-center text-[10px] leading-relaxed text-muted-foreground">Roster duty is optional. Add one or more weekdays, each with its own period.</p></div></Layout>;

  return <Layout headerTitle="Block Logbook" headerDescription="Daily attendance" headerRight={<div className="flex items-center gap-2">{backToHome}<button type="button" onClick={() => setProgressOpen(true)} aria-label="Open Block Posting progress" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-primary"><BarChart3 className="h-4 w-4" /></button><button type="button" onClick={() => setSettingsOpen(true)} aria-label="Open Logbook Settings" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-foreground"><Settings2 className="h-4 w-4" /></button></div>}>
    <div className="mx-auto max-w-xl space-y-4 pb-[calc(var(--app-bottom-nav-height)+1rem)] scroll-reachability">
      {overlapWarning.length > 0 && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"><strong>Date overlap warning.</strong> {overlapWarning.join('; ')} overlaps the new placement. Both remain independently trackable.</div>}
      <section className={cardClass}>
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /><label htmlFor="block-attendance-date" className="text-xs font-extrabold text-foreground">Logbook date</label><span className="ml-auto rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[9px] font-extrabold text-primary">BLOCK</span></div>
        <input id="block-attendance-date" type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} className={`${inputClass} block-posting-date mt-2`} />
        {isFuture && <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Future placement preview only. Attendance can be marked on or after the date.</p>}
      </section>
      {activePlacements.length === 0 ? <section className={`${cardClass} text-center`}><ClipboardCheck className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-2 text-sm font-extrabold text-foreground">No Block Posting scheduled</h2><p className="mt-1 text-xs text-muted-foreground">No placement is assigned for {displayDate(selectedDate)}. Add the next department and dates in Logbook Settings.</p><button type="button" onClick={() => setSettingsOpen(true)} className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">Open Logbook Settings</button></section> : activePlacements.map(({ placement, postingScheduled, rosterRules }) => {
        const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement.departmentId)!;
        const postingValue = attendance[blockAttendanceKey(placement.id, selectedDate, 'posting')]?.status;
        const rosterValue = attendance[blockAttendanceKey(placement.id, selectedDate, 'roster-duty')]?.status;
        const currentPercentage = progress.find(item => item.departmentId === placement.departmentId)?.currentPercentage ?? 0;
        return <div key={placement.id} className="space-y-2">
          {postingScheduled && <BlockAttendanceCard department={department.name} sessionLabel="Department posting" time="Daily posting" dateStr={selectedDate} value={postingValue} currentPercentage={currentPercentage} preferredPercentage={preferredPercentage} disabled={isFuture} onChange={value => mark(placement.id, 'posting', value)} />}
          {rosterRules.map(rule => <BlockAttendanceCard key={rule.id} department={department.name} sessionLabel="Roster Duty" time={`${weekdays[rule.weekday]} · ${rule.startTime}–${rule.endTime}`} dateStr={selectedDate} value={rosterValue} currentPercentage={currentPercentage} preferredPercentage={preferredPercentage} disabled={isFuture} onChange={value => mark(placement.id, 'roster-duty', value)} />)}
        </div>;
      })}
      <section className="rounded-2xl border border-border/70 bg-card/70 p-4"><h2 className="text-xs font-extrabold text-foreground">Attendance is separate</h2><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Block Posting and its optional roster mark are stored independently from Academic lectures, Ward, and SGT attendance. If placements overlap, mark each department separately.</p></section>
    </div>

    <ModalSheet open={settingsOpen} onClose={() => { setSettingsOpen(false); setMessage(''); setOverlapWarning([]); setPendingPlacement(null); }} ariaLabel="Logbook Settings" labelledBy="block-settings-title" maxWidth="max-w-xl" header={<div className="text-center"><h2 id="block-settings-title" className="text-sm font-extrabold text-foreground">Logbook Settings</h2><p className="mt-1 text-[10px] text-muted-foreground">Department placements and Roster Duty Attendances</p></div>} bodyClassName="space-y-4 p-4 text-left sm:p-5">
      <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-xs font-extrabold text-foreground">Department placements</h3><span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-extrabold text-primary">{config.placements.length}</span></div>{config.placements.map(placement => { const department = BLOCK_POSTING_DEPARTMENTS.find(item => item.id === placement.departmentId)!; return <div key={placement.id} className="rounded-xl border border-border/70 bg-background/60 p-3"><div className="flex items-start justify-between gap-3"><div><strong className="block text-xs text-foreground">{department.name}</strong><span className="text-[10px] text-muted-foreground">{displayDate(placement.startDate)} – {displayDate(placement.endDate)}</span></div><div className="flex shrink-0 items-center gap-1"><button type="button" aria-label={`Edit ${department.name} placement dates`} onClick={() => { setEditingPeriodId(editingPeriodId === placement.id ? null : placement.id); setPeriodDraft({ departmentId: placement.departmentId, startDate: placement.startDate, endDate: placement.endDate }); setPendingPeriodEdit(null); setRosterMessage(''); }} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button><span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-extrabold uppercase text-primary">Block</span></div></div>{editingPeriodId === placement.id && <div className="mt-3 space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5"><label className="block text-[9px] font-bold text-muted-foreground">Department<select value={periodDraft.departmentId} onChange={event => setPeriodDraft(current => ({ ...current, departmentId: event.target.value }))} className={`${inputClass} block-posting-date mt-1`}>{BLOCK_POSTING_DEPARTMENTS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="block min-w-0 text-[9px] font-bold text-muted-foreground">Start date<input type="date" value={periodDraft.startDate} onChange={event => { setPeriodDraft(current => ({ ...current, startDate: event.target.value })); setPendingPeriodEdit(null); }} className={`${inputClass} block-posting-date mt-1`} /></label><label className="block min-w-0 text-[9px] font-bold text-muted-foreground">Finish date<input type="date" value={periodDraft.endDate} onChange={event => { setPeriodDraft(current => ({ ...current, endDate: event.target.value })); setPendingPeriodEdit(null); }} className={`${inputClass} block-posting-date mt-1`} /></label></div><div className="flex gap-2"><button type="button" onClick={() => savePlacementPeriod(placement)} className="flex-1 rounded-lg bg-primary px-3 py-2 text-[10px] font-extrabold text-primary-foreground">Save dates</button><button type="button" onClick={() => { setEditingPeriodId(null); setPendingPeriodEdit(null); setRosterMessage(''); }} className="rounded-lg border border-border px-3 py-2 text-[10px] font-bold">Cancel</button></div>{pendingPeriodEdit?.placementId === placement.id && <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-[9px] font-semibold text-amber-800 dark:text-amber-200">Overlap with: {pendingPeriodEdit.overlaps.join('; ')}<button type="button" onClick={() => savePlacementPeriod(placement, true)} className="mt-2 block w-full rounded-md bg-amber-600 px-2 py-1.5 font-extrabold text-white">Save overlapping dates anyway</button></div>}</div>}<div className="mt-3 border-t border-border/60 pt-3"><label className="flex items-center justify-between gap-3"><span><strong className="block text-[11px] text-foreground">Roster Duty Attendances</strong><span className="block text-[9px] text-muted-foreground">Second mark for this department’s configured duty day(s).</span></span><input type="checkbox" checked={placement.rosterDutyEnabled} onChange={event => { const enabled = event.target.checked; updateConfig(current => ({ ...current, placements: current.placements.map(item => item.id === placement.id ? { ...item, rosterDutyEnabled: enabled } : item) })); void recordDashboardActivity(`${enabled ? 'Enabled' : 'Disabled'} ${department.name} Roster Duty attendance`, 'edit'); }} className="h-4 w-4 accent-primary" /></label>{placement.rosterDutyEnabled && <div className="mt-2 space-y-2">{placement.rosterDutyRules.map(rule => <div key={rule.id} className="space-y-2"><div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2"><span className="min-w-0 flex-1 text-[10px] text-foreground">{weekdays[rule.weekday]} · {rule.startTime}–{rule.endTime}</span><button type="button" aria-label={`Edit ${weekdays[rule.weekday]} roster period`} onClick={() => { setEditingRosterRule({ placementId: placement.id, ruleId: rule.id, weekday: rule.weekday, startTime: rule.startTime, endTime: rule.endTime }); setRosterMessage(''); }} className="rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Remove ${weekdays[rule.weekday]} roster period`} onClick={() => { updateConfig(current => ({ ...current, placements: current.placements.map(item => item.id === placement.id ? { ...item, rosterDutyRules: item.rosterDutyRules.filter(candidate => candidate.id !== rule.id) } : item) })); void recordDashboardActivity(`Removed ${department.name} ${weekdays[rule.weekday]} Roster Duty period`, 'edit'); if (editingRosterRule?.ruleId === rule.id) setEditingRosterRule(null); }} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div>{editingRosterRule?.ruleId === rule.id && <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2"><label className="min-w-0 text-[9px] font-bold text-muted-foreground">Day<select value={editingRosterRule.weekday} onChange={event => setEditingRosterRule(current => current ? { ...current, weekday: Number(event.target.value) } : current)} className={`${inputClass} mt-1 px-2 text-[10px]`}>{weekdays.map((day, index) => <option key={day} value={index} disabled={placement.rosterDutyRules.some(item => item.id !== rule.id && item.weekday === index)}>{day}</option>)}</select></label><label className="min-w-0 text-[9px] font-bold text-muted-foreground">From<input type="time" value={editingRosterRule.startTime} onChange={event => setEditingRosterRule(current => current ? { ...current, startTime: event.target.value } : current)} className={`${inputClass} mt-1 px-2 text-[10px]`} /></label><label className="min-w-0 text-[9px] font-bold text-muted-foreground">To<input type="time" value={editingRosterRule.endTime} onChange={event => setEditingRosterRule(current => current ? { ...current, endTime: event.target.value } : current)} className={`${inputClass} mt-1 px-2 text-[10px]`} /></label><div className="col-span-3 flex gap-2"><button type="button" onClick={saveRosterRule} className="flex-1 rounded-lg bg-primary px-2 py-2 text-[10px] font-extrabold text-primary-foreground">Save duty period</button><button type="button" onClick={() => setEditingRosterRule(null)} className="rounded-lg border border-border px-3 py-2 text-[10px] font-bold">Cancel</button></div></div>}</div>)}<div className="grid grid-cols-3 gap-1.5"><label className="min-w-0 text-[9px] font-bold text-muted-foreground">Duty day<select value={placement.rosterDutyRules.some(rule => rule.weekday === rosterDraft.weekday) ? Math.max(0, weekdays.findIndex((_, index) => !placement.rosterDutyRules.some(rule => rule.weekday === index))) : rosterDraft.weekday} onChange={event => setRosterDraft(current => ({ ...current, weekday: Number(event.target.value) }))} className={`${inputClass} mt-1 !px-1 text-[9px]`}>{weekdays.map((day, index) => <option key={day} value={index} disabled={placement.rosterDutyRules.some(rule => rule.weekday === index)}>{day}</option>)}</select></label><label className="min-w-0 text-[9px] font-bold text-muted-foreground">From<input type="time" value={rosterDraft.startTime} onChange={event => setRosterDraft(current => ({ ...current, startTime: event.target.value }))} className={`${inputClass} mt-1 !px-1 !py-0 text-[9px]`} /></label><label className="min-w-0 text-[9px] font-bold text-muted-foreground">To<input type="time" value={rosterDraft.endTime} onChange={event => setRosterDraft(current => ({ ...current, endTime: event.target.value }))} className={`${inputClass} mt-1 !px-1 !py-0 text-[9px]`} /></label></div><button type="button" disabled={placement.rosterDutyRules.length >= weekdays.length} onClick={() => addRosterRule(placement.id)} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-extrabold text-amber-800 disabled:opacity-40 dark:text-amber-200">+ Add another roster day and period</button></div>}</div></div>; })}</section>
      {rosterMessage && <p role="alert" className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">{rosterMessage}</p>}
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-3"><button type="button" onClick={() => { setAddPlacementOpen(open => !open); setMessage(''); setOverlapWarning([]); setPendingPlacement(null); }} className="w-full text-left text-xs font-extrabold text-primary">{addPlacementOpen ? '− Cancel adding placement' : '+ Add next department placement'}</button>{addPlacementOpen && <div className="mt-3"><PlacementFields draft={draft} onChange={value => { setDraft(value); setMessage(''); setOverlapWarning([]); setPendingPlacement(null); }} idPrefix="add" />{message && <p role="alert" className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[10px] font-semibold text-amber-800 dark:text-amber-200">{message}{overlapWarning.length > 0 && <span className="mt-1 block">Overlapping placements: {overlapWarning.join('; ')}</span>}</p>}<button type="button" onClick={() => pendingPlacement ? commitPlacement(pendingPlacement) : startPlacement(draft, false)} className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground">{pendingPlacement ? 'Add despite overlap' : 'Save placement'}</button></div>}</section>
      <p className="text-[9px] leading-relaxed text-muted-foreground">Dates that overlap another department are allowed after warning. Each department’s attendance and progress remain independent.</p>
    </ModalSheet>

    <ModalSheet open={progressOpen} onClose={() => setProgressOpen(false)} ariaLabel="Block Posting Progress" labelledBy="block-progress-title" maxWidth="max-w-xl" header={<div className="text-center"><h2 id="block-progress-title" className="text-sm font-extrabold text-foreground">Block Posting Progress</h2><p className="mt-1 text-[10px] text-muted-foreground">Department totals · target {preferredPercentage}%</p></div>} bodyClassName="space-y-3 p-4 text-left sm:p-5">
      {progress.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Add a department placement to see its progress.</p> : progress.map(item => <section key={item.departmentId} className="rounded-xl border border-border/70 bg-background/60 p-3"><div className="flex items-start justify-between gap-3"><div><span className="mb-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-primary">Block</span><h3 className="text-xs font-extrabold text-foreground">{item.departmentName}</h3></div><div className="text-right"><strong className="block text-lg font-black" style={{ color: item.currentPercentage >= preferredPercentage ? '#10b981' : '#f43f5e' }}>{item.currentPercentage.toFixed(0)}%</strong><span className="text-[9px] text-muted-foreground">current</span></div></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full" style={{ width: `${Math.min(100, item.currentPercentage)}%`, backgroundColor: item.currentPercentage >= preferredPercentage ? '#10b981' : '#f43f5e' }} /></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] text-muted-foreground"><span><b className="text-foreground">{item.attended}</b> attended · <b className="text-foreground">{item.missed}</b> missed · {item.conducted}/{item.planned} planned</span><span>Predicted max <b className="text-foreground">{item.predictedMaximum.toFixed(0)}%</b></span></div><p className="mt-1 text-[9px] text-muted-foreground">Includes this department’s roster-duty marks on configured days.</p></section>)}
      {rosterHistory.length > 0 && <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><h3 className="text-xs font-extrabold text-foreground">Roster Duty attendance history</h3><p className="mb-2 mt-1 text-[9px] text-muted-foreground">Past marks stay visible even if a roster day is later disabled or removed.</p><div className="space-y-1.5">{rosterHistory.map(item => <div key={item.key} className="flex items-center justify-between gap-2 text-[10px]"><span className="min-w-0 truncate font-semibold text-foreground">{item.departmentName} · {displayDate(item.date)}</span><span className={item.status === 'attended' ? 'font-bold text-emerald-600 dark:text-emerald-300' : item.status === 'missed' ? 'font-bold text-rose-600 dark:text-rose-300' : 'font-bold text-amber-600 dark:text-amber-300'}>{item.status === 'attended' ? 'Attended' : item.status === 'missed' ? 'Missed' : 'Holiday'}</span></div>)}</div></section>}
    </ModalSheet>
  </Layout>;
}
