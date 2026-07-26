import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CATEGORIES, WARD_SUBJECTS, INTEGRATED_SUBJECTS } from '@/lib/constants';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';
import { snapshotBeforeEdit, snapshotDayComplete } from '@/utils/snapshotUtils';

export type AttendanceData = { attended: number; missed: number };
export type SelectionType = 'off' | 'missed' | 'attended';

interface AttendanceContextType {
  subjects: Record<string, AttendanceData>;
  wards: Record<string, AttendanceData>;
  homeSelections: Record<string, SelectionType>;
  preferredPercentage: number;
  setPreferredPercentage: (p: number) => void;
  updateSubject: (subject: string, attended: number, missed: number) => void;
  updateWard: (ward: string, attended: number, missed: number) => void;
  updateHomeSelection: (homeKey: string, subject: string, selection: SelectionType, isWard: boolean, totalCardsOnScreen?: number) => void;
  resetAllData: () => void;
  clearModeAttendance: (mode: 'preloaded' | 'custom') => void;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

const SUBJECTS_KEY = 'attendance_tracker_subjects';
const WARD_KEY = 'attendance_tracker_ward';
const HOME_SELECTIONS_KEY = 'attendance_tracker_home_selections';
const PREFERRED_PERCENTAGE_KEY = 'attendance_tracker_preferred_percentage';

export const AttendanceProvider = ({ children }: { children: ReactNode }) => {
  const [subjects, setSubjects] = useState<Record<string, AttendanceData>>({});
  const [wards, setWards] = useState<Record<string, AttendanceData>>({});
  const [homeSelections, setHomeSelections] = useState<Record<string, SelectionType>>({});
  const [preferredPercentage, setPreferredPercentage] = useState<number>(75);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SUBJECTS_KEY);
      if (s) setSubjects(JSON.parse(s));
      
      const w = localStorage.getItem(WARD_KEY);
      if (w) setWards(JSON.parse(w));
      
      const p = localStorage.getItem(PREFERRED_PERCENTAGE_KEY);
      if (p) setPreferredPercentage(JSON.parse(p));

      const h = localStorage.getItem(HOME_SELECTIONS_KEY);
      if (h) {
        const raw: Record<string, string> = JSON.parse(h);
        const VALID: ReadonlySet<string> = new Set(['attended', 'missed', 'off']);
        const migrated: Record<string, SelectionType> = {};
        for (const [k, v] of Object.entries(raw)) {
          const mapped = v === 'holiday' ? 'off' : v;
          if (VALID.has(mapped)) migrated[k] = mapped as SelectionType;
        }
        if (Object.keys(migrated).length !== Object.keys(raw).length ||
            Object.entries(migrated).some(([k, v]) => raw[k] !== v)) {
          localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(migrated));
          storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(migrated));
        }
        setHomeSelections(migrated);
      }
    } catch (e) {
       // console.error('Failed to load attendance data', e);
    }
  }, []);

  const savePreferredPercentage = (p: number) => {
    setPreferredPercentage(p);
    localStorage.setItem(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
    storageSetItem(PREFERRED_PERCENTAGE_KEY, JSON.stringify(p));
  };

  const updateSubject = (subject: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${subject}`);
    setSubjects(prev => {
      const updated = { ...prev, [subject]: { attended, missed } };
      localStorage.setItem(SUBJECTS_KEY, JSON.stringify(updated));
      storageSetItem(SUBJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const updateWard = (ward: string, attended: number, missed: number) => {
    snapshotBeforeEdit(`Edit ${ward}`);
    setWards(prev => {
      const updated = { ...prev, [ward]: { attended, missed } };
      localStorage.setItem(WARD_KEY, JSON.stringify(updated));
      storageSetItem(WARD_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const updateHomeSelection = (
    homeKey: string, 
    subject: string, 
    selection: SelectionType, 
    isWard: boolean,
    totalCardsOnScreen?: number
  ) => {
    const previous = homeSelections[homeKey];
    let newSelections: Record<string, SelectionType>;

    if (previous === selection) {
      // Toggle off selection
      const { [homeKey]: _removed, ...rest } = homeSelections;
      newSelections = rest;
    } else {
      // Toggle to new selection
      newSelections = { ...homeSelections, [homeKey]: selection };
    }

    // Persist home selections synchronously first
    setHomeSelections(newSelections);
    localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(newSelections));
    storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(newSelections));

    // Calculate count diffs
    let deltaAttended = 0;
    let deltaMissed = 0;
    if (previous === 'attended') deltaAttended -= 1;
    if (previous === 'missed')   deltaMissed   -= 1;
    if (previous !== selection) {
      if (selection === 'attended') deltaAttended += 1;
      if (selection === 'missed')   deltaMissed   += 1;
    }

    if (isWard) {
      setWards(prev => {
        const current = prev[subject] || { attended: 0, missed: 0 };
        const updated = {
          ...prev,
          [subject]: {
            attended: Math.max(0, current.attended + deltaAttended),
            missed: Math.max(0, current.missed + deltaMissed)
          }
        };
        localStorage.setItem(WARD_KEY, JSON.stringify(updated));
        storageSetItem(WARD_KEY, JSON.stringify(updated));
        return updated;
      });
    } else {
      setSubjects(prev => {
        const current = prev[subject] || { attended: 0, missed: 0 };
        const updated = {
          ...prev,
          [subject]: {
            attended: Math.max(0, current.attended + deltaAttended),
            missed: Math.max(0, current.missed + deltaMissed)
          }
        };
        localStorage.setItem(SUBJECTS_KEY, JSON.stringify(updated));
        storageSetItem(SUBJECTS_KEY, JSON.stringify(updated));
        return updated;
      });
    }

    // Evaluate Day Completion status correctly based on total card count
    const targetCardCount = totalCardsOnScreen || (Object.keys(subjects).length + Object.keys(wards).length);
    const markedCount = Object.keys(newSelections).length;

    if (targetCardCount > 0 && markedCount >= targetCardCount) {
      snapshotDayComplete(true);
    } else {
      snapshotDayComplete(false);
    }
  };

  /** Wipes all attendance data from state and IndexedDB/localStorage. Called when starting fresh. */
  const resetAllData = () => {
    snapshotBeforeEdit('Reset All Data');

    localStorage.removeItem(SUBJECTS_KEY);
    localStorage.removeItem(WARD_KEY);
    localStorage.removeItem(HOME_SELECTIONS_KEY);
    storageRemoveItem(SUBJECTS_KEY);
    storageRemoveItem(WARD_KEY);
    storageRemoveItem(HOME_SELECTIONS_KEY);
    setSubjects({});
    setWards({});
    setHomeSelections({});
  };

  const clearModeAttendance = (mode: 'preloaded' | 'custom') => {
    snapshotBeforeEdit(`Clear ${mode}`);

    const newSubjects = { ...subjects };
    const newWards = { ...wards };
    const newHomeSelections = { ...homeSelections };

    if (mode === 'preloaded') {
      CATEGORIES.forEach(c => {
        c.subjects.forEach(s => {
          delete newSubjects[s.name];
          delete newHomeSelections[`subject-${s.name}`];
        });
      });
      INTEGRATED_SUBJECTS.forEach(s => {
        delete newSubjects[s.name];
        delete newHomeSelections[`subject-${s.name}`];
      });
      WARD_SUBJECTS.forEach(w => {
        delete newWards[`ward-${w.name}`];
        delete newHomeSelections[`ward-${w.name}`];
      });
    } else {
      const preloadedNames = new Set<string>();
      CATEGORIES.forEach(c => c.subjects.forEach(s => preloadedNames.add(s.name)));
      INTEGRATED_SUBJECTS.forEach(s => preloadedNames.add(s.name));
      WARD_SUBJECTS.forEach(w => preloadedNames.add(w.name));

      Object.keys(newSubjects).forEach(name => {
        if (!preloadedNames.has(name)) {
          delete newSubjects[name];
          delete newHomeSelections[`subject-${name}`];
        }
      });
      
      Object.keys(newWards).forEach(key => {
        const name = key.replace('ward-', '');
        if (!preloadedNames.has(name)) {
          delete newWards[key];
          delete newHomeSelections[key];
        }
      });
    }

    setSubjects(newSubjects);
    setWards(newWards);
    setHomeSelections(newHomeSelections);
    localStorage.setItem(SUBJECTS_KEY, JSON.stringify(newSubjects));
    localStorage.setItem(WARD_KEY, JSON.stringify(newWards));
    localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(newHomeSelections));
    storageSetItem(SUBJECTS_KEY, JSON.stringify(newSubjects));
    storageSetItem(WARD_KEY, JSON.stringify(newWards));
    storageSetItem(HOME_SELECTIONS_KEY, JSON.stringify(newHomeSelections));
  };

  return (
    <AttendanceContext.Provider value={{ subjects, wards, homeSelections, preferredPercentage, setPreferredPercentage: savePreferredPercentage, updateSubject, updateWard, updateHomeSelection, resetAllData, clearModeAttendance }}>
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (context === undefined) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
};
