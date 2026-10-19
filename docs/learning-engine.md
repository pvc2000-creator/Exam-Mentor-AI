# Learning engine

All thresholds live in `src/lib/engine/policy.ts` (`DEFAULT_POLICY`, version `policy-2026.10.1`). Each mock records the policy version it used.

## 1. Profile (per topic and subtopic)

Computed from the student's raw responses (`computeSkillState`): attempts, correct, incorrect, unanswered, distinct questions, accuracy, smoothed accuracy, recent accuracy (last 8), difficulty-adjusted accuracy, median and quartile times, share of slow answers (> 1.5 × expected time), repeated mistakes (same question missed twice, or the same misconception twice), trend (recent vs older accuracy), time since last practice, and retention dates.

**Mastery estimate:** a Beta(1, 1) prior updated by each answer with weights for recency (half-life 21 days) and difficulty (easy 0.8, medium 1.0, hard 1.25; a correct hard answer counts more, a wrong easy answer counts more). Unanswered counts half as a miss. The posterior mean is the estimate; **confidence** is 1 − posterior sd / sd of the uniform prior, so it grows with evidence.

## 2. States

| State | Rule |
|---|---|
| Not started | No answers |
| Too little data | Fewer than 3 answers |
| Weak | Estimate < 50 %, or recent accuracy < 50 % |
| Developing | Otherwise, until all gates pass |
| Proficient | All gates below pass; waiting for the retention check |
| Mastered | Gates passed, then a correct answer at least 7 days later (retention check) |
| Needs review | Mastered, then recent accuracy < 60 % or 30 days without practice |

**Mastery gates:** ≥ 8 answers; ≥ 6 different questions; ≥ 5 different questions correct; recent accuracy ≥ 80 %; ≥ 3 correct at medium or hard; estimate ≥ 72 %; ≤ 40 % slow answers; then the retention check. One perfect score cannot pass because of the attempt and distinct-question gates. The topic page shows each gate with what the student has and needs.

## 3. Error classification

`classifyError` scores candidate causes from evidence and keeps the evidence text:

- the chosen distractor's misconception tag (e.g. *wrong base* → conceptual, *forgot +1* → rule misapplied, *near miss* → calculation, *amount not interest* → misread);
- speed versus the question's expected time **and** the student's own median, combined with prior accuracy on the topic (fast + usually right → possibly rushed; fast + usually wrong → possibly guessing; fast alone → no conclusion);
- long time before a wrong or blank answer → time management;
- previously correct on the same question or skill → possible forgetting;
- self-reported confidence and answer changes.

The top score becomes the confidence (reduced when a runner-up is close). Below 0.6 the diagnosis is **tentative** and shown as "possible". A pattern is called **recurring** only with at least two diagnoses and summed confidence ≥ 1.2.

## 4. Allocation

Each topic gets a slot category from its state: remediation (weak, early misses, developing, collapsed mastery), repeated errors, speed/accuracy, confirmation (improving or proficient), spaced revision (retention due, idle mastery), maintenance (mastered), coverage (unseen or too little data). Each mock type has category priorities (`categoryShares`). A topic's weight is *priority(category) × need × √(syllabus weight)* and the questions are apportioned by weight (largest remainder) with a 30 % cap per topic. Full-length mocks keep the 40/30/30 section totals and include every topic. Revision mocks only use learned topics; speed drills use flagged topics.

## 5. Selection and difficulty

Questions are chosen with a seeded generator (seed stored on the mock). Scoring prefers unseen questions, avoids anything seen in the last 3 days, never repeats a missed question verbatim for remediation, prefers other questions on skills the student got wrong, matches a difficulty mix for the topic's state (weak 60/40/0 easy/medium/hard; developing 20/60/20; proficient 0/50/50; mastered mixed), and spreads skills. If a topic runs out, the shortage is recorded and filled from the same section; only VERIFIED (and, if enabled, PROVISIONAL) questions are ever eligible.

Difficulty labels come from a rubric (templates: one step = easy, two steps or a conversion = medium, three steps or a known trap = hard) and are compared with observed correct rates once questions have 20+ answers (Admin → Data quality).

## 6. Recommendations

Generated after each submission with a reason built from the data: review concept, targeted practice with instant feedback, retry different questions on a skill, timed drill, retention check, reassess a collapsed topic, mixed mock, diagnostic. They work without any AI provider.

## Evidence

`npm run simulate:learners` runs synthetic students through the real code and writes `docs/simulation_results.md` (acceptance criteria H–K and profile isolation). These are software checks, not evidence about learning outcomes for real students.
