# Load test results

Generated 2026-10-19T10:38:22.658Z by `npm run loadtest`.

Machine: 4 × Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 GiB RAM, linux 6.18.44-fc-v139, Node v22.22.0. PostgreSQL 16 on the same machine, single Node process, no HTTP layer (server functions are called directly, so network and rendering time are excluded).

Levels are cumulative: each level adds its students to the database before measuring, so later levels run against a larger table.

| Students | Past answers per student (up to) | Answers in DB | Profile recompute p50/p95/max (ms) | Dashboard query | Personalised mock generation | Full 30-question attempt (start, 30 saves, submit) |
|---|---|---|---|---|---|---|
| 20 | 500 | 10,038 | 240 / 264 / 264 (n=20) | 10 / 16 / 16 (n=10) | 30 / 40 / 40 (n=10) | 545 / 592 / 592 (n=10) |
| 100 | 1000 | 106,589 | 280 / 318 / 346 (n=100) | 11 / 13 / 13 (n=10) | 42 / 49 / 49 (n=10) | 640 / 784 / 784 (n=10) |

## Assumptions and limits

- History rows are bulk-inserted (each past mock: 50 questions, about 60% correct, 15% unanswered) so large histories can be created quickly; the timed operations use the normal application code paths.
- Measurements are sequential (one request at a time). Concurrency was not tested; the in-memory rate limiter and a single Node process are the expected first limits (see docs/deployment.md).
- Profile recomputation reads all of a student's answers for the affected topics, so its cost grows with history length. Submission only recomputes topics in that attempt.
- These numbers describe this machine and dataset only. They are not a claim about production scalability.
