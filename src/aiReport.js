// src/aiReport.js
//
// Generates an executive-ready risk narrative from a signal snapshot by
// calling the real Anthropic Messages API directly over fetch — no SDK
// dependency required.
//
// Required env var: ANTHROPIC_API_KEY
//   Get one at https://console.anthropic.com/settings/keys

async function generateExecutiveNarrative(snapshot) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "AI narrative unavailable: set ANTHROPIC_API_KEY in .env to enable executive summary generation.";
  }

  const prompt = `You are an AI assistant embedded in a technical program management dashboard for a sensor platform engineering org (LiDAR, radar, camera, sensor fusion). Given this signal snapshot, write a concise executive risk narrative (4-6 sentences, plain prose, no headers or bullet lists) a TPM would send to leadership. Call out the highest-risk workstream by name, the driving signal, and one recommended action. Be direct and specific, not generic.

Signal snapshot:
${JSON.stringify(snapshot, null, 2)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API request failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return (data.content || []).map((block) => block.text || "").join("\n").trim();
}

module.exports = { generateExecutiveNarrative };
