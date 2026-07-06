// src/agentTools.js
//
// Defines the tools Claude can call to investigate program risk, and the
// local executor that actually runs them against our workstream data.
// This is the "agentic" half of the pipeline: Claude decides which of these
// to call, in what order, and how many times — nothing here is a fixed script.

/**
 * Anthropic Messages API tool definitions. Each `input_schema` is a JSON
 * Schema describing the arguments Claude must supply when it calls the tool.
 * Deliberately terse: `list_workstreams` gives Claude only names + risk
 * scores, forcing it to call the detail tools for anything it actually
 * wants to reason about.
 */
function buildToolDefinitions() {
  return [
    {
      name: "list_workstreams",
      description:
        "List all GenAI platform workstreams currently tracked, each with its overall risk score (0-100) and risk classification (safe/warn/crit). Call this first to decide which workstreams need deeper investigation before writing the narrative.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_jira_detail",
      description:
        "Get detailed Jira signal for one workstream: open blockers, SLA breaches in the last 7 days, unestimated stories, average age of P1 issues in days, and the actual top tickets (key, summary, priority, status) driving those numbers.",
      input_schema: {
        type: "object",
        properties: {
          workstream: { type: "string", description: "Exact workstream name as returned by list_workstreams" },
        },
        required: ["workstream"],
      },
    },
    {
      name: "get_gitlab_detail",
      description:
        "Get detailed GitLab delivery signal for one workstream: open merge request count, average review time in hours, and pipeline pass rate percentage.",
      input_schema: {
        type: "object",
        properties: {
          workstream: { type: "string", description: "Exact workstream name as returned by list_workstreams" },
        },
        required: ["workstream"],
      },
    },
    {
      name: "get_build_detail",
      description:
        "Get detailed build/CI signal for one workstream: nightly build health percentage and flaky test rate percentage.",
      input_schema: {
        type: "object",
        properties: {
          workstream: { type: "string", description: "Exact workstream name as returned by list_workstreams" },
        },
        required: ["workstream"],
      },
    },
  ];
}

/**
 * Executes one tool call locally. `workstreamIndex` is a plain object keyed
 * by workstream name (see aiReport.js's buildWorkstreamIndex), so this
 * function never hits Jira/GitLab/build directly — it reads from whatever
 * was already fetched for this request. No new I/O happens here.
 */
function executeTool(toolName, toolInput, workstreamIndex) {
  switch (toolName) {
    case "list_workstreams":
      return Object.entries(workstreamIndex).map(([name, w]) => ({
        name,
        score: w.score,
        risk: w.risk,
      }));

    case "get_jira_detail": {
      const w = workstreamIndex[toolInput.workstream];
      return w ? w.jira : { error: `Unknown workstream: ${toolInput.workstream}` };
    }

    case "get_gitlab_detail": {
      const w = workstreamIndex[toolInput.workstream];
      return w ? w.gitlab : { error: `Unknown workstream: ${toolInput.workstream}` };
    }

    case "get_build_detail": {
      const w = workstreamIndex[toolInput.workstream];
      return w ? w.build : { error: `Unknown workstream: ${toolInput.workstream}` };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

module.exports = { buildToolDefinitions, executeTool };
