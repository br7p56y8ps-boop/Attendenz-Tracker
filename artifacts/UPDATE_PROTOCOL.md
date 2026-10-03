# Attendenz Update Protocol Guide

This guide belongs beside [`release.config.json`](./release.config.json). It explains how future developers should release versioned builds without accidentally auto-updating older users.

## Current release policy

The current configuration is:

```json
{
  "version": "1.7.1",
  "releaseType": "minor",
  "updateMode": "automatic",
  "updateProtocol": 2,
  "automaticFromVersion": "1.7.1"
}
```

This means:

- Existing **protocol-2 clients running v1.7.1** may automatically receive a newer same-version build when its Git build revision changes.
- Clients older than **v1.7.1** do not use the same-version automatic revision path.
- A higher-version release still follows the compatibility behavior implemented by that client; do not assume every old client can use the new protocol.
- `updateMode` is also retained for legacy clients. Treat it as a release-policy setting, not merely a label.

## Files involved

| File | Purpose |
|---|---|
| `artifacts/release.config.json` | Version, update mode, protocol level, automatic threshold, and release summary |
| `artifacts/vite.config.ts` | Generates `version.json`, `build-revision.json`, and `sw.js` |
| `artifacts/src/main.tsx` | Compares server metadata and performs manual or automatic activation |
| `artifacts/src/lib/appVersion.ts` | Exposes version, build revision, and protocol constants |
| `artifacts/sw.template.js` | Revision-specific cache and service-worker approval logic |
| `artifacts/src/attendenz-build-revision.d.ts` | TypeScript declaration for the build-time revision constant; required and must remain |

## Meaning of the release fields

### `version`

Use a three-part semantic version such as `1.8.0`. Increase it for a public release. Keep it unchanged for a same-version corrective build intended only for an already-compatible cohort.

### `updateMode`

Use `manual` when users must explicitly approve a release. Use `automatic` only when the release is safe to activate without a prompt for the legacy clients that understand this field.

### `updateProtocol`

This is the client capability level. Keep it at `2` for ordinary releases using the current revision-aware protocol. Increase it only when the protocol implementation changes incompatibly.

### `automaticFromVersion`

This is the minimum installed version allowed to use the protocol-aware automatic path. For example:

```json
"automaticFromVersion": "1.7.1"
```

A client is eligible only when it supports the required protocol, its installed version is at least this threshold, and the server reports either a newer version or a different build revision.

## Release scenarios

### Ordinary release requiring approval

```json
{
  "version": "1.8.0",
  "releaseType": "minor",
  "updateMode": "manual",
  "updateProtocol": 2,
  "automaticFromVersion": "1.8.0",
  "summary": "Release summary shown to users."
}
```

Older users update through the normal manual flow. Set the threshold to the first compatible cohort so older clients do not silently use the same-version automatic path.

### Same-version fix for existing v1.7.1 users

Keep the public version and protocol threshold unchanged:

```json
{
  "version": "1.7.1",
  "updateMode": "automatic",
  "updateProtocol": 2,
  "automaticFromVersion": "1.7.1"
}
```

Commit and deploy the fix. CI supplies a new Git revision. Existing protocol-aware v1.7.1 clients detect the changed revision and automatically install the new build. v1.7.0 and older clients do not use this same-version automatic path.

### New automatic cohort

For a future release such as v1.8.0, set `automaticFromVersion` to `1.8.0`. Users on v1.7.1 or older update to v1.8.0 through the intended manual/legacy-compatible flow first; later same-version v1.8.0 builds can then auto-update that cohort.

### Emergency manual release

Use:

```json
"updateMode": "manual",
"automaticFromVersion": "99.0.0"
```

This keeps the protocol fields valid while preventing current clients from entering the automatic path.

## Build revisions

Do not manually edit build revisions. The build environment normally supplies the Git SHA through `GITHUB_SHA`, `CF_PAGES_COMMIT_SHA`, or `ATTENDENZ_BUILD_REVISION`. The build writes the revision into `version.json`, `build-revision.json`, the application bundle, the generated service worker, and the service-worker cache name.

A same-version fix is safe only when the deployed build receives a different revision.

## Pre-merge checklist

1. Confirm `version` is correct.
2. Confirm `updateMode` is intentional.
3. Confirm `updateProtocol` matches the code.
4. Confirm `automaticFromVersion` does not include older clients accidentally.
5. Confirm a same-version build will have a different Git revision.
6. Run root typecheck and production build.
7. Run push-service typecheck and tests when push-service or release metadata changes.
8. Inspect generated `dist/public/version.json` and `dist/public/sw.js`.
9. Confirm no unrelated release notes, migrations, or generated artifacts were changed.

**Safety rule:** changing `updateMode` or `automaticFromVersion` changes who may update without explicit approval. Treat both fields as release-policy controls.
