export const APP_VERSION = "1.6.1";
export const LATEST_VERSION = APP_VERSION;

export interface WhatsNewItem {
  title: string;
  summary: string;
  details: string;
}

export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  {
    title: "App Notifications",
    summary: "Choose which reminders you want to use on this device.",
    details:
      "The app now connects to OneSignal for permission-aware system notifications. Choose a grouped Need Attention summary, a notice for the final scheduled class of a subject today, the first class and time of the day, before-class warning reminders, update notices, AddNew changes, and a flexible reminder lead time. The iPhone Allow notifications flow is also fixed. Your choices stay saved on this device for automatic scheduled delivery.",
  },
  {
    title: "Feedback & Sounds",
    summary: "Choose how Attendenz confirms important actions.",
    details:
      "Control confirmation sound, adjust its volume, choose vibration feedback where the device allows it, and keep the app’s feedback respectful of your iPhone’s silent mode and system settings.",
  },
  {
    title: "Independent Curriculum Workspaces",
    summary: "Keep each year, phase, or rotation routine in its own workspace.",
    details:
      "Create, name, archive, reopen, and switch between saved curricula. Each workspace keeps its own subjects, schedules, attendance, home selections, finished states, target percentage, and snapshots.",
  },
  {
    title: "5th Year / Final Phase Routine",
    summary:
      "Start with the built-in 5th Year / Final Phase reference routine.",
    details:
      "The included academic, clinical, ward, and SGT structure is clearly identified as a reference routine. Your college curriculum may follow a different plan, so you can edit this routine or choose a Custom routine for another year or phase.",
  },
  {
    title: "Named Custom Routines",
    summary: "Give every Custom routine a name that matches your curriculum.",
    details:
      "Create a routine for any year or phase, name it such as 1st Year or First Phase, and create more separate Custom routines later. New Custom curricula start empty and never mix their records with another workspace.",
  },
  {
    title: "Independent Preset and Custom Data",
    summary:
      "Keep subjects, wards, SGTs, schedules, and attendance in the correct workspace.",
    details:
      "Preset additions remain inside the 5th Year / Final Phase workspace. Custom additions remain inside their selected Custom curriculum. Switching curricula restores the selected workspace without copying or displaying records from another one.",
  },
  {
    title: "Responsive Offline Experience",
    summary:
      "Move through Home, Subjects, Manage, Timetable, and Settings more comfortably.",
    details:
      "Important navigation surfaces, day controls, section labels, routine windows, rotation browsing, and mobile modals have been refined for clearer scrolling, better spacing, and more reliable touch interaction.",
  },
];

export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  {
    title: "Safer Offline Storage",
    summary: "Protect local attendance records more carefully.",
    details:
      "IndexedDB remains the source of truth, writes are serialized, inactive curriculum workspaces are preserved during switching, legacy identifiers are handled safely, and storage status is visible in Settings.",
  },
  {
    title: "Safer Backup and Routine Transfer",
    summary:
      "Use complete backups and mode-specific routine bundles with clearer boundaries.",
    details:
      "Complete app backups preserve both Preset and Custom workspaces. Routine bundles use only the active workspace, reject the wrong routine mode, and avoid overwriting the opposite workspace during import or replacement.",
  },
  {
    title: "Clearer Home and Timetable Views",
    summary:
      "See the right day, routine, statistics, and attendance state more reliably.",
    details:
      "Home date navigation, Saturday-first Preset scheduling, Custom day ordering, rotation dates, attendance identifiers, Needs Attention, and Maximum Possible Attendance calculations now follow the selected workspace more consistently.",
  },
  {
    title: "Improved Manage and Edit Data",
    summary:
      "Add, edit, remove, and organise routine records with less confusion.",
    details:
      "Manage now exposes only the active workspace, keeps Preset and Custom records separate, provides editing paths for Custom records, and keeps the day selector and schedule surface readable in both light and dark themes.",
  },
  {
    title: "Responsive Glass-Style Modals",
    summary: "Use dialogs that fit better on smaller screens.",
    details:
      "Modal surfaces use consistent bottom-sheet presentation, single close actions, smoother transitions, controlled scrolling, inline confirmations, and controls that adapt to the available screen height.",
  },
  {
    title: "Clearer Account Settings",
    summary:
      "Manage your profile, appearance, storage, and curriculum from one place.",
    details:
      "Account settings include system-aware theme selection, storage information, curriculum status, backup and transfer tools, profile editing, and clearer recovery controls.",
  },
  {
    title: "Faster Reports and Startup",
    summary:
      "Load everyday screens faster and open report tools only when needed.",
    details:
      "Pages are loaded on demand, while PDF and Excel report libraries are loaded only when their export actions are used. This reduces the initial mobile payload and keeps routine navigation more responsive.",
  },
  {
    title: "Clearer Updates and Offline Recovery",
    summary: "Make app updates and recovery steps easier to understand.",
    details:
      "The manual offline service worker remains the single application worker, update checks use the published version manifest, and approved updates can refresh the cached app shell with an optional safety snapshot.",
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
    desc: "Protected local storage, safer recovery flows, system-aware themes, Feedback & Sounds controls, and permission-aware App Notifications.",
  },
];

export const RELEASE_NOTES = {
  version: APP_VERSION,
  summary:
    "Release v1.6.1 includes clearer App Notification choices for the final scheduled class and first class of the day, alongside Feedback & Sounds controls, the iPhone permission-flow fix, independent curriculum workspaces, safer offline protection, clearer mobile navigation, and Manage history controls that clear one displayed entry without changing app data.",
};
