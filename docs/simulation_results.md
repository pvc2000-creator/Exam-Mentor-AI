# Learner simulation results

Generated 2026-10-19T10:59:51.307Z by `npm run simulate:learners` in 7.8 s.

Synthetic students answer through the same server functions as the web app (create mock, start, save each answer with its time, submit), on a simulated clock so revision intervals can elapse. Each student has a fixed probability of answering each topic correctly. These are software checks of the learning engine's behaviour, not evidence about real students' learning.

## H. Two students with different weaknesses receive meaningfully different personalised mocks: PASS

- Both took the same 30-question diagnostic: yes. Each then took personalised mocks on consecutive days.
- Student A (weak in percentage, profit/loss, ratio) share of each personalised mock on those topics: 17%, 23%, 23%; student B on the same topics: 0%, 0%, 0%.
- Student B (weak in MP GK, history, geography) share on those topics: 30%, 40%, 40%; student A on the same topics: 23%, 17%, 13%.
- Third personalised mock: question overlap between the two students 13%.
- After the diagnostic alone (about one question per topic) the difference is small, because one answer cannot separate a gap from a slip; the engine follows up early misses and the gap widens as evidence accumulates.

## I. Remediation questions are varied rather than repeated: PASS

- 27 weak-topic questions across 4 personalised mocks; 27 distinct (100%).
- Previously seen questions reused: 0 (0%).
- They covered 5 skills across 4 subtopics.
- Weak-topic share per mock: 17%, 23%, 23%, 27%.

## J. Mastered topics get reduced priority but remain eligible for revision: PASS

- After the first practice sets the topic was PROFICIENT: All gates met; a retention check is due after 2026-02-12 before this counts as mastered.
- After a correct retention check 10 days later: MASTERED: All mastery gates met and retention confirmed after 7 days.
- Next personalised mock: 0 slot(s) for the mastered topic (category none), versus an average of 1.7 for the 18 other topics included; 0 question(s) served.
- Revision mock the next day: 6 slot(s) for the mastered topic (category MAINTENANCE), so it stays in revision.

## K. A topic returns to high priority when performance deteriorates: PASS

- After a poor practice set the topic moved to NEEDS_REVIEW: Was mastered, but recent accuracy fell to 25% (below 60%).
- Slots in the next personalised mock: 0 before, 2 after (REMEDIATION).
- Recommendation "Reassess Basic Computer Knowledge" is ranked 1 of 11: You had mastered this topic, but recent accuracy fell to 13%.

## L-profile. A second student's learning profile stays independent: PASS

- Student B's 56 skill states were unchanged after student A completed 3 mocks.
