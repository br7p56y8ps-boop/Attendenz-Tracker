---
name: Home selection key format
description: Format of homeSelections keys; used by CalendarPage to group attendance by date.
---

## Format
`${dateStr}-${subjectKey}-${sessionId}`

- `dateStr` = `YYYY-MM-DD` (always first 10 chars)
- `subjectKey` = subject name or `ward-${wardName}` for ward slots
- `sessionId` = slot index string (prevents two slots for same subject on same day from colliding)

## Parsing in CalendarPage
- Date = `key.slice(0, 10)` — stable as long as format stays YYYY-MM-DD
- Label = everything between position 11 and the last `-segment` (sessionId dropped)
- sessionId is the last `-`-delimited segment; subject key may itself contain `-` (e.g. `ward-General Surgery`)

**Why:** sessionId suffix was added to fix "highlighting lost" bug where ward vs ward_replacement shared same key.
