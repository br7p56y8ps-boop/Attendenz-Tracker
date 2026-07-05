import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getCurrentDateStr } from '@/lib/utils';

export interface CustomSubject {
  id: string;
  name: string;
  subjectType: 'single' | 'allied';
  plannedClasses: number;
  days: string;
  time: string;
  category?: string; // group name for allied subjects
}

export interface CustomWard {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

const CUSTOM_SUBJECTS_KEY = 'att_custom_subjects';
const CUSTOM_WARDS_KEY = 'att_custom_wards';

interface CustomDataContextType {
  customSubjects: CustomSubject[];
  customWards: CustomWard[];
  addCustomSubject: (s: Omit<CustomSubject, 'id'>) => void;
  removeCustomSubject: (id: string) => void;
  addCustomWard: (w: Omit<CustomWard, 'id'>) => void;
  removeCustomWard: (id: string) => void;
  getCurrentCustomWard: () => CustomWard | null;
}

const CustomDataContext = createContext<CustomDataContextType | undefined>(undefined);

export const CustomDataProvider = ({ children }: { children: ReactNode }) => {
  const [customSubjects, setCustomSubjects] = useState<CustomSubject[]>([]);
  const [customWards, setCustomWards] = useState<CustomWard[]>([]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(CUSTOM_SUBJECTS_KEY);
      if (s) setCustomSubjects(JSON.parse(s));
      const w = localStorage.getItem(CUSTOM_WARDS_KEY);
      if (w) setCustomWards(JSON.parse(w));
    } catch { /* ignore */ }
  }, []);

  const saveSubjects = (data: CustomSubject[]) => {
    setCustomSubjects(data);
    localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(data));
  };

  const saveWards = (data: CustomWard[]) => {
    setCustomWards(data);
    localStorage.setItem(CUSTOM_WARDS_KEY, JSON.stringify(data));
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

  return (
    <CustomDataContext.Provider value={{
      customSubjects, customWards,
      addCustomSubject, removeCustomSubject,
      addCustomWard, removeCustomWard,
      getCurrentCustomWard,
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
