export const APP_VERSION = '4.3.3.1';
export const LATEST_VERSION = APP_VERSION;

export interface WhatsNewItem {
  title: string;
  summary: string;
  details: string;
}

export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  {
    title: 'Independent Curriculum Workspaces',
    summary: 'Keep multiple curricula separate and easy to switch between.',
    details: 'Create, name, archive, reopen, and switch between independent curricula. Each workspace keeps its own subjects, routines, attendance, home selections, finished states, target percentage, and curriculum snapshot without mixing data.',
  },
  {
    title: '5th Year / Final Phase Routine',
    summary: 'The built-in medical curriculum now has a clear identity.',
    details: 'The provided academic, clinical, ward, and SGT structure is identified as 5th Year / Final Phase. New curricula start empty so users can create their own structure or populate it through routine import.',
  },
  {
    title: 'Preset-to-Custom Continuity',
    summary: 'User-added subjects stay available when changing routine modes.',
    details: 'Subjects added to the built-in routine remain available when moving to a custom curriculum through stable IDs. The transition avoids duplicate records, preserves the original routine, and keeps attendance associated with the correct subject.',
  },
  {
    title: 'Faster Startup and Reports',
    summary: 'The app loads lighter and opens reports only when needed.',
    details: 'Pages are loaded on demand, while PDF and Excel libraries are loaded only when their export actions are used. This reduces the initial mobile payload and makes everyday navigation more responsive.',
  },
];

export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  {
    title: 'Persistent Home and Section Navigation',
    summary: 'Important navigation surfaces stay clear while content scrolls.',
    details: 'The Home date wheel remains in place while attendance cards scroll in their own region. Section labels across the app use ordered, theme-aware sticky surfaces that remain readable and stack without overlap.',
  },
  {
    title: 'Responsive Glass-Style Modals',
    summary: 'Dialogs now behave more naturally on small screens.',
    details: 'Modal surfaces use a consistent responsive presentation with locked background scrolling, stable headers and footers, inline confirmation states, smoother transitions, and dropdown placement that adapts to the available viewport.',
  },
  {
    title: 'Smoother Manage and Calendar Interaction',
    summary: 'Routine management and rotation browsing feel more controlled.',
    details: 'The Manage controls and subject window keep their intended sticky relationship, Add Slot content can scroll within its available space, and the clinical rotation wheel responds to horizontal gestures without capturing ordinary vertical page scrolling.',
  },
  {
    title: 'Clearer Calendar Statistics',
    summary: 'Calendar statistics focus on subjects that still need attention.',
    details: 'Statistics use consistent section presentation, short names, readable category badges, correct zero-attendance percentages, and Maximum Possible predictions that omit completed clinical periods and subjects with no remaining planned classes.',
  },
  {
    title: 'Reliable Offline Storage',
    summary: 'Local attendance data is protected more carefully.',
    details: 'Canonical IDs, legacy-data migration, orphan quarantine, serialized localStorage and IndexedDB writes, page-hide flushing, and visible storage warnings reduce the risk of silent data loss during everyday offline use.',
  },
  {
    title: 'Safer Restore, Import, and Update Flows',
    summary: 'Backups and updates provide clearer recovery paths.',
    details: 'Routine replacement cleans omitted entities while preserving attendance history. Restore and import flows re-run migration safely, and the manual update flow supports an optional backup before restoring the pending snapshot and reinitializing the app.',
  },
  {
    title: 'Manual Offline Service Worker',
    summary: 'Offline caching remains simple and predictable.',
    details: 'The application continues to use the manually registered sw.js service worker and does not generate a duplicate gen-sw.js worker during production builds.',
  },
];

export const FEATURES_UPDATED = [
  { emoji: '🧭', title: 'Curriculum & Navigation', desc: 'Independent curriculum workspaces, stable subject continuity, persistent Home controls, and ordered sticky section labels.' },
  { emoji: '🧰', title: 'Manage, Import & Export', desc: 'Responsive glass-style modals, safer routine replacement and restore, resilient AI JSON parsing, and lazy-loaded report exports.' },
  { emoji: '🛡️', title: 'Offline Safety', desc: 'Canonical ID migration, orphan quarantine, serialized dual-store writes, storage health warnings, and manual update recovery.' },
];

export const RELEASE_NOTES = {
  version: APP_VERSION,
  summary: 'Release 4.3.3 brings independent curricula, safer offline data protection, clearer responsive navigation, smoother mobile interactions, and faster on-demand loading.',
};
