# HTTP API

All endpoints are same-origin, use the `em_session` httpOnly cookie, validate bodies with zod and return `{ error }` with a safe message on failure (400 invalid, 401 signed out, 403 wrong role, 404 not found or not yours, 409 conflict, 413/415 upload, 429 rate limited). Another student's ids always return 404.

| Method | Path | Who | Body / result |
|---|---|---|---|
| POST | `/api/mocks` | student | `{ type, subjectId?, topicId?, questionCount?, durationMinutes?, feedbackMode?, seed? }` → `{ mockId, attemptId }`. 409 if a test is already open. 20 per 10 min. |
| POST | `/api/attempts/:id/answer` | owner | `{ mockTestQuestionId, selectedOption: "A"–"F" \| null, timeSpentMs, markedForReview?, selfConfidence? (1–3), visit? }` → `{ ok, savedAt }`. Time is clamped to wall-clock elapsed. After the deadline + 15 s: auto-submits and returns 409. |
| POST | `/api/attempts/:id/feedback` | owner | `{ mockTestQuestionId }` → correct option and explanation (immediate-feedback sets only); locks that answer. |
| POST | `/api/attempts/:id/submit` | owner | `{}` → `{ attemptId, alreadySubmitted }`. Idempotent. |
| POST | `/api/tutor` | student | `{ questionId, selectedOption?, language: "EN"\|"HI" }` → explanation, why your answer, concept note, practice variant, provider. Only for questions the student has answered. 20 per 10 min. |
| GET | `/api/account/export` | student | JSON download of all the student's data (no password hash). |
| POST | `/api/admin/import` | admin | multipart `file` (.csv/.json/.pdf ≤ 5 MB), `topicId` for PDFs → import report. |
| POST | `/api/admin/questions/:id/review` | admin | `{ action: "approve" }`, `{ action: "reject", note }`, or `{ action: "edit", stem, options[], correctOption, difficulty, topicId, … }`. |
| POST | `/api/admin/syllabus` | admin | multipart JSON config, `activate=on` optional. |
| POST | `/api/admin/syllabus/:id/activate` | admin | Activate a version. |
| POST | `/api/admin/papers/:id/verify` | admin | `{ isVerified }`. |
| POST | `/api/cron/expire` | scheduler | `Authorization: Bearer $CRON_SECRET`; auto-submits overdue attempts. |

Login, registration, logout and account deletion are server actions (`src/app/actions/`), rate limited per IP or user.
