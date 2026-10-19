# Architecture

ExamMentor AI is a modular monolith: one Next.js 15 (App Router) application with server-rendered pages, a few JSON route handlers, server actions for auth, and PostgreSQL through Prisma. There is no separate API service, queue or cache.

```
Browser ──► Next.js pages (server components)  ─┐
        ──► Route handlers /api/*  (JSON)        ├─► src/lib/server/*  (auth, mocks, profile, admin, tutor, import)
        ──► Server actions (login, register, delete account)        │
                                                                    ├─► src/lib/engine/*  (pure learning engine)
                                                                    └─► Prisma ──► PostgreSQL
Optional: src/lib/server/tutor.ts ──► Anthropic API (server-side only)
```

## Layers

| Folder | Contents | Depends on |
|---|---|---|
| `src/lib/engine/` | Pure functions: mastery, error classification, allocation, selection, scoring, recommendations, policy. No I/O. | nothing |
| `src/lib/questions/` | Question types, fingerprints, validation, parsers, deterministic templates, bank builders | engine-free |
| `src/lib/server/` | Database access, auth, mock lifecycle, profile recomputation, admin, tutor, uploads, simulations | engine, questions, Prisma |
| `src/app/` | Pages, route handlers, server actions | server |
| `src/components/` | UI components (client components for the exam runner, forms, charts) | – |
| `scripts/` | Seed, admin creation, import, reports, simulation, load test | server |

## Request flow for a test

1. `POST /api/mocks` → `createMock` reads the student's topic states, allocates slots (`allocation.ts`), selects questions (`selection.ts`) with a recorded seed, stores the mock with its allocation, selection criteria, shortages and a snapshot of each correct answer; `startAttempt` creates the attempt and one empty response per question.
2. `/attempt/[id]` renders the questions **without answers**. The `ExamRunner` client saves each change through `POST /api/attempts/[id]/answer` (queued, retried, backed up in localStorage).
3. Submission (`POST /api/attempts/[id]/submit`, or automatic at the deadline) scores against the snapshots, classifies each error with its evidence and confidence, recomputes the affected topic and subtopic states, writes mastery snapshots and milestones, and refreshes recommendations.

## Why these choices

- **No paid AI dependency.** The learning engine is deterministic and testable; the AI tutor is optional and checked against the stored answer.
- **Derived data can be rebuilt.** `StudentSkillState`, snapshots and recommendations are derived from `Response` rows, which are never deleted when a topic is mastered.
- **Explainability.** Every mock stores why each question was chosen; every state has a reason; every recommendation has a reason.
