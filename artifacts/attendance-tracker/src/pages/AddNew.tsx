import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Check, Calendar, GraduationCap, Building2, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'single' | 'allied' | 'ward' | 'presets';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TabButton = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs md:text-sm font-semibold transition-all duration-200',
      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    )}
  >
    {label}
  </button>
);

const inputClass =
  'w-full bg-background border border-border rounded-2xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-base transition-all placeholder:text-muted-foreground/50';

const labelClass = 'text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5';

export default function AddNew() {
  const {
    customSubjects,
    customWards,
    addCustomSubject,
    removeCustomSubject,
    addCustomWard,
    removeCustomWard,
    presetTimetable,
    presetWardSchedule,
    updatePresetTimetableSlot,
    updatePresetWardSchedule,
    updatePresetSubjectTotal,
    getSubjectPlannedTotal,
  } = useCustomData();
  const { updateSubject } = useAttendance();
  const [, setLocation] = useLocation();

  const [tab, setTab] = useState<Tab>('single');
  const [successMsg, setSuccessMsg] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  // ── Form Reset Function ──────────────────────────────────────────────────────
  const resetAllForms = () => {
    setSName('');
    setSPlanned('');
    setSAttended('');
    setSingleDays([{ day: 'Sun', startTime: '', endTime: '' }]);

    setParentName('');
    setAlliedStep('parent_input');
    setSavedChildren([]);
    setCName('');
    setCPlanned('');
    setCAttended('');
    setChildDays([{ day: 'Sun', startTime: '', endTime: '' }]);

    setWName('');
    setWStart('');
    setWEnd('');
    setWMorning('');
    setWEvening('');
  };

  const handleTabSwitch = (newTab: Tab) => {
    if (newTab !== tab) {
      resetAllForms();
      setTab(newTab);
    }
  };

  // ── 1. Single Subject State ──────────────────────────────────────────────────
  const [sName, setSName] = useState('');
  const [sPlanned, setSPlanned] = useState('');
  const [sAttended, setSAttended] = useState('');
  const [singleDays, setSingleDays] = useState<Array<{ day: string; startTime: string; endTime: string }>>([
    { day: 'Sun', startTime: '', endTime: '' }
  ]);

  const addSingleDayRow = () => {
    if (singleDays.length >= 7) return;
    const usedDays = singleDays.map(r => r.day);
    const remainingDays = DAYS.filter(d => !usedDays.includes(d));
    if (remainingDays.length > 0) {
      setSingleDays([...singleDays, { day: remainingDays[0], startTime: '', endTime: '' }]);
    }
  };

  const handleSaveSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim() || !sPlanned) return;

    const finalSchedules = singleDays.map(d => {
      const timeStr = (d.startTime && d.endTime) ? `${d.startTime}–${d.endTime}` : (d.startTime || d.endTime || 'Time not set');
      return {
        day: d.day,
        time: timeStr
      };
    });

    const finalDays = finalSchedules.map(s => s.day).join(', ');
    const finalTime = finalSchedules.map(s => `${s.day}: ${s.time}`).join('; ');

    addCustomSubject({
      name: sName.trim(),
      subjectType: 'single',
      plannedClasses: parseInt(sPlanned) || 0,
      days: finalDays,
      time: finalTime,
      schedules: finalSchedules,
    });

    const initialAtt = parseInt(sAttended) || 0;
    if (initialAtt > 0) {
      updateSubject(sName.trim(), initialAtt, 0);
    }

    setSName('');
    setSPlanned('');
    setSAttended('');
    setSingleDays([{ day: 'Sun', startTime: '', endTime: '' }]);
    showSuccess(`"${sName.trim()}" saved successfully ✓`);
  };

  // ── 2. Allied Subjects State ─────────────────────────────────────────────────
  const [parentName, setParentName] = useState('');
  const [alliedStep, setAlliedStep] = useState<'parent_input' | 'child_form' | 'actions'>('parent_input');
  
  interface SavedChild {
    name: string;
    planned: number;
    attended: number;
    days: Array<{ day: string; time: string }>;
  }
  const [savedChildren, setSavedChildren] = useState<SavedChild[]>([]);

  // Child form state
  const [cName, setCName] = useState('');
  const [cPlanned, setCPlanned] = useState('');
  const [cAttended, setCAttended] = useState('');
  const [childDays, setChildDays] = useState<Array<{ day: string; startTime: string; endTime: string }>>([
    { day: 'Sun', startTime: '', endTime: '' }
  ]);

  const addChildDayRow = () => {
    if (childDays.length >= 7) return;
    const usedDays = childDays.map(r => r.day);
    const remainingDays = DAYS.filter(d => !usedDays.includes(d));
    if (remainingDays.length > 0) {
      setChildDays([...childDays, { day: remainingDays[0], startTime: '', endTime: '' }]);
    }
  };

  const handleSaveChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim() || !cPlanned) return;

    const newChild: SavedChild = {
      name: cName.trim(),
      planned: parseInt(cPlanned) || 0,
      attended: parseInt(cAttended) || 0,
      days: childDays.map(d => {
        const timeStr = (d.startTime && d.endTime) ? `${d.startTime}–${d.endTime}` : (d.startTime || d.endTime || 'Time not set');
        return {
          day: d.day,
          time: timeStr
        };
      })
    };

    setSavedChildren([...savedChildren, newChild]);
    
    // Reset child form
    setCName('');
    setCPlanned('');
    setCAttended('');
    setChildDays([{ day: 'Sun', startTime: '', endTime: '' }]);
    
    // Go to actions screen
    setAlliedStep('actions');
    showSuccess(`Child subject "${newChild.name}" saved ✓`);
  };

  const handleCompleteParent = () => {
    if (savedChildren.length < 2) return;

    // Save all child subjects to database/state
    savedChildren.forEach(child => {
      const finalDays = child.days.map(s => s.day).join(', ');
      const finalTime = child.days.map(s => `${s.day}: ${s.time}`).join('; ');

      addCustomSubject({
        name: child.name,
        subjectType: 'allied',
        plannedClasses: child.planned,
        category: parentName.trim(),
        days: finalDays,
        time: finalTime,
        schedules: child.days.map(s => ({ day: s.day, time: s.time }))
      });

      if (child.attended > 0) {
        updateSubject(child.name, child.attended, 0);
      }
    });

    showSuccess(`Parent group "${parentName.trim()}" saved successfully! ✓`);
    
    // Redirect to Subjects tab
    setLocation('/subjects');
    
    // Reset Allied state
    setParentName('');
    setSavedChildren([]);
    setAlliedStep('parent_input');
  };

  // ── 3. Ward Rotation State ───────────────────────────────────────────────────
  const [wName, setWName] = useState('');
  const [wStart, setWStart] = useState('');
  const [wEnd, setWEnd] = useState('');
  const [wMorning, setWMorning] = useState('');
  const [wEvening, setWEvening] = useState('');

  const handleSaveWard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wName.trim() || !wStart || !wEnd) return;
    if (wEnd < wStart) return;

    addCustomWard({
      name: wName.trim(),
      startDate: wStart,
      endDate: wEnd,
      morningTime: wMorning.trim() || 'Morning Ward',
      eveningTime: wEvening.trim() || 'Evening Ward'
    });

    setWName('');
    setWStart('');
    setWEnd('');
    setWMorning('');
    setWEvening('');
    showSuccess(`Clinical Rotation "${wName.trim()}" saved ✓`);
  };

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 pb-8 touch-pan-x touch-pan-y"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div>
          <p className="text-2xl font-bold text-foreground">Manage Subjects & Rotations</p>
        </div>

        {/* Success toast */}
        <AnimatePresence>
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-success/15 border border-success/30 rounded-2xl px-4 py-3 text-success text-sm font-semibold"
            >
              {successMsg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab bar */}
        <div className="flex flex-wrap md:flex-nowrap gap-1 bg-muted/60 p-1 rounded-2xl">
          <TabButton label="Single Subject" active={tab === 'single'} onClick={() => handleTabSwitch('single')} />
          <TabButton label="Allied Subject" active={tab === 'allied'} onClick={() => handleTabSwitch('allied')} />
          <TabButton label="Hospital/Clinical Rotation" active={tab === 'ward'} onClick={() => handleTabSwitch('ward')} />
          <TabButton label="Preset Overrides" active={tab === 'presets'} onClick={() => handleTabSwitch('presets')} />
        </div>

        {/* ── Tab 1: Single Subject ── */}
        <AnimatePresence mode="wait">
          {tab === 'single' && (
            <motion.div key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <form onSubmit={handleSaveSingle} className="bg-card border border-border rounded-3xl p-6 space-y-5 shadow-sm">
                <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-lg text-foreground">Add New Single Subject</h3>
                </div>

                {/* Row 1 */}
                <div>
                  <label className={labelClass}>Subject Name</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. Pathology"
                    value={sName}
                    onChange={e => setSName(e.target.value)}
                    required
                  />
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Total Planned Classes</label>
                    <input
                      className={inputClass}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      placeholder="e.g. 40"
                      value={sPlanned}
                      onChange={e => setSPlanned(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Attended Classes (Optional)</label>
                    <input
                      className={inputClass}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="e.g. 10 (optional)"
                      value={sAttended}
                      onChange={e => setSAttended(e.target.value)}
                    />
                  </div>
                </div>

                {/* Row 3+ */}
                <div className="space-y-3">
                  <label className={labelClass}>Weekly Schedules</label>
                  
                  <div className="space-y-3">
                    {singleDays.map((row, idx) => {
                      const usedDaysInOthers = singleDays.filter((_, i) => i !== idx).map(r => r.day);
                      const availableOptions = DAYS.filter(d => !usedDaysInOthers.includes(d));
                      return (
                        <div key={idx} className="space-y-2 bg-muted/20 p-3 rounded-2xl border border-border/40">
                          {/* Column Labels Header */}
                          <div className="grid grid-cols-12 gap-2">
                            <span className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Day</span>
                            <span className="col-span-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Start</span>
                            <span className="col-span-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">End</span>
                          </div>

                          {/* Inputs Grid - Balanced 12-Column Span */}
                          <div className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-3">
                              <select
                                value={row.day}
                                onChange={e => {
                                  const updated = [...singleDays];
                                  updated[idx].day = e.target.value;
                                  setSingleDays(updated);
                                }}
                                className={cn(inputClass, "h-12 py-2 px-3 text-xs md:text-sm font-semibold")}
                              >
                                {availableOptions.map(o => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-4">
                              <input
                                type="time"
                                value={row.startTime}
                                onChange={e => {
                                  const updated = [...singleDays];
                                  updated[idx].startTime = e.target.value;
                                  setSingleDays(updated);
                                }}
                                className={cn(inputClass, "h-12 py-2 px-3 text-xs md:text-sm font-semibold")}
                              />
                            </div>

                            <div className="col-span-5">
                              <input
                                type="time"
                                value={row.endTime}
                                onChange={e => {
                                  const updated = [...singleDays];
                                  updated[idx].endTime = e.target.value;
                                  setSingleDays(updated);
                                }}
                                className={cn(inputClass, "h-12 py-2 px-3 text-xs md:text-sm font-semibold")}
                              />
                            </div>
                          </div>

                          {singleDays.length > 1 && (
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => setSingleDays(singleDays.filter((_, i) => i !== idx))}
                                className="py-1.5 px-3 flex items-center gap-1.5 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20 transition-all text-xs font-bold"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove Row
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {singleDays.length < 7 && (
                    <button
                      type="button"
                      onClick={addSingleDayRow}
                      className="py-2.5 px-4 border border-dashed border-primary/50 text-primary hover:bg-primary/5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 w-full transition-all mt-2"
                    >
                      <Plus className="w-4 h-4" /> Add another Day & Time
                    </button>
                  )}
                </div>

                {/* Final Row */}
                <div className="border-t border-border/50 pt-4">
                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Save Subject
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ── Tab 2: Allied Subject ── */}
          {tab === 'allied' && (
            <motion.div key="allied" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-card border border-border rounded-3xl p-6 space-y-5 shadow-sm">
                <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                  <Building2 className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-lg text-foreground font-sans">Add Allied Subjects Group</h3>
                </div>

                {/* Row 1: Parent Subject Name */}
                <div>
                  <label className={labelClass}>Parent Subject Name</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. Medicine & Allied"
                    value={parentName}
                    onChange={e => setParentName(e.target.value)}
                    disabled={alliedStep !== 'parent_input'}
                    required
                  />
                </div>

                {/* Step 1: Initial parent input, show "Add Child Subject" */}
                {alliedStep === 'parent_input' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={!parentName.trim()}
                      onClick={() => setAlliedStep('child_form')}
                      className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Plus className="w-4 h-4" /> Add Child Subject
                    </button>
                  </div>
                )}

                {/* Step 2: Child Form Block */}
                {alliedStep === 'child_form' && (
                  <form onSubmit={handleSaveChild} className="border-t border-border/50 pt-4 space-y-4">
                    <h4 className="font-bold text-sm text-primary uppercase tracking-wide">New Child Subject Info</h4>
                    
                    {/* Child Row 1 */}
                    <div>
                      <label className={labelClass}>Child Subject Name</label>
                      <input
                        className={inputClass}
                        placeholder="e.g. Cardiology"
                        value={cName}
                        onChange={e => setCName(e.target.value)}
                        required
                      />
                    </div>

                    {/* Child Row 2 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Total Planned Classes</label>
                        <input
                          className={inputClass}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          placeholder="e.g. 20"
                          value={cPlanned}
                          onChange={e => setCPlanned(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Optional Attended Classes</label>
                        <input
                          className={inputClass}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          placeholder="e.g. 5 (optional)"
                          value={cAttended}
                          onChange={e => setCAttended(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Child Row 3+: Day & Time Grid */}
                    <div className="space-y-3">
                      <label className={labelClass}>Day & Time Schedule</label>
                      
                      <div className="space-y-3">
                        {childDays.map((row, idx) => {
                          const usedDaysInOthers = childDays.filter((_, i) => i !== idx).map(r => r.day);
                          const availableOptions = DAYS.filter(d => !usedDaysInOthers.includes(d));
                          return (
                            <div key={idx} className="space-y-2 bg-muted/20 p-3 rounded-2xl border border-border/40">
                              {/* Column Labels Header */}
                              <div className="grid grid-cols-12 gap-2">
                                <span className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Day</span>
                                <span className="col-span-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Start</span>
                                <span className="col-span-5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">End</span>
                              </div>

                              {/* Inputs Grid - Balanced 12-Column Span */}
                              <div className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-3">
                                  <select
                                    value={row.day}
                                    onChange={e => {
                                      const updated = [...childDays];
                                      updated[idx].day = e.target.value;
                                      setChildDays(updated);
                                    }}
                                    className={cn(inputClass, "h-12 py-2 px-3 text-xs md:text-sm font-semibold")}
                                  >
                                    {availableOptions.map(o => (
                                      <option key={o} value={o}>{o}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="col-span-4">
                                  <input
                                    type="time"
                                    value={row.startTime}
                                    onChange={e => {
                                      const updated = [...childDays];
                                      updated[idx].startTime = e.target.value;
                                      setChildDays(updated);
                                    }}
                                    className={cn(inputClass, "h-12 py-2 px-3 text-xs md:text-sm font-semibold")}
                                  />
                                </div>

                                <div className="col-span-5">
                                  <input
                                    type="time"
                                    value={row.endTime}
                                    onChange={e => {
                                      const updated = [...childDays];
                                      updated[idx].endTime = e.target.value;
                                      setChildDays(updated);
                                    }}
                                    className={cn(inputClass, "h-12 py-2 px-3 text-xs md:text-sm font-semibold")}
                                  />
                                </div>
                              </div>

                              {childDays.length > 1 && (
                                <div className="flex justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setChildDays(childDays.filter((_, i) => i !== idx))}
                                    className="py-1.5 px-3 flex items-center gap-1.5 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20 transition-all text-xs font-bold"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Remove Row
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {childDays.length < 7 && (
                        <button
                          type="button"
                          onClick={addChildDayRow}
                          className="py-2.5 px-4 border border-dashed border-primary/50 text-primary hover:bg-primary/5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 w-full transition-all mt-2"
                        >
                          <Plus className="w-4 h-4" /> Add another Day & Time
                        </button>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-2xl hover:opacity-90 active:scale-[0.98] transition-all"
                      >
                        Save Child Subject
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 3: Saved list and actions */}
                {alliedStep === 'actions' && (
                  <div className="border-t border-border/50 pt-4 space-y-4">
                    {savedChildren.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved Child Subjects ({savedChildren.length})</p>
                        <div className="space-y-2 bg-muted/40 p-3 rounded-2xl border border-border/60">
                          {savedChildren.map((child, i) => (
                            <div key={i} className="flex justify-between items-center text-sm border-b border-border/40 pb-2 last:border-0 last:pb-0">
                              <div>
                                <span className="font-semibold text-foreground">{child.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">({child.planned} planned · {child.days.map(d=>d.day).join(', ')})</span>
                              </div>
                              {child.attended > 0 && (
                                <span className="text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">{child.attended} att</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setAlliedStep('child_form')}
                        className="w-full py-3 rounded-2xl border border-primary text-primary hover:bg-primary/5 font-bold flex items-center justify-center gap-2 transition-all"
                      >
                        <Plus className="w-4 h-4" /> Add Next Child Subject
                      </button>

                      <button
                        type="button"
                        disabled={savedChildren.length < 2}
                        onClick={handleCompleteParent}
                        className="w-full py-3.5 rounded-2xl bg-success text-success-foreground font-black flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <Check className="w-4 h-4" /> Complete Parent Subject
                      </button>
                    </div>

                    {savedChildren.length < 2 && (
                      <p className="text-center text-xs text-muted-foreground">Add at least 2 child subjects to complete the parent subject.</p>
                    )}
                  </div>
                )}

                {/* Restart/Start fresh option */}
                {(savedChildren.length > 0 || parentName) && (
                  <div className="border-t border-border/50 pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setParentName('');
                        setSavedChildren([]);
                        setAlliedStep('parent_input');
                        showSuccess("Restarted Allied parent group flow ✓");
                      }}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-all underline"
                    >
                      Add Another Parent Subject
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Tab 3: Ward Rotation ── */}
          {tab === 'ward' && (
            <motion.div key="ward" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <form onSubmit={handleSaveWard} className="bg-card border border-border rounded-3xl p-6 space-y-5 shadow-sm">
                <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-lg text-foreground">Add New Hospital/Clinical Rotation</h3>
                </div>

                {/* Row 1 */}
                <div>
                  <label className={labelClass}>Department/Ward Name</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. Neurology"
                    value={wName}
                    onChange={e => setWName(e.target.value)}
                    required
                  />
                </div>

                {/* Row 2 - Balanced 12-column Grid */}
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-6">
                    <label className={labelClass}>Start Date</label>
                    <input
                      type="date"
                      className={inputClass}
                      min="2026-01-01"
                      max="2026-12-31"
                      value={wStart}
                      onChange={e => setWStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-span-6">
                    <label className={labelClass}>End Date</label>
                    <input
                      type="date"
                      className={inputClass}
                      min="2026-01-01"
                      max="2026-12-31"
                      value={wEnd}
                      onChange={e => setWEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>
                {wStart && wEnd && wEnd < wStart && (
                  <p className="text-destructive text-xs font-semibold -mt-2">End date must be after start date.</p>
                )}

                {/* Row 3 - Balanced 12-column Grid */}
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-6">
                    <label className={labelClass}>Morning Time</label>
                    <input
                      type="time"
                      className={inputClass}
                      value={wMorning}
                      onChange={e => setWMorning(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-span-6">
                    <label className={labelClass}>Evening Time</label>
                    <input
                      type="time"
                      className={inputClass}
                      value={wEvening}
                      onChange={e => setWEvening(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Row 4 */}
                <div className="border-t border-border/50 pt-4">
                  <button
                    type="submit"
                    disabled={!!(wStart && wEnd && wEnd < wStart)}
                    className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Save Clinical Rotation
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ── Tab 4: Preset Overrides ── */}
          {tab === 'presets' && (
            <motion.div key="presets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-card border border-border rounded-3xl p-6 space-y-6 shadow-sm">
                <div className="border-b border-border/50 pb-3 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-primary" />
                  <div>
                    <h3 className="font-bold text-lg text-foreground">Preset Section (Preloaded Mode Overrides)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">These settings override the default built-in Weekly Timetable and Clinical Rotations.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Weekly Timetable Override */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-sm text-primary uppercase tracking-wider flex items-center gap-2">
                      📅 Weekly Timetable Slots
                    </h4>
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 divide-y divide-border/30">
                      {DAYS.map((dayName, dayIdx) => {
                        const slots = presetTimetable[dayIdx] || [];
                        const hasLecture = slots.some(s => s.type !== 'ward' && s.type !== 'ward_replacement');
                        if (!hasLecture) return null;

                        return (
                          <div key={dayName} className="space-y-3 pt-3 first:pt-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground uppercase tracking-wider">{dayName}</span>
                              <div className="h-px flex-1 bg-border/40" />
                            </div>
                            <div className="space-y-3">
                              {slots.map((slot, slotIdx) => {
                                if (slot.type === 'ward' || slot.type === 'ward_replacement') return null;

                                return (
                                  <div key={slotIdx} className="grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-muted/20 p-3 rounded-xl border border-border/40 text-sm">
                                    {/* Day & Time group */}
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Day</label>
                                        <select
                                          value={dayIdx}
                                          onChange={(e) => {
                                            const newDay = parseInt(e.target.value);
                                            updatePresetTimetableSlot(dayIdx, slotIdx, slot.time, slot.subjects, newDay);
                                          }}
                                          className="w-full bg-background border border-border rounded-xl px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                        >
                                          {DAYS.map((d, dIdx) => (
                                            <option key={d} value={dIdx}>{d}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Time</label>
                                        <input
                                          type="text"
                                          value={slot.time}
                                          onChange={(e) => {
                                            updatePresetTimetableSlot(dayIdx, slotIdx, e.target.value, slot.subjects, dayIdx);
                                          }}
                                          className="w-full bg-background border border-border rounded-xl px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                        />
                                      </div>
                                    </div>

                                    {/* Subjects list */}
                                    <div>
                                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Subjects & Planned Classes</label>
                                      <div className="space-y-1.5">
                                        {slot.subjects.map((subName, subIdx) => {
                                          const plannedVal = getSubjectPlannedTotal(subName);
                                          return (
                                            <div key={subIdx} className="flex gap-1.5 items-center">
                                              <input
                                                type="text"
                                                value={subName}
                                                onChange={(e) => {
                                                  const newSubjects = [...slot.subjects];
                                                  newSubjects[subIdx] = e.target.value;
                                                  updatePresetTimetableSlot(dayIdx, slotIdx, slot.time, newSubjects, dayIdx);
                                                }}
                                                className="flex-1 bg-background border border-border rounded-xl px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                                placeholder="Subject name"
                                              />
                                              <input
                                                type="number"
                                                min="1"
                                                value={plannedVal}
                                                onChange={(e) => {
                                                  const newVal = parseInt(e.target.value) || 0;
                                                  updatePresetSubjectTotal(subName, newVal);
                                                }}
                                                className="w-14 bg-background border border-border rounded-xl px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 text-center"
                                                placeholder="Planned"
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ward Rotations Override */}
                  <div className="space-y-4">
                    <h4 className="font-bold text-sm text-primary uppercase tracking-wider flex items-center gap-2">
                      🏥 Clinical Ward Rotations
                    </h4>
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                      {presetWardSchedule.map((ws, wsIdx) => {
                        return (
                          <div key={wsIdx} className="bg-muted/20 p-4 rounded-2xl border border-border/40 space-y-3 text-sm">
                            <div className="flex justify-between items-center">
                              <h5 className="font-bold text-foreground text-xs uppercase tracking-wide">{ws.ward} Posting</h5>
                              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-semibold">Preset Posting</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Start Date</label>
                                <input
                                  type="date"
                                  value={ws.start}
                                  onChange={(e) => {
                                    updatePresetWardSchedule(wsIdx, e.target.value, ws.end, ws.morningTime, ws.eveningTime);
                                  }}
                                  className="w-full bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">End Date</label>
                                <input
                                  type="date"
                                  value={ws.end}
                                  onChange={(e) => {
                                    updatePresetWardSchedule(wsIdx, ws.start, e.target.value, ws.morningTime, ws.eveningTime);
                                  }}
                                  className="w-full bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Morning Time</label>
                                <input
                                  type="text"
                                  value={ws.morningTime || '09:30–11:30'}
                                  onChange={(e) => {
                                    updatePresetWardSchedule(wsIdx, ws.start, ws.end, e.target.value, ws.eveningTime);
                                  }}
                                  className="w-full bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                  placeholder="e.g. 09:30–11:30"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Evening Time</label>
                                <input
                                  type="text"
                                  value={ws.eveningTime || '07:00–09:00 PM'}
                                  onChange={(e) => {
                                    updatePresetWardSchedule(wsIdx, ws.start, ws.end, ws.morningTime, e.target.value);
                                  }}
                                  className="w-full bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                  placeholder="e.g. 07:00–09:00 PM"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Saved lists summaries */}
        {tab === 'single' && customSubjects.filter(s => s.subjectType === 'single').length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Saved Single Subjects</p>
            {customSubjects.filter(s => s.subjectType === 'single').map(s => (
              <div key={s.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.plannedClasses} planned · {s.days || 'no days set'}
                  </p>
                </div>
                <button onClick={() => removeCustomSubject(s.id)} className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'allied' && customSubjects.filter(s => s.subjectType === 'allied').length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Saved Allied Subjects</p>
            {customSubjects.filter(s => s.subjectType === 'allied').map(s => (
              <div key={s.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Group: {s.category} · {s.plannedClasses} planned · {s.days || 'no days set'}
                  </p>
                </div>
                <button onClick={() => removeCustomSubject(s.id)} className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'ward' && customWards.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Saved Clinical Rotations</p>
            {customWards.map(w => (
              <div key={w.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {w.startDate} → {w.endDate} · AM: {w.morningTime || 'Morning'} · PM: {w.eveningTime || 'Evening'}
                  </p>
                </div>
                <button onClick={() => removeCustomWard(w.id)} className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </Layout>
  );
}
