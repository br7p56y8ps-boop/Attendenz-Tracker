export const APP_VERSION = "1.6.4";
export const LATEST_VERSION = APP_VERSION;

export interface WhatsNewItem {
  title: string;
  summary: string;
  details: string;
}

export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  {
    title: "System Notifications",
    summary: "Choose Reminders, Routine Updates, and App Update Alerts.",
    details:
      "System Notifications are now available for selected Reminders, successful Manage changes, and App Updates. You can turn the main setting off and on again without changing saved preferences, attendance records, or other app data.",
  },
];

export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  {
    title: "Clearer Notification Settings",
    summary: "Use one simple settings flow without test controls.",
    details:
      "The full Reminder list stays visible, child settings are disabled when System Notifications are off, and your saved choices return when the main setting is enabled again.",
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
  summary:
    "Release v1.6.4 makes System Notifications available with clearer settings: selected Reminders, successful Manage changes, and App Updates can be delivered automatically, while saved choices remain reversible.",
};
