---
name: Attendance tracker localStorage keys
description: Complete list of all LS keys used; must be kept in sync with ALL_APP_KEYS in AuthContext for forgotPassword targeted wipe.
---

| Key | Owner | Purpose |
|---|---|---|
| `att_auth` | AuthContext | `{ username, passwordEncoded }` |
| `att_session` | AuthContext | `'true'` when logged in |
| `att_custom_subjects` | CustomDataContext | `CustomSubject[]` |
| `att_custom_wards` | CustomDataContext | `CustomWard[]` |
| `att_whats_new_version` | WhatsNewPopup | last seen app version string |
| `attendance_tracker_subjects` | AttendanceContext | `Record<string, {attended,missed}>` |
| `attendance_tracker_ward` | AttendanceContext | `Record<string, {attended,missed}>` |
| `attendance_tracker_home_selections` | AttendanceContext | `Record<string, SelectionType>` |

**Why:** When adding new LS keys, add them to `ALL_APP_KEYS` in `AuthContext.tsx` so `forgotPassword()` wipes them.
