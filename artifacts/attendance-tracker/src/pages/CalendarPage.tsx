import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { useAttendance, getSGTKey } from '@/contexts/AttendanceContext';
import { useCustomData } from '@/contexts/CustomDataContext';
import { motion } from 'framer-motion';
import { Grid, ChevronDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { cn, getSubjectColor, formatISODateDDMMYY, parseRangeToMinutes, rangeStartMinutes, canonicalizeTimeRange } from '@/lib/utils';
import { CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';

const DAYS_ORDER = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_INDEX_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function shortenSubject(name: string) {
  const map: Record<string, string> = {
    'Surgery': 'Surg.', 'Obstetrics & Gynaecology': 'Obs & Gyn.', 'Pediatrics': 'Peds.',
    'Orthopedics': 'Ortho.', 'Ophthalmology': 'Ophtha.', 'Otolaryngology': 'ENT',
    'Dermatology': 'Derm.', 'Psychiatry': 'Psych.', 'Physical Medicine': 'PMR',
    'Radiology': 'Radio.', 'Radiotherapy': 'RadioT.', 'Nuclear Medicine': 'Nuc Med.',
    'Neurosurgery': 'NeuroS.', 'Pediatric Surgery': 'Peds Surg.', 'Burn & Plastic Surgery': 'Plastic S.',
    'Internal Medicine': 'Medicine', 'Phase Integrated Teaching': 'Phase Integrated',
    'Departmental Integrated Teaching': 'Dept. Integrated'
  };
  return map[name] || name;
}

/* ── Minute-based grid columns + zero-padded two-line headers ── */
interface GridColumn { id: string; start: number; end: number; base: boolean; }
const BASE_PRESET_COLS = [
  { start: 420, end: 480 },
  { start: 510, end: 570 },
  { start: 690, end: 720 },
  { start: 720, end: 780 },
  { start: 780, end: 840 },
];
const fmtHourMin = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60) % 12;
  if (h === 0) h = 12;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const meridiemOf = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  return Math.floor(m / 60) >= 12 ? 'PM' : 'AM';
};
const columnHeader = (col: GridColumn): { nums: string; period: string } => {
  const s = meridiemOf(col.start);
  const e = meridiemOf(col.end);
  return { nums: `${fmtHourMin(col.start)}–${fmtHourMin(col.end)}`, period: s === e ? s : `${s}–${e}` };
};
const coveredByBase = (r: { start: number; end: number }): boolean => {
  const within = BASE_PRESET_COLS.filter(c => c.start < r.end && c.end > r.start);
  if (!within.length) return false;
  const sorted = [...within].sort((a, b) => a.start - b.start);
  if (sorted[0].start !== r.start) return false;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start !== sorted[i - 1].end) return false;
  return true;
};

export default function CalendarPage() {
  const { subjects, wards, homeSelections, preferredPercentage } = useAttendance();
  const {
    customSubjects, customWards, userAddedSubjects,
    subjectMode, presetTimetable, presetWardSchedule,
    getCurrentPresetWard, getCurrentCustomWard,
    getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned,
  } = useCustomData();
  const today = new Date();
  const target = preferredPercentage || 75;

  /* ═══════════ SGT entries for the weekly grid ═══════════
     SGTs render INSIDE the academic table (short name + SGT tag).
     They persist on their assigned days until the placement period
     is over (endDate < today) — then they disappear from the table. */
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const sgtEntries = useMemo(() => {
    const store = subjectMode === 'preloaded' ? userAddedSubjects : customSubjects;
    const entries: Array<{ day: string; range: string; name: string; start: number; end: number }> = [];
    store.forEach(s => {
      if (!(s.subjectType === 'allied' && s.parentName === 'Small Group Teaching')) return;
      const end = (s as any).endDate;
      if (end && end < todayStr) return; // period over → remove from weekly table
      const scheds: Array<{ day: string; range: string }> = [];
      (s.schedules || []).forEach((sch: any) => {
        const range = sch.time ? canonicalizeTimeRange(sch.time) : `${sch.start}–${sch.end}`;
        if (range) scheds.push({ day: sch.day, range });
      });
      if (scheds.length === 0 && s.days) {
        s.days.split(',').map((d: string) => d.trim()).filter(Boolean)
          .forEach((d: string) => scheds.push({ day: d, range: s.time }));
      }
      scheds.forEach(sch => {
        const m = parseRangeToMinutes(sch.range);
        if (m) entries.push({ day: sch.day, range: sch.range, name: s.name, start: m.start, end: m.end });
      });
    });
    return entries;
  }, [subjectMode, userAddedSubjects, customSubjects, todayStr]);

  /* ═══════════ STATISTICS ═══════════ */
  const allEntities = useMemo(() => {
    const list: Array<{ name: string; isWard: boolean; planned: number; isSGT?: boolean; sgtId?: string }> = [];
    if (subjectMode === 'preloaded') {
      CATEGORIES.forEach(c => c.subjects.forEach(s => list.push({ name: s.name, isWard: false, planned: getSubjectPlannedTotal(s.name) })));
      INTEGRATED_SUBJECTS.forEach(s => list.push({ name: s.name, isWard: false, planned: getSubjectPlannedTotal(s.name) }));
      WARD_SUBJECTS.forEach(w => list.push({ name: w.name, isWard: true, planned: getPresetWardTotalPlanned(w.name) }));
      userAddedSubjects.forEach(u => {
        if (u.subjectType === 'allied-parent') return;
        if (u.parentName === 'Small Group Teaching') {
          list.push({ name: u.name, isWard: false, planned: u.plannedClasses, isSGT: true, sgtId: u.id });
        } else {
          list.push({ name: u.name, isWard: false, planned: u.plannedClasses });
        }
      });
      presetWardSchedule.forEach(e => {
        if (!list.some(x => x.isWard && x.name === e.ward)) {
          list.push({ name: e.ward, isWard: true, planned: getPresetWardTotalPlanned(e.ward) });
        }
      });
    } else {
      customSubjects.forEach(s => {
        if (s.subjectType === 'allied-parent') return;
        if (s.parentName === 'Small Group Teaching') {
          list.push({ name: s.name, isWard: false, planned: s.plannedClasses, isSGT: true, sgtId: s.id });
        } else {
          list.push({ name: s.name, isWard: false, planned: s.plannedClasses });
        }
      });
      customWards.forEach(w => list.push({ name: w.name, isWard: true, planned: getCustomWardTotalPlanned(w.startDate, w.endDate) }));
    }
    return list;
  }, [subjectMode, customSubjects, customWards, userAddedSubjects, presetWardSchedule, getSubjectPlannedTotal, getPresetWardTotalPlanned, getCustomWardTotalPlanned]);

  const overall = useMemo(() => {
    let att = 0, mis = 0, planned = 0, off = 0;
    allEntities.forEach(e => {
      const key = e.isSGT && e.sgtId
        ? getSGTKey(e.sgtId)
        : e.isWard
          ? `ward-${e.name}`
          : e.name;
      const d = (e.isWard ? wards : subjects)[key] || { attended: 0, missed: 0 };
      att += Number(d.attended) || 0; mis += Number(d.missed) || 0; planned += Number(e.planned) || 0;
    });
    for (const sel of Object.values(homeSelections)) if (sel === 'off') off += 1;
    const conducted = att + mis;
    const pct = conducted === 0 ? 100 : (att / conducted) * 100;
    const maxMissable = Math.floor(planned * (1 - target / 100));
    const canMiss = Math.max(0, maxMissable - mis);
    return { att, mis, off, planned, pct, canMiss };
  }, [allEntities, subjects, wards, homeSelections, target]);

  const attention = useMemo(() => {
    const out: Array<{ name: string; pct: number; needed: number }> = [];
    allEntities.forEach(e => {
      const key = e.isSGT && e.sgtId
        ? getSGTKey(e.sgtId)
        : e.isWard
          ? `ward-${e.name}`
          : e.name;
      const d = (e.isWard ? wards : subjects)[key] || { attended: 0, missed: 0 };
      const conducted = d.attended + d.missed;
      if (conducted === 0) return;
      const pct = (d.attended / conducted) * 100;
      const remaining = Math.max(0, e.planned - conducted);
      const rawReq = Math.max(0, Math.ceil(e.planned * (target / 100)) - d.attended);
      if (pct < target || rawReq > remaining) out.push({ name: e.name, pct, needed: rawReq });
    });
    return out.sort((a, b) => a.pct - b.pct).slice(0, 6);
  }, [allEntities, subjects, wards, target]);

  const months = useMemo(() => {
    const now = new Date();
    const buckets: Array<{ key: string; label: string; att: number; mis: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.push({ key, label: d.toLocaleString('en-US', { month: 'short' }), att: 0, mis: 0 });
    }
    for (const [k, sel] of Object.entries(homeSelections)) {
      const mKey = k.slice(0, 7);
      const b = buckets.find(x => x.key === mKey);
      if (!b) continue;
      if (sel === 'attended') b.att += 1;
      else if (sel === 'missed') b.mis += 1;
    }
    return buckets.map(b => ({ ...b, pct: b.att + b.mis === 0 ? null : (b.att / (b.att + b.mis)) * 100 }));
  }, [homeSelections]);

  const rotation = useMemo(() => {
    const cur = subjectMode === 'preloaded' ? getCurrentPresetWard(today) : getCurrentCustomWard();
    if (!cur || cur.ward === 'Holiday') return null;
    let startStr: string | undefined;
    let endStr: string | undefined;
    if (subjectMode === 'preloaded') {
      const y = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const da = String(today.getDate()).padStart(2, '0');
      const todayStr2 = `${y}-${mo}-${da}`;
      const entry = presetWardSchedule.find(s => todayStr2 >= s.start && todayStr2 <= s.end);
      startStr = entry?.start;
      endStr = entry?.end;
    } else {
      const w = cur as { startDate?: string; endDate?: string };
      startStr = w.startDate;
      endStr = w.endDate;
    }
    if (!startStr || !endStr) return null;
    const start = new Date(startStr + 'T12:00:00');
    const end = new Date(endStr + 'T12:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const done = Math.min(total, Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000) + 1));
    return { name: cur.ward, total, done, pct: (done / total) * 100 };
  }, [subjectMode, getCurrentPresetWard, getCurrentCustomWard, presetWardSchedule, today]);

  const [monthSel, setMonthSel] = useState<number | null>(null);
  const [attnOpen, setAttnOpen] = useState(false);

  /* ═══════════ ROTATION WHEEL — window-level drag (no pointer capture) ═══════════ */
  const allRotations = useMemo(() => {
    const list: { name: string; start: string; end: string }[] = [];
    if (subjectMode === 'preloaded') presetWardSchedule.forEach(ws => list.push({ name: ws.ward, start: ws.start, end: ws.end }));
    customWards.forEach(w => list.push({ name: w.name, start: w.startDate, end: w.endDate }));
    list.sort((a, b) => a.start.localeCompare(b.start));
    return list;
  }, [subjectMode, customWards, presetWardSchedule]);

  const currentIndex = useMemo(() => {
    if (allRotations.length === 0) return 0;
    for (let i = 0; i < allRotations.length; i++) {
      const s = new Date(allRotations[i].start + 'T12:00:00');
      const e = new Date(allRotations[i].end + 'T12:00:00');
      if (today >= s && today <= e) return i;
    }
    for (let i = 0; i < allRotations.length; i++) if (today < new Date(allRotations[i].start + 'T12:00:00')) return i;
    return allRotations.length - 1;
  }, [allRotations, today]);

  const [activeIndex, setActiveIndex] = useState(currentIndex);
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const [settling, setSettling] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const totalItems = allRotations.length;
  const wrapIndex = (idx: number) => ((idx % totalItems) + totalItems) % totalItems;

  useEffect(() => { setActiveIndex(currentIndex); }, [currentIndex]);
  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (wheelRef.current && !wheelRef.current.contains(e.target as Node)) {
        setSettling(true);
        setActiveIndex(currentIndex);
        offsetRef.current = 0;
        setOffset(0);
      }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [currentIndex]);

  const CARD_STEP = 240;
  const onMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    offsetRef.current += dx;
    setOffset(offsetRef.current);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    const steps = Math.round(-offsetRef.current / CARD_STEP);
    setSettling(true);
    if (steps !== 0) setActiveIndex(i => wrapIndex(i + steps));
    offsetRef.current = 0;
    setOffset(0);
  };
  const onDown = (e: React.PointerEvent) => {
    if (totalItems === 0) return;
    dragging.current = true;
    setSettling(false);
    lastX.current = e.clientX;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  useEffect(() => () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }, []);

  const wheelItems = totalItems === 0 ? [] : [
    { item: allRotations[wrapIndex(activeIndex - 1)], position: 'left' },
    { item: allRotations[wrapIndex(activeIndex)], position: 'center' },
    { item: allRotations[wrapIndex(activeIndex + 1)], position: 'right' },
  ];
  const todayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()];

  /* ── Columns: base preset + extra (custom + SGT), chronological ── */
  const columns = useMemo<GridColumn[]>(() => {
    const extra: GridColumn[] = [];
    const push = (r: { start: number; end: number }) => {
      if (coveredByBase(r)) return;
      if (!extra.some(c => c.start === r.start && c.end === r.end)) extra.push({ ...r, base: false, id: `x${r.start}-${r.end}` });
    };
    DAYS_ORDER.forEach(day => {
      (presetTimetable[DAY_INDEX_MAP[day]] || []).forEach(slot => {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') return;
        if (!slot.subjects || slot.subjects.length === 0) return;
        const m = parseRangeToMinutes(slot.time);
        if (m) push(m);
      });
    });
    // SGT time ranges also contribute columns
    sgtEntries.forEach(e => push({ start: e.start, end: e.end }));
    const base = BASE_PRESET_COLS.map((c, i) => ({ ...c, base: true, id: `b${i}` }));
    return [...base, ...extra].sort((a, b) => a.start - b.start);
  }, [presetTimetable, sgtEntries]);

  /* ── Grid cells (academic slots + SGT merged into the same table) ── */
  const timetableGrid = useMemo(() => {
    const rows = DAYS_ORDER.map(day => {
      if (day === 'Fri') return { day, cells: [{ key: 'hol', colStart: 0, span: columns.length, subjects: [] as string[], sgt: [] as string[], isRest: false, isHoliday: true, rowspan: 1, hidden: false }] };
      const dayIdx = DAY_INDEX_MAP[day];

      // Academic slots for this day
      const slots: Array<{ time: string; subjects: string[]; sgt: string[] }> = (presetTimetable[dayIdx] || [])
        .filter(s => s.type !== 'ward' && s.type !== 'ward_replacement' && s.subjects && s.subjects.length > 0)
        .map(s => ({ time: s.time, subjects: s.subjects, sgt: [] as string[] }));

      // Merge SGT entries into the same day: attach to a matching academic
      // column when start times match, otherwise create their own slot.
      sgtEntries.filter(e => e.day === day).forEach(e => {
        const host = slots.find(sl => {
          const m = parseRangeToMinutes(sl.time);
          return m && m.start === e.start;
        });
        if (host) host.sgt.push(e.name);
        else slots.push({ time: e.range, subjects: [], sgt: [e.name] });
      });

      const consumed = new Set<string>();
      const cells: Array<{ key: string; colStart: number; span: number; subjects: string[]; sgt: string[]; isRest: boolean; isHoliday?: boolean; rowspan: number; hidden: boolean }> = [];
      columns.forEach((col, ci) => {
        if (consumed.has(col.id)) return;
        const covering = slots.find(s => {
          const m = parseRangeToMinutes(s.time);
          return m && m.start === col.start;
        });
        if (!covering) { consumed.add(col.id); cells.push({ key: col.id, colStart: ci, span: 1, subjects: [], sgt: [], isRest: false, rowspan: 1, hidden: false }); return; }
        const m = parseRangeToMinutes(covering.time)!;
        let span = 1;
        for (let k = ci + 1; k < columns.length; k++) {
          if (columns[k].end <= m.end) { span++; consumed.add(columns[k].id); } else break;
        }
        consumed.add(col.id);
        cells.push({ key: col.id, colStart: ci, span, subjects: covering.subjects, sgt: covering.sgt, isRest: covering.subjects[0] === 'Rest', rowspan: 1, hidden: false });
      });
      return { day, cells };
    });

    const sig = (c: { isHoliday?: boolean; subjects: string[]; sgt: string[]; colStart: number; span: number; isRest: boolean }) =>
      (c.isHoliday || (c.subjects.length === 0 && c.sgt.length === 0)) ? null : `${c.colStart}|${c.span}|${c.isRest ? 'REST' : [...c.subjects, ...c.sgt.map(n => `SGT:${n}`)].join('/')}`;
    for (let r = 1; r < rows.length; r++) {
      for (const cell of rows[r].cells) {
        const s = sig(cell);
        if (!s) continue;
        let rr = r - 1;
        let target: typeof cell | null = null;
        while (rr >= 0) {
          const cand = rows[rr].cells.find(c => sig(c) === s);
          if (!cand) break;
          if (!cand.hidden) { target = cand; break; }
          rr--;
        }
        if (target) { target.rowspan += 1; cell.hidden = true; }
      }
    }
    return rows;
  }, [presetTimetable, columns, sgtEntries]);

  const dense = columns.length >= 6;
  const overallColor = overall.pct >= target ? 'text-emerald-500' : overall.pct >= target - 10 ? 'text-amber-500' : 'text-rose-500';
  const rotationStatus = (r: { start: string; end: string }) => {
    const s = new Date(r.start + 'T12:00:00');
    const e = new Date(r.end + 'T12:00:00');
    if (today > e) return 'Completed';
    if (today >= s && today <= e) return 'Ongoing';
    return 'Upcoming';
  };

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pb-8">
        <div>
          <h1 className="text-lg font-extrabold text-foreground leading-tight">Weekly Routine & Rotations</h1>
        </div>

        {/* ═══════════ WEEKLY TIME TABLE (academic + SGT in one grid) ═══════════ */}
        <section className="bg-card border border-border rounded-2xl p-3.5 shadow-sm space-y-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary text-center">Academic</h3>
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-left border-collapse table-fixed" style={{ minWidth: `${40 + columns.length * 56}px` }}>
              <thead>
                <tr>
                  <th className="w-10 border border-border/40 px-1 py-1.5 text-[8px] font-bold text-muted-foreground text-center">DAY</th>
                  {columns.map(col => {
                    const h = columnHeader(col);
                    return (
                      <th key={col.id} className="border border-border/40 px-1 py-1.5 text-center align-top">
                        <div className={cn('font-bold text-foreground/80 whitespace-nowrap', dense ? 'text-[7px]' : 'text-[8px]')}>{h.nums}</div>
                        <div className={cn('text-muted-foreground font-semibold whitespace-nowrap', dense ? 'text-[6px]' : 'text-[7px]')}>{h.period}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {timetableGrid.map(row => (
                  <tr key={row.day}>
                    <td className="border border-border/40 px-1.5 py-2 text-[10px] font-bold text-foreground text-center">
                      {row.day}{row.day === todayAbbr && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle" />}
                    </td>
                    {row.cells.filter(cell => !cell.hidden).map(cell => cell.isHoliday ? (
                      <td key={cell.key} colSpan={cell.span} className="border border-border/40 text-center text-[10px] font-bold text-muted-foreground tracking-[0.3em] py-4">HOLIDAY</td>
                    ) : (
                      <td key={cell.key} colSpan={cell.span} rowSpan={cell.rowspan > 1 ? cell.rowspan : undefined} className={cn('border border-border/40 p-1 text-center align-middle', cell.isRest && 'bg-muted/20')}>
                        {cell.subjects.length === 0 && cell.sgt.length === 0 ? (
                          <span className="text-muted-foreground/40 text-[9px]">—</span>
                        ) : cell.isRest ? (
                          <span className="text-[9px] font-bold text-muted-foreground">Rest</span>
                        ) : (
                          <span className="text-[9px] font-semibold leading-tight flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
                            {cell.subjects.length > 0 && (
                              <span style={{ color: getSubjectColor(cell.subjects[0]) }}>
                                {cell.subjects.map(shortenSubject).join(' / ')}
                              </span>
                            )}
                            {cell.sgt.map(n => (
                              <span key={n} className="inline-flex items-center gap-0.5" style={{ color: getSubjectColor(n) }}>
                                {shortenSubject(n)}
                                <span className="text-[6px] font-extrabold uppercase tracking-wider px-1 py-px rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/30">SGT</span>
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ═══════════ CLINICAL / WARD ROTATION WHEEL ═══════════ */}
        <section className="bg-card border border-border rounded-2xl p-3.5 shadow-sm space-y-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-primary text-center">Clinical / Ward Rotation</h3>
          {totalItems === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No rotations scheduled.</p>
          ) : (
            <div
              ref={wheelRef}
              className="relative overflow-hidden select-none py-2"
              style={{ touchAction: 'none' }}
              onPointerDown={onDown}
            >
              <div
                className="relative h-44"
                style={{ transform: `translateX(${offset}px)`, transition: settling && !dragging.current ? 'transform 0.25s ease-out' : 'none' }}
              >
                {wheelItems.map(({ item, position }) => {
                  const status = rotationStatus(item);
                  const posCls = position === 'center'
                    ? 'left-1/2 -translate-x-1/2 z-10 scale-100 opacity-100'
                    : position === 'left'
                      ? 'left-1/2 -translate-x-[115%] scale-90 opacity-50'
                      : 'left-1/2 translate-x-[15%] scale-90 opacity-50';
                  return (
                    <div key={position} className={cn('absolute top-2 w-[75%] rounded-3xl border p-4 text-center transition-all', posCls, status === 'Ongoing' ? 'border-violet-500/60 shadow-[0_0_25px_rgba(139,92,246,0.25)]' : 'border-border/60', 'bg-card')}>
                      <p className="text-base font-extrabold text-foreground truncate" style={{ color: getSubjectColor(item.name) }}>{item.name}</p>
                      <p className="text-xs text-muted-foreground font-medium mt-1">{formatISODateDDMMYY(item.start)} – {formatISODateDDMMYY(item.end)}</p>
                      <span className={cn('inline-block mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full border', status === 'Ongoing' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : status === 'Completed' ? 'bg-muted/40 text-muted-foreground border-border/50' : 'bg-primary/10 text-primary border-primary/20')}>
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-muted-foreground/60 text-center italic mt-1">Drag to browse · tap outside to return to current rotation</p>
            </div>
          )}
        </section>

        {/* ═══════════ STATISTICS ═══════════ */}
        <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-3.5 space-y-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Overall — every subject & ward combined</p>
              <div className="flex items-center gap-3">
                <div className="relative w-11 h-11 shrink-0">
                  <svg width="44" height="44" className="transform -rotate-90">
                    <circle cx="22" cy="22" r="18" strokeWidth="4" className="text-muted/20" stroke="currentColor" fill="transparent" />
                    <circle cx="22" cy="22" r="18" strokeWidth="4" stroke={overall.pct >= target ? '#10b981' : overall.pct >= target - 10 ? '#f59e0b' : '#f43f5e'} strokeDasharray={2 * Math.PI * 18} strokeDashoffset={(2 * Math.PI * 18) * (1 - Math.min(100, overall.pct) / 100)} strokeLinecap="round" fill="transparent" />
                  </svg>
                  <span className={cn('absolute inset-0 flex items-center justify-center text-[9px] font-extrabold', overallColor)}>{overall.pct.toFixed(0)}%</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[10px] text-muted-foreground font-medium">
                    Attended <strong className="text-foreground">{overall.att}</strong> · Missed <strong className="text-foreground">{overall.mis}</strong> · Off <strong className="text-foreground">{overall.off}</strong>
                  </p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">of every class that happened — lectures + wards together</p>
                </div>
                <span className="text-[9px] font-extrabold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">Can miss {overall.canMiss}</span>
              </div>
            </div>
            {rotation && (
              <div className="border-t border-border/40 pt-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1.5">Current posting · info only</p>
                <div className="flex justify-between text-[9px] font-semibold text-muted-foreground mb-1">
                  <span className="truncate">Where you are today: <strong className="text-foreground">{rotation.name}</strong></span>
                  <span>{rotation.done}/{rotation.total} days</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${rotation.pct}%` }} />
                </div>
                <p className="text-[8px] text-muted-foreground/60 mt-1">This line does not change the numbers above.</p>
              </div>
            )}
            <div className="border-t border-border/40 pt-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Last 6 Months</p>
              <div className="flex items-end justify-between gap-1.5 h-14">
                {months.map((m, i) => (
                  <button key={m.key} type="button" onClick={() => setMonthSel(prev => prev === i ? null : i)} className="flex-1 flex flex-col items-center gap-1 cursor-pointer">
                    <div className={cn('w-full rounded-t-md transition-all', monthSel === i ? 'bg-primary' : m.pct === null ? 'bg-muted/30' : m.pct >= target ? 'bg-emerald-500/70' : m.pct >= target - 10 ? 'bg-amber-500/70' : 'bg-rose-500/70')} style={{ height: m.pct === null ? 4 : `${Math.max(8, m.pct * 0.4)}px` }} />
                    <span className="text-[8px] font-bold text-muted-foreground">{m.label}</span>
                  </button>
                ))}
              </div>
              {monthSel !== null && months[monthSel] && (
                <p className="text-[10px] text-foreground font-semibold text-center mt-2">
                  {months[monthSel].label}: {months[monthSel].pct === null ? 'no classes' : `${months[monthSel].pct.toFixed(0)}% (${months[monthSel].att}/${months[monthSel].att + months[monthSel].mis})`}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Needs Attention</p>
              {attention.length === 0 ? (
                <p className="text-[10px] text-emerald-500 font-semibold">All subjects on track.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {attention.map(a => (
                    <button key={a.name} type="button" onClick={() => setAttnOpen(o => !o)} className="text-[9px] font-bold px-2 py-1 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 cursor-pointer">
                      {a.name} · {a.pct.toFixed(0)}%
                    </button>
                  ))}
                </div>
              )}
              {attnOpen && attention.length > 0 && (
                <div className="mt-2 space-y-1">
                  {attention.map(a => (
                    <p key={a.name} className="text-[10px] text-muted-foreground">
                      <strong className="text-foreground">{a.name}</strong> — attend next <strong className="text-rose-500">{a.needed}</strong> to recover.
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </motion.div>
    </Layout>
  );
}
