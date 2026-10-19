/**
 * Parameterised question templates with deterministically computed answers.
 *
 * Every template computes the correct answer in code, so answer correctness is verified by
 * computation rather than by a language model. Distractors are derived from named
 * misconceptions (e.g. "percentage computed on the wrong base") so the error classifier can
 * tell a conceptual mistake from a slip.
 *
 * Difficulty rubric (see docs/learning-engine.md):
 *   EASY   – one operation or one rule, small numbers
 *   MEDIUM – two steps, or one step plus a unit/base conversion
 *   HARD   – three or more steps, a common trap, or a non-obvious formula
 */
import { pick, randInt, shuffle, type Rng } from "../rng";
import type { DifficultyLevel, OptionKey, QuestionInput, QuestionOption } from "./types";

type Val = string | number;
interface Distractor {
  v: Val;
  hi?: string;
  m?: string; // misconception tag
  r?: string; // rationale
}

const KEYS: OptionKey[] = ["A", "B", "C", "D"];

function fmt(v: Val): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return v;
}

/** Build four shuffled options; duplicates are replaced with nearby numeric values tagged as fillers. */
function mcq(rng: Rng, correct: Val, distractors: Distractor[], opts: { correctHi?: string; unit?: string; unitHi?: string } = {}) {
  const unit = opts.unit ?? "";
  const unitHi = opts.unitHi ?? unit;
  const seen = new Set<string>([fmt(correct)]);
  const chosen: Distractor[] = [];
  for (const d of distractors) {
    const k = fmt(d.v);
    if (seen.has(k) || (typeof d.v === "number" && (!Number.isFinite(d.v) || d.v < 0))) continue;
    seen.add(k);
    chosen.push(d);
    if (chosen.length === 3) break;
  }
  let step = 1;
  while (chosen.length < 3 && typeof correct === "number") {
    for (const cand of [correct + step * (Number.isInteger(correct) ? 1 : 0.5), correct - step * (Number.isInteger(correct) ? 1 : 0.5)]) {
      if (chosen.length < 3 && cand > 0 && !seen.has(fmt(cand))) {
        seen.add(fmt(cand));
        chosen.push({ v: cand, m: "NEAR_MISS", r: "Close to the correct value; usually an arithmetic slip." });
      }
    }
    step++;
  }
  // Letter-code answers: perturb one letter at a time (a plausible slip).
  if (typeof correct === "string" && /^[A-Z]+$/.test(correct)) {
    for (const shift of [1, 25, 2, 24, 3])
      for (let i = correct.length - 1; i >= 0 && chosen.length < 3; i--) {
        const c = correct.slice(0, i) + String.fromCharCode(((correct.charCodeAt(i) - 65 + shift) % 26) + 65) + correct.slice(i + 1);
        if (!seen.has(c)) { seen.add(c); chosen.push({ v: c, m: "SINGLE_LETTER_SLIP", r: "One letter is off by a small shift." }); }
      }
  }
  if (chosen.length < 3) throw new Error("Template could not build 3 distinct distractors");
  const all: Array<{ d: Distractor; correct: boolean }> = [
    { d: { v: correct, hi: opts.correctHi }, correct: true },
    ...chosen.map((d) => ({ d, correct: false })),
  ];
  const shuffled = shuffle(rng, all);
  let correctOption: OptionKey = "A";
  const options: QuestionOption[] = shuffled.map((x, i) => {
    if (x.correct) correctOption = KEYS[i];
    const text = fmt(x.d.v) + (unit ? ` ${unit}` : "");
    const textHi = x.d.hi ?? (typeof x.d.v === "number" ? fmt(x.d.v) + (unitHi ? ` ${unitHi}` : "") : undefined);
    return {
      key: KEYS[i],
      text,
      ...(textHi && textHi !== text ? { textHi } : {}),
      ...(x.correct ? { rationale: "Correct." } : { rationale: x.d.r, misconception: x.d.m }),
    };
  });
  return { options, correctOption };
}

export interface TemplateDef {
  id: string;
  subjectId: string;
  topicId: string;
  subtopicId: string;
  skillKey: string;
  difficulty: DifficultyLevel;
  difficultyBasis: string;
  expectedTimeSec: number;
  isNumerical: boolean;
  requiredSkill: string;
  build(rng: Rng): Pick<QuestionInput, "stem" | "stemHi" | "options" | "correctOption" | "explanation" | "explanationHi">;
}

const R1 = "Rubric EASY: single operation, small numbers";
const R2 = "Rubric MEDIUM: two steps or a base/unit conversion";
const R3 = "Rubric HARD: three or more steps or a well-known trap";

const MALE = ["Ravi", "Amit", "Suresh", "Mohan", "Rakesh", "Vikas", "Deepak", "Arjun", "Manoj", "Rahul"];
const FEMALE = ["Sita", "Priya", "Neha", "Kavita", "Anita", "Pooja", "Meena", "Rekha", "Sunita", "Asha"];
const ITEMS = [
  { en: "a bicycle", hi: "एक साइकिल" },
  { en: "a watch", hi: "एक घड़ी" },
  { en: "a table", hi: "एक मेज़" },
  { en: "a radio", hi: "एक रेडियो" },
  { en: "a chair", hi: "एक कुर्सी" },
];
const WORDS = ["POLICE", "THANA", "GUARD", "SAFETY", "LAWFUL", "DUTY", "BHOPAL", "RIVER", "PATROL", "CAMP", "MARCH", "BADGE"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_HI = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
const DIRS = ["North", "East", "South", "West"];
const DIRS_HI = ["उत्तर", "पूर्व", "दक्षिण", "पश्चिम"];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

export const TEMPLATES: TemplateDef[] = [
  // ───────────── Percentage ─────────────
  {
    id: "pct-of", subjectId: "science-arithmetic", topicId: "ar-percentage", subtopicId: "ar-percentage-basic",
    skillKey: "percentage.of-quantity", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 30, isNumerical: true,
    requiredSkill: "Compute x% of N",
    build(rng) {
      const x = pick(rng, [5, 10, 12, 15, 20, 25, 30, 40, 45, 60, 75]);
      const n = randInt(rng, 2, 40) * 20;
      const ans = (n * x) / 100;
      return {
        stem: `What is ${x}% of ${n}?`,
        stemHi: `${n} का ${x}% कितना है?`,
        ...mcq(rng, ans, [
          { v: (n * x) / 10, m: "DECIMAL_SHIFT", r: "Divided by 10 instead of 100." },
          { v: n - ans, m: "COMPLEMENT", r: `This is ${100 - x}% of ${n}, not ${x}%.` },
          { v: n + x, m: "ADDED_PERCENT", r: "Added the percentage to the number instead of multiplying." },
        ]),
        explanation: `${x}% of ${n} = ${n} × ${x} / 100 = ${ans}.`,
        explanationHi: `${n} का ${x}% = ${n} × ${x} / 100 = ${ans}।`,
      };
    },
  },
  {
    id: "pct-change", subjectId: "science-arithmetic", topicId: "ar-percentage", subtopicId: "ar-percentage-change",
    skillKey: "percentage.change", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 45, isNumerical: true,
    requiredSkill: "Percentage change relative to the original value",
    build(rng) {
      const pct = pick(rng, [10, 20, 25, 40, 50]);
      const a = randInt(rng, 2, 30) * 20;
      const b = a + (a * pct) / 100;
      const wrongBase = Math.round(((b - a) / b) * 10000) / 100;
      return {
        stem: `The price of a uniform rises from ₹${a} to ₹${b}. What is the percentage increase?`,
        stemHi: `एक वर्दी का मूल्य ₹${a} से बढ़कर ₹${b} हो जाता है। प्रतिशत वृद्धि कितनी है?`,
        ...mcq(rng, pct, [
          { v: wrongBase, m: "WRONG_BASE", r: "Divided the increase by the new price instead of the original price." },
          { v: b - a, m: "ABSOLUTE_NOT_PERCENT", r: "This is the increase in rupees, not a percentage." },
          { v: pct * 2, m: "NEAR_MISS", r: "Arithmetic slip." },
        ], { unit: "%" }),
        explanation: `Increase = ${b} − ${a} = ${b - a}. Percentage increase = ${b - a} / ${a} × 100 = ${pct}%. Always divide by the original value.`,
        explanationHi: `वृद्धि = ${b} − ${a} = ${b - a}। प्रतिशत वृद्धि = ${b - a} / ${a} × 100 = ${pct}%। हमेशा मूल मान से भाग दें।`,
      };
    },
  },
  {
    id: "pct-successive", subjectId: "science-arithmetic", topicId: "ar-percentage", subtopicId: "ar-percentage-change",
    skillKey: "percentage.successive", difficulty: "HARD", difficultyBasis: R3, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Net effect of successive percentage changes",
    build(rng) {
      const a = pick(rng, [10, 20, 25, 30, 40, 50]);
      const b = pick(rng, [10, 20, 25, 30, 40, 50]);
      const net = a - b - (a * b) / 100;
      const word = net >= 0 ? "increase" : "decrease";
      const wordHi = net >= 0 ? "वृद्धि" : "कमी";
      const ans = Math.abs(net);
      return {
        stem: `A salary is first increased by ${a}% and then decreased by ${b}%. What is the net percentage change?`,
        stemHi: `एक वेतन में पहले ${a}% की वृद्धि और फिर ${b}% की कमी की जाती है। कुल प्रतिशत परिवर्तन कितना है?`,
        ...mcq(rng, `${ans}% ${word}`, [
          { v: `${Math.abs(a - b)}% ${a - b >= 0 ? "increase" : "decrease"}`, hi: `${Math.abs(a - b)}% ${a - b >= 0 ? "वृद्धि" : "कमी"}`, m: "SIMPLE_ADDITION", r: "Added the percentages directly; the second change applies to the new value." },
          { v: "No change", hi: "कोई परिवर्तन नहीं", m: "CANCELLATION", r: "Increases and decreases of percentages do not cancel." },
          { v: `${ans}% ${net >= 0 ? "decrease" : "increase"}`, hi: `${ans}% ${net >= 0 ? "कमी" : "वृद्धि"}`, m: "SIGN_ERROR", r: "Correct size but wrong direction." },
          { v: `${(a * b) / 100}% decrease`, hi: `${(a * b) / 100}% कमी`, m: "PARTIAL", r: "Only the interaction term." },
        ], { correctHi: `${ans}% ${wordHi}` }),
        explanation: `Net change = a − b − ab/100 = ${a} − ${b} − ${a}×${b}/100 = ${net}%. So the result is a ${ans}% ${word}.`,
        explanationHi: `कुल परिवर्तन = a − b − ab/100 = ${a} − ${b} − ${a}×${b}/100 = ${net}%। अतः ${ans}% ${wordHi}।`,
      };
    },
  },
  // ───────────── Profit and loss ─────────────
  {
    id: "pl-sp", subjectId: "science-arithmetic", topicId: "ar-profit-loss", subtopicId: "ar-profit-loss-basic",
    skillKey: "profit-loss.selling-price", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "Selling price from cost price and profit %",
    build(rng) {
      const item = pick(rng, ITEMS);
      const cp = randInt(rng, 4, 40) * 50;
      const p = pick(rng, [10, 20, 25, 30, 40]);
      const sp = (cp * (100 + p)) / 100;
      return {
        stem: `A shopkeeper buys ${item.en} for ₹${cp} and sells it at a profit of ${p}%. What is the selling price?`,
        stemHi: `एक दुकानदार ${item.hi} ₹${cp} में खरीदकर ${p}% लाभ पर बेचता है। विक्रय मूल्य कितना है?`,
        ...mcq(rng, sp, [
          { v: (cp * p) / 100, m: "PROFIT_ONLY", r: "This is the profit, not the selling price." },
          { v: cp - (cp * p) / 100, m: "SIGN_ERROR", r: "Subtracted the profit instead of adding it." },
          { v: cp + p, m: "ADDED_PERCENT", r: "Added the percentage figure as rupees." },
        ]),
        explanation: `SP = CP × (100 + P%) / 100 = ${cp} × ${100 + p} / 100 = ₹${sp}.`,
        explanationHi: `विक्रय मूल्य = क्रय मूल्य × (100 + लाभ%) / 100 = ${cp} × ${100 + p} / 100 = ₹${sp}।`,
      };
    },
  },
  {
    id: "pl-percent", subjectId: "science-arithmetic", topicId: "ar-profit-loss", subtopicId: "ar-profit-loss-basic",
    skillKey: "profit-loss.percent", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 50, isNumerical: true,
    requiredSkill: "Profit % on cost price",
    build(rng) {
      const p = pick(rng, [10, 20, 25, 50]);
      const cp = randInt(rng, 2, 30) * 40;
      const sp = (cp * (100 + p)) / 100;
      const onSp = Math.round(((sp - cp) / sp) * 10000) / 100;
      return {
        stem: `An article bought for ₹${cp} is sold for ₹${sp}. What is the profit percentage?`,
        stemHi: `₹${cp} में खरीदी गई एक वस्तु ₹${sp} में बेची जाती है। लाभ प्रतिशत कितना है?`,
        ...mcq(rng, p, [
          { v: onSp, m: "WRONG_BASE", r: "Profit % is calculated on the cost price, not the selling price." },
          { v: sp - cp, m: "ABSOLUTE_NOT_PERCENT", r: "This is the profit in rupees." },
          { v: 100 + p, m: "RATIO_NOT_PERCENT", r: "This is SP as a percentage of CP, not the profit %." },
        ], { unit: "%" }),
        explanation: `Profit = ${sp} − ${cp} = ${sp - cp}. Profit % = ${sp - cp} / ${cp} × 100 = ${p}%.`,
        explanationHi: `लाभ = ${sp} − ${cp} = ${sp - cp}। लाभ% = ${sp - cp} / ${cp} × 100 = ${p}%।`,
      };
    },
  },
  {
    id: "pl-discount", subjectId: "science-arithmetic", topicId: "ar-profit-loss", subtopicId: "ar-profit-loss-basic",
    skillKey: "profit-loss.discount", difficulty: "HARD", difficultyBasis: R3, expectedTimeSec: 75, isNumerical: true,
    requiredSkill: "Discount on marked price, then profit on cost price",
    build(rng) {
      // Draw until SP and MP are whole rupees (bounded, deterministic for a given seed).
      let d = 20, p = 25, cp = 400, sp = 500, mp = 625;
      for (let i = 0; i < 50; i++) {
        const d2 = pick(rng, [10, 20, 25]);
        const p2 = pick(rng, [10, 20, 25, 50]);
        const cp2 = randInt(rng, 2, 12) * 100;
        const sp2 = (cp2 * (100 + p2)) / 100;
        const mp2 = (sp2 * 100) / (100 - d2);
        if (Number.isInteger(mp2)) { d = d2; p = p2; cp = cp2; sp = sp2; mp = mp2; break; }
      }
      return {
        stem: `A trader marks a jacket at ₹${mp} and gives a discount of ${d}%. If his cost price is ₹${cp}, what is his profit percentage?`,
        stemHi: `एक व्यापारी एक जैकेट पर ₹${mp} अंकित करता है और ${d}% छूट देता है। यदि उसका क्रय मूल्य ₹${cp} है, तो लाभ प्रतिशत कितना है?`,
        ...mcq(rng, p, [
          { v: Math.round(((mp - cp) / cp) * 10000) / 100, m: "IGNORED_DISCOUNT", r: "Forgot to apply the discount before computing profit." },
          { v: Math.abs(p - d), m: "SIMPLE_ADDITION", r: "Subtracted percentages directly." },
          { v: Math.round(((sp - cp) / sp) * 10000) / 100, m: "WRONG_BASE", r: "Profit % is on cost price, not selling price." },
        ], { unit: "%" }),
        explanation: `SP = ${mp} × (100 − ${d}) / 100 = ₹${sp}. Profit = ${sp} − ${cp} = ${sp - cp}. Profit % = ${sp - cp} / ${cp} × 100 = ${p}%.`,
        explanationHi: `विक्रय मूल्य = ${mp} × (100 − ${d}) / 100 = ₹${sp}। लाभ = ${sp - cp}। लाभ% = ${sp - cp} / ${cp} × 100 = ${p}%।`,
      };
    },
  },
  // ───────────── Ratio ─────────────
  {
    id: "ratio-divide", subjectId: "science-arithmetic", topicId: "ar-ratio", subtopicId: "ar-ratio-division",
    skillKey: "ratio.divide", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "Divide a quantity in a given ratio",
    build(rng) {
      const a = randInt(rng, 1, 6);
      let b = randInt(rng, 2, 9);
      if (b === a) b = a + 1;
      const k = randInt(rng, 5, 60);
      const n = (a + b) * k;
      const big = Math.max(a, b) * k;
      return {
        stem: `₹${n} is divided between two constables in the ratio ${a} : ${b}. What is the larger share?`,
        stemHi: `₹${n} को दो आरक्षकों में ${a} : ${b} के अनुपात में बाँटा जाता है। बड़ा भाग कितना है?`,
        ...mcq(rng, big, [
          { v: Math.min(a, b) * k, m: "WRONG_PART", r: "This is the smaller share." },
          { v: Math.round((n / Math.min(a, b)) * 100) / 100, m: "DIVIDED_BY_PART", r: "Divided by one ratio term instead of the sum of terms." },
          { v: Math.round(((n * Math.max(a, b)) / Math.min(a, b)) * 100) / 100, m: "RATIO_AS_FRACTION", r: "Used a/b as the fraction instead of a/(a+b)." },
        ]),
        explanation: `Sum of ratio terms = ${a} + ${b} = ${a + b}. One part = ${n} / ${a + b} = ${k}. Larger share = ${Math.max(a, b)} × ${k} = ₹${big}.`,
        explanationHi: `अनुपात का योग = ${a + b}। एक भाग = ${n} / ${a + b} = ${k}। बड़ा भाग = ${Math.max(a, b)} × ${k} = ₹${big}।`,
      };
    },
  },
  // ───────────── Average ─────────────
  {
    id: "avg-basic", subjectId: "science-arithmetic", topicId: "ar-average", subtopicId: "ar-average-basic",
    skillKey: "average.mean", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "Mean of a list",
    build(rng) {
      const n = 5;
      const target = randInt(rng, 20, 90);
      const vals = Array.from({ length: n - 1 }, () => target + randInt(rng, -12, 12));
      vals.push(target * n - vals.reduce((s, x) => s + x, 0));
      const sum = target * n;
      return {
        stem: `Find the average of ${vals.join(", ")}.`,
        stemHi: `${vals.join(", ")} का औसत ज्ञात कीजिए।`,
        ...mcq(rng, target, [
          { v: sum, m: "SUM_NOT_MEAN", r: "This is the sum; divide by the count." },
          { v: Math.round((sum / (n - 1)) * 100) / 100, m: "WRONG_COUNT", r: "Divided by the wrong count." },
          { v: [...vals].sort((x, y) => x - y)[2], m: "MEDIAN", r: "This is the middle value, not the average." },
        ]),
        explanation: `Sum = ${sum}, count = ${n}. Average = ${sum} / ${n} = ${target}.`,
        explanationHi: `योग = ${sum}, संख्या = ${n}। औसत = ${sum} / ${n} = ${target}।`,
      };
    },
  },
  {
    id: "avg-new-item", subjectId: "science-arithmetic", topicId: "ar-average", subtopicId: "ar-average-basic",
    skillKey: "average.new-member", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Effect of adding a value on the average",
    build(rng) {
      const n = randInt(rng, 4, 12);
      const avg = randInt(rng, 30, 60);
      const inc = randInt(rng, 1, 4);
      const newVal = (avg + inc) * (n + 1) - avg * n;
      return {
        stem: `The average weight of ${n} recruits is ${avg} kg. When a new recruit joins, the average increases by ${inc} kg. What is the weight of the new recruit?`,
        stemHi: `${n} रंगरूटों का औसत भार ${avg} किग्रा है। एक नए रंगरूट के आने पर औसत ${inc} किग्रा बढ़ जाता है। नए रंगरूट का भार कितना है?`,
        ...mcq(rng, newVal, [
          { v: avg + inc, m: "NEW_AVERAGE", r: "This is the new average, not the new member's weight." },
          { v: avg + inc * n, m: "FORGOT_SELF", r: "Forgot that the new member also carries the increase." },
          { v: avg * (n + 1), m: "SUM_CONFUSION", r: "Mixed up totals and the individual value." },
        ], { unit: "kg", unitHi: "किग्रा" }),
        explanation: `New total − old total = ${avg + inc} × ${n + 1} − ${avg} × ${n} = ${(avg + inc) * (n + 1)} − ${avg * n} = ${newVal} kg.`,
        explanationHi: `नया योग − पुराना योग = ${(avg + inc) * (n + 1)} − ${avg * n} = ${newVal} किग्रा।`,
      };
    },
  },
  // ───────────── Interest ─────────────
  {
    id: "si-basic", subjectId: "science-arithmetic", topicId: "ar-interest", subtopicId: "ar-interest-simple",
    skillKey: "interest.simple", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "SI = PRT/100",
    build(rng) {
      const p = randInt(rng, 2, 40) * 500;
      const r = pick(rng, [4, 5, 6, 8, 10, 12]);
      const t = randInt(rng, 2, 5);
      const si = (p * r * t) / 100;
      return {
        stem: `What is the simple interest on ₹${p} at ${r}% per annum for ${t} years?`,
        stemHi: `₹${p} पर ${r}% वार्षिक दर से ${t} वर्ष का साधारण ब्याज कितना है?`,
        ...mcq(rng, si, [
          { v: p + si, m: "AMOUNT_NOT_INTEREST", r: "This is the amount (principal + interest)." },
          { v: (p * r) / 100, m: "FORGOT_TIME", r: "Interest for one year only." },
          { v: (p * r * t) / 10, m: "DECIMAL_SHIFT", r: "Divided by 10 instead of 100." },
        ]),
        explanation: `SI = P × R × T / 100 = ${p} × ${r} × ${t} / 100 = ₹${si}.`,
        explanationHi: `साधारण ब्याज = P × R × T / 100 = ${p} × ${r} × ${t} / 100 = ₹${si}।`,
      };
    },
  },
  {
    id: "ci-two-year", subjectId: "science-arithmetic", topicId: "ar-interest", subtopicId: "ar-interest-compound",
    skillKey: "interest.compound", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 70, isNumerical: true,
    requiredSkill: "Compound interest for two years",
    build(rng) {
      const p = randInt(rng, 1, 20) * 1000;
      const r = pick(rng, [5, 10, 20]);
      const amt = p * (1 + r / 100) ** 2;
      const ci = Math.round((amt - p) * 100) / 100;
      return {
        stem: `Find the compound interest on ₹${p} for 2 years at ${r}% per annum, compounded annually.`,
        stemHi: `₹${p} पर ${r}% वार्षिक दर से 2 वर्ष का चक्रवृद्धि ब्याज (वार्षिक संयोजित) ज्ञात कीजिए।`,
        ...mcq(rng, ci, [
          { v: (p * r * 2) / 100, m: "USED_SIMPLE", r: "This is simple interest; compound interest earns interest on interest." },
          { v: Math.round(amt * 100) / 100, m: "AMOUNT_NOT_INTEREST", r: "This is the amount, not the interest." },
          { v: Math.round(((p * r) / 100) * 100) / 100, m: "FORGOT_TIME", r: "Interest for one year only." },
        ]),
        explanation: `Amount = ${p} × (1 + ${r}/100)² = ₹${Math.round(amt * 100) / 100}. CI = amount − principal = ₹${ci}.`,
        explanationHi: `मिश्रधन = ${p} × (1 + ${r}/100)² = ₹${Math.round(amt * 100) / 100}। चक्रवृद्धि ब्याज = मिश्रधन − मूलधन = ₹${ci}।`,
      };
    },
  },
  {
    id: "ci-si-diff", subjectId: "science-arithmetic", topicId: "ar-interest", subtopicId: "ar-interest-compound",
    skillKey: "interest.ci-si-difference", difficulty: "HARD", difficultyBasis: R3, expectedTimeSec: 80, isNumerical: true,
    requiredSkill: "CI − SI over two years = P(R/100)²",
    build(rng) {
      const p = randInt(rng, 1, 30) * 1000;
      const r = pick(rng, [5, 10, 20]);
      const diff = Math.round(p * (r / 100) ** 2 * 100) / 100;
      return {
        stem: `What is the difference between compound interest and simple interest on ₹${p} for 2 years at ${r}% per annum?`,
        stemHi: `₹${p} पर ${r}% वार्षिक दर से 2 वर्ष के चक्रवृद्धि ब्याज और साधारण ब्याज का अंतर कितना है?`,
        ...mcq(rng, diff, [
          { v: (p * r) / 100, m: "ONE_YEAR_INTEREST", r: "This is one year's simple interest." },
          { v: 0, m: "NO_DIFFERENCE", r: "CI and SI differ from the second year onward." },
          { v: diff * 2, m: "DOUBLED", r: "Doubled the difference term." },
        ]),
        explanation: `For 2 years, CI − SI = P × (R/100)² = ${p} × (${r}/100)² = ₹${diff}.`,
        explanationHi: `2 वर्षों के लिए, CI − SI = P × (R/100)² = ${p} × (${r}/100)² = ₹${diff}।`,
      };
    },
  },
  // ───────────── Time and work ─────────────
  {
    id: "work-together", subjectId: "science-arithmetic", topicId: "ar-time-work", subtopicId: "ar-time-work-combined",
    skillKey: "time-work.combined-rate", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Add work rates",
    build(rng) {
      const pairs: Array<[number, number]> = [[10, 15], [12, 24], [20, 30], [6, 12], [12, 36], [15, 30], [20, 60], [18, 36], [30, 60], [40, 60], [24, 72], [21, 42]];
      const [a, b] = pick(rng, pairs);
      const t = (a * b) / (a + b);
      const m1 = pick(rng, MALE);
      let m2 = pick(rng, MALE);
      if (m2 === m1) m2 = MALE[(MALE.indexOf(m1) + 1) % MALE.length];
      return {
        stem: `${m1} can paint a wall in ${a} days and ${m2} can paint it in ${b} days. In how many days can they paint it working together?`,
        stemHi: `${m1} एक दीवार को ${a} दिनों में और ${m2} उसे ${b} दिनों में रंग सकता है। दोनों मिलकर उसे कितने दिनों में रंगेंगे?`,
        ...mcq(rng, t, [
          { v: (a + b) / 2, m: "AVERAGED_TIMES", r: "Times do not average; rates add." },
          { v: a + b, m: "ADDED_TIMES", r: "Working together takes less time, not more." },
          { v: b - a, m: "SUBTRACTED_TIMES", r: "Subtracting times has no meaning here." },
        ], { unit: "days", unitHi: "दिन" }),
        explanation: `Per day: 1/${a} + 1/${b} = ${a + b}/${a * b}. Time = ${a * b}/${a + b} = ${t} days.`,
        explanationHi: `एक दिन का कार्य: 1/${a} + 1/${b} = ${a + b}/${a * b}। समय = ${a * b}/${a + b} = ${t} दिन।`,
      };
    },
  },
  // ───────────── Speed ─────────────
  {
    id: "speed-distance", subjectId: "science-arithmetic", topicId: "ar-speed", subtopicId: "ar-speed-basic",
    skillKey: "speed.distance", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 30, isNumerical: true,
    requiredSkill: "Distance = speed × time",
    build(rng) {
      const v = randInt(rng, 3, 16) * 5;
      const t = pick(rng, [2, 3, 4, 5, 1.5, 2.5]);
      const d = v * t;
      return {
        stem: `A patrol vehicle travels at ${v} km/h for ${t} hours. How far does it travel?`,
        stemHi: `एक गश्ती वाहन ${v} किमी/घंटा की चाल से ${t} घंटे चलता है। वह कितनी दूरी तय करता है?`,
        ...mcq(rng, d, [
          { v: Math.round((v / t) * 100) / 100, m: "DIVIDED", r: "Divided speed by time; distance = speed × time." },
          { v: v + t, m: "ADDED", r: "Added instead of multiplying." },
          { v: d * 2, m: "NEAR_MISS", r: "Arithmetic slip." },
        ], { unit: "km", unitHi: "किमी" }),
        explanation: `Distance = speed × time = ${v} × ${t} = ${d} km.`,
        explanationHi: `दूरी = चाल × समय = ${v} × ${t} = ${d} किमी।`,
      };
    },
  },
  {
    id: "speed-train-pole", subjectId: "science-arithmetic", topicId: "ar-speed", subtopicId: "ar-speed-basic",
    skillKey: "speed.unit-conversion", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 50, isNumerical: true,
    requiredSkill: "Convert km/h to m/s (× 5/18)",
    build(rng) {
      const v = randInt(rng, 2, 6) * 18; // km/h, multiple of 18
      const ms = (v * 5) / 18;
      const t = randInt(rng, 6, 20);
      const len = ms * t;
      return {
        stem: `A train running at ${v} km/h crosses a pole in ${t} seconds. What is the length of the train?`,
        stemHi: `${v} किमी/घंटा की चाल से चलती एक ट्रेन एक खंभे को ${t} सेकंड में पार करती है। ट्रेन की लंबाई कितनी है?`,
        ...mcq(rng, len, [
          { v: v * t, m: "NO_UNIT_CONVERSION", r: "Speed must be converted to m/s first (× 5/18)." },
          { v: Math.round(((v * 18) / 5) * t), m: "INVERTED_CONVERSION", r: "Used 18/5 instead of 5/18." },
          { v: len / 2, m: "NEAR_MISS", r: "Arithmetic slip." },
        ], { unit: "m", unitHi: "मीटर" }),
        explanation: `${v} km/h = ${v} × 5/18 = ${ms} m/s. Length = ${ms} × ${t} = ${len} m.`,
        explanationHi: `${v} किमी/घंटा = ${v} × 5/18 = ${ms} मी/से। लंबाई = ${ms} × ${t} = ${len} मीटर।`,
      };
    },
  },
  {
    id: "speed-average", subjectId: "science-arithmetic", topicId: "ar-speed", subtopicId: "ar-speed-average",
    skillKey: "speed.average-equal-distance", difficulty: "HARD", difficultyBasis: R3, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Average speed for equal distances = 2xy/(x+y)",
    build(rng) {
      const pairs: Array<[number, number]> = [[30, 60], [40, 60], [20, 30], [60, 90], [10, 15], [36, 45], [30, 45], [12, 24]];
      const [x, y] = pick(rng, pairs);
      const avg = (2 * x * y) / (x + y);
      return {
        stem: `A constable cycles to a village at ${x} km/h and returns along the same road at ${y} km/h. What is the average speed for the whole journey?`,
        stemHi: `एक आरक्षक ${x} किमी/घंटा से एक गाँव तक साइकिल चलाता है और उसी रास्ते से ${y} किमी/घंटा से लौटता है। पूरी यात्रा की औसत चाल कितनी है?`,
        ...mcq(rng, avg, [
          { v: (x + y) / 2, m: "SIMPLE_AVERAGE", r: "Simple average of speeds is wrong when distances, not times, are equal." },
          { v: x + y, m: "ADDED", r: "Added the speeds." },
          { v: Math.round((Math.sqrt(x * y)) * 100) / 100, m: "GEOMETRIC_MEAN", r: "Geometric mean is not the formula for average speed." },
        ], { unit: "km/h", unitHi: "किमी/घंटा" }),
        explanation: `For equal distances, average speed = 2xy/(x + y) = 2 × ${x} × ${y} / ${x + y} = ${avg} km/h.`,
        explanationHi: `समान दूरी के लिए औसत चाल = 2xy/(x + y) = 2 × ${x} × ${y} / ${x + y} = ${avg} किमी/घंटा।`,
      };
    },
  },
  // ───────────── Mensuration ─────────────
  {
    id: "mens-rect", subjectId: "science-arithmetic", topicId: "ar-mensuration", subtopicId: "ar-mensuration-2d",
    skillKey: "mensuration.rectangle", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 35, isNumerical: true,
    requiredSkill: "Perimeter of a rectangle",
    build(rng) {
      const l = randInt(rng, 8, 60);
      const b = randInt(rng, 3, l - 1);
      const per = 2 * (l + b);
      return {
        stem: `A parade ground is a rectangle ${l} m long and ${b} m wide. What is its perimeter?`,
        stemHi: `एक परेड मैदान ${l} मीटर लंबा और ${b} मीटर चौड़ा आयत है। इसका परिमाप कितना है?`,
        ...mcq(rng, per, [
          { v: l * b, m: "AREA_NOT_PERIMETER", r: "This is the area." },
          { v: l + b, m: "HALF_PERIMETER", r: "Forgot to multiply by 2." },
          { v: 4 * l, m: "SQUARE_FORMULA", r: "Used the square formula." },
        ], { unit: "m", unitHi: "मीटर" }),
        explanation: `Perimeter = 2 × (l + b) = 2 × (${l} + ${b}) = ${per} m.`,
        explanationHi: `परिमाप = 2 × (l + b) = 2 × (${l} + ${b}) = ${per} मीटर।`,
      };
    },
  },
  {
    id: "mens-circle", subjectId: "science-arithmetic", topicId: "ar-mensuration", subtopicId: "ar-mensuration-2d",
    skillKey: "mensuration.circle-area", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 50, isNumerical: true,
    requiredSkill: "Area of a circle with π = 22/7",
    build(rng) {
      const r = randInt(rng, 1, 6) * 7;
      const area = (22 / 7) * r * r;
      return {
        stem: `Find the area of a circular garden of radius ${r} m. (Take π = 22/7)`,
        stemHi: `${r} मीटर त्रिज्या वाले एक वृत्ताकार बगीचे का क्षेत्रफल ज्ञात कीजिए। (π = 22/7 लें)`,
        ...mcq(rng, area, [
          { v: 2 * (22 / 7) * r, m: "CIRCUMFERENCE", r: "This is the circumference." },
          { v: (22 / 7) * 2 * r * 2 * r, m: "USED_DIAMETER", r: "Used the diameter in place of the radius." },
          { v: (22 / 7) * r, m: "MISSING_SQUARE", r: "Forgot to square the radius." },
        ], { unit: "sq m", unitHi: "वर्ग मीटर" }),
        explanation: `Area = πr² = 22/7 × ${r} × ${r} = ${area} sq m.`,
        explanationHi: `क्षेत्रफल = πr² = 22/7 × ${r} × ${r} = ${area} वर्ग मीटर।`,
      };
    },
  },
  // ───────────── Number series ─────────────
  {
    id: "series-ap", subjectId: "mental-ability", topicId: "ma-number-series", subtopicId: "ma-series-difference",
    skillKey: "series.constant-difference", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 25, isNumerical: true,
    requiredSkill: "Constant difference series",
    build(rng) {
      const a = randInt(rng, 2, 50);
      const d = randInt(rng, 3, 15) * (rng() < 0.2 ? -1 : 1);
      const terms = Array.from({ length: 5 }, (_, i) => a + i * d + (d < 0 ? 100 : 0));
      const next = terms[4] + d;
      return {
        stem: `Find the next number in the series: ${terms.join(", ")}, ?`,
        stemHi: `श्रृंखला में अगली संख्या ज्ञात कीजिए: ${terms.join(", ")}, ?`,
        ...mcq(rng, next, [
          { v: terms[4] + 2 * d, m: "SKIPPED_TERM", r: "Skipped one term." },
          { v: terms[4] - d, m: "SIGN_ERROR", r: "Applied the difference in the wrong direction." },
          { v: terms[4] + d + 1, m: "NEAR_MISS", r: "Off by one." },
        ]),
        explanation: `Each term changes by ${d}. Next = ${terms[4]} ${d >= 0 ? "+" : "−"} ${Math.abs(d)} = ${next}.`,
        explanationHi: `प्रत्येक पद में ${d} का अंतर है। अगला = ${next}।`,
      };
    },
  },
  {
    id: "series-increasing-diff", subjectId: "mental-ability", topicId: "ma-number-series", subtopicId: "ma-series-difference",
    skillKey: "series.second-difference", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 45, isNumerical: true,
    requiredSkill: "Differences that themselves form a series",
    build(rng) {
      const a = randInt(rng, 1, 20);
      const d0 = randInt(rng, 1, 5);
      const step = randInt(rng, 1, 4);
      const terms = [a];
      for (let i = 0; i < 5; i++) terms.push(terms[i] + d0 + i * step);
      const next = terms[5] + d0 + 5 * step;
      const lastDiff = d0 + 4 * step;
      return {
        stem: `What comes next: ${terms.join(", ")}, ?`,
        stemHi: `आगे क्या आएगा: ${terms.join(", ")}, ?`,
        ...mcq(rng, next, [
          { v: terms[5] + lastDiff, m: "CONSTANT_DIFF_ASSUMED", r: "Repeated the last difference; the differences increase." },
          { v: terms[5] + lastDiff + 2 * step, m: "OVERSHOT", r: "Increased the difference twice." },
          { v: next + 1, m: "NEAR_MISS", r: "Off by one." },
        ]),
        explanation: `Differences: ${terms.slice(1).map((t, i) => t - terms[i]).join(", ")} (increasing by ${step}). Next difference = ${d0 + 5 * step}, so the answer is ${terms[5]} + ${d0 + 5 * step} = ${next}.`,
        explanationHi: `अंतर: ${terms.slice(1).map((t, i) => t - terms[i]).join(", ")} (हर बार ${step} बढ़ता है)। अगला अंतर ${d0 + 5 * step}, अतः उत्तर ${next}।`,
      };
    },
  },
  {
    id: "series-geometric", subjectId: "mental-ability", topicId: "ma-number-series", subtopicId: "ma-series-multiplicative",
    skillKey: "series.multiplicative", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "Multiply-and-add series",
    build(rng) {
      const m = randInt(rng, 2, 3);
      const c = randInt(rng, -2, 3);
      const terms = [randInt(rng, 1, 6)];
      for (let i = 0; i < 4; i++) terms.push(terms[i] * m + c);
      const next = terms[4] * m + c;
      return {
        stem: `Find the missing number: ${terms.join(", ")}, ?`,
        stemHi: `लुप्त संख्या ज्ञात कीजिए: ${terms.join(", ")}, ?`,
        ...mcq(rng, next, [
          { v: terms[4] * m, m: "IGNORED_ADDEND", r: `Forgot the ${c >= 0 ? "+" : ""}${c} after multiplying.` },
          { v: terms[4] + (terms[4] - terms[3]), m: "CONSTANT_DIFF_ASSUMED", r: "Assumed a constant difference." },
          { v: next + m, m: "NEAR_MISS", r: "Arithmetic slip." },
        ]),
        explanation: `Rule: next = previous × ${m} ${c >= 0 ? "+" : "−"} ${Math.abs(c)}. So ${terms[4]} × ${m} ${c >= 0 ? "+" : "−"} ${Math.abs(c)} = ${next}.`,
        explanationHi: `नियम: अगला = पिछला × ${m} ${c >= 0 ? "+" : "−"} ${Math.abs(c)}। अतः ${next}।`,
      };
    },
  },
  {
    id: "series-squares", subjectId: "mental-ability", topicId: "ma-number-series", subtopicId: "ma-series-multiplicative",
    skillKey: "series.squares", difficulty: "HARD", difficultyBasis: R3, expectedTimeSec: 50, isNumerical: true,
    requiredSkill: "Recognise n² ± k patterns",
    build(rng) {
      const start = randInt(rng, 2, 8);
      const k = randInt(rng, -3, 3);
      const terms = Array.from({ length: 5 }, (_, i) => (start + i) ** 2 + k);
      const next = (start + 5) ** 2 + k;
      return {
        stem: `Find the next term: ${terms.join(", ")}, ?`,
        stemHi: `अगला पद ज्ञात कीजिए: ${terms.join(", ")}, ?`,
        ...mcq(rng, next, [
          { v: terms[4] + (terms[4] - terms[3]), m: "CONSTANT_DIFF_ASSUMED", r: "Differences increase by 2 each time." },
          { v: (start + 5) ** 2, m: "IGNORED_OFFSET", r: `Forgot the ${k} offset.` },
          { v: (start + 6) ** 2 + k, m: "SKIPPED_TERM", r: "Skipped a term." },
        ]),
        explanation: `Terms are n² ${k >= 0 ? "+" : "−"} ${Math.abs(k)} for n = ${start}…${start + 4}. Next: ${start + 5}² ${k >= 0 ? "+" : "−"} ${Math.abs(k)} = ${next}.`,
        explanationHi: `पद n² ${k >= 0 ? "+" : "−"} ${Math.abs(k)} हैं। अगला: ${start + 5}² ${k >= 0 ? "+" : "−"} ${Math.abs(k)} = ${next}।`,
      };
    },
  },
  // ───────────── Number system ─────────────
  {
    id: "hcf-lcm", subjectId: "mental-ability", topicId: "ma-number-system", subtopicId: "ma-lcm-hcf",
    skillKey: "number.lcm", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "LCM of two numbers",
    build(rng) {
      const h = randInt(rng, 2, 8);
      const p = randInt(rng, 2, 7);
      let q = randInt(rng, 2, 9);
      while (gcd(p, q) !== 1 || q === p) q = q + 1;
      const a = h * p;
      const b = h * q;
      const l = lcm(a, b);
      return {
        stem: `What is the LCM of ${a} and ${b}?`,
        stemHi: `${a} और ${b} का ल.स. (LCM) क्या है?`,
        ...mcq(rng, l, [
          { v: gcd(a, b), m: "HCF_NOT_LCM", r: "This is the HCF." },
          { v: a * b, m: "PRODUCT", r: "The product equals the LCM only when the numbers are co-prime." },
          { v: l * 2, m: "MULTIPLE_NOT_LEAST", r: "A common multiple, but not the least." },
        ]),
        explanation: `HCF(${a}, ${b}) = ${gcd(a, b)}. LCM = ${a} × ${b} / ${gcd(a, b)} = ${l}.`,
        explanationHi: `म.स.(${a}, ${b}) = ${gcd(a, b)}। ल.स. = ${a} × ${b} / ${gcd(a, b)} = ${l}।`,
      };
    },
  },
  {
    id: "hcf-product", subjectId: "mental-ability", topicId: "ma-number-system", subtopicId: "ma-lcm-hcf",
    skillKey: "number.hcf-lcm-product", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 50, isNumerical: true,
    requiredSkill: "HCF × LCM = product of two numbers",
    build(rng) {
      const h = randInt(rng, 2, 12);
      const p = randInt(rng, 2, 7);
      let q = randInt(rng, 3, 11);
      while (gcd(p, q) !== 1 || q === p) q++;
      const a = h * p;
      const b = h * q;
      const l = lcm(a, b);
      return {
        stem: `The HCF of two numbers is ${h} and their LCM is ${l}. If one number is ${a}, what is the other?`,
        stemHi: `दो संख्याओं का म.स. ${h} और ल.स. ${l} है। यदि एक संख्या ${a} है, तो दूसरी संख्या क्या है?`,
        ...mcq(rng, b, [
          { v: l / h, m: "LCM_OVER_HCF", r: "LCM ÷ HCF is not the other number." },
          { v: l - a, m: "SUBTRACTED", r: "Subtraction has no basis here." },
          { v: Math.round(((l * a) / h) * 100) / 100, m: "INVERTED_FORMULA", r: "Rearranged the formula incorrectly." },
        ]),
        explanation: `HCF × LCM = product, so other = ${h} × ${l} / ${a} = ${b}.`,
        explanationHi: `म.स. × ल.स. = गुणनफल, अतः दूसरी संख्या = ${h} × ${l} / ${a} = ${b}।`,
      };
    },
  },
  {
    id: "remainder", subjectId: "mental-ability", topicId: "ma-number-system", subtopicId: "ma-divisibility",
    skillKey: "number.remainder", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 30, isNumerical: true,
    requiredSkill: "Division with remainder",
    build(rng) {
      const d = randInt(rng, 6, 19);
      const q = randInt(rng, 12, 90);
      const r = randInt(rng, 1, d - 1);
      const n = d * q + r;
      return {
        stem: `What is the remainder when ${n} is divided by ${d}?`,
        stemHi: `${n} को ${d} से भाग देने पर शेषफल क्या होगा?`,
        ...mcq(rng, r, [
          { v: q, m: "QUOTIENT_NOT_REMAINDER", r: "This is the quotient." },
          { v: d - r, m: "COMPLEMENT", r: "This is how much is needed to reach the next multiple." },
          { v: (r + 1) % d || d - 1, m: "NEAR_MISS", r: "Off by one." },
        ]),
        explanation: `${n} = ${d} × ${q} + ${r}, so the remainder is ${r}.`,
        explanationHi: `${n} = ${d} × ${q} + ${r}, अतः शेषफल ${r} है।`,
      };
    },
  },
  // ───────────── Simplification ─────────────
  {
    id: "bodmas-basic", subjectId: "mental-ability", topicId: "ma-simplification", subtopicId: "ma-bodmas",
    skillKey: "bodmas.mul-before-add", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 30, isNumerical: true,
    requiredSkill: "Multiply before adding",
    build(rng) {
      const a = randInt(rng, 2, 40);
      const b = randInt(rng, 2, 12);
      const c = randInt(rng, 2, 12);
      const ans = a + b * c;
      return {
        stem: `Simplify: ${a} + ${b} × ${c}`,
        stemHi: `सरल कीजिए: ${a} + ${b} × ${c}`,
        ...mcq(rng, ans, [
          { v: (a + b) * c, m: "LEFT_TO_RIGHT", r: "Added before multiplying; BODMAS requires multiplication first." },
          { v: a + b + c, m: "ADDED_ALL", r: "Treated × as +." },
          { v: a * b + c, m: "WRONG_GROUPING", r: "Grouped the wrong pair." },
        ]),
        explanation: `Multiply first: ${b} × ${c} = ${b * c}. Then ${a} + ${b * c} = ${ans}.`,
        explanationHi: `पहले गुणा: ${b} × ${c} = ${b * c}। फिर ${a} + ${b * c} = ${ans}।`,
      };
    },
  },
  {
    id: "bodmas-mixed", subjectId: "mental-ability", topicId: "ma-simplification", subtopicId: "ma-bodmas",
    skillKey: "bodmas.division-and-brackets", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 50, isNumerical: true,
    requiredSkill: "Brackets, then division, then subtraction",
    build(rng) {
      const e = randInt(rng, 2, 9);
      const q = randInt(rng, 2, 12);
      const d = e * q;
      const b = randInt(rng, 2, 9);
      const c = randInt(rng, 1, 9);
      const a = randInt(rng, 40, 120);
      const ans = a - d / e + b * c;
      const ltr = ((a - d) / e + b) * c;
      return {
        stem: `Simplify: ${a} − ${d} ÷ ${e} + ${b} × ${c}`,
        stemHi: `सरल कीजिए: ${a} − ${d} ÷ ${e} + ${b} × ${c}`,
        ...mcq(rng, ans, [
          { v: Math.round(ltr * 100) / 100, m: "LEFT_TO_RIGHT", r: "Worked strictly left to right, ignoring BODMAS." },
          { v: a - d / e - b * c, m: "SIGN_ERROR", r: "Changed + to −." },
          { v: a - d / (e + b) * c, m: "WRONG_GROUPING", r: "Grouped e + b as if in brackets." },
        ]),
        explanation: `Division: ${d} ÷ ${e} = ${q}. Multiplication: ${b} × ${c} = ${b * c}. Then ${a} − ${q} + ${b * c} = ${ans}.`,
        explanationHi: `भाग: ${d} ÷ ${e} = ${q}। गुणा: ${b} × ${c} = ${b * c}। फिर ${a} − ${q} + ${b * c} = ${ans}।`,
      };
    },
  },
  // ───────────── Ranking ─────────────
  {
    id: "rank-total", subjectId: "mental-ability", topicId: "ma-ranking", subtopicId: "ma-ranking-position",
    skillKey: "ranking.total", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 35, isNumerical: true,
    requiredSkill: "Total = left + right − 1",
    build(rng) {
      const name = pick(rng, [...MALE, ...FEMALE]);
      const l = randInt(rng, 3, 30);
      const r = randInt(rng, 3, 30);
      const total = l + r - 1;
      return {
        stem: `In a row of cadets, ${name} is ${l}th from the left and ${r}th from the right. How many cadets are in the row?`,
        stemHi: `कैडेटों की एक पंक्ति में ${name} बाएँ से ${l}वें और दाएँ से ${r}वें स्थान पर है। पंक्ति में कुल कितने कैडेट हैं?`,
        ...mcq(rng, total, [
          { v: l + r, m: "DOUBLE_COUNT", r: `${name} was counted twice; subtract 1.` },
          { v: l + r + 1, m: "ADDED_ONE", r: "Add the positions and subtract 1, not add 1." },
          { v: Math.abs(l - r), m: "SUBTRACTED", r: "Subtracting positions has no meaning here." },
        ]),
        explanation: `Total = ${l} + ${r} − 1 = ${total} (${name} is counted in both positions).`,
        explanationHi: `कुल = ${l} + ${r} − 1 = ${total} (${name} दोनों गिनतियों में शामिल है)।`,
      };
    },
  },
  {
    id: "rank-other-end", subjectId: "mental-ability", topicId: "ma-ranking", subtopicId: "ma-ranking-position",
    skillKey: "ranking.other-end", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "Position from the other end = total − position + 1",
    build(rng) {
      const n = randInt(rng, 20, 60);
      const p = randInt(rng, 2, n - 2);
      const ans = n - p + 1;
      return {
        stem: `In a class of ${n} trainees, Asha ranks ${p}th from the top. What is her rank from the bottom?`,
        stemHi: `${n} प्रशिक्षुओं की कक्षा में आशा का स्थान ऊपर से ${p}वाँ है। नीचे से उसका स्थान क्या है?`,
        ...mcq(rng, ans, [
          { v: n - p, m: "FORGOT_PLUS_ONE", r: "Forgot to add 1." },
          { v: n - p + 2, m: "NEAR_MISS", r: "Off by one." },
          { v: p, m: "SAME_RANK", r: "Rank from the bottom differs from rank from the top." },
        ]),
        explanation: `Rank from bottom = total − rank from top + 1 = ${n} − ${p} + 1 = ${ans}.`,
        explanationHi: `नीचे से स्थान = कुल − ऊपर से स्थान + 1 = ${n} − ${p} + 1 = ${ans}।`,
      };
    },
  },
  // ───────────── Clock and calendar ─────────────
  {
    id: "clock-angle", subjectId: "mental-ability", topicId: "ma-calendar-clock", subtopicId: "ma-clock-angle",
    skillKey: "clock.angle", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Angle = |30H − 5.5M|",
    build(rng) {
      const h = randInt(rng, 1, 11);
      const m = pick(rng, [0, 10, 20, 30, 40, 50, 15, 45]);
      let ang = Math.abs(30 * h - 5.5 * m);
      if (ang > 180) ang = 360 - ang;
      const naive = Math.abs(30 * h - 6 * m) > 180 ? 360 - Math.abs(30 * h - 6 * m) : Math.abs(30 * h - 6 * m);
      return {
        stem: `What is the angle between the hour hand and the minute hand of a clock at ${h}:${String(m).padStart(2, "0")}?`,
        stemHi: `${h}:${String(m).padStart(2, "0")} बजे घड़ी की घंटे और मिनट की सुई के बीच का कोण कितना है?`,
        ...mcq(rng, ang, [
          { v: naive, m: "IGNORED_HOUR_HAND_MOVEMENT", r: "The hour hand also moves 0.5° per minute." },
          { v: 360 - ang, m: "REFLEX_ANGLE", r: "This is the reflex angle; the smaller angle is asked." },
          { v: ang + 15, m: "NEAR_MISS", r: "Arithmetic slip." },
        ], { unit: "°" }),
        explanation: `Angle = |30 × ${h} − 5.5 × ${m}| = ${Math.abs(30 * h - 5.5 * m)}°${Math.abs(30 * h - 5.5 * m) > 180 ? `, smaller angle = 360 − that = ${ang}°` : ""}.`,
        explanationHi: `कोण = |30 × ${h} − 5.5 × ${m}| = ${ang}°।`,
      };
    },
  },
  {
    id: "calendar-days-later", subjectId: "mental-ability", topicId: "ma-calendar-clock", subtopicId: "ma-calendar-days",
    skillKey: "calendar.odd-days", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 35, isNumerical: false,
    requiredSkill: "Count odd days modulo 7",
    build(rng) {
      const d = randInt(rng, 0, 6);
      const n = randInt(rng, 10, 100);
      const ans = (d + n) % 7;
      return {
        stem: `If today is ${DAYS[d]}, what day of the week will it be after ${n} days?`,
        stemHi: `यदि आज ${DAYS_HI[d]} है, तो ${n} दिन बाद सप्ताह का कौन-सा दिन होगा?`,
        ...mcq(rng, DAYS[ans], [
          { v: DAYS[(ans + 6) % 7], hi: DAYS_HI[(ans + 6) % 7], m: "OFF_BY_ONE", r: "Counted today as day 1." },
          { v: DAYS[(ans + 1) % 7], hi: DAYS_HI[(ans + 1) % 7], m: "OFF_BY_ONE", r: "Counted one day too many." },
          { v: DAYS[(d + 7 - (n % 7)) % 7], hi: DAYS_HI[(d + 7 - (n % 7)) % 7], m: "WRONG_DIRECTION", r: "Counted backwards." },
          { v: DAYS[(ans + 3) % 7], hi: DAYS_HI[(ans + 3) % 7], m: "NEAR_MISS", r: "Remainder computed incorrectly." },
        ], { correctHi: DAYS_HI[ans] }),
        explanation: `${n} ÷ 7 leaves remainder ${n % 7}. ${DAYS[d]} + ${n % 7} days = ${DAYS[ans]}.`,
        explanationHi: `${n} ÷ 7 का शेषफल ${n % 7}। ${DAYS_HI[d]} + ${n % 7} दिन = ${DAYS_HI[ans]}।`,
      };
    },
  },
  {
    id: "calendar-next-year", subjectId: "mental-ability", topicId: "ma-calendar-clock", subtopicId: "ma-calendar-days",
    skillKey: "calendar.year-shift", difficulty: "HARD", difficultyBasis: R3, expectedTimeSec: 60, isNumerical: false,
    requiredSkill: "Ordinary year shifts weekday by 1, leap year by 2",
    build(rng) {
      const year = pick(rng, [2019, 2021, 2022, 2023, 2024, 2025, 2027, 2028]);
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const d = randInt(rng, 0, 6);
      const ans = (d + (leap ? 2 : 1)) % 7;
      return {
        stem: `1 January ${year} was a ${DAYS[d]}. What day of the week was 1 January ${year + 1}? (Assume this weekday for the question.)`,
        stemHi: `मान लीजिए 1 जनवरी ${year} को ${DAYS_HI[d]} था। 1 जनवरी ${year + 1} को कौन-सा दिन होगा?`,
        ...mcq(rng, DAYS[ans], [
          { v: DAYS[(d + (leap ? 1 : 2)) % 7], hi: DAYS_HI[(d + (leap ? 1 : 2)) % 7], m: "LEAP_YEAR_RULE", r: leap ? `${year} is a leap year, so the shift is 2 days.` : `${year} is not a leap year, so the shift is 1 day.` },
          { v: DAYS[d], hi: DAYS_HI[d], m: "NO_SHIFT", r: "A year is not a whole number of weeks." },
          { v: DAYS[(d + 6) % 7], hi: DAYS_HI[(d + 6) % 7], m: "WRONG_DIRECTION", r: "Shifted backwards." },
        ], { correctHi: DAYS_HI[ans] }),
        explanation: `${year} ${leap ? "is a leap year (366 days = 52 weeks + 2 days)" : "has 365 days = 52 weeks + 1 day"}, so the weekday moves forward by ${leap ? 2 : 1}: ${DAYS[ans]}.`,
        explanationHi: `${year} ${leap ? "लीप वर्ष है (2 विषम दिन)" : "साधारण वर्ष है (1 विषम दिन)"}, अतः दिन ${leap ? 2 : 1} आगे बढ़ेगा: ${DAYS_HI[ans]}।`,
      };
    },
  },
  // ───────────── Ages ─────────────
  {
    id: "ages-ratio", subjectId: "mental-ability", topicId: "ma-ages", subtopicId: "ma-ages-linear",
    skillKey: "ages.difference-constant", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Age differences stay constant over time",
    build(rng) {
      const son = randInt(rng, 5, 15);
      const k = randInt(rng, 3, 5);
      const father = son * k;
      const t = randInt(rng, 3, 10);
      const ans = father + t;
      const name = pick(rng, MALE);
      return {
        stem: `${name}'s father is ${k} times as old as ${name}. If ${name} is ${son} years old now, how old will his father be after ${t} years?`,
        stemHi: `${name} के पिता की आयु ${name} की आयु की ${k} गुनी है। यदि ${name} अभी ${son} वर्ष का है, तो ${t} वर्ष बाद उसके पिता की आयु कितनी होगी?`,
        ...mcq(rng, ans, [
          { v: (son + t) * k, m: "MULTIPLIED_FUTURE_AGE", r: "The ratio holds only now; add years to both ages separately." },
          { v: father, m: "FORGOT_TIME", r: "This is the father's present age." },
          { v: father - t, m: "WRONG_DIRECTION", r: "Subtracted the years instead of adding." },
        ], { unit: "years", unitHi: "वर्ष" }),
        explanation: `Father now = ${k} × ${son} = ${father}. After ${t} years = ${father} + ${t} = ${ans} years.`,
        explanationHi: `पिता की वर्तमान आयु = ${k} × ${son} = ${father}। ${t} वर्ष बाद = ${ans} वर्ष।`,
      };
    },
  },
  {
    id: "ages-sum-diff", subjectId: "mental-ability", topicId: "ma-ages", subtopicId: "ma-ages-linear",
    skillKey: "ages.sum-difference", difficulty: "HARD", difficultyBasis: R3, expectedTimeSec: 75, isNumerical: true,
    requiredSkill: "Solve two linear equations in ages",
    build(rng) {
      const a = randInt(rng, 20, 50);
      const b = randInt(rng, 5, a - 5);
      const t = randInt(rng, 2, 8);
      const sumPast = a + b - 2 * t;
      return {
        stem: `The sum of the present ages of a mother and her daughter is ${a + b} years. ${t} years ago the difference of their ages was ${a - b} years. What is the daughter's present age?`,
        stemHi: `एक माँ और उसकी बेटी की वर्तमान आयु का योग ${a + b} वर्ष है। ${t} वर्ष पहले उनकी आयु का अंतर ${a - b} वर्ष था। बेटी की वर्तमान आयु कितनी है?`,
        ...mcq(rng, b, [
          { v: a, m: "WRONG_PERSON", r: "This is the mother's age." },
          { v: b - t, m: "PAST_AGE", r: `This is the daughter's age ${t} years ago.` },
          { v: Math.round((sumPast / 2) * 100) / 100, m: "MIXED_TIME_POINTS", r: "Mixed present and past ages in one equation." },
        ], { unit: "years", unitHi: "वर्ष" }),
        explanation: `The difference of ages never changes, so M − D = ${a - b} and M + D = ${a + b}. Then D = (${a + b} − ${a - b}) / 2 = ${b} years.`,
        explanationHi: `आयु का अंतर नहीं बदलता: M − D = ${a - b}, M + D = ${a + b}। अतः D = (${a + b} − ${a - b}) / 2 = ${b} वर्ष।`,
      };
    },
  },
  // ───────────── Coding-decoding ─────────────
  {
    id: "coding-shift", subjectId: "gk-reasoning", topicId: "rsn-coding", subtopicId: "rsn-coding-letter-shift",
    skillKey: "coding.letter-shift", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 45, isNumerical: false,
    requiredSkill: "Apply a constant letter shift",
    build(rng) {
      const k = pick(rng, [1, 2, 3, -1, -2]);
      const enc = (w: string, s: number) => w.split("").map((c) => String.fromCharCode(((c.charCodeAt(0) - 65 + s + 26) % 26) + 65)).join("");
      const w1 = pick(rng, WORDS);
      let w2 = pick(rng, WORDS);
      if (w2 === w1) w2 = WORDS[(WORDS.indexOf(w1) + 1) % WORDS.length];
      const ans = enc(w2, k);
      return {
        stem: `In a certain code, ${w1} is written as ${enc(w1, k)}. How is ${w2} written in that code?`,
        stemHi: `किसी कूट भाषा में ${w1} को ${enc(w1, k)} लिखा जाता है। उसी कूट में ${w2} को कैसे लिखा जाएगा?`,
        ...mcq(rng, ans, [
          { v: enc(w2, -k), m: "WRONG_DIRECTION", r: "Shifted in the opposite direction." },
          { v: enc(w2, k + (k > 0 ? 1 : -1)), m: "WRONG_SHIFT", r: "Used the wrong shift size." },
          { v: ans.split("").reverse().join(""), m: "REVERSED", r: "Reversed the word; the rule is a shift only." },
        ]),
        explanation: `Each letter of ${w1} is shifted by ${k > 0 ? "+" : ""}${k}. Applying the same shift to ${w2} gives ${ans}.`,
        explanationHi: `${w1} का प्रत्येक अक्षर ${k > 0 ? "+" : ""}${k} खिसकाया गया है। यही नियम ${w2} पर लगाने से ${ans} मिलता है।`,
      };
    },
  },
  {
    id: "coding-sum", subjectId: "gk-reasoning", topicId: "rsn-coding", subtopicId: "rsn-coding-number",
    skillKey: "coding.position-sum", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Sum of alphabet positions",
    build(rng) {
      const val = (w: string) => w.split("").reduce((s, c) => s + c.charCodeAt(0) - 64, 0);
      const short = ["CAT", "DOG", "BAG", "PEN", "SUN", "MAP", "JAM", "LAW", "ARM", "KEY", "GUN", "CAP"];
      const w1 = pick(rng, short);
      let w2 = pick(rng, short);
      if (w2 === w1) w2 = short[(short.indexOf(w1) + 1) % short.length];
      const ans = val(w2);
      return {
        stem: `If ${w1} is coded as ${val(w1)}, then ${w2} is coded as:`,
        stemHi: `यदि ${w1} को ${val(w1)} लिखा जाता है, तो ${w2} को कैसे लिखा जाएगा?`,
        ...mcq(rng, ans, [
          { v: ans + 1, m: "OFF_BY_ONE_POSITION", r: "Used A = 0 or miscounted one position." },
          { v: w2.split("").reduce((s, c) => s + (27 - (c.charCodeAt(0) - 64)), 0), m: "REVERSE_ALPHABET", r: "Used reverse positions (Z = 1)." },
          { v: ans + 3, m: "NEAR_MISS", r: "Addition slip." },
        ]),
        explanation: `The code is the sum of letter positions (A = 1 … Z = 26). ${w2}: ${w2.split("").map((c) => c.charCodeAt(0) - 64).join(" + ")} = ${ans}.`,
        explanationHi: `कूट अक्षरों की स्थिति का योग है (A = 1 … Z = 26)। ${w2}: ${w2.split("").map((c) => c.charCodeAt(0) - 64).join(" + ")} = ${ans}।`,
      };
    },
  },
  // ───────────── Alphabet series ─────────────
  {
    id: "letter-series", subjectId: "gk-reasoning", topicId: "rsn-series", subtopicId: "rsn-series-letter",
    skillKey: "series.letters", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 35, isNumerical: false,
    requiredSkill: "Letter positions with a constant gap",
    build(rng) {
      const gap = randInt(rng, 2, 4);
      const start = randInt(rng, 1, 26 - gap * 5);
      const L = (n: number) => String.fromCharCode(64 + n);
      const terms = Array.from({ length: 4 }, (_, i) => L(start + i * gap));
      const ans = L(start + 4 * gap);
      return {
        stem: `Which letter comes next: ${terms.join(", ")}, ?`,
        stemHi: `अगला अक्षर कौन-सा है: ${terms.join(", ")}, ?`,
        ...mcq(rng, ans, [
          { v: L(start + 4 * gap - 1), m: "OFF_BY_ONE", r: "Counted the gap one short." },
          { v: L(start + 4 * gap + 1), m: "OFF_BY_ONE", r: "Counted the gap one too far." },
          { v: L(start + 3 * gap + 1), m: "GAP_AS_ONE", r: "Used a gap of 1." },
        ]),
        explanation: `Positions go up by ${gap}: ${terms.map((t) => t.charCodeAt(0) - 64).join(", ")}. Next = ${start + 4 * gap} = ${ans}.`,
        explanationHi: `स्थितियाँ ${gap} से बढ़ती हैं। अगला = ${start + 4 * gap} = ${ans}।`,
      };
    },
  },
  // ───────────── Direction sense ─────────────
  {
    id: "direction-distance", subjectId: "gk-reasoning", topicId: "rsn-direction", subtopicId: "rsn-direction-distance",
    skillKey: "direction.net-distance", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 60, isNumerical: true,
    requiredSkill: "Net displacement with Pythagoras",
    build(rng) {
      const triples: Array<[number, number, number]> = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20]];
      const [x, y, h] = pick(rng, triples);
      const name = pick(rng, FEMALE);
      // walk north y+e, east x, south e  => net north y, east x
      const e = randInt(rng, 2, 6);
      return {
        stem: `${name} walks ${y + e} km North, then turns right and walks ${x} km, then turns right again and walks ${e} km. How far is she from the starting point?`,
        stemHi: `${name} ${y + e} किमी उत्तर चलती है, फिर दाएँ मुड़कर ${x} किमी चलती है, फिर दोबारा दाएँ मुड़कर ${e} किमी चलती है। वह प्रारंभिक बिंदु से कितनी दूर है?`,
        ...mcq(rng, h, [
          { v: y + e + x + e, m: "TOTAL_PATH", r: "This is the total distance walked, not the displacement." },
          { v: x + y, m: "ADDED_LEGS", r: "Add the net legs with Pythagoras, not directly." },
          { v: Math.round(Math.sqrt((y + e) ** 2 + x ** 2) * 100) / 100, m: "IGNORED_RETURN_LEG", r: "Ignored the last leg walking back south." },
        ], { unit: "km", unitHi: "किमी" }),
        explanation: `Net North = ${y + e} − ${e} = ${y} km, net East = ${x} km. Distance = √(${y}² + ${x}²) = ${h} km.`,
        explanationHi: `कुल उत्तर = ${y} किमी, पूर्व = ${x} किमी। दूरी = √(${y}² + ${x}²) = ${h} किमी।`,
      };
    },
  },
  {
    id: "direction-facing", subjectId: "gk-reasoning", topicId: "rsn-direction", subtopicId: "rsn-direction-distance",
    skillKey: "direction.turns", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 40, isNumerical: false,
    requiredSkill: "Track facing direction after turns",
    build(rng) {
      const start = randInt(rng, 0, 3);
      const turns = Array.from({ length: randInt(rng, 2, 3) }, () => (rng() < 0.5 ? "right" : "left"));
      let dir = start;
      for (const t of turns) dir = (dir + (t === "right" ? 1 : 3)) % 4;
      const turnsHi = turns.map((t) => (t === "right" ? "दाएँ" : "बाएँ"));
      let mirror = start;
      for (const t of turns) mirror = (mirror + (t === "right" ? 3 : 1)) % 4;
      return {
        stem: `A guard is facing ${DIRS[start]}. He turns ${turns.join(", then ")}. Which direction is he facing now?`,
        stemHi: `एक गार्ड ${DIRS_HI[start]} की ओर मुख किए है। वह क्रमशः ${turnsHi.join(", फिर ")} मुड़ता है। अब उसका मुख किस दिशा में है?`,
        ...mcq(rng, DIRS[dir], [
          { v: DIRS[mirror], hi: DIRS_HI[mirror], m: "LEFT_RIGHT_SWAP", r: "Swapped left and right turns." },
          { v: DIRS[(dir + 2) % 4], hi: DIRS_HI[(dir + 2) % 4], m: "OPPOSITE", r: "Opposite direction." },
          { v: DIRS[(dir + 1) % 4], hi: DIRS_HI[(dir + 1) % 4], m: "MISSED_TURN", r: "Missed one turn." },
          { v: DIRS[(dir + 3) % 4], hi: DIRS_HI[(dir + 3) % 4], m: "MISSED_TURN", r: "Missed one turn." },
        ], { correctHi: DIRS_HI[dir] }),
        explanation: `Start ${DIRS[start]}; a right turn moves clockwise, a left turn anticlockwise. After ${turns.join(", ")}, he faces ${DIRS[dir]}.`,
        explanationHi: `प्रारंभ ${DIRS_HI[start]}; दाएँ मुड़ना दक्षिणावर्त, बाएँ मुड़ना वामावर्त। अंत में मुख ${DIRS_HI[dir]} की ओर।`,
      };
    },
  },
  // ───────────── Analogy & classification ─────────────
  {
    id: "number-analogy", subjectId: "gk-reasoning", topicId: "rsn-analogy", subtopicId: "rsn-analogy-number",
    skillKey: "analogy.number-relation", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 45, isNumerical: true,
    requiredSkill: "Identify and reapply a numeric relation",
    build(rng) {
      const rules: Array<{ f: (n: number) => number; d: string; dHi: string }> = [
        { f: (n) => n * n, d: "square", dHi: "वर्ग" },
        { f: (n) => n * n * n, d: "cube", dHi: "घन" },
        { f: (n) => n * n + 1, d: "square plus 1", dHi: "वर्ग + 1" },
        { f: (n) => n * n - 1, d: "square minus 1", dHi: "वर्ग − 1" },
        { f: (n) => n * (n + 1), d: "n × (n + 1)", dHi: "n × (n + 1)" },
      ];
      const r = pick(rng, rules);
      const a = randInt(rng, 2, 9);
      let b = randInt(rng, 3, 12);
      if (b === a) b++;
      const ans = r.f(b);
      return {
        stem: `${a} : ${r.f(a)} :: ${b} : ?`,
        stemHi: `${a} : ${r.f(a)} :: ${b} : ?`,
        ...mcq(rng, ans, [
          { v: b * b === ans ? b * b + 1 : b * b, m: "WRONG_RULE", r: "Applied a different rule from the first pair." },
          { v: r.f(a) + (b - a), m: "ADDED_DIFFERENCE", r: "Added the difference of the bases; the rule is a function of the number." },
          { v: ans + b, m: "NEAR_MISS", r: "Arithmetic slip." },
        ]),
        explanation: `The rule is ${r.d}: ${a} → ${r.f(a)}. So ${b} → ${ans}.`,
        explanationHi: `नियम ${r.dHi}: ${a} → ${r.f(a)}। अतः ${b} → ${ans}।`,
      };
    },
  },
  {
    id: "odd-one-out", subjectId: "gk-reasoning", topicId: "rsn-analogy", subtopicId: "rsn-classification",
    skillKey: "classification.number-property", difficulty: "EASY", difficultyBasis: R1, expectedTimeSec: 40, isNumerical: true,
    requiredSkill: "Find the number that lacks a shared property",
    build(rng) {
      const kind = pick(rng, ["prime", "square", "multiple7"] as const);
      let group: number[] = [];
      let odd = 0;
      let rule = "";
      let ruleHi = "";
      if (kind === "prime") {
        group = shuffle(rng, [11, 13, 17, 19, 23, 29, 31, 37, 41, 43]).slice(0, 3);
        odd = pick(rng, [21, 27, 33, 39, 49, 51, 57]);
        rule = "prime numbers"; ruleHi = "अभाज्य संख्याएँ";
      } else if (kind === "square") {
        group = shuffle(rng, [16, 25, 36, 49, 64, 81, 100, 121]).slice(0, 3);
        odd = pick(rng, [24, 35, 48, 50, 63, 80]);
        rule = "perfect squares"; ruleHi = "पूर्ण वर्ग";
      } else {
        group = shuffle(rng, [14, 21, 28, 35, 42, 49, 56, 63]).slice(0, 3);
        odd = pick(rng, [22, 34, 45, 52, 61]);
        rule = "multiples of 7"; ruleHi = "7 के गुणज";
      }
      return {
        stem: `Find the odd one out.`,
        stemHi: `विषम संख्या चुनिए।`,
        ...mcq(rng, odd, group.map((g) => ({ v: g, m: "MISSED_PROPERTY", r: `${g} is one of the ${rule}.` }))),
        explanation: `${group.join(", ")} are ${rule}; ${odd} is not.`,
        explanationHi: `${group.join(", ")} ${ruleHi} हैं; ${odd} नहीं है।`,
      };
    },
  },
  // ───────────── Blood relations ─────────────
  {
    id: "blood-relation", subjectId: "gk-reasoning", topicId: "rsn-blood", subtopicId: "rsn-blood-basic",
    skillKey: "blood.chain", difficulty: "MEDIUM", difficultyBasis: R2, expectedTimeSec: 50, isNumerical: false,
    requiredSkill: "Resolve a two-step family relation",
    build(rng) {
      const m1 = pick(rng, MALE);
      const m2 = pick(rng, MALE.filter((x) => x !== m1));
      const f1 = pick(rng, FEMALE);
      const f2 = pick(rng, FEMALE.filter((x) => x !== f1));
      const patterns = [
        { s: `${m1} is the son of ${f1}. ${f1} is the wife of ${m2}. How is ${m2} related to ${m1}?`, sHi: `${m1}, ${f1} का पुत्र है। ${f1}, ${m2} की पत्नी है। ${m2} का ${m1} से क्या संबंध है?`, a: ["Father", "पिता"], d: [["Uncle", "चाचा"], ["Brother", "भाई"], ["Grandfather", "दादा"]], e: `${m1}'s mother is ${f1}, whose husband is ${m2}; so ${m2} is ${m1}'s father.` },
        { s: `${f1} is the mother of ${m1}. ${m1} is the father of ${f2}. How is ${f1} related to ${f2}?`, sHi: `${f1}, ${m1} की माता है। ${m1}, ${f2} का पिता है। ${f1} का ${f2} से क्या संबंध है?`, a: ["Grandmother", "दादी"], d: [["Mother", "माता"], ["Aunt", "बुआ"], ["Sister", "बहन"]], e: `${f1} is the mother of ${f2}'s father, i.e. her paternal grandmother.` },
        { s: `${f1} is the sister of ${m1}. ${m1} is the father of ${m2}. How is ${f1} related to ${m2}?`, sHi: `${f1}, ${m1} की बहन है। ${m1}, ${m2} का पिता है। ${f1} का ${m2} से क्या संबंध है?`, a: ["Aunt (father's sister)", "बुआ"], d: [["Mother", "माता"], ["Sister", "बहन"], ["Grandmother", "दादी"]], e: `${f1} is the sister of ${m2}'s father, so she is his aunt (bua).` },
        { s: `${m1} is the husband of ${f1}. ${f1} is the mother of ${m2}. How is ${m2} related to ${m1}?`, sHi: `${m1}, ${f1} का पति है। ${f1}, ${m2} की माता है। ${m2} का ${m1} से क्या संबंध है?`, a: ["Son", "पुत्र"], d: [["Brother", "भाई"], ["Nephew", "भतीजा"], ["Father", "पिता"]], e: `${m2}'s mother ${f1} is married to ${m1}; ${m2} is a male child, so he is ${m1}'s son.` },
        { s: `${m2} is the brother of ${f1}. ${f1} is the daughter of ${m1}. How is ${m1} related to ${m2}?`, sHi: `${m2}, ${f1} का भाई है। ${f1}, ${m1} की पुत्री है। ${m1} का ${m2} से क्या संबंध है?`, a: ["Father", "पिता"], d: [["Brother", "भाई"], ["Uncle", "चाचा"], ["Son", "पुत्र"]], e: `${m2} and ${f1} are siblings, and ${f1}'s father is ${m1} (a man), so ${m1} is ${m2}'s father too.` },
      ];
      const p = pick(rng, patterns);
      return {
        stem: p.s,
        stemHi: p.sHi,
        ...mcq(rng, p.a[0], p.d.map(([v, hi]) => ({ v, hi, m: "RELATION_CHAIN", r: "Re-trace the chain one link at a time." })), { correctHi: p.a[1] }),
        explanation: p.e,
        explanationHi: `संबंध श्रृंखला को एक-एक कड़ी से हल करें। उत्तर: ${p.a[1]}।`,
      };
    },
  },
];

/** Generate `count` distinct variants of a template deterministically from a base seed. */
export function generateFromTemplate(t: TemplateDef, rngFactory: (seed: number) => Rng, baseSeed: number, count: number) {
  const out: Array<ReturnType<TemplateDef["build"]> & { seed: number }> = [];
  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i * 7919;
    out.push({ ...t.build(rngFactory(seed)), seed });
  }
  return out;
}
