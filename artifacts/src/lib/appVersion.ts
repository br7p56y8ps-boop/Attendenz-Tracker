export const APP_VERSION = "1.6.4.1";
export const LATEST_VERSION = APP_VERSION;
export interface WhatsNewItem {
  title: string;
  summary: string;
  details: string;
}
export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [];
export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  {
    title: "Bug Fixes and UI Improvements",
    summary: "A smoother app experience with cleaner release presentation.",
    details:
      "The What’s New panel now fits its content more naturally, and the published app structure is aligned for more reliable deployments.",
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
  summary: "Release v1.6.4.1: Bug Fixes and UI Improvements for a smoother app experience.",
};
