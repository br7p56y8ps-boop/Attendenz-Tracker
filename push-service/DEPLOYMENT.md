# Direct Push Service Deployment

The Block Posting placement reminder adds nullable columns to the existing D1 `devices` table. Apply its migration before deploying the worker build that writes those columns.

From `push-service/`, deploy in this order:

```sh
npx wrangler d1 migrations apply attendenz-reminders --remote
npm run build
npx wrangler deploy
```

The migration is `migrations/0010_block_placement_reminder.sql`. Confirm Wrangler reports the migration as applied before deployment. Do not reset or recreate the database; existing device subscriptions and notification registrations are preserved.

The app syncs the next eligible placement-ending reminder along with its existing remote-push registration. The worker sends the reminder on the local calendar day before the active placement ends, only when system notifications and the Logbook reminder preference are enabled. The delivery key prevents repeat pushes for the same placement/date. If a later placement has already been scheduled, no reminder is registered for the earlier placement.
