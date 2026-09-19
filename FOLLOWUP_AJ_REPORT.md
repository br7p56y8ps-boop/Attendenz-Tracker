# Follow-up A–J Audit Report

Branch: `release/v1.6.15`  
Rollback reference preserved: `59800cd`  
Requested commit: `Fix blur regions, Maximum Percentage bars, ECG chart, activity timeline, and remaining dashboard issues`  
PR: [#41](https://github.com/br7p56y8ps-boop/Attendenz-Tracker/pull/41)

## Issue A — Blur bands and full-card-list blur

**Cause found.** `artifacts/src/index.css` contained `.bottom-nav-surface::before` and `.home-date-wheel-float::before`. Both used fixed/expanded rectangular pseudo-elements with `backdrop-filter`; the bottom-nav pseudo-element extended to `top: -100vh`, and the date-wheel pseudo-element covered the full region from the app header to the bottom of the viewport. This caused dark bands and blurred the complete scrolling card list.

**Fix applied.** Both pseudo-elements were removed. The existing real fixed DOM elements are now the blur surfaces: the Layout `motion.div` is the fixed bottom-nav wrapper, and `.home-date-wheel-float` is the fixed date-wheel wrapper containing the wheel surface. Blur remains limited to the visible surfaces (`.bottom-nav-surface` and `.date-wheel-surface`), with no expanded overlay or glow pseudo-element.

Before:

```css
.bottom-nav-surface::before { top: -100vh; bottom: -1px; backdrop-filter: blur(...); }
.home-date-wheel-float::before { top: var(--app-header-height); bottom: 0; backdrop-filter: blur(...); }
```

After:

```css
/* pseudo-elements removed; filters remain only on the real fixed surfaces */
.bottom-nav-surface { backdrop-filter: blur(18px) saturate(125%); }
.home-date-wheel-float .date-wheel-surface { backdrop-filter: blur(16px) saturate(135%); }
```

**Verification.** Confirmed no `bottom-nav-surface::before` or `home-date-wheel-float::before` remains in application CSS. Typecheck and build pass.

## Issue B — Maximum Percentage Possible bars

**Cause found.** The Home implementation used a single SVG line-style graph with separate current and maximum strokes. It did not render the requested current/max segmented bar semantics.

**Fix applied.** Each eligible subject now renders one bar with two segments: grey for current attendance and a second segment colored green when maximum possible is at least the preferred percentage, otherwise red. Subjects are filtered when remaining planned classes are zero. The calculation remains based on planned, conducted, attended, and remaining classes.

```tsx
const remaining = Math.max(0, planned - conducted);
const maximum = planned > 0 ? ((item.attended + remaining) / planned) * 100 : current;
const maxColor = metric.maximum >= preferredPercentage ? '#34d399' : '#f87171';
```

The SVG now contains a grey current segment and a target-aware second segment instead of two independent progress lines.

**Verification.** Written to `Home.tsx`; root typecheck and build pass.

## Issue C — Storage Warning banner

**Cause found.** The exact banner text was in `artifacts/src/App.tsx` lines 186–192. It was introduced by commit `07e3af4` (`Release v1.6.4.1: Bug Fixes and UI Improvements`). The banner was driven by the global `STORAGE_ERROR_EVENT` emitted by `idb.ts` durability helpers. The current source did not establish a current IndexedDB failure; the requested UI was an unrequested warning presentation and could be triggered by any storage helper error event.

**Fix applied.** Removed the banner markup, `storageError` state, and App-level listener/presentation wiring. Storage initialization, checked writes, recovery, and existing durability helpers were not changed.

Before:

```tsx
{storageError && <div>Storage Warning: Your latest changes may not be fully durable...</div>}
```

After:

```tsx
/* no warning banner or App-level warning presentation */
```

**Verification.** `rg` confirms neither `Storage Warning` nor `may not be fully durable` remains in `artifacts/src`. Storage data paths were not modified. Build passes.

## Issue D — Overall Attendance ECG

**Cause found.** The previous `overallEcgPath` was one single attendance-derived path. It had no group curves, axes/ticks, or legend.

**Fix applied.** Replaced it with three deterministic, non-animated PQRST curves representing Medicine & Allied, Surgery & Allied, and Clinical. Each group is derived from attendance records; the chart includes visible X/Y axes, percentage tick labels, guide lines, and a color legend. The PQRST generator retains a small P wave, sharp QRS complex, and broader T wave.

Before:

```tsx
<path d={overallEcgPath} ... />
```

After:

```tsx
{groupedEcgPaths.map(group => <path d={group.path} stroke={group.color} ... />)}
```

**Verification.** Confirmed the chart is non-animated and grouped in `Home.tsx`; build passes.

## Issue E — Tomorrow widget

**Cause found.** The Tomorrow widget handler only called `setShowMarkAttendance(true)`, so it opened the Attendance view without changing `selectedDateStr`.

**Fix applied.** The handler now sets the next calendar date before opening the view:

```tsx
onClick={() => {
  setSelectedDateStr(toDateString(addDays(today, 1)));
  setShowMarkAttendance(true);
}}
```

**Verification.** Confirmed in `Home.tsx`; typecheck and build pass.

## Issue F — Subject modal pre-redesign layout

**Cause found.** The current Subject modal had the post-polish widened `max-w-lg` shell and increased chip/stat spacing. The historical pre-redesign reference at `59800cd` used `max-w-md`, `space-y-4`, a one-column-to-two-column responsive control row, and `pt-3` before the four-stat row.

**Fix applied.** Restored those historical visual dimensions while preserving the existing `ModalSheet`, attendance handlers, stat explanations, hidden close-button CSS state, and data binding.

Before:

```tsx
maxWidth="max-w-lg"
<div className="space-y-5 pt-1">
<div className="grid grid-cols-2 gap-4">
```

After:

```tsx
maxWidth="max-w-md"
<div className="space-y-4 pt-1">
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
```

**Verification.** Confirmed in `SubjectCard.tsx`; typecheck and build pass.

## Issue G — Date-wheel lag on Attendance open

**Cause found.** The Attendance view used a translated parent entry animation (`initial y: 8`, `animate y: 0`) while the fixed date-wheel wrapper was nested inside that transformed motion subtree. This can create a delayed/sticky containing-block transition for a fixed descendant.

**Fix applied.** Removed the parent Y translation and retained a short opacity-only entry. The date wheel therefore begins in its final fixed position without a mid-transition offset.

Before:

```tsx
initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
```

After:

```tsx
initial={{ opacity: 0 }} animate={{ opacity: 1 }}
```

**Verification.** Confirmed in `Home.tsx`; build passes.

## Issue H — Today at a Glance filtering

**Cause found.** The source was all `dayEntries.filter(entry => entry.kind === 'card')`, so completed subjects remained visible.

**Fix applied.** Added `glanceEntries`, filtering the scheduled card entries through the existing `isCompletedPlannedEntry` calculation. The source remains the selected day’s actual scheduled entries, and only entries with remaining planned classes appear.

```tsx
const glanceEntries = dashboardClassEntries.filter(entry => !isCompletedPlannedEntry(entry));
```

**Verification.** Confirmed in `Home.tsx`; typecheck and build pass.

## Issue I — Modal backdrop tap

**Cause found.** No regression was present in the current `ModalSheet`. Its backdrop handler is still:

```tsx
const handleBackdropClick = onBackdropClick || onClose;
...
<motion.div ... onClick={handleBackdropClick} />
```

The dialog surface stops propagation, and swipe-down/Escape remain handled by the existing component/accessibility hook.

**Fix applied.** No code change was made because the required behavior is already present. This avoids touching a functioning shared modal implementation.

**Verification.** Confirmed directly in `modal-sheet.tsx`; typecheck/build pass.

## Issue J — Activity feed

**Cause found.** Home only loaded `att_dashboard_activity_v1` plus derived attendance records. Manage already persisted typed records in `att_manage_history`, but Home did not read or display that history. The old visual was a bullet list with a simple hairline.

**Fix applied.** Home now merges the existing Manage history with attendance-derived activity records. Existing history types such as Added Slot, Added Subject, Added Rotation, Moved Subjects, Removed from Slot, Deleted Subject, Edited Subject, Edited Ward, and Edited Planned are surfaced with target names. The visual is now a timeline with a left time column, center icon marker, continuous center hairline, type-specific colors/icons, and an inline expanding footer link.

Before:

```tsx
<span className="... rounded-full ..." />
<span>{item.text}</span>
```

After:

```tsx
<time>{new Date(item.timestamp).toLocaleTimeString(...)}</time>
<span className={color}><Icon /></span>
<span>{item.text}</span>
```

The code maps attendance, missed, edit, slot, vacation, percentage, and neutral activity kinds to distinct icons and colors.

**Important audit note.** The existing codebase does not currently emit dedicated Manage-history records for every requested subtype, notably unmark actions, vacation-period edits, and preferred-percentage changes. This pass does not invent false events or modify unrelated mutation APIs; it surfaces all existing stored history and attendance events with target names. The timeline renderer is ready for those existing event types when their source operations record them.

**Verification.** Timeline and history merge are written to `Home.tsx`; root typecheck/build pass.

## Validation summary

- Root `npm run typecheck`: passed.
- Root `npm run build`: passed.
- Push-service `npm run typecheck`: passed.
- Push-service `npm test`: passed (`notification regression tests passed`; `nightly delivery simulation passed`).
- `git diff --check`: passed.
- No Storage Warning text remains in application source.
- No blur pseudo-element remains.
- Branch remains `release/v1.6.15`; no version bump, new branch, merge, or push to `main`.
- Attendance calculations, curriculum data, storage schemas, notification logic, backup/restore, update gate, Danger Area, inline-message timing, hidden close-button state, Timetable keys, slot-removal behavior, holiday prediction, and confirm-button border behavior were not intentionally altered.
