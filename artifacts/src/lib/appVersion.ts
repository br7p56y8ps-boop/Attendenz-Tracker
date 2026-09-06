import releaseConfig from '../../release.config.json';
import releaseNotes from '../../release-notes.json';

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
  details?: string;
}

export interface ReleaseNotes {
  upgrades: WhatsNewItem[];
  fixes: WhatsNewItem[];
}

const FALLBACK_RELEASE_NOTES: ReleaseNotes = {
  upgrades: [
    { title: 'Reliable offline app shell', summary: 'The installed release remains available when the network is unavailable.' },
    { title: 'Protected local data', summary: 'Attendance records and preferences continue to use durable storage safeguards.' },
    { title: 'Clearer progress feedback', summary: 'Long-running backup and update actions show their current stage.' },
    { title: 'Improved navigation', summary: 'Home, Manage, Reports, and Settings remain organized for daily use.' },
    { title: 'Theme-aware interface', summary: 'Light and dark themes retain consistent contrast and visual hierarchy.' },
  ],
  fixes: [
    { title: 'Safer updates', summary: 'The application does not switch versions without an explicit user action.' },
    { title: 'Backup safeguards', summary: 'Recovery markers help protect data during interrupted update flows.' },
    { title: 'Notification accuracy', summary: 'Reminder exclusions remain applied to classes that are Off or Completed.' },
    { title: 'Upcoming filters', summary: 'Upcoming class views continue to filter completed items correctly.' },
    { title: 'Responsive layouts', summary: 'Dialogs and cards remain usable across mobile and desktop widths.' },
  ],
};

export function getReleaseNotes(version: string): ReleaseNotes {
  const notes = (releaseNotes as Record<string, ReleaseNotes>)[version];
  return notes && Array.isArray(notes.upgrades) && Array.isArray(notes.fixes) ? notes : FALLBACK_RELEASE_NOTES;
}

export const WHATS_NEW_UPGRADES = getReleaseNotes(APP_VERSION).upgrades;
export const WHATS_NEW_FIXES = getReleaseNotes(APP_VERSION).fixes;

export const FEATURES_UPDATED = [
  {
    emoji: '🧭',
    title: 'Curriculum and Navigation',
    desc: 'Independent workspaces, named Custom routines, active-first curriculum switching, persistent Home controls, and ordered section navigation.',
  },
  {
    emoji: '🧰',
    title: 'Manage, Timetable, and Reports',
    desc: 'Active-workspace editing, clearer routine transfer, responsive mobile controls, rotation browsing, attendance statistics, and on-demand report exports.',
  },
  {
    emoji: '🛡️',
    title: 'Offline Safety and Settings',
    desc: 'Protected local storage, safer recovery flows, system-aware themes, Feedback & Sounds controls, and reversible System Notifications.',
  },
];

export const RELEASE_NOTES = {
  version: APP_VERSION,
  summary: releaseConfig.summary,
};
