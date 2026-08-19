export const APP_VERSION = '4.3.2';
export const LATEST_VERSION = '4.3.2';


export interface WhatsNewItem { title: string; desc: string; }

export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  { title: 'Data Safety Migration', desc: 'Old attendance data automatically migrates to the new ID-based system. No records lost.' },
  { title: 'Mode Separation', desc: 'Preset and Custom routines keep their attendance separate — no more mixed percentages.' },
  { title: 'Calendar Fix', desc: 'Weekly timetable now correctly shows all subjects at shared times and highlights today’s row.' },
  { title: 'Restore Protection', desc: 'Restoring a backup now warns you before replacing current data and creates a safety snapshot.' },
];

export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  { title: 'Subject Key Issue', desc: 'Fixed duplicate names causing attendance mix-ups. Each subject now uses its own unique ID.' },
  { title: 'Small Group Issue', desc: 'SGT attendance and schedules are now fully independent from ward/clinical subjects.' },
  { title: 'Slot Move / Re-slot Issue', desc: 'Moving or re-slotting subjects now works correctly, places slots chronologically, and no duplicates.' },
  { title: 'Export Issue', desc: 'SGT subject export now selects the correct record and shows accurate numbers.' },
];

export const FEATURES_UPDATED = [
  { emoji: '🛠️', title: 'Manage/Add New', desc: 'Refined modals, smoother scrolling, better edit workflows.' },
  { emoji: '🏠', title: 'Home Tab', desc: 'Improved card spacing, future percentage rings, finished subject states.' },
  { emoji: '📅', title: 'Calendar & Clinical Wheel', desc: 'Fixed weekly grid for shared time slots, current-day highlight, added prediction section.' },
];