import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCurrentDateStr } from '@/lib/utils';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';
import { TIMETABLE, WARD_SCHEDULE, CATEGORIES, INTEGRATED_SUBJECTS, WARD_SUBJECTS } from '@/lib/constants';

export interface CustomSubject {
  id: string;
  name: string;
  subjectType: 'single' | 'allied';
  plannedClasses: number;
  days: string;
  time: string;
  category?: string;
  schedules?: Array<{ day: string; time: string }>;
}

export interface CustomWard {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  morningTime?: string;
  eveningTime?: string;
}

export type SubjectMode = 'preloaded' | 'custom';

const CUSTOM_SUBJECTS_KEY = 'att_custom_subjects';
const CUSTOM_WARDS_KEY = 'att_custom_wards';
const SUBJECT_MODE_KEY = 'att_subject_mode';
const SETUP_DONE_KEY = 'att_setup_done';
const WHATS_NEW_KEY = 'att_whats_new_v4.0.0';

interface CustomDataContextType {
  customSubjects: CustomSubject[];
  customWards: CustomWard[];
  subjectMode: SubjectMode;
  setupDone: boolean;
  whatsNewOpen: boolean;
  setWhatsNewOpen: (b: boolean) => void;
  addCustomSubject: (s: Omit<CustomSubject, 'id'>) => void;
  removeCustomSubject: (id: string) => void;
  addCustomWard: (w: Omit<CustomWard, 'id'>) => void;
  removeCustomWard: (id: string) => void;
  getCurrentCustomWard: () => CustomWard | null;
  completeSetup: (mode: SubjectMode) => void;
  startFresh: () => void;
  changeSubjectMode: (mode: SubjectMode) => void;
  clearRoutineData: (mode: SubjectMode) => void;
  presetTimetable: typeof TIMETABLE;
  presetWardSchedule: Array<{ start: string; end: string; ward: string; morningTime?: string; eveningTime?: string }>;
  presetSubjectTotals: Record<string, number>;
  getSubjectPlannedTotal: (subjectName: string) => number;
  getCurrentPresetWard: (date?: Date) => { ward: string; morningTime?: string; eveningTime?: string } | null;
  getPresetWardTotalPlanned: (wardName: string) => number;
  getCustomWardTotalPlanned: (startDateStr: string, endDateStr: string) => number;
  updatePresetTimetableSlot: (currentDay: number, slotIndex: number, updatedTime: string, updatedSubjects: string[], targetDay: number) => void;
  updatePresetWardSchedule: (index: number, start: string, end: string, morningTime?: string, eveningTime?: string) => void;
  updatePresetSubjectTotal: (subjectName: string, total: number) => void;
}

const CustomDataContext = createContext<CustomDataContextType | undefined>(undefined);

export const CustomDataProvider = ({ children }: { children: ReactNode }) => {
  const [customSubjects, setCustomSubjects] = useState<CustomSubject[]>([]);
  const [customWards, setCustomWards] = useState<CustomWard[]>([]);
  const [subjectMode, setSubjectMode] = useState<SubjectMode>('preloaded');
  const [setupDone, setSetupDone] = useState(false);
  const [whatsNewOpen, setWhatsNewOpenState] = useState(false);

  const [presetTimetable, setPresetTimetable] = useState<typeof TIMETABLE>(TIMETABLE);
  const [presetWardSchedule, setPresetWardSchedule] = useState<Array<{ start: string; end: string; ward: string; morningTime?: string; eveningTime?: string }>>(() => {
    return WARD_SCHEDULE.map(ws => ({ ...ws, morningTime: '09:30–11:30', eveningTime: '07:00–09:00 PM' }));
  });
  const [presetSubjectTotals, setPresetSubjectTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const s = localStorage.getItem(CUSTOM_SUBJECTS_KEY);
      if (s) setCustomSubjects(JSON.parse(s));
      const w = localStorage.getItem(CUSTOM_WARDS_KEY);
      if (w) setCustomWards(JSON.parse(w));
      const m = localStorage.getItem(SUBJECT_MODE_KEY) as SubjectMode | null;
      if (m === 'preloaded' || m === 'custom') setSubjectMode(m);
      const done = localStorage.getItem(SETUP_DONE_KEY);
      if (done === 'true') setSetupDone(true);
      else setSetupDone(false);

      const seenWhatsNew = localStorage.getItem(WHATS_NEW_KEY);
      if (seenWhatsNew !== 'true') setWhatsNewOpenState(true);

      const pt = localStorage.getItem('att_preset_timetable');
      if (pt) setPresetTimetable(JSON.parse(pt));
      const pws = localStorage.getItem('att_preset_ward_schedule');
      if (pws) setPresetWardSchedule(JSON.parse(pws));
      const pst = localStorage.getItem('att_preset_subject_totals');
      if (pst) setPresetSubjectTotals(JSON.parse(pst));
    } catch { /* ignore */ }
  }, []);

  const handleSetWhatsNewOpen = (open: boolean) => {
    if (!open) storageSetItem(WHATS_NEW_KEY, 'true');
    setWhatsNewOpenState(open);
  };

  const saveSubjects = (data: CustomSubject[]) => {
    setCustomSubjects(data);
    storageSetItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(data));
  };

  const saveWards = (data: CustomWard[]) => {
    setCustomWards(data);
    storageSetItem(CUSTOM_WARDS_KEY, JSON.stringify(data));
  };

  const addCustomSubject = (s: Omit<CustomSubject, 'id'>) => {
    const newItem: CustomSubject = { ...s, id: `cs_${Date.now()}_${Math.random().toString(36).slice(2)}` };
    saveSubjects([...customSubjects, newItem]);
  };

  const removeCustomSubject = (id: string) => {
    saveSubjects(customSubjects.filter(s => s.id !== id));
  };

  const addCustomWard = (w: Omit<CustomWard, 'id'>) => {
    const newItem: CustomWard = { ...w, id: `cw_${Date.now()}_${Math.random().toString(36).slice(2)}` };
    saveWards([...customWards, newItem]);
  };

  const removeCustomWard = (id: string) => {
    saveWards(customWards.filter(w => w.id !== id));
  };

  const getCurrentCustomWard = (): CustomWard | null => {
    const today = getCurrentDateStr();
    return customWards.find(w => today >= w.startDate && today <= w.endDate) ?? null;
  };

  const completeSetup = (mode: SubjectMode) => {
    storageSetItem(SUBJECT_MODE_KEY, mode);
    storageSetItem(SETUP_DONE_KEY, 'true');
    setSubjectMode(mode);
    setSetupDone(true);
  };

  const startFresh = () => {
    storageRemoveItem(CUSTOM_SUBJECTS_KEY);
    storageRemoveItem(CUSTOM_WARDS_KEY);
    setCustomSubjects([]);
    setCustomWards([]);
    completeSetup('custom');
  };

  const changeSubjectMode = (mode: SubjectMode) => {
    storageSetItem(SUBJECT_MODE_KEY, mode);
    setSubjectMode(mode);
  };

  const clearRoutineData = (modeToClear: SubjectMode) => {
    if (modeToClear === 'preloaded') {
      storageRemoveItem('att_preset_timetable');
      storageRemoveItem('att_preset_ward_schedule');
      storageRemoveItem('att_preset_subject_totals');
      setPresetTimetable(TIMETABLE);
      setPresetWardSchedule(WARD_SCHEDULE.map(ws => ({ ...ws, morningTime: '09:30–11:30', eveningTime: '07:00–09:00 PM' })));
      setPresetSubjectTotals({});
    } else {
      storageRemoveItem(CUSTOM_SUBJECTS_KEY);
      storageRemoveItem(CUSTOM_WARDS_KEY);
      setCustomSubjects([]);
      setCustomWards([]);
    }
  };

  // ORIGINAL getSubjectPlannedTotal – unchanged
  const getSubjectPlannedTotal = (subjectName: string): number => {
    if (presetSubjectTotals[subjectName] !== undefined) {
      return presetSubjectTotals[subjectName];
    }
    for (const cat of CATEGORIES) {
      const sub = cat.subjects.find(s => s.name === subjectName);
      if (sub) return sub.total;
    }
    const intSub = INTEGRATED_SUBJECTS.find(s => s.name === subjectName);
    if (intSub) return intSub.total;
    const wardSub = WARD_SUBJECTS.find(s => s.name === subjectName);
    if (wardSub) return wardSub.total;
    return 40;
  };

  const getCurrentPresetWard = (date: Date = new Date()): { ward: string; morningTime?: string; eveningTime?: string } | null => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    for (const schedule of presetWardSchedule) {
      if (dateStr >= schedule.start && dateStr <= schedule.end) {
        return {
          ward: schedule.ward,
          morningTime: schedule.morningTime,
          eveningTime: schedule.eveningTime
        };
      }
    }
    return null;
  };

  const getPresetWardTotalPlanned = (wardName: string): number => {
    let count = 0;
    for (const slot of presetWardSchedule) {
      if (slot.ward !== wardName) continue;
      try {
        const start = new Date(slot.start + 'T12:00:00');
        const end = new Date(slot.end + 'T12:00:00');
        const cur = new Date(start);
        while (cur <= end) {
          if (cur.getDay() !== 5) count++;
          cur.setDate(cur.getDate() + 1);
        }
      } catch { /* ignore */ }
    }
    return count * 2;
  };

  const getCustomWardTotalPlanned = (startDateStr: string, endDateStr: string): number => {
    let count = 0;
    try {
      const start = new Date(startDateStr + 'T12:00:00');
      const end = new Date(endDateStr + 'T12:00:00');
      const cur = new Date(start);
      while (cur <= end) {
        if (cur.getDay() !== 5) count++;
        cur.setDate(cur.getDate() + 1);
      }
    } catch { /* ignore */ }
    return count * 2;
  };

  const updatePresetTimetableSlot = (
    currentDay: number,
    slotIndex: number,
    updatedTime: string,
    updatedSubjects: string[],
    targetDay: number
  ) => {
    const updated = { ...presetTimetable };
    const slot = updated[currentDay]?.[slotIndex];
    if (!slot) return;
    const newSlot = { ...slot, time: updatedTime, subjects: updatedSubjects };
    if (currentDay === targetDay) {
      updated[currentDay] = [...updated[currentDay]];
      updated[currentDay][slotIndex] = newSlot;
    } else {
      updated[currentDay] = updated[currentDay].filter((_, i) => i !== slotIndex);
      updated[targetDay] = [...(updated[targetDay] || []), newSlot];
    }
    setPresetTimetable(updated);
    storageSetItem('att_preset_timetable', JSON.stringify(updated));
  };

  const updatePresetWardSchedule = (
    index: number,
    start: string,
    end: string,
    morningTime?: string,
    eveningTime?: string
  ) => {
    const updated = [...presetWardSchedule];
    if (updated[index]) {
      updated[index] = {
        ...updated[index],
        start,
        end,
        morningTime: morningTime ?? updated[index].morningTime,
        eveningTime: eveningTime ?? updated[index].eveningTime
      };
      setPresetWardSchedule(updated);
      storageSetItem('att_preset_ward_schedule', JSON.stringify(updated));
    }
  };

  const updatePresetSubjectTotal = (subjectName: string, total: number) => {
    const updated = { ...presetSubjectTotals, [subjectName]: total };
    setPresetSubjectTotals(updated);
    storageSetItem('att_preset_subject_totals', JSON.stringify(updated));
  };

  return (
    <CustomDataContext.Provider value={{
      customSubjects,
      customWards,
      subjectMode,
      setupDone,
      whatsNewOpen,
      setWhatsNewOpen: handleSetWhatsNewOpen,
      addCustomSubject,
      removeCustomSubject,
      addCustomWard,
      removeCustomWard,
      getCurrentCustomWard,
      completeSetup,
      startFresh,
      changeSubjectMode,
      clearRoutineData,
      presetTimetable,
      presetWardSchedule,
      presetSubjectTotals,
      getSubjectPlannedTotal,
      getCurrentPresetWard,
      getPresetWardTotalPlanned,
      getCustomWardTotalPlanned,
      updatePresetTimetableSlot,
      updatePresetWardSchedule,
      updatePresetSubjectTotal,
    }}>
      {children}
    </CustomDataContext.Provider>
  );
};

export const useCustomData = () => {
  const ctx = useContext(CustomDataContext);
  if (!ctx) throw new Error('useCustomData must be used within CustomDataProvider');
  return ctx;
};