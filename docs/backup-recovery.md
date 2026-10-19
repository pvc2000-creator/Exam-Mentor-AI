# Backup and recovery

All state is in PostgreSQL; the app server is stateless.

## Back up

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > exammentor-$(date +%F).dump
```

Run daily (cron, or your host's scheduled backups; Supabase and Neon include point-in-time recovery on paid tiers). Keep at least 7 daily and 4 weekly copies, stored encrypted and off the database host. Backups contain student personal data: restrict access.

## Restore

```bash
createdb exammentor_restore
pg_restore --no-owner --dbname=exammentor_restore exammentor-2026-10-19.dump
npx prisma migrate deploy   # with DATABASE_URL pointing at the restored database
```

Check `SELECT count(*) FROM "Response";` and sign in as a test account before switching `DATABASE_URL`.

## Rebuilding derived data

Skill states, snapshots and recommendations derive from `Response` rows. If they are lost or the policy changes, call `recomputeProfile(userId)` (`src/lib/server/profile.ts`) for each user.

## Account deletion

Deleting an account cascades through all of the student's rows. Backups taken earlier still contain them until they expire; state this retention period in your privacy notice.
