// src/aiReport.js
//
// A genuinely agentic executive-narrative generator. Unlike a one-shot
// "here's all the data, write a paragraph" call, Claude is given tools to
// investigate Jira/GitLab/build signal per workstream and decides for
// itself which workstreams warrant a closer look and how many tool calls
// to make before it's ready to write the narrative.
//
// Required env var: ANTHROPIC_API_KEY

const { buildToolDefinitions, executeTool } = require("./agentTools");

const MAX_TOOL_ITERATIONS = 6; // hard ceiling so a confused agent can't loop forever / run up cost

/**
 * Builds a lookup keyed by workstream name from the already-scored
 * workstream list (src/riskEngine.js output). This is what the tool
 * executor reads from — no new Jira/GitLab/build calls happen mid-agent-loop.
 */
function buildWorkstreamIndex(scoredWorkstreams) {
  const index = {};
  for (const w of scoredWorkstreams) {
    index[w.name] = {
      score: w.score,
      risk: w.risk,
      jira: w.jiraDetail,
      gitlab: { openMRs: w.openMRs, avgReviewHours: w.avgReviewHours, pipelinePassRate: w.pipelinePassRate },
      build: { buildHealth: w.buildHealth, flakyRatePct: w.flakyRatePct },
    };
  }
  return index;
}

async function callClaude(apiKey, messages, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      tools,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * @param {Array} scoredWorkstreams - output of riskEngine.scoreWorkstreams()
 * @returns {Promise<{narrative: string, toolCalls: Array}>}
 */
async function generateExecutiveNarrative(scoredWorkstreams) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      narrative: "AI narrative unavailable: set ANTHROPIC_API_KEY in .env to enable executive summary generation.",
      toolCalls: [],
    };
  }

  const workstreamIndex = buildWorkstreamIndex(scoredWorkstreams);
  const tools = buildToolDefinitions();
  const toolCallLog = [];

  const messages = [
    {
      role: "user",
      content: `You are an AI assistant embedded in a technical program management dashboard for a GenAI/LLM platform engineering org. You have tools to inspect Jira, GitLab, and build signals per workstream — you are NOT given the full data up front.

Investigate using the tools available: start with list_workstreams, then drill into the detail (Jira/GitLab/build) for whichever workstreams look highest-risk. You don't need to inspect every workstream in full detail — prioritize your investigation the way a TPM would, spending the most attention on the highest-risk items.

Once you have enough information, respond with a final concise executive risk narrative (4-6 sentences, plain prose, no headers or bullet lists) that a TPM would send to leadership. Call out the highest-risk workstream by name, cite a specific ticket if one is driving the risk, and recommend one concrete action.`,
    },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await callClaude(apiKey, messages, tools);

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const textBlocks = response.content.filter((b) => b.type === "text");

    if (toolUseBlocks.length === 0) {
      // No tool calls in this turn — Claude is done investigating and this is the final narrative.
      return {
        narrative: textBlocks.map((b) => b.text).join("\n").trim(),
        toolCalls: toolCallLog,
      };
    }

    // Record Claude's tool-use turn in the conversation, then actually run
    // each requested tool locally and feed the results back as a user turn.
    messages.push({ role: "assistant", content: response.content });

    const toolResults = toolUseBlocks.map((block) => {
      const result = executeTool(block.name, block.input, workstreamIndex);
      toolCallLog.push({ tool: block.name, input: block.input, result });
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      };
    });

    messages.push({ role: "user", content: toolResults });
  }

  return {
    narrative: "Agent exceeded max tool-call iterations without producing a final narrative.",
    toolCalls: toolCallLog,
  };
}

module.exports = { generateExecutiveNarrative };
