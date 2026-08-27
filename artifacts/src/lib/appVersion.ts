export type ReleaseType = 'major' | 'minor';
export type UpdateMode = 'manual' | 'automatic';

export const APP_VERSION = "1.6.4.2";
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
  {
    title: "Scheduled Notifications",
    summary: "New reminders for your Classes and attendance risks.",
    details:
      "Receive grouped Must Attend and Need Attention reminders, configurable Before-Class Warnings, Last Planned Class Today notices, and reminders for newly added Subjects scheduled for the same day.",
  },
];
export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  {
    title: "Calendar and Export Reliability",
    summary: "Calendar, attendance reports, and mobile layouts are more dependable.",
    details:
      "Fixed the Calendar blank-page issue, improved lifecycle-aware attendance statuses across the app and reports, included Clinical, Ward, and SGT records correctly, and refined the formal PDF and spreadsheet exports.",
  },
  {
    title: "1.6 Series Improvements",
    summary: "Safer local data and clearer everyday controls.",
    details:
      "The 1.6 series added active curriculum workspaces, responsive Manage controls, protected local backups, clearer Settings, Feedback & Sounds choices, and reversible System Notifications.",
  },
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
  summary: "Release v1.6.4.2: Scheduled Notifications, Calendar reliability, and export improvements.",
};
