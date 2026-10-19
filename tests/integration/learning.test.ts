import { describe, expect, it } from "vitest";
import "./helpers";
import { scenarioHI, scenarioJK } from "@/lib/server/scenarios";

describe("personalisation acceptance scenarios (synthetic learners, simulated clock)", () => {
  it("H and I: different weaknesses lead to different mocks, with varied remediation", async () => {
    for (const r of await scenarioHI()) expect(r.passed, `${r.id}: ${r.evidence.join("\n")}`).toBe(true);
  });
  it("J and K: mastered topics recede but stay in revision, and return when performance drops", async () => {
    for (const r of await scenarioJK()) expect(r.passed, `${r.id}: ${r.evidence.join("\n")}`).toBe(true);
  });
});
