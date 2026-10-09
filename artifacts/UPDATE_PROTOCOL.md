# Attendenz Update Protocol Guide

This guide belongs beside [`release.config.json`](./release.config.json). It explains how future developers should release versioned builds without accidentally auto-updating older users.

## Current release policy

The current configuration is:

```json
{
  "version": "1.7.2",
  "releaseType": "minor",
  "updateMode": "manual",
  "updateProtocol": 2,
  "automaticFromVersion": "1.7.2"
}
```

For clients running this corrected checker, `updateMode: "manual"` always takes precedence: a release remains pending until the user selects Update, regardless of the automatic threshold. Only a release whose server metadata explicitly says `updateMode: "automatic"` may use protocol-based auto-activation. Missing or unrecognized modes are treated as manual.

The first build containing this correction is a one-time compatibility exception: already-deployed v1.7.2 clients run an older checker that ignores `updateMode`, so with the threshold at v1.7.2 they may automatically install that first same-version build. Once that build is installed, subsequent manual releases use the in-app update sheet.

## Files involved

| File | Purpose |
|---|---|
| `artifacts/release.config.json` | Version, update mode, protocol level, automatic threshold, and release summary |
| `artifacts/vite.config.ts` | Generates `version.json`, `build-revision.json`, and `sw.js` |
| `artifacts/src/main.tsx` | Compares server metadata and performs manual or automatic activation |
| `artifacts/src/lib/appVersion.ts` | Exposes version, build revision, and protocol constants |
| `artifacts/sw.template.js` | Revision-specific cache and service-worker approval logic |
| `push-service/src/index.ts` | Sends remote Update Available pushes only for subscribed devices with a pending manual release |
| `push-service/migrations/0009_device_build_revision.sql` | Stores the installed device build so same-version release revisions can be detected |
| `artifacts/src/attendenz-build-revision.d.ts` | TypeScript declaration for the build-time revision constant; required and must remain |

## Meaning of the release fields

### `version`

Use a three-part semantic version such as `1.8.0`. Increase it for a public release. Keep it unchanged for a same-version corrective build intended only for an already-compatible cohort.

### `updateMode`

Use `manual` when users must explicitly approve a release. Use `automatic` only when the release is safe to activate without a prompt for the legacy clients that understand this field.

### `updateProtocol`

This is the client capability level. Keep it at `2` for ordinary releases using the current revision-aware protocol. Increase it only when the protocol implementation changes incompatibly.

### `automaticFromVersion`

Choose this value deliberately for **every release**. It is the minimum installed version allowed to use the protocol-aware automatic path when the release mode is explicitly `automatic`. It does not turn a manual release into an automatic one for clients with the corrected checker. It remains important for older clients that may use the threshold without honoring the mode.

- For an ordinary manual version bump, set it to the new release version (for example, `1.8.0` for a manual `1.8.0` release) to keep earlier clients out of the legacy automatic path.
- For a same-version automatic fix, keep/set it to the first compatible installed-version cohort that should receive that automatic build (for example, v1.7.1 clients for a protocol-2 v1.7.1 revision). It need not increase for every same-version build if the same cohort is intended.
- For an emergency manual release, a higher threshold such as `99.0.0` can exclude all current clients from legacy automatic behavior.

For example:

```json
"automaticFromVersion": "1.7.1"
```

A client may auto-activate only when the server explicitly selects automatic mode, the client supports the required protocol, its installed version meets this threshold, and the server reports a newer version or a different build revision. In manual mode, updated clients record the release as pending and wait for the user’s choice.

Remote **Update Available** push notifications follow the same manual-release policy. The push Worker receives the configured release mode/version/build revision at deploy time and sends at most one push per subscribed device and release identity when the device is behind by version or (for a same-version manual release) build revision. The device must have system notifications enabled and the Update Available notification preference enabled. Automatic releases do not send Update Available pushes.

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

Older users update through the normal manual flow. Set the threshold to the new release version so older clients do not silently use the automatic path. Updated clients enforce manual mode directly; the threshold additionally protects older clients that rely on it.

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
2. Confirm `updateMode` is intentional; automatic activation requires the server mode to be explicitly `automatic`.
3. Confirm `updateProtocol` matches the code.
4. Choose `automaticFromVersion` for this release’s intended cohort and confirm older clients are not included accidentally.
5. Confirm a same-version build will have a different Git revision.
6. Run root typecheck and production build.
7. Run push-service typecheck and tests when push-service or release metadata changes.
8. Inspect generated `dist/public/version.json` and `dist/public/sw.js`.
9. Confirm no unrelated release notes, migrations, or generated artifacts were changed.

**Safety rule:** changing `updateMode` or `automaticFromVersion` changes who may update without explicit approval. Treat both fields as release-policy controls.
