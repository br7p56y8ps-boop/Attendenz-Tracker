import React, { useRef, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Upload, LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORIES, INTEGRATED_SUBJECTS } from '@/lib/constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

export default function Account() {
  const { username, logout } = useAuth();
  const { subjects, wards } = useAttendance();
  const { customSubjects, customWards } = useCustomData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreMsg, setRestoreMsg] = useState('');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // ── Backup ───────────────────────────────────────────────────────────────
  const handleBackup = () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const val = localStorage.getItem(key);
      try { data[key] = JSON.parse(val!); } catch { data[key] = val; }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benz-attendance-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Restore ──────────────────────────────────────────────────────────────
  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data: Record<string, unknown> = JSON.parse(ev.target?.result as string);
        Object.entries(data).forEach(([k, v]) => {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
        setRestoreMsg('✓ Restore successful — please refresh to apply all changes.');
      } catch {
        setRestoreMsg('✗ Invalid backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Stats ────────────────────────────────────────────────────────────────
  // Derive custom allied categories (same grouping logic as Subjects page)
  const alliedCategories = customSubjects
    .filter(s => s.subjectType === 'allied')
    .reduce<Record<string, typeof customSubjects>>((acc, s) => {
      const cat = s.category || 'Uncategorised';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    }, {});

  const chartData = [
    ...CATEGORIES.map(cat => {
      let att = 0, mis = 0;
      cat.subjects.forEach(s => {
        const d = subjects[s.name] || { attended: 0, missed: 0 };
        att += d.attended; mis += d.missed;
      });
      const total = att + mis;
      return { name: cat.name.replace(' & Allied', '').replace('Obstetrics & Gynaecology', 'OBG'), pct: total === 0 ? null : Math.round((att / total) * 100) };
    }),
    // Custom allied categories
    ...Object.entries(alliedCategories).map(([catName, subs]) => {
      let att = 0, mis = 0;
      subs.forEach(s => {
        const d = subjects[s.name] || { attended: 0, missed: 0 };
        att += d.attended; mis += d.missed;
      });
      const total = att + mis;
      return { name: catName.slice(0, 10), pct: total === 0 ? null : Math.round((att / total) * 100) };
    }),
    // Custom single subjects as one group
    (() => {
      const singles = customSubjects.filter(s => s.subjectType === 'single');
      if (singles.length === 0) return { name: '', pct: null };
      let att = 0, mis = 0;
      singles.forEach(s => {
        const d = subjects[s.name] || { attended: 0, missed: 0 };
        att += d.attended; mis += d.missed;
      });
      const total = att + mis;
      return { name: 'My Subjects', pct: total === 0 ? null : Math.round((att / total) * 100) };
    })(),
    (() => {
      let att = 0, mis = 0;
      INTEGRATED_SUBJECTS.forEach(s => {
        const d = subjects[s.name] || { attended: 0, missed: 0 };
        att += d.attended; mis += d.missed;
      });
      const total = att + mis;
      return { name: 'Integrated', pct: total === 0 ? null : Math.round((att / total) * 100) };
    })(),
  ].filter(d => d.name !== '' && d.pct !== null) as { name: string; pct: number }[];

  // Overall percentage — built-in + custom subjects + custom wards
  let totalAtt = 0, totalMis = 0;
  Object.values(subjects).forEach(d => { totalAtt += d.attended; totalMis += d.missed; });
  Object.values(wards).forEach(d => { totalAtt += d.attended; totalMis += d.missed; });
  const totalConducted = totalAtt + totalMis;
  const overallPct = totalConducted === 0 ? null : Math.round((totalAtt / totalConducted) * 100);
  const pctColor = overallPct == null ? 'text-muted-foreground' : overallPct >= 75 ? 'text-success' : overallPct >= 65 ? 'text-warning' : 'text-destructive';

  const barColor = (pct: number) => (pct >= 75 ? '#22c55e' : pct >= 65 ? '#f59e0b' : '#ef4444');

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">{title}</p>
      {children}
    </div>
  );

  const ActionRow = ({
    icon, label, sub, onClick, danger = false,
  }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean }) => (
    <button
      onClick={onClick}
      className={cn(
        'w-full bg-card border border-border rounded-2xl px-4 py-4 flex items-center gap-4 text-left hover:bg-muted/40 active:scale-[0.98] transition-all',
        danger && 'border-destructive/30 hover:bg-destructive/5'
      )}
    >
      <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
        {icon}
      </div>
      <div className="flex-1">
        <p className={cn('font-semibold text-base', danger ? 'text-destructive' : 'text-foreground')}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </button>
  );

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-8">
        {/* Profile */}
        <div className="flex items-center gap-4 bg-card border border-border rounded-3xl p-5 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-bold text-xl text-foreground">{username}</p>
            <p className="text-sm text-muted-foreground">Offline account · Data stored locally</p>
          </div>
        </div>

        {/* Stats */}
        <Section title="Statistics">
          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-5">
            <div className="flex items-end gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Overall Attendance</p>
                <p className={cn('text-4xl font-bold mt-1', pctColor)}>
                  {overallPct == null ? '—' : `${overallPct}%`}
                </p>
              </div>
              <div className="pb-1 text-sm text-muted-foreground">
                {totalAtt} attended · {totalMis} missed
              </div>
            </div>

            {chartData.length > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} unit="%" />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, 'Attendance']}
                      contentStyle={{ borderRadius: 12, background: 'var(--color-card)', border: '1px solid var(--color-border)', fontSize: 12 }}
                    />
                    <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={barColor(entry.pct)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No attendance data yet. Start marking classes on the Home tab.</p>
            )}

            {/* Per-category breakdown */}
            {chartData.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border">
                {chartData.map(d => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{d.name}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${d.pct}%`, backgroundColor: barColor(d.pct) }}
                      />
                    </div>
                    <span className="text-xs font-bold w-9 text-right" style={{ color: barColor(d.pct) }}>{d.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Data management */}
        <Section title="Data">
          <ActionRow
            icon={<Download className="w-5 h-5" />}
            label="Backup"
            sub="Export all data as JSON file"
            onClick={handleBackup}
          />
          <ActionRow
            icon={<Upload className="w-5 h-5" />}
            label="Restore"
            sub="Import from a backup JSON file"
            onClick={() => fileInputRef.current?.click()}
          />
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestore} />
          <AnimatePresence>
            {restoreMsg && (
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={cn('text-sm font-medium px-1', restoreMsg.startsWith('✓') ? 'text-success' : 'text-destructive')}
              >
                {restoreMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </Section>

        {/* Session */}
        <Section title="Session">
          <ActionRow
            icon={<LogOut className="w-5 h-5" />}
            label="Logout"
            sub="Your data stays safe on this device"
            onClick={() => setShowLogoutDialog(true)}
            danger
          />
        </Section>
      </motion.div>

      {/* Logout dialog */}
      <AnimatePresence>
        {showLogoutDialog && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowLogoutDialog(false); }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Log out?</h3>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                You'll be taken to the login screen. All your data remains safely stored on this device.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutDialog(false)}
                  className="flex-1 py-3 rounded-2xl border border-border text-foreground text-sm font-semibold hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={logout}
                  className="flex-1 py-3 rounded-2xl bg-foreground text-background text-sm font-bold hover:opacity-80 transition-all"
                >
                  Log out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
