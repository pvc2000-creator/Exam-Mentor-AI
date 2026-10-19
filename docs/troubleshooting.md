# Troubleshooting

| Symptom | Fix |
|---|---|
| `No active syllabus version. Run npm run db:seed.` | Run `npm run db:seed`. |
| `P1001 Can't reach database server` | Start PostgreSQL (`docker compose up -d` or the Windows service) and check `DATABASE_URL`. |
| `The question bank has no eligible questions` | Seed the bank, or set `ALLOW_PROVISIONAL_QUESTIONS=true`, or approve questions in Admin → Review queue. |
| Login works locally but not on HTTPS host, or the reverse | `SECURE_COOKIES` must be `true` behind HTTPS and `false` on plain `http://localhost`. |
| "Finish or submit your current test" | One open test per student. Resume it from the dashboard, or wait for it to auto-submit. |
| Upload rejected (415) | The file extension and content must match (.csv text, .json starting with `{`/`[`, .pdf starting with `%PDF-`). |
| PDF import finds no questions | Scanned PDFs have no text layer; OCR them first. Questions without an answer key are listed as unresolved. |
| Integration tests fail to connect | They use `exammentor_test` (override with `TEST_DATABASE_URL`); the user needs permission to create it. |
| E2E tests fail with "Could not find a production build" | Run `npm run build` first. |
| Playwright cannot find a browser | `npx playwright install chromium`. |
| Tutor always says "Offline tutor" | Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`; check server logs for "[tutor] AI provider error". |
| Windows: `'tsx' is not recognized` | Use `npm run …` scripts (they use the local binary), not a global command. |
