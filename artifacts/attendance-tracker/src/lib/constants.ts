import { D, registerPresetSubjects } from '@/lib/utils';

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

// Preset allied-parent groups — clinical-type rotations, once daily.
export const PRESET_PARENTS = ['Small Group Teaching'];
export const WARD_SUBJECTS = [
  { name: 'General Surgery', total: 60 },
  { name: 'Pediatrics', total: 60 },
  { name: 'Internal Medicine', total: 60 },
  { name: 'Dermatology', total: 60 },
  { name: 'Urology', total: 60 },
  { name: 'Pediatric Surgery', total: 60 },
  { name: 'Burn & Plastic Surgery', total: 60 },
  { name: 'Orthopaedics', total: 60 },
  { name: 'Obstetrics & Gynaecology', total: 60 },
  { name: 'Psychiatry', total: 60 },
  { name: 'Otolaryngology', total: 60 },
  { name: 'Ophthalmology', total: 60 },
];

// B5: dates authored in human dd/mm/yy via D(); stored value is yyyy-mm-dd.
export const WARD_SCHEDULE = [
  { start: D('24/01/26'), end: D('27/02/26'), ward: 'General Surgery' },
  { start: D('28/02/26'), end: D('13/03/26'), ward: 'Pediatrics' },
  { start: D('14/03/26'), end: D('27/03/26'), ward: 'Holiday' },
  { start: D('28/03/26'), end: D('10/04/26'), ward: 'Pediatrics' },
  { start: D('11/04/26'), end: D('22/05/26'), ward: 'Internal Medicine' },
  { start: D('23/05/26'), end: D('05/06/26'), ward: 'Holiday' },
  { start: D('06/06/26'), end: D('12/06/26'), ward: 'Internal Medicine' },
  { start: D('13/06/26'), end: D('26/06/26'), ward: 'Dermatology' },
  { start: D('27/06/26'), end: D('03/07/26'), ward: 'Urology' },
  { start: D('04/07/26'), end: D('10/07/26'), ward: 'Pediatric Surgery' },
  { start: D('11/07/26'), end: D('17/07/26'), ward: 'Burn & Plastic Surgery' },
  { start: D('18/07/26'), end: D('07/08/26'), ward: 'Orthopaedics' },
  { start: D('08/08/26'), end: D('18/09/26'), ward: 'Obstetrics & Gynaecology' },
  { start: D('19/09/26'), end: D('02/10/26'), ward: 'Psychiatry' },
  { start: D('03/10/26'), end: D('16/10/26'), ward: 'Otolaryngology' },
  { start: D('17/10/26'), end: D('23/10/26'), ward: 'Holiday' },
  { start: D('24/10/26'), end: D('06/11/26'), ward: 'Ophthalmology' },
];

// B1/B2: all times stored & displayed in canonical "hh:mm AM–hh:mm PM" form.
export const TIMETABLE: Record<number, Array<{time: string, type: string, subjects: string[]}>> = {
  0: [ // Sunday
    { time: '07:00 AM–08:00 AM', type: 'lecture', subjects: ['Orthopedics', 'Dermatology'] },
    { time: '08:30 AM–09:30 AM', type: 'lecture', subjects: ['Surgery'] },
    { time: '09:30 AM–11:30 AM', type: 'ward', subjects: [] },
    { time: '11:30 AM–02:30 PM', type: 'integrated', subjects: ['Phase Integrated Teaching'] },
    { time: '07:00 PM–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  1: [ // Monday
    { time: '07:00 AM–08:00 AM', type: 'lecture', subjects: ['Surgery'] },
    { time: '08:30 AM–09:30 AM', type: 'lecture', subjects: ['Obstetrics & Gynaecology'] },
    { time: '09:30 AM–11:30 AM', type: 'ward', subjects: [] },
    { time: '12:00 PM–01:00 PM', type: 'lecture', subjects: ['Orthopedics', 'Burn & Plastic Surgery'] },
    { time: '07:00 PM–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  2: [ // Tuesday
    { time: '07:00 AM–08:00 AM', type: 'lecture', subjects: ['Medicine'] },
    { time: '08:30 AM–09:30 AM', type: 'lecture', subjects: ['Ophthalmology', 'Radiology', 'Radiotherapy'] },
    { time: '09:30 AM–11:30 AM', type: 'ward', subjects: [] },
    { time: '12:00 PM–01:00 PM', type: 'lecture', subjects: ['Dermatology', 'Psychiatry', 'Physical Medicine'] },
    { time: '07:00 PM–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  3: [ // Wednesday
    { time: '07:00 AM–08:00 AM', type: 'lecture', subjects: ['Ophthalmology', 'Pediatrics'] },
    { time: '08:30 AM–09:30 AM', type: 'lecture', subjects: ['Pediatric Surgery', 'Urology', 'Nuclear Medicine'] },
    { time: '09:30 AM–11:30 AM', type: 'ward', subjects: [] },
    { time: '12:00 PM–01:00 PM', type: 'lecture', subjects: ['Medicine'] },
    { time: '07:00 PM–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  4: [ // Thursday
    { time: '07:00 AM–08:00 AM', type: 'lecture', subjects: ['Otolaryngology', 'Psychiatry'] },
    { time: '09:30 AM–11:30 AM', type: 'ward', subjects: [] },
    { time: '12:00 PM–02:00 PM', type: 'integrated', subjects: ['Departmental Integrated Teaching'] },
    { time: '07:00 PM–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
  ],
  5: [ // Friday
  ],
  6: [ // Saturday
    { time: '07:00 AM–08:00 AM', type: 'lecture', subjects: ['Obstetrics & Gynaecology'] },
    { time: '08:30 AM–09:30 AM', type: 'lecture', subjects: ['Medicine'] },
    { time: '09:30 AM–11:30 AM', type: 'ward', subjects: [] },
    { time: '12:00 PM–01:00 PM', type: 'lecture', subjects: ['Otolaryngology', 'Pediatrics', 'Neurosurgery'] },
    { time: '07:00 PM–09:00 PM', type: 'ward_replacement', subjects: ['Ward Replacement'] },
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
  // Double the count to reflect the planned classes
  // across both the morning ward slot and the evening ward-replacement slot.
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

/* B6: register the ordered preset subject list so getSubjectColor() assigns
the fixed palette order to preset subjects (custom names hash stably).
Registration order: academic categories → integrated → wards. */
registerPresetSubjects([
  ...CATEGORIES.flatMap(c => c.subjects.map(s => s.name)),
  ...INTEGRATED_SUBJECTS.map(s => s.name),
  ...WARD_SUBJECTS.map(s => s.name),
]);
