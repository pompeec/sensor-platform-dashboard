// test/riskEngine.test.js — minimal assertion test, no framework dependency.
const assert = require("assert");
const { computeProgramHealth, classify, scoreWorkstreams } = require("../src/riskEngine");

// A clean signal set should score high and classify as safe.
const clean = computeProgramHealth({
  jira: { openBlockers: 0, slaBreaches7d: 0, unestimatedStories: 0, avgAgeP1Days: 1 },
  gitlab: { pipelinePassRate: 98, avgReviewHours: 4 },
  build: { nightlyHealthPct: 99, flakyRatePct: 0.5 },
});
assert.ok(clean >= 90, `expected clean signals to score >= 90, got ${clean}`);
assert.strictEqual(classify(clean), "safe");

// A troubled signal set should score low and classify as critical.
const troubled = computeProgramHealth({
  jira: { openBlockers: 5, slaBreaches7d: 3, unestimatedStories: 10, avgAgeP1Days: 9 },
  gitlab: { pipelinePassRate: 55, avgReviewHours: 40 },
  build: { nightlyHealthPct: 70, flakyRatePct: 15 },
});
assert.ok(troubled < 60, `expected troubled signals to score < 60, got ${troubled}`);
assert.strictEqual(classify(troubled), "crit");

// scoreWorkstreams should compute a trend when previousScore is supplied.
const scored = scoreWorkstreams([
  {
    name: "Test Workstream",
    previousScore: 80,
    jira: { openBlockers: 1, slaBreaches7d: 0, unestimatedStories: 2, avgAgeP1Days: 2 },
    gitlab: { pipelinePassRate: 90, avgReviewHours: 10 },
    build: { nightlyHealthPct: 95, flakyRatePct: 2 },
  },
]);
assert.strictEqual(scored.length, 1);
assert.ok(typeof scored[0].trend === "number");

console.log("All riskEngine tests passed.");
console.log(`  clean score:    ${clean}`);
console.log(`  troubled score: ${troubled}`);
console.log(`  workstream:     ${JSON.stringify(scored[0])}`);
