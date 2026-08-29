export type ReleaseType = 'major' | 'minor';
export type UpdateMode = 'manual' | 'automatic';

export const APP_VERSION = "1.6.5";
export const LATEST_VERSION = APP_VERSION;

// Developer release reference: RELEASE_TYPE accepts only 'major' or 'minor'.
// UPDATE_MODE accepts only 'manual' or 'automatic'. Set both here before publication;
// keep artifacts/public/version.json on the same version, release type, and update mode.
// These controls are developer-only and are never presented as user settings.
export const RELEASE_TYPE: ReleaseType = 'minor';
export const UPDATE_MODE: UpdateMode = 'manual';
export interface WhatsNewItem {
  title: string;
  summary: string;
  details: string;
}
export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  { title: "Must Attend Summary Notifications", summary: "Receive summaries about Classes you should attend to stay on track.", details: "" },
  { title: "Need Attention Subjects Notifications", summary: "Get notified when a Subject requires attention.", details: "" },
  { title: "Safe to Miss a Class Notification", summary: "See when missing a Class remains safe for your attendance target.", details: "" },
  { title: "Before-Class Warnings", summary: "Receive reminders before scheduled Classes begin.", details: "" },
  { title: "Late Evening Unmarked Attendance Notifications", summary: "Get reminders when today’s scheduled Class attendance is still unmarked.", details: "" },
  { title: "Feedback & Sound", summary: "Enjoy improved feedback and sound responses throughout Attendenz.", details: "" },
  { title: "Curriculum Management", summary: "Manage active curricula and switching with clearer controls.", details: "" },
];
export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  { title: "Fixed Home Display Message", summary: "Home wording now better reflects selected dates.", details: "" },
  { title: "Fixed Notification Delay", summary: "Improved reminder timing and delivery reliability.", details: "" },
  { title: "Fixed Manage Tab", summary: "Improved schedule layout and empty-state presentation.", details: "" },
  { title: "Fixed Backup / Restore", summary: "Improved backup and restore modal controls.", details: "" },
  { title: "Fixed Export PDF", summary: "Improved attendance report presentation and reliability.", details: "" },
  { title: "Fixed Theme", summary: "Improved theme-consistent colours and text presentation.", details: "" },
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
  summary: "Release v1.6.5: UI consistency, clearer controls, and notification refinements.",
};
