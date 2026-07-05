---
name: Auth & custom data architecture
description: Offline login, password encoding, forgot-password wipe scope, custom subjects/wards storage
---

## Auth (AuthContext.tsx)
- Passwords encoded with `encodePassword()` using `TextEncoder` → base64 (UTF-8 safe; raw `btoa(password)` throws on non-Latin1 chars).
- Session persisted with `att_session = 'true'` in LS; logout only removes this key, data intact.
- `forgotPassword()` does **targeted** deletion: iterates `ALL_APP_KEYS` array, NOT `localStorage.clear()` (which would wipe unrelated origin data).
- `ALL_APP_KEYS` in AuthContext must be kept in sync whenever a new LS key is added anywhere in the app.

**Why:** `localStorage.clear()` deletes all origin keys including third-party/unrelated ones. Targeted wipe is scoped and safe.

## Custom Data (CustomDataContext.tsx)
- Custom subjects stored at `att_custom_subjects`; custom wards at `att_custom_wards`.
- IDs generated as `cs_${Date.now()}_${random}` / `cw_${Date.now()}_${random}`.
- `getCurrentCustomWard()` checks custom wards by today's date string (YYYY-MM-DD comparison).
- Home.tsx checks custom ward FIRST, falls back to built-in `getCurrentWard()` from constants.ts.
- Attendance for custom subjects stored in same `subjects` store in AttendanceContext (keyed by subject name).
- Attendance for custom wards stored in `wards` store (keyed by ward name, same as built-in wards).
