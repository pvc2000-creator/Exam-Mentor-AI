# Deployment

Not deployed by this project. The app needs Node 20+ and PostgreSQL 14+.

## Low-cost option

- **Database:** Supabase or Neon free tier (PostgreSQL). Use the pooled connection string for `DATABASE_URL`. The app enforces data isolation in the server; Supabase row-level security is not used because the browser never talks to the database directly and no Supabase keys reach the client.
- **App:** any Node host (Render, Railway, Fly.io, a small VM) running `npm ci && npx prisma migrate deploy && npm run build && npm start`. Vercel also works; route handlers run as serverless functions.

## Steps

1. Set environment variables (see `.env.example`): `DATABASE_URL`, `SECURE_COOKIES=true`, `CRON_SECRET`, optionally `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`.
2. `npx prisma migrate deploy`
3. `npm run db:seed` (exam configuration and synthetic bank; creates no users)
4. `npm run admin:create` (prompts for credentials)
5. `npm run build && npm start`
6. Schedule `POST /api/cron/expire` with `Authorization: Bearer $CRON_SECRET` every few minutes (attempts are also auto-submitted lazily when the student returns).

## Scaling notes

- The rate limiter is in memory; with several instances use a shared store (Redis/Upstash) in `src/lib/server/rate-limit.ts`.
- Measured numbers are in `docs/load_test_results.md` (single process, sequential). Concurrency has not been tested.
- Response history grows with use; profile recomputation reads a student's answers for the affected topics. If histories become very long, add a retention window to `loadEvents` (recency weighting already makes old answers count little).
