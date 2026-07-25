import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Check, Calendar, GraduationCap, Building2, Sliders, BookOpen, Sparkles, Clock, Sun, CheckCircle2, Save, Stethoscope, Layers } from 'lucide-react';
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
  'w-full bg-muted/30 border border-border/60 rounded-2xl px-3.5 h-11 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background text-xs sm:text-sm font-medium transition-all placeholder:text-muted-foreground/50 box-border';

const labelClass =
  'text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5 text-center';

export default function AddNew() {
  const {
    subjectMode,
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

  React.useEffect(() => {
    if (subjectMode === 'custom' && tab === 'presets') {
      setTab('single');
    }
  }, [subjectMode, tab]);

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
    setWMorningStart('');
    setWMorningEnd('');
    setWEveningStart('');
    setWEveningEnd('');
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
    setLocation('/subjects');
    
    setParentName('');
    setSavedChildren([]);
    setAlliedStep('parent_input');
  };

  // ── 3. Ward Rotation State ───────────────────────────────────────────────────
  const [wName, setWName] = useState('');
  const [wStart, setWStart] = useState('');
  const [wEnd, setWEnd] = useState('');
  const [wMorningStart, setWMorningStart] = useState('');
  const [wMorningEnd, setWMorningEnd] = useState('');
  const [wEveningStart, setWEveningStart] = useState('');
  const [wEveningEnd, setWEveningEnd] = useState('');

  const handleSaveWard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wName.trim() || !wStart || !wEnd) return;
    if (wEnd < wStart) return;

    const formattedMorning = (wMorningStart && wMorningEnd)
      ? `${wMorningStart}–${wMorningEnd}`
      : (wMorningStart || wMorningEnd || 'Morning Ward');

    const formattedEvening = (wEveningStart && wEveningEnd)
      ? `${wEveningStart}–${wEveningEnd}`
      : (wEveningStart || wEveningEnd || 'Evening Ward');

    addCustomWard({
      name: wName.trim(),
      startDate: wStart,
      endDate: wEnd,
      morningTime: formattedMorning,
      eveningTime: formattedEvening
    });

    setWName('');
    setWStart('');
    setWEnd('');
    setWMorningStart('');
    setWMorningEnd('');
    setWEveningStart('');
    setWEveningEnd('');
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

        {/* Top Tab Bar - Dynamic based on Routine Mode */}
        {subjectMode === 'custom' ? (
          <div className="grid grid-cols-3 gap-1 sm:gap-2 bg-card/80 backdrop-blur-xl border border-border/70 p-1.5 sm:p-2 rounded-2xl shadow-sm">
            <button
              type="button"
              onClick={() => handleTabSwitch('single')}
              className={cn(
                'py-2 px-1 sm:px-2.5 rounded-xl text-[10px] sm:text-xs md:text-sm font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-all duration-200 border cursor-pointer min-w-0',
                tab === 'single'
                  ? 'bg-primary text-primary-foreground border-primary shadow-md font-bold'
                  : 'bg-muted/20 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
              )}
            >
              <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Single</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('allied')}
              className={cn(
                'py-2 px-1 sm:px-2.5 rounded-xl text-[10px] sm:text-xs md:text-sm font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-all duration-200 border cursor-pointer min-w-0',
                tab === 'allied'
                  ? 'bg-primary text-primary-foreground border-primary shadow-md font-bold'
                  : 'bg-muted/20 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Allied</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('ward')}
              className={cn(
                'py-2 px-1 sm:px-2.5 rounded-xl text-[10px] sm:text-xs md:text-sm font-semibold flex items-center justify-center gap-1 sm:gap-1.5 transition-all duration-200 border cursor-pointer min-w-0',
                tab === 'ward'
                  ? 'bg-primary text-primary-foreground border-primary shadow-md font-bold'
                  : 'bg-muted/20 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Stethoscope className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="truncate">Clinical Ward</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 bg-card/80 backdrop-blur-xl border border-border/70 p-2 rounded-2xl shadow-sm">
            <button
              type="button"
              onClick={() => handleTabSwitch('single')}
              className={cn(
                'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 border cursor-pointer',
                tab === 'single'
                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                  : 'bg-muted/20 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
              )}
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span className="truncate">Single Subject</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('allied')}
              className={cn(
                'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 border cursor-pointer',
                tab === 'allied'
                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                  : 'bg-muted/20 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="truncate">Allied Subject</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('ward')}
              className={cn(
                'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 border cursor-pointer',
                tab === 'ward'
                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                  : 'bg-muted/20 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Stethoscope className="w-4 h-4 shrink-0" />
              <span className="truncate">Clinical Rotation</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('presets')}
              className={cn(
                'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 border cursor-pointer',
                tab === 'presets'
                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                  : 'bg-muted/20 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40'
              )}
            >
              <Sliders className="w-4 h-4 shrink-0" />
              <span className="truncate">Preset Overrides</span>
            </button>
          </div>
        )}

        {/* ── Tab 1: Single Subject ── */}
        <AnimatePresence mode="wait">
          {tab === 'single' && (
            <motion.div key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <form onSubmit={handleSaveSingle} className="bg-card/90 backdrop-blur-xl border border-border/70 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground tracking-tight">Add New Single Subject</h3>
                      <p className="text-xs text-muted-foreground">Configure subject name and weekly schedule</p>
                    </div>
                  </div>
                  <Sparkles className="w-5 h-5 text-primary/40 shrink-0" />
                </div>

                {/* Row 1: Subject Name */}
                <div>
                  <label className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Subject Name</label>
                  <div className="relative flex items-center">
                    <BookOpen className="w-4 h-4 text-primary absolute left-3.5 pointer-events-none shrink-0" />
                    <input
                      className="w-full bg-muted/30 border border-border/70 rounded-xl pl-10 pr-3.5 h-11 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background text-xs sm:text-sm font-semibold transition-all placeholder:text-muted-foreground/50 box-border"
                      placeholder="Pathology"
                      value={sName}
                      onChange={e => setSName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Row 2: Fluid 2-Column Cards */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="bg-muted/20 border border-border/70 rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground block truncate">Total Planned</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        placeholder="40"
                        value={sPlanned}
                        onChange={e => setSPlanned(e.target.value)}
                        required
                        className="w-full bg-transparent text-foreground text-sm sm:text-base font-bold focus:outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>

                  <div className="bg-muted/20 border border-border/70 rounded-2xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground block truncate">Attended</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="Optional"
                        value={sAttended}
                        onChange={e => setSAttended(e.target.value)}
                        className="w-full bg-transparent text-foreground text-sm sm:text-base font-bold focus:outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 3+: Weekly Schedules */}
                <div className="pt-2 border-t border-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary shrink-0" />
                      <label className="text-xs font-bold uppercase tracking-wider text-foreground">Weekly Schedules</label>
                    </div>
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                      {singleDays.length} {singleDays.length === 1 ? 'Day' : 'Days'}
                    </span>
                  </div>
                  
                  {/* Column Headers */}
                  <div className="grid grid-cols-3 gap-2.5 px-1 pr-11">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Day</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Start Time</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">End Time</span>
                  </div>

                  <div className="space-y-2.5">
                    {singleDays.map((row, idx) => {
                      const usedDaysInOthers = singleDays.filter((_, i) => i !== idx).map(r => r.day);
                      const availableOptions = DAYS.filter(d => !usedDaysInOthers.includes(d));
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="grid grid-cols-3 gap-2.5 flex-1 items-center">
                            <div className="relative flex items-center">
                              <Sun className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                              <select
                                value={row.day}
                                onChange={e => {
                                  const updated = [...singleDays];
                                  updated[idx].day = e.target.value;
                                  setSingleDays(updated);
                                }}
                                className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 box-border"
                              >
                                {availableOptions.map(o => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </div>

                            <div className="relative flex items-center">
                              <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                              <input
                                type="time"
                                value={row.startTime}
                                onChange={e => {
                                  const updated = [...singleDays];
                                  updated[idx].startTime = e.target.value;
                                  setSingleDays(updated);
                                }}
                                className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 box-border"
                              />
                            </div>

                            <div className="relative flex items-center">
                              <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                              <input
                                type="time"
                                value={row.endTime}
                                onChange={e => {
                                  const updated = [...singleDays];
                                  updated[idx].endTime = e.target.value;
                                  setSingleDays(updated);
                                }}
                                className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 box-border"
                              />
                            </div>
                          </div>

                          {singleDays.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSingleDays(singleDays.filter((_, i) => i !== idx))}
                              className="w-10 h-11 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center hover:bg-destructive/20 transition-all shrink-0"
                              title="Delete row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {singleDays.length < 7 && (
                    <button
                      type="button"
                      onClick={addSingleDayRow}
                      className="py-3 px-4 border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 w-full transition-all mt-3 box-border"
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                      <span>Add another Day & Time</span>
                    </button>
                  )}
                </div>

                {/* Submit Row */}
                <div className="border-t border-border/60 pt-4">
                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-blue-600 text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all shadow-lg box-border text-sm"
                  >
                    <Save className="w-4 h-4" /> Save Subject
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ── Tab 2: Allied Subject ── */}
          {tab === 'allied' && (
            <motion.div key="allied" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-card/90 backdrop-blur-xl border border-border/70 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground tracking-tight">Add Allied Subjects Group</h3>
                      <p className="text-xs text-muted-foreground">Create parent and sub-discipline child subjects</p>
                    </div>
                  </div>
                  <Sparkles className="w-5 h-5 text-primary/40 shrink-0" />
                </div>

                {/* Row 1: Parent Subject Name */}
                <div>
                  <label className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Parent Subject Name</label>
                  <div className="relative flex items-center">
                    <BookOpen className="w-4 h-4 text-primary absolute left-3.5 pointer-events-none shrink-0" />
                    <input
                      className="w-full bg-muted/30 border border-border/70 rounded-xl pl-10 pr-3.5 h-11 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background text-xs sm:text-sm font-semibold transition-all placeholder:text-muted-foreground/50 box-border"
                      placeholder="Medicine & Allied"
                      value={parentName}
                      onChange={e => setParentName(e.target.value)}
                      disabled={alliedStep !== 'parent_input'}
                      required
                    />
                  </div>
                </div>

                {/* Step 1 */}
                {alliedStep === 'parent_input' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={!parentName.trim()}
                      onClick={() => setAlliedStep('child_form')}
                      className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md box-border text-sm"
                    >
                      <Plus className="w-4 h-4" /> Add Child Subject
                    </button>
                  </div>
                )}

                {/* Step 2: Child Form Block */}
                {alliedStep === 'child_form' && (
                  <form onSubmit={handleSaveChild} className="border-t border-border/60 pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                        New Child Subject
                      </h4>
                    </div>
                    
                    <div>
                      <label className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Child Subject Name</label>
                      <div className="relative flex items-center">
                        <BookOpen className="w-4 h-4 text-primary absolute left-3.5 pointer-events-none shrink-0" />
                        <input
                          className="w-full bg-muted/30 border border-border/70 rounded-xl pl-10 pr-3.5 h-11 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background text-xs sm:text-sm font-semibold transition-all placeholder:text-muted-foreground/50 box-border"
                          placeholder="Cardiology"
                          value={cName}
                          onChange={e => setCName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="bg-muted/20 border border-border/70 rounded-2xl p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground block truncate">Total Planned</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            placeholder="20"
                            value={cPlanned}
                            onChange={e => setCPlanned(e.target.value)}
                            required
                            className="w-full bg-transparent text-foreground text-sm sm:text-base font-bold focus:outline-none placeholder:text-muted-foreground/40"
                          />
                        </div>
                      </div>

                      <div className="bg-muted/20 border border-border/70 rounded-2xl p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground block truncate">Attended</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            placeholder="Optional"
                            value={cAttended}
                            onChange={e => setCAttended(e.target.value)}
                            className="w-full bg-transparent text-foreground text-sm sm:text-base font-bold focus:outline-none placeholder:text-muted-foreground/40"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Day & Time Grid */}
                    <div className="pt-2 border-t border-border/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary shrink-0" />
                          <label className="text-xs font-bold uppercase tracking-wider text-foreground">Day & Time Schedule</label>
                        </div>
                        <span className="text-[11px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                          {childDays.length} {childDays.length === 1 ? 'Day' : 'Days'}
                        </span>
                      </div>
                      
                      {/* Column Headers */}
                      <div className="grid grid-cols-3 gap-2.5 px-1 pr-11">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Day</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Start Time</span>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">End Time</span>
                      </div>

                      <div className="space-y-2.5">
                        {childDays.map((row, idx) => {
                          const usedDaysInOthers = childDays.filter((_, i) => i !== idx).map(r => r.day);
                          const availableOptions = DAYS.filter(d => !usedDaysInOthers.includes(d));
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <div className="grid grid-cols-3 gap-2.5 flex-1 items-center">
                                <div className="relative flex items-center">
                                  <Sun className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                                  <select
                                    value={row.day}
                                    onChange={e => {
                                      const updated = [...childDays];
                                      updated[idx].day = e.target.value;
                                      setChildDays(updated);
                                    }}
                                    className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 box-border"
                                  >
                                    {availableOptions.map(o => (
                                      <option key={o} value={o}>{o}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="relative flex items-center">
                                  <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                                  <input
                                    type="time"
                                    value={row.startTime}
                                    onChange={e => {
                                      const updated = [...childDays];
                                      updated[idx].startTime = e.target.value;
                                      setChildDays(updated);
                                    }}
                                    className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 box-border"
                                  />
                                </div>

                                <div className="relative flex items-center">
                                  <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                                  <input
                                    type="time"
                                    value={row.endTime}
                                    onChange={e => {
                                      const updated = [...childDays];
                                      updated[idx].endTime = e.target.value;
                                      setChildDays(updated);
                                    }}
                                    className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 box-border"
                                  />
                                </div>
                              </div>

                              {childDays.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setChildDays(childDays.filter((_, i) => i !== idx))}
                                  className="w-10 h-11 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center hover:bg-destructive/20 transition-all shrink-0"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {childDays.length < 7 && (
                        <button
                          type="button"
                          onClick={addChildDayRow}
                          className="py-3 px-4 border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 w-full transition-all mt-3 box-border"
                        >
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                          <span>Add another Day & Time</span>
                        </button>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full py-3.5 bg-gradient-to-r from-primary to-blue-600 text-primary-foreground font-bold rounded-2xl hover:opacity-95 active:scale-[0.98] transition-all shadow-lg box-border text-sm flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" /> Save Child Subject
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 3 */}
                {alliedStep === 'actions' && (
                  <div className="border-t border-border/60 pt-4 space-y-4">
                    {savedChildren.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved Child Subjects ({savedChildren.length})</p>
                        <div className="space-y-2 bg-muted/30 p-3.5 rounded-2xl border border-border/60">
                          {savedChildren.map((child, i) => (
                            <div key={i} className="flex justify-between items-center text-sm border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
                              <div>
                                <span className="font-semibold text-foreground">{child.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">({child.planned} planned · {child.days.map(d=>d.day).join(', ')})</span>
                              </div>
                              {child.attended > 0 && (
                                <span className="text-xs font-semibold text-success bg-success/10 px-2.5 py-0.5 rounded-full border border-success/20">{child.attended} att</span>
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
                        className="w-full py-3 rounded-2xl border border-primary text-primary hover:bg-primary/5 font-bold flex items-center justify-center gap-2 transition-all box-border"
                      >
                        <Plus className="w-4 h-4" /> Add Next Child Subject
                      </button>

                      <button
                        type="button"
                        disabled={savedChildren.length < 2}
                        onClick={handleCompleteParent}
                        className="w-full py-3.5 rounded-2xl bg-success text-success-foreground font-black flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md box-border"
                      >
                        <Check className="w-4 h-4" /> Complete Parent Subject
                      </button>
                    </div>

                    {savedChildren.length < 2 && (
                      <p className="text-center text-xs text-muted-foreground">Add at least 2 child subjects to complete the parent subject.</p>
                    )}
                  </div>
                )}

                {(savedChildren.length > 0 || parentName) && (
                  <div className="border-t border-border/50 pt-3 flex justify-center">
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
              <form onSubmit={handleSaveWard} className="bg-card/90 backdrop-blur-xl border border-border/70 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Stethoscope className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground tracking-tight">Add Hospital/Clinical Rotation</h3>
                      <p className="text-xs text-muted-foreground">Configure rotation dates and shift schedules</p>
                    </div>
                  </div>
                  <Sparkles className="w-5 h-5 text-primary/40 shrink-0" />
                </div>

                <div>
                  <label className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Department/Ward Name</label>
                  <div className="relative flex items-center">
                    <Building2 className="w-4 h-4 text-primary absolute left-3.5 pointer-events-none shrink-0" />
                    <input
                      className="w-full bg-muted/30 border border-border/70 rounded-xl pl-10 pr-3.5 h-11 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background text-xs sm:text-sm font-semibold transition-all placeholder:text-muted-foreground/50 box-border"
                      placeholder="Neurology"
                      value={wName}
                      onChange={e => setWName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* 2-Column Dates */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className={labelClass}>Start Date</label>
                    <div className="relative flex items-center">
                      <Calendar className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                      <input
                        type="date"
                        className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background box-border"
                        min="2026-01-01"
                        max="2026-12-31"
                        value={wStart}
                        onChange={e => setWStart(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>End Date</label>
                    <div className="relative flex items-center">
                      <Calendar className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                      <input
                        type="date"
                        className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background box-border"
                        min="2026-01-01"
                        max="2026-12-31"
                        value={wEnd}
                        onChange={e => setWEnd(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
                {wStart && wEnd && wEnd < wStart && (
                  <p className="text-destructive text-xs font-semibold -mt-2 text-center">End date must be after start date.</p>
                )}

                {/* Morning Shift Time */}
                <div className="pt-3 border-t border-border/50 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">Morning Shift Time</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className={labelClass}>Start Time</label>
                      <div className="relative flex items-center">
                        <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                        <input
                          type="time"
                          className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background box-border"
                          value={wMorningStart}
                          onChange={e => setWMorningStart(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>End Time</label>
                      <div className="relative flex items-center">
                        <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                        <input
                          type="time"
                          className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background box-border"
                          value={wMorningEnd}
                          onChange={e => setWMorningEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Evening Shift Time */}
                <div className="pt-3 border-t border-border/50 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">Evening Shift Time</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className={labelClass}>Start Time</label>
                      <div className="relative flex items-center">
                        <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                        <input
                          type="time"
                          className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background box-border"
                          value={wEveningStart}
                          onChange={e => setWEveningStart(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>End Time</label>
                      <div className="relative flex items-center">
                        <Clock className="w-4 h-4 text-primary absolute left-3 pointer-events-none shrink-0" />
                        <input
                          type="time"
                          className="w-full bg-muted/30 border border-border/70 rounded-xl pl-9 pr-2 h-11 text-xs sm:text-sm font-semibold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background box-border"
                          value={wEveningEnd}
                          onChange={e => setWEveningEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-4">
                  <button
                    type="submit"
                    disabled={!!(wStart && wEnd && wEnd < wStart)}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-blue-600 text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg box-border text-sm"
                  >
                    <Save className="w-4 h-4" /> Save Clinical Rotation
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ── Tab 4: Preset Overrides ── */}
          {tab === 'presets' && (
            <motion.div key="presets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-card/90 backdrop-blur-xl border border-border/70 rounded-3xl p-5 sm:p-6 space-y-6 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Sliders className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-foreground tracking-tight">Preset Overrides</h3>
                      <p className="text-xs text-muted-foreground">
                        Presets are modeled after MBBS 5th year (may or may not match your exact schedule). Provided for convenience—you can adjust times/slots here or use custom subjects.
                      </p>
                    </div>
                  </div>
                  <Sparkles className="w-5 h-5 text-primary/40 shrink-0" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                                  <div key={slotIdx} className="grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-muted/20 p-3 rounded-xl border border-border/40 text-sm box-border">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Day</label>
                                        <select
                                          value={dayIdx}
                                          onChange={(e) => {
                                            const newDay = parseInt(e.target.value);
                                            updatePresetTimetableSlot(dayIdx, slotIdx, slot.time, slot.subjects, newDay);
                                          }}
                                          className="w-full bg-background border border-border rounded-xl px-2 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 box-border [color-scheme:dark]"
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
                                          className="w-full bg-background border border-border rounded-xl px-2 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 box-border"
                                        />
                                      </div>
                                    </div>

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
                                                className="flex-1 bg-background border border-border rounded-xl px-2 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 box-border"
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
                                                className="w-14 bg-background border border-border rounded-xl px-1.5 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 text-center box-border"
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

                  <div className="space-y-4">
                    <h4 className="font-bold text-sm text-primary uppercase tracking-wider flex items-center gap-2">
                      🏥 Clinical Ward Rotations
                    </h4>
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                      {presetWardSchedule.map((ws, wsIdx) => {
                        return (
                          <div key={wsIdx} className="bg-muted/20 p-4 rounded-2xl border border-border/40 space-y-3 text-sm box-border">
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
                                  className="w-full bg-background border border-border rounded-xl px-2 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 box-border"
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
                                  className="w-full bg-background border border-border rounded-xl px-2 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 box-border"
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
                                  className="w-full bg-background border border-border rounded-xl px-2 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 box-border"
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
                                  className="w-full bg-background border border-border rounded-xl px-2 h-9 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 box-border"
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