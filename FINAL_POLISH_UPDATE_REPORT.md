# Final Polish Update Report

Branch: `release/v1.6.15`  
Commit: `ff750db`  
Pull request: [PR #41](https://github.com/br7p56y8ps-boop/Attendenz-Tracker/pull/41)

## Issue 1 — Vacation/Exam Period cards

**Cause.** The previous implementation only replaced the current-day bottom control (`todayBottom`). Header advisory rendering and all past/future mode branches continued to render ordinary status/advisory content.

**Change.** `HomeCard.tsx` now gives `isVacationOrExamPeriod` priority over every mode branch. The vacation branch renders only the subject name, time, percentage, and `Vacation / Exam Period` label. The normal today footer is also explicitly disabled, and selection handling rejects vacation-period marking.

Before:

```tsx
{effectiveMode === 'past' ? (...) : (...normal future/today content...)}
{effectiveMode === 'today' && <AnimatePresence>...</AnimatePresence>}
```

After:

```tsx
{isVacationOrExamPeriod ? (
  <div>subject + time + Vacation / Exam Period + percentage</div>
) : effectiveMode === 'past' ? (...) : (...normal content...)}
{!isVacationOrExamPeriod && effectiveMode === 'today' && (...footer...)}
```

## Issue 2 — Blur under navigation and around date wheel

**Cause.** The prior blur was applied only to the visible floating surfaces, so pass-through content remained sharp outside those surface rectangles.

**Change.** Added transparent pseudo-elements with `backdrop-filter` to extend blur across the bottom-nav pass-through region and the full region below the app bar behind the date wheel. No background, gradient, or glow is applied to these blur layers.

Before:

```css
.bottom-nav-surface { backdrop-filter: blur(18px) saturate(125%); }
.home-date-wheel-float .date-wheel-surface { backdrop-filter: blur(16px) saturate(135%); }
```

After:

```css
.bottom-nav-surface::before { backdrop-filter: blur(14px) saturate(110%); }
.home-date-wheel-float::before { backdrop-filter: blur(12px) saturate(108%); }
```

## Issue 3 — Confirm button placement/background

**Cause.** Confirmation was rendered after the three selection buttons in a separate full-width block, and its pseudo-element background was transparent, exposing the underlying block.

**Change.** The selected option now is replaced in-place by the confirm button. The separate lower confirm button was removed. The rotating border remains on the confirm button only; static option buttons do not use the animation. The inner pseudo-element uses the card surface to eliminate the exposed block.

Before:

```tsx
<div className="flex gap-2">{options}</div>
{pendingSelection && <button>Confirm ...</button>}
```

After:

```tsx
<div className="flex gap-2">
  {options.map(option => pendingSelection === option
    ? <button className="attendance-confirm-button">Confirm ...</button>
    : <button className="attendance-option-button">...</button>)}
</div>
```

## Issue 4 — Dashboard ECG

**Cause.** The previous graph was a generic polyline/trend presentation.

**Change.** `overallEcgPath` now builds deterministic PQRST-like complexes for each attendance-trend point. Baseline position is derived from the attendance percentage, while the small P wave, sharp QRS complex, and broader T wave are rendered as a non-animated SVG path. The path remains data-driven from the attendance trend.

Before:

```tsx
<polyline points={trendPoints.map(...).join(' ')} />
```

After:

```tsx
<path d={overallEcgPath} fill="none" ... />
```

## Issue 5 — Subject Alerts names

**Exact cause.** The old code treated storage keys as display names and only removed the first colon-delimited segment:

```tsx
const parts = name.split(':');
const label = parts.length > 1 ? parts.slice(1).join(':') : name;
```

That converted `academic:acad:medicine` into `acad:medicine`, and `sgt:ua_...` into the raw user-added ID.

**Change.** `resolveSubjectAlert()` now resolves SGT IDs through the configured subject source, academic IDs through user-added subjects or preset constants, and ward IDs through the preset ward display-name helper. Preset renames are preserved. The dashboard uses the resolved `{ name, category }` for both Subject Alerts and maximum-potential graphs.

Before:

```tsx
<span>{label} ({category})</span>
```

After:

```tsx
const resolved = resolveSubjectAlert(storageKey);
<span>{resolved.name} ({resolved.category})</span>
```

## Issue 6 — Maximum Percentage Possible

**Removed statistics location.** The original logic was in `artifacts/src/pages/Timetable.tsx` at rollback reference `59800cd`, in the `predictionItems` memo around lines 218–240. Its core calculation was:

```tsx
const conducted = d.attended + d.missed;
const remaining = Math.max(0, e.planned - conducted);
const maxPossiblePct = (d.attended + remaining) / e.planned * 100;
```

**Change.** The Home dashboard now reuses the same remaining-versus-planned formula per subject. The result is rendered as a clickable SVG graph with current attendance and maximum attainable attendance lines, rather than as a progress bar. Names use the same resolver described in Issue 5.

```tsx
const conducted = item.attended + item.missed;
const remaining = Math.max(0, planned - conducted);
const current = conducted === 0 ? 0 : (item.attended / conducted) * 100;
const maximum = planned > 0 ? ((item.attended + remaining) / planned) * 100 : current;
```

## Issue 7 — Mark Attendance icon

**Change.** Replaced the clock icon with `ClipboardCheck`.

Before:

```tsx
<Clock3 />
```

After:

```tsx
<ClipboardCheck />
```

## Issue 8 — Dashboard attendance pills

**Change.** Converted the summary values to a consistently padded 2×2 grid of colored pill containers and added Missed.

Before:

```tsx
Conducted {overallTotal} · Attended {overallAttended} · Current {overallPercentage}%
```

After:

```tsx
Conducted: {overallTotal}
Attended: {overallAttended}
Missed: {overallMissed}
Current: {overallPercentage}%
```

## Issue 9 — Chevron and separator

**Change.** Removed the Overall Attendance chevron icon and removed the `·` from the dashboard date line.

## Issue 10 — Today’s Activity

**Cause.** The card header rendered an `Activity` decoration and the marker offset did not align with the list hairline.

**Change.** Removed the header icon and aligned the hairline at `left-[7px]` with the marker at `-left-[14px]` relative to the adjusted `pl-5` content column.

## Issue 11 — Subject modal container

**Change.** Increased the modal max width from `max-w-md` to `max-w-lg`, increased the chip gap from `gap-3` to `gap-4`, increased modal content spacing to `space-y-5`, and increased separation before the four-stat row from `pt-3` to `pt-5`. The Attended/Missed controls remain side-by-side.

## Preservation and validation

The following were not changed: attendance storage schemas, attendance calculation paths, preset curriculum data, vacation/exam source data, notification scheduling, backup/restore safeguards, manual update gate, Danger Area deletion, inline-message timing, hidden close-button state, Timetable compound keys, slot removal behavior, and holiday-skip prediction.

Validation results:

- Root `npm run typecheck`: passed.
- Root `npm run build`: passed.
- Push-service `npm run typecheck`: passed.
- Push-service `npm test`: passed (`notification regression tests passed`; `nightly delivery simulation passed`).
- `git diff --check`: passed.
- Working tree: clean after push.
- Branch: `release/v1.6.15`.
- No new branch, version bump, merge, or push to `main`.
