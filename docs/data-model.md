# Data model

Defined in `prisma/schema.prisma`; migrations in `prisma/migrations/`.

## Knowledge base

| Table | Purpose |
|---|---|
| `Exam` | The examination (MP_POLICE_CONSTABLE). |
| `SyllabusVersion` | Versioned exam configuration JSON (pattern, sections, marking, topics, sources, conflicts), with `verification` and `isActive`. Each mock references the version it used. |
| `Subject` → `Topic` → `Subtopic` → `LearningObjective` | Taxonomy, deterministic slug ids. Topics carry a concept note used by recommendations and the tutor. |
| `Source` | Where content came from, with licence and `allowsRepublish`. |
| `PaperRecord` | A previous-year paper (year, cycle, shift, source, `isVerified`). |
| `Question` | Deterministic id `q_<fingerprint prefix>`, unique `fingerprint`, skill key, EN/HI text, options (JSON with rationale and misconception tag), answer, explanations, difficulty and its basis, expected time, origin, `isSynthetic`, source/paper refs, `verificationStatus` (VERIFIED / PROVISIONAL / PENDING_REVIEW / REJECTED), `verificationMethod`, licence, quality flags, observed p-value. |
| `ReviewEvent` | Every status change with reviewer and note. |
| `ImportBatch` | One row per import with counts and the issue report. |

## Student data

| Table | Purpose |
|---|---|
| `User`, `Session` | Accounts (bcrypt hash) and sessions (SHA-256 of a random token). |
| `MockTest` | Type, seed, duration, marking scheme, allocation, selection criteria (policy and config version, difficulty distribution), shortages, scope. |
| `MockTestQuestion` | Position, slot category, reason, previously-seen flag and **snapshots** of the correct option, difficulty and topic, so later bank edits never change old results. |
| `Attempt` | Status (IN_PROGRESS / SUBMITTED / AUTO_SUBMITTED), start, deadline, submission, score and summary. One per mock. |
| `Response` | One row per question per attempt: selected option, correctness, time, visits, answer changes, mark-for-review, self-confidence, error category, confidence, tentative flag and evidence. References the question id; question text is not duplicated. |
| `StudentSkillState` | Per student, per topic and subtopic: counts, accuracy, smoothed and recent accuracy, difficulty-adjusted accuracy, time quartiles, slow share, repeated mistakes, mastery and confidence, state and reason, gate progress, trend, retention dates, next action. |
| `MasterySnapshot` | State after each attempt (history charts). |
| `MasteryMilestone` | Mastery achieved, lost, became weak, retention confirmed. |
| `Recommendation` | Kind, topic, title, reason, priority, status (ACTIVE / SUPERSEDED). |
| `AuditLog` | Admin actions and account deletions (no personal data in deletion entries). |

All student tables cascade on user deletion. Indexes cover per-user history (`Response(userId, topicId)`, `Attempt(userId, submittedAt)`, …) and question selection (`Question(topicId, verificationStatus, difficulty)`).
