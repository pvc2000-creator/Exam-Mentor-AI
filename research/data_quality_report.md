# Data quality report

Generated 2026-10-19T10:58:39.331Z by `npm run report:quality` against the active configuration 2026.1 (SECONDARY_CONSISTENT).

## Summary

- Questions in the bank: 650 (verified 539, provisional 110, pending review 1, rejected 0).
- Official previous-year questions: 0. The bank is synthetic practice material.
- Missing Hindi text: 0. Missing explanation: 0.
- Quality flags: POSSIBLE_DUPLICATE_STEM 13.
- Difficulty calibration: 0 questions have ≥ 20 answers; 0 disagree with their label.
- Topics with fewer than three full-length mocks' worth of eligible questions: Indian Economy.

## By origin and status

| Origin | Status | Count |
|---|---|---|
| SYNTHETIC_TEMPLATE | VERIFIED | 539 |
| AI_AUTHORED | PENDING_REVIEW | 1 |
| AI_AUTHORED | PROVISIONAL | 110 |

## Coverage by topic

| Topic | Eligible | Verified | Pending | Easy/Med/Hard | Per full mock | Full mocks before repeats |
|---|---|---|---|---|---|---|
| Indian History and Freedom Movement | 14 | 0 | 0 | 7/6/1 | 4 | 3 |
| Indian Geography | 9 | 0 | 0 | 3/5/1 | 3 | 3 |
| Indian Constitution and Polity | 9 | 0 | 0 | 4/4/1 | 3 | 3 |
| Indian Economy | 4 | 0 | 0 | 2/2/0 | 2 | 2 |
| Madhya Pradesh General Knowledge | 18 | 0 | 1 | 7/11/0 | 5 | 3 |
| Static GK, Sports and Awards | 11 | 0 | 0 | 8/3/0 | 3 | 3 |
| Basic Computer Knowledge | 7 | 0 | 0 | 5/2/0 | 2 | 3 |
| Coding–Decoding | 28 | 28 | 0 | 14/14/0 | 4 | 7 |
| Alphabet Series | 9 | 9 | 0 | 9/0/0 | 3 | 3 |
| Blood Relations | 14 | 14 | 0 | 0/14/0 | 3 | 4 |
| Direction Sense | 23 | 23 | 0 | 10/13/0 | 4 | 5 |
| Analogy and Classification | 32 | 28 | 0 | 16/16/0 | 4 | 8 |
| Number Series | 51 | 51 | 0 | 14/25/12 | 6 | 8 |
| Number System, LCM and HCF | 41 | 41 | 0 | 27/14/0 | 5 | 8 |
| Simplification (BODMAS) | 28 | 28 | 0 | 14/14/0 | 6 | 4 |
| Order and Ranking | 28 | 28 | 0 | 14/14/0 | 4 | 7 |
| Calendar and Clock | 39 | 39 | 0 | 14/14/11 | 4 | 9 |
| Problems on Ages | 26 | 26 | 0 | 0/13/13 | 5 | 5 |
| Physics in Everyday Life | 10 | 0 | 0 | 5/5/0 | 3 | 3 |
| Chemistry in Everyday Life | 10 | 0 | 0 | 6/3/1 | 3 | 3 |
| Biology, Health and Environment | 14 | 0 | 0 | 9/5/0 | 4 | 3 |
| Percentage | 40 | 40 | 0 | 14/13/13 | 3 | 13 |
| Profit and Loss | 37 | 37 | 0 | 14/14/9 | 3 | 12 |
| Ratio and Proportion | 14 | 14 | 0 | 14/0/0 | 2 | 7 |
| Average | 28 | 28 | 0 | 14/14/0 | 2 | 14 |
| Simple and Compound Interest | 39 | 39 | 0 | 13/13/13 | 3 | 13 |
| Time and Work | 14 | 14 | 0 | 0/14/0 | 3 | 4 |
| Time, Speed and Distance | 33 | 33 | 0 | 13/13/7 | 3 | 11 |
| Mensuration | 19 | 19 | 0 | 14/5/0 | 1 | 19 |

## Sources

- **Police Constable (GD) Direct Recruitment Test 2026 – Rule Book** (mpesb-pcrt-2026-rulebook) · Reference only (exam information) · reference only · https://esb.mp.gov.in/Rulebooks/RB_2026/PCRT_GD_2026_RuleBook_09092026.pdf
- **MP Police Constable Recruitment 2026 Notification Out** (bhopalsamachar-2026-notification) · Reference only (exam information) · reference only · https://www.bhopalsamachar.com/2026/09/mp-police-constable-recruitment-2026-notification.html
- **MP Police Constable Recruitment 2026 (Hindi)** (careers360-2026-recruitment) · Reference only (exam information) · reference only · https://competition.careers360.com/hi/articles/mp-police-constable-recruitment-2026
- **MP Police Constable Syllabus 2025 (Hindi)** (careers360-2025-syllabus) · Reference only (exam information) · reference only · https://competition.careers360.com/hi/article/199623
- **MP Police Constable Recruitment 2025 answer key and response sheet released** (fpj-2025-answer-key) · Reference only (exam information) · reference only · https://www.freepressjournal.in/education/mp-police-constable-recruitment-2025-written-exam-answer-key-and-response-sheet-released-raise-objections-till-december-20
- **MP Police Constable Syllabus 2025: Exam Pattern, Subject-Wise Topics** (studyiq-2025-syllabus) · Reference only (exam information) · reference only · https://www.studyiq.com/articles/mp-police-constable-syllabus/
- **ExamMentor synthetic template bank** (exammentor-synthetic) · Project-owned synthetic content · may republish
- **ExamMentor AI-authored factual set** (exammentor-authored) · Project-owned synthetic content · may republish

## Known conflicts in exam information

- Section 2 vs Section 3 boundaries: some sources place arithmetic under 'Intelligence and Mental Aptitude', while the official section name is 'Science and Simple Arithmetic'. This config places reasoning-style numeric aptitude (series, LCM/HCF, BODMAS, ranking, clocks, ages) in Section 2 and applied arithmetic (percentage, profit and loss, interest, speed, work, mensuration) in Section 3.
- Language of the paper: one source says Hindi; others are silent. Marked unverified.
- 2025 news coverage gives different exam start dates (4 Oct, 10 Oct, 30 Oct 2025); the 2025 answer-key article confirms 30 Oct to 15 Dec 2025.

## Recent imports

- 2026-10-19 authored-gk-science.json (json): 111 records, 111 created, 0 duplicates, 0 invalid, 0 flagged
- 2026-10-19 templates (template): 588 records, 539 created, 49 duplicates, 0 invalid, 13 flagged

## What this means

- Synthetic template questions have answers computed in code and are VERIFIED by computation. Their wording and difficulty labels are rubric-based, not calibrated on real candidates until enough students answer them.
- AI-authored factual questions are PROVISIONAL: automated checks passed, but no human has reviewed them. Set ALLOW_PROVISIONAL_QUESTIONS=false to serve only verified questions.
- No official previous-year questions are included, because no officially published paper with a licence permitting reuse was obtained.
