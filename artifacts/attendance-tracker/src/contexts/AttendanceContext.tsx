import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type AttendanceData = { attended: number; missed: number };
export type SelectionType = 'off' | 'missed' | 'attended';

interface AttendanceContextType {
  subjects: Record<string, AttendanceData>;
  wards: Record<string, AttendanceData>;
  homeSelections: Record<string, SelectionType>;
  updateSubject: (subject: string, attended: number, missed: number) => void;
  updateWard: (ward: string, attended: number, missed: number) => void;
  updateHomeSelection: (homeKey: string, subject: string, selection: SelectionType, isWard: boolean) => void;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

const SUBJECTS_KEY = 'attendance_tracker_subjects';
const WARD_KEY = 'attendance_tracker_ward';
const HOME_SELECTIONS_KEY = 'attendance_tracker_home_selections';

export const AttendanceProvider = ({ children }: { children: ReactNode }) => {
  const [subjects, setSubjects] = useState<Record<string, AttendanceData>>({});
  const [wards, setWards] = useState<Record<string, AttendanceData>>({});
  const [homeSelections, setHomeSelections] = useState<Record<string, SelectionType>>({});

  useEffect(() => {
    try {
      const s = localStorage.getItem(SUBJECTS_KEY);
      if (s) setSubjects(JSON.parse(s));
      
      const w = localStorage.getItem(WARD_KEY);
      if (w) setWards(JSON.parse(w));
      
      const h = localStorage.getItem(HOME_SELECTIONS_KEY);
      if (h) {
        const raw: Record<string, string> = JSON.parse(h);
        // Migrate legacy 'holiday' → 'off'; drop any other unknown values
        const VALID: ReadonlySet<string> = new Set(['attended', 'missed', 'off']);
        const migrated: Record<string, SelectionType> = {};
        for (const [k, v] of Object.entries(raw)) {
          const mapped = v === 'holiday' ? 'off' : v;
          if (VALID.has(mapped)) migrated[k] = mapped as SelectionType;
        }
        // Persist back only if anything changed
        if (Object.keys(migrated).length !== Object.keys(raw).length ||
            Object.entries(migrated).some(([k, v]) => raw[k] !== v)) {
          localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(migrated));
        }
        setHomeSelections(migrated);
      }
    } catch (e) {
      console.error('Failed to load attendance data', e);
    }
  }, []);

  const saveSubjects = (data: Record<string, AttendanceData>) => {
    setSubjects(data);
    localStorage.setItem(SUBJECTS_KEY, JSON.stringify(data));
  };

  const saveWards = (data: Record<string, AttendanceData>) => {
    setWards(data);
    localStorage.setItem(WARD_KEY, JSON.stringify(data));
  };

  const saveHomeSelections = (data: Record<string, SelectionType>) => {
    setHomeSelections(data);
    localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(data));
  };

  const updateSubject = (subject: string, attended: number, missed: number) => {
    saveSubjects({
      ...subjects,
      [subject]: { attended, missed }
    });
  };

  const updateWard = (ward: string, attended: number, missed: number) => {
    saveWards({
      ...wards,
      [ward]: { attended, missed }
    });
  };

  // homeKey  — the exact key used in homeSelections (includes sessionId suffix for per-slot uniqueness)
  // subject  — the attendance-data lookup key (e.g. 'Surgery' or 'ward-General Surgery')
  const updateHomeSelection = (homeKey: string, subject: string, selection: SelectionType, isWard: boolean) => {
    const previous = homeSelections[homeKey];

    let targetData = isWard ? { ...wards } : { ...subjects };
    const current = targetData[subject] || { attended: 0, missed: 0 };
    let newAttended = current.attended;
    let newMissed = current.missed;

    if (previous === selection) {
      // Toggle OFF — revert the previous count effect and remove the selection
      if (previous === 'attended') newAttended = Math.max(0, newAttended - 1);
      if (previous === 'missed')   newMissed   = Math.max(0, newMissed   - 1);

      if (isWard) {
        saveWards({ ...targetData, [subject]: { attended: newAttended, missed: newMissed } });
      } else {
        saveSubjects({ ...targetData, [subject]: { attended: newAttended, missed: newMissed } });
      }

      // Remove the selection key entirely
      const { [homeKey]: _removed, ...rest } = homeSelections;
      setHomeSelections(rest);
      localStorage.setItem(HOME_SELECTIONS_KEY, JSON.stringify(rest));
    } else {
      // Switch — revert previous, apply new
      if (previous === 'attended') newAttended = Math.max(0, newAttended - 1);
      if (previous === 'missed')   newMissed   = Math.max(0, newMissed   - 1);

      if (selection === 'attended') newAttended += 1;
      if (selection === 'missed')   newMissed   += 1;

      if (isWard) {
        saveWards({ ...targetData, [subject]: { attended: newAttended, missed: newMissed } });
      } else {
        saveSubjects({ ...targetData, [subject]: { attended: newAttended, missed: newMissed } });
      }

      saveHomeSelections({ ...homeSelections, [homeKey]: selection });
    }
  };

  return (
    <AttendanceContext.Provider value={{ subjects, wards, homeSelections, updateSubject, updateWard, updateHomeSelection }}>
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
