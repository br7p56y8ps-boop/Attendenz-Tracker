# Attendenz Tracker

Attendenz Tracker is an **offline-first attendance and routine management app for medical students**. It helps users organize academic subjects, clinical rotations, ward postings, schedules, attendance, targets, backups, reports, and multiple curricula while keeping ordinary attendance operations on the device.

## Release 4.3.3

Release 4.3.3 introduces independent curriculum workspaces, stronger offline data protection, clearer mobile navigation, smoother responsive dialogs, safer restore and update flows, and faster on-demand loading.

### What is included

- Independent curricula that can be named, archived, reopened, and switched without mixing subjects, schedules, attendance, selections, finished states, or curriculum-specific targets.
- A built-in **5th Year / Final Phase** academic and clinical structure, plus empty curricula for users who want to build or import another routine.
- Preset-to-custom continuity so user-added subjects remain available through stable IDs when routine modes change.
- Academic, ward, and Small Group Teaching attendance tracking with subject-level progress, targets, statistics, and predictions.
- Calendar timetable views, clinical rotation browsing, category badges, Needs Attention summaries, and Maximum Possible predictions that focus on classes with remaining scope.
- Responsive bottom-sheet dialogs with scroll locking, stable headers and footers, inline confirmation states, compact mobile layouts, and smoother transitions.
- Persistent Home date navigation, card-only scrolling, theme-aware section labels, and clearer stacked navigation surfaces across the application.
- Local backup and restore, routine import and export, PDF, Excel, and CSV reports, and visible storage-health feedback.
- Lazy-loaded application routes and report libraries for a smaller initial mobile payload.

## Offline privacy and storage

Attendance and routine data are stored locally in the browser using **localStorage and IndexedDB**. Normal attendance operations do not require an online account or a remote attendance API. The app uses canonical stable IDs for attendance records and safely migrates older local data when necessary.

The application keeps curricula isolated, preserves attendance history during routine replacement, quarantines unresolved legacy records instead of attaching them to the wrong subject, and serializes local writes to reduce ordering problems. Users receive a visible warning when browser storage becomes unavailable.

> Export a backup before clearing browser site data, moving to another browser or device, or continuing after a storage warning.

Clearing browser site data removes the app’s local user data from localStorage and IndexedDB. Cached application files are not user attendance data.

## Updates and offline use

After the app shell and runtime assets have been loaded once, ordinary attendance operations continue to work offline. The intentional online operation is the user-initiated update check, which reads the published version information and shows an update option only when a newer release is available.

Before updating, users may create an optional backup. The app prepares a pending snapshot, refreshes the application shell and same-origin assets, reloads through the startup flow, restores the pending snapshot, and reinitializes storage and migration before showing the main interface.

The app uses a manually registered `sw.js` service worker and does not generate a duplicate `gen-sw.js` worker. A first visit without cached application assets still requires a network connection to download the app.

## Getting started

The app is designed for mobile-first use. Open the Home tab to review the selected date and attendance cards, use Subjects to review progress, use Manage to create or import routines, use Timetable for schedules and statistics, and use Settings for curricula, backups, reports, storage information, and updates.

When creating a new curriculum, users can start with an empty workspace and add subjects directly or import a routine through Manage. Each curriculum has its own routine and attendance state, while general application preferences remain global.

## Technology

Attendenz Tracker uses React, TypeScript, Vite, Tailwind CSS, localStorage, IndexedDB, and a manually registered service worker. The attendance application is located in `artifacts/attendance-tracker`.

## Development

From the repository root:

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

The production build is emitted to `artifacts/attendance-tracker/dist/public`.

## Data and deployment notes

The application is intended to preserve user data locally and provide clear backup and recovery paths. Preview builds should be manually verified before they are promoted to the production integration branch. The current production release documentation describes the merged 4.3.3 feature set and its offline behavior.
