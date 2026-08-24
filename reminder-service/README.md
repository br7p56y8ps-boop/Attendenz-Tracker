# Attendenz A1 Reminder Service

This service is for the A1 device-only reminder mode. It does not require an Attendenz login and does not receive attendance history, backups, photos, or full curriculum data.

## Reminder behavior

The service sends one grouped Need Attention summary around each device's local midnight when `midnightNeedAttention` is enabled. It sends one reminder for each upcoming warning/danger subject at the configured lead time when `preClassNeedAttention` is enabled. An optional grouped digest of all scheduled subjects is controlled by `allScheduledDigest`.

The Worker runs every five minutes. Cloudflare Cron Triggers run in UTC, so the Worker converts each device's saved IANA timezone before deciding whether local midnight or a lead-time window is due. The five-minute window is intentional: it tolerates normal trigger timing variance while delivery keys prevent duplicates.

## A1 payload boundary

The client sends only:

- A random device ID and device capability token generated locally.
- The OneSignal browser subscription identifier needed for targeting this one device.
- The device IANA timezone.
- Notification enabled state and reminder preferences.
- A bounded horizon of upcoming reminder occurrences.
- Each occurrence's opaque local ID, safe display name, local date, start time, category, and already-computed `needsAttention` classification.

The client never sends attendance counts, attendance history, snapshots, export data, profile information, or the complete routine bundle. The server never needs to calculate attendance percentages; the PWA computes the warning/danger classification locally and sends only the boolean result.

## Security rules

The first registration creates a device record using the locally generated capability token. Subsequent updates require the same token. Tokens are stored hashed with SHA-256. All endpoints require HTTPS, validate payload size and field lengths, reject unknown or malformed values, and apply a per-device update throttle at the deployment edge if enabled. Device records and reminder rows expire automatically after 45 days without sync. The delete endpoint removes the device record and all reminder rows.

The OneSignal REST API key is a server-only secret. The Worker targets the stored browser subscription ID directly and does not create an Attendenz login or OneSignal external user ID. It must never be placed in the PWA bundle, local storage, Git, logs, or user messages.

## Hosting and deployment direction

The intended deployment is a Cloudflare Worker with a D1 database and Cron Triggers. Create the database, apply `schema.sql`, replace the placeholder `database_id` in `wrangler.toml`, and set these secrets through the Cloudflare secret store:

```text
ONESIGNAL_APP_ID
ONESIGNAL_REST_API_KEY
```

The existing public OneSignal App ID may be used as `ONESIGNAL_APP_ID`; the REST API key must be created in OneSignal and entered only as a server secret. Do not paste it into the repository or chat.

The PWA needs the deployed Worker URL as `VITE_REMINDER_SERVICE_URL` at build time. Until that variable is configured, the PWA continues to work normally and simply does not attempt background reminder sync.

Example deployment sequence after the account-specific database ID and Worker URL are available:

```sh
npx wrangler d1 create attendenz-reminders
npx wrangler d1 execute attendenz-reminders --remote --file=./schema.sql
npx wrangler secret put ONESIGNAL_APP_ID
npx wrangler secret put ONESIGNAL_REST_API_KEY
npx wrangler deploy
```

The commands are examples only. They must be run from the Cloudflare-connected deployment environment, not with credentials placed in Git or the PWA.

## Current status

The Worker source, schema, deployment configuration, and PWA sync provider are implemented on the A1 feature branch. No Cloudflare database, Worker, secret, or production sync endpoint has been created yet. End-to-end delivery remains pending deployment and a real iPhone test.

## Reference documentation

- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Cloudflare Workers pricing and D1 limits: https://developers.cloudflare.com/workers/platform/pricing/
- OneSignal REST API overview: https://documentation.onesignal.com/reference/rest-api-overview
- OneSignal Create Message API: https://documentation.onesignal.com/reference/create-message
- OneSignal Web SDK reference: https://documentation.onesignal.com/docs/en/web-sdk-reference
