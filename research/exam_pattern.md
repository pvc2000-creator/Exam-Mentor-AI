# Exam pattern: PCRT-GD 2026

Values used by the app (configuration version `2026.1`, verification `SECONDARY_CONSISTENT`; see `official_sources.md`).

| Item | Value | Basis |
|---|---|---|
| Mode | Computer-based test, objective MCQ | All sources |
| Questions | 100 | All 2026 sources |
| Total marks | 100 (1 mark each) | All 2026 sources |
| Duration | 120 minutes | All 2026 sources |
| Options per question | 4 | Secondary sources; standard MPESB format |
| Negative marking | **None** (wrong = 0, unanswered = 0) | All 2026 and 2025 sources |
| Level | About MP Board Class 8 | 2025 and 2026 secondary sources; unverified |
| Language | Hindi stated by one source; earlier cycles bilingual | **Unverified**; the app supports Hindi and English per question |
| Exam dates | From 19 November 2026 | Bhopal Samachar; not used by the app |

## Sections

| # | Section | Hindi | Questions | Marks |
|---|---|---|---|---|
| 1 | General Knowledge and Logical Reasoning | सामान्य ज्ञान एवं तार्किक ज्ञान | 40 | 40 |
| 2 | Intelligence and Mental Aptitude | बुद्धि एवं मानसिक क्षमता | 30 | 30 |
| 3 | Science and Simple Arithmetic | विज्ञान एवं सरल अंकगणित | 30 | 30 |

The configuration validator checks that section questions add up to 100, that section marks add up to 100, that 100 × marks per correct answer = 100, and that the negative-marking flag agrees with the marks. A full-length mock in the app always uses these values; the integration tests assert 100 questions, 7,200 seconds and 40/30/30.

## Changes between cycles

The 2025 and 2026 patterns reported by secondary sources are the same (100 Q, 120 min, 40/30/30, no negative marking). The 2025 exam ran from 30 October to 15 December 2025. Earlier cycles were not researched in depth, and the app does not assume an older pattern.

## Conflicts recorded

1. **Section 2 and 3 boundaries.** Some 2025 syllabus pages list arithmetic under "Intelligence and Mental Aptitude", while the official section name of Section 3 is "Science and Simple Arithmetic". The configuration puts reasoning-style numeric aptitude (series, LCM/HCF, BODMAS, ranking, clocks, ages) in Section 2 and applied arithmetic (percentage, profit and loss, interest, speed, work, mensuration) in Section 3.
2. **Language.** Marked unverified.
3. **2025 dates.** News coverage gave 4 Oct, 10 Oct and 30 Oct 2025; the answer-key article confirms 30 Oct to 15 Dec 2025.
