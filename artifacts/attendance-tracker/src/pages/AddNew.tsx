import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useCustomData } from '@/contexts/CustomDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronDown, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'single' | 'allied' | 'ward';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TabButton = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    )}
  >
    {label}
  </button>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
    {children}
  </div>
);

const inputClass =
  'w-full bg-background border border-border rounded-2xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-base transition-all placeholder:text-muted-foreground/50';

export default function AddNew() {
  const { customSubjects, customWards, addCustomSubject, removeCustomSubject, addCustomWard, removeCustomWard } =
    useCustomData();

  const [tab, setTab] = useState<Tab>('single');
  const [successMsg, setSuccessMsg] = useState('');

  // ── Single Subject form ──────────────────────────────────────────────────
  const [sName, setSName] = useState('');
  const [sPlanned, setSPlanned] = useState('');
  const [sDays, setSDays] = useState<string[]>([]);
  const [sTime, setSTime] = useState('');

  // ── Allied Subject form ──────────────────────────────────────────────────
  const [aName, setAName] = useState('');
  const [aCategory, setACategory] = useState('');
  const [aPlanned, setAPlanned] = useState('');
  const [aDays, setADays] = useState<string[]>([]);
  const [aTime, setATime] = useState('');

  // ── Ward form ────────────────────────────────────────────────────────────
  const [wName, setWName] = useState('');
  const [wStart, setWStart] = useState('');
  const [wEnd, setWEnd] = useState('');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const toggleDay = (setter: React.Dispatch<React.SetStateAction<string[]>>, day: string) => {
    setter(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]));
  };

  const DayPicker = ({
    selected,
    onToggle,
  }: {
    selected: string[];
    onToggle: (day: string) => void;
  }) => (
    <div className="flex gap-1.5 flex-wrap">
      {DAYS.map(d => (
        <button
          key={d}
          type="button"
          onClick={() => onToggle(d)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
            selected.includes(d)
              ? 'bg-primary/15 text-primary border-primary/40'
              : 'bg-background text-muted-foreground border-border hover:border-primary/30'
          )}
        >
          {d}
        </button>
      ))}
    </div>
  );

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim() || !sPlanned) return;
    addCustomSubject({
      name: sName.trim(),
      subjectType: 'single',
      plannedClasses: parseInt(sPlanned) || 0,
      days: sDays.join(', '),
      time: sTime.trim(),
    });
    setSName(''); setSPlanned(''); setSDays([]); setSTime('');
    showSuccess(`"${sName.trim()}" added to Subjects ✓`);
  };

  const handleAddAllied = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aName.trim() || !aCategory.trim() || !aPlanned) return;
    addCustomSubject({
      name: aName.trim(),
      subjectType: 'allied',
      plannedClasses: parseInt(aPlanned) || 0,
      days: aDays.join(', '),
      time: aTime.trim(),
      category: aCategory.trim(),
    });
    setAName(''); setACategory(''); setAPlanned(''); setADays([]); setATime('');
    showSuccess(`"${aName.trim()}" added under "${aCategory.trim()}" ✓`);
  };

  const handleAddWard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wName.trim() || !wStart || !wEnd) return;
    if (wEnd < wStart) return;
    addCustomWard({ name: wName.trim(), startDate: wStart, endDate: wEnd });
    setWName(''); setWStart(''); setWEnd('');
    showSuccess(`Ward "${wName.trim()}" added ✓`);
  };

  const singleSubjects = customSubjects.filter(s => s.subjectType === 'single');
  const alliedSubjects = customSubjects.filter(s => s.subjectType === 'allied');

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-8">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Add New</h2>
          <p className="text-2xl font-bold text-foreground mt-1">Manage Subjects & Wards</p>
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
        <div className="flex gap-1 bg-muted/60 p-1 rounded-2xl">
          <TabButton label="Single Subject" active={tab === 'single'} onClick={() => setTab('single')} />
          <TabButton label="Allied Subject" active={tab === 'allied'} onClick={() => setTab('allied')} />
          <TabButton label="Ward Rotation" active={tab === 'ward'} onClick={() => setTab('ward')} />
        </div>

        {/* ── Single Subject ── */}
        <AnimatePresence mode="wait">
          {tab === 'single' && (
            <motion.div key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <form onSubmit={handleAddSingle} className="bg-card border border-border rounded-3xl p-5 space-y-4 shadow-sm">
                <h3 className="font-bold text-lg text-foreground">New Single Subject</h3>
                <Field label="Subject Name">
                  <input className={inputClass} placeholder="e.g. Pathology" value={sName} onChange={e => setSName(e.target.value)} />
                </Field>
                <Field label="Total Planned Classes">
                  <input className={inputClass} type="number" inputMode="numeric" min="1" placeholder="e.g. 40" value={sPlanned} onChange={e => setSPlanned(e.target.value)} />
                </Field>
                <Field label="Days">
                  <DayPicker selected={sDays} onToggle={d => toggleDay(setSDays, d)} />
                </Field>
                <Field label="Time (optional)">
                  <input className={inputClass} placeholder="e.g. 08:00–09:00" value={sTime} onChange={e => setSTime(e.target.value)} />
                </Field>
                <button type="submit" className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all">
                  <Plus className="w-4 h-4" /> Add Subject
                </button>
              </form>

              {singleSubjects.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Added Subjects</p>
                  {singleSubjects.map(s => (
                    <div key={s.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.plannedClasses} planned · {s.days || 'no days set'}</p>
                      </div>
                      <button onClick={() => removeCustomSubject(s.id)} className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Allied Subject ── */}
          {tab === 'allied' && (
            <motion.div key="allied" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <form onSubmit={handleAddAllied} className="bg-card border border-border rounded-3xl p-5 space-y-4 shadow-sm">
                <h3 className="font-bold text-lg text-foreground">New Allied Subject</h3>
                <p className="text-sm text-muted-foreground -mt-2">Allied subjects are grouped under a parent category. The category header automatically totals all its children.</p>
                <Field label="Subject Name">
                  <input className={inputClass} placeholder="e.g. Cardiology" value={aName} onChange={e => setAName(e.target.value)} />
                </Field>
                <Field label="Parent Category">
                  <input className={inputClass} placeholder="e.g. Medicine & Allied" value={aCategory} onChange={e => setACategory(e.target.value)} />
                </Field>
                <Field label="Total Planned Classes">
                  <input className={inputClass} type="number" inputMode="numeric" min="1" placeholder="e.g. 20" value={aPlanned} onChange={e => setAPlanned(e.target.value)} />
                </Field>
                <Field label="Days">
                  <DayPicker selected={aDays} onToggle={d => toggleDay(setADays, d)} />
                </Field>
                <Field label="Time (optional)">
                  <input className={inputClass} placeholder="e.g. 12:00–01:00" value={aTime} onChange={e => setATime(e.target.value)} />
                </Field>
                <button type="submit" className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all">
                  <Plus className="w-4 h-4" /> Add to Category
                </button>
              </form>

              {alliedSubjects.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Added Allied Subjects</p>
                  {alliedSubjects.map(s => (
                    <div key={s.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.category} · {s.plannedClasses} planned</p>
                      </div>
                      <button onClick={() => removeCustomSubject(s.id)} className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Ward Rotation ── */}
          {tab === 'ward' && (
            <motion.div key="ward" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <form onSubmit={handleAddWard} className="bg-card border border-border rounded-3xl p-5 space-y-4 shadow-sm">
                <h3 className="font-bold text-lg text-foreground">New Ward Rotation</h3>
                <p className="text-sm text-muted-foreground -mt-2">The ward will automatically appear on Home when today falls within the date range.</p>
                <Field label="Ward Name">
                  <input className={inputClass} placeholder="e.g. Neurology" value={wName} onChange={e => setWName(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Date">
                    <input type="date" className={inputClass} value={wStart} onChange={e => setWStart(e.target.value)} />
                  </Field>
                  <Field label="End Date">
                    <input type="date" className={inputClass} value={wEnd} onChange={e => setWEnd(e.target.value)} />
                  </Field>
                </div>
                {wStart && wEnd && wEnd < wStart && (
                  <p className="text-destructive text-xs font-medium">End date must be after start date.</p>
                )}
                <button type="submit" className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all">
                  <Plus className="w-4 h-4" /> Add Ward
                </button>
              </form>

              {customWards.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Added Wards</p>
                  {customWards.map(w => (
                    <div key={w.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-foreground">{w.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{w.startDate} → {w.endDate}</p>
                      </div>
                      <button onClick={() => removeCustomWard(w.id)} className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Layout>
  );
}
