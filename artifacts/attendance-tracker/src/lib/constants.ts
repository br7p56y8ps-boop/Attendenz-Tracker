export const CATEGORIES = [
  {
    name: 'Medicine & Allied',
    subjects: [
      { name: 'Medicine', total: 90 },
      { name: 'Pediatrics', total: 22 },
      { name: 'Psychiatry', total: 18 },
      { name: 'Physical Medicine', total: 4 },
      { name: 'Radiology', total: 5 },
      { name: 'Radiotherapy', total: 8 },
      { name: 'Nuclear Medicine', total: 2 },
    ]
  },
  {
    name: 'Surgery & Allied',
    subjects: [
      { name: 'Surgery', total: 60 },
      { name: 'Orthopedics', total: 45 },
      { name: 'Ophthalmology', total: 26 },
      { name: 'Otolaryngology', total: 26 },
      { name: 'Dermatology', total: 18 },
      { name: 'Neurosurgery', total: 5 },
      { name: 'Urology', total: 10 },
      { name: 'Pediatric Surgery', total: 10 },
      { name: 'Burn & Plastic Surgery', total: 5 },
    ]
  },
  {
    name: 'Obstetrics & Gynaecology',
    subjects: [
      { name: 'Obstetrics & Gynaecology', total: 60 },
    ]
  }
];

// Integrated Teaching subjects — tracked separately from academic subjects.
// Totals based on Sundays (Phase) and Thursdays (Departmental) across the
// Jan 24 – Nov 6 academic year, excluding holiday periods.
export const INTEGRATED_SUBJECTS = [
  { name: 'Phase Integrated Teaching', total: 36 },
  { name: 'Departmental Integrated Teaching', total: 36 },
];

export const WARD_SUBJECTS = [
  { name: 'General Surgery', total: 30 },
  { name: 'Pediatrics', total: 30 },
  { name: 'Internal Medicine', total: 30 },
  { name: 'Dermatology', total: 30 },
  { name: 'Urology', total: 30 },
  { name: 'Pediatric Surgery', total: 30 },
  { name: 'Burn & Plastic Surgery', total: 30 },
  { name: 'Orthopaedics', total: 30 },
  { name: 'Obstetrics & Gynaecology', total: 30 },
  { name: 'Psychiatry', total: 30 },
  { name: 'Otolaryngology', total: 30 },
  { name: 'Ophthalmology', total: 30 },
];

export const WARD_SCHEDULE = [
  { start: '2026-01-24', end: '2026-02-27', ward: 'General Surgery' },
  { start: '2026-02-28', end: '2026-03-13', ward: 'Pediatrics' },
  { start: '2026-03-14', end: '2026-03-27', ward: 'Holiday' },
  { start: '2026-03-28', end: '2026-04-10', ward: 'Pediatrics' },
  { start: '2026-04-11', end: '2026-05-22', ward: 'Internal Medicine' },
  { start: '2026-05-23', end: '2026-06-05', ward: 'Holiday' },
  { start: '2026-06-06', end: '2026-06-12', ward: 'Internal Medicine' },
  { start: '2026-06-13', end: '2026-06-26', ward: 'Dermatology' },
  { start: '2026-06-27', end: '2026-07-03', ward: 'Urology' },
  { start: '2026-07-04', end: '2026-07-10', ward: 'Pediatric Surgery' },
  { start: '2026-07-11', end: '2026-07-17', ward: 'Burn & Plastic Surgery' },
  { start: '2026-07-18', end: '2026-08-07', ward: 'Orthopaedics' },
  { start: '2026-08-08', end: '2026-09-18', ward: 'Obstetrics & Gynaecology' },
  { start: '2026-09-19', end: '2026-10-02', ward: 'Psychiatry' },
  { start: '2026-10-03', end: '2026-10-16', ward: 'Otolaryngology' },
  { start: '2026-10-17', end: '2026-10-23', ward: 'Holiday' },
  { start: '2026-10-24', end: '2026-11-06', ward: 'Ophthalmology' },
];

export const TIMETABLE: Record<number, Array<{time: string, type: string, subjects: string[]}>> = {
  0: [ // Sunday
    { time: '07:00–08:00', type: 'lecture', subjects: ['Orthopedics', 'Dermatology'] },
    { time: '08:30–09:30', type: 'lecture', subjects: ['Surgery'] },
    { time: '09:30–11:30', type: 'ward', subjects: [] },
    { time: '11:30 AM–2:30 PM', type: 'integrated', subjects: ['Phase Integrated Teaching'] },
    { time: '07:00–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  1: [ // Monday
    { time: '07:00–08:00', type: 'lecture', subjects: ['Surgery'] },
    { time: '08:30–09:30', type: 'lecture', subjects: ['Obstetrics & Gynaecology'] },
    { time: '09:30–11:30', type: 'ward', subjects: [] },
    { time: '12:00–01:00', type: 'lecture', subjects: ['Orthopedics', 'Burn & Plastic Surgery', 'Dermatology', 'Psychiatry', 'Physical Medicine'] },
    { time: '07:00–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  2: [ // Tuesday
    { time: '07:00–08:00', type: 'lecture', subjects: ['Medicine'] },
    { time: '08:30–09:30', type: 'lecture', subjects: ['Ophthalmology', 'Radiology', 'Radiotherapy'] },
    { time: '09:30–11:30', type: 'ward', subjects: [] },
    { time: '12:00–01:00', type: 'lecture', subjects: ['Dermatology', 'Psychiatry', 'Physical Medicine'] },
    { time: '07:00–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  3: [ // Wednesday
    { time: '07:00–08:00', type: 'lecture', subjects: ['Ophthalmology', 'Pediatrics'] },
    { time: '08:30–09:30', type: 'lecture', subjects: ['Pediatric Surgery', 'Urology', 'Nuclear Medicine'] },
    { time: '09:30–11:30', type: 'ward', subjects: [] },
    { time: '12:00–01:00', type: 'lecture', subjects: ['Medicine'] },
    { time: '07:00–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  4: [ // Thursday
    { time: '07:00–08:00', type: 'lecture', subjects: ['Otolaryngology', 'Psychiatry'] },
    { time: '09:30–11:30', type: 'ward', subjects: [] },
    { time: '12:00–02:00', type: 'integrated', subjects: ['Departmental Integrated Teaching'] },
    { time: '07:00–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  5: [ // Friday
  ],
  6: [ // Saturday
    { time: '07:00–08:00', type: 'lecture', subjects: ['Obstetrics & Gynaecology'] },
    { time: '08:30–09:30', type: 'lecture', subjects: ['Medicine'] },
    { time: '09:30–11:30', type: 'ward', subjects: [] },
    { time: '12:00–01:00', type: 'lecture', subjects: ['Otolaryngology', 'Pediatrics', 'Neurosurgery'] },
    { time: '07:00–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ]
};

/**
 * Compute the number of scheduled ward sessions for a given ward subject by
 * iterating every day across all matching WARD_SCHEDULE entries and excluding
 * Fridays (day index 5 – no ward sessions on Fridays).
 */
export function getWardTotalPlanned(wardName: string): number {
  let count = 0;
  for (const slot of WARD_SCHEDULE) {
    if (slot.ward !== wardName) continue;
    // Use noon local time to avoid DST / UTC-offset midnight edge cases
    const start = new Date(slot.start + 'T12:00:00');
    const end   = new Date(slot.end   + 'T12:00:00');
    const cur   = new Date(start);
    while (cur <= end) {
      if (cur.getDay() !== 5) count++; // exclude Friday
      cur.setDate(cur.getDate() + 1);
    }
  }
  // Double the total to reflect both the morning ward slot and the evening
  // ward-replacement slot that run on every scheduled ward day.
  return count * 2;
}

export function getCurrentWard(date: Date = new Date()): string | null {
  // Use local date string (not UTC) to avoid day-boundary misclassification
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  for (const schedule of WARD_SCHEDULE) {
    if (dateStr >= schedule.start && dateStr <= schedule.end) {
      return schedule.ward;
    }
  }
  return null;
}
