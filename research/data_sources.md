# Data sources and licensing

## What is in the question bank

| Set | Count | Origin | Status | How answers are checked |
|---|---|---|---|---|
| Parameterised templates (`src/lib/questions/templates.ts`) | 539 | `SYNTHETIC_TEMPLATE` | VERIFIED (`DETERMINISTIC_COMPUTATION`) | The answer is computed in code from the generated numbers. Distractors come from named misconceptions. |
| Factual GK/science set (`data/questions/authored-gk-science.json`) | 111 | `AI_AUTHORED` | 110 PROVISIONAL, 1 PENDING_REVIEW | Written during development by an AI model, then passed automated structural checks. **No human review yet.** The model's answers are not treated as verified. |
| Official previous-year questions | 0 | – | – | None obtained (see below). |

Every question records origin, `isSynthetic`, source, verification status and method, licence and a content fingerprint. Students see a source label on every question ("Synthetic · computed answer", "AI-authored · provisional"). Set `ALLOW_PROVISIONAL_QUESTIONS=false` to serve only verified questions.

## Sources considered and not used

| Source | Why not used |
|---|---|
| MPESB rule book PDF | Not reachable from the build environment; to be checked manually. |
| MPESB answer keys and response sheets (TAC portal) | Behind candidate login. Not accessed. |
| Coaching-site "previous year papers" | Provenance and reuse licence unclear; publicly visible does not mean republishable. |
| Third-party question banks | No licence permitting reuse was found. |

## Licensing rules built into the importer

- Each `Source` row has `license` and `allowsRepublish`. Exam-information sources are stored as "Reference only".
- Uploaded files always enter `PENDING_REVIEW`; an uploaded paper starts unverified.
- The validator rejects a synthetic question labelled as an official previous-year question, and an AI-authored question marked VERIFIED without human review or deterministic computation.
- A previous-year paper that cannot be republished can still be imported for analysis: mark it unverified/unpublished and keep its questions in review so they are never served, while `analyze:papers` uses their topic and difficulty metadata once an admin verifies the paper record.

## Adding real content

1. Obtain papers or questions you have the right to use.
2. Import with *Admin → Import* or `npm run import:questions -- file.csv` (CSV, JSON or PDF; samples in `data/samples/`).
3. Review each question in *Admin → Review queue*.
4. For previous-year papers, mark the paper verified after checking against the official answer key, then run `npm run analyze:papers`.
5. Run `npm run report:quality`.
