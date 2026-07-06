// test/agentTools.test.js — verifies the tool executor Claude calls into.
// This tests the local logic (what data each tool returns), not the live
// agent loop against the Anthropic API — that requires network access and
// a real ANTHROPIC_API_KEY, so it's a manual end-to-end check (see README).

const assert = require("assert");
const { buildToolDefinitions, executeTool } = require("../src/agentTools");

const fakeIndex = {
  "Agent Orchestration Framework": {
    score: 40,
    risk: "crit",
    jira: { openBlockers: 3, slaBreaches7d: 2, unestimatedStories: 6, avgAgeP1Days: 6.4, topIssues: [{ key: "GENAI-482", priority: "Highest" }] },
    gitlab: { openMRs: 8, avgReviewHours: 27.4, pipelinePassRate: 64.0 },
    build: { buildHealth: 85.0, flakyRatePct: 9.5 },
  },
  "Model Eval & Benchmarking": {
    score: 98,
    risk: "safe",
    jira: { openBlockers: 0, slaBreaches7d: 0, unestimatedStories: 0, avgAgeP1Days: 0.3, topIssues: [] },
    gitlab: { openMRs: 1, avgReviewHours: 4.0, pipelinePassRate: 96.0 },
    build: { buildHealth: 99.0, flakyRatePct: 0.5 },
  },
};

// Tool definitions must be well-formed for the Anthropic API to accept them.
const tools = buildToolDefinitions();
assert.strictEqual(tools.length, 4);
tools.forEach((t) => {
  assert.ok(t.name && t.description && t.input_schema, `tool ${t.name} missing required fields`);
});

// list_workstreams should expose ONLY name/score/risk — never raw detail —
// so the agent is forced to call a detail tool to see specifics.
const list = executeTool("list_workstreams", {}, fakeIndex);
assert.strictEqual(list.length, 2);
assert.deepStrictEqual(Object.keys(list[0]).sort(), ["name", "risk", "score"]);

// get_jira_detail returns the real ticket-level detail for a named workstream.
const jira = executeTool("get_jira_detail", { workstream: "Agent Orchestration Framework" }, fakeIndex);
assert.strictEqual(jira.openBlockers, 3);
assert.strictEqual(jira.topIssues[0].key, "GENAI-482");

// Unknown workstream name returns a clear error, not a crash.
const missing = executeTool("get_jira_detail", { workstream: "Nonexistent" }, fakeIndex);
assert.ok(missing.error);

// get_gitlab_detail / get_build_detail return their respective slices.
assert.strictEqual(executeTool("get_gitlab_detail", { workstream: "Model Eval & Benchmarking" }, fakeIndex).pipelinePassRate, 96.0);
assert.strictEqual(executeTool("get_build_detail", { workstream: "Model Eval & Benchmarking" }, fakeIndex).flakyRatePct, 0.5);

console.log("All agentTools tests passed.");
