export const APP_VERSION = '4.2.1';
export const LATEST_VERSION = '4.3.0';


export interface WhatsNewItem { title: string; desc: string; }

export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  { title: 'Export / Transfer', desc: 'Send your data out like a discharge summary — clean, complete, and ready for handover.' },
  { title: 'Subject Triage', desc: 'Re-home or discharge subjects completely. Bed management, but for classes.' },
  { title: 'More', desc: 'More options, fewer clicks. Like having an extra pair of hands on rounds.' },
  { title: 'Past / Future Date History', desc: 'Flip back or skip ahead through attendance days. Now even yesterday’s vitals are accessible.' },
  ];

export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  { title: 'Subject Key Issue', desc: 'Same name, different subject? Now they stay in their own beds — no more chart mix-ups.' },
  { title: 'Small Group Issue', desc: 'SGT subjects now stick to the right clinical team. No more wandering attachments.' },
  { title: 'Slot Change Issue', desc: 'Move a single subject or a whole slot without crashing the ward board.' },
  { title: 'Export Issue', desc: 'Reports now show the right numbers — no more mystery vitals in the PDF.' },
];

export const FEATURES_UPDATED = [
  { emoji: '🛠️', title: 'Manage/Add New', desc: 'A smoother workflow for adding subjects and rotations.' },
  { emoji: '🏠', title: 'Home Tab', desc: 'Cleaner home screen with update pill when a new version is ready.' },
  { emoji: '📅', title: 'Calendar & Clinical Wheel', desc: 'Timetable and rotation wheel now look sharper and behave better.' },
];