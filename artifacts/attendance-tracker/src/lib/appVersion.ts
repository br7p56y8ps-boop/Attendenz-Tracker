export const APP_VERSION = '4.3.2';
export const LATEST_VERSION = '4.3.2';


export interface WhatsNewItem { title: string; desc: string; }

export const WHATS_NEW_UPGRADES: WhatsNewItem[] = [
  { title: 'New Timetable Tab', desc: 'Your whole week on one screen — like the ward whiteboard, minus the missing marker.' },
  { title: 'Rotation Wheel', desc: 'Swipe rotations like flipping charts; tap outside to snap back to today.' },
  { title: 'Statistics Card', desc: 'Attendance vitals: % pulse, can-miss buffer, 6-month ECG, and a needs-attention rounds list.' },
  { title: 'Subject Triage', desc: 'Re-home or discharge subjects completely. Bed management, but for classes.' },
  { title: 'Routine Handover', desc: 'Share or receive routines by file, paste or AI prompt — a proper handover with no missed sign-outs.' },
  { title: 'One-Screen Admission', desc: 'Setup is one screen: name, photo, routine. Your face now tops the PDF chart too.' },
  { title: 'Update Pill on Home', desc: 'A tiny amber pill when an update is due. Doctor\u2019s orders.' },
  { title: 'Per-Day Times', desc: 'Different times on different days? Finally allowed — the routine committee can relax.' },
  { title: 'Allied Parents, Your Way', desc: 'Adopt kids under any parent; combined attendance, zero paperwork.' },
];

export const WHATS_NEW_FIXES: WhatsNewItem[] = [
  { title: 'Every Tap Answers', desc: 'Green = done & closes, red = stays so you can fix. The silent treatment is over.' },
  { title: 'One Window at a Time', desc: 'Warnings now appear inside the Add window. We stopped stacking popups like Friday charts.' },
  { title: 'No Ghost Subjects', desc: 'Moves merge cleanly — no vanished classes, no phantom columns haunting the timetable.' },
  { title: 'Scroll Resuscitated', desc: 'Popups can\u2019t paralyze the page anymore. CPR successful; scrolling is alive.' },
  { title: 'Asks Before It Acts', desc: 'Deletes & restores now confirm in plain words. No accidental code blues.' },
  { title: 'Honest Exports', desc: 'Empty date ranges now say \u201cnothing here yet\u201d instead of pretending. Honesty is the best policy.' },
  { title: 'Tailored PDF Header', desc: 'The report header fits its content like a well-tailored white coat.' },
  { title: 'Simpler Time Boxes', desc: 'One box each for start & end. Fewer boxes, fewer mistakes, less rage.' },
  { title: 'Sensible Tab Names', desc: 'Home · Subjects · Manage · Timetable · Settings — and you always wake up on Home.' },
];

export const FEATURES_UPDATED = [
  { emoji: '🎉', title: "What's New Popup", desc: 'Automatically alerts on first-time setup and future version updates to keep you informed of changes.' },
  { emoji: '📚', title: 'Preloaded MBBS 5th Year Subjects', desc: 'Preconfigured theory subjects, allied classes, and clinical ward postings.' },
  { emoji: '🛠️', title: 'Custom Routine Mode', desc: 'Create your own subjects and schedules with a clean slate.' },
  { emoji: '💾', title: 'Full App JSON Backup & Snapshots', desc: 'Export or restore full application state locally with 100% privacy.' },
  { emoji: '📅', title: 'Live Calendar Record Editor', desc: 'Click any date to instantly edit and log attendance history.' },
  { emoji: '⚙️', title: 'Account Dashboard', desc: 'Manage routines, statistics, and system settings seamlessly.' }
];
