import releaseConfig from '../../release.config.json';

export type ReleaseType = 'major' | 'minor';
export type UpdateMode = 'manual' | 'automatic';

export const APP_VERSION = releaseConfig.version;
export const PWA_CACHE_NAME = `attendenz-shell-v${APP_VERSION}-r2`;
export const LATEST_VERSION = APP_VERSION;
export const RELEASE_TYPE: ReleaseType = releaseConfig.releaseType as ReleaseType;
export const UPDATE_MODE: UpdateMode = releaseConfig.updateMode as UpdateMode;
export interface WhatsNewItem {
  title: string;
  summary: string;
  details: string;
}
export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  { title: "New UI Design", summary: "Refreshed interface with modern styling, improved readability, and consistent light/dark theme.", details: "" },
  { title: "Curriculum Management", summary: "Separate active and archived curricula; switch, complete, reopen, rename, or delete with confirmations.", details: "" },
  { title: "Stronger Data Safety", summary: "Reliable IndexedDB persistence with ordered writes and LocalStorage mirroring; backup/restore verifies success and supports older backups.", details: "" },
  { title: "Smarter Backup & Restore", summary: "Restored data is version-stamped; failed updates no longer loop silently.", details: "" },
  { title: "Clearer Home Cards", summary: "Past, today, tomorrow, and future classes are visually distinct; Clinical and SGT subjects show labels like Clinical (Morning) and Small Group.", details: "" },
  { title: "Improved Notifications", summary: "More specific categories (Must Attend, Need Attention, Safe to Miss), correct subject-type labels, and accurate final planned class detection.", details: "" },
  { title: "Enhanced Export Controls", summary: "Export PDF, Excel, or CSV with subject, custom-date, or semester scope from Settings.", details: "" },
  { title: "Reliable PWA Updates", summary: "Service worker and version metadata stay in sync.", details: "" },
  { title: "v1.6.7 Recovery Safeguards", summary: "Reliable nightly reminders, durable pending-restore markers, replacement restores, and safer manual update activation.", details: "" },
  { title: "Start Fresh & Delete All Data", summary: "Completely wipe user data and return to the Welcome screen.", details: "" },
];
export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  { title: "Home & Subject Cards", summary: "Fixed long status text overflow, separated completed classes, aligned percentage containers, and removed the unwanted vertical divider.", details: "" },
  { title: "Manage Tab Layout", summary: "Academic schedule full-width time rows; Clinical and SGT entries separated with their own actions; improved spacing and scrolling.", details: "" },
  { title: "Settings Organization", summary: "Clearer sections with consistent theme colors and borders.", details: "" },
  { title: "Mobile Usability", summary: "Improved keyboard handling for rename/create dialogs and curriculum modal sizes to content.", details: "" },
  { title: "Attendance & Feedback", summary: "Cancellable confirmations plus configurable vibration, sound, and volume.", details: "" },
  { title: "Overall Polish", summary: "Responsive spacing, background blackout for modals, consistent 3D percentage containers.", details: "" },
];
export const FEATURES_UPDATED = [
  {
    emoji: "🧭",
    title: "Curriculum and Navigation",
    desc: "Independent workspaces, named Custom routines, active-first curriculum switching, persistent Home controls, and ordered section navigation.",
  },
  {
    emoji: "🧰",
    title: "Manage, Timetable, and Reports",
    desc: "Active-workspace editing, clearer routine transfer, responsive mobile controls, rotation browsing, attendance statistics, and on-demand report exports.",
  },
  {
    emoji: "🛡️",
    title: "Offline Safety and Settings",
    desc: "Protected local storage, safer recovery flows, system-aware themes, Feedback & Sounds controls, and reversible System Notifications.",
  },
];
export const RELEASE_NOTES = {
  version: APP_VERSION,
  summary: "Recovery v1.6.7: reliable nightly reminders and data recovery safeguards.",
};
